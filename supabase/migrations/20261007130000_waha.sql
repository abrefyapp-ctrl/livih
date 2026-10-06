-- Livih — troca da w-api pelo WAHA (servidor próprio na VPS) e suporte a LID.
--
-- O WhatsApp está trocando o telefone por um identificador interno (LID, "123@lid") em parte
-- das mensagens. O contato passa a ter telefone OU LID (ou os dois, quando um revela o outro).
-- O id da mensagem deixa de se chamar wapi_id (era específico da w-api) e vira wa_id.

-- ============================================================================
-- Canal
-- ============================================================================

alter table public.canais drop constraint canais_tipo_check;
alter table public.canais add constraint canais_tipo_check check (tipo in ('waha', 'meta'));
alter table public.canais alter column tipo set default 'waha';

-- instance_id passa a ser o nome da sessão no WAHA.
comment on column public.canais.instance_id is 'nome da sessão no provedor (WAHA: session)';
comment on column public.canais.vault_token_id is 'token próprio do canal, quando o provedor exigir (WAHA usa chave global)';

alter table public.canais add column status_conexao text;
alter table public.canais add column status_atualizado_em timestamptz;

grant update (nome, telefone, instance_id, ativo) on public.canais to authenticated;
grant insert (org_id, tipo, nome, telefone, instance_id, ativo) on public.canais to authenticated;

-- ============================================================================
-- Contato com LID
-- ============================================================================

alter table public.contatos alter column telefone drop not null;
alter table public.contatos add column whatsapp_lid text check (whatsapp_lid ~ '^[0-9]{5,25}$');
alter table public.contatos add constraint contatos_identificacao check (telefone is not null or whatsapp_lid is not null);
create unique index contatos_org_lid_key on public.contatos (org_id, whatsapp_lid) where whatsapp_lid is not null;

-- ============================================================================
-- wapi_id → wa_id
-- ============================================================================

alter table public.mensagens rename column wapi_id to wa_id;
alter table public.eventos_recebidos rename column wapi_id to wa_id;

-- ============================================================================
-- Funções que mudam de assinatura ou usavam wapi_id
-- ============================================================================

drop function public.registrar_entrada(uuid, text, text, text, public.tipo_msg, text, jsonb, text, text);
drop function public.registrar_saida_celular(uuid, text, text, public.tipo_msg, text, jsonb);
drop function public.fila_reivindicar(integer);
drop function public.fila_resultado(bigint, boolean, text, text);
drop function public.registrar_status_entrega(uuid, text, public.status_entrega);

-- Acha ou cria o contato por telefone e/ou LID, completando o que faltar.
create function public.contato_por_whatsapp(p_org uuid, p_telefone text, p_lid text, p_nome_whatsapp text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_por_tel uuid;
  v_por_lid uuid;
  v_id uuid;
begin
  if p_telefone is null and p_lid is null then
    raise exception 'mensagem sem telefone e sem LID';
  end if;
  if p_telefone is not null then
    select id into v_por_tel from public.contatos where org_id = p_org and telefone = p_telefone;
  end if;
  if p_lid is not null then
    select id into v_por_lid from public.contatos where org_id = p_org and whatsapp_lid = p_lid;
  end if;

  -- Dois cadastros que agora se revelam a mesma pessoa: fica o do telefone; o do LID só é
  -- reaproveitado se não tiver conversa (senão, mantém os dois e não arrisca misturar histórico).
  if v_por_tel is not null and v_por_lid is not null and v_por_tel <> v_por_lid then
    if not exists (select 1 from public.conversas where contato_id = v_por_lid)
       and not exists (select 1 from public.oportunidades where contato_id = v_por_lid)
       and not exists (select 1 from public.notas where contato_id = v_por_lid) then
      delete from public.contatos where id = v_por_lid;
      update public.contatos set whatsapp_lid = p_lid where id = v_por_tel;
    end if;
    v_id := v_por_tel;
  else
    v_id := coalesce(v_por_tel, v_por_lid);
  end if;

  if v_id is null then
    insert into public.contatos (org_id, telefone, whatsapp_lid, nome_whatsapp, origem)
    values (p_org, p_telefone, p_lid, nullif(p_nome_whatsapp, ''), 'whatsapp')
    returning id into v_id;
  else
    update public.contatos
       set telefone = coalesce(telefone, p_telefone),
           whatsapp_lid = coalesce(whatsapp_lid, p_lid),
           nome_whatsapp = coalesce(nullif(p_nome_whatsapp, ''), nome_whatsapp)
     where id = v_id
       and (telefone is null and p_telefone is not null
            or whatsapp_lid is null and p_lid is not null
            or nullif(p_nome_whatsapp, '') is distinct from nome_whatsapp and p_nome_whatsapp is not null);
  end if;
  return v_id;
end $$;

create function public.registrar_entrada(
  p_canal uuid,
  p_wa_id text,
  p_telefone text,
  p_lid text,
  p_nome_whatsapp text,
  p_tipo public.tipo_msg,
  p_texto text,
  p_payload jsonb,
  p_midia_mime text default null,
  p_transcricao text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_evento bigint;
  v_contato uuid;
  v_conversa public.conversas;
  v_msg uuid;
  v_agente_ativo boolean;
begin
  select org_id into v_org from public.canais where id = p_canal and ativo;
  if v_org is null then
    raise exception 'canal inativo ou inexistente';
  end if;

  insert into public.eventos_recebidos (canal_id, wa_id, payload)
  values (p_canal, p_wa_id, p_payload)
  on conflict (canal_id, wa_id) do nothing
  returning id into v_evento;
  if v_evento is null then
    return jsonb_build_object('duplicada', true);
  end if;

  v_contato := public.contato_por_whatsapp(v_org, p_telefone, p_lid, p_nome_whatsapp);

  insert into public.conversas (org_id, canal_id, contato_id)
  values (v_org, p_canal, v_contato)
  on conflict (canal_id, contato_id) do nothing;

  select * into v_conversa from public.conversas
   where canal_id = p_canal and contato_id = v_contato
   for update;

  if v_conversa.estado = 'encerrada' then
    update public.conversas set estado = 'bot', atribuida_a = null, motivo_humano = null
     where id = v_conversa.id
     returning * into v_conversa;
  end if;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, transcricao,
                                midia_mime, wa_id, status_entrega)
  values (v_org, v_conversa.id, 'entrada', 'contato', p_tipo, p_texto, p_transcricao,
          p_midia_mime, p_wa_id, 'recebida')
  returning id into v_msg;

  update public.conversas
     set ultima_mensagem_em = now(),
         ultima_mensagem_resumo = left(coalesce(p_texto, p_transcricao, '[' || p_tipo::text || ']'), 140),
         nao_lidas = nao_lidas + 1
   where id = v_conversa.id;

  update public.eventos_recebidos set processado_em = now() where id = v_evento;

  select coalesce(bool_or(ativo), false) into v_agente_ativo from public.agentes where canal_id = p_canal;

  return jsonb_build_object(
    'duplicada', false,
    'org_id', v_org,
    'conversa_id', v_conversa.id,
    'mensagem_id', v_msg,
    'estado', v_conversa.estado,
    'chamar_agente', v_conversa.estado = 'bot' and v_agente_ativo
  );
end $$;

create function public.registrar_saida_celular(
  p_canal uuid,
  p_wa_id text,
  p_telefone text,
  p_lid text,
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

  insert into public.eventos_recebidos (canal_id, wa_id, payload)
  values (p_canal, p_wa_id, p_payload)
  on conflict (canal_id, wa_id) do nothing
  returning id into v_evento;
  if v_evento is null then
    return jsonb_build_object('duplicada', true);
  end if;

  v_contato := public.contato_por_whatsapp(v_org, p_telefone, p_lid, null);

  insert into public.conversas (org_id, canal_id, contato_id, estado)
  values (v_org, p_canal, v_contato, 'humano')
  on conflict (canal_id, contato_id) do nothing;

  select * into v_conversa from public.conversas
   where canal_id = p_canal and contato_id = v_contato for update;

  if exists (select 1 from public.mensagens where conversa_id = v_conversa.id and wa_id = p_wa_id) then
    update public.eventos_recebidos set processado_em = now() where id = v_evento;
    return jsonb_build_object('duplicada', true);
  end if;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, wa_id, status_entrega)
  values (v_org, v_conversa.id, 'saida', 'atendente', p_tipo, p_texto, p_wa_id, 'enviada');

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

create function public.fila_reivindicar(p_limite integer default 20)
returns table (fila_id bigint, mensagem_id uuid, canal_id uuid, canal_tipo text, instance_id text,
               telefone text, whatsapp_lid text, texto text, tentativas integer)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with lote as (
    select f.id from public.fila_envio f
     where f.status in ('pendente', 'erro') and f.proxima_tentativa_em <= now() and f.tentativas < 6
     order by f.proxima_tentativa_em
     limit p_limite
     for update skip locked
  ), marcados as (
    update public.fila_envio f set status = 'enviando', tentativas = f.tentativas + 1
      from lote where f.id = lote.id
    returning f.id, f.mensagem_id, f.conversa_id, f.tentativas
  )
  select m.id, m.mensagem_id, cv.canal_id, ca.tipo, ca.instance_id, ct.telefone, ct.whatsapp_lid,
         msg.texto, m.tentativas
    from marcados m
    join public.conversas cv on cv.id = m.conversa_id
    join public.canais ca on ca.id = cv.canal_id
    join public.contatos ct on ct.id = cv.contato_id
    join public.mensagens msg on msg.id = m.mensagem_id;
end $$;

create function public.fila_resultado(p_fila bigint, p_ok boolean, p_wa_id text default null, p_erro text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_fila public.fila_envio;
begin
  select * into v_fila from public.fila_envio where id = p_fila for update;
  if p_ok then
    update public.fila_envio set status = 'enviada', enviado_em = now(), erro = null where id = p_fila;
    update public.mensagens set status_entrega = 'enviada', wa_id = p_wa_id, erro = null
     where id = v_fila.mensagem_id;
  else
    update public.fila_envio
       set status = 'erro', erro = left(p_erro, 500),
           proxima_tentativa_em = now() + make_interval(mins => power(2, greatest(v_fila.tentativas - 1, 0))::int)
     where id = p_fila;
    if v_fila.tentativas >= 6 then
      update public.mensagens set status_entrega = 'erro', erro = left(p_erro, 500)
       where id = v_fila.mensagem_id;
    end if;
  end if;
end $$;

create function public.registrar_status_entrega(p_canal uuid, p_wa_id text, p_status public.status_entrega)
returns void language sql security definer set search_path = '' as $$
  update public.mensagens m set status_entrega = p_status
    from public.conversas c
   where c.id = m.conversa_id and c.canal_id = p_canal and m.wa_id = p_wa_id
     and m.direcao = 'saida'
     and p_status > m.status_entrega;
$$;

-- Estado da sessão (conectado, aguardando QR, caiu…), para a tela e para o monitoramento.
create function public.registrar_status_canal(p_canal uuid, p_status text)
returns void language sql security definer set search_path = '' as $$
  update public.canais set status_conexao = p_status, status_atualizado_em = now() where id = p_canal;
$$;

-- ============================================================================
-- A fila agora chama whatsapp-enviar (genérica por provedor)
-- ============================================================================

create or replace function public.fila_disparar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.chamar_funcao('whatsapp-enviar');
  return null;
end $$;

create or replace function public.fila_manutencao() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.fila_envio set status = 'erro', erro = coalesce(erro, 'travado em enviando')
   where status = 'enviando' and proxima_tentativa_em < now() - interval '5 minutes';
  if exists (select 1 from public.fila_envio
              where status in ('pendente', 'erro') and proxima_tentativa_em <= now() and tentativas < 6) then
    perform public.chamar_funcao('whatsapp-enviar');
  end if;
end $$;

-- ============================================================================
-- Permissões
-- ============================================================================

revoke execute on function
  public.contato_por_whatsapp(uuid, text, text, text),
  public.registrar_entrada(uuid, text, text, text, text, public.tipo_msg, text, jsonb, text, text),
  public.registrar_saida_celular(uuid, text, text, text, public.tipo_msg, text, jsonb),
  public.fila_reivindicar(integer), public.fila_resultado(bigint, boolean, text, text),
  public.registrar_status_entrega(uuid, text, public.status_entrega),
  public.registrar_status_canal(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.registrar_entrada(uuid, text, text, text, text, public.tipo_msg, text, jsonb, text, text),
  public.registrar_saida_celular(uuid, text, text, text, public.tipo_msg, text, jsonb),
  public.fila_reivindicar(integer), public.fila_resultado(bigint, boolean, text, text),
  public.registrar_status_entrega(uuid, text, public.status_entrega),
  public.registrar_status_canal(uuid, text)
to service_role;
