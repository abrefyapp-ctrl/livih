-- Financeiro, entrega 1 (docs/financeiro.md, plano de 28/10).
--
-- Contas a receber, contas a pagar e caixa: o ponto fraco do ERP da Livih na comparação com o Bling e a Omie.
-- Decisões de 28/10: vem incluído no ERP e nas OS (liga quando um dos dois módulos está ligado, sem módulo próprio);
-- dono e admin veem e fazem tudo, e o membro com a permissão nova "Financeiro" lança e dá baixa. Contas e categorias
-- só dono e admin configuram.
--
-- Tudo é lançamento (uma parcela a receber ou a pagar). Cada pagamento é uma baixa; a parcela aceita várias (pagamento
-- em parte), e desfazer não apaga: marca a baixa como desfeita, com quem e por quê. Cancelar o lançamento exige
-- desfazer as baixas antes. O saldo de cada conta é calculado (saldo inicial + baixas + transferências), nunca
-- guardado.
--
-- Nesta entrega os lançamentos são manuais. Pedido, OS e nota de entrada (entrega 2) entram pela coluna origem, já
-- prevista. As tabelas não aceitam gravação direta da tela (só select pela RLS): grava-se pelas funções fin_*.

-- ============================================================================
-- Permissão "Financeiro"
-- ============================================================================
alter table public.membros_org add column financeiro boolean not null default false;
comment on column public.membros_org.financeiro is 'lança e dá baixa no financeiro (dono e admin sempre podem); contas e categorias continuam só com dono e admin';

-- O financeiro está ligado quando o ERP ou as OS estão ligados (decisão de 28/10: incluído nos dois).
create function public.fin_ligado(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.modulo_ativo(p_org, 'erp') or public.modulo_ativo(p_org, 'os');
$$;

create function public.pode_financeiro(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.fin_ligado(p_org) and (
    public.tem_papel(p_org, '{dono,admin}') or exists (
      select 1 from public.membros_org m join public.organizacoes o on o.id = m.org_id
       where m.org_id = p_org and m.user_id = auth.uid() and m.ativo and m.financeiro and o.status = 'ativa'
    )
  );
$$;

revoke execute on function public.fin_ligado(uuid), public.pode_financeiro(uuid) from public, anon;
grant execute on function public.fin_ligado(uuid), public.pode_financeiro(uuid) to authenticated;

-- Mensagens iguais em todas as funções: a tela mostra o texto do erro.
create function public.fin_exigir(p_org uuid, p_gerente boolean default false) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.fin_ligado(p_org) then
    raise exception 'o financeiro não está ligado: ele vem com o módulo ERP ou Ordens de serviço';
  end if;
  if p_gerente then
    if not public.tem_papel(p_org, '{dono,admin}') then
      raise exception 'só dono e admin configuram contas e categorias';
    end if;
  elsif not public.pode_financeiro(p_org) then
    raise exception 'você não tem acesso ao financeiro: peça ao dono a permissão Financeiro';
  end if;
end $$;
revoke execute on function public.fin_exigir(uuid, boolean) from public, anon, authenticated;

create function public.membro_definir_financeiro(p_org uuid, p_usuario uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes boolean;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin mudam esta permissão';
  end if;
  select financeiro into v_antes from public.membros_org where org_id = p_org and user_id = p_usuario;
  if v_antes is null then
    raise exception 'membro não encontrado';
  end if;
  update public.membros_org set financeiro = coalesce(p_valor, false) where org_id = p_org and user_id = p_usuario;
  if v_antes is distinct from coalesce(p_valor, false) then
    perform public.auditar(p_org, 'financeiro', 'membros_org', p_usuario::text,
                           jsonb_build_object('financeiro', v_antes), jsonb_build_object('financeiro', coalesce(p_valor, false)));
  end if;
end $$;
revoke execute on function public.membro_definir_financeiro(uuid, uuid, boolean) from public, anon;
grant execute on function public.membro_definir_financeiro(uuid, uuid, boolean) to authenticated;

-- ============================================================================
-- Tabelas
-- ============================================================================
create table public.fin_contas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 80),
  tipo text not null default 'banco' check (tipo in ('banco', 'caixa', 'carteira_digital', 'outro')),
  emissora_id uuid,
  saldo_inicial numeric(14, 2) not null default 0,
  saldo_inicial_em date not null default current_date,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, org_id),
  foreign key (emissora_id, org_id) references public.emissoras (id, org_id) on delete set null (emissora_id)
);
create unique index fin_contas_nome_unico on public.fin_contas (org_id, lower(btrim(nome)));
comment on table public.fin_contas is 'contas financeiras da empresa (banco, caixa da loja, carteira digital); o saldo é calculado por fin_saldos';
comment on column public.fin_contas.emissora_id is 'CNPJ da empresa dono da conta, para quem tem mais de um (opcional)';

create table public.fin_categorias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  tipo text not null check (tipo in ('receita', 'despesa')),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, org_id)
);
create unique index fin_categorias_nome_unico on public.fin_categorias (org_id, tipo, lower(btrim(nome)));
comment on table public.fin_categorias is 'plano de contas simples da empresa: receita para o a receber, despesa para o a pagar';

create table public.fin_lancamentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  tipo text not null check (tipo in ('receber', 'pagar')),
  descricao text not null check (length(btrim(descricao)) between 1 and 200),
  categoria_id uuid,
  emissora_id uuid,
  cliente_id uuid,
  fornecedor_cnpj text check (fornecedor_cnpj ~ '^\d{11}$|^\d{14}$'),
  fornecedor_nome text check (length(fornecedor_nome) <= 200),
  origem text not null default 'manual' check (origem in ('manual', 'pedido', 'os', 'nota_entrada')),
  grupo_id uuid not null,
  parcela smallint not null default 1 check (parcela >= 1),
  parcelas smallint not null default 1 check (parcelas >= 1),
  vencimento date not null,
  valor numeric(14, 2) not null check (valor > 0),
  valor_pago numeric(14, 2) not null default 0 check (valor_pago >= 0 and valor_pago <= valor),
  pago_em date,
  observacao text check (length(observacao) <= 1000),
  cancelado_em timestamptz,
  cancelado_por uuid references auth.users (id) on delete set null,
  motivo_cancelamento text check (length(motivo_cancelamento) <= 300),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, org_id),
  check (parcela <= parcelas),
  check (tipo = 'pagar' or (fornecedor_cnpj is null and fornecedor_nome is null)),
  check (tipo = 'receber' or cliente_id is null),
  foreign key (categoria_id, org_id) references public.fin_categorias (id, org_id) on delete set null (categoria_id),
  foreign key (emissora_id, org_id) references public.emissoras (id, org_id) on delete set null (emissora_id),
  foreign key (cliente_id, org_id) references public.clientes (id, org_id) on delete set null (cliente_id)
);
create index fin_lancamentos_vencimento_idx on public.fin_lancamentos (org_id, tipo, vencimento) where cancelado_em is null;
create index fin_lancamentos_grupo_idx on public.fin_lancamentos (grupo_id);
create index fin_lancamentos_cliente_idx on public.fin_lancamentos (cliente_id) where cliente_id is not null;
comment on table public.fin_lancamentos is 'cada parcela a receber ou a pagar; parcelas do mesmo lançamento (ou da mesma repetição) dividem o grupo_id';
comment on column public.fin_lancamentos.valor_pago is 'soma das baixas não desfeitas; mantido por fin_baixar e fin_desfazer_baixa';
comment on column public.fin_lancamentos.pago_em is 'data da última baixa quando a parcela fica toda paga';

create table public.fin_baixas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  lancamento_id uuid not null,
  conta_id uuid not null,
  data date not null,
  valor numeric(14, 2) not null check (valor > 0),
  forma text not null check (forma in ('pix', 'boleto', 'dinheiro', 'cartao_credito', 'cartao_debito',
                                       'transferencia', 'cheque', 'outro')),
  observacao text check (length(observacao) <= 500),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  desfeita_em timestamptz,
  desfeita_por uuid references auth.users (id) on delete set null,
  motivo_desfazer text check (length(motivo_desfazer) <= 300),
  foreign key (lancamento_id, org_id) references public.fin_lancamentos (id, org_id) on delete cascade,
  foreign key (conta_id, org_id) references public.fin_contas (id, org_id)
);
create index fin_baixas_lancamento_idx on public.fin_baixas (lancamento_id);
create index fin_baixas_conta_idx on public.fin_baixas (conta_id, data) where desfeita_em is null;
comment on table public.fin_baixas is 'pagamentos recebidos ou feitos; desfazer marca desfeita_em e mantém o registro';

create table public.fin_transferencias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  conta_origem_id uuid not null,
  conta_destino_id uuid not null,
  data date not null,
  valor numeric(14, 2) not null check (valor > 0),
  observacao text check (length(observacao) <= 500),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  desfeita_em timestamptz,
  desfeita_por uuid references auth.users (id) on delete set null,
  check (conta_origem_id <> conta_destino_id),
  foreign key (conta_origem_id, org_id) references public.fin_contas (id, org_id),
  foreign key (conta_destino_id, org_id) references public.fin_contas (id, org_id)
);
create index fin_transferencias_org_idx on public.fin_transferencias (org_id, data desc);
comment on table public.fin_transferencias is 'dinheiro que passa de uma conta da empresa para outra (ex.: depósito do caixa no banco)';

alter table public.fin_contas enable row level security;
alter table public.fin_categorias enable row level security;
alter table public.fin_lancamentos enable row level security;
alter table public.fin_baixas enable row level security;
alter table public.fin_transferencias enable row level security;

create policy fin_contas_ver on public.fin_contas for select to authenticated using (public.pode_financeiro(org_id));
create policy fin_categorias_ver on public.fin_categorias for select to authenticated using (public.pode_financeiro(org_id));
create policy fin_lancamentos_ver on public.fin_lancamentos for select to authenticated using (public.pode_financeiro(org_id));
create policy fin_baixas_ver on public.fin_baixas for select to authenticated using (public.pode_financeiro(org_id));
create policy fin_transferencias_ver on public.fin_transferencias for select to authenticated using (public.pode_financeiro(org_id));

grant select on public.fin_contas, public.fin_categorias, public.fin_lancamentos, public.fin_baixas,
  public.fin_transferencias to authenticated;

-- Situação calculada na hora (vencido depende do dia), pela data de Brasília. security_invoker: vale a RLS de quem lê.
create view public.fin_lancamentos_situacao with (security_invoker = true) as
select l.*,
       l.valor - l.valor_pago as restante,
       case
         when l.cancelado_em is not null then 'cancelado'
         when l.valor_pago >= l.valor then 'pago'
         when l.vencimento < (now() at time zone 'America/Sao_Paulo')::date then 'vencido'
         when l.valor_pago > 0 then 'parcial'
         else 'aberto'
       end as situacao
  from public.fin_lancamentos l;
grant select on public.fin_lancamentos_situacao to authenticated;
comment on view public.fin_lancamentos_situacao is 'lançamentos com o que falta pagar e a situação: aberto, parcial, vencido (mesmo pago em parte), pago ou cancelado';

-- ============================================================================
-- Preparar: categorias padrão e o caixa, uma vez só
-- ============================================================================
create function public.fin_preparar(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fin_exigir(p_org);
  if not exists (select 1 from public.fin_categorias where org_id = p_org) then
    insert into public.fin_categorias (org_id, nome, tipo) values
      (p_org, 'Vendas', 'receita'),
      (p_org, 'Serviços', 'receita'),
      (p_org, 'Fornecedores', 'despesa'),
      (p_org, 'Impostos', 'despesa'),
      (p_org, 'Folha de pagamento', 'despesa'),
      (p_org, 'Aluguel', 'despesa'),
      (p_org, 'Despesas gerais', 'despesa');
  end if;
  if not exists (select 1 from public.fin_contas where org_id = p_org) then
    insert into public.fin_contas (org_id, nome, tipo) values (p_org, 'Caixa', 'caixa');
  end if;
end $$;

-- ============================================================================
-- Contas e categorias (dono e admin)
-- ============================================================================
create function public.fin_salvar_conta(p_org uuid, p_id uuid, p_nome text, p_tipo text, p_emissora uuid,
                                        p_saldo_inicial numeric, p_saldo_inicial_em date, p_ativa boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.fin_exigir(p_org, true);
  if p_emissora is not null and not exists (select 1 from public.emissoras where id = p_emissora and org_id = p_org) then
    raise exception 'CNPJ da empresa não encontrado';
  end if;
  if exists (select 1 from public.fin_contas where org_id = p_org and lower(btrim(nome)) = lower(btrim(p_nome))
                                                and id is distinct from p_id) then
    raise exception 'já existe uma conta com este nome';
  end if;
  if p_id is null then
    insert into public.fin_contas (org_id, nome, tipo, emissora_id, saldo_inicial, saldo_inicial_em, ativa)
    values (p_org, btrim(p_nome), coalesce(p_tipo, 'banco'), p_emissora, coalesce(p_saldo_inicial, 0),
            coalesce(p_saldo_inicial_em, (now() at time zone 'America/Sao_Paulo')::date), coalesce(p_ativa, true))
    returning id into v_id;
  else
    update public.fin_contas
       set nome = btrim(p_nome), tipo = coalesce(p_tipo, tipo), emissora_id = p_emissora,
           saldo_inicial = coalesce(p_saldo_inicial, saldo_inicial),
           saldo_inicial_em = coalesce(p_saldo_inicial_em, saldo_inicial_em), ativa = coalesce(p_ativa, ativa)
     where id = p_id and org_id = p_org
    returning id into v_id;
    if v_id is null then
      raise exception 'conta não encontrada';
    end if;
  end if;
  return v_id;
end $$;

create function public.fin_salvar_categoria(p_org uuid, p_id uuid, p_nome text, p_tipo text, p_ativa boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_tipo text;
begin
  perform public.fin_exigir(p_org, true);
  if p_id is null then
    if p_tipo is null then
      raise exception 'escolha se a categoria é de receita ou de despesa';
    end if;
    insert into public.fin_categorias (org_id, nome, tipo, ativa)
    values (p_org, btrim(p_nome), p_tipo, coalesce(p_ativa, true))
    returning id into v_id;
  else
    select tipo into v_tipo from public.fin_categorias where id = p_id and org_id = p_org;
    if v_tipo is null then
      raise exception 'categoria não encontrada';
    end if;
    -- Trocar receita por despesa deixaria lançamentos com a categoria do lado errado.
    if p_tipo is not null and p_tipo <> v_tipo
       and exists (select 1 from public.fin_lancamentos where categoria_id = p_id) then
      raise exception 'a categoria já tem lançamentos: crie outra em vez de trocar receita por despesa';
    end if;
    update public.fin_categorias set nome = btrim(p_nome), tipo = coalesce(p_tipo, tipo), ativa = coalesce(p_ativa, ativa)
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'já existe uma categoria com este nome';
end $$;

-- ============================================================================
-- Lançamentos
-- ============================================================================
-- p_parcelas: [{"vencimento": "2026-11-10", "valor": 100.00}, ...]. A tela calcula as datas (30/60/90, repetir por
-- N meses); o banco confere e grava todas no mesmo grupo. Devolve o grupo.
create function public.fin_criar_lancamento(p_org uuid, p_tipo text, p_descricao text, p_categoria uuid,
                                            p_emissora uuid, p_cliente uuid, p_fornecedor_cnpj text,
                                            p_fornecedor_nome text, p_parcelas jsonb, p_observacao text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_grupo uuid := gen_random_uuid();
  v_total int;
  v_p jsonb;
  v_n int := 0;
  v_valor numeric(14, 2);
  v_venc date;
begin
  perform public.fin_exigir(p_org);
  if p_tipo is null or p_tipo not in ('receber', 'pagar') then
    raise exception 'escolha se é a receber ou a pagar';
  end if;
  if coalesce(btrim(p_descricao), '') = '' then
    raise exception 'informe a descrição do lançamento';
  end if;
  if p_categoria is not null and not exists (
    select 1 from public.fin_categorias
     where id = p_categoria and org_id = p_org
       and tipo = case p_tipo when 'receber' then 'receita' else 'despesa' end
  ) then
    raise exception 'a categoria não é desta empresa ou é do outro lado (receita no a receber, despesa no a pagar)';
  end if;
  if p_emissora is not null and not exists (select 1 from public.emissoras where id = p_emissora and org_id = p_org) then
    raise exception 'CNPJ da empresa não encontrado';
  end if;
  if p_cliente is not null and (p_tipo <> 'receber'
       or not exists (select 1 from public.clientes where id = p_cliente and org_id = p_org)) then
    raise exception 'cliente não encontrado (só o a receber tem cliente)';
  end if;
  if p_tipo = 'receber' and (p_fornecedor_cnpj is not null or p_fornecedor_nome is not null) then
    raise exception 'só o a pagar tem fornecedor';
  end if;
  if jsonb_typeof(p_parcelas) is distinct from 'array' then
    raise exception 'informe as parcelas';
  end if;
  v_total := jsonb_array_length(p_parcelas);
  if v_total < 1 or v_total > 120 then
    raise exception 'informe de 1 a 120 parcelas';
  end if;

  for v_p in select value from jsonb_array_elements(p_parcelas) loop
    v_n := v_n + 1;
    begin
      v_venc := (v_p ->> 'vencimento')::date;
      v_valor := round((v_p ->> 'valor')::numeric, 2);
    exception when others then
      raise exception 'parcela %: vencimento ou valor inválido', v_n;
    end;
    if v_venc is null or v_valor is null or v_valor <= 0 then
      raise exception 'parcela %: informe o vencimento e um valor maior que zero', v_n;
    end if;
    insert into public.fin_lancamentos (org_id, tipo, descricao, categoria_id, emissora_id, cliente_id,
                                        fornecedor_cnpj, fornecedor_nome, origem, grupo_id, parcela, parcelas,
                                        vencimento, valor, observacao, criado_por)
    values (p_org, p_tipo, btrim(p_descricao), p_categoria, p_emissora, p_cliente,
            nullif(regexp_replace(coalesce(p_fornecedor_cnpj, ''), '\D', '', 'g'), ''), nullif(btrim(p_fornecedor_nome), ''),
            'manual', v_grupo, v_n, v_total, v_venc, v_valor, nullif(btrim(p_observacao), ''), auth.uid());
  end loop;
  return v_grupo;
end $$;

create function public.fin_editar_lancamento(p_id uuid, p_descricao text, p_categoria uuid, p_vencimento date,
                                             p_valor numeric, p_observacao text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  l public.fin_lancamentos;
  v_valor numeric(14, 2) := round(p_valor, 2);
begin
  select * into l from public.fin_lancamentos where id = p_id for update;
  if l.id is null then
    raise exception 'lançamento não encontrado';
  end if;
  perform public.fin_exigir(l.org_id);
  if l.cancelado_em is not null then
    raise exception 'lançamento cancelado não muda';
  end if;
  if p_descricao is not null and btrim(p_descricao) = '' then
    raise exception 'informe a descrição do lançamento';
  end if;
  if v_valor is not null and v_valor <> l.valor then
    if l.origem <> 'manual' then
      raise exception 'o valor vem do pedido, da OS ou da nota: mude lá';
    end if;
    if v_valor <= 0 or v_valor < l.valor_pago then
      raise exception 'o valor não pode ser menor que o já pago (R$ %)', l.valor_pago;
    end if;
  end if;
  if p_categoria is not null and not exists (
    select 1 from public.fin_categorias
     where id = p_categoria and org_id = l.org_id
       and tipo = case l.tipo when 'receber' then 'receita' else 'despesa' end
  ) then
    raise exception 'a categoria não é desta empresa ou é do outro lado (receita no a receber, despesa no a pagar)';
  end if;
  update public.fin_lancamentos
     set descricao = coalesce(btrim(p_descricao), descricao), categoria_id = p_categoria,
         vencimento = coalesce(p_vencimento, vencimento), valor = coalesce(v_valor, valor),
         observacao = nullif(btrim(p_observacao), ''), atualizado_em = now(),
         pago_em = case when valor_pago >= coalesce(v_valor, valor) then pago_em end
   where id = p_id;
end $$;

create function public.fin_cancelar_lancamento(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  l public.fin_lancamentos;
begin
  select * into l from public.fin_lancamentos where id = p_id for update;
  if l.id is null then
    raise exception 'lançamento não encontrado';
  end if;
  perform public.fin_exigir(l.org_id);
  if l.cancelado_em is not null then
    raise exception 'o lançamento já está cancelado';
  end if;
  if l.valor_pago > 0 then
    raise exception 'desfaça as baixas antes de cancelar';
  end if;
  update public.fin_lancamentos
     set cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = nullif(btrim(p_motivo), ''),
         atualizado_em = now()
   where id = p_id;
  perform public.auditar(l.org_id, 'cancelar', 'fin_lancamentos', p_id::text,
                         jsonb_build_object('valor', l.valor, 'vencimento', l.vencimento),
                         jsonb_build_object('motivo', p_motivo));
end $$;

-- ============================================================================
-- Baixas
-- ============================================================================
-- Recalcula o pago a partir das baixas não desfeitas. Só chamada pelas funções acima (sem acesso da tela).
create function public.fin_recalcular_pago(p_lancamento uuid)
returns void language sql security definer set search_path = '' as $$
  update public.fin_lancamentos l
     set valor_pago = coalesce(b.total, 0),
         pago_em = case when coalesce(b.total, 0) >= l.valor then b.ultima end,
         atualizado_em = now()
    from (select sum(valor) as total, max(data) as ultima
            from public.fin_baixas where lancamento_id = p_lancamento and desfeita_em is null) b
   where l.id = p_lancamento;
$$;
revoke execute on function public.fin_recalcular_pago(uuid) from public, anon, authenticated;

create function public.fin_baixar(p_lancamento uuid, p_conta uuid, p_data date, p_valor numeric, p_forma text,
                                  p_observacao text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  l public.fin_lancamentos;
  v_valor numeric(14, 2) := round(p_valor, 2);
  v_id uuid;
begin
  select * into l from public.fin_lancamentos where id = p_lancamento for update;
  if l.id is null then
    raise exception 'lançamento não encontrado';
  end if;
  perform public.fin_exigir(l.org_id);
  if l.cancelado_em is not null then
    raise exception 'lançamento cancelado não recebe baixa';
  end if;
  if not exists (select 1 from public.fin_contas where id = p_conta and org_id = l.org_id and ativa) then
    raise exception 'escolha uma conta ativa da empresa';
  end if;
  if p_data is null or p_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'a data do pagamento não pode ser no futuro';
  end if;
  if v_valor is null or v_valor <= 0 then
    raise exception 'informe um valor maior que zero';
  end if;
  if v_valor > l.valor - l.valor_pago then
    raise exception 'o valor passa do que falta pagar (R$ %)', l.valor - l.valor_pago;
  end if;
  insert into public.fin_baixas (org_id, lancamento_id, conta_id, data, valor, forma, observacao, criado_por)
  values (l.org_id, l.id, p_conta, p_data, v_valor, coalesce(p_forma, 'outro'), nullif(btrim(p_observacao), ''), auth.uid())
  returning id into v_id;
  perform public.fin_recalcular_pago(l.id);
  return v_id;
end $$;

create function public.fin_desfazer_baixa(p_baixa uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b public.fin_baixas;
begin
  select * into b from public.fin_baixas where id = p_baixa;
  if b.id is null then
    raise exception 'baixa não encontrada';
  end if;
  perform public.fin_exigir(b.org_id);
  perform 1 from public.fin_lancamentos where id = b.lancamento_id for update;
  if b.desfeita_em is not null then
    raise exception 'a baixa já foi desfeita';
  end if;
  update public.fin_baixas
     set desfeita_em = now(), desfeita_por = auth.uid(), motivo_desfazer = nullif(btrim(p_motivo), '')
   where id = p_baixa;
  perform public.fin_recalcular_pago(b.lancamento_id);
  perform public.auditar(b.org_id, 'desfazer_baixa', 'fin_baixas', p_baixa::text,
                         jsonb_build_object('valor', b.valor, 'data', b.data), jsonb_build_object('motivo', p_motivo));
end $$;

-- ============================================================================
-- Transferências e saldos
-- ============================================================================
create function public.fin_transferir(p_org uuid, p_origem uuid, p_destino uuid, p_data date, p_valor numeric,
                                      p_observacao text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.fin_exigir(p_org);
  if p_origem is null or p_destino is null or p_origem = p_destino then
    raise exception 'escolha duas contas diferentes';
  end if;
  if (select count(*) from public.fin_contas where id in (p_origem, p_destino) and org_id = p_org and ativa) <> 2 then
    raise exception 'escolha contas ativas da empresa';
  end if;
  if p_data is null or p_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'a data da transferência não pode ser no futuro';
  end if;
  if p_valor is null or round(p_valor, 2) <= 0 then
    raise exception 'informe um valor maior que zero';
  end if;
  insert into public.fin_transferencias (org_id, conta_origem_id, conta_destino_id, data, valor, observacao, criado_por)
  values (p_org, p_origem, p_destino, p_data, round(p_valor, 2), nullif(btrim(p_observacao), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.fin_desfazer_transferencia(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.fin_transferencias;
begin
  select * into t from public.fin_transferencias where id = p_id;
  if t.id is null then
    raise exception 'transferência não encontrada';
  end if;
  perform public.fin_exigir(t.org_id);
  if t.desfeita_em is not null then
    raise exception 'a transferência já foi desfeita';
  end if;
  update public.fin_transferencias set desfeita_em = now(), desfeita_por = auth.uid() where id = p_id;
  perform public.auditar(t.org_id, 'desfazer_transferencia', 'fin_transferencias', p_id::text,
                         jsonb_build_object('valor', t.valor, 'data', t.data), null);
end $$;

-- Saldo de cada conta: saldo inicial + recebido − pago + transferências que entram − as que saem.
create function public.fin_saldos(p_org uuid)
returns table (conta_id uuid, nome text, tipo text, ativa boolean, saldo numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.fin_exigir(p_org);
  return query
  select c.id, c.nome, c.tipo, c.ativa,
         c.saldo_inicial
         + coalesce((select sum(case l.tipo when 'receber' then b.valor else -b.valor end)
                       from public.fin_baixas b join public.fin_lancamentos l on l.id = b.lancamento_id
                      where b.conta_id = c.id and b.desfeita_em is null), 0)
         + coalesce((select sum(t.valor) from public.fin_transferencias t
                      where t.conta_destino_id = c.id and t.desfeita_em is null), 0)
         - coalesce((select sum(t.valor) from public.fin_transferencias t
                      where t.conta_origem_id = c.id and t.desfeita_em is null), 0)
    from public.fin_contas c
   where c.org_id = p_org
   order by c.ativa desc, c.nome;
end $$;

revoke execute on function
  public.fin_preparar(uuid),
  public.fin_salvar_conta(uuid, uuid, text, text, uuid, numeric, date, boolean),
  public.fin_salvar_categoria(uuid, uuid, text, text, boolean),
  public.fin_criar_lancamento(uuid, text, text, uuid, uuid, uuid, text, text, jsonb, text),
  public.fin_editar_lancamento(uuid, text, uuid, date, numeric, text),
  public.fin_cancelar_lancamento(uuid, text),
  public.fin_baixar(uuid, uuid, date, numeric, text, text),
  public.fin_desfazer_baixa(uuid, text),
  public.fin_transferir(uuid, uuid, uuid, date, numeric, text),
  public.fin_desfazer_transferencia(uuid),
  public.fin_saldos(uuid)
from public, anon;
grant execute on function
  public.fin_preparar(uuid),
  public.fin_salvar_conta(uuid, uuid, text, text, uuid, numeric, date, boolean),
  public.fin_salvar_categoria(uuid, uuid, text, text, boolean),
  public.fin_criar_lancamento(uuid, text, text, uuid, uuid, uuid, text, text, jsonb, text),
  public.fin_editar_lancamento(uuid, text, uuid, date, numeric, text),
  public.fin_cancelar_lancamento(uuid, text),
  public.fin_baixar(uuid, uuid, date, numeric, text, text),
  public.fin_desfazer_baixa(uuid, text),
  public.fin_transferir(uuid, uuid, uuid, date, numeric, text),
  public.fin_desfazer_transferencia(uuid),
  public.fin_saldos(uuid)
to authenticated;
