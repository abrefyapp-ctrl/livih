
-- 1. Atribuir admin aos usuários existentes
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
WHERE email IN ('abrefyapp@gmail.com', 'felippesoares@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Corrigir is_ticket_agent para resolver via tabela agents
CREATE OR REPLACE FUNCTION public.is_ticket_agent(_user_id uuid, _ticket_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tickets t
    JOIN public.agents a ON (a.id = t.assigned_agent_id OR a.id = t.helper_agent_id)
    JOIN auth.users u ON u.email = a.email
    WHERE t.id = _ticket_id AND u.id = _user_id
  )
$$;

-- 3. Simplificar INSERT/UPDATE em messages
DROP POLICY IF EXISTS "Agents can insert messages on assigned tickets" ON public.messages;
CREATE POLICY "Authenticated users can insert messages" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Agents can update messages on assigned tickets" ON public.messages;
CREATE POLICY "Authenticated users can update messages" ON public.messages
  FOR UPDATE TO authenticated USING (true);
