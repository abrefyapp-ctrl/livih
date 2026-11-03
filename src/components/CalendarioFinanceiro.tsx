import { useEffect, useMemo, useState } from 'react'
import { listarCalendario, quemDoLancamento, rotuloParcela, vencidosAntes, type Categoria, type Conta, type Lancamento } from '../services/financeiro'
import { moeda } from '../services/formato'
import { hojeIso, somarDias } from '../services/os'
import { Aviso } from './Aviso'
import { Icone } from './Icone'
import { EtiquetaSituacao, ModalDetalheLancamento } from './ModaisFinanceiro'

// Pedido de 03/11 (JoGrampo): ver o mês num calendário, com o que vence a receber e a pagar em cada dia.

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** 'AAAA-MM' somado de n meses. */
function somarMes(mes: string, n: number) {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7)
}

const nomeMes = (mes: string) =>
  new Date(`${mes}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const diaPorExtenso = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

/** Dias da grade: do domingo antes do dia 1 ao sábado depois do último dia do mês. */
function diasDaGrade(mes: string): string[] {
  const [a, m] = mes.split('-').map(Number)
  const semanaDoPrimeiro = new Date(Date.UTC(a, m - 1, 1)).getUTCDay()
  const diasNoMes = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const inicio = somarDias(`${mes}-01`, -semanaDoPrimeiro)
  return Array.from({ length: Math.ceil((semanaDoPrimeiro + diasNoMes) / 7) * 7 }, (_, i) => somarDias(inicio, i))
}

type Resumo = { receber: number; pagar: number; vencido: boolean }

export function CalendarioFinanceiro({ orgId, contas, categorias, aoMudar }: {
  orgId: string
  contas: Conta[]
  categorias: Categoria[]
  aoMudar: () => void
}) {
  const hoje = hojeIso()
  const [mes, setMes] = useState(hoje.slice(0, 7))
  const [dia, setDia] = useState(hoje)
  const [versao, setVersao] = useState(0)
  const [dados, setDados] = useState<{ chave: string; lista: Lancamento[]; antes: { receber: number; pagar: number } } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)

  const dias = useMemo(() => diasDaGrade(mes), [mes])
  const chave = `${orgId}|${mes}|${versao}`
  useEffect(() => {
    let ativo = true
    Promise.all([listarCalendario(orgId, dias[0], dias[dias.length - 1]), vencidosAntes(orgId, `${mes}-01`)])
      .then(([lista, antes]) => ativo && (setDados({ chave, lista, antes }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar o calendário.'))
    return () => {
      ativo = false
    }
  }, [orgId, mes, dias, chave])

  const lista = dados?.chave === chave ? dados.lista : null
  const porDia = useMemo(() => {
    const m = new Map<string, Resumo>()
    for (const l of lista ?? []) {
      const r = m.get(l.vencimento) ?? { receber: 0, pagar: 0, vencido: false }
      r[l.tipo as 'receber' | 'pagar'] += Number(l.valor)
      if (l.situacao === 'vencido') r.vencido = true
      m.set(l.vencimento, r)
    }
    return m
  }, [lista])

  // Só os dias do mês (a grade mostra também o fim do anterior e o começo do próximo).
  const totaisMes = useMemo(() => {
    const t = { receber: 0, recebido: 0, pagar: 0, pago: 0 }
    for (const l of lista ?? []) {
      if (!l.vencimento.startsWith(mes)) continue
      if (l.tipo === 'receber') {
        t.receber += Number(l.valor)
        t.recebido += Number(l.valor_pago)
      } else {
        t.pagar += Number(l.valor)
        t.pago += Number(l.valor_pago)
      }
    }
    return t
  }, [lista, mes])

  const doDia = (lista ?? []).filter((l) => l.vencimento === dia)
  const resumoDia = porDia.get(dia)
  const selecionado = (lista ?? []).find((l) => l.id === aberto) ?? null
  const antes = dados?.chave === chave ? dados.antes : null

  function irPara(novoMes: string) {
    setMes(novoMes)
    setDia(novoMes === hoje.slice(0, 7) ? hoje : `${novoMes}-01`)
  }

  return (
    <div className="flex-1 space-y-3 overflow-auto px-4 pb-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => irPara(somarMes(mes, -1))}
          aria-label="Mês anterior"
          className="inline-flex size-9 items-center justify-center rounded-md border border-borda bg-superficie hover:bg-fundo"
        >
          <Icone nome="voltar" className="size-4" />
        </button>
        <h2 className="min-w-40 text-center text-h2 font-semibold first-letter:uppercase">{nomeMes(mes)}</h2>
        <button
          onClick={() => irPara(somarMes(mes, 1))}
          aria-label="Próximo mês"
          className="inline-flex size-9 items-center justify-center rounded-md border border-borda bg-superficie hover:bg-fundo"
        >
          <Icone nome="voltar" className="size-4 rotate-180" />
        </button>
        {mes !== hoje.slice(0, 7) && (
          <button onClick={() => irPara(hoje.slice(0, 7))} className="rounded-md px-3 py-2 text-pequeno font-medium text-primaria hover:bg-primaria-suave">
            Hoje
          </button>
        )}
      </div>

      {lista && (
        <p className="text-pequeno text-texto-2">
          No mês, a receber: <strong className="text-primaria tabular-nums">{moeda(totaisMes.receber, true)}</strong>
          {totaisMes.recebido > 0 && <span className="text-texto-3"> (recebido {moeda(totaisMes.recebido, true)})</span>}
          {' · '}a pagar: <strong className="text-atencao tabular-nums">{moeda(totaisMes.pagar, true)}</strong>
          {totaisMes.pago > 0 && <span className="text-texto-3"> (pago {moeda(totaisMes.pago, true)})</span>}
          {' · '}saldo: <strong className="text-texto tabular-nums">{moeda(totaisMes.receber - totaisMes.pagar, true)}</strong>
        </p>
      )}
      {antes && (antes.receber > 0 || antes.pagar > 0) && (
        <Aviso tom="atencao">
          Vencidos antes de {nomeMes(mes)}, ainda em aberto:
          {antes.receber > 0 && ` a receber ${moeda(antes.receber, true)}`}
          {antes.receber > 0 && antes.pagar > 0 && ' ·'}
          {antes.pagar > 0 && ` a pagar ${moeda(antes.pagar, true)}`}. Veja em A receber ou A pagar → Vencidos.
        </Aviso>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {/* minmax(0, …): sem isso a descrição longa (truncate) da lista do dia alarga a coluna e a grade passa da tela no celular. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div>
          <div className="grid grid-cols-7 overflow-hidden rounded-lg border-t border-l border-borda">
            {DIAS_SEMANA.map((d) => (
              <span key={d} className="border-r border-b border-borda bg-fundo py-1.5 text-center text-legenda font-medium text-texto-3 uppercase">
                {d}
              </span>
            ))}
            {dias.map((d) => {
              const r = porDia.get(d)
              const fora = !d.startsWith(mes)
              const ativo = d === dia
              return (
                <button
                  key={d}
                  onClick={() => setDia(d)}
                  aria-pressed={ativo}
                  aria-label={`${diaPorExtenso(d)}${r?.receber ? `, a receber ${moeda(r.receber, true)}` : ''}${r?.pagar ? `, a pagar ${moeda(r.pagar, true)}` : ''}${r?.vencido ? ', com vencido' : ''}`}
                  className={`flex min-h-14 min-w-0 flex-col gap-0.5 border-r border-b border-borda p-1 text-left sm:min-h-24 sm:p-1.5 ${
                    fora ? 'bg-fundo text-texto-3' : 'bg-superficie'
                  } ${ativo ? 'ring-2 ring-primaria ring-inset' : 'hover:bg-primaria-suave'}`}
                >
                  <span className="flex items-center gap-1">
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full text-legenda tabular-nums ${
                        d === hoje ? 'bg-primaria font-semibold text-white' : ''
                      }`}
                    >
                      {Number(d.slice(8))}
                    </span>
                    {r?.vencido && <span className="size-1.5 rounded-full bg-erro" title="Tem vencido em aberto" />}
                  </span>
                  {/* No celular a célula é estreita: só os pontos; os valores aparecem na lista do dia. */}
                  {r && (
                    <span className="flex gap-1 px-1 sm:hidden">
                      {r.receber > 0 && <span className="size-2 rounded-full bg-primaria" />}
                      {r.pagar > 0 && <span className="size-2 rounded-full bg-atencao" />}
                    </span>
                  )}
                  {r && r.receber > 0 && (
                    <span className="hidden truncate text-legenda font-medium text-primaria tabular-nums sm:block">+{moeda(r.receber)}</span>
                  )}
                  {r && r.pagar > 0 && (
                    <span className="hidden truncate text-legenda font-medium text-atencao tabular-nums sm:block">−{moeda(r.pagar)}</span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-legenda text-texto-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primaria" /> a receber
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-atencao" /> a pagar
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-erro" /> vencido em aberto
            </span>
            <span>Valores pelo vencimento, pagos ou não.</span>
          </p>
        </div>

        <section className="rounded-lg border border-borda bg-superficie" aria-live="polite">
          <header className="border-b border-borda px-4 py-3">
            <h3 className="font-medium first-letter:uppercase">{diaPorExtenso(dia)}</h3>
            {resumoDia && (
              <p className="text-legenda text-texto-3">
                {resumoDia.receber > 0 && <>A receber <strong className="text-primaria tabular-nums">{moeda(resumoDia.receber, true)}</strong></>}
                {resumoDia.receber > 0 && resumoDia.pagar > 0 && ' · '}
                {resumoDia.pagar > 0 && <>A pagar <strong className="text-atencao tabular-nums">{moeda(resumoDia.pagar, true)}</strong></>}
              </p>
            )}
          </header>
          {!lista ? (
            <p className="px-4 py-3 text-pequeno text-texto-3">Carregando…</p>
          ) : !doDia.length ? (
            <p className="px-4 py-3 text-pequeno text-texto-3">Nada vence neste dia.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {doDia.map((l) => {
                const receber = l.tipo === 'receber'
                return (
                  <li key={l.id}>
                    <button onClick={() => setAberto(l.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fundo">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {l.descricao}
                          <span className="font-normal text-texto-3">{rotuloParcela(l)}</span>
                        </span>
                        <span className="block truncate text-legenda text-texto-3">
                          {receber ? 'A receber' : 'A pagar'}
                          {quemDoLancamento(l) && ` · ${quemDoLancamento(l)}`}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`font-medium tabular-nums ${receber ? 'text-primaria' : 'text-atencao'}`}>
                          {receber ? '+' : '−'}
                          {moeda(Number(l.valor), true)}
                        </span>
                        <EtiquetaSituacao situacao={l.situacao} emParte={Number(l.valor_pago) > 0} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {selecionado && (
        <ModalDetalheLancamento
          key={`${selecionado.id}|${selecionado.atualizado_em}`}
          orgId={orgId}
          lancamento={selecionado}
          contas={contas}
          categorias={categorias}
          aoFechar={() => setAberto(null)}
          aoMudar={() => {
            setVersao((v) => v + 1)
            aoMudar()
          }}
        />
      )}
    </div>
  )
}
