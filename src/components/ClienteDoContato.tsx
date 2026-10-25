import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { clienteResumo, formatarDocumento, ligarContato, procurarClientes, type ClienteResumo } from '../services/clientes'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'
import { ModalCliente } from './ModalCliente'

type ContatoBase = { id: string; cliente_id: string | null; empresa: string | null; email: string | null }

/**
 * O cliente do contato (perfil do contato e painel da conversa). Sem cliente: ligar a um existente ou criar um, já
 * com a empresa e o e-mail do contato. O conteúdo vem sem moldura: quem usa põe no bloco dele.
 */
export function ClienteDoContato({ contato, aoMudar }: { contato: ContatoBase; aoMudar: () => void }) {
  const { orgAtiva } = useSessao()
  const [cliente, setCliente] = useState<{ id: string; resumo: ClienteResumo | null } | null>(null)
  const [escolher, setEscolher] = useState(false)
  const [criar, setCriar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!contato.cliente_id) return
    let ativo = true
    const id = contato.cliente_id
    clienteResumo(id)
      .then((resumo) => ativo && setCliente({ id, resumo }))
      .catch(() => ativo && setCliente({ id, resumo: null }))
    return () => {
      ativo = false
    }
  }, [contato.cliente_id])

  async function ligar(clienteId: string | null) {
    setSalvando(true)
    setErro(null)
    try {
      await ligarContato(contato.id, clienteId)
      setEscolher(false)
      aoMudar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const atual = contato.cliente_id && cliente?.id === contato.cliente_id ? cliente : null

  return (
    <div className="space-y-2">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {contato.cliente_id ? (
        !atual ? (
          <p className="text-pequeno text-texto-3">Carregando…</p>
        ) : atual.resumo ? (
          <>
            <Link to={`/clientes/${atual.resumo.id}`} className="flex items-start gap-2 rounded-md p-1 -m-1 hover:bg-fundo">
              <Icone nome="empresa" className="mt-0.5 size-4 shrink-0 text-texto-3" />
              <span className="min-w-0">
                <span className="block font-medium text-texto">{atual.resumo.nome}</span>
                <span className="block text-legenda text-texto-3">
                  {[
                    atual.resumo.documento ? formatarDocumento(atual.resumo.documento) : `sem ${atual.resumo.tipo === 'pj' ? 'CNPJ' : 'CPF'}`,
                    [atual.resumo.cidade, atual.resumo.uf].filter(Boolean).join('/'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </Link>
            <div className="flex flex-wrap gap-1">
              <Botao tamanho="sm" variante="fantasma" onClick={() => setEscolher(true)} disabled={salvando}>
                Trocar
              </Botao>
              <Botao tamanho="sm" variante="fantasma" onClick={() => void ligar(null)} carregando={salvando}>
                Tirar
              </Botao>
            </div>
          </>
        ) : (
          <p className="text-pequeno text-texto-3">Ligado a um cliente da carteira de outro vendedor.</p>
        )
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
          inicial={contato.empresa ?? ''}
          salvando={salvando}
          aoFechar={() => setEscolher(false)}
          aoEscolher={(id) => void ligar(id)}
        />
      )}
      {criar && (
        <ModalCliente
          sugestao={{ nome: contato.empresa, email: contato.email }}
          aoFechar={() => setCriar(false)}
          aoSalvar={(id) => {
            setCriar(false)
            void ligar(id)
          }}
        />
      )}
    </div>
  )
}

/** Busca de cliente por nome, razão social ou CNPJ/CPF (ligar contato, escolher no pedido). */
export function ModalEscolherCliente({
  orgId,
  inicial = '',
  salvando,
  aoFechar,
  aoEscolher,
}: {
  orgId: string
  inicial?: string
  salvando?: boolean
  aoFechar: () => void
  aoEscolher: (id: string, cliente: ClienteResumo) => void
}) {
  const [busca, setBusca] = useState(inicial)
  const [achados, setAchados] = useState<ClienteResumo[]>([])

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
        {busca.trim() && !achados.length && (
          <p className="text-pequeno text-texto-3">Nenhum cliente encontrado. Cadastre em Clientes ou pelo “Criar cliente”.</p>
        )}
        {achados.length > 0 && (
          <ul className="divide-y divide-borda rounded-md border border-borda">
            {achados.map((c) => (
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
        )}
      </div>
    </Modal>
  )
}
