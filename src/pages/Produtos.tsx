import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  importarProdutos,
  lancarEstoque,
  lerNumero,
  listarProdutos,
  movimentosDoProduto,
  quantidade,
  salvarProduto,
  type DadosProduto,
  type Movimento,
  type Produto,
} from '../services/erp'
import { moeda } from '../services/formato'
import { documentosDoProduto, urlDocumento, type DocumentoRow } from '../services/documentos'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { CampoTexto } from '../components/CampoTexto'
import { EstadoVazio } from '../components/EstadoVazio'
import { Icone } from '../components/Icone'
import { Modal } from '../components/Modal'

const CLASSE_CAMPO =
  'block h-10 w-full rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none'

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** CSV do Excel brasileiro (separado por ; ou ,), com aspas. */
function lerCsv(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ','
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === sep) {
      linha.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo)
      if (linha.some((x) => x.trim())) linhas.push(linha)
      linha = []
      campo = ''
    } else campo += c
  }
  linha.push(campo)
  if (linha.some((x) => x.trim())) linhas.push(linha)
  return linhas
}

type ColunaPlanilha = 'codigo' | 'nome' | 'unidade' | 'preco' | 'estoque_minimo' | 'categoria' | 'marca' | 'ncm' | 'descricao' | 'controla_estoque'
const COLUNAS: Record<ColunaPlanilha, string[]> = {
  codigo: ['codigo', 'cod', 'sku', 'referencia', 'ref'],
  nome: ['nome', 'produto', 'descricao', 'item'],
  unidade: ['unidade', 'un', 'und', 'medida'],
  preco: ['preco', 'valor', 'preco de venda', 'preco venda'],
  estoque_minimo: ['estoque minimo', 'estoque_minimo', 'minimo'],
  categoria: ['categoria', 'familia', 'grupo', 'linha'],
  marca: ['marca', 'fabricante', 'fornecedor'],
  ncm: ['ncm'],
  // "descricao" já é sinônimo de nome (planilhas antigas); o texto longo vem em "detalhes".
  descricao: ['detalhes', 'especificacoes', 'observacoes'],
  controla_estoque: ['controla estoque', 'controla_estoque', 'estoque controlado'],
}

/** sim/não, s/n, 1/0, x; vazio → null; outra coisa → undefined. */
function lerSimNao(v: string): boolean | null | undefined {
  const t = semAcento(v)
  if (!t) return null
  if (['sim', 's', '1', 'x', 'true'].includes(t)) return true
  if (['nao', 'n', '0', 'false'].includes(t)) return false
  return undefined
}

/** "8467.19.00" → "84671900"; vazio → null; inválido → undefined. */
function lerNcm(v: string): string | null | undefined {
  const d = v.replace(/\D/g, '')
  if (!d) return null
  return d.length === 8 ? d : undefined
}

function planilhaParaProdutos(texto: string): { linhas: DadosProduto[]; erros: string[] } {
  const [cab, ...resto] = lerCsv(texto.replace(/^\uFEFF/, ''))
  const erros: string[] = []
  if (!cab) return { linhas: [], erros: ['A planilha está vazia.'] }
  const idx = Object.fromEntries(
    Object.entries(COLUNAS).map(([campo, nomes]) => [campo, cab.findIndex((h) => nomes.includes(semAcento(h)))]),
  ) as Record<keyof typeof COLUNAS, number>
  if (idx.nome < 0) return { linhas: [], erros: ['Falta a coluna "nome" (ou "produto") no cabeçalho.'] }
  const linhas: DadosProduto[] = []
  resto.forEach((l) => {
    const nome = l[idx.nome]?.trim()
    if (!nome) return
    const preco = idx.preco >= 0 ? lerNumero((l[idx.preco] ?? '').replace(/r\$\s*/i, '')) : 0
    const minimo = idx.estoque_minimo >= 0 ? lerNumero(l[idx.estoque_minimo] ?? '') : null
    const ncm = idx.ncm >= 0 ? lerNcm(l[idx.ncm] ?? '') : null
    const controla = idx.controla_estoque >= 0 ? lerSimNao(l[idx.controla_estoque] ?? '') : null
    if (preco === undefined || minimo === undefined || ncm === undefined || controla === undefined) {
      erros.push(`"${nome}": preço, estoque mínimo, NCM ou "controla estoque" inválido.`)
      return
    }
    linhas.push({
      nome: nome.slice(0, 200),
      codigo: idx.codigo >= 0 ? l[idx.codigo]?.trim() || null : null,
      unidade: (idx.unidade >= 0 ? l[idx.unidade]?.trim() : '') || 'un',
      preco: preco ?? 0,
      estoque_minimo: minimo,
      // Coluna ausente não entra: atualizar por código não apaga o que já estava cadastrado.
      ...(idx.categoria >= 0 && { categoria: l[idx.categoria]?.trim().slice(0, 100) || null }),
      ...(idx.marca >= 0 && { marca: l[idx.marca]?.trim().slice(0, 100) || null }),
      ...(idx.ncm >= 0 && { ncm }),
      ...(idx.descricao >= 0 && { descricao: l[idx.descricao]?.trim().slice(0, 2000) || null }),
      ...(controla !== null && { controla_estoque: controla }),
    })
  })
  return { linhas, erros }
}

export function Produtos() {
  const { orgAtiva, modulos } = useSessao()
  if (modulos && !modulos.has('erp')) {
    return (
      <EstadoVazio icone="caixa" titulo="Pedidos e estoque não está ligado nesta empresa">
        É um pacote adicional. Fale com a equipe da Livih para ativar.
      </EstadoVazio>
    )
  }
  return <ListaProdutos orgId={orgAtiva!.id} gerencia={orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'} />
}

function ListaProdutos({ orgId, gerencia }: { orgId: string; gerencia: boolean }) {
  const [dados, setDados] = useState<{ chave: string; lista: Produto[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [busca, setBusca] = useState('')
  const [inativos, setInativos] = useState(false)
  const [soAbaixo, setSoAbaixo] = useState(false)
  const [aberto, setAberto] = useState<Produto | 'novo' | null>(null)
  const [importacao, setImportacao] = useState<{ linhas: DadosProduto[]; erros: string[] } | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  const chave = `${orgId}|${inativos}|${versao}`
  useEffect(() => {
    let ativo = true
    listarProdutos(orgId, inativos)
      .then((lista) => ativo && setDados({ chave, lista }))
      .catch(() => ativo && setErro('Não foi possível carregar os produtos.'))
    return () => {
      ativo = false
    }
  }, [orgId, inativos, chave])

  const todos = dados?.chave === chave ? dados.lista : null
  const abaixo = (p: Produto) => p.controla_estoque && (Number(p.saldo) < 0 || (p.estoque_minimo != null && Number(p.saldo) < Number(p.estoque_minimo)))
  const lista = useMemo(() => {
    const t = semAcento(busca)
    return (todos ?? []).filter(
      (p) => (!t || semAcento(`${p.nome} ${p.codigo ?? ''} ${p.categoria ?? ''} ${p.marca ?? ''}`).includes(t)) && (!soAbaixo || abaixo(p)),
    )
  }, [todos, busca, soAbaixo])
  const qtdAbaixo = (todos ?? []).filter(abaixo).length
  const recarregar = () => setVersao((v) => v + 1)

  async function lerArquivo(f: File | undefined) {
    if (!f) return
    const texto = await f.text()
    setImportacao(planilhaParaProdutos(texto))
    if (arquivo.current) arquivo.current.value = ''
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pt-6 pb-3 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-semibold">Produtos</h1>
            <p className="text-pequeno text-texto-3">Catálogo e estoque. Confirmar um pedido dá baixa sozinho.</p>
          </div>
          {gerencia && (
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" icone="arquivo" onClick={() => arquivo.current?.click()}>
                Importar planilha
              </Botao>
              <input ref={arquivo} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void lerArquivo(e.target.files?.[0])} />
              <Botao icone="mais" onClick={() => setAberto('novo')}>
                Novo produto
              </Botao>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-64 flex-1 sm:max-w-sm">
            <span className="sr-only">Buscar produtos</span>
            <Icone nome="busca" className="pointer-events-none absolute top-3 left-3 size-4 text-texto-3" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, código, categoria ou marca"
              className="h-10 w-full rounded-md border border-borda bg-superficie pr-3 pl-9 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2">
            <input type="checkbox" checked={soAbaixo} onChange={(e) => setSoAbaixo(e.target.checked)} className="size-4 accent-primaria" />
            Só abaixo do mínimo {qtdAbaixo > 0 && <span className="rounded-full bg-atencao-suave px-1.5 text-legenda font-semibold text-atencao">{qtdAbaixo}</span>}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2">
            <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} className="size-4 accent-primaria" />
            Mostrar inativos
          </label>
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>

      <div className="flex-1 overflow-auto px-4 pb-6 lg:px-8">
        {!todos ? (
          <p className="text-pequeno text-texto-3">Carregando…</p>
        ) : !todos.length ? (
          <div className="rounded-lg border border-borda bg-superficie">
            <EstadoVazio
              icone="caixa"
              titulo="Nenhum produto ainda"
              acao={
                gerencia && (
                  <Botao variante="secundario" icone="arquivo" onClick={() => arquivo.current?.click()}>
                    Importar planilha
                  </Botao>
                )
              }
            >
              Cadastre um a um ou importe uma planilha (CSV) com as colunas nome, código, unidade, preço, estoque mínimo, categoria, marca e NCM.
            </EstadoVazio>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
            <table className="w-full min-w-[640px] text-pequeno">
              <thead className="border-b border-borda text-left text-legenda text-texto-3 uppercase">
                <tr>
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 font-medium">Código</th>
                  <th className="px-4 py-2 text-right font-medium">Preço</th>
                  <th className="px-4 py-2 text-right font-medium">Estoque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {lista.map((p) => (
                  <tr key={p.id} onClick={() => setAberto(p)} className="cursor-pointer hover:bg-fundo">
                    <td className="px-4 py-2.5">
                      <button type="button" className="text-left font-medium hover:text-primaria" onClick={() => setAberto(p)}>
                        {p.nome}
                      </button>
                      {!p.ativo && <span className="ml-2 text-legenda text-texto-3">inativo</span>}
                      {(p.categoria || p.marca) && (
                        <p className="text-legenda text-texto-3">{[p.categoria, p.marca].filter(Boolean).join(' · ')}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-texto-2">{p.codigo ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{moeda(Number(p.preco), true)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${abaixo(p) ? 'font-semibold text-atencao' : ''}`}>
                      {p.controla_estoque ? `${quantidade(Number(p.saldo))} ${p.unidade}` : <span className="text-texto-3">não controla</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!lista.length && <p className="p-4 text-pequeno text-texto-3">Nenhum produto com esse filtro.</p>}
          </div>
        )}
      </div>

      {aberto && (
        <ModalProduto
          orgId={orgId}
          produto={aberto === 'novo' ? null : aberto}
          gerencia={gerencia}
          aoFechar={() => setAberto(null)}
          aoSalvar={() => {
            setAberto(null)
            recarregar()
          }}
          aoMudarEstoque={recarregar}
        />
      )}
      {importacao && (
        <ModalImportacao
          orgId={orgId}
          importacao={importacao}
          existentes={todos ?? []}
          aoFechar={() => setImportacao(null)}
          aoConcluir={() => {
            setImportacao(null)
            recarregar()
          }}
        />
      )}
    </div>
  )
}

function ModalProduto({
  orgId,
  produto,
  gerencia,
  aoFechar,
  aoSalvar,
  aoMudarEstoque,
}: {
  orgId: string
  produto: Produto | null
  gerencia: boolean
  aoFechar: () => void
  aoSalvar: () => void
  aoMudarEstoque: () => void
}) {
  const [nome, setNome] = useState(produto?.nome ?? '')
  const [codigo, setCodigo] = useState(produto?.codigo ?? '')
  const [unidade, setUnidade] = useState(produto?.unidade ?? 'un')
  const [preco, setPreco] = useState(produto ? Number(produto.preco).toFixed(2).replace('.', ',') : '')
  const [minimo, setMinimo] = useState(produto?.estoque_minimo != null ? String(produto.estoque_minimo).replace('.', ',') : '')
  const [controla, setControla] = useState(produto?.controla_estoque ?? true)
  const [ativoProd, setAtivoProd] = useState(produto?.ativo ?? true)
  const [descricao, setDescricao] = useState(produto?.descricao ?? '')
  const [categoria, setCategoria] = useState(produto?.categoria ?? '')
  const [marca, setMarca] = useState(produto?.marca ?? '')
  const [ncm, setNcm] = useState(produto?.ncm ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const precoNum = lerNumero(preco)
  const minimoNum = lerNumero(minimo)
  const ncmNum = lerNcm(ncm)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (precoNum === undefined || (precoNum ?? 0) < 0 || minimoNum === undefined) {
      setErro('Confira o preço e o estoque mínimo.')
      return
    }
    if (ncmNum === undefined) {
      setErro('O NCM tem 8 números (ex.: 8467.19.00).')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      await salvarProduto(orgId, produto?.id ?? null, {
        nome: nome.trim(),
        codigo: codigo.trim() || null,
        unidade: unidade.trim() || 'un',
        preco: precoNum ?? 0,
        estoque_minimo: minimoNum,
        controla_estoque: controla,
        ativo: ativoProd,
        descricao: descricao.trim() || null,
        categoria: categoria.trim() || null,
        marca: marca.trim() || null,
        ncm: ncmNum,
      })
      aoSalvar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo={produto ? produto.nome! : 'Novo produto'}
      largura="max-w-xl"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Fechar
          </Botao>
          {gerencia && (
            <Botao type="submit" form="form-produto" carregando={salvando} disabled={!nome.trim()}>
              Salvar
            </Botao>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <form id="form-produto" onSubmit={salvar} className="space-y-4">
          <fieldset disabled={!gerencia} className="space-y-4">
            <CampoTexto rotulo="Nome" required maxLength={200} value={nome} onChange={(e) => setNome(e.target.value)} />
            <div className="grid gap-4 sm:grid-cols-3">
              <CampoTexto rotulo="Código (opcional)" maxLength={60} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
              <CampoTexto rotulo="Unidade" maxLength={10} value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="un, cx, kg" />
              <CampoTexto rotulo="Preço (R$)" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <CampoTexto rotulo="Categoria (opcional)" maxLength={100} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex.: Grampos" />
              <CampoTexto rotulo="Marca (opcional)" maxLength={100} value={marca} onChange={(e) => setMarca(e.target.value)} />
              <CampoTexto
                rotulo="NCM (opcional)"
                inputMode="numeric"
                value={ncm}
                onChange={(e) => setNcm(e.target.value)}
                placeholder="0000.00.00"
                erro={ncmNum === undefined ? '8 números' : undefined}
                ajuda="Vai ser usado na nota fiscal."
              />
            </div>
            <label className="flex items-center gap-2 text-pequeno text-texto-2">
              <input type="checkbox" checked={controla} onChange={(e) => setControla(e.target.checked)} className="size-4 accent-primaria" />
              Controla estoque (desmarque para serviços)
            </label>
            {controla && (
              <CampoTexto
                rotulo="Estoque mínimo (opcional)"
                inputMode="decimal"
                value={minimo}
                onChange={(e) => setMinimo(e.target.value)}
                ajuda="Abaixo disso o produto aparece em destaque na lista."
                className="sm:max-w-[12rem]"
              />
            )}
            <div className="space-y-1.5">
              <label htmlFor="prod-desc" className="block text-pequeno font-medium text-texto-2">
                Descrição (opcional)
              </label>
              <textarea
                id="prod-desc"
                rows={2}
                maxLength={2000}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none"
              />
            </div>
            {produto && (
              <label className="flex items-center gap-2 text-pequeno text-texto-2">
                <input type="checkbox" checked={ativoProd} onChange={(e) => setAtivoProd(e.target.checked)} className="size-4 accent-primaria" />
                Ativo (inativos não aparecem para montar pedido)
              </label>
            )}
          </fieldset>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </form>

        {produto?.controla_estoque && <Estoque produto={produto} gerencia={gerencia} aoMudar={aoMudarEstoque} />}
        {produto?.id && <DocumentosDoProduto produtoId={produto.id} gerencia={gerencia} />}
      </div>
    </Modal>
  )
}

/** Documentos da biblioteca ligados ao produto (o agente acha pelo nome e código dele). */
function DocumentosDoProduto({ produtoId, gerencia }: { produtoId: string; gerencia: boolean }) {
  const [docs, setDocs] = useState<{ produtoId: string; lista: DocumentoRow[] } | null>(null)
  useEffect(() => {
    let ativo = true
    documentosDoProduto(produtoId)
      .then((lista) => ativo && setDocs({ produtoId, lista }))
      .catch(() => ativo && setDocs({ produtoId, lista: [] }))
    return () => {
      ativo = false
    }
  }, [produtoId])
  const lista = docs?.produtoId === produtoId ? docs.lista : null
  if (!lista) return null

  async function abrir(path: string) {
    const aba = window.open('', '_blank')
    try {
      const url = await urlDocumento(path)
      if (aba) aba.location.href = url
    } catch {
      aba?.close()
    }
  }

  return (
    <div className="space-y-2 border-t border-borda pt-4">
      <h3 className="text-pequeno font-semibold">Documentos</h3>
      {lista.length ? (
        <ul className="divide-y divide-borda rounded-md border border-borda">
          {lista.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-pequeno">
              <Icone nome="arquivo" className="size-4 shrink-0 text-texto-3" />
              <span className="min-w-0 flex-1 truncate">
                {d.titulo}
                {!d.ativo && <span className="text-texto-3"> · inativo</span>}
              </span>
              <Botao tamanho="sm" variante="fantasma" onClick={() => void abrir(d.path)}>
                Abrir
              </Botao>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-legenda text-texto-3">Nenhum documento ligado a este produto.</p>
      )}
      {gerencia && (
        <Link to="/configuracoes/documentos" className="text-legenda font-medium text-primaria underline">
          Gerenciar documentos
        </Link>
      )}
    </div>
  )
}

const ROTULO_MOV: Record<string, string> = { entrada: 'Entrada', ajuste: 'Ajuste', pedido: 'Pedido', estorno: 'Devolução' }

function Estoque({ produto, gerencia, aoMudar }: { produto: Produto; gerencia: boolean; aoMudar: () => void }) {
  const [movs, setMovs] = useState<{ versao: number; lista: Movimento[] } | null>(null)
  const [versao, setVersao] = useState(0)
  const [tipo, setTipo] = useState<'entrada' | 'ajuste'>('entrada')
  const [qtd, setQtd] = useState('')
  const [motivo, setMotivo] = useState('')
  const [lancando, setLancando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    movimentosDoProduto(produto.id!)
      .then((lista) => ativo && setMovs({ versao, lista }))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [produto.id, versao])

  const lista = movs?.versao === versao ? movs.lista : null
  const saldo = lista ? lista.reduce((s, m) => s + Number(m.quantidade), 0) : Number(produto.saldo)

  async function lancar(e: FormEvent) {
    e.preventDefault()
    const n = lerNumero(qtd)
    if (!n) {
      setErro('Informe a quantidade.')
      return
    }
    setLancando(true)
    setErro(null)
    try {
      await lancarEstoque(produto.id!, n, tipo, motivo)
      setQtd('')
      setMotivo('')
      setVersao((v) => v + 1)
      aoMudar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setLancando(false)
    }
  }

  return (
    <section aria-labelledby="titulo-estoque" className="space-y-3 border-t border-borda pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="titulo-estoque" className="font-semibold">
          Estoque
        </h3>
        <p className={`text-h2 font-semibold tabular-nums ${saldo < 0 ? 'text-erro' : ''}`}>
          {quantidade(saldo)} <span className="text-pequeno font-normal text-texto-3">{produto.unidade}</span>
        </p>
      </div>
      {saldo < 0 && <Aviso tom="atencao">Saldo negativo: saiu mais do que entrou. Lance a entrada ou um ajuste com a contagem real.</Aviso>}

      {gerencia && (
        <form onSubmit={lancar} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <label htmlFor="mov-tipo" className="block text-pequeno font-medium text-texto-2">
              Lançar
            </label>
            <select id="mov-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as 'entrada' | 'ajuste')} className={`${CLASSE_CAMPO} w-36`}>
              <option value="entrada">Entrada</option>
              <option value="ajuste">Ajuste (+ ou −)</option>
            </select>
          </div>
          <CampoTexto rotulo="Quantidade" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} className="w-28" placeholder={tipo === 'ajuste' ? '-2' : '10'} />
          <CampoTexto
            rotulo={tipo === 'ajuste' ? 'Motivo' : 'Observação (opcional)'}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={300}
            className="min-w-40 flex-1"
            placeholder={tipo === 'ajuste' ? 'Ex.: contagem do estoque' : 'Ex.: nota 123 do fornecedor'}
          />
          <Botao type="submit" variante="secundario" carregando={lancando}>
            Lançar
          </Botao>
        </form>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {lista && lista.length > 0 && (
        <ul className="max-h-56 divide-y divide-borda overflow-y-auto rounded-md border border-borda text-pequeno">
          {lista.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2">
              <span className={`w-16 shrink-0 text-right font-semibold tabular-nums ${Number(m.quantidade) < 0 ? 'text-erro' : 'text-primaria'}`}>
                {Number(m.quantidade) > 0 ? '+' : ''}
                {quantidade(Number(m.quantidade))}
              </span>
              <span className="min-w-0 flex-1 truncate text-texto-2">
                {ROTULO_MOV[m.tipo] ?? m.tipo}
                {m.pedido && ` · pedido #${m.pedido.numero}`}
                {m.motivo && ` · ${m.motivo}`}
              </span>
              <span className="shrink-0 text-legenda text-texto-3">
                {new Date(m.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ModalImportacao({
  orgId,
  importacao,
  existentes,
  aoFechar,
  aoConcluir,
}: {
  orgId: string
  importacao: { linhas: DadosProduto[]; erros: string[] }
  existentes: Produto[]
  aoFechar: () => void
  aoConcluir: () => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const codigos = new Set(existentes.filter((p) => p.codigo).map((p) => p.codigo!.toLowerCase()))
  const atualiza = importacao.linhas.filter((l) => l.codigo && codigos.has(l.codigo.toLowerCase())).length

  async function importar() {
    setEnviando(true)
    setErro(null)
    try {
      await importarProdutos(orgId, importacao.linhas, existentes)
      aoConcluir()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo="Importar planilha"
      largura="max-w-xl"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao onClick={() => void importar()} carregando={enviando} disabled={!importacao.linhas.length}>
            Importar {importacao.linhas.length} {importacao.linhas.length === 1 ? 'produto' : 'produtos'}
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {importacao.linhas.length > 0 && (
          <p className="text-pequeno text-texto-2">
            {importacao.linhas.length - atualiza} novos e {atualiza} já cadastrados (atualizados pelo código). O estoque não muda: lance a
            contagem inicial em cada produto, como entrada.
          </p>
        )}
        {importacao.erros.length > 0 && (
          <Aviso tom="atencao">
            {importacao.erros.slice(0, 5).map((e) => (
              <span key={e} className="block">
                {e}
              </span>
            ))}
            {importacao.erros.length > 5 && <span className="block">E mais {importacao.erros.length - 5}.</span>}
          </Aviso>
        )}
        {importacao.linhas.length > 0 && (
          <div className="max-h-64 overflow-auto rounded-md border border-borda">
            <table className="w-full text-pequeno">
              <thead className="sticky top-0 bg-superficie text-left text-legenda text-texto-3 uppercase">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Nome</th>
                  <th className="px-3 py-1.5 font-medium">Código</th>
                  <th className="px-3 py-1.5 text-right font-medium">Preço</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {importacao.linhas.slice(0, 100).map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5">{l.nome}</td>
                    <td className="px-3 py-1.5 text-texto-2">{l.codigo ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{moeda(l.preco ?? 0, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-legenda text-texto-3">
          No Excel ou Planilhas Google: Arquivo → Salvar como (ou Fazer download) → CSV. Colunas reconhecidas: nome (ou produto), código,
          unidade, preço, estoque mínimo, categoria (ou família), marca (ou fornecedor), NCM, detalhes e controla estoque (sim/não).
        </p>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Modal>
  )
}
