import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  importarProdutos,
  lancarEstoque,
  definirSaldos,
  excluirProduto,
  lerNumero,
  listarProdutos,
  movimentosDoProduto,
  mudarAtivoProduto,
  quantidade,
  salvarProduto,
  type Movimento,
  type Produto,
} from '../services/erp'
import { moeda } from '../services/formato'
import { lerNcm, planilhaParaProdutos, type LinhaPlanilha } from '../services/planilhaProdutos'
import { documentosDoProduto, TIPO_FOTO, TIPOS_SUGERIDOS, urlDocumento, type DocumentoRow, type ProdutoLigado } from '../services/documentos'
import { enviarFotoProduto } from '../services/fotosProdutos'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { CampoTexto } from '../components/CampoTexto'
import { EstadoVazio } from '../components/EstadoVazio'
import { Icone } from '../components/Icone'
import { DialogoConfirmacao } from '../components/DialogoConfirmacao'
import { Modal } from '../components/Modal'
import { ModalImportarCatalogo, type Revisao } from '../components/ModalImportarCatalogo'
import { ModalEntradaNota } from '../components/ModalEntradaNota'
import { ModalDocumento } from '../components/ModalDocumento'
import { ultimoCusto } from '../services/notasEntrada'

const CLASSE_CAMPO =
  'block h-10 w-full rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none'

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

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
  const [soSemPreco, setSoSemPreco] = useState(false)
  const [entradaNota, setEntradaNota] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [aberto, setAberto] = useState<Produto | 'novo' | null>(null)
  const [importacao, setImportacao] = useState<Planilha | Revisao | null>(null)
  // Importar com IA; o texto vem do alerta "Parece catálogo" da Saúde do agente (navegação com state).
  const local = useLocation()
  const navegar = useNavigate()
  const textoDaBase = (local.state as { importarTexto?: { texto: string; nome: string } } | null)?.importarTexto
  const [comIA, setComIA] = useState<boolean>(!!textoDaBase)
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
      (p) => (!t || semAcento(`${p.nome} ${p.codigo ?? ''} ${p.categoria ?? ''} ${p.marca ?? ''}`).includes(t)) &&
        (!soAbaixo || abaixo(p)) &&
        (!soSemPreco || !(Number(p.preco) > 0)),
    )
  }, [todos, busca, soAbaixo, soSemPreco])
  const qtdAbaixo = (todos ?? []).filter(abaixo).length
  const qtdSemPreco = (todos ?? []).filter((p) => !(Number(p.preco) > 0)).length
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
              <Botao variante="secundario" icone="nota" onClick={() => setEntradaNota(true)}>
                Entrada por nota
              </Botao>
              <Botao variante="secundario" icone="arquivo" onClick={() => arquivo.current?.click()}>
                Importar planilha
              </Botao>
              <Botao variante="secundario" icone="agente" onClick={() => setComIA(true)}>
                Importar com IA
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
          {qtdSemPreco > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2">
              <input type="checkbox" checked={soSemPreco} onChange={(e) => setSoSemPreco(e.target.checked)} className="size-4 accent-primaria" />
              Só sem preço <span className="rounded-full bg-fundo px-1.5 text-legenda font-semibold text-texto-2">{qtdSemPreco}</span>
            </label>
          )}
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {mensagem && <Aviso tom="info">{mensagem}</Aviso>}
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
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {Number(p.preco) > 0 ? moeda(Number(p.preco), true) : <span className="text-texto-3">sem preço</span>}
                    </td>
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
      {comIA && !importacao && (
        <ModalImportarCatalogo
          orgId={orgId}
          textoInicial={textoDaBase}
          aoFechar={() => {
            setComIA(false)
            if (textoDaBase) navegar('.', { replace: true, state: null })
          }}
          aoRevisar={(r) => {
            setComIA(false)
            if (textoDaBase) navegar('.', { replace: true, state: null })
            setImportacao(r)
          }}
        />
      )}
      {entradaNota && (
        <ModalEntradaNota
          orgId={orgId}
          produtos={todos ?? []}
          aoFechar={() => setEntradaNota(false)}
          aoConcluir={(r) => {
            setEntradaNota(false)
            setMensagem(
              `Nota ${r.numero ?? 's/n'} lançada: ${r.itens} ${r.itens === 1 ? 'item entrou' : 'itens entraram'} no estoque.` +
                (r.criados
                  ? ` ${r.criados} ${r.criados === 1 ? 'produto novo foi cadastrado' : 'produtos novos foram cadastrados'} sem preço de venda: marque "Só sem preço" para preencher.`
                  : ''),
            )
            recarregar()
          }}
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
  const [descricao, setDescricao] = useState(produto?.descricao ?? '')
  const [categoria, setCategoria] = useState(produto?.categoria ?? '')
  const [marca, setMarca] = useState(produto?.marca ?? '')
  const [ncm, setNcm] = useState(produto?.ncm ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  const [comHistorico, setComHistorico] = useState(false)

  async function mudarAtivo(ativo: boolean) {
    if (!produto?.id) return
    setSalvando(true)
    setErro(null)
    try {
      await mudarAtivoProduto(produto.id, ativo)
      aoSalvar()
    } catch (e) {
      setErro((e as Error).message)
      setSalvando(false)
    }
  }

  async function excluir() {
    if (!produto?.id) return
    setSalvando(true)
    setErro(null)
    try {
      if (await excluirProduto(produto.id)) {
        aoSalvar()
        return
      }
      setComHistorico(true)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
      setConfirmarExclusao(false)
    }
  }

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
          {gerencia && produto && (
            <span className="mr-auto flex gap-1">
              <Botao variante="fantasma" tamanho="sm" onClick={() => void mudarAtivo(!produto.ativo)} disabled={salvando}>
                {produto.ativo ? 'Inativar' : 'Reativar'}
              </Botao>
              <Botao variante="fantasma" tamanho="sm" icone="lixeira" onClick={() => setConfirmarExclusao(true)} disabled={salvando}>
                Excluir
              </Botao>
            </span>
          )}
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
        {produto && !produto.ativo && (
          <Aviso tom="atencao">Produto inativo: não aparece nas buscas, nos pedidos novos nem para o agente.</Aviso>
        )}
        {comHistorico && (
          <Aviso
            tom="atencao"
            acao={
              produto?.ativo ? (
                <Botao tamanho="sm" variante="secundario" onClick={() => void mudarAtivo(false)} carregando={salvando}>
                  Inativar
                </Botao>
              ) : undefined
            }
          >
            Este produto já teve movimento de estoque, então não pode ser excluído: o histórico depende dele.{' '}
            {produto?.ativo ? 'Inative-o: ele some das buscas e do agente, e o histórico fica.' : 'Ele já está inativo.'}
          </Aviso>
        )}
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
          </fieldset>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </form>

        {produto?.controla_estoque && <Estoque produto={produto} gerencia={gerencia} aoMudar={aoMudarEstoque} />}
        {produto?.id && (
          <DocumentosDoProduto orgId={orgId} produto={{ id: produto.id, nome: produto.nome ?? '', codigo: produto.codigo }} gerencia={gerencia} />
        )}
        <DialogoConfirmacao
          aberto={confirmarExclusao}
          titulo="Excluir produto?"
          rotuloConfirmar="Excluir"
          perigo
          carregando={salvando}
          aoConfirmar={() => void excluir()}
          aoCancelar={() => setConfirmarExclusao(false)}
        >
          “{produto?.nome}” sai do cadastro de vez. Pedidos antigos continuam com o nome e o preço do item. Se quiser só
          tirar de circulação, use Inativar.
        </DialogoConfirmacao>
      </div>
    </Modal>
  )
}

/**
 * Documentos da biblioteca ligados ao produto (o agente acha pelo nome e código dele). Dono/admin adicionam fotos e
 * documentos daqui já ligados ao produto; as fotos também servem para o agente reconhecer o produto pela foto do
 * cliente (docs/identificar-produto-foto.md).
 */
function DocumentosDoProduto({ orgId, produto, gerencia }: { orgId: string; produto: ProdutoLigado; gerencia: boolean }) {
  const produtoId = produto.id
  const [docs, setDocs] = useState<{ produtoId: string; lista: DocumentoRow[] } | null>(null)
  const [versao, setVersao] = useState(0)
  const [novoDocumento, setNovoDocumento] = useState(false)
  const [enviando, setEnviando] = useState<{ feitas: number; total: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const seletorFotos = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let ativo = true
    documentosDoProduto(produtoId)
      .then((lista) => ativo && setDocs({ produtoId, lista }))
      .catch(() => ativo && setDocs({ produtoId, lista: [] }))
    return () => {
      ativo = false
    }
  }, [produtoId, versao])
  const lista = docs?.produtoId === produtoId ? docs.lista : null
  if (!lista) return null
  const fotos = lista.filter((d) => d.tipo === TIPO_FOTO).length

  async function adicionarFotos(arquivos: File[]) {
    if (!arquivos.length) return
    setErro(null)
    const falhas: string[] = []
    for (let i = 0; i < arquivos.length; i++) {
      setEnviando({ feitas: i, total: arquivos.length })
      try {
        await enviarFotoProduto(orgId, arquivos[i], produto)
      } catch (e) {
        falhas.push((e as Error).message.startsWith('"') ? (e as Error).message : arquivos[i].name)
      }
    }
    setEnviando(null)
    if (falhas.length) setErro(`Não subiram: ${falhas.join('; ')}`)
    setVersao((v) => v + 1)
  }

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-pequeno font-semibold">Documentos e fotos</h3>
        {gerencia && (
          <div className="flex flex-wrap gap-1">
            <input
              ref={seletorFotos}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const arquivos = [...(e.target.files ?? [])]
                e.target.value = ''
                void adicionarFotos(arquivos)
              }}
            />
            <Botao tamanho="sm" variante="secundario" icone="mais" onClick={() => seletorFotos.current?.click()} carregando={!!enviando}>
              Adicionar foto
            </Botao>
            <Botao tamanho="sm" variante="secundario" icone="clipe" onClick={() => setNovoDocumento(true)} disabled={!!enviando}>
              Adicionar documento
            </Botao>
          </div>
        )}
      </div>
      {enviando && (
        <p className="text-legenda text-texto-3" role="status">
          Enviando foto {enviando.feitas + 1} de {enviando.total}…
        </p>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {gerencia && (
        <p className="text-legenda text-texto-3">
          {fotos
            ? `${fotos} ${fotos === 1 ? 'foto' : 'fotos'} deste produto: o agente compara com a foto que o cliente manda para reconhecer o produto.`
            : 'Adicione fotos deste produto (2 ou 3, de ângulos diferentes) para o agente reconhecer quando o cliente mandar uma foto.'}
        </p>
      )}
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
      {novoDocumento && (
        <ModalDocumento
          orgId={orgId}
          atual={null}
          produtos={[produto]}
          tipos={TIPOS_SUGERIDOS}
          ligaProdutos
          aoFechar={() => setNovoDocumento(false)}
          aoSalvar={() => (setNovoDocumento(false), setVersao((v) => v + 1))}
        />
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

  // Último custo da nota de entrada: só dono/admin leem (a RLS devolve vazio para a equipe).
  const [custo, setCusto] = useState<{ custo: number; atualizado_em: string } | null>(null)
  useEffect(() => {
    if (!gerencia) return
    let ativo = true
    ultimoCusto(produto.id!)
      .then((c) => ativo && setCusto(c))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [produto.id, gerencia])

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
      {gerencia && custo && (
        <p className="text-pequeno text-texto-2">
          Último custo de compra: <span className="font-medium tabular-nums">{moeda(custo.custo, true)}</span> por {produto.unidade}{' '}
          <span className="text-texto-3">(nota lançada em {new Date(custo.atualizado_em).toLocaleDateString('pt-BR')})</span>
        </p>
      )}
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

/** Planilha CSV lida: linhas (sem nome = só atualizar) e o estoque de cada uma, na mesma ordem. */
type Planilha = { linhas: LinhaPlanilha[]; erros: string[]; estoques: (number | null)[] }

const semAcentoMin = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Avisos de uma linha contra o cadastro atual (importação com IA). */
function avisosDaLinha(l: LinhaPlanilha, porCodigo: Map<string, Produto>, porNome: Map<string, Produto>): string[] {
  const avisos: string[] = []
  const atual = l.codigo ? porCodigo.get(l.codigo.toLowerCase()) : undefined
  if (l.preco == null && !atual) avisos.push('sem preço')
  if (atual && l.preco != null && Number(atual.preco) > 0) {
    const variacao = Math.abs(l.preco - Number(atual.preco)) / Number(atual.preco)
    if (variacao > 0.5) avisos.push(`preço muda de ${moeda(Number(atual.preco), true)} para ${moeda(l.preco, true)}`)
  }
  if (!atual) {
    const parecido = porNome.get(semAcentoMin(l.nome ?? ''))
    if (parecido && (parecido.codigo ?? '') !== (l.codigo ?? '')) avisos.push(`mesmo nome de ${parecido.codigo ?? 'um produto sem código'}`)
  }
  return avisos
}

function ModalImportacao({
  orgId,
  importacao,
  existentes,
  aoFechar,
  aoConcluir,
}: {
  orgId: string
  importacao: Planilha | Revisao
  existentes: Produto[]
  aoFechar: () => void
  aoConcluir: () => void
}) {
  const ia = 'ia' in importacao
  const paginas = 'paginas' in importacao ? importacao.paginas : undefined
  const estoques = 'estoques' in importacao ? importacao.estoques : undefined
  const temEstoque = !!estoques?.some((e) => e != null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // O cadastro aceita um produto por código: o mesmo código mais de uma vez no arquivo (ex.: ROCAMA 7.005 em dois
  // grampeadores) fica com aviso, e só o primeiro vem marcado.
  const repetidos = useMemo(() => {
    const vistos = new Set<string>()
    const r = new Set<number>()
    importacao.linhas.forEach((l, i) => {
      const c = l.codigo?.toLowerCase()
      if (!c) return
      if (vistos.has(c)) r.add(i)
      vistos.add(c)
    })
    return r
  }, [importacao.linhas])
  const porCodigo = useMemo(() => new Map(existentes.filter((p) => p.codigo).map((p) => [p.codigo!.toLowerCase(), p])), [existentes])
  // Planilha só com código (sem nome) atualiza o que já existe; código que não está no cadastro fica de fora.
  const semCadastro = useMemo(
    () =>
      new Set(
        importacao.linhas.flatMap((l, i) => (!l.nome && !(l.codigo && porCodigo.has(l.codigo.toLowerCase())) ? [i] : [])),
      ),
    [importacao.linhas, porCodigo],
  )
  const [fora, setFora] = useState<Set<number>>(() => new Set(repetidos))
  const porNome = useMemo(() => new Map(existentes.map((p) => [semAcentoMin(p.nome ?? ''), p])), [existentes])
  const avisos = useMemo(
    () =>
      ia
        ? importacao.linhas.map((l, i) => [
            ...(repetidos.has(i) ? ['código repetido no arquivo: confira qual é o certo'] : []),
            ...avisosDaLinha(l, porCodigo, porNome),
          ])
        : [],
    [ia, importacao.linhas, porCodigo, porNome, repetidos],
  )
  const indices = importacao.linhas.flatMap((_, i) => (!fora.has(i) && !semCadastro.has(i) ? [i] : []))
  const escolhidas = indices.map((i) => importacao.linhas[i])
  const comEstoque = estoques ? indices.filter((i) => estoques[i] != null) : []
  const atualiza = escolhidas.filter((l) => l.codigo && porCodigo.has(l.codigo.toLowerCase())).length
  const comAviso = avisos.filter((a) => a.length).length
  const MAX_LINHAS = 1000

  async function importar() {
    setEnviando(true)
    setErro(null)
    try {
      await importarProdutos(orgId, escolhidas, existentes)
      // Depois dos produtos (os novos já existem): o saldo de cada um fica igual ao da planilha.
      if (estoques && comEstoque.length) {
        await definirSaldos(
          orgId,
          comEstoque.map((i) => ({ codigo: importacao.linhas[i].codigo ?? null, nome: importacao.linhas[i].nome ?? null, saldo: estoques[i]! })),
        )
      }
      aoConcluir()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  const alternar = (i: number) =>
    setFora((f) => {
      const n = new Set(f)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })

  return (
    <Modal
      aberto
      titulo={ia ? 'Revisar produtos encontrados' : 'Importar planilha'}
      largura={ia ? 'max-w-2xl' : 'max-w-xl'}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao onClick={() => void importar()} carregando={enviando} disabled={!escolhidas.length}>
            Importar {escolhidas.length} {escolhidas.length === 1 ? 'produto' : 'produtos'}
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {importacao.linhas.length > 0 && (
          <p className="text-pequeno text-texto-2">
            {escolhidas.length - atualiza} novos e {atualiza} já cadastrados (atualizados pelo código: só muda o que veio
            preenchido; coluna ausente ou vazia mantém o que está no cadastro).{' '}
            {temEstoque
              ? `${comEstoque.length} com estoque na planilha: o saldo deles fica igual ao número da planilha (ajuste registrado no histórico de cada produto).`
              : 'O estoque não muda: para atualizar, inclua a coluna Estoque com o saldo de cada produto.'}
            {ia && ' Confira os itens com aviso e desmarque o que estiver errado.'}
          </p>
        )}
        {ia && !importacao.linhas.length && <Aviso tom="atencao">A IA não encontrou produtos neste arquivo.</Aviso>}
        {semCadastro.size > 0 && (
          <Aviso tom="atencao">
            {semCadastro.size} {semCadastro.size === 1 ? 'linha tem' : 'linhas têm'} código que não está no cadastro e não têm nome para
            criar o produto: {semCadastro.size === 1 ? 'ficou' : 'ficaram'} de fora.
          </Aviso>
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
        {ia && comAviso > 0 && (
          <p className="text-legenda text-atencao">
            {comAviso} {comAviso === 1 ? 'item com aviso' : 'itens com aviso'}.
          </p>
        )}
        {importacao.linhas.length > 0 && (
          <div className="max-h-96 overflow-auto rounded-md border border-borda">
            <table className="w-full text-pequeno">
              <thead className="sticky top-0 bg-superficie text-left text-legenda text-texto-3 uppercase">
                <tr>
                  {ia && (
                    <th className="w-8 px-3 py-1.5">
                      <span className="sr-only">Importar</span>
                    </th>
                  )}
                  <th className="px-3 py-1.5 font-medium">Nome</th>
                  <th className="px-3 py-1.5 font-medium">Código</th>
                  <th className="px-3 py-1.5 text-right font-medium">Preço</th>
                  {temEstoque && <th className="px-3 py-1.5 text-right font-medium">Estoque</th>}
                  {paginas && <th className="px-3 py-1.5 text-right font-medium">Pág.</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {importacao.linhas.slice(0, ia ? MAX_LINHAS : 100).map((l, i) => {
                  const existente = l.codigo ? porCodigo.get(l.codigo.toLowerCase()) : undefined
                  return (
                    <tr key={i} className={fora.has(i) || semCadastro.has(i) ? 'opacity-50' : ''}>
                      {ia && (
                        <td className="px-3 py-1.5 align-top">
                          <input
                            type="checkbox"
                            checked={!fora.has(i)}
                            onChange={() => alternar(i)}
                            aria-label={`Importar ${l.nome}`}
                            className="size-4 accent-primaria"
                          />
                        </td>
                      )}
                      <td className="px-3 py-1.5">
                        {l.nome ?? existente?.nome ?? <span className="text-texto-3">(não cadastrado)</span>}
                        {(l.descricao || l.categoria) && (
                          <span className="block text-legenda text-texto-3">{[l.categoria, l.descricao].filter(Boolean).join(' · ')}</span>
                        )}
                        {avisos[i]?.map((a) => (
                          <span key={a} className="mt-0.5 mr-1 inline-block rounded-sm bg-atencao-suave px-1.5 text-legenda text-atencao">
                            {a}
                          </span>
                        ))}
                      </td>
                      <td className="px-3 py-1.5 align-top text-texto-2">{l.codigo ?? '—'}</td>
                      <td className="px-3 py-1.5 text-right align-top whitespace-nowrap tabular-nums">
                        {l.preco != null ? (
                          moeda(l.preco, true)
                        ) : existente ? (
                          <span className="text-texto-3">mantém</span>
                        ) : (
                          <span className="text-texto-3">sem preço</span>
                        )}
                      </td>
                      {temEstoque && (
                        <td className="px-3 py-1.5 text-right align-top whitespace-nowrap tabular-nums">
                          {estoques?.[i] == null ? (
                            <span className="text-texto-3">mantém</span>
                          ) : existente?.controla_estoque && Number(existente.saldo) !== estoques[i] ? (
                            <>
                              <span className="text-texto-3">{quantidade(Number(existente.saldo))} → </span>
                              {quantidade(estoques[i]!)}
                            </>
                          ) : (
                            quantidade(estoques[i]!)
                          )}
                        </td>
                      )}
                      {paginas && <td className="px-3 py-1.5 text-right align-top text-texto-3">{paginas[i] ?? '—'}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {ia && importacao.linhas.length > MAX_LINHAS && (
          <p className="text-legenda text-texto-3">
            Mostrando os primeiros {MAX_LINHAS}; todos os {importacao.linhas.length} serão importados.
          </p>
        )}
        {!ia && (
          <p className="text-legenda text-texto-3">
            No Excel ou Planilhas Google: Arquivo → Salvar como (ou Fazer download) → CSV. Colunas reconhecidas: nome (ou produto),
            código, unidade, preço, estoque (saldo atual), estoque mínimo, categoria (ou família), marca (ou fornecedor), NCM, detalhes e controla estoque
            (sim/não). Planilha com outras colunas, PDF ou foto: use Importar com IA.
          </p>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Modal>
  )
}
