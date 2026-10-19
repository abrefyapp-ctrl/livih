import { useEffect, useRef, useState } from 'react'
import {
  ACEITOS,
  buscarImportacao,
  importacoesRecentes,
  iniciarImportacao,
  LIMITE_IMPORTACAO,
  origemDoArquivo,
  type Importacao,
  type ModoPreco,
} from '../services/importacao'
import type { DadosProduto } from '../services/erp'
import { quandoCurto } from '../services/formato'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'

export type Revisao = { linhas: DadosProduto[]; erros: string[]; paginas?: (number | null)[]; ia: true }

const ROTULO_STATUS: Record<Importacao['status'], string> = {
  na_fila: 'Na fila',
  lendo: 'Lendo',
  pronto: 'Pronto para revisar',
  erro: 'Não deu certo',
}

const paraRevisao = (i: Importacao): Revisao => ({
  linhas: i.resultado?.linhas ?? [],
  paginas: i.resultado?.paginas,
  erros: [...(i.resultado?.avisos ?? []), ...(i.resultado?.falhas ?? [])],
  ia: true,
})

/**
 * Produtos → Importar com IA: PDF, Excel, foto ou texto. A leitura roda no servidor (dá para fechar e voltar);
 * no fim, a prévia de importação de sempre (`aoRevisar`).
 */
export function ModalImportarCatalogo({
  orgId,
  textoInicial,
  aoFechar,
  aoRevisar,
}: {
  orgId: string
  textoInicial?: { texto: string; nome: string }
  aoFechar: () => void
  aoRevisar: (r: Revisao) => void
}) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [colar, setColar] = useState(!!textoInicial)
  const [texto, setTexto] = useState(textoInicial?.texto ?? '')
  const [modo, setModo] = useState<ModoPreco | null>(null)
  const [atual, setAtual] = useState<Importacao | null>(null)
  const [recentes, setRecentes] = useState<Importacao[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const seletor = useRef<HTMLInputElement>(null)

  // Retoma a que ficou lendo com a tela fechada.
  useEffect(() => {
    let ativo = true
    importacoesRecentes(orgId)
      .then((l) => {
        if (!ativo) return
        setRecentes(l)
        const lendo = l.find((i) => i.status === 'lendo' || i.status === 'na_fila')
        if (lendo && !textoInicial) setAtual(lendo)
      })
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, textoInicial])

  // Acompanha a importação a cada 3 s até terminar.
  const acompanhando = atual && (atual.status === 'lendo' || atual.status === 'na_fila') ? atual.id : null
  useEffect(() => {
    if (!acompanhando) return
    const t = setInterval(() => {
      buscarImportacao(acompanhando)
        .then((i) => {
          if (!i) return
          setAtual(i)
          if (i.status === 'pronto') aoRevisar(paraRevisao(i))
        })
        .catch(() => undefined)
    }, 3000)
    return () => clearInterval(t)
  }, [acompanhando, aoRevisar])

  function escolher(f: File | undefined) {
    if (!f) return
    if (!origemDoArquivo(f)) return setErro('Use PDF, Excel, CSV ou foto (JPG, PNG, WebP).')
    if (f.size > LIMITE_IMPORTACAO) return setErro('O arquivo passa de 50 MB.')
    setErro(null)
    setArquivo(f)
  }

  async function comecar() {
    if (!modo) return
    setEnviando(true)
    setErro(null)
    try {
      const id = await iniciarImportacao(
        orgId,
        colar ? { texto, nome: textoInicial?.nome ?? 'Texto colado' } : { arquivo: arquivo! },
        modo,
      )
      setAtual(await buscarImportacao(id))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  const lendo = atual && (atual.status === 'lendo' || atual.status === 'na_fila')
  const pronto = !!modo && (colar ? texto.trim().length > 0 : !!arquivo)

  return (
    <Modal
      aberto
      titulo="Importar catálogo com IA"
      largura="max-w-xl"
      aoFechar={aoFechar}
      rodape={
        lendo ? (
          <Botao variante="secundario" onClick={aoFechar}>
            Fechar e continuar depois
          </Botao>
        ) : (
          <>
            <Botao variante="secundario" onClick={aoFechar} disabled={enviando}>
              Cancelar
            </Botao>
            <Botao onClick={() => void comecar()} carregando={enviando} disabled={!pronto}>
              Ler o catálogo
            </Botao>
          </>
        )
      }
    >
      {lendo ? (
        <div className="space-y-3 py-2">
          <p className="font-medium">{atual.nome ?? 'Catálogo'}</p>
          <div className="h-2 overflow-hidden rounded-full bg-fundo">
            <div
              className="h-full bg-primaria transition-all"
              style={{ width: `${atual.total ? Math.max(5, (atual.progresso / atual.total) * 100) : 5}%` }}
            />
          </div>
          <p className="text-pequeno text-texto-2">
            {atual.total > 1 ? `Lendo a parte ${Math.min(atual.progresso + 1, atual.total)} de ${atual.total}…` : 'Lendo…'} Catálogo
            grande leva alguns minutos. Pode fechar: a leitura continua e fica aqui para revisar.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-pequeno text-texto-2">
            A IA lê o catálogo e monta a lista de produtos. Nada entra no cadastro antes de você revisar.
          </p>

          <div className="flex gap-1 rounded-md bg-fundo p-1 text-pequeno">
            {[
              [false, 'Arquivo'],
              [true, 'Colar texto'],
            ].map(([v, r]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setColar(v as boolean)}
                className={`flex-1 rounded-sm px-3 py-1.5 font-medium ${colar === v ? 'bg-superficie shadow-sm' : 'text-texto-2'}`}
              >
                {r as string}
              </button>
            ))}
          </div>

          {colar ? (
            <div className="space-y-1.5">
              <label htmlFor="texto-catalogo" className="block text-pequeno font-medium text-texto-2">
                Texto do catálogo
              </label>
              <textarea
                id="texto-catalogo"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={8}
                placeholder="Cole aqui a tabela de preços, a lista de produtos ou o e-mail do fornecedor"
                className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno placeholder:text-texto-3 focus:border-primaria focus:outline-none"
              />
              <p className="text-legenda text-texto-3">{texto.length.toLocaleString('pt-BR')} caracteres</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-borda px-3 py-4">
              <Icone nome="arquivo" className="size-5 shrink-0 text-texto-3" />
              <p className="min-w-0 flex-1 truncate text-pequeno">
                {arquivo ? <span className="font-medium">{arquivo.name}</span> : <span className="text-texto-3">PDF (até 100 páginas), Excel, CSV ou foto da tabela</span>}
              </p>
              <input
                ref={seletor}
                type="file"
                accept={ACEITOS}
                className="hidden"
                onChange={(e) => {
                  escolher(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <Botao tamanho="sm" variante="secundario" icone="clipe" onClick={() => seletor.current?.click()}>
                {arquivo ? 'Trocar' : 'Escolher arquivo'}
              </Botao>
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-pequeno font-medium text-texto-2">De onde é este catálogo?</legend>
            {(
              [
                ['venda', 'Tabela de preços da minha empresa', 'Os preços entram como preço de venda.'],
                ['sem_preco', 'Catálogo de fornecedor', 'Os produtos entram sem preço (o preço do fornecedor é custo). Os já cadastrados mantêm o preço.'],
              ] as [ModoPreco, string, string][]
            ).map(([v, titulo, ajuda]) => (
              <label
                key={v}
                className={`flex cursor-pointer gap-3 rounded-md border px-3 py-2.5 ${modo === v ? 'border-primaria bg-primaria-suave' : 'border-borda'}`}
              >
                <input type="radio" name="modo-preco" checked={modo === v} onChange={() => setModo(v)} className="mt-1 size-4 accent-primaria" />
                <span>
                  <span className="block text-pequeno font-medium">{titulo}</span>
                  <span className="block text-legenda text-texto-3">{ajuda}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {erro && <Aviso tom="erro">{erro}</Aviso>}
          {atual?.status === 'erro' && <Aviso tom="erro">A leitura não deu certo: {atual.erro}</Aviso>}

          {recentes.some((i) => i.status === 'pronto') && (
            <div className="space-y-1.5 border-t border-borda pt-3">
              <p className="text-legenda font-semibold text-texto-3 uppercase">Lidas nas últimas 24 horas</p>
              <ul className="space-y-1">
                {recentes
                  .filter((i) => i.status === 'pronto')
                  .map((i) => (
                    <li key={i.id} className="flex items-center gap-2 text-pequeno">
                      <span className="min-w-0 flex-1 truncate">
                        {i.nome ?? 'Catálogo'} · {i.resultado?.linhas?.length ?? 0} produtos ·{' '}
                        <span className="text-texto-3">{quandoCurto(i.criado_em).toLowerCase()}</span>
                      </span>
                      <span className="text-legenda text-texto-3">{ROTULO_STATUS[i.status]}</span>
                      <Botao tamanho="sm" variante="secundario" onClick={() => aoRevisar(paraRevisao(i))}>
                        Revisar
                      </Botao>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
