
ALTER VIEW public.tickets_with_customer SET (security_invoker = on);
ALTER VIEW public.messages_with_sender SET (security_invoker = on);
ALTER VIEW public.agent_stats SET (security_invoker = on);
