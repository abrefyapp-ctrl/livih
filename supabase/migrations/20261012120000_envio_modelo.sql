-- Envio de modelo (template) pela conversa, na API oficial.
--
-- Passadas 24 h da última mensagem do cliente, a Cloud API só entrega modelo aprovado. A mensagem guarda o
-- texto já com as variáveis preenchidas (é o que a equipe lê no histórico) e, em `modelo`, o que a Meta
-- precisa para enviar: nome, idioma e os valores das variáveis do corpo, em ordem.

alter table public.mensagens add column modelo jsonb;
comment on column public.mensagens.modelo is
  'modelo da API oficial enviado nesta mensagem: {"nome", "idioma", "parametros": [..]} (null = texto livre)';

-- O modelo faz parte do conteúdo: também não muda depois de gravado.
create or replace function public.mensagens_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('livih.lgpd', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'mensagens não podem ser apagadas';
  end if;
  if (new.id, new.org_id, new.conversa_id, new.direcao, new.autor_tipo, new.autor_id, new.tipo,
      new.texto, new.midia_path, new.criado_em, new.modelo)
     is distinct from
     (old.id, old.org_id, old.conversa_id, old.direcao, old.autor_tipo, old.autor_id, old.tipo,
      old.texto, old.midia_path, old.criado_em, old.modelo) then
    raise exception 'o conteúdo de uma mensagem não pode ser alterado';
  end if;
  return new;
end $$;

-- Atendente envia um modelo pela tela. Mesma regra de enviar_mensagem: quem vê o número, e quem envia
-- assume a conversa. Só em número da API oficial (no WAHA não existe modelo).
create function public.enviar_modelo(
  p_conversa uuid, p_nome text, p_idioma text, p_parametros text[], p_texto text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conversa public.conversas;
  v_tipo text;
  v_msg uuid;
begin
  select * into v_conversa from public.conversas where id = p_conversa for update;
  if v_conversa.id is null or not public.pode_ver_canal(v_conversa.canal_id) then
    raise exception 'conversa não encontrada';
  end if;
  select tipo into v_tipo from public.canais where id = v_conversa.canal_id;
  if v_tipo is distinct from 'meta' then
    raise exception 'modelo só pode ser enviado por número da API oficial';
  end if;
  if coalesce(p_nome, '') !~ '^[a-z0-9_]+$' or length(p_nome) > 512 or coalesce(p_idioma, '') !~ '^[a-z]{2}(_[A-Z]{2})?$' then
    raise exception 'modelo inválido';
  end if;
  if coalesce(btrim(p_texto), '') = '' then
    raise exception 'mensagem vazia';
  end if;
  if exists (select 1 from unnest(coalesce(p_parametros, '{}')) v where coalesce(btrim(v), '') = '') then
    raise exception 'preencha todas as variáveis do modelo';
  end if;

  if v_conversa.estado <> 'humano' or v_conversa.atribuida_a is null then
    update public.conversas
       set estado = 'humano', atribuida_a = coalesce(atribuida_a, auth.uid()), nao_lidas = 0
     where id = p_conversa;
  else
    update public.conversas set nao_lidas = 0 where id = p_conversa;
  end if;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, autor_id, tipo, texto, status_entrega, modelo)
  values (v_conversa.org_id, p_conversa, 'saida', 'atendente', auth.uid(), 'texto', p_texto, 'pendente',
          jsonb_build_object('nome', p_nome, 'idioma', p_idioma, 'parametros', to_jsonb(coalesce(p_parametros, '{}'))))
  returning id into v_msg;
  insert into public.fila_envio (org_id, conversa_id, mensagem_id) values (v_conversa.org_id, p_conversa, v_msg);
  update public.conversas
     set ultima_mensagem_em = now(), ultima_mensagem_resumo = left(p_texto, 140)
   where id = p_conversa;
  return v_msg;
end $$;

revoke execute on function public.enviar_modelo(uuid, text, text, text[], text) from public, anon;
grant execute on function public.enviar_modelo(uuid, text, text, text[], text) to authenticated;

-- A fila passa o modelo para a função de envio.
drop function public.fila_reivindicar(integer);
create function public.fila_reivindicar(p_limite integer default 20)
returns table (fila_id bigint, mensagem_id uuid, canal_id uuid, canal_tipo text, instance_id text,
               telefone text, whatsapp_lid text, texto text, tentativas integer, modelo jsonb)
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
         msg.texto, m.tentativas, msg.modelo
    from marcados m
    join public.conversas cv on cv.id = m.conversa_id
    join public.canais ca on ca.id = cv.canal_id
    join public.contatos ct on ct.id = cv.contato_id
    join public.mensagens msg on msg.id = m.mensagem_id;
end $$;

revoke execute on function public.fila_reivindicar(integer) from public, anon, authenticated;
grant execute on function public.fila_reivindicar(integer) to service_role;
