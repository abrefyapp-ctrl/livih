import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  empresasDoContato,
  formatarDocumento,
  ligarContato,
  ligarEmpresa,
  procurarClientes,
  soltarEmpresa,
  type ClienteResumo,
  type EmpresaDoContato,
} from '../services/clientes'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'
import { ModalCliente } from './ModalCliente'

type ContatoBase = { id: string; cliente_id: string | null; empresa: string | null; email: string | null }

const linhaDoCliente = (c: ClienteResumo) =>
  [c.documento ? formatarDocumento(c.documento) : `sem ${c.tipo === 'pj' ? 'CNPJ' : 'CPF'}`, [c.cidade, c.uf].filter(Boolean).join('/')]
    .filter(Boolean)
    .join(' · ')

/**
 * Os clientes do contato (perfil do contato e painel da conversa). Quem compra por mais de uma empresa (grupo com
 * vários CNPJs, pedido da JoGrampo em 05/11) fica ligado a todas; a principal é a que o pedido novo pega. Sem cliente:
 * ligar a um existente ou criar um, já com a empresa e o e-mail do contato. O conteúdo vem sem moldura: quem usa põe
 * no bloco dele.
 */
export function ClienteDoContato({ contato, aoMudar }: { contato: ContatoBase; aoMudar: () => void }) {
  const { orgAtiva } = useSessao()
  const [empresas, setEmpresas] = useState<{ chave: string; lista: EmpresaDoContato[] | null } | null>(null)
  const [versao, setVersao] = useState(0)
  const [escolher, setEscolher] = useState(false)
  const [criar, setCriar] = useState(false)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // A chave muda quando o principal muda (o pai recarrega o contato) ou quando este bloco liga e solta.
  const chave = `${contato.id}:${contato.cliente_id ?? ''}:${versao}`
  useEffect(() => {
    let ativo = true
    empresasDoContato(contato.id)
      .then((lista) => ativo && setEmpresas({ chave, lista }))
      .catch(() => ativo && setEmpresas({ chave, lista: null }))
    return () => {
      ativo = false
    }
  }, [contato.id, chave])

  async function executar(qual: string, acao: () => Promise<void>) {
    setSalvando(qual)
    setErro(null)
    try {
      await acao()
      setEscolher(false)
      setVersao((v) => v + 1)
      aoMudar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(null)
    }
  }

  const ligar = (clienteId: string) => orgAtiva && void executar('ligar', () => ligarEmpresa(orgAtiva.id, contato.id, clienteId))
  const atual = empresas?.chave === chave ? empresas.lista : undefined
  const varias = (atual?.length ?? 0) > 1

  return (
    <div className="space-y-2">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {atual === undefined ? (
        <p className="text-pequeno text-texto-3">Carregando…</p>
      ) : atual === null ? (
        <p className="text-pequeno text-texto-3">Não foi possível carregar os clientes do contato.</p>
      ) : atual.length ? (
        <>
          <ul className="space-y-2">
            {atual.map(({ cliente_id, cliente }) => {
              const principal = cliente_id === contato.cliente_id
              return (
                <li key={cliente_id} className="space-y-1">
                  {cliente ? (
                    <Link to={`/clientes/${cliente.id}`} className="flex items-start gap-2 rounded-md p-1 -m-1 hover:bg-fundo">
                      <Icone nome="empresa" className="mt-0.5 size-4 shrink-0 text-texto-3" />
                      <span className="min-w-0">
                        <span className="block font-medium text-texto">
                          {cliente.nome}
                          {varias && principal && <span className="ml-1.5 text-legenda font-normal text-texto-3">principal</span>}
                        </span>
                        <span className="block text-legenda text-texto-3">{linhaDoCliente(cliente)}</span>
                      </span>
                    </Link>
                  ) : (
                    <p className="text-pequeno text-texto-3">
                      Cliente da carteira de outro vendedor{varias && principal ? ' (principal)' : ''}.
                    </p>
                  )}
                  {cliente && (
                    <div className="flex flex-wrap gap-1">
                      {varias && !principal && (
                        <Botao
                          tamanho="sm"
                          variante="fantasma"
                          onClick={() => void executar(cliente_id, () => ligarContato(contato.id, cliente_id))}
                          carregando={salvando === cliente_id}
                          disabled={!!salvando}
                        >
                          Tornar principal
                        </Botao>
                      )}
                      <Botao
                        tamanho="sm"
                        variante="fantasma"
                        onClick={() => void executar(`tirar:${cliente_id}`, () => soltarEmpresa(contato.id, cliente_id))}
                        carregando={salvando === `tirar:${cliente_id}`}
                        disabled={!!salvando}
                      >
                        Tirar
                      </Botao>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {varias && (
            <p className="text-legenda text-texto-3">
              Compra por mais de uma empresa: o pedido novo sai na principal, e no pedido dá para trocar. O agente pergunta
              para qual empresa é o orçamento.
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            <Botao tamanho="sm" variante="secundario" icone="link" onClick={() => setEscolher(true)} disabled={!!salvando}>
              Ligar outra empresa
            </Botao>
            <Botao tamanho="sm" variante="secundario" icone="mais" onClick={() => setCriar(true)} disabled={!!salvando}>
              Criar cliente
            </Botao>
          </div>
        </>
      ) : (
        <>
          <p className="text-pequeno text-texto-3">
            Sem cliente ligado. Ligue para o pedido e o orçamento saírem com o CNPJ e o endereço da empresa.
          </p>
          <div className="flex flex-wrap gap-1">
            <Botao tamanho="sm" variante="secundario" icone="link" onClick={() => setEscolher(true)}>
              Ligar a cliente
            </Botao>
            <Botao tamanho="sm" variante="secundario" icone="mais" onClick={() => setCriar(true)}>
              Criar cliente
            </Botao>
          </div>
        </>
      )}

      {escolher && orgAtiva && (
        <ModalEscolherCliente
          orgId={orgAtiva.id}
          inicial={atual?.length ? '' : (contato.empresa ?? '')}
          salvando={salvando === 'ligar'}
          aoFechar={() => setEscolher(false)}
          aoEscolher={(id) => ligar(id)}
        />
      )}
      {criar && (
        <ModalCliente
          sugestao={atual?.length ? {} : { nome: contato.empresa, email: contato.email }}
          aoFechar={() => setCriar(false)}
          aoSalvar={(id) => {
            setCriar(false)
            ligar(id)
          }}
        />
      )}
    </div>
  )
}

/**
 * Busca de cliente por nome, razão social ou CNPJ/CPF (ligar contato, escolher no pedido). Com contatoId, antes de
 * digitar mostra as empresas do contato (quem compra por mais de uma escolhe em qual o pedido sai).
 */
export function ModalEscolherCliente({
  orgId,
  contatoId,
  inicial = '',
  salvando,
  aoFechar,
  aoEscolher,
}: {
  orgId: string
  contatoId?: string | null
  inicial?: string
  salvando?: boolean
  aoFechar: () => void
  aoEscolher: (id: string, cliente: ClienteResumo) => void
}) {
  const [busca, setBusca] = useState(inicial)
  const [achados, setAchados] = useState<ClienteResumo[]>([])
  const [doContato, setDoContato] = useState<ClienteResumo[]>([])

  useEffect(() => {
    if (!contatoId) return
    let ativo = true
    empresasDoContato(contatoId)
      .then((l) => ativo && setDoContato(l.flatMap((e) => (e.cliente ? [e.cliente] : []))))
      .catch(() => ativo && setDoContato([]))
    return () => {
      ativo = false
    }
  }, [contatoId])

  useEffect(() => {
    let ativo = true
    const t = setTimeout(() => {
      procurarClientes(orgId, busca)
        .then((l) => ativo && setAchados(l))
        .catch(() => ativo && setAchados([]))
    }, 250)
    return () => {
      ativo = false
      clearTimeout(t)
    }
  }, [orgId, busca])

  const sugeridos = !busca.trim() && contatoId ? doContato : []

  return (
    <Modal aberto titulo="Escolher cliente" aoFechar={aoFechar} rodape={<Botao variante="secundario" onClick={aoFechar}>Fechar</Botao>}>
      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Buscar cliente</span>
          <Icone nome="busca" className="pointer-events-none absolute top-3 left-3 size-4 text-texto-3" />
          <input
            type="search"
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, razão social ou CNPJ/CPF"
            className="h-10 w-full rounded-md border border-borda bg-superficie pr-3 pl-9 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
        </label>
        {sugeridos.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-legenda font-medium text-texto-3">Empresas deste contato</p>
            <ListaClientes clientes={sugeridos} salvando={salvando} aoEscolher={aoEscolher} />
          </div>
        )}
        {busca.trim() && !achados.length && (
          <p className="text-pequeno text-texto-3">Nenhum cliente encontrado. Cadastre em Clientes ou pelo “Criar cliente”.</p>
        )}
        {achados.length > 0 && !sugeridos.length && <ListaClientes clientes={achados} salvando={salvando} aoEscolher={aoEscolher} />}
      </div>
    </Modal>
  )
}

function ListaClientes({
  clientes,
  salvando,
  aoEscolher,
}: {
  clientes: ClienteResumo[]
  salvando?: boolean
  aoEscolher: (id: string, cliente: ClienteResumo) => void
}) {
  return (
    <ul className="divide-y divide-borda rounded-md border border-borda">
      {clientes.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            disabled={salvando}
            onClick={() => aoEscolher(c.id, c)}
            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-fundo disabled:opacity-60"
          >
            <Icone nome="empresa" className="size-4 shrink-0 text-texto-3" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-pequeno font-medium">{c.nome}</span>
              <span className="block truncate text-legenda text-texto-3">
                {[c.razao_social !== c.nome ? c.razao_social : null, formatarDocumento(c.documento), [c.cidade, c.uf].filter(Boolean).join('/')]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
