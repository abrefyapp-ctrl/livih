import { useEffect, useRef, useState } from 'react'
import type { Documento, ProdutoLigado } from '../services/documentos'
import { listarProdutos } from '../services/erp'
import { casarFotos, enviarFoto, type LinhaFoto, type Situacao } from '../services/fotosProdutos'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'

const EM_PARALELO = 3
const ENVIAVEL: Situacao[] = ['ok', 'aproximado']

const MOTIVO: Record<Situacao, string> = {
  ok: '',
  aproximado: 'código parecido: confira',
  sem_produto: 'nenhum produto com esse código',
  repetido: 'mais de um produto com esse código',
  ja_existe: 'já cadastrada',
  formato: 'formato não aceito (use JPG, PNG ou WebP)',
}

type Fase = { tipo: 'escolher' } | { tipo: 'conferir' } | { tipo: 'enviando'; feitas: number } | { tipo: 'fim'; enviadas: number; falhas: string[] }

/**
 * Configurações → Documentos → Fotos em massa: sobe as fotos dos produtos de uma vez. O nome do arquivo (ou da pasta)
 * é o código do produto; a tela mostra o que casou antes de enviar.
 */
export function ModalFotosEmMassa({
  aberto,
  orgId,
  existentes,
  aoFechar,
  aoConcluir,
}: {
  aberto: boolean
  orgId: string
  existentes: Documento[]
  aoFechar: () => void
  aoConcluir: () => void
}) {
  const [produtos, setProdutos] = useState<ProdutoLigado[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [linhas, setLinhas] = useState<LinhaFoto[]>([])
  const [ignorados, setIgnorados] = useState(0)
  const [fase, setFase] = useState<Fase>({ tipo: 'escolher' })
  const parar = useRef(false)
  const seletorArquivos = useRef<HTMLInputElement>(null)
  const seletorPasta = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!aberto) return
    let ativo = true
    listarProdutos(orgId)
      .then((l) => ativo && setProdutos(l.map((p) => ({ id: p.id!, nome: p.nome!, codigo: p.codigo }))))
      .catch(() => ativo && setErro('Não foi possível carregar os produtos.'))
    return () => {
      ativo = false
    }
  }, [aberto, orgId])

  // O React não conhece o atributo de escolher pasta: vai direto no elemento.
  useEffect(() => {
    seletorPasta.current?.setAttribute('webkitdirectory', '')
  })

  const enviaveis = linhas.filter((l) => ENVIAVEL.includes(l.situacao))
  const semCodigo = produtos?.filter((p) => !p.codigo?.trim()).length ?? 0

  function escolher(lista: FileList | null) {
    if (!lista?.length || !produtos) return
    const r = casarFotos([...lista], produtos, existentes)
    setLinhas(r.linhas)
    setIgnorados(r.ignorados)
    setFase({ tipo: 'conferir' })
  }

  async function enviar() {
    parar.current = false
    const fila = [...enviaveis]
    const falhas: string[] = []
    let feitas = 0
    let enviadas = 0
    setFase({ tipo: 'enviando', feitas: 0 })
    const trabalhar = async () => {
      for (let l = fila.shift(); l && !parar.current; l = fila.shift()) {
        try {
          await enviarFoto(orgId, l)
          enviadas++
        } catch {
          falhas.push(l.nome)
        }
        feitas++
        setFase({ tipo: 'enviando', feitas })
      }
    }
    await Promise.all(Array.from({ length: EM_PARALELO }, trabalhar))
    setFase({ tipo: 'fim', enviadas, falhas })
    if (enviadas) aoConcluir()
  }

  function fechar() {
    if (fase.tipo === 'enviando') return
    setLinhas([])
    setFase({ tipo: 'escolher' })
    aoFechar()
  }

  const rodape =
    fase.tipo === 'escolher' ? (
      <Botao variante="secundario" onClick={fechar}>
        Cancelar
      </Botao>
    ) : fase.tipo === 'conferir' ? (
      <>
        <Botao variante="secundario" onClick={() => setFase({ tipo: 'escolher' })}>
          Escolher outras
        </Botao>
        <Botao onClick={() => void enviar()} disabled={!enviaveis.length}>
          Enviar {enviaveis.length} {enviaveis.length === 1 ? 'foto' : 'fotos'}
        </Botao>
      </>
    ) : fase.tipo === 'enviando' ? (
      <Botao variante="secundario" onClick={() => (parar.current = true)}>
        Parar
      </Botao>
    ) : (
      <Botao onClick={fechar}>Fechar</Botao>
    )

  return (
    <Modal aberto={aberto} titulo="Fotos dos produtos em massa" aoFechar={fechar} largura="max-w-2xl" rodape={rodape}>
      <div className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        {fase.tipo === 'escolher' && (
          <>
            <p className="text-pequeno">
              Com as fotos dos produtos aqui, o agente reconhece qual é o produto quando o cliente manda uma foto. Cada foto
              é ligada ao produto pelo <strong>código</strong>:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-pequeno">
              <li>
                <strong>Pelo nome do arquivo:</strong> <code>GR-123.jpg</code>. Mais de uma foto do mesmo produto:{' '}
                <code>GR-123 (2).jpg</code> ou <code>GR-123_2.jpg</code>.
              </li>
              <li>
                <strong>Ou por pasta:</strong> uma pasta com o código (<code>GR-123</code>) e as fotos dentro, com qualquer nome.
              </li>
              <li>
                Código com <code>/</code> (que não pode em nome de arquivo): troque por <code>-</code>. <code>80/W-LS</code> vira{' '}
                <code>80-W-LS.jpg</code>.
              </li>
            </ul>
            <p className="text-legenda text-texto-3">
              JPG, PNG ou WebP. As fotos grandes são reduzidas antes de subir. Você confere a lista antes de enviar.
            </p>
            {semCodigo > 0 && (
              <Aviso tom="atencao">
                {semCodigo} {semCodigo === 1 ? 'produto está' : 'produtos estão'} sem código no cadastro e não {semCodigo === 1 ? 'é achado' : 'são achados'}{' '}
                pelo envio em massa. Para esses, cadastre a foto pelo “Novo documento”, ligando o produto.
              </Aviso>
            )}
            <div className="flex flex-wrap gap-2">
              <input ref={seletorArquivos} type="file" multiple accept="image/*,.heic,.heif" className="hidden" onChange={(e) => (escolher(e.target.files), (e.target.value = ''))} />
              <input ref={seletorPasta} type="file" multiple className="hidden" onChange={(e) => (escolher(e.target.files), (e.target.value = ''))} />
              <Botao icone="clipe" onClick={() => seletorArquivos.current?.click()} disabled={!produtos} carregando={!produtos && !erro}>
                Escolher fotos
              </Botao>
              <Botao variante="secundario" icone="arquivo" onClick={() => seletorPasta.current?.click()} disabled={!produtos}>
                Escolher pasta
              </Botao>
            </div>
          </>
        )}

        {fase.tipo === 'conferir' && (
          <>
            <p className="text-pequeno">
              <strong>{enviaveis.length}</strong> de {linhas.length} {linhas.length === 1 ? 'foto pronta' : 'fotos prontas'} para enviar.
              {linhas.length > enviaveis.length && ' As outras ficam de fora; corrija o nome do arquivo e envie de novo depois.'}
              {ignorados > 0 && ` ${ignorados} ${ignorados === 1 ? 'arquivo não é imagem e foi ignorado' : 'arquivos não são imagem e foram ignorados'}.`}
            </p>
            {linhas.some((l) => l.situacao === 'aproximado') && (
              <Aviso tom="atencao">Algumas fotos casaram por um código parecido (sem os traços ou espaços). Confira o produto antes de enviar.</Aviso>
            )}
            <ul className="max-h-[45vh] divide-y divide-borda overflow-y-auto rounded-md border border-borda">
              {linhas.map((l, i) => {
                const vai = ENVIAVEL.includes(l.situacao)
                return (
                  <li key={i} className="flex items-start gap-2 px-3 py-2 text-pequeno">
                    <Icone nome={vai ? 'check' : 'alerta'} className={`mt-0.5 size-4 shrink-0 ${vai ? 'text-primaria' : 'text-texto-3'}`} />
                    <span className="min-w-0 flex-1 truncate" title={l.nome}>
                      {l.nome}
                    </span>
                    <span className={`min-w-0 max-w-[50%] truncate text-right ${vai ? 'text-texto' : 'text-texto-3'}`}>
                      {l.produto && `${l.produto.nome}${l.produto.codigo ? ` · ${l.produto.codigo}` : ''}`}
                      {l.situacao !== 'ok' && (
                        <span className={`block text-legenda ${l.situacao === 'aproximado' ? 'text-atencao' : 'text-texto-3'}`}>{MOTIVO[l.situacao]}</span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {fase.tipo === 'enviando' && (
          <div className="space-y-2" role="status">
            <p className="text-pequeno">
              Enviando {fase.feitas} de {enviaveis.length}… Deixe esta janela aberta até terminar.
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-fundo ring-1 ring-borda">
              <div className="h-full bg-primaria transition-all" style={{ width: `${(fase.feitas / Math.max(1, enviaveis.length)) * 100}%` }} />
            </div>
          </div>
        )}

        {fase.tipo === 'fim' && (
          <div className="space-y-3">
            <Aviso>
              {fase.enviadas} {fase.enviadas === 1 ? 'foto enviada' : 'fotos enviadas'}. A IA prepara as fotos para o reconhecimento nos próximos
              minutos; o andamento aparece embaixo da lista de documentos.
            </Aviso>
            {fase.falhas.length > 0 && (
              <Aviso tom="erro">
                {fase.falhas.length} {fase.falhas.length === 1 ? 'foto não subiu' : 'fotos não subiram'}: {fase.falhas.slice(0, 10).join(', ')}
                {fase.falhas.length > 10 && '…'}. Envie de novo: as que já subiram aparecem como “já cadastrada” e não duplicam.
              </Aviso>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
