// src/pages/CustomerReportPage.tsx
import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { subDays, startOfDay, endOfDay, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  BarChart2, CheckCircle2, Clock,
  Inbox, Timer, ShieldCheck,
  Printer, AlertCircle, Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KPICard } from '@/components/reports/KPICard'
import { VolumeChart } from '@/components/reports/charts/VolumeChart'
import { CategoryBarChart } from '@/components/reports/charts/CategoryBarChart'
import { SlaDonutChart } from '@/components/reports/charts/SlaDonutChart'
import { useCustomerReportContext, useCustomerReport } from '@/hooks/useCustomerReport'
import { printReport, formatMinutes } from '@/lib/reports/exportReport'
import { cn } from '@/lib/utils'

type Period = '7d' | '30d' | '90d'

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d',  label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
]

function buildPeriod(period: Period) {
  const now = new Date()
  const days = period === '7d' ? 6 : period === '30d' ? 29 : 89
  return { dateFrom: startOfDay(subDays(now, days)), dateTo: endOfDay(now) }
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function InvalidToken() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="h-6 w-6 text-red-500" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Link inválido ou expirado</h1>
        <p className="text-sm text-slate-500">
          Este link de relatório não está mais disponível. Entre em contato com o suporte para obter um novo link.
        </p>
      </div>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      <div className="max-w-5xl mx-auto">
        <div className="h-20 rounded-2xl bg-slate-200 animate-pulse mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 rounded-xl bg-slate-200 animate-pulse" />)}
        </div>
        <div className="h-[280px] rounded-2xl bg-slate-200 animate-pulse" />
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; class: string }> = {
    open:        { label: 'Aberto',       class: 'bg-blue-50 text-blue-700 border-blue-200' },
    in_progress: { label: 'Em andamento', class: 'bg-purple-50 text-purple-700 border-purple-200' },
    pending:     { label: 'Pendente',     class: 'bg-amber-50 text-amber-700 border-amber-200' },
    resolved:    { label: 'Resolvido',    class: 'bg-green-50 text-green-700 border-green-200' },
    closed:      { label: 'Fechado',      class: 'bg-slate-100 text-slate-600 border-slate-200' },
  }
  const { label, class: cls } = config[status] ?? { label: status, class: 'bg-slate-100 text-slate-600 border-slate-200' }
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium border', cls)}>
      {label}
    </span>
  )
}

export default function CustomerReportPage() {
  const { token } = useParams<{ token: string }>()
  const [period, setPeriod] = useState<Period>('30d')
  const { dateFrom, dateTo } = useMemo(() => buildPeriod(period), [period])

  const contextQuery = useCustomerReportContext(token)
  const ctx = contextQuery.data

  const { isLoading, customerKPIs, dailyVolume, categories, tickets } =
    useCustomerReport(ctx ?? null, dateFrom, dateTo)

  const periodLabel = `${format(dateFrom, "dd 'de' MMMM", { locale: ptBR })} – ${format(dateTo, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`

  if (contextQuery.isLoading) return <PageSkeleton />
  if (!ctx || contextQuery.isError) return <InvalidToken />

  const resolvedPct = customerKPIs.totalTickets > 0
    ? Math.round(customerKPIs.resolvedTickets / customerKPIs.totalTickets * 100)
    : null

  return (
    <div id="report-print-root" className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b print:border-0">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold text-slate-900">Relatório de Atendimento</h1>
              </div>
              {ctx.customerName ? (
                <p className="text-sm text-slate-500">{ctx.customerName} · {ctx.organizationName}</p>
              ) : (
                <p className="text-sm text-slate-500">{ctx.organizationName}</p>
              )}
              <p className="text-xs text-slate-400 flex items-center gap-1 pt-0.5">
                <Calendar className="h-3 w-3" />
                {periodLabel}
              </p>
            </div>

            <div className="flex items-center gap-3 print:hidden">
              <div className="flex items-center rounded-lg border bg-white overflow-hidden shadow-sm">
                {PERIODS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPeriod(p.value)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium transition-colors',
                      period === p.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" className="gap-1.5"
                onClick={() => printReport(`Relatório ${ctx.organizationName} ${periodLabel}`)}>
                <Printer className="h-3.5 w-3.5" />
                PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KPICard title="Total de chamados" value={isLoading ? '…' : customerKPIs.totalTickets} icon={Inbox} />
          <KPICard
            title="Resolvidos"
            value={isLoading ? '…' : customerKPIs.resolvedTickets}
            subtitle={resolvedPct !== null ? `${resolvedPct}% do total` : undefined}
            icon={CheckCircle2}
            variant="success"
          />
          <KPICard
            title="Em aberto"
            value={isLoading ? '…' : customerKPIs.openTickets}
            icon={ActivityIcon as any}
            variant={customerKPIs.openTickets > 5 ? 'warning' : 'default'}
          />
          <KPICard title="Tempo de resposta" value={isLoading ? '…' : formatMinutes(customerKPIs.avgFirstResponseMinutes)} subtitle="1ª resposta (média)" icon={Clock} variant="info" />
          <KPICard title="Tempo de resolução" value={isLoading ? '…' : formatMinutes(customerKPIs.avgResolutionMinutes)} subtitle="média" icon={Timer} />
          <KPICard
            title="Cumprimento SLA"
            value={isLoading ? '…' : customerKPIs.slaCompliancePct !== null ? `${customerKPIs.slaCompliancePct}%` : '—'}
            subtitle="dos chamados resolvidos"
            icon={ShieldCheck}
            variant={
              customerKPIs.slaCompliancePct === null ? 'default' :
              customerKPIs.slaCompliancePct >= 90    ? 'success' :
              customerKPIs.slaCompliancePct >= 70    ? 'warning' : 'danger'
            }
          />
        </div>

        {/* Volume */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Volume de chamados no período</h2>
          {isLoading ? <div className="h-[260px] rounded-xl bg-slate-100 animate-pulse" /> : <VolumeChart data={dailyVolume} />}
        </div>

        {/* SLA + Categorias */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Status dos chamados por SLA</h2>
            {isLoading ? <div className="h-[240px] rounded-xl bg-slate-100 animate-pulse" /> : (
              <SlaDonutChart
                completed={tickets.filter(t => t.sla_status === 'completed').length}
                breached={tickets.filter(t => t.sla_status === 'breached').length}
                atRisk={tickets.filter(t => t.sla_status === 'at_risk').length}
                withinSla={tickets.filter(t => t.sla_status === 'within_sla').length}
              />
            )}
          </div>
          {categories.length > 0 && (
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Principais assuntos</h2>
              {isLoading ? <div className="h-[240px] rounded-xl bg-slate-100 animate-pulse" /> : (
                <CategoryBarChart data={categories} maxItems={6} height={240} />
              )}
            </div>
          )}
        </div>

        {/* Tabela */}
        {!isLoading && tickets.length > 0 && (
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b">
              <h2 className="text-sm font-semibold text-slate-800">Chamados recentes</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Nº</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Assunto</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500">Status</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500">Aberto em</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-500">Resolvido em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.slice(0, 20).map(t => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 tabular-nums text-slate-400 text-xs">#{t.ticket_number ?? '—'}</td>
                      <td className="px-4 py-2.5 max-w-[260px] truncate text-slate-700">{t.subject ?? 'Sem assunto'}</td>
                      <td className="px-4 py-2.5 text-center"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-2.5 text-center text-xs text-slate-500 tabular-nums">
                        {format(new Date(t.created_at), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs text-slate-500 tabular-nums">
                        {t.resolved_at ? format(new Date(t.resolved_at), 'dd/MM/yyyy') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4 pb-8">
          <p className="text-xs text-slate-400">
            Relatório gerado automaticamente · {ctx.organizationName} ·{' '}
            {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>
    </div>
  )
}
