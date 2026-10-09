-- Notificações push (Web Push) no celular e no computador.
--
-- Quem recebe (só quem ativou notificações em algum aparelho):
--   - conversa passa a aguardar a equipe (agente chamou, agente desligado, contato sem agente...):
--     todos que podem ver o número (mesma regra de pode_ver_canal);
--   - mensagem nova do cliente numa conversa que aguarda a equipe: os mesmos;
--   - mensagem nova do cliente numa conversa em atendimento: só o atendente dela.
--
-- Fluxo: trigger → push_fila (uma pendente por pessoa e conversa; mensagens seguidas atualizam a mesma) →
-- chamar_funcao('push-enviar') → Edge Function criptografa e entrega ao serviço de push do navegador.
-- As chaves VAPID são geradas pela própria Edge Function na primeira execução e ficam no Vault ('livih_vapid');
-- a chave pública fica em push_config para o front.

-- ---------- aparelhos inscritos ----------
create table public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  criado_em timestamptz not null default now()
);
create index push_inscricoes_user_idx on public.push_inscricoes (user_id);
alter table public.push_inscricoes enable row level security;
create policy push_inscricoes_ver on public.push_inscricoes for select to authenticated using (user_id = auth.uid());

-- Mesmo aparelho com outra pessoa logada: a inscrição passa para quem está logado agora.
create function public.push_inscrever(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'faça login'; end if;
  delete from public.push_inscricoes where endpoint = p_endpoint;
  insert into public.push_inscricoes (user_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 200));
end $$;

create function public.push_cancelar(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_inscricoes where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- ---------- chave pública (VAPID) ----------
create table public.push_config (
  id integer primary key default 1 check (id = 1),
  chave_publica text not null,
  criado_em timestamptz not null default now()
);
alter table public.push_config enable row level security;
create policy push_config_ver on public.push_config for select to authenticated using (true);

-- Só a Edge Function (service_role): lê e grava o par de chaves.
create function public.push_chaves() returns jsonb
language sql stable security definer set search_path = '' as $$
  select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'livih_vapid';
$$;

create function public.push_salvar_chaves(p_chaves jsonb, p_publica text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('livih_vapid'));
  -- Duas execuções ao mesmo tempo: a segunda fica com as chaves da primeira.
  if exists (select 1 from vault.secrets where name = 'livih_vapid') then
    return public.push_chaves();
  end if;
  perform vault.create_secret(p_chaves::text, 'livih_vapid', 'chaves VAPID das notificações push');
  insert into public.push_config (chave_publica) values (p_publica);
  return p_chaves;
end $$;

-- ---------- fila ----------
create table public.push_fila (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  conversa_id uuid references public.conversas (id) on delete cascade,
  titulo text not null,
  corpo text not null,
  url text not null default '/conversas',
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  erro text
);
create unique index push_fila_pendente_idx on public.push_fila (user_id, conversa_id) where enviado_em is null;
create index push_fila_enviado_idx on public.push_fila (enviado_em);
alter table public.push_fila enable row level security;  -- sem policy: só o banco e a Edge Function

create function public.push_enfileirar(p_users uuid[], p_conversa uuid, p_titulo text, p_corpo text)
returns void language sql security definer set search_path = '' as $$
  insert into public.push_fila (user_id, conversa_id, titulo, corpo, url)
  select u, p_conversa, left(p_titulo, 80), left(p_corpo, 180),
         case when p_conversa is null then '/conversas' else '/conversas/' || p_conversa end
    from unnest(p_users) u
   where exists (select 1 from public.push_inscricoes i where i.user_id = u)
  on conflict (user_id, conversa_id) where enviado_em is null
  do update set titulo = excluded.titulo, corpo = excluded.corpo, criado_em = now();
$$;

-- Quem pode ver o número (pode_ver_canal, do ponto de vista de cada membro).
create function public.push_equipe_do_canal(p_canal uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.user_id), '{}')
    from public.canais c
    join public.membros_org m on m.org_id = c.org_id and m.ativo
   where c.id = p_canal
     and (c.responsavel_id is null or c.responsavel_id = m.user_id or m.papel in ('dono', 'admin'));
$$;

create function public.push_nome_contato(p_contato uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(trim(ct.nome), ''), nullif(trim(ct.nome_whatsapp), ''), ct.telefone, 'Cliente')
    from public.contatos ct where ct.id = p_contato;
$$;

-- Conversa passou a aguardar a equipe.
create function public.push_conversa_aguardando() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ultima text;
begin
  if new.estado = 'aguardando_humano' and (tg_op = 'INSERT' or old.estado <> 'aguardando_humano') then
    select coalesce(m.transcricao, m.texto, '[' || m.tipo::text || ']') into v_ultima
      from public.mensagens m where m.conversa_id = new.id and m.direcao = 'entrada'
     order by m.criado_em desc limit 1;
    perform public.push_enfileirar(
      public.push_equipe_do_canal(new.canal_id), new.id,
      public.push_nome_contato(new.contato_id) || ' aguarda atendimento',
      coalesce(nullif(v_ultima, ''), new.motivo_humano, 'Nova conversa para a equipe')
    );
  end if;
  return null;
end $$;

create trigger conversas_push_aguardando after insert or update of estado on public.conversas
for each row execute function public.push_conversa_aguardando();

-- Mensagem nova do cliente numa conversa que está com a equipe.
create function public.push_mensagem_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_texto text := coalesce(new.transcricao, new.texto, '[' || new.tipo::text || ']');
begin
  if new.direcao <> 'entrada' or new.autor_tipo <> 'contato' then return null; end if;
  select * into v_conv from public.conversas where id = new.conversa_id;
  if v_conv.estado = 'humano' and v_conv.atribuida_a is not null then
    perform public.push_enfileirar(array[v_conv.atribuida_a], v_conv.id, public.push_nome_contato(v_conv.contato_id), v_texto);
  elsif v_conv.estado = 'aguardando_humano' then
    perform public.push_enfileirar(public.push_equipe_do_canal(v_conv.canal_id), v_conv.id,
                                   public.push_nome_contato(v_conv.contato_id) || ' aguarda atendimento', v_texto);
  end if;
  return null;
end $$;

create trigger mensagens_push_cliente after insert on public.mensagens
for each row execute function public.push_mensagem_cliente();

-- A transcrição do áudio chega depois da mensagem: atualiza o texto da notificação ainda pendente.
create function public.push_transcricao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.transcricao is distinct from old.transcricao and new.direcao = 'entrada' then
    update public.push_fila set corpo = left(new.transcricao, 180)
     where conversa_id = new.conversa_id and enviado_em is null;
  end if;
  return null;
end $$;

create trigger mensagens_push_transcricao after update of transcricao on public.mensagens
for each row execute function public.push_transcricao();

create function public.push_disparar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.chamar_funcao('push-enviar');
  return null;
end $$;

create trigger push_fila_disparar after insert on public.push_fila
for each statement execute function public.push_disparar();

-- Botão "Enviar notificação de teste".
create function public.push_testar() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'faça login'; end if;
  insert into public.push_fila (user_id, titulo, corpo)
  values (auth.uid(), 'Notificações do Livih ativadas', 'É assim que você vai saber quando um cliente aguardar atendimento.');
end $$;

-- Edge Function: pega as pendentes (marca como enviadas na mesma hora; erro fica registrado).
create function public.push_reivindicar(p_limite integer default 100)
returns table (fila_id bigint, user_id uuid, conversa_id uuid, titulo text, corpo text, url text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with lote as (
    select f.id from public.push_fila f
     where f.enviado_em is null and f.criado_em > now() - interval '1 hour'
     order by f.id limit p_limite
     for update skip locked
  )
  update public.push_fila f set enviado_em = now()
    from lote where f.id = lote.id
  returning f.id, f.user_id, f.conversa_id, f.titulo, f.corpo, f.url;
end $$;

-- Limpeza: fila enviada some depois de 7 dias.
select cron.schedule('livih-limpar-push', '23 6 * * *',
  $$delete from public.push_fila where enviado_em < now() - interval '7 days'$$);

revoke execute on function
  public.push_chaves(), public.push_salvar_chaves(jsonb, text), public.push_enfileirar(uuid[], uuid, text, text),
  public.push_equipe_do_canal(uuid), public.push_nome_contato(uuid), public.push_conversa_aguardando(),
  public.push_mensagem_cliente(), public.push_transcricao(), public.push_disparar(), public.push_reivindicar(integer)
  from public, anon, authenticated;
revoke execute on function public.push_inscrever(text, text, text, text), public.push_cancelar(text), public.push_testar()
  from public, anon;
grant execute on function public.push_inscrever(text, text, text, text), public.push_cancelar(text), public.push_testar()
  to authenticated;
grant execute on function public.push_chaves(), public.push_salvar_chaves(jsonb, text), public.push_reivindicar(integer)
  to service_role;
