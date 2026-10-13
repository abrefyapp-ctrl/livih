import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { criarPedido, listarPedidos, type Pedido, type StatusPedido } from '../services/erp'
import { listarContatos, type ContatoLista } from '../services/crm'
import { moeda, nomeDoContato, quandoCurto } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { EstadoVazio } from '../components/EstadoVazio'
import { EtiquetaPedido } from '../components/EtiquetaPedido'
import { Icone } from '../components/Icone'
import { Modal } from '../components/Modal'

type Filtro = 'abertos' | StatusPedido | 'todos'
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: 'abertos', rotulo: 'Em andamento' },
  { id: 'rascunho', rotulo: 'Rascunhos' },
  { id: 'entregue', rotulo: 'Entregues' },
  { id: 'cancelado', rotulo: 'Cancelados' },
  { id: 'todos', rotulo: 'Todos' },
]

export function Pedidos() {
  const { orgAtiva, modulos } = useSessao()
  if (modulos && !modulos.has('erp')) {
    return (
      <EstadoVazio icone="pedido" titulo="Pedidos e estoque não está ligado nesta empresa">
        É um pacote adicional. Fale com a equipe da Livih para ativar.
      </EstadoVazio>
    )
  }
  return <ListaPedidos orgId={orgAtiva!.id} />
}

function ListaPedidos({ orgId }: { orgId: string }) {
  const navegar = useNavigate()
  const [filtro, setFiltro] = useState<Filtro>('abertos')
  const [dados, setDados] = useState<{ chave: string; lista: Pedido[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)

  const chave = `${orgId}|${filtro}`
  useEffect(() => {
    let ativo = true
    listarPedidos(orgId, filtro)
      .then((lista) => ativo && setDados({ chave, lista }))
      .catch(() => ativo && setErro('Não foi possível carregar os pedidos.'))
    return () => {
      ativo = false
    }
  }, [orgId, filtro, chave])

  const todos = dados?.chave === chave ? dados.lista : null
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase().replace(/^#/, '')
    if (!t) return todos ?? []
    return (todos ?? []).filter((p) => String(p.numero) === t || nomeDoContato(p.contato).toLowerCase().includes(t))
  }, [todos, busca])

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pt-6 pb-3 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-semibold">Pedidos</h1>
            <p className="text-pequeno text-texto-3">Do rascunho à entrega. Confirmar dá baixa no estoque; cancelar devolve.</p>
          </div>
          <Botao icone="mais" onClick={() => setNovo(true)}>
            Novo pedido
          </Botao>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Situação" className="flex gap-1 overflow-x-auto rounded-md bg-slate-100 p-1 text-pequeno">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filtro === f.id}
                onClick={() => setFiltro(f.id)}
                className={`shrink-0 rounded px-3 py-1.5 font-medium ${filtro === f.id ? 'bg-superficie text-texto shadow-sm' : 'text-texto-2'}`}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
          <label className="relative min-w-56 flex-1 sm:max-w-xs">
            <span className="sr-only">Buscar pedidos</span>
            <Icone nome="busca" className="pointer-events-none absolute top-3 left-3 size-4 text-texto-3" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Cliente ou número"
              className="h-10 w-full rounded-md border border-borda bg-superficie pr-3 pl-9 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
          </label>
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>

      <div className="flex-1 overflow-auto px-4 pb-6 lg:px-8">
        {!todos ? (
          <p className="text-pequeno text-texto-3">Carregando…</p>
        ) : !lista.length ? (
          <div className="rounded-lg border border-borda bg-superficie">
            <EstadoVazio icone="pedido" titulo={busca ? 'Nenhum pedido encontrado' : 'Nenhum pedido aqui'}>
              {filtro === 'abertos' && !busca ? 'Crie o primeiro pedido pelo botão Novo pedido.' : null}
            </EstadoVazio>
          </div>
        ) : (
          <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
            {lista.map((p) => (
              <li key={p.id}>
                <Link to={`/pedidos/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-fundo">
                  <span className="w-14 font-semibold tabular-nums">#{p.numero}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.contato ? nomeDoContato(p.contato) : 'Sem cliente'}</span>
                  <EtiquetaPedido status={p.status} />
                  <span className="w-28 text-right font-medium tabular-nums">{moeda(Number(p.total))}</span>
                  <span className="w-16 text-right text-legenda text-texto-3">{quandoCurto(p.criado_em)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {novo && (
        <ModalNovoPedido
          orgId={orgId}
          aoFechar={() => setNovo(false)}
          aoCriar={(id) => navegar(`/pedidos/${id}`)}
        />
      )}
    </div>
  )
}

/** Escolhe o cliente (ou nenhum) e cria o rascunho; os itens entram na tela do pedido. */
export function ModalNovoPedido({
  orgId,
  contatoFixo,
  aoFechar,
  aoCriar,
}: {
  orgId: string
  contatoFixo?: { id: string; nome: string }
  aoFechar: () => void
  aoCriar: (id: string) => void
}) {
  const [contatos, setContatos] = useState<ContatoLista[]>([])
  const [busca, setBusca] = useState('')
  const [contatoId, setContatoId] = useState(contatoFixo?.id ?? '')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (contatoFixo) return
    let ativo = true
    listarContatos(orgId, '')
      .then((l) => ativo && setContatos(l))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, contatoFixo])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const l = t ? contatos.filter((c) => `${nomeDoContato(c)} ${c.empresa ?? ''} ${c.telefone ?? ''}`.toLowerCase().includes(t)) : contatos
    return l.slice(0, 50)
  }, [busca, contatos])

  async function criar() {
    setCriando(true)
    setErro(null)
    try {
      aoCriar(await criarPedido(orgId, contatoId || null))
    } catch (e) {
      setErro((e as Error).message)
      setCriando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo="Novo pedido"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={criando}>
            Cancelar
          </Botao>
          <Botao onClick={() => void criar()} carregando={criando}>
            Criar e adicionar itens
          </Botao>
        </>
      }
    >
      <div className="space-y-3">
        {contatoFixo ? (
          <p className="text-pequeno">
            Cliente: <strong>{contatoFixo.nome}</strong>
          </p>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="pedido-busca-cliente" className="block text-pequeno font-medium text-texto-2">
              Cliente
            </label>
            <input
              id="pedido-busca-cliente"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, empresa ou telefone"
              className="block h-10 w-full rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
            <select
              aria-label="Escolha o cliente"
              size={6}
              value={contatoId}
              onChange={(e) => setContatoId(e.target.value)}
              className="block w-full rounded-md border border-borda bg-superficie p-1 text-pequeno focus:border-primaria focus:outline-none"
            >
              <option value="" className="rounded px-2 py-1 text-texto-3">
                Sem cliente (venda de balcão)
              </option>
              {filtrados.map((c) => (
                <option key={c.id} value={c.id} className="rounded px-2 py-1">
                  {nomeDoContato(c)}
                  {c.empresa ? ` · ${c.empresa}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Modal>
  )
}
