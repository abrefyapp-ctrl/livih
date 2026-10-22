import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSessao } from '../hooks/useSessao'
import {
  filtrarDocumentos,
  LIMITE_DOCUMENTO,
  listarDocumentos,
  removerDocumento,
  salvarDocumento,
  tamanhoLegivel,
  TIPOS_ACEITOS,
  TIPOS_SUGERIDOS,
  urlDocumento,
  type Documento,
  type ProdutoLigado,
} from '../services/documentos'
import { listarProdutos } from '../services/erp'
import { andamentoFotos, type AndamentoFotos } from '../services/fotosProdutos'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { EstadoVazio } from './EstadoVazio'
import { Icone } from './Icone'
import { Modal } from './Modal'
import { ModalFotosEmMassa } from './ModalFotosEmMassa'

type Edicao = {
  atual: Documento | null
  titulo: string
  tipo: string
  descricao: string
  palavras: string
  fonte: string
  ativo: boolean
  arquivo: File | null
  produtos: ProdutoLigado[]
}

const nova = (): Edicao => ({ atual: null, titulo: '', tipo: '', descricao: '', palavras: '', fonte: '', ativo: true, arquivo: null, produtos: [] })
const deDocumento = (d: Documento): Edicao => ({
  atual: d,
  titulo: d.titulo,
  tipo: d.tipo ?? '',
  descricao: d.descricao ?? '',
  palavras: d.palavras_chave ?? '',
  fonte: d.fonte_url ?? '',
  ativo: d.ativo,
  arquivo: null,
  produtos: d.produtos,
})

/** Abre o arquivo numa aba nova com link assinado na hora (a aba abre no clique, senão o navegador bloqueia). */
async function abrir(path: string) {
  const aba = window.open('', '_blank')
  try {
    const url = await urlDocumento(path)
    if (aba) aba.location.href = url
    else window.location.href = url
  } catch {
    aba?.close()
  }
}

/**
 * Configurações → Documentos: os arquivos que o agente e a equipe enviam na conversa (vista explodida, manual,
 * catálogo...). Dono/admin cadastram; a equipe vê.
 */
export function SecaoDocumentos() {
  const { orgAtiva, modulos } = useSessao()
  const orgId = orgAtiva!.id
  const podeEditar = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [docs, setDocs] = useState<{ orgId: string; lista: Documento[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [remover, setRemover] = useState<Documento | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroEdicao, setErroEdicao] = useState<string | null>(null)
  const [emMassa, setEmMassa] = useState(false)
  const [fotos, setFotos] = useState<AndamentoFotos | null>(null)
  const comProdutos = !!modulos?.has('erp')

  useEffect(() => {
    let ativo = true
    listarDocumentos(orgId)
      .then((lista) => ativo && (setDocs({ orgId, lista }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar os documentos.'))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  // Andamento da preparação das fotos para o reconhecimento: atualiza sozinho enquanto há foto na fila.
  useEffect(() => {
    if (!comProdutos) return
    let ativo = true
    let espera: ReturnType<typeof setTimeout> | undefined
    const buscar = () =>
      andamentoFotos(orgId)
        .then((a) => {
          if (!ativo) return
          setFotos(a)
          if (a.naFila) espera = setTimeout(buscar, 20000)
        })
        .catch(() => ativo && setFotos(null))
    void buscar()
    return () => {
      ativo = false
      clearTimeout(espera)
    }
  }, [orgId, versao, comProdutos])

  const lista = docs?.orgId === orgId ? docs.lista : null
  const tipos = useMemo(
    () => [...new Set([...(lista ?? []).map((d) => d.tipo).filter((t): t is string => !!t), ...TIPOS_SUGERIDOS])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [lista],
  )
  const tiposUsados = [...new Set((lista ?? []).map((d) => d.tipo).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const visiveis = lista ? filtrarDocumentos(lista, busca).filter((d) => !tipo || d.tipo === tipo) : []
  const ativos = lista?.filter((d) => d.ativo).length ?? 0

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!edicao) return
    setSalvando(true)
    setErroEdicao(null)
    try {
      await salvarDocumento(
        orgId,
        edicao.atual,
        {
          titulo: edicao.titulo.trim(),
          tipo: edicao.tipo.trim() || null,
          descricao: edicao.descricao.trim() || null,
          palavras_chave: edicao.palavras.trim() || null,
          fonte_url: edicao.fonte.trim() || null,
          ativo: edicao.ativo,
        },
        edicao.arquivo,
        edicao.produtos.map((p) => p.id),
      )
      setEdicao(null)
      setVersao((v) => v + 1)
    } catch (err) {
      setErroEdicao((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarRemocao() {
    if (!remover) return
    setSalvando(true)
    try {
      await removerDocumento(remover)
      setVersao((v) => v + 1)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
      setRemover(null)
    }
  }

  return (
    <section aria-labelledby="titulo-documentos" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-documentos" className="text-h2 font-semibold">
            Documentos
          </h2>
          <p className="max-w-xl text-pequeno text-texto-3">
            Arquivos que o agente e a equipe enviam na conversa: vista explodida, manual, catálogo, ficha técnica. O agente
            só envia o que está aqui e ativo; o resto ele passa para a equipe.
          </p>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            {comProdutos && (
              <Botao variante="secundario" icone="clipe" onClick={() => setEmMassa(true)}>
                Fotos em massa
              </Botao>
            )}
            <Botao icone="mais" onClick={() => setEdicao(nova())}>
              Novo documento
            </Botao>
          </div>
        )}
      </div>

      {!podeEditar && <Aviso>Só dono e admin cadastram documentos. Para enviar um, use o clipe na conversa.</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!lista ? (
        !erro && <p className="text-pequeno text-texto-3">Carregando…</p>
      ) : !lista.length ? (
        <div className="rounded-lg border border-borda bg-superficie">
          <EstadoVazio
            icone="arquivo"
            titulo="Nenhum documento ainda"
            acao={
              podeEditar && (
                <Botao icone="mais" onClick={() => setEdicao(nova())}>
                  Cadastrar o primeiro
                </Botao>
              )
            }
          >
            Comece pelos arquivos que os clientes mais pedem. Um título claro ("Vista explodida — grampeador 80/W-LS") ajuda
            o agente a achar.
          </EstadoVazio>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="busca-documentos" className="sr-only">
              Buscar documento
            </label>
            <input
              id="busca-documentos"
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título, produto ou palavra-chave"
              className="h-10 min-w-0 flex-1 rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
            {tiposUsados.length > 1 && (
              <>
                <label htmlFor="filtro-tipo" className="sr-only">
                  Tipo
                </label>
                <select
                  id="filtro-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="h-10 rounded-md border border-borda bg-superficie px-3 text-pequeno focus:border-primaria focus:outline-none"
                >
                  <option value="">Todos os tipos</option>
                  {tiposUsados.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          {!visiveis.length ? (
            <p className="py-6 text-center text-pequeno text-texto-3">Nenhum documento com esse filtro.</p>
          ) : (
            <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
              {visiveis.map((d) => (
                <li key={d.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
                  <Icone nome="arquivo" className="mt-0.5 size-5 shrink-0 text-texto-3" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {d.titulo}
                      {d.tipo && <span className="rounded-sm bg-fundo px-1.5 py-0.5 text-legenda font-normal text-texto-2 ring-1 ring-borda">{d.tipo}</span>}
                      {!d.ativo && (
                        <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-legenda font-normal text-texto-3">
                          Inativo — o agente não envia
                        </span>
                      )}
                    </p>
                    {d.descricao && <p className="mt-0.5 line-clamp-2 text-pequeno text-texto-3">{d.descricao}</p>}
                    <p className="mt-1 text-legenda text-texto-3">
                      {d.nome_arquivo} · {tamanhoLegivel(d.tamanho)}
                      {d.produtos.length > 0 && ` · ${d.produtos.map((p) => p.nome).join(', ')}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Botao tamanho="sm" variante="fantasma" onClick={() => void abrir(d.path)}>
                      Abrir
                    </Botao>
                    {podeEditar && (
                      <>
                        <Botao tamanho="sm" variante="secundario" onClick={() => setEdicao(deDocumento(d))}>
                          Editar
                        </Botao>
                        <Botao tamanho="sm" variante="fantasma" icone="lixeira" onClick={() => setRemover(d)} aria-label={`Remover ${d.titulo}`} />
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-legenda text-texto-3">
            {ativos} {ativos === 1 ? 'documento ativo' : 'documentos ativos'}. Os documentos não pesam no custo do agente: ele
            só busca quando o cliente pede um arquivo.
          </p>
          {fotos && fotos.prontas + fotos.naFila + fotos.comErro > 0 && (
            <p className="text-legenda text-texto-3">
              Reconhecimento pela foto do cliente: {fotos.prontas} {fotos.prontas === 1 ? 'foto pronta' : 'fotos prontas'}
              {fotos.naFila > 0 && ` · ${fotos.naFila} sendo preparadas pela IA`}
              {fotos.comErro > 0 && (
                <span className="text-erro">
                  {' '}
                  · {fotos.comErro} com erro (foto grande demais ou arquivo ilegível: troque o arquivo no documento)
                </span>
              )}
              .
            </p>
          )}
        </>
      )}

      <Modal
        aberto={!!edicao}
        titulo={edicao?.atual ? 'Editar documento' : 'Novo documento'}
        aoFechar={() => (setEdicao(null), setErroEdicao(null))}
        largura="max-w-2xl"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setEdicao(null)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao
              type="submit"
              form="form-documento"
              carregando={salvando}
              disabled={!edicao?.titulo.trim() || (!edicao.atual && !edicao.arquivo)}
            >
              Salvar documento
            </Botao>
          </>
        }
      >
        {edicao && (
          <form id="form-documento" onSubmit={salvar} className="space-y-4">
            {erroEdicao && <Aviso tom="erro">{erroEdicao}</Aviso>}
            <SeletorArquivo
              atual={edicao.atual}
              arquivo={edicao.arquivo}
              aoEscolher={(arquivo) =>
                setEdicao({ ...edicao, arquivo, titulo: edicao.titulo || arquivo.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') })
              }
            />
            <CampoTexto
              rotulo="Título"
              required
              value={edicao.titulo}
              onChange={(e) => setEdicao({ ...edicao, titulo: e.target.value })}
              placeholder="Ex.: Vista explodida — grampeador 80/W-LS"
              ajuda="É como o cliente pede. O agente envia o título junto com o arquivo."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto
                rotulo="Tipo"
                list="tipos-documento"
                value={edicao.tipo}
                onChange={(e) => setEdicao({ ...edicao, tipo: e.target.value })}
                placeholder="Ex.: Vista explodida"
              />
              <datalist id="tipos-documento">
                {tipos.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <CampoTexto
                rotulo="Palavras-chave"
                value={edicao.palavras}
                onChange={(e) => setEdicao({ ...edicao, palavras: e.target.value })}
                placeholder="Ex.: 80W, 80 W, PACAR 80"
                ajuda="Apelidos e referências que o cliente usa."
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="descricao-documento" className="block text-pequeno font-medium text-texto-2">
                Descrição (opcional)
              </label>
              <textarea
                id="descricao-documento"
                value={edicao.descricao}
                onChange={(e) => setEdicao({ ...edicao, descricao: e.target.value })}
                rows={2}
                placeholder="Ex.: Desenho com as peças numeradas e o código de cada uma, para pedir reposição."
                className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno placeholder:text-texto-3 focus:border-primaria focus:outline-none"
              />
            </div>
            {modulos?.has('erp') && (
              <ProdutosLigados orgId={orgId} valor={edicao.produtos} aoMudar={(produtos) => setEdicao({ ...edicao, produtos })} />
            )}
            <CampoTexto
              rotulo="De onde veio (opcional)"
              value={edicao.fonte}
              onChange={(e) => setEdicao({ ...edicao, fonte: e.target.value })}
              placeholder="Ex.: link no site do fabricante"
              ajuda="Para conferir depois se há versão mais nova."
            />
            <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2">
              <input
                type="checkbox"
                checked={edicao.ativo}
                onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })}
                className="size-4 accent-primaria"
              />
              Ativo (o agente pode enviar)
            </label>
          </form>
        )}
      </Modal>

      {comProdutos && podeEditar && (
        <ModalFotosEmMassa
          aberto={emMassa}
          orgId={orgId}
          existentes={lista ?? []}
          aoFechar={() => setEmMassa(false)}
          aoConcluir={() => setVersao((v) => v + 1)}
        />
      )}

      <DialogoConfirmacao
        aberto={!!remover}
        titulo="Remover documento?"
        rotuloConfirmar="Remover"
        perigo
        carregando={salvando}
        aoConfirmar={() => void confirmarRemocao()}
        aoCancelar={() => setRemover(null)}
      >
        “{remover?.titulo}” sai da biblioteca. As conversas em que ele já foi enviado continuam com o arquivo. Para só pausar,
        edite e desmarque “Ativo”.
      </DialogoConfirmacao>
    </section>
  )
}

function SeletorArquivo({ atual, arquivo, aoEscolher }: { atual: Documento | null; arquivo: File | null; aoEscolher: (f: File) => void }) {
  const seletor = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState<string | null>(null)
  const nome = arquivo?.name ?? atual?.nome_arquivo
  const tamanho = arquivo?.size ?? atual?.tamanho

  function escolher(f: File | undefined) {
    if (!f) return
    if (!TIPOS_ACEITOS.includes(f.type)) return setErro('Use PDF, imagem (JPG, PNG, WebP) ou vídeo MP4.')
    if (f.size > LIMITE_DOCUMENTO) return setErro(`"${f.name}" tem ${tamanhoLegivel(f.size)}. O limite é 50 MB.`)
    setErro(null)
    aoEscolher(f)
  }

  return (
    <div className="space-y-1.5">
      <p className="text-pequeno font-medium text-texto-2">Arquivo</p>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-borda px-3 py-3">
        <Icone nome="arquivo" className="size-5 shrink-0 text-texto-3" />
        <p className="min-w-0 flex-1 truncate text-pequeno">
          {nome ? (
            <>
              <span className="font-medium">{nome}</span>
              {tamanho != null && <span className="text-texto-3"> · {tamanhoLegivel(tamanho)}</span>}
            </>
          ) : (
            <span className="text-texto-3">PDF, imagem ou vídeo MP4, até 50 MB</span>
          )}
        </p>
        <input
          ref={seletor}
          type="file"
          accept={TIPOS_ACEITOS.join(',')}
          className="hidden"
          onChange={(e) => {
            escolher(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <Botao tamanho="sm" variante="secundario" icone="clipe" onClick={() => seletor.current?.click()}>
          {nome ? 'Trocar arquivo' : 'Escolher arquivo'}
        </Botao>
      </div>
      {erro && <p className="text-legenda text-erro">{erro}</p>}
      {atual && arquivo && <p className="text-legenda text-texto-3">O arquivo novo substitui o atual. O que já foi enviado não muda.</p>}
    </div>
  )
}

/** Liga o documento a produtos do cadastro (a busca do agente também acha pelo nome e código deles). */
function ProdutosLigados({ orgId, valor, aoMudar }: { orgId: string; valor: ProdutoLigado[]; aoMudar: (p: ProdutoLigado[]) => void }) {
  const [produtos, setProdutos] = useState<ProdutoLigado[] | null>(null)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    let ativo = true
    listarProdutos(orgId)
      .then((l) => ativo && setProdutos(l.map((p) => ({ id: p.id!, nome: p.nome!, codigo: p.codigo }))))
      .catch(() => ativo && setProdutos([]))
    return () => {
      ativo = false
    }
  }, [orgId])

  const termo = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const opcoes =
    termo && produtos
      ? produtos
          .filter((p) => !valor.some((v) => v.id === p.id))
          .filter((p) => `${p.nome} ${p.codigo ?? ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(termo))
          .slice(0, 6)
      : []

  return (
    <div className="space-y-1.5">
      <label htmlFor="busca-produto-doc" className="block text-pequeno font-medium text-texto-2">
        Produtos (opcional)
      </label>
      {valor.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {valor.map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-sm bg-primaria-suave px-2 py-0.5 text-legenda text-primaria">
              {p.nome}
              <button type="button" onClick={() => aoMudar(valor.filter((v) => v.id !== p.id))} className="rounded-sm hover:text-erro">
                <Icone nome="fechar" className="size-3.5" />
                <span className="sr-only">Tirar {p.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id="busca-produto-doc"
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder={produtos ? 'Buscar produto por nome ou código' : 'Carregando produtos…'}
        disabled={!produtos}
        className="h-10 w-full rounded-md border border-borda bg-superficie px-3 text-pequeno placeholder:text-texto-3 focus:border-primaria focus:outline-none"
      />
      {opcoes.length > 0 && (
        <ul className="divide-y divide-borda rounded-md border border-borda bg-superficie">
          {opcoes.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => (aoMudar([...valor, p]), setBusca(''))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-pequeno hover:bg-fundo"
              >
                <Icone nome="mais" className="size-4 text-texto-3" />
                <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                {p.codigo && <span className="text-legenda text-texto-3">{p.codigo}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-legenda text-texto-3">O agente também acha o documento pelo nome e pelo código dos produtos ligados.</p>
    </div>
  )
}
