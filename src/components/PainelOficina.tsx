import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { moeda } from '../services/formato'
import { buscarPainel, data, hojeIso, ROTULO_DESFECHO, somarDias, type Desfecho, type PainelOs } from '../services/os'
import { Aviso } from './Aviso'
import { Icone } from './Icone'

const PERIODOS = [
  { dias: 30, rotulo: 'Últimos 30 dias' },
  { dias: 90, rotulo: 'Últimos 90 dias' },
  { dias: 180, rotulo: 'Últimos 180 dias' },
  { dias: 365, rotulo: 'Últimos 12 meses' },
]

const dias = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${Number(n) === 1 ? 'dia' : 'dias'}`

/**
 * Painel da oficina (dono e admin): o que está em cada etapa, o que está parado, tempo de cada etapa, faturamento
 * e a previsão de caixa. As contas são do banco (os_painel); previsão é sempre estimativa.
 */
export function PainelOficina({ orgId, versao }: { orgId: string; versao: number }) {
  const [periodo, setPeriodo] = useState(90)
  const [dados, setDados] = useState<{ chave: string; painel: PainelOs } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const chave = `${orgId}|${periodo}|${versao}`
  useEffect(() => {
    let ativo = true
    const ate = hojeIso()
    buscarPainel(orgId, somarDias(ate, -periodo), ate)
      .then((painel) => ativo && (setDados({ chave, painel }), setErro(null)))
      .catch((e) => ativo && setErro((e as Error).message))
    return () => {
      ativo = false
    }
  }, [orgId, periodo, chave])

  const p = dados?.chave === chave ? dados.painel : null
  const maxEtapa = Math.max(1, ...(p?.etapas.map((e) => e.itens) ?? []))
  const maxCaixa = Math.max(1, ...(p?.caixa.map((c) => c.confirmado + c.previsto) ?? []))
  const maxSemana = Math.max(1, ...(p?.por_semana.map((s) => Math.max(s.recebidos, s.finalizados)) ?? []))
  const totalAprov = p?.aprovacao ? p.aprovacao.aprovados + p.aprovacao.nao_aprovados : 0

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Período"
          value={periodo}
          onChange={(e) => setPeriodo(Number(e.target.value))}
          className="h-9 rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none"
        >
          {PERIODOS.map((x) => (
            <option key={x.dias} value={x.dias}>
              {x.rotulo}
            </option>
          ))}
        </select>
        <p className="text-legenda text-texto-3">Etapas, parados, caixa e a receber são de hoje; o resto, do período.</p>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!p ? (
        !erro && <p className="text-pequeno text-texto-3">Calculando…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cartao titulo="Em andamento" valor={String(p.etapas.reduce((s, e) => s + (e.marco === 'entregue' ? 0 : e.itens), 0))}
              detalhe={`${p.parados.length} parados`} alerta={p.parados.length > 0} />
            <Cartao titulo="Recebidos no período" valor={String(p.recebidos)} detalhe={`${p.finalizados} finalizados`} />
            <Cartao titulo="Faturado no período" valor={moeda(p.financeiro.faturado)} detalhe={`${moeda(p.financeiro.recebido)} recebidos`} />
            <Cartao titulo="A receber" valor={moeda(p.financeiro.vencido + p.financeiro.a_vencer)}
              detalhe={p.financeiro.vencido ? `${moeda(p.financeiro.vencido)} vencidos` : 'nada vencido'} alerta={p.financeiro.vencido > 0} />
          </div>

          <Secao
            titulo="Previsão de caixa"
            subtitulo="O que entra até daqui a 15, 30, 60 e 90 dias. Confirmado: já faturado, pelo vencimento. Previsto: em andamento, pelo tempo normal de cada etapa e o prazo do cliente (estimativa)."
          >
            <ul className="space-y-2">
              {p.caixa.map((c) => (
                <li key={c.dias} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-pequeno">
                  <span className="text-texto-2">até {data(somarDias(hojeIso(), c.dias), true)}</span>
                  <span className="flex h-4 overflow-hidden rounded-sm bg-fundo" aria-hidden="true">
                    <span className="h-4 bg-primaria" style={{ width: `${(c.confirmado / maxCaixa) * 100}%` }} />
                    <span className="h-4 bg-verde-400" style={{ width: `${(c.previsto / maxCaixa) * 100}%` }} />
                  </span>
                  <span className="w-48 text-right tabular-nums">
                    <strong>{moeda(c.confirmado + c.previsto)}</strong>
                    <span className="block text-legenda text-texto-3">
                      {moeda(c.confirmado)} confirmado · {moeda(c.previsto)} previsto
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-legenda text-texto-3">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primaria" /> Confirmado</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-verde-400" /> Previsto</span>
              {p.em_orcamento.itens > 0 && (
                <span>Fora da conta: {p.em_orcamento.itens} em orçamento ({moeda(p.em_orcamento.valor)}), ainda sem aprovação.</span>
              )}
              {p.financeiro.sem_faturar > 0 && <span>{moeda(p.financeiro.sem_faturar)} prontos e ainda sem faturar.</span>}
            </div>
          </Secao>

          <div className="grid gap-5 lg:grid-cols-2">
            <Secao titulo="Por etapa, agora" subtitulo="Itens em andamento e o tempo normal de cada etapa no período (mediana).">
              <ul className="space-y-1.5">
                {p.etapas.map((e) => (
                  <li key={e.id} className="grid grid-cols-[8rem_1fr_auto] items-center gap-2 text-pequeno">
                    <span className="truncate text-texto-2" title={e.nome}>{e.nome}</span>
                    <span className="h-3 rounded-sm bg-fundo" aria-hidden="true">
                      <span className="block h-3 rounded-r-sm bg-primaria" style={{ width: `${(e.itens / maxEtapa) * 100}%` }} />
                    </span>
                    <span className="w-40 text-right tabular-nums">
                      {e.itens}
                      {e.parados > 0 && <span className="text-atencao"> ({e.parados} parados)</span>}
                      <span className="block text-legenda text-texto-3">
                        {e.marco === 'entregue' ? '' : e.passagens ? `normal ${dias(e.mediana_dias)}` : 'sem histórico'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Secao>

            <Secao titulo="Do recebimento ao finalizado" subtitulo="Itens que ficaram prontos no período, por tipo (mediana).">
              {p.tipos.length ? (
                <ul className="divide-y divide-borda text-pequeno">
                  {p.tipos.map((t) => (
                    <li key={t.tipo_id ?? 'sem'} className="flex items-center justify-between gap-2 py-1.5">
                      <span>{t.nome}</span>
                      <span className="tabular-nums">
                        {dias(t.mediana_dias)} <span className="text-legenda text-texto-3">· {t.finalizados} itens</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-pequeno text-texto-3">Nenhum item finalizado no período.</p>
              )}
              {p.aprovacao && totalAprov > 0 && (
                <p className="text-pequeno text-texto-2">
                  Orçamentos aprovados: <strong>{Math.round((p.aprovacao.aprovados / totalAprov) * 100)}%</strong>
                  <span className="text-texto-3"> ({p.aprovacao.aprovados} de {totalAprov})</span>
                </p>
              )}
              {Object.keys(p.desfechos).length > 0 && (
                <p className="text-legenda text-texto-3">
                  Encerrados:{' '}
                  {(Object.entries(p.desfechos) as [Desfecho, number][]).map(([d, n]) => `${ROTULO_DESFECHO[d].toLowerCase()} ${n}`).join(' · ')}
                </p>
              )}
            </Secao>
          </div>

          <Secao titulo="Entradas e saídas por semana" subtitulo="Itens recebidos e finalizados.">
            <div className="flex h-36 items-end gap-1 overflow-x-auto" role="img" aria-label="Recebidos e finalizados por semana">
              {p.por_semana.map((s) => (
                <div key={s.semana} className="flex h-full min-w-6 flex-1 flex-col justify-end" title={`Semana de ${data(s.semana, true)}: ${s.recebidos} recebidos, ${s.finalizados} finalizados`}>
                  <div className="flex flex-1 items-end gap-px">
                    <span className="flex-1 rounded-t-sm bg-slate-300" style={{ height: `${(s.recebidos / maxSemana) * 100}%` }} />
                    <span className="flex-1 rounded-t-sm bg-primaria" style={{ height: `${(s.finalizados / maxSemana) * 100}%` }} />
                  </div>
                  <span className="mt-1 text-center text-[10px] text-texto-3">{data(s.semana, true)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-legenda text-texto-3">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-slate-300" /> Recebidos</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primaria" /> Finalizados</span>
            </div>
          </Secao>

          <Secao titulo="Parados" subtitulo="Há mais tempo na etapa do que o normal dela.">
            {p.parados.length ? (
              <ul className="divide-y divide-borda rounded-md border border-borda">
                {p.parados.map((x) => (
                  <li key={x.item_id}>
                    <Link to={`/os/${x.os_id}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-pequeno hover:bg-fundo">
                      <span className="font-semibold">OS {x.os_numero}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {x.modelo ?? 'Item'}
                        {x.identificacao && <span className="text-texto-3"> · {x.identificacao}</span>}
                        <span className="text-texto-3"> · {x.cliente ?? 'Sem cliente'}</span>
                      </span>
                      <span className="text-legenda text-atencao">
                        {x.etapa}: {x.dias} dias (normal {dias(x.normal)})
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-1.5 text-pequeno text-primaria">
                <Icone nome="check" className="size-4" /> Nada parado.
              </p>
            )}
          </Secao>
        </>
      )}
    </div>
  )
}

function Cartao({ titulo, valor, detalhe, alerta }: { titulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border bg-superficie p-4 ${alerta ? 'border-atencao/50' : 'border-borda'}`}>
      <p className="text-legenda font-medium text-texto-3">{titulo}</p>
      <p className={`mt-1 text-h1 font-semibold tabular-nums ${alerta ? 'text-atencao' : 'text-texto'}`}>{valor}</p>
      {detalhe && <p className="text-legenda text-texto-2">{detalhe}</p>}
    </div>
  )
}

function Secao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
      <div>
        <h2 className="font-semibold">{titulo}</h2>
        {subtitulo && <p className="text-legenda text-texto-3">{subtitulo}</p>}
      </div>
      {children}
    </section>
  )
}
