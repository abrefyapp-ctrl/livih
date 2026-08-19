// _shared/sla.service.ts
// Serviço de SLA adaptado para Supabase Edge Functions (Deno)
// Usado como módulo compartilhado pelos demais functions

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { addMinutes, differenceInMinutes, isAfter } from 'npm:date-fns'

// ─── Tipos ─────────────────────────────────────────────────────────────────

export type SlaStatus = 'within_sla' | 'at_risk' | 'breached' | 'paused' | 'completed'

export interface SlaPolicy {
  id: string
  organizationId: string
  name: string
  firstResponseTime: number
  resolutionTime: number
  businessHoursOnly: boolean
  timezone: string
  appliesToPriority?: string | null
}

export interface TicketSlaState {
  ticketId: string
  slaPolicyId: string | null
  firstResponseAt: Date | null
  resolvedAt: Date | null
  firstResponseDeadline: Date | null
  resolutionDeadline: Date | null
  slaPausedAt: Date | null
  slaPausedMinutes: number
  slaStatus: SlaStatus
}

export interface SlaServiceResult {
  success: boolean
  error?: string
  data?: Record<string, unknown>
}

const AT_RISK_THRESHOLD_PCT = 0.8

// ─── Cria client admin (bypassa RLS) ───────────────────────────────────────

export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SlaService
// ═══════════════════════════════════════════════════════════════════════════

export class SlaService {
  constructor(private supabase: SupabaseClient) {}

  // ─────────────────────────────────────────────────────────────────────────
  // PAUSE: pausa o SLA do ticket
  // ─────────────────────────────────────────────────────────────────────────

  async pauseSla(ticketId: string, performedBy?: string): Promise<SlaServiceResult> {
    const ticket = await this.getTicketSlaState(ticketId)
    if (!ticket) return { success: false, error: `Ticket ${ticketId} não encontrado` }
    if (ticket.slaPausedAt) return { success: false, error: 'SLA já está pausado' }
    if (ticket.resolvedAt) return { success: false, error: 'Ticket já foi resolvido' }

    const now = new Date().toISOString()

    // 1. Atualiza ticket
    const { error: ticketError } = await this.supabase
      .from('tickets')
      .update({
        sla_paused_at: now,
        sla_status: 'paused',
        updated_at: now,
      })
      .eq('id', ticketId)

    if (ticketError) return { success: false, error: ticketError.message }

    // 2. Registra evento de auditoria
    const { error: eventError } = await this.supabase
      .from('sla_events')
      .insert({
        ticket_id: ticketId,
        event_type: 'sla_paused',
        occurred_at: now,
        performed_by: performedBy ?? null,
        metadata: { reason: 'status_waiting_customer' },
        snapshot: {
          first_response_deadline: ticket.firstResponseDeadline,
          resolution_deadline: ticket.resolutionDeadline,
          sla_paused_minutes_before: ticket.slaPausedMinutes,
        },
      })

    if (eventError) return { success: false, error: eventError.message }

    return { success: true }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESUME: retoma SLA e estende deadlines pelo tempo pausado
  // ─────────────────────────────────────────────────────────────────────────

  async resumeSla(ticketId: string, performedBy?: string): Promise<SlaServiceResult> {
    const ticket = await this.getTicketSlaState(ticketId)
    if (!ticket) return { success: false, error: `Ticket ${ticketId} não encontrado` }
    if (!ticket.slaPausedAt) return { success: false, error: 'SLA não está pausado' }

    const policy = await this.getPolicy(ticket.slaPolicyId!)
    if (!policy) return { success: false, error: 'Política de SLA não encontrada' }

    const now = new Date()
    const pausedSince = new Date(ticket.slaPausedAt)

    // Calcula minutos pausados (úteis ou corridos)
    const newPausedMinutes = policy.businessHoursOnly
      ? await this.calcBusinessMinutesElapsed(policy, pausedSince, now)
      : differenceInMinutes(now, pausedSince)

    const totalPausedMinutes = ticket.slaPausedMinutes + newPausedMinutes

    // Estende deadlines pelo tempo pausado
    const newFrd = ticket.firstResponseDeadline && !ticket.firstResponseAt
      ? await this.addMinutesToDeadline(policy, new Date(ticket.firstResponseDeadline), newPausedMinutes)
      : ticket.firstResponseDeadline

    const newRd = ticket.resolutionDeadline && !ticket.resolvedAt
      ? await this.addMinutesToDeadline(policy, new Date(ticket.resolutionDeadline), newPausedMinutes)
      : ticket.resolutionDeadline

    const nowIso = now.toISOString()

    // 1. Atualiza ticket
    const { error: ticketError } = await this.supabase
      .from('tickets')
      .update({
        sla_paused_at: null,
        sla_paused_minutes: totalPausedMinutes,
        first_response_deadline: newFrd instanceof Date ? newFrd.toISOString() : newFrd,
        resolution_deadline: newRd instanceof Date ? newRd.toISOString() : newRd,
        sla_status: 'within_sla',
        updated_at: nowIso,
      })
      .eq('id', ticketId)

    if (ticketError) return { success: false, error: ticketError.message }

    // 2. Registra evento de auditoria
    const { error: eventError } = await this.supabase
      .from('sla_events')
      .insert({
        ticket_id: ticketId,
        event_type: 'sla_resumed',
        occurred_at: nowIso,
        performed_by: performedBy ?? null,
        metadata: {
          paused_since: pausedSince.toISOString(),
          paused_minutes_this_session: newPausedMinutes,
          total_paused_minutes: totalPausedMinutes,
        },
        snapshot: {
          new_first_response_deadline: newFrd,
          new_resolution_deadline: newRd,
        },
      })

    if (eventError) return { success: false, error: eventError.message }

    return {
      success: true,
      data: { totalPausedMinutes, newFrd, newRd },
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIRST RESPONSE: registra primeira resposta (idempotente)
  // ─────────────────────────────────────────────────────────────────────────

  async recordFirstResponse(ticketId: string): Promise<SlaServiceResult> {
    const ticket = await this.getTicketSlaState(ticketId)
    if (!ticket) return { success: false, error: `Ticket ${ticketId} não encontrado` }
    if (ticket.firstResponseAt) return { success: true } // idempotente

    const { error } = await this.supabase
      .from('tickets')
      .update({
        first_response_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)

    if (error) return { success: false, error: error.message }

    // O trigger trg_ticket_sla_timestamps cuida do log em sla_events
    return { success: true }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESOLVE: marca ticket como resolvido (idempotente)
  // ─────────────────────────────────────────────────────────────────────────

  async resolveTicket(ticketId: string, performedBy?: string): Promise<SlaServiceResult> {
    const ticket = await this.getTicketSlaState(ticketId)
    if (!ticket) return { success: false, error: `Ticket ${ticketId} não encontrado` }
    if (ticket.resolvedAt) return { success: true } // idempotente

    // Se estava pausado, retoma antes de fechar
    if (ticket.slaPausedAt) {
      const resumeResult = await this.resumeSla(ticketId, performedBy)
      if (!resumeResult.success) return resumeResult
    }

    const { error } = await this.supabase
      .from('tickets')
      .update({
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)

    if (error) return { success: false, error: error.message }

    // O trigger trg_ticket_sla_timestamps cuida de sla_status e sla_events
    return { success: true }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REFRESH: atualiza sla_status em massa — chamado pelo worker (cron)
  // ─────────────────────────────────────────────────────────────────────────

  async refreshSlaStatuses(): Promise<{ breached: number; atRisk: number }> {
    // Delega para as funções SQL via RPC para aproveitar UPDATE em massa
    const { data: breached, error: e1 } = await this.supabase
      .rpc('sla_mark_breached')

    const { data: atRisk, error: e2 } = await this.supabase
      .rpc('sla_mark_at_risk', { threshold: AT_RISK_THRESHOLD_PCT })

    if (e1) console.error('[SLA] sla_mark_breached error:', e1.message)
    if (e2) console.error('[SLA] sla_mark_at_risk error:', e2.message)

    return {
      breached: breached ?? 0,
      atRisk: atRisk ?? 0,
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS privados
  // ─────────────────────────────────────────────────────────────────────────

  async getTicketSlaState(ticketId: string): Promise<TicketSlaState | null> {
    const { data, error } = await this.supabase
      .from('tickets')
      .select(`
        id,
        sla_policy_id,
        first_response_at,
        resolved_at,
        first_response_deadline,
        resolution_deadline,
        sla_paused_at,
        sla_paused_minutes,
        sla_status
      `)
      .eq('id', ticketId)
      .single()

    if (error || !data) return null

    return {
      ticketId: data.id,
      slaPolicyId: data.sla_policy_id,
      firstResponseAt: data.first_response_at ? new Date(data.first_response_at) : null,
      resolvedAt: data.resolved_at ? new Date(data.resolved_at) : null,
      firstResponseDeadline: data.first_response_deadline,
      resolutionDeadline: data.resolution_deadline,
      slaPausedAt: data.sla_paused_at ? new Date(data.sla_paused_at) : null,
      slaPausedMinutes: data.sla_paused_minutes ?? 0,
      slaStatus: data.sla_status,
    }
  }

  private async getPolicy(policyId: string): Promise<SlaPolicy | null> {
    const { data, error } = await this.supabase
      .from('sla_policies')
      .select('*')
      .eq('id', policyId)
      .single()

    if (error || !data) return null

    return {
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      firstResponseTime: data.first_response_time,
      resolutionTime: data.resolution_time,
      businessHoursOnly: data.business_hours_only,
      timezone: data.timezone,
      appliesToPriority: data.applies_to_priority,
    }
  }

  private async addMinutesToDeadline(
    policy: SlaPolicy,
    deadline: Date,
    minutes: number,
  ): Promise<Date> {
    if (!policy.businessHoursOnly) {
      return addMinutes(deadline, minutes)
    }
    // Chama a função PostgreSQL para precisão com horário comercial
    const { data, error } = await this.supabase.rpc('add_business_minutes', {
      p_organization_id: policy.organizationId,
      p_start: deadline.toISOString(),
      p_minutes: minutes,
      p_timezone: policy.timezone,
    })
    if (error) throw new Error(error.message)
    return new Date(data)
  }

  private async calcBusinessMinutesElapsed(
    policy: SlaPolicy,
    start: Date,
    end: Date,
  ): Promise<number> {
    const { data, error } = await this.supabase.rpc('elapsed_business_minutes', {
      p_organization_id: policy.organizationId,
      p_start: start.toISOString(),
      p_end: end.toISOString(),
      p_timezone: policy.timezone,
    })
    if (error) throw new Error(error.message)
    return data ?? 0
  }
}
