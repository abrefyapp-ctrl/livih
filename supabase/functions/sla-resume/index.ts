// supabase/functions/sla-resume/index.ts
// Endpoint HTTP para retomar o SLA de um ticket pausado
//
// POST /functions/v1/sla-resume
// Body: { "ticket_id": "uuid", "performed_by": "uuid" }
//
// Chamar do frontend:
//   const { data, error } = await supabase.functions.invoke('sla-resume', {
//     body: { ticket_id: ticketId, performed_by: agentId }
//   })

import { SlaService, createAdminClient } from '../_shared/sla.service.ts'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { ticket_id?: string; performed_by?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { ticket_id, performed_by } = body

  if (!ticket_id) {
    return Response.json({ error: 'ticket_id é obrigatório' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()
    const slaService = new SlaService(supabase)

    const result = await slaService.resumeSla(ticket_id, performed_by)

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 422 })
    }

    return Response.json({ ok: true, data: result.data })
  } catch (err) {
    console.error('[sla-resume] erro:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
})
