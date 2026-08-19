
-- Add sequential ticket number
ALTER TABLE public.tickets ADD COLUMN ticket_number SERIAL;

-- Create unique index
CREATE UNIQUE INDEX idx_tickets_ticket_number ON public.tickets (ticket_number);

-- Recreate view to include ticket_number
DROP VIEW IF EXISTS public.tickets_with_customer;
CREATE VIEW public.tickets_with_customer AS
SELECT
  t.id,
  t.ticket_number,
  t.customer_id,
  c.name AS customer_name,
  c.phone_number AS customer_phone,
  t.status,
  t.priority,
  t.assigned_agent_id,
  t.helper_agent_id,
  t.created_at,
  t.updated_at
FROM public.tickets t
JOIN public.customers c ON c.id = t.customer_id;
