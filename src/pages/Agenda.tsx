import { useEffect, useMemo, useState } from 'react'
import {
  horaCurta,
  inicioDaSemana,
  listarCompromissos,
  mesmoDiaLocal,
  ROTULO_STATUS,
  rotuloSemana,
  somarDias,
  type Compromisso,
} from '../services/agenda'
import { nomeDoContato } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { useEquipe } from '../hooks/useEquipe'
import { Aviso } from '../components/Aviso'
import { EstadoVazio } from '../components/EstadoVazio'
import { Botao } from '../components/Botao'
import { Icone } from '../components/Icone'
import { ModalCompromisso } from '../components/ModalCompromisso'

const ALTURA_HORA = 52 // px por hora na grade
const PRIMEIRA = 7
const ULTIMA = 20 // a grade vai até 21:00; amplia se houver compromisso fora disso

const COR: Record<Compromisso['status'], string> = {
  marcado: 'bg-primaria-suave text-texto ring-1 ring-verde-100',
  confirmado: 'bg-primaria text-white',
  realizado: 'bg-slate-100 text-texto-2 ring-1 ring-borda',
  nao_compareceu: 'bg-atencao-suave text-atencao ring-1 ring-amber-200',
  cancelado: 'bg-superficie text-texto-3 line-through ring-1 ring-borda',
}

type Abertura = { compromisso?: Compromisso; inicio?: Date }

/** Lado a lado quando os horários se cruzam: coluna de cada compromisso e quantas colunas o grupo usa. */
function colunas(lista: Compromisso[]) {
  const pos = new Map<string, { col: number; total: number }>()
  let grupo: Compromisso[] = []
  let fimGrupo = 0
  let fins: number[] = []
  const fechar = () => grupo.forEach((c) => pos.set(c.id, { col: pos.get(c.id)!.col, total: fins.length }))
  for (const c of lista) {
    const ini = new Date(c.inicio).getTime()
    const fim = new Date(c.fim).getTime()
    if (grupo.length && ini >= fimGrupo) {
      fechar()
      grupo = []
      fins = []
    }
    let col = fins.findIndex((f) => f <= ini)
    if (col === -1) col = fins.push(fim) - 1
    else fins[col] = fim
    pos.set(c.id, { col, total: 1 })
    grupo.push(c)
    fimGrupo = Math.max(fimGrupo, fim)
  }
  fechar()
  return pos
}

export function Agenda() {
  const { modulos } = useSessao()
  if (modulos && !modulos.has('agenda')) {
    return (
      <EstadoVazio icone="calendario" titulo="A agenda não está ligada nesta empresa">
        Fale com a equipe da Livih para ativar.
      </EstadoVazio>
    )
  }
  return <AgendaSemana />
}

function AgendaSemana() {
  const { orgAtiva, sessao } = useSessao()
  const orgId = orgAtiva!.id
  const eu = sessao?.user.id
  const equipe = useEquipe(orgId)
  const [segunda, setSegunda] = useState(() => inicioDaSemana(new Date()))
  const [quem, setQuem] = useState('')
  const [dados, setDados] = useState<{ chave: string; lista: Compromisso[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [abertura, setAbertura] = useState<Abertura | null>(null)
  const [hoje, setHoje] = useState(() => new Date())

  const chave = `${orgId}|${segunda.toISOString()}|${versao}`
  useEffect(() => {
    let ativo = true
    listarCompromissos(orgId, segunda, somarDias(segunda, 7))
      .then((lista) => {
        if (!ativo) return
        setDados({ chave, lista })
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar a agenda.'))
    return () => {
      ativo = false
    }
  }, [orgId, segunda, chave])

  // A linha do "agora" anda sozinha.
  useEffect(() => {
    const id = setInterval(() => setHoje(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const todos = useMemo(() => (dados?.chave === chave ? dados.lista : null), [dados, chave])
  const lista = useMemo(
    () => todos?.filter((c) => (quem === 'eu' ? c.responsavel_id === eu : quem ? c.responsavel_id === quem : true)) ?? null,
    [todos, quem, eu],
  )
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i))
  const doDia = (d: Date) => (lista ?? []).filter((c) => mesmoDiaLocal(new Date(c.inicio), d))

  const horas = useMemo(() => {
    let ini = PRIMEIRA
    let fim = ULTIMA
    for (const c of lista ?? []) {
      ini = Math.min(ini, new Date(c.inicio).getHours())
      const f = new Date(c.fim)
      fim = Math.max(fim, f.getHours() - (f.getMinutes() ? 0 : 1))
    }
    return Array.from({ length: fim - ini + 1 }, (_, i) => ini + i)
  }, [lista])
  const topo = (d: Date) => ((d.getHours() - horas[0]) * 60 + d.getMinutes()) * (ALTURA_HORA / 60)

  const nomeResp = (id: string | null) => {
    if (!id) return null
    if (id === eu) return 'Você'
    const m = equipe.find((x) => x.user_id === id)
    return m?.nome || m?.email || null
  }
  const recarregar = () => setVersao((v) => v + 1)
  const ehEstaSemana = mesmoDiaLocal(segunda, inicioDaSemana(hoje))

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pt-6 pb-3 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-semibold">Agenda</h1>
            <p className="text-pequeno text-texto-3">Reuniões, visitas e retornos da equipe, ligados aos clientes.</p>
          </div>
          <Botao icone="mais" onClick={() => setAbertura({})}>
            Novo compromisso
          </Botao>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Botao variante="secundario" tamanho="sm" onClick={() => setSegunda(inicioDaSemana(new Date()))} disabled={ehEstaSemana}>
            Hoje
          </Botao>
          <div className="flex">
            <button
              type="button"
              aria-label="Semana anterior"
              onClick={() => setSegunda(somarDias(segunda, -7))}
              className="flex size-8 items-center justify-center rounded-md text-texto-2 hover:bg-slate-100"
            >
              <Icone nome="voltar" className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Próxima semana"
              onClick={() => setSegunda(somarDias(segunda, 7))}
              className="flex size-8 items-center justify-center rounded-md text-texto-2 hover:bg-slate-100"
            >
              <Icone nome="voltar" className="size-4 rotate-180" />
            </button>
          </div>
          <p className="min-w-0 flex-1 font-medium first-letter:uppercase" aria-live="polite">
            {rotuloSemana(segunda)}
          </p>
          <label htmlFor="agenda-quem" className="sr-only">
            De quem
          </label>
          <select
            id="agenda-quem"
            value={quem}
            onChange={(e) => setQuem(e.target.value)}
            className="h-9 rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none"
          >
            <option value="">Toda a equipe</option>
            <option value="eu">Só os meus</option>
            {equipe
              .filter((m) => m.user_id !== eu)
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.nome || m.email}
                </option>
              ))}
          </select>
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>

      {/* Celular: lista por dia */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6 lg:hidden">
        {dias.map((d) => {
          const itens = doDia(d)
          const ehHoje = mesmoDiaLocal(d, hoje)
          return (
            <section key={d.toISOString()} aria-label={d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}>
              <h2 className={`mb-1.5 text-pequeno font-semibold first-letter:uppercase ${ehHoje ? 'text-primaria' : 'text-texto-2'}`}>
                {ehHoje ? 'Hoje, ' : ''}
                {d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}
              </h2>
              {!lista ? (
                <p className="text-pequeno text-texto-3">Carregando…</p>
              ) : itens.length ? (
                <ul className="space-y-1.5">
                  {itens.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setAbertura({ compromisso: c })}
                        className={`flex w-full gap-3 rounded-md px-3 py-2 text-left ${COR[c.status]}`}
                      >
                        <span className="w-12 shrink-0 text-pequeno font-semibold tabular-nums">{horaCurta(c.inicio)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.titulo}</span>
                          <span className="block truncate text-legenda opacity-80">
                            {[c.contato && nomeDoContato(c.contato), nomeResp(c.responsavel_id), c.status !== 'marcado' && ROTULO_STATUS[c.status]]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <button
                  type="button"
                  onClick={() => setAbertura({ inicio: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9) })}
                  className="text-pequeno text-texto-3 hover:text-primaria"
                >
                  Livre · marcar
                </button>
              )}
            </section>
          )
        })}
      </div>

      {/* Computador: grade da semana */}
      <div className="hidden min-h-0 flex-1 overflow-auto px-8 pb-6 lg:block">
        <div className="min-w-[860px] rounded-lg border border-borda bg-superficie">
          <div className="sticky top-0 z-10 grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-borda bg-superficie">
            <span />
            {dias.map((d) => {
              const ehHoje = mesmoDiaLocal(d, hoje)
              return (
                <div key={d.toISOString()} className="border-l border-borda px-2 py-2 text-center">
                  <p className="text-legenda text-texto-3 uppercase">{d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</p>
                  <p
                    className={`mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-pequeno font-semibold ${
                      ehHoje ? 'bg-primaria text-white' : 'text-texto'
                    }`}
                  >
                    {d.getDate()}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="relative grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
            <div aria-hidden="true">
              {horas.map((h) => (
                <div key={h} style={{ height: ALTURA_HORA }} className="relative">
                  <span className="absolute -top-2 right-2 text-legenda text-texto-3 tabular-nums">{h > horas[0] && `${h}:00`}</span>
                </div>
              ))}
            </div>
            {dias.map((d) => {
              const itens = doDia(d)
              const pos = colunas(itens)
              const ehHoje = mesmoDiaLocal(d, hoje)
              return (
                <div key={d.toISOString()} className="relative border-l border-borda">
                  {horas.map((h) => (
                    <button
                      key={h}
                      type="button"
                      aria-label={`Marcar em ${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })} às ${h}:00`}
                      onClick={() => setAbertura({ inicio: new Date(d.getFullYear(), d.getMonth(), d.getDate(), h) })}
                      style={{ height: ALTURA_HORA }}
                      className="block w-full border-t border-borda/70 first:border-t-0 hover:bg-primaria-suave/50 focus-visible:bg-primaria-suave focus-visible:outline-none"
                    />
                  ))}
                  {ehHoje && hoje.getHours() >= horas[0] && hoje.getHours() <= horas.at(-1)! && (
                    <div aria-hidden="true" style={{ top: topo(hoje) }} className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-erro">
                      <span className="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-erro" />
                    </div>
                  )}
                  {itens.map((c) => {
                    const ini = new Date(c.inicio)
                    const fim = new Date(c.fim)
                    const altura = Math.max(22, topo(fim) - topo(ini) - 2)
                    const p = pos.get(c.id)!
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setAbertura({ compromisso: c })}
                        style={{ top: topo(ini) + 1, height: altura, left: `calc(${(p.col / p.total) * 100}% + 2px)`, width: `calc(${100 / p.total}% - 4px)` }}
                        className={`absolute z-10 overflow-hidden rounded-md px-1.5 py-1 text-left text-legenda leading-tight shadow-sm ${COR[c.status]}`}
                        title={`${c.titulo} · ${horaCurta(c.inicio)}–${horaCurta(c.fim)}`}
                      >
                        <span className="block truncate font-semibold">{c.titulo}</span>
                        {altura > 34 && (
                          <span className="block truncate opacity-80">
                            {horaCurta(c.inicio)}
                            {c.contato ? ` · ${nomeDoContato(c.contato)}` : ''}
                          </span>
                        )}
                        {altura > 50 && nomeResp(c.responsavel_id) && <span className="block truncate opacity-80">{nomeResp(c.responsavel_id)}</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
        {lista && !lista.length && (
          <p className="mt-3 text-center text-pequeno text-texto-3">Nenhum compromisso nesta semana. Clique num horário para marcar.</p>
        )}
      </div>

      {abertura && (
        <ModalCompromisso
          compromisso={abertura.compromisso}
          inicioSugerido={abertura.inicio}
          outros={todos ?? []}
          aoFechar={() => setAbertura(null)}
          aoSalvar={() => {
            setAbertura(null)
            recarregar()
          }}
        />
      )}
    </div>
  )
}
