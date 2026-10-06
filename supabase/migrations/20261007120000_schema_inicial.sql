-- Livih — schema inicial (multiempresa).
-- Desenho em docs/modelagem.md. Toda tabela de negócio tem org_id e RLS por membership.
-- Relações entre tabelas usam FK composta (id, org_id) para que uma linha nunca aponte
-- para dado de outra organização, mesmo que alguém erre um id.

-- ============================================================================
-- Tipos
-- ============================================================================

create type public.papel_org as enum ('dono', 'admin', 'atendente');
create type public.estado_conversa as enum ('bot', 'aguardando_humano', 'humano', 'encerrada');
create type public.direcao_msg as enum ('entrada', 'saida');
create type public.autor_tipo as enum ('contato', 'atendente', 'bot', 'sistema');
create type public.tipo_msg as enum (
  'texto', 'audio', 'imagem', 'video', 'documento', 'figurinha', 'localizacao', 'contato', 'outro'
);
create type public.status_entrega as enum ('recebida', 'pendente', 'enviada', 'entregue', 'lida', 'erro');
create type public.status_fila as enum ('pendente', 'enviando', 'enviada', 'erro');
create type public.tipo_etapa as enum ('aberta', 'ganho', 'perdido');

-- ============================================================================
-- Utilidades
-- ============================================================================

create function public.tocar_atualizado_em() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- ============================================================================
-- Organização e acesso
-- ============================================================================

create table public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  status text not null default 'ativa' check (status in ('ativa', 'suspensa')),
  plano text not null default 'interno',
  criado_em timestamptz not null default now()
);

create table public.perfis (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text,
  avatar_url text,
  criado_em timestamptz not null default now()
);

create table public.membros_org (
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel public.papel_org not null default 'atendente',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index membros_org_user_idx on public.membros_org (user_id);

-- Quem opera a plataforma (equipe F7/Livih): cria organizações e enxerga todas.
create table public.admins_plataforma (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

create function public.eh_admin_plataforma() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins_plataforma where user_id = auth.uid());
$$;

create function public.eh_membro(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros_org
    where org_id = p_org and user_id = auth.uid() and ativo
  ) or public.eh_admin_plataforma();
$$;

create function public.tem_papel(p_org uuid, p_papeis public.papel_org[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros_org
    where org_id = p_org and user_id = auth.uid() and ativo and papel = any (p_papeis)
  ) or public.eh_admin_plataforma();
$$;

-- Perfil criado no cadastro.
create function public.criar_perfil_no_cadastro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (user_id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger criar_perfil_no_cadastro
after insert on auth.users
for each row execute function public.criar_perfil_no_cadastro();

-- ============================================================================
-- Canal e agente (configuração por organização)
-- ============================================================================

create table public.canais (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  tipo text not null default 'wapi' check (tipo in ('wapi', 'meta')),
  nome text not null,
  telefone text check (telefone ~ '^[0-9]{10,15}$'),
  instance_id text,
  vault_token_id uuid,          -- token da w-api no Vault; a tabela guarda só a referência
  webhook_segredo_hash text,    -- sha256 do segredo da URL do webhook
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, org_id),
  unique (tipo, instance_id)
);

create table public.agentes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  canal_id uuid not null unique,
  nome text not null default 'Assistente',
  ativo boolean not null default false,
  modelo text not null default 'gpt-5-mini',
  prompt text not null default '',
  mensagem_fora_horario text,
  horario jsonb,                -- null = 24h
  regras_humano jsonb not null default '{}'::jsonb,
  telefone_alerta text check (telefone_alerta ~ '^[0-9]{10,15}$'),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null,
  foreign key (canal_id, org_id) references public.canais (id, org_id) on delete cascade
);
create trigger agentes_atualizado_em before update on public.agentes
for each row execute function public.tocar_atualizado_em();

create table public.base_conhecimento (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  titulo text not null,
  conteudo text not null,
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);
create index base_conhecimento_org_idx on public.base_conhecimento (org_id) where ativo;
create trigger base_conhecimento_atualizado_em before update on public.base_conhecimento
for each row execute function public.tocar_atualizado_em();

-- ============================================================================
-- Conversa
-- ============================================================================

create table public.contatos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  telefone text not null check (telefone ~ '^[0-9]{10,15}$'),
  nome text,
  nome_whatsapp text,           -- o "pushName"; nome é o que o atendente/agente confirmou
  empresa text,
  email text,
  origem text,
  tags text[] not null default '{}',
  dados jsonb not null default '{}'::jsonb,
  responsavel_id uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, telefone),
  unique (id, org_id)
);
create trigger contatos_atualizado_em before update on public.contatos
for each row execute function public.tocar_atualizado_em();

create table public.conversas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  canal_id uuid not null,
  contato_id uuid not null,
  estado public.estado_conversa not null default 'bot',
  atribuida_a uuid references auth.users (id) on delete set null,
  motivo_humano text,
  ultima_mensagem_em timestamptz,
  ultima_mensagem_resumo text,
  nao_lidas integer not null default 0,
  criado_em timestamptz not null default now(),
  unique (canal_id, contato_id),
  unique (id, org_id),
  foreign key (canal_id, org_id) references public.canais (id, org_id) on delete restrict,
  foreign key (contato_id, org_id) references public.contatos (id, org_id) on delete restrict
);
create index conversas_lista_idx on public.conversas (org_id, estado, ultima_mensagem_em desc);

create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  conversa_id uuid not null,
  direcao public.direcao_msg not null,
  autor_tipo public.autor_tipo not null,
  autor_id uuid references auth.users (id) on delete set null,
  tipo public.tipo_msg not null default 'texto',
  texto text,
  transcricao text,
  midia_path text,
  midia_mime text,
  wapi_id text,
  status_entrega public.status_entrega not null,
  erro text,
  criado_em timestamptz not null default now(),
  unique (id, org_id),
  unique (conversa_id, wapi_id),
  foreign key (conversa_id, org_id) references public.conversas (id, org_id) on delete restrict
);
create index mensagens_conversa_idx on public.mensagens (conversa_id, criado_em);

-- Histórico só de acréscimo: conteúdo não muda e nada é apagado pelo app.
-- Mudam só o que é ciclo de entrega/processamento. Exclusão por LGPD virá por função própria,
-- que liga livih.lgpd na transação e registra na auditoria.
create function public.mensagens_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('livih.lgpd', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'mensagens não podem ser apagadas';
  end if;
  if (new.id, new.org_id, new.conversa_id, new.direcao, new.autor_tipo, new.autor_id, new.tipo,
      new.texto, new.midia_path, new.criado_em)
     is distinct from
     (old.id, old.org_id, old.conversa_id, old.direcao, old.autor_tipo, old.autor_id, old.tipo,
      old.texto, old.midia_path, old.criado_em) then
    raise exception 'o conteúdo de uma mensagem não pode ser alterado';
  end if;
  return new;
end $$;

create trigger mensagens_imutavel before update or delete on public.mensagens
for each row execute function public.mensagens_imutavel();

create table public.eventos_recebidos (
  id bigint generated always as identity primary key,
  canal_id uuid not null references public.canais (id) on delete cascade,
  wapi_id text not null,
  payload jsonb not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  erro text,
  unique (canal_id, wapi_id)
);
create index eventos_recebidos_data_idx on public.eventos_recebidos (recebido_em);

create table public.fila_envio (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  conversa_id uuid not null,
  mensagem_id uuid not null unique,
  status public.status_fila not null default 'pendente',
  tentativas integer not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  erro text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  foreign key (conversa_id, org_id) references public.conversas (id, org_id) on delete restrict,
  foreign key (mensagem_id, org_id) references public.mensagens (id, org_id) on delete restrict
);
create index fila_envio_pendentes_idx on public.fila_envio (proxima_tentativa_em)
  where status in ('pendente', 'erro');

create table public.notas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  contato_id uuid,
  conversa_id uuid,
  autor_tipo public.autor_tipo not null default 'atendente',
  autor_id uuid default auth.uid() references auth.users (id) on delete set null,
  texto text not null,
  criado_em timestamptz not null default now(),
  check (contato_id is not null or conversa_id is not null),
  foreign key (contato_id, org_id) references public.contatos (id, org_id) on delete cascade,
  foreign key (conversa_id, org_id) references public.conversas (id, org_id) on delete cascade
);
create index notas_contato_idx on public.notas (contato_id);
create index notas_conversa_idx on public.notas (conversa_id);

-- ============================================================================
-- CRM
-- ============================================================================

create table public.etapas_funil (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null,
  ordem integer not null,
  tipo public.tipo_etapa not null default 'aberta',
  cor text,
  unique (org_id, nome),
  unique (id, org_id)
);

create table public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  contato_id uuid not null,
  etapa_id uuid not null,
  titulo text not null,
  resumo text,
  valor_estimado numeric(14, 2),
  responsavel_id uuid references auth.users (id) on delete set null,
  origem text,
  fechada_em timestamptz,
  motivo_perda text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, org_id),
  foreign key (contato_id, org_id) references public.contatos (id, org_id) on delete cascade,
  foreign key (etapa_id, org_id) references public.etapas_funil (id, org_id) on delete restrict
);
create index oportunidades_funil_idx on public.oportunidades (org_id, etapa_id);
create index oportunidades_contato_idx on public.oportunidades (contato_id);
create trigger oportunidades_atualizado_em before update on public.oportunidades
for each row execute function public.tocar_atualizado_em();

create table public.oportunidade_historico (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  oportunidade_id uuid not null,
  etapa_de uuid references public.etapas_funil (id) on delete set null,
  etapa_para uuid references public.etapas_funil (id) on delete set null,
  autor_tipo public.autor_tipo not null,
  autor_id uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  foreign key (oportunidade_id, org_id) references public.oportunidades (id, org_id) on delete cascade
);
create index oportunidade_historico_op_idx on public.oportunidade_historico (oportunidade_id);

-- Quem está agindo: atendente (auth.uid() presente) ou o agente/sistema, que avisa por
-- set_config('livih.autor', 'bot', true) dentro da RPC.
create function public.autor_atual() returns public.autor_tipo
language sql stable set search_path = '' as $$
  select case
    when auth.uid() is not null then 'atendente'::public.autor_tipo
    when coalesce(current_setting('livih.autor', true), '') = 'bot' then 'bot'::public.autor_tipo
    else 'sistema'::public.autor_tipo
  end;
$$;

create function public.oportunidade_mudou_etapa() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tipo public.tipo_etapa;
begin
  if tg_op = 'UPDATE' and new.etapa_id is not distinct from old.etapa_id then
    return new;
  end if;
  select tipo into v_tipo from public.etapas_funil where id = new.etapa_id;
  new.fechada_em := case when v_tipo in ('ganho', 'perdido') then coalesce(new.fechada_em, now()) end;
  insert into public.oportunidade_historico (org_id, oportunidade_id, etapa_de, etapa_para, autor_tipo, autor_id)
  values (new.org_id, new.id, case when tg_op = 'UPDATE' then old.etapa_id end, new.etapa_id,
          public.autor_atual(), auth.uid());
  return new;
end $$;

-- BEFORE para poder ajustar fechada_em; o histórico referencia a oportunidade, então no
-- INSERT ele precisa ser gravado depois dela existir.
create trigger oportunidade_mudou_etapa_upd before update on public.oportunidades
for each row execute function public.oportunidade_mudou_etapa();

create function public.oportunidade_criada() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.oportunidade_historico (org_id, oportunidade_id, etapa_de, etapa_para, autor_tipo, autor_id)
  values (new.org_id, new.id, null, new.etapa_id, public.autor_atual(), auth.uid());
  return new;
end $$;

create trigger oportunidade_criada after insert on public.oportunidades
for each row execute function public.oportunidade_criada();

create function public.oportunidade_fechamento_no_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.etapas_funil where id = new.etapa_id and tipo in ('ganho', 'perdido')) then
    new.fechada_em := coalesce(new.fechada_em, now());
  end if;
  return new;
end $$;

create trigger oportunidade_fechamento_no_insert before insert on public.oportunidades
for each row execute function public.oportunidade_fechamento_no_insert();

-- Etapas padrão para toda organização nova.
create function public.organizacao_etapas_padrao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.etapas_funil (org_id, nome, ordem, tipo) values
    (new.id, 'Novo', 1, 'aberta'),
    (new.id, 'Em diagnóstico', 2, 'aberta'),
    (new.id, 'Reunião marcada', 3, 'aberta'),
    (new.id, 'Proposta', 4, 'aberta'),
    (new.id, 'Ganho', 5, 'ganho'),
    (new.id, 'Perdido', 6, 'perdido');
  return new;
end $$;

create trigger organizacao_etapas_padrao after insert on public.organizacoes
for each row execute function public.organizacao_etapas_padrao();

-- ============================================================================
-- Auditoria
-- ============================================================================

create table public.auditoria (
  id bigint generated always as identity primary key,
  org_id uuid,                  -- sem FK: o registro sobrevive à organização
  ator_tipo public.autor_tipo not null,
  ator_id uuid,
  acao text not null,
  entidade text not null,
  entidade_id text,
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now()
);
create index auditoria_org_idx on public.auditoria (org_id, criado_em desc);

create function public.auditoria_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'auditoria é só de acréscimo';
end $$;

create trigger auditoria_imutavel before update or delete on public.auditoria
for each row execute function public.auditoria_imutavel();

create function public.auditar(p_org uuid, p_acao text, p_entidade text, p_id text, p_antes jsonb, p_depois jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
  values (p_org, public.autor_atual(), auth.uid(), p_acao, p_entidade, p_id, p_antes, p_depois);
$$;

-- Estado e atribuição da conversa.
create function public.conversas_auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado is distinct from old.estado or new.atribuida_a is distinct from old.atribuida_a then
    perform public.auditar(new.org_id, 'conversa_estado', 'conversas', new.id::text,
      jsonb_build_object('estado', old.estado, 'atribuida_a', old.atribuida_a, 'motivo', old.motivo_humano),
      jsonb_build_object('estado', new.estado, 'atribuida_a', new.atribuida_a, 'motivo', new.motivo_humano));
  end if;
  return new;
end $$;

create trigger conversas_auditar after update on public.conversas
for each row execute function public.conversas_auditar();

-- Mudança de configuração (agente, canal) e de membros.
create function public.config_auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := coalesce((to_jsonb(new) ->> 'org_id')::uuid, (to_jsonb(old) ->> 'org_id')::uuid);
  v_id text := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id', to_jsonb(new) ->> 'user_id', to_jsonb(old) ->> 'user_id');
begin
  perform public.auditar(v_org, lower(tg_op), tg_table_name, v_id,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger agentes_auditar after insert or update or delete on public.agentes
for each row execute function public.config_auditar();
create trigger canais_auditar after insert or update or delete on public.canais
for each row execute function public.config_auditar();
create trigger membros_org_auditar after insert or update or delete on public.membros_org
for each row execute function public.config_auditar();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.organizacoes enable row level security;
alter table public.perfis enable row level security;
alter table public.membros_org enable row level security;
alter table public.admins_plataforma enable row level security;
alter table public.canais enable row level security;
alter table public.agentes enable row level security;
alter table public.base_conhecimento enable row level security;
alter table public.contatos enable row level security;
alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;
alter table public.eventos_recebidos enable row level security;
alter table public.fila_envio enable row level security;
alter table public.notas enable row level security;
alter table public.etapas_funil enable row level security;
alter table public.oportunidades enable row level security;
alter table public.oportunidade_historico enable row level security;
alter table public.auditoria enable row level security;

-- organizacoes: membros veem; dono/admin editam; criação só pela RPC criar_organizacao.
create policy org_ver on public.organizacoes for select to authenticated
  using (public.eh_membro(id));
create policy org_editar on public.organizacoes for update to authenticated
  using (public.tem_papel(id, '{dono,admin}')) with check (public.tem_papel(id, '{dono,admin}'));
revoke update on public.organizacoes from authenticated;
grant update (nome) on public.organizacoes to authenticated;

-- perfis: o próprio e quem divide organização.
create policy perfis_ver on public.perfis for select to authenticated
  using (
    user_id = auth.uid() or public.eh_admin_plataforma() or exists (
      select 1 from public.membros_org a join public.membros_org b on a.org_id = b.org_id
      where a.user_id = auth.uid() and a.ativo and b.user_id = perfis.user_id
    )
  );
create policy perfis_editar on public.perfis for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- membros_org: membros veem a equipe; só o dono mexe (convites virão por RPC).
create policy membros_ver on public.membros_org for select to authenticated
  using (public.eh_membro(org_id));
create policy membros_gerir on public.membros_org for all to authenticated
  using (public.tem_papel(org_id, '{dono}')) with check (public.tem_papel(org_id, '{dono}'));

-- admins_plataforma: cada um vê só se é admin. Ninguém grava pelo app.
create policy admins_ver on public.admins_plataforma for select to authenticated
  using (user_id = auth.uid());

-- configuração: membros veem, dono/admin gravam.
create policy canais_ver on public.canais for select to authenticated using (public.eh_membro(org_id));
create policy canais_gerir on public.canais for all to authenticated
  using (public.tem_papel(org_id, '{dono,admin}')) with check (public.tem_papel(org_id, '{dono,admin}'));
revoke insert, update on public.canais from authenticated;
grant insert (org_id, tipo, nome, telefone, instance_id, ativo) on public.canais to authenticated;
grant update (nome, telefone, instance_id, ativo) on public.canais to authenticated;

create policy agentes_ver on public.agentes for select to authenticated using (public.eh_membro(org_id));
create policy agentes_gerir on public.agentes for all to authenticated
  using (public.tem_papel(org_id, '{dono,admin}')) with check (public.tem_papel(org_id, '{dono,admin}'));

create policy base_ver on public.base_conhecimento for select to authenticated using (public.eh_membro(org_id));
create policy base_gerir on public.base_conhecimento for all to authenticated
  using (public.tem_papel(org_id, '{dono,admin}')) with check (public.tem_papel(org_id, '{dono,admin}'));

create policy etapas_ver on public.etapas_funil for select to authenticated using (public.eh_membro(org_id));
create policy etapas_gerir on public.etapas_funil for all to authenticated
  using (public.tem_papel(org_id, '{dono,admin}')) with check (public.tem_papel(org_id, '{dono,admin}'));

-- contatos e oportunidades: equipe toda trabalha; apagar só dono/admin.
create policy contatos_ver on public.contatos for select to authenticated using (public.eh_membro(org_id));
create policy contatos_criar on public.contatos for insert to authenticated with check (public.eh_membro(org_id));
create policy contatos_editar on public.contatos for update to authenticated
  using (public.eh_membro(org_id)) with check (public.eh_membro(org_id));
create policy contatos_apagar on public.contatos for delete to authenticated
  using (public.tem_papel(org_id, '{dono,admin}'));

create policy oport_ver on public.oportunidades for select to authenticated using (public.eh_membro(org_id));
create policy oport_criar on public.oportunidades for insert to authenticated with check (public.eh_membro(org_id));
create policy oport_editar on public.oportunidades for update to authenticated
  using (public.eh_membro(org_id)) with check (public.eh_membro(org_id));
create policy oport_apagar on public.oportunidades for delete to authenticated
  using (public.tem_papel(org_id, '{dono,admin}'));

create policy oport_hist_ver on public.oportunidade_historico for select to authenticated
  using (public.eh_membro(org_id));

-- conversas: equipe vê; muda só estado, atribuição e não lidas (o resto é do sistema).
create policy conversas_ver on public.conversas for select to authenticated using (public.eh_membro(org_id));
create policy conversas_editar on public.conversas for update to authenticated
  using (public.eh_membro(org_id)) with check (public.eh_membro(org_id));
revoke insert, update, delete on public.conversas from authenticated;
grant update (estado, atribuida_a, motivo_humano, nao_lidas) on public.conversas to authenticated;

-- mensagens e fila: só leitura pelo app; envio pela RPC enviar_mensagem.
create policy mensagens_ver on public.mensagens for select to authenticated using (public.eh_membro(org_id));
revoke insert, update, delete on public.mensagens from authenticated;
create policy fila_ver on public.fila_envio for select to authenticated using (public.eh_membro(org_id));
revoke insert, update, delete on public.fila_envio from authenticated;

-- eventos brutos: só o sistema (service_role). Nenhuma policy.
revoke all on public.eventos_recebidos from authenticated, anon;

-- notas: equipe lê e escreve; cada um apaga a sua.
create policy notas_ver on public.notas for select to authenticated using (public.eh_membro(org_id));
create policy notas_criar on public.notas for insert to authenticated
  with check (public.eh_membro(org_id) and autor_id = auth.uid() and autor_tipo = 'atendente');
create policy notas_apagar on public.notas for delete to authenticated using (autor_id = auth.uid());

-- auditoria: dono/admin leem.
create policy auditoria_ver on public.auditoria for select to authenticated
  using (public.tem_papel(org_id, '{dono,admin}'));
revoke insert, update, delete on public.auditoria from authenticated;

-- anon não enxerga nada do public.
revoke all on all tables in schema public from anon;

-- ============================================================================
-- Realtime (lista de conversas e chat ao vivo)
-- ============================================================================

alter publication supabase_realtime add table public.conversas, public.mensagens;
