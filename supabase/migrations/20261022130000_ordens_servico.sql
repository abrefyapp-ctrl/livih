-- Ordens de serviço (módulo adicional 'os', plano em docs/ordens-de-servico.md).
--
-- Para quem recebe um equipamento do cliente, conserta e devolve. Genérico: etapas, tipos de item, campos e
-- serviços são de cada empresa; o piloto (manutenção de motores) não é o molde.
--
-- Uma OS (o que chegou junto, com a NF do cliente) tem vários itens; cada item anda sozinho nas etapas. A etapa,
-- o faturamento e o pagamento só mudam pelas funções abaixo, que gravam o histórico: é dele que saem o tempo de
-- cada etapa, o painel e a previsão de caixa. A data de cada passo é a do fato (a equipe registra depois), não a
-- do clique.
--
-- Marco de etapa: o nome é livre ("Desmontagem / orçamento"); o marco diz o que a etapa significa para o painel,
-- a previsão e (fase 2) o agente: recebido, orcamento, aprovacao, finalizado, entregue. Um de cada por empresa.

insert into public.modulos (codigo, nome, descricao, padrao, adicional, ordem) values
  ('os', 'Ordens de serviço', 'Equipamentos recebidos para conserto, etapas, faturamento e previsão de caixa.', false, true, 3);

-- ============================================================================
-- Configuração
-- ============================================================================
create table public.os_config (
  org_id uuid primary key references public.organizacoes (id) on delete cascade,
  prazo_pagamento_dias integer not null default 30 check (prazo_pagamento_dias between 0 and 365),
  alerta_fator numeric(4, 2) not null default 1.5 check (alerta_fator between 1 and 10),
  atualizado_em timestamptz not null default now()
);
create trigger os_config_atualizado_em before update on public.os_config
for each row execute function public.tocar_atualizado_em();

create table public.os_etapas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 40),
  ordem integer not null,
  marco text check (marco in ('recebido', 'orcamento', 'aprovacao', 'finalizado', 'entregue')),
  prazo_padrao_dias integer check (prazo_padrao_dias between 0 and 365),
  -- Etapa removida que já está no histórico não some: só sai do quadro.
  ativo boolean not null default true,
  unique (id, org_id)
);
create unique index os_etapas_nome_unico on public.os_etapas (org_id, lower(nome)) where ativo;
create unique index os_etapas_marco_unico on public.os_etapas (org_id, marco) where ativo and marco is not null;

create table public.os_servicos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  codigo text check (length(codigo) <= 60),
  nome text not null check (length(btrim(nome)) between 1 and 200),
  preco numeric(14, 2) not null default 0 check (preco >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, org_id)
);
create unique index os_servicos_codigo_unico on public.os_servicos (org_id, lower(codigo)) where codigo is not null;

-- campos: [{"chave": "tensao", "rotulo": "Tensão", "tipo": "texto" | "numero" | "data" | "lista", "opcoes": [...],
-- "obrigatorio": bool}]. O valor de cada item fica em os_itens.campos (chave → texto).
create table public.os_tipos_item (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  rotulo_identificacao text not null default 'Nº de série' check (length(btrim(rotulo_identificacao)) between 1 and 40),
  campos jsonb not null default '[]' check (jsonb_typeof(campos) = 'array' and jsonb_array_length(campos) <= 20),
  servico_padrao_id uuid,
  ativo boolean not null default true,
  unique (id, org_id),
  foreign key (servico_padrao_id, org_id) references public.os_servicos (id, org_id) on delete set null (servico_padrao_id)
);
create unique index os_tipos_nome_unico on public.os_tipos_item (org_id, lower(nome)) where ativo;

-- Prazo de pagamento do cliente quando foge do padrão da empresa.
create table public.os_prazos_cliente (
  org_id uuid not null,
  contato_id uuid not null,
  prazo_pagamento_dias integer not null check (prazo_pagamento_dias between 0 and 365),
  primary key (org_id, contato_id),
  foreign key (contato_id, org_id) references public.contatos (id, org_id) on delete cascade
);

-- ============================================================================
-- Ordens e itens
-- ============================================================================
create table public.ordens_servico (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  numero integer not null,
  contato_id uuid,
  -- Nome do cliente para mostrar: vem do contato (empresa, senão nome) ou é digitado (cliente sem WhatsApp no Livih).
  -- Guardado aqui porque a oficina inteira vê a OS, mesmo quem não tem o contato na carteira.
  cliente_nome text check (length(cliente_nome) <= 200),
  nf_cliente text check (length(nf_cliente) <= 40),
  numero_cliente text check (length(numero_cliente) <= 40),
  recebida_em date not null default current_date,
  responsavel_id uuid references auth.users (id) on delete set null,
  observacao text check (length(observacao) <= 2000),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, numero),
  unique (id, org_id),
  foreign key (contato_id, org_id) references public.contatos (id, org_id) on delete set null (contato_id)
);
create index ordens_servico_lista_idx on public.ordens_servico (org_id, recebida_em desc);
create index ordens_servico_contato_idx on public.ordens_servico (contato_id);
create trigger ordens_servico_atualizado_em before update on public.ordens_servico
for each row execute function public.tocar_atualizado_em();

create table public.os_itens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  os_id uuid not null,
  tipo_id uuid,
  servico_id uuid,
  modelo text check (length(modelo) <= 120),
  identificacao text check (length(identificacao) <= 120),
  campos jsonb not null default '{}' check (jsonb_typeof(campos) = 'object'),
  valor numeric(14, 2) not null default 0 check (valor >= 0),
  etapa_id uuid not null,
  etapa_desde date not null,
  -- Nulo = segue no processo. Os três encerram o item fora do caminho normal (que termina na etapa "entregue").
  desfecho text check (desfecho in ('nao_aprovado', 'sem_conserto', 'cancelado')),
  desfecho_em date,
  cobranca text not null default 'cobrado' check (cobranca in ('cobrado', 'garantia', 'cortesia')),
  faturado_em date,
  vencimento_em date,
  pago_em date,
  observacao text check (length(observacao) <= 2000),
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, org_id),
  foreign key (os_id, org_id) references public.ordens_servico (id, org_id) on delete cascade,
  foreign key (tipo_id, org_id) references public.os_tipos_item (id, org_id) on delete set null (tipo_id),
  foreign key (servico_id, org_id) references public.os_servicos (id, org_id) on delete set null (servico_id),
  foreign key (etapa_id, org_id) references public.os_etapas (id, org_id),
  check ((desfecho is null) = (desfecho_em is null)),
  check (faturado_em is not null or (vencimento_em is null and pago_em is null)),
  check (faturado_em is null or cobranca = 'cobrado')
);
create index os_itens_os_idx on public.os_itens (os_id, ordem);
create index os_itens_quadro_idx on public.os_itens (org_id, etapa_id) where desfecho is null;
create index os_itens_receber_idx on public.os_itens (org_id, vencimento_em) where faturado_em is not null and pago_em is null;
create trigger os_itens_atualizado_em before update on public.os_itens
for each row execute function public.tocar_atualizado_em();

-- Trilha das etapas: só acréscimo. data = dia do fato; criado_em = quando foi registrado.
create table public.os_item_historico (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  item_id uuid not null,
  etapa_de uuid,
  etapa_para uuid not null,
  data date not null,
  importado boolean not null default false,
  autor_id uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default clock_timestamp(),
  foreign key (item_id, org_id) references public.os_itens (id, org_id) on delete cascade,
  foreign key (etapa_para, org_id) references public.os_etapas (id, org_id)
);
create index os_item_historico_item_idx on public.os_item_historico (item_id, data, id);
create index os_item_historico_org_idx on public.os_item_historico (org_id, data);

create function public.os_historico_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'o histórico das etapas não muda nem é apagado';
end $$;
create trigger os_historico_imutavel before update or delete on public.os_item_historico
for each row when (pg_trigger_depth() = 0) execute function public.os_historico_imutavel();

-- ============================================================================
-- Regras de preenchimento
-- ============================================================================

-- Número por empresa, quem criou e o nome do cliente.
create function public.os_preparar_ordem() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('os_numero:' || new.org_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero from public.ordens_servico where org_id = new.org_id;
    new.criado_por := coalesce(new.criado_por, auth.uid());
  end if;
  if new.contato_id is not null and (tg_op = 'INSERT' or new.contato_id is distinct from old.contato_id) then
    select coalesce(nullif(btrim(c.empresa), ''), nullif(btrim(c.nome), ''), nullif(btrim(c.nome_whatsapp), ''), c.telefone)
      into new.cliente_nome
      from public.contatos c where c.id = new.contato_id;
  end if;
  new.cliente_nome := nullif(btrim(new.cliente_nome), '');
  if new.responsavel_id is not null and not exists (
    select 1 from public.membros_org where org_id = new.org_id and user_id = new.responsavel_id and ativo
  ) then
    raise exception 'o responsável precisa ser da equipe';
  end if;
  return new;
end $$;
create trigger os_preparar_ordem before insert or update on public.ordens_servico
for each row execute function public.os_preparar_ordem();

-- Item novo entra na primeira etapa (ou na que veio, na importação), desde a data de recebimento da OS.
create function public.os_preparar_item() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.etapa_id is null then
    select id into new.etapa_id from public.os_etapas where org_id = new.org_id and ativo order by ordem limit 1;
    if new.etapa_id is null then
      raise exception 'a empresa ainda não tem etapas';
    end if;
  elsif not exists (select 1 from public.os_etapas where id = new.etapa_id and ativo) then
    raise exception 'etapa inválida';
  end if;
  if new.etapa_desde is null then
    select recebida_em into new.etapa_desde from public.ordens_servico where id = new.os_id;
  end if;
  new.etapa_desde := coalesce(new.etapa_desde, current_date);
  return new;
end $$;
create trigger os_preparar_item before insert on public.os_itens
for each row execute function public.os_preparar_item();

create function public.os_item_registrar_entrada() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.os_item_historico (org_id, item_id, etapa_de, etapa_para, data, importado, autor_id)
  values (new.org_id, new.id, null, new.etapa_id, new.etapa_desde,
          coalesce(current_setting('livih.os_importando', true), '') = 'on', auth.uid());
  return null;
end $$;
create trigger os_item_registrar_entrada after insert on public.os_itens
for each row execute function public.os_item_registrar_entrada();

-- Etapa, desfecho, faturamento e pagamento só pelas funções (que gravam o histórico e conferem o papel).
create function public.os_item_protegido() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.etapa_id, new.etapa_desde, new.desfecho, new.desfecho_em, new.faturado_em, new.vencimento_em, new.pago_em, new.os_id)
       is distinct from
     (old.etapa_id, old.etapa_desde, old.desfecho, old.desfecho_em, old.faturado_em, old.vencimento_em, old.pago_em, old.os_id)
     and coalesce(current_setting('livih.os_item', true), '') <> 'on' then
    raise exception 'use as funções de ordens de serviço para mudar etapa, desfecho ou faturamento';
  end if;
  if new.cobranca <> 'cobrado' and new.faturado_em is not null then
    raise exception 'item faturado: desfaça o faturamento antes de mudar a cobrança';
  end if;
  return new;
end $$;
create trigger os_item_protegido before update on public.os_itens
for each row execute function public.os_item_protegido();

-- ============================================================================
-- Regras de acesso: a oficina inteira vê e move os itens; dono e admin configuram, faturam e apagam.
-- ============================================================================
create function public.os_membro(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org) and public.modulo_ativo(p_org, 'os');
$$;
create function public.os_gerente(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.tem_papel(p_org, '{dono,admin}') and public.modulo_ativo(p_org, 'os');
$$;
revoke execute on function public.os_membro(uuid), public.os_gerente(uuid) from public, anon;
grant execute on function public.os_membro(uuid), public.os_gerente(uuid) to authenticated;

alter table public.os_config enable row level security;
alter table public.os_etapas enable row level security;
alter table public.os_servicos enable row level security;
alter table public.os_tipos_item enable row level security;
alter table public.os_prazos_cliente enable row level security;
alter table public.ordens_servico enable row level security;
alter table public.os_itens enable row level security;
alter table public.os_item_historico enable row level security;

create policy os_config_ver on public.os_config for select to authenticated using (public.os_membro(org_id));
create policy os_config_gerir on public.os_config for update to authenticated
  using (public.os_gerente(org_id)) with check (public.os_gerente(org_id));

-- Etapas mudam só por os_salvar_etapas (ordem, marcos e itens das removidas numa transação).
create policy os_etapas_ver on public.os_etapas for select to authenticated using (public.os_membro(org_id));

create policy os_servicos_ver on public.os_servicos for select to authenticated using (public.os_membro(org_id));
create policy os_servicos_gerir on public.os_servicos for all to authenticated
  using (public.os_gerente(org_id)) with check (public.os_gerente(org_id));

create policy os_tipos_ver on public.os_tipos_item for select to authenticated using (public.os_membro(org_id));
create policy os_tipos_gerir on public.os_tipos_item for all to authenticated
  using (public.os_gerente(org_id)) with check (public.os_gerente(org_id));

create policy os_prazos_ver on public.os_prazos_cliente for select to authenticated using (public.os_membro(org_id));
create policy os_prazos_gerir on public.os_prazos_cliente for all to authenticated
  using (public.os_gerente(org_id)) with check (public.os_gerente(org_id));

create policy ordens_servico_ver on public.ordens_servico for select to authenticated using (public.os_membro(org_id));
create policy ordens_servico_criar on public.ordens_servico for insert to authenticated
  with check (public.os_membro(org_id) and (contato_id is null or public.pode_ver_contato(contato_id)));
create policy ordens_servico_editar on public.ordens_servico for update to authenticated
  using (public.os_membro(org_id))
  with check (public.os_membro(org_id) and (contato_id is null or public.pode_ver_contato(contato_id)));
create policy ordens_servico_apagar on public.ordens_servico for delete to authenticated using (public.os_gerente(org_id));

create policy os_itens_ver on public.os_itens for select to authenticated using (public.os_membro(org_id));
create policy os_itens_criar on public.os_itens for insert to authenticated with check (public.os_membro(org_id));
create policy os_itens_editar on public.os_itens for update to authenticated
  using (public.os_membro(org_id)) with check (public.os_membro(org_id));
create policy os_itens_apagar on public.os_itens for delete to authenticated using (public.os_gerente(org_id));

create policy os_historico_ver on public.os_item_historico for select to authenticated using (public.os_membro(org_id));

grant select, update on public.os_config to authenticated;
grant select on public.os_etapas, public.os_item_historico to authenticated;
grant select, insert, update, delete on public.os_servicos, public.os_tipos_item, public.os_prazos_cliente,
  public.ordens_servico, public.os_itens to authenticated;

-- ============================================================================
-- Configuração padrão e etapas
-- ============================================================================

-- Cria a configuração e as etapas padrão na primeira vez que a empresa abre o módulo (idempotente).
create function public.os_preparar(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.os_membro(p_org) then
    raise exception 'ordens de serviço não está ligado nesta empresa';
  end if;
  perform pg_advisory_xact_lock(hashtext('os_preparar:' || p_org::text));
  insert into public.os_config (org_id) values (p_org) on conflict do nothing;
  if not exists (select 1 from public.os_etapas where org_id = p_org) then
    insert into public.os_etapas (org_id, nome, ordem, marco, prazo_padrao_dias) values
      (p_org, 'Recebido', 1, 'recebido', 2),
      (p_org, 'Avaliação e orçamento', 2, 'orcamento', 5),
      (p_org, 'Aguardando aprovação', 3, 'aprovacao', 5),
      (p_org, 'Em reparo', 4, null, 15),
      (p_org, 'Finalizado', 5, 'finalizado', 5),
      (p_org, 'Entregue', 6, 'entregue', null);
  end if;
end $$;
revoke execute on function public.os_preparar(uuid) from public, anon;
grant execute on function public.os_preparar(uuid) to authenticated;

-- Salva as etapas na ordem do quadro. p_etapas: [{"id": uuid | null, "nome", "marco", "prazo_padrao_dias"}].
-- p_mover: {"<id removida>": "<id destino>"} para etapa removida que ainda tem itens abertos (o destino precisa
-- ficar). Removida sai do quadro mas continua no histórico (ativo = false). Itens movidos ganham um passo no
-- histórico com a data de hoje.
create function public.os_salvar_etapas(p_org uuid, p_etapas jsonb, p_mover jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_ordem integer := 0;
  v_id uuid;
  v_removida record;
  v_destino uuid;
  v_ficam uuid[];
begin
  if not public.os_gerente(p_org) then
    raise exception 'só dono e admin mudam as etapas';
  end if;
  if jsonb_typeof(p_etapas) is distinct from 'array' or jsonb_array_length(p_etapas) < 2 then
    raise exception 'são precisas pelo menos duas etapas';
  end if;
  if jsonb_array_length(p_etapas) > 15 then
    raise exception 'no máximo 15 etapas';
  end if;
  if exists (select 1 from jsonb_array_elements(p_etapas) x
              where coalesce(btrim(x ->> 'nome'), '') = '' or length(btrim(x ->> 'nome')) > 40) then
    raise exception 'toda etapa precisa de nome (até 40 caracteres)';
  end if;
  if (select count(distinct lower(btrim(x ->> 'nome'))) from jsonb_array_elements(p_etapas) x) <> jsonb_array_length(p_etapas) then
    raise exception 'há etapas com o mesmo nome';
  end if;
  if exists (select 1 from jsonb_array_elements(p_etapas) x
              where nullif(x ->> 'marco', '') is not null
                and x ->> 'marco' not in ('recebido', 'orcamento', 'aprovacao', 'finalizado', 'entregue')) then
    raise exception 'marco inválido';
  end if;
  if (select count(*) from jsonb_array_elements(p_etapas) x where nullif(x ->> 'marco', '') is not null)
     <> (select count(distinct x ->> 'marco') from jsonb_array_elements(p_etapas) x where nullif(x ->> 'marco', '') is not null) then
    raise exception 'cada marco só pode estar em uma etapa';
  end if;
  if exists (select 1 from jsonb_array_elements(p_etapas) x
              where x ->> 'id' is not null
                and not exists (select 1 from public.os_etapas e where e.id = (x ->> 'id')::uuid and e.org_id = p_org and e.ativo)) then
    raise exception 'etapa inválida';
  end if;

  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_ficam from jsonb_array_elements(p_etapas) x where x ->> 'id' is not null;

  perform set_config('livih.os_item', 'on', true);
  for v_removida in
    select e.id, e.nome from public.os_etapas e where e.org_id = p_org and e.ativo and e.id <> all (v_ficam)
  loop
    if exists (select 1 from public.os_itens where etapa_id = v_removida.id) then
      v_destino := nullif(p_mover ->> v_removida.id::text, '')::uuid;
      if v_destino is null or v_destino <> all (v_ficam) then
        raise exception 'escolha para onde vão os itens de "%"', v_removida.nome;
      end if;
      insert into public.os_item_historico (org_id, item_id, etapa_de, etapa_para, data, autor_id)
      select org_id, id, etapa_id, v_destino, greatest(current_date, etapa_desde), auth.uid()
        from public.os_itens where etapa_id = v_removida.id;
      update public.os_itens set etapa_id = v_destino, etapa_desde = greatest(current_date, etapa_desde)
       where etapa_id = v_removida.id;
    end if;
    update public.os_etapas set ativo = false, marco = null where id = v_removida.id;
  end loop;
  perform set_config('livih.os_item', 'off', true);

  -- Nome e marco provisórios: trocar dois de lugar não pode bater nos índices únicos.
  update public.os_etapas set nome = id::text, marco = null where org_id = p_org and ativo;

  for v_item in select x from jsonb_array_elements(p_etapas) x loop
    v_ordem := v_ordem + 1;
    v_id := nullif(v_item ->> 'id', '')::uuid;
    if v_id is null then
      insert into public.os_etapas (org_id, nome, ordem, marco, prazo_padrao_dias)
      values (p_org, btrim(v_item ->> 'nome'), v_ordem, nullif(v_item ->> 'marco', ''), (nullif(v_item ->> 'prazo_padrao_dias', ''))::integer);
    else
      update public.os_etapas
         set nome = btrim(v_item ->> 'nome'), ordem = v_ordem, marco = nullif(v_item ->> 'marco', ''),
             prazo_padrao_dias = (nullif(v_item ->> 'prazo_padrao_dias', ''))::integer
       where id = v_id;
    end if;
  end loop;
end $$;
revoke execute on function public.os_salvar_etapas(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.os_salvar_etapas(uuid, jsonb, jsonb) to authenticated;

-- ============================================================================
-- Etapa, desfecho, faturamento e pagamento
-- ============================================================================

-- Itens da mesma empresa, todos visíveis para quem chama; devolve a empresa.
create function public.os_conferir_itens(p_itens uuid[], p_gerente boolean)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v_orgs uuid[];
begin
  if coalesce(cardinality(p_itens), 0) = 0 then
    raise exception 'escolha pelo menos um item';
  end if;
  select array_agg(distinct org_id) into v_orgs from public.os_itens where id = any (p_itens);
  if cardinality(v_orgs) is distinct from 1
     or (select count(*) from public.os_itens where id = any (p_itens)) <> (select count(distinct x) from unnest(p_itens) x)
     or not (case when p_gerente then public.os_gerente(v_orgs[1]) else public.os_membro(v_orgs[1]) end) then
    raise exception 'item não encontrado';
  end if;
  return v_orgs[1];
end $$;
revoke execute on function public.os_conferir_itens(uuid[], boolean) from public, anon, authenticated;

-- Move itens abertos para a etapa, na data do fato (hoje, se vazia). Item que já está nela fica como está.
create function public.os_mover_itens(p_itens uuid[], p_etapa uuid, p_data date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.os_conferir_itens(p_itens, false);
  v_data date := coalesce(p_data, current_date);
begin
  if not exists (select 1 from public.os_etapas where id = p_etapa and org_id = v_org and ativo) then
    raise exception 'etapa inválida';
  end if;
  if v_data > current_date then
    raise exception 'a data não pode ser no futuro';
  end if;
  if exists (select 1 from public.os_itens where id = any (p_itens) and desfecho is not null) then
    raise exception 'item encerrado: reabra antes de mover';
  end if;
  if exists (select 1 from public.os_itens where id = any (p_itens) and etapa_id <> p_etapa and etapa_desde > v_data) then
    raise exception 'a data não pode ser antes da entrada na etapa atual';
  end if;

  insert into public.os_item_historico (org_id, item_id, etapa_de, etapa_para, data, autor_id)
  select org_id, id, etapa_id, p_etapa, v_data, auth.uid()
    from public.os_itens where id = any (p_itens) and etapa_id <> p_etapa;
  perform set_config('livih.os_item', 'on', true);
  update public.os_itens set etapa_id = p_etapa, etapa_desde = v_data where id = any (p_itens) and etapa_id <> p_etapa;
  perform set_config('livih.os_item', 'off', true);
end $$;
revoke execute on function public.os_mover_itens(uuid[], uuid, date) from public, anon;
grant execute on function public.os_mover_itens(uuid[], uuid, date) to authenticated;

-- Encerra (não aprovado, sem conserto, cancelado) ou reabre (p_desfecho nulo).
create function public.os_definir_desfecho(p_itens uuid[], p_desfecho text, p_data date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.os_conferir_itens(p_itens, false);
begin
  if p_desfecho is not null and p_desfecho not in ('nao_aprovado', 'sem_conserto', 'cancelado') then
    raise exception 'desfecho inválido';
  end if;
  if coalesce(p_data, current_date) > current_date then
    raise exception 'a data não pode ser no futuro';
  end if;
  perform set_config('livih.os_item', 'on', true);
  update public.os_itens
     set desfecho = p_desfecho,
         desfecho_em = case when p_desfecho is null then null else coalesce(p_data, current_date) end
   where id = any (p_itens) and org_id = v_org;
  perform set_config('livih.os_item', 'off', true);
end $$;
revoke execute on function public.os_definir_desfecho(uuid[], text, date) from public, anon;
grant execute on function public.os_definir_desfecho(uuid[], text, date) to authenticated;

-- Prazo de pagamento de um cliente (o dele, senão o padrão da empresa).
create function public.os_prazo_cliente(p_org uuid, p_contato uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select prazo_pagamento_dias from public.os_prazos_cliente where org_id = p_org and contato_id = p_contato),
    (select prazo_pagamento_dias from public.os_config where org_id = p_org),
    30
  );
$$;
revoke execute on function public.os_prazo_cliente(uuid, uuid) from public, anon, authenticated;

-- Fatura (data do boleto). Vencimento = o informado, senão a data + o prazo do cliente. p_data nulo desfaz.
create function public.os_faturar(p_itens uuid[], p_data date, p_vencimento date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.os_conferir_itens(p_itens, true);
begin
  if p_data is not null and exists (select 1 from public.os_itens where id = any (p_itens) and cobranca <> 'cobrado') then
    raise exception 'item em garantia ou cortesia não é faturado';
  end if;
  if p_vencimento is not null and p_vencimento < p_data then
    raise exception 'o vencimento não pode ser antes do faturamento';
  end if;
  perform set_config('livih.os_item', 'on', true);
  update public.os_itens i
     set faturado_em = p_data,
         vencimento_em = case when p_data is null then null
                              else coalesce(p_vencimento, p_data + public.os_prazo_cliente(v_org, o.contato_id)) end,
         pago_em = case when p_data is null then null else i.pago_em end
    from public.ordens_servico o
   where o.id = i.os_id and i.id = any (p_itens);
  perform set_config('livih.os_item', 'off', true);
end $$;
revoke execute on function public.os_faturar(uuid[], date, date) from public, anon;
grant execute on function public.os_faturar(uuid[], date, date) to authenticated;

-- Pagamento recebido (p_data nulo desfaz).
create function public.os_registrar_pagamento(p_itens uuid[], p_data date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.os_conferir_itens(p_itens, true);
begin
  if p_data is not null and exists (select 1 from public.os_itens where id = any (p_itens) and faturado_em is null) then
    raise exception 'só item faturado recebe pagamento';
  end if;
  perform set_config('livih.os_item', 'on', true);
  update public.os_itens set pago_em = p_data where id = any (p_itens) and org_id = v_org;
  perform set_config('livih.os_item', 'off', true);
end $$;
revoke execute on function public.os_registrar_pagamento(uuid[], date) from public, anon;
grant execute on function public.os_registrar_pagamento(uuid[], date) to authenticated;

-- ============================================================================
-- Importação (planilha no modelo do módulo, docs/ordens-de-servico.md)
-- ============================================================================
-- p_linhas: [{"cliente", "contato_id"?, "nf_cliente", "numero_cliente", "recebida_em", "tipo", "modelo",
--   "identificacao", "valor", "observacao", "cobranca", "desfecho", "desfecho_em",
--   "etapas": [{"etapa_id", "data"}] (em ordem), "faturado_em", "vencimento_em", "pago_em"}]
-- Linhas com o mesmo cliente, NF, número do cliente e recebimento viram uma OS só. Tipo novo é criado pelo nome.
-- Devolve {"ordens": n, "itens": n}.
create function public.os_importar(p_org uuid, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_linha jsonb;
  v_chave text;
  v_os uuid;
  v_tipo uuid;
  v_item uuid;
  v_passo jsonb;
  v_etapa uuid;
  v_data date;
  v_ordens jsonb := '{}';
  v_n_itens integer := 0;
  v_primeira uuid;
begin
  if not public.os_gerente(p_org) then
    raise exception 'só dono e admin importam';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'a planilha não tem linhas';
  end if;
  if jsonb_array_length(p_linhas) > 2000 then
    raise exception 'no máximo 2.000 linhas por importação';
  end if;
  perform public.os_preparar(p_org);
  select id into v_primeira from public.os_etapas where org_id = p_org and ativo order by ordem limit 1;

  perform set_config('livih.os_importando', 'on', true);
  for v_linha in select x from jsonb_array_elements(p_linhas) x loop
    if nullif(v_linha ->> 'recebida_em', '') is null then
      raise exception 'linha sem data de recebimento';
    end if;
    v_chave := concat_ws('|', lower(btrim(coalesce(v_linha ->> 'cliente', ''))), v_linha ->> 'contato_id',
                         btrim(coalesce(v_linha ->> 'nf_cliente', '')), btrim(coalesce(v_linha ->> 'numero_cliente', '')),
                         v_linha ->> 'recebida_em');
    v_os := (v_ordens ->> v_chave)::uuid;
    if v_os is null then
      insert into public.ordens_servico (org_id, contato_id, cliente_nome, nf_cliente, numero_cliente, recebida_em)
      values (p_org, nullif(v_linha ->> 'contato_id', '')::uuid, v_linha ->> 'cliente', nullif(btrim(v_linha ->> 'nf_cliente'), ''),
              nullif(btrim(v_linha ->> 'numero_cliente'), ''), (v_linha ->> 'recebida_em')::date)
      returning id into v_os;
      v_ordens := v_ordens || jsonb_build_object(v_chave, v_os);
    end if;

    v_tipo := null;
    if nullif(btrim(v_linha ->> 'tipo'), '') is not null then
      select id into v_tipo from public.os_tipos_item where org_id = p_org and ativo and lower(nome) = lower(btrim(v_linha ->> 'tipo'));
      if v_tipo is null then
        insert into public.os_tipos_item (org_id, nome) values (p_org, btrim(v_linha ->> 'tipo')) returning id into v_tipo;
      end if;
    end if;

    -- Entra na primeira etapa no recebimento; os passos da planilha seguem em ordem de data.
    insert into public.os_itens (org_id, os_id, tipo_id, modelo, identificacao, valor, observacao, cobranca, etapa_id, etapa_desde, ordem)
    values (p_org, v_os, v_tipo, nullif(btrim(v_linha ->> 'modelo'), ''), nullif(btrim(v_linha ->> 'identificacao'), ''),
            coalesce(nullif(v_linha ->> 'valor', '')::numeric, 0), nullif(btrim(v_linha ->> 'observacao'), ''),
            coalesce(nullif(v_linha ->> 'cobranca', ''), 'cobrado'), v_primeira, (v_linha ->> 'recebida_em')::date, v_n_itens)
    returning id into v_item;
    v_n_itens := v_n_itens + 1;

    perform set_config('livih.os_item', 'on', true);
    for v_passo in select x from jsonb_array_elements(coalesce(v_linha -> 'etapas', '[]')) x order by (x ->> 'data')::date loop
      v_etapa := (v_passo ->> 'etapa_id')::uuid;
      v_data := (v_passo ->> 'data')::date;
      if not exists (select 1 from public.os_etapas where id = v_etapa and org_id = p_org and ativo) then
        raise exception 'etapa inválida na importação';
      end if;
      if v_etapa <> (select etapa_id from public.os_itens where id = v_item) then
        insert into public.os_item_historico (org_id, item_id, etapa_de, etapa_para, data, importado, autor_id)
        select p_org, v_item, etapa_id, v_etapa, greatest(v_data, etapa_desde), true, auth.uid() from public.os_itens where id = v_item;
        update public.os_itens set etapa_id = v_etapa, etapa_desde = greatest(v_data, etapa_desde) where id = v_item;
      end if;
    end loop;
    update public.os_itens
       set desfecho = nullif(v_linha ->> 'desfecho', ''),
           desfecho_em = case when nullif(v_linha ->> 'desfecho', '') is null then null
                              else coalesce(nullif(v_linha ->> 'desfecho_em', '')::date, etapa_desde) end,
           faturado_em = nullif(v_linha ->> 'faturado_em', '')::date,
           vencimento_em = case when nullif(v_linha ->> 'faturado_em', '') is null then null
                                else coalesce(nullif(v_linha ->> 'vencimento_em', '')::date,
                                              (v_linha ->> 'faturado_em')::date
                                              + public.os_prazo_cliente(p_org, nullif(v_linha ->> 'contato_id', '')::uuid)) end,
           pago_em = case when nullif(v_linha ->> 'faturado_em', '') is null then null else nullif(v_linha ->> 'pago_em', '')::date end
     where id = v_item;
    perform set_config('livih.os_item', 'off', true);
  end loop;
  perform set_config('livih.os_importando', 'off', true);

  return jsonb_build_object('ordens', (select count(*) from jsonb_object_keys(v_ordens)), 'itens', v_n_itens);
end $$;
revoke execute on function public.os_importar(uuid, jsonb) from public, anon;
grant execute on function public.os_importar(uuid, jsonb) to authenticated;

-- ============================================================================
-- Tempo normal das etapas e previsão
-- ============================================================================

-- Dias que cada passagem por etapa durou (do passo que entrou ao seguinte), para os itens da empresa.
create function public.os_duracoes(p_org uuid)
returns table (item_id uuid, tipo_id uuid, etapa_id uuid, inicio date, fim date, dias integer)
language sql stable security definer set search_path = '' as $$
  select h.item_id, i.tipo_id, h.etapa_para, h.data, h.proxima, (h.proxima - h.data)
    from (
      select hh.item_id, hh.etapa_para, hh.data,
             lead(hh.data) over (partition by hh.item_id order by hh.data, hh.id) as proxima
        from public.os_item_historico hh where hh.org_id = p_org
    ) h
    join public.os_itens i on i.id = h.item_id
   where h.proxima is not null;
$$;
revoke execute on function public.os_duracoes(uuid) from public, anon, authenticated;

-- Tempo normal (dias) de cada etapa por tipo: mediana dos últimos 180 dias com pelo menos 5 passagens do tipo; senão
-- a de todos os tipos; senão o prazo padrão da etapa; senão 0. "base" diz de onde veio.
create function public.os_tempo_normal(p_org uuid)
returns table (etapa_id uuid, tipo_id uuid, dias numeric, base text)
language sql stable security definer set search_path = '' as $$
  with d as (select * from public.os_duracoes(p_org) where fim >= current_date - 180),
  por_tipo as (
    select d.etapa_id, d.tipo_id, percentile_cont(0.5) within group (order by d.dias) as dias
      from d where d.tipo_id is not null group by d.etapa_id, d.tipo_id having count(*) >= 5
  ),
  geral as (
    select d.etapa_id, percentile_cont(0.5) within group (order by d.dias) as dias
      from d group by d.etapa_id having count(*) >= 5
  ),
  tipos as (select null::uuid as tipo_id union all select id from public.os_tipos_item where org_id = p_org)
  select e.id, t.tipo_id,
         coalesce(pt.dias, g.dias, e.prazo_padrao_dias, 0)::numeric,
         case when pt.dias is not null then 'historico_tipo' when g.dias is not null then 'historico'
              when e.prazo_padrao_dias is not null then 'prazo_padrao' else 'sem_dado' end
    from public.os_etapas e
    cross join tipos t
    left join por_tipo pt on pt.etapa_id = e.id and pt.tipo_id = t.tipo_id
    left join geral g on g.etapa_id = e.id
   where e.org_id = p_org and e.ativo;
$$;
revoke execute on function public.os_tempo_normal(uuid) from public, anon, authenticated;

-- Previsão de cada item aberto ou a receber: quando termina (marco finalizado; sem ele, a última etapa), quando
-- fatura e quando o dinheiro entra. Sempre estimativa.
create function public.os_previsao_itens(p_org uuid)
returns table (item_id uuid, finaliza_em date, fatura_em date, recebe_em date, em_orcamento boolean, parado boolean,
               dias_na_etapa integer, normal_etapa numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_fim_ordem integer;
  v_aprov_ordem integer;
  v_fator numeric;
  v_fat_dias numeric;
begin
  if not public.os_membro(p_org) then
    raise exception 'ordens de serviço não está ligado nesta empresa';
  end if;
  select coalesce((select ordem from public.os_etapas where org_id = p_org and ativo and marco = 'finalizado'),
                  (select max(ordem) from public.os_etapas where org_id = p_org and ativo))
    into v_fim_ordem;
  select ordem into v_aprov_ordem from public.os_etapas where org_id = p_org and ativo and marco = 'aprovacao';
  select coalesce((select alerta_fator from public.os_config where org_id = p_org), 1.5) into v_fator;
  -- Dias entre chegar ao finalizado e faturar (mediana dos últimos 180 dias, com pelo menos 5).
  select case when count(*) >= 5 then percentile_cont(0.5) within group (order by i.faturado_em - h.data) end
    into v_fat_dias
    from public.os_itens i
    join lateral (
      select min(hh.data) as data from public.os_item_historico hh
        join public.os_etapas e on e.id = hh.etapa_para
       where hh.item_id = i.id and e.ordem >= v_fim_ordem and e.ativo
    ) h on h.data is not null
   where i.org_id = p_org and i.faturado_em >= current_date - 180;

  return query
  with normal as (select * from public.os_tempo_normal(p_org)),
  base as (
    select i.id, i.tipo_id, i.etapa_id, i.etapa_desde, i.faturado_em, i.vencimento_em, i.pago_em, i.desfecho, i.cobranca,
           o.contato_id, e.ordem,
           (current_date - i.etapa_desde) as na_etapa,
           coalesce((select n.dias from normal n where n.etapa_id = i.etapa_id and n.tipo_id is not distinct from i.tipo_id),
                    (select n.dias from normal n where n.etapa_id = i.etapa_id and n.tipo_id is null), 0) as normal_atual,
           (select min(hh.data) from public.os_item_historico hh join public.os_etapas he on he.id = hh.etapa_para
             where hh.item_id = i.id and he.ativo and he.ordem >= v_fim_ordem) as chegou_fim
      from public.os_itens i
      join public.ordens_servico o on o.id = i.os_id
      join public.os_etapas e on e.id = i.etapa_id
     where i.org_id = p_org and i.pago_em is null
       and (i.desfecho is null or i.faturado_em is not null)
  ),
  calc as (
    select b.*,
           case
             when b.ordem >= v_fim_ordem then coalesce(b.chegou_fim, b.etapa_desde)
             else current_date
                  + ceil(greatest(b.normal_atual - b.na_etapa, 0))::integer
                  + ceil(coalesce((
                      select sum(coalesce(
                               (select n.dias from normal n where n.etapa_id = e2.id and n.tipo_id is not distinct from b.tipo_id),
                               (select n.dias from normal n where n.etapa_id = e2.id and n.tipo_id is null), 0))
                        from public.os_etapas e2
                       where e2.org_id = p_org and e2.ativo and e2.ordem > b.ordem and e2.ordem < v_fim_ordem), 0))::integer
           end as fim_previsto
      from base b
  )
  select c.id,
         c.fim_previsto,
         case when c.cobranca <> 'cobrado' then null
              else coalesce(c.faturado_em, greatest(c.fim_previsto + ceil(coalesce(v_fat_dias, 0))::integer, current_date)) end,
         case when c.cobranca <> 'cobrado' then null
              when c.faturado_em is not null then c.vencimento_em
              else greatest(c.fim_previsto + ceil(coalesce(v_fat_dias, 0))::integer, current_date)
                   + public.os_prazo_cliente(p_org, c.contato_id) end,
         (v_aprov_ordem is not null and c.ordem <= v_aprov_ordem and c.faturado_em is null),
         (c.desfecho is null and c.ordem < v_fim_ordem and c.normal_atual > 0 and c.na_etapa > c.normal_atual * v_fator),
         c.na_etapa,
         c.normal_atual
    from calc c;
end $$;
revoke execute on function public.os_previsao_itens(uuid) from public, anon;
grant execute on function public.os_previsao_itens(uuid) to authenticated;

-- ============================================================================
-- Painel da oficina (dono e admin)
-- ============================================================================
create function public.os_painel(p_org uuid, p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_fim_ordem integer;
  v_aprov_ordem integer;
  v_res jsonb;
begin
  if not public.os_gerente(p_org) then
    raise exception 'só dono e admin veem o painel da oficina';
  end if;
  if p_de > p_ate or p_ate - p_de > 400 then
    raise exception 'período inválido';
  end if;
  select coalesce((select ordem from public.os_etapas where org_id = p_org and ativo and marco = 'finalizado'),
                  (select max(ordem) from public.os_etapas where org_id = p_org and ativo))
    into v_fim_ordem;
  select ordem into v_aprov_ordem from public.os_etapas where org_id = p_org and ativo and marco = 'aprovacao';

  with prev as (select * from public.os_previsao_itens(p_org)),
  itens as (
    select i.*, o.recebida_em, o.cliente_nome, o.numero as os_numero
      from public.os_itens i join public.ordens_servico o on o.id = i.os_id
     where i.org_id = p_org
  ),
  -- Primeira chegada de cada item ao finalizado (ou além).
  chegadas as (
    select hh.item_id, min(hh.data) as data
      from public.os_item_historico hh join public.os_etapas e on e.id = hh.etapa_para
     where hh.org_id = p_org and e.ativo and e.ordem >= v_fim_ordem
     group by hh.item_id
  ),
  dur as (select * from public.os_duracoes(p_org) where fim between p_de and p_ate)
  select jsonb_build_object(
    'etapas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'nome', e.nome, 'marco', e.marco, 'ordem', e.ordem,
               'itens', (select count(*) from itens i where i.etapa_id = e.id and i.desfecho is null),
               'valor', (select coalesce(sum(i.valor), 0) from itens i where i.etapa_id = e.id and i.desfecho is null and i.cobranca = 'cobrado'),
               'parados', (select count(*) from itens i join prev p on p.item_id = i.id where i.etapa_id = e.id and p.parado),
               'mediana_dias', (select percentile_cont(0.5) within group (order by d.dias) from dur d where d.etapa_id = e.id),
               'passagens', (select count(*) from dur d where d.etapa_id = e.id)
             ) order by e.ordem), '[]')
        from public.os_etapas e where e.org_id = p_org and e.ativo
    ),
    'tipos', (
      select coalesce(jsonb_agg(x order by x ->> 'nome'), '[]') from (
        select jsonb_build_object(
                 'tipo_id', t.id, 'nome', coalesce(t.nome, 'Sem tipo'),
                 'finalizados', count(*),
                 'mediana_dias', percentile_cont(0.5) within group (order by c.data - i.recebida_em)
               ) as x
          from chegadas c join itens i on i.id = c.item_id left join public.os_tipos_item t on t.id = i.tipo_id
         where c.data between p_de and p_ate
         group by t.id, t.nome
      ) s
    ),
    'recebidos', (select count(*) from itens where recebida_em between p_de and p_ate),
    'finalizados', (select count(*) from chegadas where data between p_de and p_ate),
    'por_semana', (
      select coalesce(jsonb_agg(jsonb_build_object('semana', s.semana, 'recebidos', s.recebidos, 'finalizados', s.finalizados) order by s.semana), '[]')
        from (
          select g.semana::date as semana,
                 (select count(*) from itens i where date_trunc('week', i.recebida_em) = g.semana) as recebidos,
                 (select count(*) from chegadas c where date_trunc('week', c.data) = g.semana) as finalizados
            from generate_series(date_trunc('week', p_de), date_trunc('week', p_ate), interval '1 week') g(semana)
        ) s
    ),
    'aprovacao', case when v_aprov_ordem is null then null else (
      select jsonb_build_object(
        'aprovados', (select count(distinct hh.item_id) from public.os_item_historico hh
                        join public.os_etapas e on e.id = hh.etapa_para
                        join public.os_etapas ed on ed.id = hh.etapa_de
                       where hh.org_id = p_org and hh.data between p_de and p_ate
                         and ed.ordem <= v_aprov_ordem and e.ordem > v_aprov_ordem),
        'nao_aprovados', (select count(*) from itens where desfecho = 'nao_aprovado' and desfecho_em between p_de and p_ate)
      )) end,
    'desfechos', (
      select coalesce(jsonb_object_agg(desfecho, n), '{}') from (
        select desfecho, count(*) n from itens where desfecho is not null and desfecho_em between p_de and p_ate group by desfecho
      ) s
    ),
    'financeiro', jsonb_build_object(
      'faturado', (select coalesce(sum(valor), 0) from itens where faturado_em between p_de and p_ate),
      'recebido', (select coalesce(sum(valor), 0) from itens where pago_em between p_de and p_ate),
      'vencido', (select coalesce(sum(valor), 0) from itens where faturado_em is not null and pago_em is null and vencimento_em < current_date),
      'a_vencer', (select coalesce(sum(valor), 0) from itens where faturado_em is not null and pago_em is null and vencimento_em >= current_date),
      'sem_faturar', (select coalesce(sum(i.valor), 0) from itens i join chegadas c on c.item_id = i.id
                       where i.faturado_em is null and i.cobranca = 'cobrado' and i.desfecho is null)
    ),
    -- Caixa: confirmado = já faturado (pelo vencimento); previsto = em andamento (pela previsão). De hoje até 15/30/60/90
    -- dias: o que já venceu fica em financeiro.vencido.
    'caixa', (
      select jsonb_agg(jsonb_build_object(
               'dias', f.dias,
               'confirmado', (select coalesce(sum(i.valor), 0) from prev p join itens i on i.id = p.item_id
                               where i.faturado_em is not null and p.recebe_em between current_date and current_date + f.dias),
               'previsto', (select coalesce(sum(i.valor), 0) from prev p join itens i on i.id = p.item_id
                             where i.faturado_em is null and not p.em_orcamento and p.recebe_em <= current_date + f.dias)
             ) order by f.dias)
        from unnest(array[15, 30, 60, 90]) f(dias)
    ),
    'em_orcamento', (
      select jsonb_build_object('itens', count(*), 'valor', coalesce(sum(i.valor), 0))
        from prev p join itens i on i.id = p.item_id where p.em_orcamento and i.desfecho is null and i.cobranca = 'cobrado'
    ),
    'parados', (
      select coalesce(jsonb_agg(x), '[]') from (
        select jsonb_build_object(
                 'item_id', i.id, 'os_id', i.os_id, 'os_numero', i.os_numero, 'cliente', i.cliente_nome,
                 'modelo', i.modelo, 'identificacao', i.identificacao, 'etapa', e.nome,
                 'dias', p.dias_na_etapa, 'normal', p.normal_etapa
               ) as x
          from prev p join itens i on i.id = p.item_id join public.os_etapas e on e.id = i.etapa_id
         where p.parado
         order by (p.dias_na_etapa / nullif(p.normal_etapa, 0)) desc
         limit 50
      ) s
    )
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.os_painel(uuid, date, date) from public, anon;
grant execute on function public.os_painel(uuid, date, date) to authenticated;
