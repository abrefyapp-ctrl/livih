-- O quadro de oportunidades se atualiza sozinho quando o agente ou outro membro mexe num cartão.
-- O Realtime respeita a RLS (pode_ver_contato): cada um só recebe o que já pode ver.
alter publication supabase_realtime add table public.oportunidades;
