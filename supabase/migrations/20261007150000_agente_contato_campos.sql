-- No primeiro teste real, a ferramenta atualizar_contato do n8n mandou junto o item inteiro do
-- workflow (prompt do sistema, histórico, ids) e tudo foi parar em contatos.dados (~79 KB).
-- A ferramenta foi corrigida para enviar só os campos do esquema; aqui o banco passa a aceitar só
-- campos conhecidos, em texto curto, e o lixo já gravado é removido.

create or replace function public.agente_atualizar_contato(p_conversa uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_contato uuid;
  v_extra jsonb;
  v_campos constant text[] := array['cargo', 'segmento', 'cidade', 'colaboradores'];
  v_texto text;
begin
  perform public.agente_marcar();
  select contato_id into v_contato from public.conversas where id = p_conversa;

  -- só campos conhecidos, só texto, no máximo 200 caracteres
  select coalesce(jsonb_object_agg(k, left(btrim(v), 200)), '{}'::jsonb) into v_extra
    from jsonb_each_text(coalesce(p_dados, '{}'::jsonb)) as e(k, v)
   where k = any (v_campos) and nullif(btrim(v), '') is not null;

  update public.contatos
     set nome = coalesce(left(nullif(btrim(p_dados ->> 'nome'), ''), 120), nome),
         empresa = coalesce(left(nullif(btrim(p_dados ->> 'empresa'), ''), 120), empresa),
         email = coalesce(left(nullif(btrim(p_dados ->> 'email'), ''), 200), email),
         dados = dados || v_extra
   where id = v_contato;
  return jsonb_build_object('sucesso', true);
end $$;

update public.contatos
   set dados = dados - array['conversa_id', 'mensagem_id', 'entrada', 'prompt_sistema', 'toolCallId']
 where dados ?| array['conversa_id', 'mensagem_id', 'entrada', 'prompt_sistema', 'toolCallId'];
