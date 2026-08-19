
-- =============================================
-- 1. Create type, table, and functions FIRST
-- =============================================

CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Helper: check if user is assigned to a ticket
CREATE OR REPLACE FUNCTION public.is_ticket_agent(_user_id uuid, _ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tickets
    WHERE id = _ticket_id
      AND (assigned_agent_id = _user_id OR helper_agent_id = _user_id)
  )
$$;

-- =============================================
-- 2. user_roles RLS policies (function exists now)
-- =============================================

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 3. Fix agents table RLS - admin only for mutations
-- =============================================

DROP POLICY IF EXISTS "Authenticated users can insert agents" ON public.agents;
DROP POLICY IF EXISTS "Authenticated users can update agents" ON public.agents;
DROP POLICY IF EXISTS "Authenticated users can delete agents" ON public.agents;

CREATE POLICY "Admins can insert agents"
  ON public.agents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update agents"
  ON public.agents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete agents"
  ON public.agents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 4. Tighten tickets RLS
-- =============================================

DROP POLICY IF EXISTS "Authenticated users can update tickets" ON public.tickets;
DROP POLICY IF EXISTS "Authenticated users can delete tickets" ON public.tickets;

CREATE POLICY "Agents can update assigned tickets"
  ON public.tickets FOR UPDATE TO authenticated
  USING (
    assigned_agent_id = auth.uid()
    OR helper_agent_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete tickets"
  ON public.tickets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 5. Tighten messages RLS
-- =============================================

DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can update messages" ON public.messages;

CREATE POLICY "Agents can insert messages on assigned tickets"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.is_ticket_agent(auth.uid(), ticket_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Agents can update messages on assigned tickets"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    public.is_ticket_agent(auth.uid(), ticket_id)
    OR public.has_role(auth.uid(), 'admin')
  );

-- =============================================
-- 6. Tighten customers RLS - restrict delete to admin
-- =============================================

DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;

CREATE POLICY "Admins can delete customers"
  ON public.customers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- 7. Fix security definer views → security invoker
-- =============================================

DROP VIEW IF EXISTS public.tickets_with_customer;
CREATE VIEW public.tickets_with_customer WITH (security_invoker = on) AS
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

DROP VIEW IF EXISTS public.messages_with_sender;
CREATE VIEW public.messages_with_sender WITH (security_invoker = on) AS
SELECT
  m.id, m.ticket_id, m.sender_type, m.content_text, m.status, m.created_at,
  CASE
    WHEN m.sender_type = 'customer' THEN c.name
    ELSE 'Agente'
  END AS sender_name
FROM public.messages m
JOIN public.tickets t ON t.id = m.ticket_id
JOIN public.customers c ON c.id = t.customer_id;

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
