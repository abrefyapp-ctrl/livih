// src/hooks/useInternalReport.ts
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import type {
  ReportFilters, ReportTicket, InternalKPIs,
  DailyVolume, AgentPerformance, CategoryStat,
} from '@/types/reports'

// ─── Busca tickets (sem joins complexos) ───────────────────────────────────

async function fetchTickets(filters: ReportFilters): Promise<ReportTicket[]> {
  let query = supabase
    .from('tickets')
    .select(`
      id, ticket_number, status, priority, subject,
      category_id, organization_id, customer_id,
      assigned_agent_id, created_at, first_response_at,
      resolved_at, first_response_deadline,
      resolution_deadline, sla_status
    `)
    .eq('organization_id', filters.organizationId)
    .gte('created_at', filters.dateFrom.toISOString())
    .lte('created_at', filters.dateTo.toISOString())

  if (filters.agentId)    query = query.eq('assigned_agent_id', filters.agentId)
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters.status)     query = query.eq('status', filters.status)

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((t: any) => ({
    ...t,
    category_name: null,
    customer_name: null,
    agent_name: null,
    note_types: [],
  }))
}

// Busca nomes dos agentes separadamente
async function fetchAgentNames(orgId: string): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('agents')
    .select('id, name')
    .eq('organization_id', orgId)
  return Object.fromEntries((data ?? []).map((a: any) => [a.id, a.name]))
}

// ─── Cálculos ──────────────────────────────────────────────────────────────

function avg(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null)
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
}

function mins(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return (new Date(b).getTime() - new Date(a).getTime()) / 60_000
}

export function computeKPIs(tickets: ReportTicket[]): InternalKPIs {
  const resolved = tickets.filter(t => ['resolved', 'closed'].includes(t.status))
  const slaOk    = tickets.filter(t => t.sla_status === 'completed')
  const slaFail  = tickets.filter(t => t.sla_status === 'breached')
  const slaDen   = slaOk.length + slaFail.length
  return {
    totalTickets:            tickets.length,
    resolvedTickets:         resolved.length,
    openTickets:             tickets.filter(t => t.status === 'open').length,
    inProgressTickets:       tickets.filter(t => t.status === 'in_progress').length,
    pendingTickets:          tickets.filter(t => t.status === 'pending').length,
    avgFirstResponseMinutes: avg(tickets.map(t => mins(t.created_at, t.first_response_at))),
    avgResolutionMinutes:    avg(resolved.map(t => mins(t.created_at, t.resolved_at))),
    slaCompleted:            slaOk.length,
    slaBreached:             slaFail.length,
    slaAtRisk:               tickets.filter(t => t.sla_status === 'at_risk').length,
    overdueTickets:          tickets.filter(t => !t.resolved_at && t.resolution_deadline && new Date(t.resolution_deadline) < new Date()).length,
    slaCompliancePct:        slaDen > 0 ? Math.round((slaOk.length / slaDen) * 100) : null,
  }
}

export function computeDailyVolume(tickets: ReportTicket[]): DailyVolume[] {
  const map = new Map<string, { opened: number; resolved: number }>()
  for (const t of tickets) {
    const day = format(new Date(t.created_at), 'yyyy-MM-dd')
    if (!map.has(day)) map.set(day, { opened: 0, resolved: 0 })
    map.get(day)!.opened++
    if (t.resolved_at) {
      const rd = format(new Date(t.resolved_at), 'yyyy-MM-dd')
      if (!map.has(rd)) map.set(rd, { opened: 0, resolved: 0 })
      map.get(rd)!.resolved++
    }
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, ...v }))
}

export function computeAgentPerformance(
  tickets: ReportTicket[],
  agentNames: Record<string, string> = {},
): AgentPerformance[] {
  const map = new Map<string, ReportTicket[]>()
  for (const t of tickets) {
    if (!t.assigned_agent_id) continue
    if (!map.has(t.assigned_agent_id)) map.set(t.assigned_agent_id, [])
    map.get(t.assigned_agent_id)!.push(t)
  }
  return Array.from(map.entries()).map(([id, ts]) => {
    const resolved = ts.filter(t => ['resolved', 'closed'].includes(t.status))
    const slaMet   = ts.filter(t => t.sla_status === 'completed')
    const slaFail  = ts.filter(t => t.sla_status === 'breached')
    const slaDen   = slaMet.length + slaFail.length
    return {
      agentId: id,
      agentName: agentNames[id] ?? id.slice(0, 8),
      agentEmail: '',
      total: ts.length,
      resolved: resolved.length,
      avgFirstResponseMinutes: avg(ts.map(t => mins(t.created_at, t.first_response_at))),
      avgResolutionMinutes: avg(resolved.map(t => mins(t.created_at, t.resolved_at))),
      slaMet: slaMet.length,
      slaBreached: slaFail.length,
      resolutionRate: ts.length > 0 ? Math.round((resolved.length / ts.length) * 100) : 0,
      slaCompliancePct: slaDen > 0 ? Math.round((slaMet.length / slaDen) * 100) : null,
    }
  }).sort((a, b) => b.total - a.total)
}

export function computeCategories(tickets: ReportTicket[]): CategoryStat[] {
  const map = new Map<string, { name: string; total: number; resolved: number }>()
  for (const t of tickets) {
    const key  = t.category_id ?? '__none__'
    const name = t.category_name ?? (t.category_id ? `Cat. ${String(t.category_id).slice(0, 6)}` : 'Sem categoria')
    if (!map.has(key)) map.set(key, { name, total: 0, resolved: 0 })
    const e = map.get(key)!
    e.total++
    if (['resolved', 'closed'].includes(t.status)) e.resolved++
  }
  const entries = Array.from(map.entries())
    .map(([id, { name, total, resolved }]) => ({
      categoryId: id === '__none__' ? null : id,
      categoryName: name, total, resolved, pct: 0,
    }))
    .sort((a, b) => b.total - a.total)
  const grand = entries.reduce((s, e) => s + e.total, 0)
  return entries.map(e => ({ ...e, pct: grand > 0 ? Math.round((e.total / grand) * 100) : 0 }))
}

// ─── Hook principal ────────────────────────────────────────────────────────

export function useInternalReport(filters: ReportFilters) {
  const ticketsQuery = useQuery({
    queryKey: ['internal-report-tickets', filters],
    queryFn: () => fetchTickets(filters),
    staleTime: 2 * 60 * 1000,
    enabled: !!filters.organizationId && filters.organizationId !== 'SEU_ORGANIZATION_ID_AQUI',
  })

  const agentsQuery = useQuery({
    queryKey: ['agent-names', filters.organizationId],
    queryFn: () => fetchAgentNames(filters.organizationId),
    staleTime: 10 * 60 * 1000,
    enabled: !!filters.organizationId && filters.organizationId !== 'SEU_ORGANIZATION_ID_AQUI',
  })

  const tickets    = ticketsQuery.data ?? []
  const agentNames = agentsQuery.data  ?? {}

  return {
    isLoading:        ticketsQuery.isLoading,
    isError:          ticketsQuery.isError,
    refetch:          ticketsQuery.refetch,
    tickets,
    kpis:             computeKPIs(tickets),
    dailyVolume:      computeDailyVolume(tickets),
    agentPerformance: computeAgentPerformance(tickets, agentNames),
    categories:       computeCategories(tickets),
  }
}
