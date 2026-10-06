-- Livih — RPCs da fase 1: criar organização, configurar canal, entrada e saída de mensagens.
-- As do sistema (Edge Functions / n8n) só executam com service_role.

-- ============================================================================
-- Organização
-- ============================================================================

-- Só admin da plataforma cria organização. Quem cria vira dono se p_dono for null.
create function public.criar_organizacao(p_nome text, p_slug text, p_dono uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if not public.eh_admin_plataforma() and auth.role() <> 'service_role' then
    raise exception 'só a equipe da plataforma cria organizações';
  end if;
  insert into public.organizacoes (nome, slug) values (p_nome, p_slug) returning id into v_org;
  if coalesce(p_dono, auth.uid()) is not null then
    insert into public.membros_org (org_id, user_id, papel) values (v_org, coalesce(p_dono, auth.uid()), 'dono');
  end if;
  return v_org;
end $$;

-- ============================================================================
-- Canal: token da w-api no Vault e segredo do webhook
-- ============================================================================

create function public.definir_token_canal(p_canal uuid, p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_canal public.canais;
begin
  select * into v_canal from public.canais where id = p_canal;
  if v_canal.id is null or not public.tem_papel(v_canal.org_id, '{dono,admin}') then
    raise exception 'canal não encontrado';
  end if;
  if v_canal.vault_token_id is null then
    update public.canais
       set vault_token_id = vault.create_secret(p_token, 'canal_' || p_canal::text, 'token w-api do canal')
     where id = p_canal;
  else
    perform vault.update_secret(v_canal.vault_token_id, p_token);
  end if;
end $$;

-- Gera um segredo novo para a URL do webhook e devolve UMA vez. Guarda só o hash.
create function public.gerar_segredo_webhook(p_canal uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_segredo text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select org_id into v_org from public.canais where id = p_canal;
  if v_org is null or not public.tem_papel(v_org, '{dono,admin}') then
    raise exception 'canal não encontrado';
  end if;
  update public.canais set webhook_segredo_hash = encode(extensions.digest(v_segredo, 'sha256'), 'hex')
   where id = p_canal;
  return v_segredo;
end $$;

-- Para a Edge Function: confere o segredo do webhook e devolve o canal.
create function public.canal_por_webhook(p_canal uuid, p_segredo text)
returns table (canal_id uuid, org_id uuid, tipo text, instance_id text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.org_id, c.tipo, c.instance_id
    from public.canais c
    join public.organizacoes o on o.id = c.org_id and o.status = 'ativa'
   where c.id = p_canal and c.ativo
     and c.webhook_segredo_hash = encode(extensions.digest(p_segredo, 'sha256'), 'hex');
$$;

-- Para a Edge Function de envio: token do canal (lido do Vault dentro do banco).
create function public.canal_token(p_canal uuid)
returns text language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret
    from public.canais c join vault.decrypted_secrets s on s.id = c.vault_token_id
   where c.id = p_canal;
$$;

-- ============================================================================
-- Entrada (webhook da w-api)
-- ============================================================================

-- Grava a mensagem recebida. Idempotente: o mesmo wapi_id no mesmo canal não entra duas vezes.
-- Devolve se o agente deve ser chamado (conversa com o bot e agente ativo).
create function public.registrar_entrada(
  p_canal uuid,
  p_wapi_id text,
  p_telefone text,
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

  insert into public.eventos_recebidos (canal_id, wapi_id, payload)
  values (p_canal, p_wapi_id, p_payload)
  on conflict (canal_id, wapi_id) do nothing
  returning id into v_evento;
  if v_evento is null then
    return jsonb_build_object('duplicada', true);
  end if;

  insert into public.contatos (org_id, telefone, nome_whatsapp, origem)
  values (v_org, p_telefone, nullif(p_nome_whatsapp, ''), 'whatsapp')
  on conflict (org_id, telefone) do update
    set nome_whatsapp = coalesce(excluded.nome_whatsapp, public.contatos.nome_whatsapp)
  returning id into v_contato;

  insert into public.conversas (org_id, canal_id, contato_id)
  values (v_org, p_canal, v_contato)
  on conflict (canal_id, contato_id) do nothing;

  select * into v_conversa from public.conversas
   where canal_id = p_canal and contato_id = v_contato
   for update;

  -- Conversa encerrada que recebe mensagem volta para o bot.
  if v_conversa.estado = 'encerrada' then
    perform set_config('livih.autor', 'sistema', true);
    update public.conversas set estado = 'bot', atribuida_a = null, motivo_humano = null
     where id = v_conversa.id
     returning * into v_conversa;
  end if;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, transcricao,
                                midia_mime, wapi_id, status_entrega)
  values (v_org, v_conversa.id, 'entrada', 'contato', p_tipo, p_texto, p_transcricao,
          p_midia_mime, p_wapi_id, 'recebida')
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

-- ============================================================================
-- Saída: uma fila só para atendente e bot
-- ============================================================================

-- Uso interno: grava a mensagem de saída e põe na fila.
create function public.enfileirar_saida(p_conversa uuid, p_texto text, p_autor public.autor_tipo, p_autor_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_msg uuid;
begin
  if coalesce(btrim(p_texto), '') = '' then
    raise exception 'mensagem vazia';
  end if;
  select org_id into v_org from public.conversas where id = p_conversa;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, autor_id, tipo, texto, status_entrega)
  values (v_org, p_conversa, 'saida', p_autor, p_autor_id, 'texto', p_texto, 'pendente')
  returning id into v_msg;
  insert into public.fila_envio (org_id, conversa_id, mensagem_id) values (v_org, p_conversa, v_msg);
  update public.conversas
     set ultima_mensagem_em = now(), ultima_mensagem_resumo = left(p_texto, 140)
   where id = p_conversa;
  return v_msg;
end $$;

-- Atendente responde pela tela. Ao responder, assume a conversa (o bot para).
create function public.enviar_mensagem(p_conversa uuid, p_texto text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conversa public.conversas;
begin
  select * into v_conversa from public.conversas where id = p_conversa for update;
  if v_conversa.id is null or not public.eh_membro(v_conversa.org_id) then
    raise exception 'conversa não encontrada';
  end if;
  if v_conversa.estado <> 'humano' or v_conversa.atribuida_a is null then
    update public.conversas
       set estado = 'humano', atribuida_a = coalesce(atribuida_a, auth.uid()), nao_lidas = 0
     where id = p_conversa;
  else
    update public.conversas set nao_lidas = 0 where id = p_conversa;
  end if;
  return public.enfileirar_saida(p_conversa, p_texto, 'atendente', auth.uid());
end $$;

-- Edge Function de envio: pega um lote e marca como "enviando" (SKIP LOCKED evita envio duplo
-- quando duas execuções se sobrepõem).
create function public.fila_reivindicar(p_limite integer default 20)
returns table (fila_id bigint, mensagem_id uuid, canal_id uuid, canal_tipo text, instance_id text,
               telefone text, texto text, tentativas integer)
language plpgsql security definer set search_path = '' as $$
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
  select m.id, m.mensagem_id, cv.canal_id, ca.tipo, ca.instance_id, ct.telefone, msg.texto, m.tentativas
    from marcados m
    join public.conversas cv on cv.id = m.conversa_id
    join public.canais ca on ca.id = cv.canal_id
    join public.contatos ct on ct.id = cv.contato_id
    join public.mensagens msg on msg.id = m.mensagem_id;
end $$;

-- Resultado do envio. Falha volta para a fila com espera crescente (1, 2, 4, 8, 16 min).
create function public.fila_resultado(p_fila bigint, p_ok boolean, p_wapi_id text default null, p_erro text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_fila public.fila_envio;
begin
  select * into v_fila from public.fila_envio where id = p_fila for update;
  if p_ok then
    update public.fila_envio set status = 'enviada', enviado_em = now(), erro = null where id = p_fila;
    update public.mensagens set status_entrega = 'enviada', wapi_id = p_wapi_id, erro = null
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

-- Recibo de entrega/leitura vindo da w-api.
create function public.registrar_status_entrega(p_canal uuid, p_wapi_id text, p_status public.status_entrega)
returns void language sql security definer set search_path = '' as $$
  update public.mensagens m set status_entrega = p_status
    from public.conversas c
   where c.id = m.conversa_id and c.canal_id = p_canal and m.wapi_id = p_wapi_id
     and m.direcao = 'saida'
     and array_position(enum_range(null::public.status_entrega), p_status)
       > array_position(enum_range(null::public.status_entrega), m.status_entrega);
$$;

-- ============================================================================
-- Permissões das funções
-- ============================================================================

revoke execute on all functions in schema public from public, anon;

-- app (usuário logado)
grant execute on function
  public.eh_membro(uuid), public.tem_papel(uuid, public.papel_org[]), public.eh_admin_plataforma(),
  public.criar_organizacao(text, text, uuid), public.definir_token_canal(uuid, text),
  public.gerar_segredo_webhook(uuid), public.enviar_mensagem(uuid, text)
to authenticated;

-- só o sistema
revoke execute on function
  public.canal_por_webhook(uuid, text), public.canal_token(uuid),
  public.registrar_entrada(uuid, text, text, text, public.tipo_msg, text, jsonb, text, text),
  public.enfileirar_saida(uuid, text, public.autor_tipo, uuid),
  public.fila_reivindicar(integer), public.fila_resultado(bigint, boolean, text, text),
  public.registrar_status_entrega(uuid, text, public.status_entrega),
  public.auditar(uuid, text, text, text, jsonb, jsonb)
from authenticated;
grant execute on function
  public.canal_por_webhook(uuid, text), public.canal_token(uuid),
  public.registrar_entrada(uuid, text, text, text, public.tipo_msg, text, jsonb, text, text),
  public.enfileirar_saida(uuid, text, public.autor_tipo, uuid),
  public.fila_reivindicar(integer), public.fila_resultado(bigint, boolean, text, text),
  public.registrar_status_entrega(uuid, text, public.status_entrega)
to service_role;
