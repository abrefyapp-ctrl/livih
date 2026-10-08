import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  buscarContatoPerfil,
  listarEtapas,
  listarOportunidades,
  type ContatoPerfil as Perfil,
  type Etapa,
  type Oportunidade,
} from '../services/crm'
import { formatarTelefone, moeda, nomeDoContato, quandoCurto } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { Avatar } from '../components/Avatar'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { EstadoVazio } from '../components/EstadoVazio'
import { EtiquetaEstado } from '../components/EtiquetaEstado'
import { EtiquetaEtapa } from '../components/EtiquetaEtapa'
import { Icone, type NomeIcone } from '../components/Icone'
import { ModalContato } from '../components/ModalContato'
import { ModalOportunidade } from '../components/ModalOportunidade'
import { NotasContato } from '../components/NotasContato'

function Bloco({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-borda bg-superficie">
      <div className="flex items-center justify-between gap-3 border-b border-borda px-4 py-3">
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

export function ContatoPerfil() {
  const { id } = useParams()
  const { orgAtiva, sessao, equipe } = useSessao()
  const orgId = orgAtiva!.id
  const [dados, setDados] = useState<{ id: string; perfil: Perfil | null; oportunidades: Oportunidade[] } | null>(null)
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [editando, setEditando] = useState(false)
  const [oportunidade, setOportunidade] = useState<Oportunidade | 'nova' | null>(null)

  useEffect(() => {
    if (!id) return
    let ativo = true
    Promise.all([buscarContatoPerfil(id), listarOportunidades(orgId, id), listarEtapas(orgId)])
      .then(([perfil, ops, et]) => {
        if (!ativo) return
        setDados({ id, perfil, oportunidades: ops })
        setEtapas(et)
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar o contato.'))
    return () => {
      ativo = false
    }
  }, [id, orgId, versao])

  const atual = dados?.id === id ? dados : null
  const recarregar = () => setVersao((v) => v + 1)

  if (erro) return <div className="p-6"><Aviso tom="erro">{erro}</Aviso></div>
  if (!atual) return <p className="p-6 text-pequeno text-texto-3">Carregando contato…</p>
  if (!atual.perfil) {
    return (
      <EstadoVazio icone="usuario" titulo="Contato não encontrado" acao={<Link to="/contatos" className="font-medium text-primaria underline">Voltar para Contatos</Link>}>
        Ele pode ser da carteira de outro vendedor.
      </EstadoVazio>
    )
  }

  const c = atual.perfil
  const nome = nomeDoContato(c)
  const etapaDe = (eid: string) => etapas.find((e) => e.id === eid)
  const resp = c.responsavel_id ? (c.responsavel_id === sessao?.user.id ? 'Você' : (equipe.get(c.responsavel_id)?.nome ?? 'Alguém da equipe')) : null
  const conversas = [...c.conversas].sort((a, b) => (b.ultima_mensagem_em ?? '').localeCompare(a.ultima_mensagem_em ?? ''))

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 lg:px-8">
        <Link to="/contatos" className="inline-flex items-center gap-1 text-pequeno text-texto-3 hover:text-texto">
          <Icone nome="voltar" className="size-4" /> Contatos
        </Link>

        <div className="flex flex-wrap items-start gap-4 rounded-lg border border-borda bg-superficie p-5">
          <Avatar nome={nome} tamanho="lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h1 className="text-h1 font-semibold">{nome}</h1>
              {c.nome_whatsapp && c.nome_whatsapp !== nome && <p className="text-pequeno text-texto-3">No WhatsApp: {c.nome_whatsapp}</p>}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {c.telefone && <Dado icone="telefone">{formatarTelefone(c.telefone)}</Dado>}
              {c.email && <Dado icone="email">{c.email}</Dado>}
              {c.empresa && <Dado icone="empresa">{c.empresa}</Dado>}
              <Dado icone="usuario">{resp ? `Responsável: ${resp}` : 'Sem responsável (cliente da empresa)'}</Dado>
            </div>
            {c.tags.length > 0 && (
              <ul className="flex flex-wrap gap-1" aria-label="Tags">
                {c.tags.map((t) => (
                  <li key={t} className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-legenda text-texto-2">
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Botao variante="secundario" icone="nota" onClick={() => setEditando(true)}>
            Editar
          </Botao>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            <Bloco
              titulo="Oportunidades"
              acao={
                <Botao tamanho="sm" variante="secundario" icone="mais" onClick={() => setOportunidade('nova')} disabled={!etapas.length}>
                  Nova oportunidade
                </Botao>
              }
            >
              {atual.oportunidades.length ? (
                <ul className="divide-y divide-borda">
                  {atual.oportunidades.map((o) => {
                    const e = etapaDe(o.etapa_id)
                    return (
                      <li key={o.id}>
                        <button onClick={() => setOportunidade(o)} className="flex w-full flex-wrap items-center gap-3 py-2.5 text-left hover:bg-fundo">
                          <span className="min-w-0 flex-1 font-medium">{o.titulo}</span>
                          {e && <EtiquetaEtapa nome={e.nome} tipo={e.tipo} />}
                          {o.valor_estimado != null && <span className="text-pequeno text-texto-2">{moeda(o.valor_estimado)}</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-pequeno text-texto-3">Nenhuma oportunidade. O agente cria quando percebe interesse; você também pode criar.</p>
              )}
            </Bloco>

            <Bloco titulo="Conversas">
              {conversas.length ? (
                <ul className="divide-y divide-borda">
                  {conversas.map((v) => (
                    <li key={v.id}>
                      <Link to={`/conversas/${v.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 hover:bg-fundo">
                        <EtiquetaEstado estado={v.estado} />
                        <span className="min-w-0 flex-1 truncate text-pequeno text-texto-2">{v.ultima_mensagem_resumo ?? '—'}</span>
                        <span className="text-legenda text-texto-3">
                          {v.canal?.nome && `${v.canal.nome} · `}
                          {quandoCurto(v.ultima_mensagem_em)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-pequeno text-texto-3">Ainda não conversou pelo WhatsApp com a empresa.</p>
              )}
            </Bloco>
          </div>

          <Bloco titulo="Notas da equipe">
            <NotasContato contatoId={c.id} />
          </Bloco>
        </div>
      </div>

      {editando && (
        <ModalContato
          aberto
          inicial={{ id: c.id, nome: c.nome ?? c.nome_whatsapp, telefone: c.telefone, empresa: c.empresa, email: c.email, responsavel_id: c.responsavel_id }}
          aoFechar={() => setEditando(false)}
          aoSalvar={() => {
            setEditando(false)
            recarregar()
          }}
        />
      )}
      {oportunidade && (
        <ModalOportunidade
          aberto
          etapas={etapas}
          oportunidade={oportunidade === 'nova' ? undefined : oportunidade}
          contatoFixo={oportunidade === 'nova' ? { id: c.id, nome } : undefined}
          aoFechar={() => setOportunidade(null)}
          aoSalvar={() => {
            setOportunidade(null)
            recarregar()
          }}
        />
      )}
    </div>
  )
}
