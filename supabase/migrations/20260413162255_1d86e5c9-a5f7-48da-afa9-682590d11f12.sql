
ALTER TABLE public.agents ADD COLUMN phone_number text;

CREATE POLICY "Authenticated users can delete agents"
ON public.agents FOR DELETE TO authenticated USING (true);

-- Recreate agent_stats view to include phone_number
DROP VIEW IF EXISTS public.agent_stats;
CREATE VIEW public.agent_stats WITH (security_invoker = on) AS
SELECT
  a.id,
  a.name,
  a.email,
  a.avatar_url,
  a.phone_number,
  COALESCE(act.cnt, 0)::int AS active_tickets,
  COALESCE(res.cnt, 0)::int AS resolved_tickets
FROM public.agents a
LEFT JOIN (
  SELECT assigned_agent_id, COUNT(*) AS cnt
  FROM public.tickets
  WHERE status IN ('open','in_progress','waiting_customer')
  GROUP BY assigned_agent_id
) act ON act.assigned_agent_id = a.id
LEFT JOIN (
  SELECT assigned_agent_id, COUNT(*) AS cnt
  FROM public.tickets
  WHERE status IN ('resolved','closed')
  GROUP BY assigned_agent_id
) res ON res.assigned_agent_id = a.id;
