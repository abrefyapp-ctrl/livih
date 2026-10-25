import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  apagarCliente,
  atividadeDosContatos,
  buscarCliente,
  contatosDoCliente,
  enderecoEmLinha,
  formatarDocumento,
  ligarContato,
  pedidosDoCliente,
  procurarContatos,
  type Cliente,
  type ContatoDoCliente,
  type ConversaDoCliente,
  type NegocioDoCliente,
  type PedidoDoCliente,
} from '../services/clientes'
import type { StatusPedido } from '../services/erp'
import { formatarTelefone, moeda, nomeDoContato, quandoCurto } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { Avatar } from '../components/Avatar'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { DialogoConfirmacao } from '../components/DialogoConfirmacao'
import { EstadoVazio } from '../components/EstadoVazio'
import { EtiquetaEstado } from '../components/EtiquetaEstado'
import { EtiquetaEtapa } from '../components/EtiquetaEtapa'
import { EtiquetaPedido } from '../components/EtiquetaPedido'
import { Icone, type NomeIcone } from '../components/Icone'
import { Modal } from '../components/Modal'
import { ModalCliente } from '../components/ModalCliente'
import { ModalContato } from '../components/ModalContato'

function Bloco({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-borda bg-superficie">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
        <h2 className="font-semibold">{titulo}</h2>
        {acao}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Dado({ icone, children }: { icone: NomeIcone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-pequeno text-texto-2">
      <Icone nome={icone} className="size-4 text-texto-3" />
      {children}
    </span>
  )
}

type Dados = {
  id: string
  cliente: Cliente | null
  contatos: ContatoDoCliente[]
  pedidos: PedidoDoCliente[]
  negocios: NegocioDoCliente[]
  conversas: ConversaDoCliente[]
}

/** Perfil do cliente: cadastro, contatos ligados, pedidos e o que a pessoa vê dos contatos (negócios, conversas). */
export function ClientePerfil() {
  const { id } = useParams()
  const { orgAtiva, sessao, equipe, modulos } = useSessao()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const comPedidos = !!modulos?.has('erp')
  const navegar = useNavigate()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [editando, setEditando] = useState(false)
  const [ligando, setLigando] = useState(false)
  const [novoContato, setNovoContato] = useState(false)
  const [soltar, setSoltar] = useState<ContatoDoCliente | null>(null)
  const [remover, setRemover] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let ativo = true
    Promise.all([buscarCliente(id), contatosDoCliente(id), comPedidos ? pedidosDoCliente(id) : Promise.resolve([])])
      .then(async ([cliente, contatos, pedidos]) => {
        const atividade = await atividadeDosContatos(contatos.map((c) => c.id))
        if (!ativo) return
        setDados({ id, cliente, contatos, pedidos, ...atividade })
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar o cliente.'))
    return () => {
      ativo = false
    }
  }, [id, comPedidos, versao])

  const atual = dados?.id === id ? dados : null
  const recarregar = () => setVersao((v) => v + 1)

  async function confirmarSoltar() {
    if (!soltar) return
    setSalvando(true)
    try {
      await ligarContato(soltar.id, null)
      recarregar()
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setSalvando(false)
      setSoltar(null)
    }
  }

  async function confirmarRemocao() {
    if (!atual?.cliente) return
    setSalvando(true)
    try {
      await apagarCliente(atual.cliente.id)
      navegar('/clientes')
    } catch (e) {
      setAviso((e as Error).message)
      setSalvando(false)
      setRemover(false)
    }
  }

  if (erro) return <div className="p-6"><Aviso tom="erro">{erro}</Aviso></div>
  if (!atual) return <p className="p-6 text-pequeno text-texto-3">Carregando cliente…</p>
  if (!atual.cliente) {
    return (
      <EstadoVazio icone="empresa" titulo="Cliente não encontrado" acao={<Link to="/clientes" className="font-medium text-primaria underline">Voltar para Clientes</Link>}>
        Ele pode ser da carteira de outro vendedor.
      </EstadoVazio>
    )
  }

  const c = atual.cliente
  const endereco = enderecoEmLinha(c)
  const resp = c.responsavel_id ? (c.responsavel_id === sessao?.user.id ? 'Você' : (equipe.get(c.responsavel_id)?.nome ?? 'Alguém da equipe')) : null
  const nomeContato = (cid: string) => {
    const ct = atual.contatos.find((x) => x.id === cid)
    return ct ? nomeDoContato(ct) : ''
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 lg:px-8">
        <Link to="/clientes" className="inline-flex items-center gap-1 text-pequeno text-texto-3 hover:text-texto">
          <Icone nome="voltar" className="size-4" /> Clientes
        </Link>

        {aviso && <Aviso tom="erro">{aviso}</Aviso>}

        <div className="flex flex-wrap items-start gap-4 rounded-lg border border-borda bg-superficie p-5">
          <Avatar nome={c.nome} tamanho="lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h1 className="text-h1 font-semibold">{c.nome}</h1>
              {c.razao_social && c.razao_social !== c.nome && <p className="text-pequeno text-texto-3">{c.razao_social}</p>}
              {!c.ativo && <p className="text-pequeno font-medium text-atencao">Inativo: não aparece nas buscas de cliente.</p>}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <Dado icone="nota">
                {c.documento ? `${c.tipo === 'pj' ? 'CNPJ' : 'CPF'} ${formatarDocumento(c.documento)}` : `Sem ${c.tipo === 'pj' ? 'CNPJ' : 'CPF'}`}
              </Dado>
              {c.inscricao_estadual && <Dado icone="nota">IE {c.inscricao_estadual}</Dado>}
              {c.email && <Dado icone="email">{c.email}</Dado>}
              {c.telefone && <Dado icone="telefone">{c.telefone}</Dado>}
              <Dado icone="usuario">{resp ? `Responsável: ${resp}` : 'Sem responsável (cliente da empresa)'}</Dado>
            </div>
            {endereco && <p className="text-pequeno text-texto-2">{endereco}</p>}
            {c.observacoes && <p className="text-pequeno whitespace-pre-line text-texto-3">{c.observacoes}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Botao variante="secundario" icone="nota" onClick={() => setEditando(true)}>
              Editar
            </Botao>
            {gerencia && <Botao variante="fantasma" icone="lixeira" onClick={() => setRemover(true)} aria-label="Remover cliente" />}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            <Bloco
              titulo="Contatos"
              acao={
                <div className="flex flex-wrap gap-1">
                  <Botao tamanho="sm" variante="secundario" icone="link" onClick={() => setLigando(true)}>
                    Ligar contato
                  </Botao>
                  <Botao tamanho="sm" variante="secundario" icone="mais" onClick={() => setNovoContato(true)}>
                    Novo contato
                  </Botao>
                </div>
              }
            >
              {atual.contatos.length ? (
                <ul className="divide-y divide-borda">
                  {atual.contatos.map((ct) => (
                    <li key={ct.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <Avatar nome={nomeDoContato(ct)} tamanho="sm" />
                      <Link to={`/contatos/${ct.id}`} className="min-w-0 flex-1 hover:underline">
                        <span className="block truncate font-medium">{nomeDoContato(ct)}</span>
                        <span className="block truncate text-legenda text-texto-3">
                          {[formatarTelefone(ct.telefone), ct.email].filter(Boolean).join(' · ')}
                        </span>
                      </Link>
                      <Botao tamanho="sm" variante="fantasma" onClick={() => setSoltar(ct)}>
                        Tirar
                      </Botao>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-pequeno text-texto-3">
                  Nenhum contato ligado. Ligue as pessoas que falam pelo cliente no WhatsApp (comprador, financeiro).
                </p>
              )}
            </Bloco>

            {comPedidos && (
              <Bloco titulo="Pedidos e orçamentos">
                {atual.pedidos.length ? (
                  <ul className="divide-y divide-borda">
                    {atual.pedidos.map((p) => (
                      <li key={p.id}>
                        <Link to={`/pedidos/${p.id}`} className="flex flex-wrap items-center gap-3 py-2.5 hover:bg-fundo">
                          <span className="font-medium tabular-nums">#{p.numero}</span>
                          <EtiquetaPedido status={p.status as StatusPedido} />
                          <span className="min-w-0 flex-1 text-legenda text-texto-3">{quandoCurto(p.criado_em)}</span>
                          <span className="text-pequeno tabular-nums">{moeda(Number(p.total), true)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-pequeno text-texto-3">Nenhum pedido. O pedido de um contato ligado entra aqui sozinho.</p>
                )}
              </Bloco>
            )}

            {(atual.negocios.length > 0 || atual.conversas.length > 0) && (
              <Bloco titulo="Negócios e conversas dos contatos">
                <ul className="divide-y divide-borda">
                  {atual.negocios.map((n) => (
                    <li key={n.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <Link to={`/contatos/${n.contato_id}`} className="min-w-0 flex-1 hover:underline">
                        <span className="block truncate font-medium">{n.titulo}</span>
                        <span className="block text-legenda text-texto-3">{nomeContato(n.contato_id)}</span>
                      </Link>
                      {n.etapa && <EtiquetaEtapa nome={n.etapa.nome} tipo={n.etapa.tipo} />}
                      {n.valor_estimado != null && <span className="text-pequeno text-texto-2">{moeda(n.valor_estimado)}</span>}
                    </li>
                  ))}
                  {atual.conversas.map((v) => (
                    <li key={v.id}>
                      <Link to={`/conversas/${v.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 hover:bg-fundo">
                        <EtiquetaEstado estado={v.estado} />
                        <span className="min-w-0 flex-1 truncate text-pequeno text-texto-2">
                          <span className="font-medium text-texto">{nomeContato(v.contato_id)}</span> · {v.ultima_mensagem_resumo ?? '—'}
                        </span>
                        <span className="text-legenda text-texto-3">{quandoCurto(v.ultima_mensagem_em)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Bloco>
            )}
          </div>

          <Bloco titulo="Sobre o cadastro">
            <ul className="space-y-2 text-pequeno text-texto-2">
              <li>{c.tipo === 'pj' ? 'Empresa (CNPJ)' : 'Pessoa física (CPF)'}</li>
              <li>Cadastrado {quandoCurto(c.criado_em)}</li>
              {!c.documento && <li className="text-texto-3">Sem documento, o orçamento sai só com o nome.</li>}
            </ul>
          </Bloco>
        </div>
      </div>

      {editando && (
        <ModalCliente
          inicial={c}
          aoFechar={() => setEditando(false)}
          aoSalvar={() => {
            setEditando(false)
            recarregar()
          }}
        />
      )}
      {novoContato && (
        <ModalContato
          aberto
          aoFechar={() => setNovoContato(false)}
          aoSalvar={async (contatoId) => {
            setNovoContato(false)
            try {
              await ligarContato(contatoId, c.id)
            } catch (e) {
              setAviso((e as Error).message)
            }
            recarregar()
          }}
        />
      )}
      {ligando && (
        <ModalLigarContato
          orgId={orgId}
          clienteId={c.id}
          aoFechar={() => setLigando(false)}
          aoLigar={() => {
            setLigando(false)
            recarregar()
          }}
        />
      )}
      <DialogoConfirmacao
        aberto={!!soltar}
        titulo="Tirar o contato deste cliente?"
        rotuloConfirmar="Tirar"
        carregando={salvando}
        aoConfirmar={() => void confirmarSoltar()}
        aoCancelar={() => setSoltar(null)}
      >
        {soltar && nomeDoContato(soltar)} continua nos Contatos, só deixa de estar ligado a {c.nome}.
      </DialogoConfirmacao>
      <DialogoConfirmacao
        aberto={remover}
        titulo="Remover cliente?"
        rotuloConfirmar="Remover"
        perigo
        carregando={salvando}
        aoConfirmar={() => void confirmarRemocao()}
        aoCancelar={() => setRemover(false)}
      >
        “{c.nome}” sai do cadastro. Os contatos, pedidos e ordens de serviço continuam, só sem cliente ligado. Para só tirar
        das buscas, edite e desmarque “Ativo”.
      </DialogoConfirmacao>
    </div>
  )
}

/** Busca entre os contatos que a pessoa vê e liga ao cliente (o que já está em outro cliente muda de cliente). */
function ModalLigarContato({ orgId, clienteId, aoFechar, aoLigar }: { orgId: string; clienteId: string; aoFechar: () => void; aoLigar: () => void }) {
  const [busca, setBusca] = useState('')
  const [achados, setAchados] = useState<Awaited<ReturnType<typeof procurarContatos>>>([])
  const [ligando, setLigando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    const t = setTimeout(() => {
      procurarContatos(orgId, busca)
        .then((l) => ativo && setAchados(l))
        .catch(() => ativo && setAchados([]))
    }, 250)
    return () => {
      ativo = false
      clearTimeout(t)
    }
  }, [orgId, busca])

  async function ligar(contatoId: string) {
    setLigando(contatoId)
    setErro(null)
    try {
      await ligarContato(contatoId, clienteId)
      aoLigar()
    } catch (e) {
      setErro((e as Error).message)
      setLigando(null)
    }
  }

  return (
    <Modal aberto titulo="Ligar contato" aoFechar={aoFechar} rodape={<Botao variante="secundario" onClick={aoFechar}>Fechar</Botao>}>
      <div className="space-y-3">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <label className="relative block">
          <span className="sr-only">Buscar contato</span>
          <Icone nome="busca" className="pointer-events-none absolute top-3 left-3 size-4 text-texto-3" />
          <input
            type="search"
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, empresa ou telefone do contato"
            className="h-10 w-full rounded-md border border-borda bg-superficie pr-3 pl-9 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
        </label>
        {busca.trim() && !achados.length && <p className="text-pequeno text-texto-3">Nenhum contato encontrado na sua carteira.</p>}
        {achados.length > 0 && (
          <ul className="divide-y divide-borda rounded-md border border-borda">
            {achados.map((ct) => {
              const aqui = ct.cliente_id === clienteId
              return (
                <li key={ct.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-pequeno font-medium">{nomeDoContato(ct)}</span>
                    <span className="block truncate text-legenda text-texto-3">
                      {formatarTelefone(ct.telefone)}
                      {ct.cliente_id && !aqui && ' · ligado a outro cliente (muda para este)'}
                    </span>
                  </span>
                  <Botao tamanho="sm" variante="secundario" onClick={() => void ligar(ct.id)} disabled={aqui} carregando={ligando === ct.id}>
                    {aqui ? 'Já ligado' : 'Ligar'}
                  </Botao>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
