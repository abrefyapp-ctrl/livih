import { useEffect, useMemo, useState } from 'react'
import { listarTarefas, prazo, type Tarefa } from '../services/tarefas'
import { useSessao } from '../hooks/useSessao'
import { useEquipe } from '../hooks/useEquipe'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { EstadoVazio } from '../components/EstadoVazio'
import { LinhaTarefa } from '../components/TarefasDoContato'
import { ModalTarefa } from '../components/ModalTarefa'

type Aba = 'abertas' | 'concluidas'
// '' = todas as que a pessoa vê; 'agente' = só as retomadas do agente; senão, o id de quem é responsável.
type Filtro = string

/**
 * Tarefas da equipe (docs/crm-acompanhamento.md): o que fazer com cada cliente e quando. "A fazer" separa atrasadas,
 * hoje, próximos 7 dias e depois; "Concluídas" mostra os últimos 30 dias. Cada pessoa começa vendo as dela.
 */
export function Tarefas() {
  const { orgAtiva, sessao } = useSessao()
  const orgId = orgAtiva!.id
  const eu = sessao?.user.id ?? ''
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const equipe = useEquipe(orgId)
  const [aba, setAba] = useState<Aba>('abertas')
  const [filtro, setFiltro] = useState<Filtro>(orgAtiva?.suporte ? '' : eu)
  const [dados, setDados] = useState<{ chave: string; lista: Tarefa[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [abrir, setAbrir] = useState<Tarefa | 'nova' | null>(null)

  const chave = `${orgId}:${aba}:${versao}`
  useEffect(() => {
    let ativo = true
    listarTarefas(orgId, aba)
      .then((lista) => {
        if (!ativo) return
        setDados({ chave, lista })
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar as tarefas.'))
    return () => {
      ativo = false
    }
  }, [orgId, aba, chave])

  const atual = dados?.chave === chave ? dados.lista : null
  const recarregar = () => setVersao((v) => v + 1)

  const filtradas = useMemo(
    () =>
      (atual ?? []).filter((t) =>
        filtro === '' ? true : filtro === 'agente' ? t.executor === 'agente' : t.executor === 'equipe' && t.responsavel_id === filtro,
      ),
    [atual, filtro],
  )

  const grupos = useMemo(() => {
    if (aba === 'concluidas') return [{ titulo: 'Concluídas nos últimos 30 dias', lista: filtradas }]
    const agora = new Date()
    const em7 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 8).getTime()
    const atrasadas: Tarefa[] = []
    const hoje: Tarefa[] = []
    const semana: Tarefa[] = []
    const depois: Tarefa[] = []
    for (const t of filtradas) {
      const p = prazo(t.vence_em, agora)
      if (p === 'atrasada') atrasadas.push(t)
      else if (p === 'hoje') hoje.push(t)
      else if (new Date(t.vence_em).getTime() < em7) semana.push(t)
      else depois.push(t)
    }
    return [
      { titulo: 'Atrasadas', lista: atrasadas, destaque: true },
      { titulo: 'Hoje', lista: hoje },
      { titulo: 'Próximos 7 dias', lista: semana },
      { titulo: 'Depois', lista: depois },
    ].filter((g) => g.lista.length)
  }, [aba, filtradas])

  const atrasadas = aba === 'abertas' ? filtradas.filter((t) => prazo(t.vence_em) === 'atrasada').length : 0
  // Quem não é dono nem admin vê as próprias e as dos contatos da carteira dele; a lista de pessoas mostra todos
  // da equipe para ele poder ver as de um colega nos contatos que os dois atendem.
  const pessoas = equipe.filter((m) => m.user_id !== eu)

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1 font-semibold">Tarefas</h1>
          <p className="text-pequeno text-texto-3">O próximo passo com cada cliente, com lembrete no celular e no WhatsApp.</p>
        </div>
        <Botao icone="mais" onClick={() => setAbrir('nova')}>
          Nova tarefa
        </Botao>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Situação" className="inline-flex rounded-md border border-borda bg-superficie p-0.5">
          {(
            [
              ['abertas', 'A fazer'],
              ['concluidas', 'Concluídas'],
            ] as const
          ).map(([v, r]) => (
            <button
              key={v}
              role="tab"
              aria-selected={aba === v}
              onClick={() => setAba(v)}
              className={`rounded px-3 py-1.5 text-pequeno font-medium ${aba === v ? 'bg-primaria text-white' : 'text-texto-2 hover:bg-fundo'}`}
            >
              {r}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-pequeno text-texto-2">
          <span>De quem</span>
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="h-9 rounded-md border border-borda bg-superficie px-2 focus:border-primaria focus:outline-none"
          >
            {!orgAtiva?.suporte && <option value={eu}>Minhas</option>}
            <option value="">{gerencia ? 'Toda a equipe' : 'Todas que eu vejo'}</option>
            <option value="agente">Retomadas do agente</option>
            {pessoas.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.nome || m.email}
              </option>
            ))}
          </select>
        </label>
        {atrasadas > 0 && (
          <span className="rounded-full bg-erro-suave px-2.5 py-0.5 text-legenda font-semibold text-erro">
            {atrasadas} {atrasadas === 1 ? 'atrasada' : 'atrasadas'}
          </span>
        )}
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!atual ? (
        !erro && <p className="text-pequeno text-texto-3">Carregando…</p>
      ) : !grupos.length ? (
        <EstadoVazio
          icone="check"
          titulo={aba === 'abertas' ? 'Nada a fazer por aqui' : 'Nenhuma tarefa concluída nos últimos 30 dias'}
          acao={aba === 'abertas' ? <Botao icone="mais" onClick={() => setAbrir('nova')}>Nova tarefa</Botao> : undefined}
        >
          {aba === 'abertas'
            ? 'Crie tarefas aqui, no cartão da oportunidade, no perfil do contato ou na conversa.'
            : 'As tarefas feitas e canceladas aparecem aqui.'}
        </EstadoVazio>
      ) : (
        grupos.map((g) => (
          <section key={g.titulo} className="rounded-lg border border-borda bg-superficie px-4 py-2">
            <h2 className={`pt-2 text-pequeno font-semibold ${'destaque' in g && g.destaque ? 'text-erro' : 'text-texto-2'}`}>
              {g.titulo} <span className="font-normal text-texto-3">({g.lista.length})</span>
            </h2>
            <ul className="divide-y divide-borda">
              {g.lista.map((t) => (
                <li key={t.id}>
                  <LinhaTarefa tarefa={t} aoAbrir={() => setAbrir(t)} aoMudar={recarregar} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {abrir && (
        <ModalTarefa
          tarefa={abrir === 'nova' ? undefined : abrir}
          aoFechar={() => setAbrir(null)}
          aoSalvar={() => {
            setAbrir(null)
            recarregar()
          }}
        />
      )}
    </div>
  )
}
