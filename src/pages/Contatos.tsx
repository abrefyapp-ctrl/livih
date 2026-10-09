import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listarContatos, type ContatoLista } from '../services/crm'
import { formatarTelefone, moeda, nomeDoContato, quandoCurto } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { Avatar } from '../components/Avatar'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { EstadoVazio } from '../components/EstadoVazio'
import { EtiquetaEtapa } from '../components/EtiquetaEtapa'
import { Icone } from '../components/Icone'
import { ModalContato } from '../components/ModalContato'

// O negócio que mais importa agora: o aberto mais recente; sem aberto, o último fechado.
function negocioAtual(c: ContatoLista) {
  return c.oportunidades.find((o) => !o.fechada_em) ?? c.oportunidades[0]
}

function ultimaConversa(c: ContatoLista) {
  return c.conversas.reduce<string | null>(
    (maior, v) => (v.ultima_mensagem_em && (!maior || v.ultima_mensagem_em > maior) ? v.ultima_mensagem_em : maior),
    null,
  )
}

export function Contatos() {
  const { orgAtiva, sessao, equipe } = useSessao()
  const orgId = orgAtiva!.id
  const eu = sessao?.user.id
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [soMeus, setSoMeus] = useState(false)
  const [soSemAgente, setSoSemAgente] = useState(false)
  const [dados, setDados] = useState<{ chave: string; lista: ContatoLista[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)

  // Busca no banco com uma pausa curta enquanto digita.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 300)
    return () => clearTimeout(t)
  }, [busca])

  const chave = `${orgId}|${buscaAplicada}`
  useEffect(() => {
    let ativo = true
    listarContatos(orgId, buscaAplicada)
      .then((lista) => ativo && (setDados({ chave, lista }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar os contatos.'))
    return () => {
      ativo = false
    }
  }, [orgId, buscaAplicada, chave])

  const lista = useMemo(() => {
    const todos = dados?.chave === chave ? dados.lista : null
    return todos?.filter((c) => (!soMeus || c.responsavel_id === eu) && (!soSemAgente || c.sem_agente)) ?? null
  }, [dados, chave, soMeus, soSemAgente, eu])

  const responsavel = (id: string | null) => (id ? (id === eu ? 'Você' : (equipe.get(id)?.nome ?? '—')) : '—')

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-semibold">Contatos</h1>
            <p className="text-pequeno text-texto-3">Os clientes da sua carteira e os que falaram com o número da empresa.</p>
          </div>
          <Botao icone="mais" onClick={() => setNovo(true)}>
            Novo contato
          </Botao>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-64 flex-1 sm:max-w-md">
            <span className="sr-only">Buscar contatos</span>
            <Icone nome="busca" className="pointer-events-none absolute top-3 left-3 size-4 text-texto-3" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, empresa, e-mail ou telefone"
              className="h-10 w-full rounded-md border border-borda bg-superficie pr-3 pl-9 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2">
            <input type="checkbox" checked={soMeus} onChange={(e) => setSoMeus(e.target.checked)} className="size-4 accent-primaria" />
            Só os que estão comigo
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2">
            <input type="checkbox" checked={soSemAgente} onChange={(e) => setSoSemAgente(e.target.checked)} className="size-4 accent-primaria" />
            Só os que o agente não atende
          </label>
          {lista && (
            <span className="ml-auto text-legenda text-texto-3">
              {lista.length} {lista.length === 1 ? 'contato' : 'contatos'}
              {lista.length === 300 && ' (refine a busca para ver outros)'}
            </span>
          )}
        </div>

        {erro && <Aviso tom="erro">{erro}</Aviso>}

        <div className="overflow-hidden rounded-lg border border-borda bg-superficie">
          {!lista ? (
            <p className="p-5 text-pequeno text-texto-3" aria-busy="true">
              Carregando contatos…
            </p>
          ) : !lista.length ? (
            <EstadoVazio
              icone="usuario"
              titulo={buscaAplicada || soMeus || soSemAgente ? 'Nenhum contato encontrado' : 'Nenhum contato ainda'}
              acao={!buscaAplicada && !soMeus && !soSemAgente && <Botao icone="mais" onClick={() => setNovo(true)}>Cadastrar contato</Botao>}
            >
              {buscaAplicada || soMeus || soSemAgente
                ? 'Tente outro termo ou tire o filtro.'
                : 'Quem escrever para o WhatsApp entra aqui sozinho. Você também pode cadastrar à mão.'}
            </EstadoVazio>
          ) : (
            <>
              {/* desktop: tabela */}
              <table className="hidden w-full text-left text-pequeno md:table">
                <thead className="bg-fundo text-legenda text-texto-3">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 font-medium">WhatsApp</th>
                    <th className="px-4 py-2.5 font-medium">Negócio</th>
                    <th className="px-4 py-2.5 font-medium">Última conversa</th>
                    <th className="px-4 py-2.5 font-medium">Responsável</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {lista.map((c) => {
                    const n = negocioAtual(c)
                    const nome = nomeDoContato(c)
                    return (
                      <tr key={c.id} onClick={() => navegar(`/contatos/${c.id}`)} className="cursor-pointer hover:bg-fundo">
                        <td className="px-4 py-3">
                          <Link to={`/contatos/${c.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                            <Avatar nome={nome} tamanho="sm" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-texto">{nome}</span>
                              {c.empresa && <span className="block truncate text-legenda text-texto-3">{c.empresa}</span>}
                              {c.sem_agente && <SemAgente />}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-texto-2">{formatarTelefone(c.telefone) || '—'}</td>
                        <td className="px-4 py-3">
                          {n ? (
                            <span className="flex flex-wrap items-center gap-2">
                              {n.etapa && <EtiquetaEtapa nome={n.etapa.nome} tipo={n.etapa.tipo} />}
                              {n.valor_estimado != null && <span className="text-texto-2">{moeda(n.valor_estimado)}</span>}
                            </span>
                          ) : (
                            <span className="text-texto-3">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-texto-2">{quandoCurto(ultimaConversa(c)) || '—'}</td>
                        <td className="px-4 py-3 text-texto-2">{responsavel(c.responsavel_id)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* celular: lista */}
              <ul className="divide-y divide-borda md:hidden">
                {lista.map((c) => {
                  const n = negocioAtual(c)
                  const nome = nomeDoContato(c)
                  return (
                    <li key={c.id}>
                      <Link to={`/contatos/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-fundo">
                        <Avatar nome={nome} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{nome}</span>
                          {c.sem_agente && <SemAgente />}
                          <span className="block truncate text-pequeno text-texto-3">
                            {[c.empresa, formatarTelefone(c.telefone)].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        {n?.etapa && <EtiquetaEtapa nome={n.etapa.nome} tipo={n.etapa.tipo} />}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </div>

      {novo && (
        <ModalContato
          aberto
          aoFechar={() => setNovo(false)}
          aoSalvar={(id) => {
            setNovo(false)
            navegar(`/contatos/${id}`)
          }}
        />
      )}
    </div>
  )
}

function SemAgente() {
  return (
    <span className="mt-0.5 inline-flex items-center gap-1 rounded-sm bg-slate-100 px-1.5 py-0.5 text-legenda text-texto-2">
      <Icone nome="agente" className="size-3" />
      Sem agente
    </span>
  )
}
