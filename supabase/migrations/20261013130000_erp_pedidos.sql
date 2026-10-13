-- ERP, primeira entrega (módulo 'erp'): produtos, pedidos e estoque. Genérico para pequena e média empresa
-- que vende produto; a JoGrampo é o primeiro cliente, não o molde.
--
-- Estoque é livro-razão: cada entrada e saída é uma linha que não muda nem some (como as mensagens). O saldo
-- é a soma. Confirmar um pedido baixa o estoque dos itens; cancelar (ou voltar para rascunho) devolve.
-- Saldo negativo é permitido de propósito: a empresa que está começando ainda não contou o estoque, e
-- travar a venda por isso seria pior. A tela avisa.

-- ============================================================================
-- Produtos
-- ============================================================================
create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  codigo text check (length(codigo) <= 60),
  nome text not null check (length(btrim(nome)) between 1 and 200),
  descricao text check (length(descricao) <= 2000),
  unidade text not null default 'un' check (length(btrim(unidade)) between 1 and 10),
  preco numeric(14, 2) not null default 0 check (preco >= 0),
  controla_estoque boolean not null default true,
  estoque_minimo numeric(14, 3) check (estoque_minimo >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, org_id)
);
create unique index produtos_codigo_unico on public.produtos (org_id, lower(codigo)) where codigo is not null;
create index produtos_nome_idx on public.produtos (org_id, lower(nome));
create trigger produtos_atualizado_em before update on public.produtos
for each row execute function public.tocar_atualizado_em();

-- ============================================================================
-- Estoque (livro-razão)
-- ============================================================================
create table public.estoque_movimentos (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  produto_id uuid not null,
  quantidade numeric(14, 3) not null check (quantidade <> 0),   -- positivo entra, negativo sai
  tipo text not null check (tipo in ('entrada', 'ajuste', 'pedido', 'estorno')),
  pedido_id uuid,
  motivo text check (length(motivo) <= 300),
  autor_id uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default clock_timestamp(),
  foreign key (produto_id, org_id) references public.produtos (id, org_id) on delete cascade
);
create index estoque_movimentos_produto_idx on public.estoque_movimentos (produto_id, criado_em);

create function public.estoque_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'movimentos de estoque não mudam nem são apagados; lance um ajuste';
end $$;
create trigger estoque_imutavel before update or delete on public.estoque_movimentos
for each row when (pg_trigger_depth() = 0) execute function public.estoque_imutavel();

-- ============================================================================
-- Pedidos
-- ============================================================================
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  numero integer not null,
  contato_id uuid,
  oportunidade_id uuid,
  status text not null default 'rascunho'
    check (status in ('rascunho', 'confirmado', 'separando', 'enviado', 'entregue', 'cancelado')),
  origem text not null default 'manual' check (origem in ('manual', 'agente')),
  observacao text check (length(observacao) <= 2000),
  desconto numeric(14, 2) not null default 0 check (desconto >= 0),
  frete numeric(14, 2) not null default 0 check (frete >= 0),
  subtotal numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  estoque_baixado boolean not null default false,
  responsavel_id uuid references auth.users (id) on delete set null,
  criado_por uuid references auth.users (id) on delete set null,
  confirmado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, numero),
  unique (id, org_id),
  foreign key (contato_id, org_id) references public.contatos (id, org_id) on delete set null (contato_id),
  foreign key (oportunidade_id, org_id) references public.oportunidades (id, org_id) on delete set null (oportunidade_id)
);
create index pedidos_lista_idx on public.pedidos (org_id, criado_em desc);
create index pedidos_contato_idx on public.pedidos (contato_id);
create trigger pedidos_atualizado_em before update on public.pedidos
for each row execute function public.tocar_atualizado_em();

alter table public.estoque_movimentos
  add foreign key (pedido_id, org_id) references public.pedidos (id, org_id) on delete set null (pedido_id);

create table public.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  pedido_id uuid not null,
  produto_id uuid,
  descricao text not null check (length(btrim(descricao)) between 1 and 200),
  quantidade numeric(14, 3) not null check (quantidade > 0),
  preco_unitario numeric(14, 2) not null check (preco_unitario >= 0),
  subtotal numeric(14, 2) generated always as (round(quantidade * preco_unitario, 2)) stored,
  ordem integer not null default 0,
  foreign key (pedido_id, org_id) references public.pedidos (id, org_id) on delete cascade,
  foreign key (produto_id, org_id) references public.produtos (id, org_id) on delete set null (produto_id)
);
create index pedido_itens_pedido_idx on public.pedido_itens (pedido_id, ordem);

-- Número sequencial por empresa (#1, #2…), quem criou e coerência da oportunidade com o cliente.
create function public.pedido_preparar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_contato uuid;
begin
  if tg_op = 'UPDATE' and old.status <> 'rascunho'
     and (new.contato_id, new.desconto, new.frete) is distinct from (old.contato_id, old.desconto, old.frete) then
    raise exception 'cliente, desconto e frete só mudam no rascunho';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('pedido_numero:' || new.org_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero from public.pedidos where org_id = new.org_id;
    new.criado_por := coalesce(new.criado_por, auth.uid());
    new.status := 'rascunho';
    new.estoque_baixado := false;
  end if;
  if new.responsavel_id is not null and not exists (
    select 1 from public.membros_org where org_id = new.org_id and user_id = new.responsavel_id and ativo
  ) then
    raise exception 'o responsável precisa ser da equipe';
  end if;
  if new.oportunidade_id is not null then
    select contato_id into v_contato from public.oportunidades where id = new.oportunidade_id;
    if new.contato_id is null then
      new.contato_id := v_contato;
    elsif v_contato is distinct from new.contato_id then
      raise exception 'a oportunidade é de outro cliente';
    end if;
  end if;
  new.total := greatest(new.subtotal - new.desconto + new.frete, 0);
  return new;
end $$;
create trigger pedido_preparar before insert or update on public.pedidos
for each row execute function public.pedido_preparar();

-- Itens só mudam no rascunho; o subtotal do pedido acompanha.
create function public.pedido_item_guardar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
  v_status text;
begin
  select status into v_status from public.pedidos where id = v_pedido;
  if v_status is not null and v_status <> 'rascunho' then
    raise exception 'só dá para mudar os itens de um pedido em rascunho';
  end if;
  return coalesce(new, old);
end $$;
create trigger pedido_item_guardar before insert or update or delete on public.pedido_itens
for each row execute function public.pedido_item_guardar();

create function public.pedido_recalcular() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
begin
  update public.pedidos
     set subtotal = coalesce((select sum(subtotal) from public.pedido_itens where pedido_id = v_pedido), 0)
   where id = v_pedido;
  return null;
end $$;
create trigger pedido_recalcular after insert or update or delete on public.pedido_itens
for each row execute function public.pedido_recalcular();

-- ============================================================================
-- Regras de acesso
-- ============================================================================
create function public.pode_ver_pedido(p_org uuid, p_contato uuid, p_responsavel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org) and public.modulo_ativo(p_org, 'erp')
     and (p_contato is null or p_responsavel = auth.uid() or public.pode_ver_contato(p_contato));
$$;
revoke execute on function public.pode_ver_pedido(uuid, uuid, uuid) from public, anon;
grant execute on function public.pode_ver_pedido(uuid, uuid, uuid) to authenticated;

alter table public.produtos enable row level security;
alter table public.estoque_movimentos enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_itens enable row level security;

-- Catálogo: a equipe toda vê (para montar pedido); dono e admin cadastram.
create policy produtos_ver on public.produtos for select to authenticated
  using (public.eh_membro(org_id) and public.modulo_ativo(org_id, 'erp'));
create policy produtos_criar on public.produtos for insert to authenticated
  with check (public.tem_papel(org_id, '{dono,admin}') and public.modulo_ativo(org_id, 'erp'));
create policy produtos_editar on public.produtos for update to authenticated
  using (public.tem_papel(org_id, '{dono,admin}') and public.modulo_ativo(org_id, 'erp'))
  with check (public.tem_papel(org_id, '{dono,admin}'));
-- Produto com movimento de estoque não sai (o histórico depende dele): desativa.
create policy produtos_apagar on public.produtos for delete to authenticated
  using (public.tem_papel(org_id, '{dono,admin}')
         and not exists (select 1 from public.estoque_movimentos m where m.produto_id = produtos.id));

-- Estoque: todos leem; lançamento só pelas funções abaixo.
create policy estoque_ver on public.estoque_movimentos for select to authenticated
  using (public.eh_membro(org_id) and public.modulo_ativo(org_id, 'erp'));

-- Pedidos: carteira (cliente que a pessoa vê, ou pedido dela); a situação muda só por pedido_mudar_status.
create policy pedidos_ver on public.pedidos for select to authenticated
  using (public.pode_ver_pedido(org_id, contato_id, responsavel_id));
create policy pedidos_criar on public.pedidos for insert to authenticated
  with check (public.eh_membro(org_id) and public.modulo_ativo(org_id, 'erp')
              and (contato_id is null or public.pode_ver_contato(contato_id)));
create policy pedidos_editar on public.pedidos for update to authenticated
  using (public.pode_ver_pedido(org_id, contato_id, responsavel_id))
  with check (public.eh_membro(org_id) and (contato_id is null or public.pode_ver_contato(contato_id)));
create policy pedidos_apagar on public.pedidos for delete to authenticated
  using (status = 'rascunho' and public.pode_ver_pedido(org_id, contato_id, responsavel_id));

create policy itens_ver on public.pedido_itens for select to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id));
create policy itens_gerir on public.pedido_itens for all to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id))
  with check (exists (select 1 from public.pedidos p where p.id = pedido_id and p.org_id = pedido_itens.org_id));

grant select, insert, update, delete on public.produtos, public.pedidos, public.pedido_itens to authenticated;
grant select on public.estoque_movimentos to authenticated;

-- Status do pedido não é coluna livre: só pela função (que mexe no estoque junto).
create function public.pedido_status_protegido() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.status, new.estoque_baixado, new.confirmado_em) is distinct from (old.status, old.estoque_baixado, old.confirmado_em)
     and coalesce(current_setting('livih.pedido_status', true), '') <> 'on' then
    raise exception 'use pedido_mudar_status para mudar a situação do pedido';
  end if;
  return new;
end $$;
create trigger pedido_status_protegido before update on public.pedidos
for each row execute function public.pedido_status_protegido();

-- ============================================================================
-- Funções
-- ============================================================================

-- Saldo de cada produto (security_invoker: a RLS de quem consulta vale).
create view public.produtos_saldo with (security_invoker = true) as
  select p.*, coalesce((select sum(m.quantidade) from public.estoque_movimentos m where m.produto_id = p.id), 0)::numeric(14, 3) as saldo
    from public.produtos p;
grant select on public.produtos_saldo to authenticated;

-- Muda a situação do pedido. Sair do rascunho baixa o estoque; cancelar ou voltar ao rascunho devolve.
create function public.pedido_mudar_status(p_pedido uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.pedidos;
  v_baixa boolean;
begin
  select * into v from public.pedidos where id = p_pedido for update;
  if v.id is null or not public.pode_ver_pedido(v.org_id, v.contato_id, v.responsavel_id) then
    raise exception 'pedido não encontrado';
  end if;
  if not (
    (v.status = 'rascunho' and p_status in ('confirmado', 'cancelado')) or
    (v.status = 'confirmado' and p_status in ('rascunho', 'separando', 'enviado', 'entregue', 'cancelado')) or
    (v.status = 'separando' and p_status in ('confirmado', 'enviado', 'entregue', 'cancelado')) or
    (v.status = 'enviado' and p_status in ('entregue', 'cancelado'))
  ) then
    raise exception 'não dá para passar de % para %', v.status, p_status;
  end if;
  if p_status <> 'rascunho' and p_status <> 'cancelado' and not exists (select 1 from public.pedido_itens where pedido_id = v.id) then
    raise exception 'o pedido não tem itens';
  end if;

  v_baixa := p_status not in ('rascunho', 'cancelado');
  if v_baixa and not v.estoque_baixado then
    insert into public.estoque_movimentos (org_id, produto_id, quantidade, tipo, pedido_id, autor_id)
    select i.org_id, i.produto_id, -i.quantidade, 'pedido', v.id, auth.uid()
      from public.pedido_itens i join public.produtos pr on pr.id = i.produto_id
     where i.pedido_id = v.id and pr.controla_estoque;
  elsif not v_baixa and v.estoque_baixado then
    -- Devolve o líquido que o pedido ainda tem baixado em cada produto.
    insert into public.estoque_movimentos (org_id, produto_id, quantidade, tipo, pedido_id, autor_id, motivo)
    select v.org_id, m.produto_id, -sum(m.quantidade), 'estorno', v.id, auth.uid(),
           case when p_status = 'cancelado' then 'pedido cancelado' else 'pedido voltou para rascunho' end
      from public.estoque_movimentos m
     where m.pedido_id = v.id and m.tipo in ('pedido', 'estorno')
     group by m.produto_id
    having sum(m.quantidade) <> 0;
  end if;

  perform set_config('livih.pedido_status', 'on', true);
  update public.pedidos
     set status = p_status,
         estoque_baixado = v_baixa,
         confirmado_em = case when v_baixa then coalesce(confirmado_em, now()) when p_status = 'rascunho' then null else confirmado_em end
   where id = v.id;
  perform set_config('livih.pedido_status', 'off', true);
end $$;
revoke execute on function public.pedido_mudar_status(uuid, text) from public, anon;
grant execute on function public.pedido_mudar_status(uuid, text) to authenticated;

-- Entrada ou ajuste manual (dono/admin). Quantidade positiva entra, negativa sai; ajuste exige motivo.
create function public.estoque_lancar(p_produto uuid, p_quantidade numeric, p_tipo text, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.produtos where id = p_produto;
  if v_org is null or not public.tem_papel(v_org, '{dono,admin}') or not public.modulo_ativo(v_org, 'erp') then
    raise exception 'produto não encontrado';
  end if;
  if p_tipo not in ('entrada', 'ajuste') then
    raise exception 'tipo inválido';
  end if;
  if coalesce(p_quantidade, 0) = 0 or (p_tipo = 'entrada' and p_quantidade < 0) then
    raise exception 'quantidade inválida';
  end if;
  if p_tipo = 'ajuste' and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'ajuste precisa de motivo';
  end if;
  insert into public.estoque_movimentos (org_id, produto_id, quantidade, tipo, motivo, autor_id)
  values (v_org, p_produto, p_quantidade, p_tipo, nullif(btrim(p_motivo), ''), auth.uid());
end $$;
revoke execute on function public.estoque_lancar(uuid, numeric, text, text) from public, anon;
grant execute on function public.estoque_lancar(uuid, numeric, text, text) to authenticated;
