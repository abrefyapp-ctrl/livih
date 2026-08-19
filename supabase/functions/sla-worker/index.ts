// supabase/functions/sla-worker/index.ts
// Worker de SLA: atualiza status em massa + dispara alertas
//
// Agendamento via pg_cron (rodar no SQL Editor do Supabase):
//
//   select cron.schedule(
//     'sla-worker',
//     '* * * * *',   -- a cada minuto
//     $$
//       select net.http_post(
//         url    := '<SUPABASE_URL>/functions/v1/sla-worker',
//         headers := '{"Authorization": "Bearer <SUPABASE_SERVICE_ROLE_KEY>"}'::jsonb
//       )
//     $$
//   );

import { SlaService, createAdminClient } from '../_shared/sla.service.ts'

// Alertas N minutos ANTES do vencimento
const ALERT_THRESHOLDS_MINUTES = [30, 15, 5]

Deno.serve(async (req: Request) => {
  // Aceita apenas POST ou chamadas autorizadas
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const startedAt = Date.now()
  console.log(`[SLA Worker] iniciando em ${new Date().toISOString()}`)

  try {
    const supabase = createAdminClient()
    const slaService = new SlaService(supabase)

    // 1. Atualiza statuses em massa (breached + at_risk)
    const { breached, atRisk } = await slaService.refreshSlaStatuses()
    console.log(`[SLA Worker] breached=${breached} at_risk=${atRisk}`)

    // 2. Alertas preventivos
    const alertsSent = await sendProactiveAlerts(supabase)
    console.log(`[SLA Worker] ${alertsSent} alertas enviados`)

    // 3. Notifica breaches novos
    const notified = await notifyNewBreaches(supabase)
    console.log(`[SLA Worker] ${notified} breaches notificados`)

    const elapsed = Date.now() - startedAt
    console.log(`[SLA Worker] concluído em ${elapsed}ms`)

    return Response.json({
      ok: true,
      breached,
      atRisk,
      alertsSent,
      notified,
      elapsedMs: elapsed,
    })
  } catch (err) {
    console.error('[SLA Worker] erro:', err)
    return Response.json({ ok: false, error: String(err) }, { status: 500 })
  }
})

// ─── Alertas preventivos ───────────────────────────────────────────────────

async function sendProactiveAlerts(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const now = new Date()
  let total = 0

  for (const thresholdMinutes of ALERT_THRESHOLDS_MINUTES) {
    const windowStart = new Date(now.getTime() + (thresholdMinutes - 1) * 60_000).toISOString()
    const windowEnd   = new Date(now.getTime() +  thresholdMinutes      * 60_000).toISOString()

    // Busca tickets prestes a vencer sem alerta enviado para este threshold
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('id, organization_id, resolution_deadline, sla_policies(name)')
      .eq('sla_status', 'within_sla')
      .is('resolved_at', null)
      .gte('resolution_deadline', windowStart)
      .lte('resolution_deadline', windowEnd)

    if (error || !tickets?.length) continue

    for (const ticket of tickets) {
      // Verifica se alerta para este threshold já foi enviado
      const { count } = await supabase
        .from('sla_events')
        .select('id', { count: 'exact', head: true })
        .eq('ticket_id', ticket.id)
        .eq('event_type', 'sla_alert')
        .contains('metadata', { threshold_minutes: thresholdMinutes })

      if (count && count > 0) continue

      // Dispara alerta
      await dispatchAlert({
        type: 'sla_at_risk',
        ticketId: ticket.id,
        organizationId: ticket.organization_id,
        thresholdMinutes,
        resolutionDeadline: ticket.resolution_deadline,
        policyName: (ticket.sla_policies as { name: string } | null)?.name,
      })

      // Loga o alerta para evitar reenvio
      await supabase.from('sla_events').insert({
        ticket_id: ticket.id,
        event_type: 'sla_alert',
        metadata: {
          threshold_minutes: thresholdMinutes,
          alert_type: 'proactive_resolution_warning',
        },
        snapshot: { resolution_deadline: ticket.resolution_deadline },
      })

      total++
    }
  }

  return total
}

// ─── Notifica breaches novos ───────────────────────────────────────────────

async function notifyNewBreaches(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  // Tickets breached sem notificação ainda
  const { data: tickets, error } = await supabase
    .from('tickets')
    .select('id, organization_id, resolution_deadline')
    .eq('sla_status', 'breached')
    .is('resolved_at', null)
    .limit(100)

  if (error || !tickets?.length) return 0

  // Filtra os que ainda não foram notificados
  let notified = 0
  for (const ticket of tickets) {
    const { count } = await supabase
      .from('sla_events')
      .select('id', { count: 'exact', head: true })
      .eq('ticket_id', ticket.id)
      .eq('event_type', 'sla_breach_notified')

    if (count && count > 0) continue

    await dispatchAlert({
      type: 'sla_breached',
      ticketId: ticket.id,
      organizationId: ticket.organization_id,
      resolutionDeadline: ticket.resolution_deadline,
    })

    await supabase.from('sla_events').insert({
      ticket_id: ticket.id,
      event_type: 'sla_breach_notified',
      metadata: { notified_at: new Date().toISOString() },
      snapshot: { resolution_deadline: ticket.resolution_deadline },
    })

    notified++
  }

  return notified
}

// ─── dispatchAlert ─────────────────────────────────────────────────────────
// Adapte para seu sistema de notificações (email, Slack, push, webhook)

interface AlertPayload {
  type: 'sla_at_risk' | 'sla_breached'
  ticketId: string
  organizationId: string
  thresholdMinutes?: number
  resolutionDeadline: string | Date
  policyName?: string
}

async function dispatchAlert(payload: AlertPayload): Promise<void> {
  console.log(`[SLA Alert] ${payload.type} | ticket=${payload.ticketId}`, payload)

  // Exemplos de integração — descomente o que precisar:
  //
  // ── Email (Resend) ─────────────────────────────────────────────────────
  // await fetch('https://api.resend.com/emails', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     from: 'sla@seudominio.com',
  //     to: ['suporte@seudominio.com'],
  //     subject: `[SLA] ${payload.type} - Ticket ${payload.ticketId}`,
  //     html: `<p>Ticket ${payload.ticketId} — ${payload.type}</p>`,
  //   }),
  // })
  //
  // ── Slack Webhook ──────────────────────────────────────────────────────
  // await fetch(Deno.env.get('SLACK_WEBHOOK_URL')!, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     text: `⚠️ *${payload.type}* — Ticket \`${payload.ticketId}\``,
  //   }),
  // })
}
