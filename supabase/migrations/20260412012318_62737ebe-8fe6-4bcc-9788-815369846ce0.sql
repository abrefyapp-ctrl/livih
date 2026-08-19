
-- Create customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customers" ON public.customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete customers" ON public.customers FOR DELETE TO authenticated USING (true);

-- Create agents table
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view agents" ON public.agents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert agents" ON public.agents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update agents" ON public.agents FOR UPDATE TO authenticated USING (true);

-- Create tickets table
CREATE TABLE public.tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  assigned_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  helper_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view tickets" ON public.tickets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update tickets" ON public.tickets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete tickets" ON public.tickets FOR DELETE TO authenticated USING (true);

-- Create messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent')),
  content_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view messages" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update messages" ON public.messages FOR UPDATE TO authenticated USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create views
CREATE OR REPLACE VIEW public.tickets_with_customer AS
SELECT
  t.id, t.customer_id, t.status, t.priority,
  t.assigned_agent_id, t.helper_agent_id,
  t.created_at, t.updated_at,
  c.name AS customer_name,
  c.phone_number AS customer_phone
FROM public.tickets t
JOIN public.customers c ON c.id = t.customer_id;

CREATE OR REPLACE VIEW public.messages_with_sender AS
SELECT
  m.id, m.ticket_id, m.sender_type, m.content_text, m.status, m.created_at,
  CASE
    WHEN m.sender_type = 'customer' THEN c.name
    ELSE 'Agente'
  END AS sender_name
FROM public.messages m
JOIN public.tickets t ON t.id = m.ticket_id
JOIN public.customers c ON c.id = t.customer_id;

CREATE OR REPLACE VIEW public.agent_stats AS
SELECT
  a.id, a.name, a.email, a.avatar_url,
  COALESCE(active.cnt, 0)::int AS active_tickets,
  COALESCE(resolved.cnt, 0)::int AS resolved_tickets
FROM public.agents a
LEFT JOIN (
  SELECT assigned_agent_id, COUNT(*) AS cnt
  FROM public.tickets
  WHERE status IN ('open', 'in_progress', 'waiting_customer')
  GROUP BY assigned_agent_id
) active ON active.assigned_agent_id = a.id
LEFT JOIN (
  SELECT assigned_agent_id, COUNT(*) AS cnt
  FROM public.tickets
  WHERE status IN ('resolved', 'closed')
  GROUP BY assigned_agent_id
) resolved ON resolved.assigned_agent_id = a.id;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
