import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  LIMITE_DOCUMENTO,
  salvarDocumento,
  tamanhoLegivel,
  TIPOS_ACEITOS,
  type Documento,
  type ProdutoLigado,
} from '../services/documentos'
import { listarProdutos } from '../services/erp'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Icone } from './Icone'
import { Modal } from './Modal'

type Edicao = {
  titulo: string
  tipo: string
  descricao: string
  palavras: string
  fonte: string
  ativo: boolean
  arquivo: File | null
  produtos: ProdutoLigado[]
}

const deDocumento = (d: Documento): Edicao => ({
  titulo: d.titulo,
  tipo: d.tipo ?? '',
  descricao: d.descricao ?? '',
  palavras: d.palavras_chave ?? '',
  fonte: d.fonte_url ?? '',
  ativo: d.ativo,
  arquivo: null,
  produtos: d.produtos,
})

/**
 * Cadastro e edição de um documento da biblioteca. Usado em Configurações → Documentos e na ficha do produto, que
 * abre já com o produto escolhido (`produtos`). Montado só enquanto aberto: cada abertura começa do zero.
 */
export function ModalDocumento({
  orgId,
  atual,
  produtos = [],
  tipos,
  ligaProdutos,
  aoFechar,
  aoSalvar,
}: {
  orgId: string
  atual: Documento | null
  /** Produtos já escolhidos num documento novo. */
  produtos?: ProdutoLigado[]
  /** Sugestões do campo Tipo. */
  tipos: string[]
  /** Mostra a escolha de produtos (empresa com o módulo de pedidos). */
  ligaProdutos: boolean
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [edicao, setEdicao] = useState<Edicao>(() =>
    atual ? deDocumento(atual) : { titulo: '', tipo: '', descricao: '', palavras: '', fonte: '', ativo: true, arquivo: null, produtos },
  )
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      await salvarDocumento(
        orgId,
        atual,
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
      aoSalvar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo={atual ? 'Editar documento' : 'Novo documento'}
      aoFechar={aoFechar}
      largura="max-w-2xl"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-documento" carregando={salvando} disabled={!edicao.titulo.trim() || (!atual && !edicao.arquivo)}>
            Salvar documento
          </Botao>
        </>
      }
    >
      <form id="form-documento" onSubmit={salvar} className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <SeletorArquivo
          atual={atual}
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
        {ligaProdutos && <ProdutosLigados orgId={orgId} valor={edicao.produtos} aoMudar={(produtos) => setEdicao({ ...edicao, produtos })} />}
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
    </Modal>
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
