// src/types/reports.ts
// Tipos centralizados do módulo de relatórios

// ─────────────────────────────────────────────────────────────────────────────
// Filtros
// ─────────────────────────────────────────────────────────────────────────────

export type DatePreset = '7d' | '30d' | '90d' | 'custom'

export interface ReportFilters {
  preset: DatePreset
  dateFrom: Date
  dateTo: Date
  agentId: string | null
  categoryId: string | null
  status: string | null
  organizationId: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticket base (campos usados nos relatórios)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportTicket {
  id: string
  ticket_number: number | null
  status: string
  priority: string | null
  subject: string | null
  category_id: string | null
  category_name: string | null
  organization_id: string
  customer_id: string | null
  customer_name: string | null
  assigned_agent_id: string | null
  agent_name: string | null
  created_at: string
  first_response_at: string | null
  resolved_at: string | null
  first_response_deadline: string | null
  resolution_deadline: string | null
  sla_status: string | null
  note_types: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIs internos
// ─────────────────────────────────────────────────────────────────────────────

export interface InternalKPIs {
  totalTickets: number
  resolvedTickets: number
  openTickets: number
  inProgressTickets: number
  pendingTickets: number
  avgFirstResponseMinutes: number | null
  avgResolutionMinutes: number | null
  slaCompleted: number
  slaBreached: number
  slaAtRisk: number
  overdueTickets: number
  slaCompliancePct: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume por dia
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyVolume {
  day: string       // YYYY-MM-DD
  opened: number
  resolved: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Performance por agente
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentPerformance {
  agentId: string
  agentName: string
  agentEmail: string
  total: number
  resolved: number
  avgFirstResponseMinutes: number | null
  avgResolutionMinutes: number | null
  slaMet: number
  slaBreached: number
  resolutionRate: number   // %
  slaCompliancePct: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Distribuição por categoria
// ─────────────────────────────────────────────────────────────────────────────

export interface CategoryStat {
  categoryId: string | null
  categoryName: string
  total: number
  resolved: number
  pct: number
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIs para o cliente
// ─────────────────────────────────────────────────────────────────────────────

export interface CustomerKPIs {
  totalTickets: number
  resolvedTickets: number
  openTickets: number
  avgFirstResponseMinutes: number | null
  avgResolutionMinutes: number | null
  slaCompliancePct: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Token de relatório do cliente
// ─────────────────────────────────────────────────────────────────────────────

export interface CustomerReportToken {
  id: string
  organization_id: string
  customer_id: string | null
  label: string
  expires_at: string | null
  is_active: boolean
  created_at: string
  customer_name?: string | null
}

export interface CustomerReportContext {
  organizationId: string
  organizationName: string
  customerId: string | null
  customerName: string | null
  label: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formatação (constantes)
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  pending: 'Pendente',
  resolved: 'Resolvido',
  closed: 'Fechado',
}

export const SLA_STATUS_LABELS: Record<string, string> = {
  within_sla: 'No prazo',
  at_risk: 'Em risco',
  breached: 'Violado',
  paused: 'Pausado',
  completed: 'Cumprido',
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
}
