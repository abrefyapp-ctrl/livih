// src/pages/InternalReportPage.tsx
import { useRef, useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/integrations/supabase/client'
import {
  TrendingUp, Clock, CheckCircle2,
  AlertTriangle, Users, Download,
  FileText, Printer, Tag, ShieldCheck,
  Timer, Inbox, XCircle, Activity,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { KPICard } from '@/components/reports/KPICard'
import { ReportFilters } from '@/components/reports/ReportFilters'
import { VolumeChart } from '@/components/reports/charts/VolumeChart'
import { SlaDonutChart } from '@/components/reports/charts/SlaDonutChart'
import { CategoryBarChart } from '@/components/reports/charts/CategoryBarChart'
import { AgentPerformanceTable } from '@/components/reports/AgentPerformanceTable'
import { TokenManager } from '@/components/reports/TokenManager'
import { useReportFilters } from '@/hooks/useReportFilters'
import { useInternalReport } from '@/hooks/useInternalReport'
import { printReport, exportToCSV, TICKET_CSV_COLUMNS, formatMinutes } from '@/lib/reports/exportReport'
import { useAuth } from '@/contexts/AuthContext'

export default function InternalReportPage() {
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState('')
  const [currentAgentId, setCurrentAgentId] = useState('')

  useEffect(() => {
    if (!user) return
    supabase
      .from('agents')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setOrganizationId(data.organization_id)
          setCurrentAgentId(data.id)
        }
      })
  }, [user])

  const printRef = useRef<HTMLDivElement>(null)

  const {
    filters, preset, dateFrom, dateTo,
    agentId, categoryId, status,
    setPreset, setCustomFrom, setCustomTo,
    setAgentId, setCategoryId, setStatus, reset,
  } = useReportFilters(organizationId)

  const { isLoading, kpis, dailyVolume, agentPerformance, categories, tickets } =
    useInternalReport(filters)

  const periodLabel = `${format(dateFrom, "dd/MM/yyyy", { locale: ptBR })} – ${format(dateTo, "dd/MM/yyyy", { locale: ptBR })}`

  function handleExportCSV() {
    exportToCSV(
      tickets.map(t => ({
        ...t,
        created_at:  format(new Date(t.created_at), 'dd/MM/yyyy HH:mm'),
        resolved_at: t.resolved_at ? format(new Date(t.resolved_at), 'dd/MM/yyyy HH:mm') : '',
      })),
      TICKET_CSV_COLUMNS,
      `relatorio-${format(dateFrom, 'yyyy-MM-dd')}_${format(dateTo, 'yyyy-MM-dd')}.csv`,
    )
  }

  return (
    <div id="report-print-root" ref={printRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4 print:py-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Relatórios
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{periodLabel}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 print:hidden">
                <Download className="h-3.5 w-3.5" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => printReport(`Relatório ${periodLabel}`)}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir / Salvar PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileText className="h-4 w-4 mr-2" />
                Exportar CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-4 print:hidden">
          <ReportFilters
            preset={preset}
            dateFrom={dateFrom}
            dateTo={dateTo}
            agentId={agentId}
            categoryId={categoryId}
            status={status}
            showAgentFilter={true}
            onPreset={setPreset}
            onCustomFrom={setCustomFrom}
            onCustomTo={setCustomTo}
            onAgent={setAgentId}
            onCategory={setCategoryId}
            onStatus={setStatus}
            onReset={reset}
          />
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 px-6 py-6 space-y-6">
        <Tabs defaultValue="overview">
          <TabsList className="print:hidden">
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="sla">SLA</TabsTrigger>
            <TabsTrigger value="agents">Agentes</TabsTrigger>
            <TabsTrigger value="categories">Categorias</TabsTrigger>
            <TabsTrigger value="portal">Portal do cliente</TabsTrigger>
          </TabsList>

          {/* VISÃO GERAL */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
              <KPICard title="Total de chamados" value={isLoading ? '…' : kpis.totalTickets} icon={Inbox} />
              <KPICard
                title="Resolvidos"
                value={isLoading ? '…' : kpis.resolvedTickets}
                subtitle={kpis.totalTickets > 0 ? `${Math.round(kpis.resolvedTickets / kpis.totalTickets * 100)}% do total` : undefined}
                icon={CheckCircle2}
                variant="success"
              />
              <KPICard
                title="Em aberto"
                value={isLoading ? '…' : kpis.openTickets + kpis.inProgressTickets + kpis.pendingTickets}
                icon={Activity}
                variant={kpis.openTickets + kpis.inProgressTickets > 10 ? 'warning' : 'default'}
              />
              <KPICard title="1ª resposta" value={isLoading ? '…' : formatMinutes(kpis.avgFirstResponseMinutes)} subtitle="tempo médio" icon={Clock} variant="info" />
              <KPICard title="Resolução" value={isLoading ? '…' : formatMinutes(kpis.avgResolutionMinutes)} subtitle="tempo médio" icon={Timer} />
              <KPICard
                title="Em atraso"
                value={isLoading ? '…' : kpis.overdueTickets}
                subtitle="prazo vencido"
                icon={AlertTriangle}
                variant={kpis.overdueTickets > 0 ? 'danger' : 'default'}
              />
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold mb-4">Volume de chamados por dia</h2>
              {isLoading ? <div className="h-[260px] rounded-lg bg-muted animate-pulse" /> : <VolumeChart data={dailyVolume} />}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border bg-card p-5">
                <h2 className="text-sm font-semibold mb-4">SLA por status</h2>
                {isLoading ? <div className="h-[240px] rounded-lg bg-muted animate-pulse" /> : (
                  <SlaDonutChart
                    completed={kpis.slaCompleted}
                    breached={kpis.slaBreached}
                    atRisk={kpis.slaAtRisk}
                    withinSla={kpis.totalTickets - kpis.slaCompleted - kpis.slaBreached - kpis.slaAtRisk}
                  />
                )}
              </div>
              <div className="rounded-xl border bg-card p-5">
                <h2 className="text-sm font-semibold mb-4">Top categorias</h2>
                {isLoading ? <div className="h-[240px] rounded-lg bg-muted animate-pulse" /> : (
                  <CategoryBarChart data={categories} maxItems={6} height={240} />
                )}
              </div>
            </div>
          </TabsContent>

          {/* SLA */}
          <TabsContent value="sla" className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KPICard
                title="Cumprimento SLA"
                value={isLoading ? '…' : kpis.slaCompliancePct !== null ? `${kpis.slaCompliancePct}%` : '—'}
                subtitle="dos chamados resolvidos"
                icon={ShieldCheck}
                variant={
                  kpis.slaCompliancePct === null ? 'default' :
                  kpis.slaCompliancePct >= 90    ? 'success' :
                  kpis.slaCompliancePct >= 70    ? 'warning' : 'danger'
                }
              />
              <KPICard title="SLA cumprido" value={isLoading ? '…' : kpis.slaCompleted} icon={CheckCircle2} variant="success" />
              <KPICard title="SLA em risco" value={isLoading ? '…' : kpis.slaAtRisk} icon={AlertTriangle} variant={kpis.slaAtRisk > 0 ? 'warning' : 'default'} />
              <KPICard title="SLA violado" value={isLoading ? '…' : kpis.slaBreached} icon={XCircle} variant={kpis.slaBreached > 0 ? 'danger' : 'default'} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border bg-card p-5">
                <h2 className="text-sm font-semibold mb-4">Distribuição de SLA</h2>
                {isLoading ? <div className="h-[280px] rounded-lg bg-muted animate-pulse" /> : (
                  <SlaDonutChart
                    completed={kpis.slaCompleted}
                    breached={kpis.slaBreached}
                    atRisk={kpis.slaAtRisk}
                    withinSla={kpis.totalTickets - kpis.slaCompleted - kpis.slaBreached - kpis.slaAtRisk}
                    height={280}
                  />
                )}
              </div>
              <div className="rounded-xl border bg-card p-5 space-y-4">
                <h2 className="text-sm font-semibold">Tempos médios</h2>
                <Separator />
                <div className="space-y-3">
                  {[
                    { label: 'Tempo médio de 1ª resposta', value: formatMinutes(kpis.avgFirstResponseMinutes), icon: Clock },
                    { label: 'Tempo médio de resolução',   value: formatMinutes(kpis.avgResolutionMinutes),   icon: Timer },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Icon className="h-4 w-4" />
                        {label}
                      </div>
                      <span className="font-semibold tabular-nums">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* AGENTES */}
          <TabsContent value="agents" className="mt-6">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Performance por agente
              </h2>
              <AgentPerformanceTable data={agentPerformance} isLoading={isLoading} />
            </div>
          </TabsContent>

          {/* CATEGORIAS */}
          <TabsContent value="categories" className="mt-6 space-y-4">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Tag className="h-4 w-4 text-muted-foreground" />
                Distribuição por categoria
              </h2>
              {isLoading ? <div className="h-[320px] rounded-lg bg-muted animate-pulse" /> : (
                <CategoryBarChart data={categories} maxItems={10} height={320} />
              )}
            </div>

            {!isLoading && categories.length > 0 && (
              <div className="rounded-xl border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Categoria</th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Resolvidos</th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Participação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {categories.map(cat => (
                      <tr key={cat.categoryId ?? 'none'} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-medium">{cat.categoryName}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums">{cat.total}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums text-green-600">{cat.resolved}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums">
                          <div className="flex items-center gap-2 justify-center">
                            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${cat.pct}%` }} />
                            </div>
                            <span className="text-xs w-8 text-right">{cat.pct}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* PORTAL DO CLIENTE */}
          <TabsContent value="portal" className="mt-6">
            <div className="rounded-xl border bg-card p-5 max-w-2xl">
              <TokenManager organizationId={organizationId} agentId={currentAgentId} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
