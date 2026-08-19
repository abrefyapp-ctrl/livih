// src/hooks/useCustomerReport.ts
// Valida token de relatório do cliente e agrega métricas visíveis

import { useQuery } from '@tanstack/react-query'
import { subDays, startOfDay, endOfDay } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import { computeKPIs, computeDailyVolume, computeCategories } from './useInternalReport'
import type {
  CustomerReportContext,
  CustomerKPIs,
  DailyVolume,
  CategoryStat,
  ReportTicket,
} from '@/types/reports'

// ─────────────────────────────────────────────────────────────────────────────
// Valida o token via RPC
// ─────────────────────────────────────────────────────────────────────────────

async function validateToken(token: string): Promise<CustomerReportContext | null> {
  const { data, error } = await supabase
    .rpc('validate_customer_report_token', { p_token: token })
    .single<any>()

  if (error || !data) return null

  return {
    organizationId:   data.organization_id,
    organizationName: data.organization_name,
    customerId:       data.customer_id ?? null,
    customerName:     data.customer_name ?? null,
    label:            data.label,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Busca tickets filtrados para o cliente
// ─────────────────────────────────────────────────────────────────────────────

async function fetchCustomerTickets(
  ctx: CustomerReportContext,
  dateFrom: Date,
  dateTo: Date,
): Promise<ReportTicket[]> {
  let query = supabase
    .from('tickets')
    .select(`
      id,
      ticket_number,
      status,
      priority,
      subject,
      category_id,
      organization_id,
      customer_id,
      assigned_agent_id,
      created_at,
      first_response_at,
      resolved_at,
      first_response_deadline,
      resolution_deadline,
      sla_status
    `)
    .eq('organization_id', ctx.organizationId)
    .gte('created_at', dateFrom.toISOString())
    .lte('created_at', dateTo.toISOString())

  // Se o token for de um cliente específico, filtra por ele
  if (ctx.customerId) {
    query = query.eq('customer_id', ctx.customerId)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? []).map((t: any) => ({
    id: t.id,
    ticket_number: t.ticket_number,
    status: t.status,
    priority: t.priority,
    subject: t.subject,
    category_id: t.category_id,
    category_name: null,           // sem join de categoria no portal do cliente
    organization_id: t.organization_id,
    customer_id: t.customer_id,
    customer_name: null,
    assigned_agent_id: t.assigned_agent_id,
    agent_name: null,              // agentes não são expostos ao cliente
    created_at: t.created_at,
    first_response_at: t.first_response_at,
    resolved_at: t.resolved_at,
    first_response_deadline: t.first_response_deadline,
    resolution_deadline: t.resolution_deadline,
    sla_status: t.sla_status,
    note_types: [],
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook de contexto do token (apenas validação, sem dados)
// ─────────────────────────────────────────────────────────────────────────────

export function useCustomerReportContext(token: string | undefined) {
  return useQuery({
    queryKey: ['customer-report-context', token],
    queryFn: () => validateToken(token!),
    enabled: !!token,
    retry: false,
    staleTime: 10 * 60 * 1000,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook de dados do relatório do cliente
// ─────────────────────────────────────────────────────────────────────────────

export function useCustomerReport(
  ctx: CustomerReportContext | null | undefined,
  dateFrom: Date,
  dateTo: Date,
) {
  const query = useQuery({
    queryKey: ['customer-report-data', ctx?.organizationId, ctx?.customerId, dateFrom, dateTo],
    queryFn: () => fetchCustomerTickets(ctx!, dateFrom, dateTo),
    enabled: !!ctx?.organizationId,
    staleTime: 2 * 60 * 1000,
  })

  const tickets = query.data ?? []

  const kpis = computeKPIs(tickets)
  const customerKPIs: CustomerKPIs = {
    totalTickets:            kpis.totalTickets,
    resolvedTickets:         kpis.resolvedTickets,
    openTickets:             kpis.openTickets + kpis.inProgressTickets + kpis.pendingTickets,
    avgFirstResponseMinutes: kpis.avgFirstResponseMinutes,
    avgResolutionMinutes:    kpis.avgResolutionMinutes,
    slaCompliancePct:        kpis.slaCompliancePct,
  }

  return {
    isLoading:   query.isLoading,
    isError:     query.isError,
    tickets,
    customerKPIs,
    dailyVolume: computeDailyVolume(tickets) as DailyVolume[],
    // Categorias sem ids internos expostos
    categories:  computeCategories(tickets).map(c => ({ ...c, categoryId: null })) as CategoryStat[],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook para gerenciar tokens (usado na página interna)
// ─────────────────────────────────────────────────────────────────────────────

export function useReportTokens(organizationId: string) {
  return useQuery({
    queryKey: ['report-tokens', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_report_tokens')
        .select(`
          id, label, expires_at, is_active, created_at, customer_id,
          customers:customer_id ( name )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((r: any) => ({
        id: r.id,
        organization_id: organizationId,
        customer_id: r.customer_id,
        customer_name: r.customers?.name ?? null,
        label: r.label,
        expires_at: r.expires_at,
        is_active: r.is_active,
        created_at: r.created_at,
      }))
    },
    enabled: !!organizationId,
  })
}
