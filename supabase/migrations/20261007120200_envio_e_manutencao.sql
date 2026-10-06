-- Livih — disparo da fila de envio, manutenção e mensagens digitadas no próprio celular.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ============================================================================
-- Segredo interno (banco → Edge Functions)
-- ============================================================================
-- Gerado aqui e guardado só no Vault: ninguém precisa ver nem copiar o valor. A Edge Function
-- confere o header chamando verificar_segredo_interno, então não há segredo em variável de ambiente.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'livih_interno') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'livih_interno',
                                'banco → Edge Functions do Livih');
  end if;
end $$;

create function public.verificar_segredo_interno(p_segredo text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets where name = 'livih_interno' and decrypted_secret = p_segredo
  );
$$;

create function public.chamar_funcao(p_funcao text, p_corpo jsonb default '{}'::jsonb)
returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://przgftkiicuapbpwspjd.supabase.co/functions/v1/' || p_funcao,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-livih-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'livih_interno')
    ),
    body := p_corpo,
    timeout_milliseconds := 30000
  );
$$;

-- ============================================================================
-- Fila: dispara na hora e o cron cobre falhas e novas tentativas
-- ============================================================================

create function public.fila_disparar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.chamar_funcao('wapi-enviar');
  return null;
end $$;

create trigger fila_disparar after insert on public.fila_envio
for each statement execute function public.fila_disparar();

create function public.fila_manutencao() returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- envio que travou no meio (função caiu) volta para nova tentativa
  update public.fila_envio set status = 'erro', erro = coalesce(erro, 'travado em enviando')
   where status = 'enviando' and proxima_tentativa_em < now() - interval '5 minutes';
  if exists (select 1 from public.fila_envio
              where status in ('pendente', 'erro') and proxima_tentativa_em <= now() and tentativas < 6) then
    perform public.chamar_funcao('wapi-enviar');
  end if;
end $$;

select cron.schedule('livih-fila-envio', '* * * * *', 'select public.fila_manutencao()');

-- Eventos brutos: 30 dias bastam para depurar e cabem no plano gratuito.
select cron.schedule('livih-limpar-eventos', '17 6 * * *',
  $$delete from public.eventos_recebidos where recebido_em < now() - interval '30 days'$$);

-- ============================================================================
-- Mensagem digitada no próprio celular do canal
-- ============================================================================
-- Alguém da empresa respondeu pelo WhatsApp do celular, fora do Livih. Entra no histórico
-- como saída do atendente e o bot para naquela conversa.

create function public.registrar_saida_celular(
  p_canal uuid,
  p_wapi_id text,
  p_telefone text,
  p_tipo public.tipo_msg,
  p_texto text,
  p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_evento bigint;
  v_contato uuid;
  v_conversa public.conversas;
begin
  select org_id into v_org from public.canais where id = p_canal and ativo;
  if v_org is null then
    raise exception 'canal inativo ou inexistente';
  end if;

  insert into public.eventos_recebidos (canal_id, wapi_id, payload)
  values (p_canal, p_wapi_id, p_payload)
  on conflict (canal_id, wapi_id) do nothing
  returning id into v_evento;
  if v_evento is null then
    return jsonb_build_object('duplicada', true);
  end if;

  insert into public.contatos (org_id, telefone, origem)
  values (v_org, p_telefone, 'whatsapp')
  on conflict (org_id, telefone) do update set telefone = excluded.telefone
  returning id into v_contato;

  insert into public.conversas (org_id, canal_id, contato_id, estado)
  values (v_org, p_canal, v_contato, 'humano')
  on conflict (canal_id, contato_id) do nothing;

  select * into v_conversa from public.conversas
   where canal_id = p_canal and contato_id = v_contato for update;

  -- Eco de mensagem que o próprio Livih enviou (o wapi_id já foi gravado pela fila).
  if exists (select 1 from public.mensagens where conversa_id = v_conversa.id and wapi_id = p_wapi_id) then
    update public.eventos_recebidos set processado_em = now() where id = v_evento;
    return jsonb_build_object('duplicada', true);
  end if;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, wapi_id, status_entrega)
  values (v_org, v_conversa.id, 'saida', 'atendente', p_tipo, p_texto, p_wapi_id, 'enviada');

  update public.conversas
     set ultima_mensagem_em = now(),
         ultima_mensagem_resumo = left(coalesce(p_texto, '[' || p_tipo::text || ']'), 140),
         estado = case when estado in ('bot', 'aguardando_humano', 'encerrada') then 'humano' else estado end,
         motivo_humano = case when estado in ('bot', 'aguardando_humano', 'encerrada')
                              then 'respondida pelo celular' else motivo_humano end,
         nao_lidas = 0
   where id = v_conversa.id;

  update public.eventos_recebidos set processado_em = now() where id = v_evento;
  return jsonb_build_object('duplicada', false, 'conversa_id', v_conversa.id);
end $$;

-- ============================================================================
-- Permissões
-- ============================================================================

revoke execute on function
  public.verificar_segredo_interno(text), public.chamar_funcao(text, jsonb),
  public.fila_manutencao(), public.fila_disparar(),
  public.registrar_saida_celular(uuid, text, text, public.tipo_msg, text, jsonb)
from public, anon, authenticated;
grant execute on function
  public.verificar_segredo_interno(text),
  public.registrar_saida_celular(uuid, text, text, public.tipo_msg, text, jsonb)
to service_role;
