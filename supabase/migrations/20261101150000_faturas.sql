-- Faturas da Livih (docs/cobranca-asaas.md, entrega 2; decisões de 01/11).
--
-- A Livih fecha a conta de cada empresa e cria uma cobrança avulsa no Asaas (o valor muda todo mês: excedente,
-- pacotes, módulos). A fatura da competência M vence no dia 10 de M e leva o plano e os módulos de M mais os
-- atendimentos a mais e os pacotes de M-1. Quem é cobrado: empresa ativa com contrato de cobrança ligado
-- (contratos_cobranca), a partir do mês de início. A F7 Tech, dona da Livih, nunca tem contrato. Preço combinado
-- (JoGrampo): valor fixo no lugar de plano e módulos; o motivo fica no contrato e na auditoria, não na fatura.
-- O banco monta a fatura ('a_enviar') e chama a Edge Function asaas-cobranca, que cria o cliente e a cobrança no Asaas
-- (multa de 2 % e juros de 1 % ao mês) e grava o link. Pagamento e atraso chegam pelo webhook (entrega 3).
--
-- Regras da revisão de 01/11:
--   - empresa suspensa não recebe fatura nova (a suspensão por atraso da entrega 3 também para a cobrança);
--   - desligar o contrato no meio do mês: os atendimentos a mais e os pacotes desse último mês não são cobrados;
--   - fatura abaixo de R$ 5 (mínimo do Asaas) não é criada; o valor não passa para o mês seguinte;
--   - reenvio (diário ou pelo botão) acerta o vencimento para pelo menos 3 dias à frente: o Asaas recusa data passada;
--   - fatura cancelada (teste no sandbox, cobrança por engano) libera o mês para outra.

-- ---------- preço dos módulos (sugeridos em 28/10) ----------
alter table public.modulos add column preco_mensal numeric(10, 2);
comment on column public.modulos.preco_mensal is 'Mensalidade do módulo adicional (docs/planos-modulos.md). Nulo = sem cobrança.';
update public.modulos set preco_mensal = 99 where codigo in ('erp', 'os');

-- ---------- contrato de cobrança ----------
create table public.contratos_cobranca (
  org_id            uuid primary key references public.organizacoes (id) on delete cascade,
  ativo             boolean not null default false,
  inicio            date not null check (extract(day from inicio) = 1),
  valor_fixo        numeric(10, 2) check (valor_fixo >= 0),
  motivo_valor      text check (length(motivo_valor) <= 300),
  asaas_cliente_id  text,
  asaas_ambiente    text check (asaas_ambiente in ('sandbox', 'producao')),
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid references auth.users (id) on delete set null,
  check (valor_fixo is null or nullif(btrim(motivo_valor), '') is not null)
);
comment on table public.contratos_cobranca is
  'Empresa cobrada pela Livih: desde quando (inicio = 1º dia da primeira competência) e preço combinado, se houver.';
alter table public.contratos_cobranca enable row level security;
create policy contratos_cobranca_ver on public.contratos_cobranca for select to authenticated
  using (public.cobranca_pode(org_id, '{dono,admin}'));
revoke all on public.contratos_cobranca from anon, authenticated;
grant select on public.contratos_cobranca to authenticated;

-- ---------- faturas ----------
create table public.faturas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizacoes (id) on delete cascade,
  competencia   date not null check (extract(day from competencia) = 1),
  vencimento    date not null,
  itens         jsonb not null,
  valor         numeric(10, 2) not null check (valor > 0),
  status        text not null default 'a_enviar'
                check (status in ('a_enviar', 'enviando', 'aberta', 'paga', 'vencida', 'a_cancelar', 'cancelada', 'erro')),
  erro          text,
  tentativas    integer not null default 0,
  asaas_id      text unique,
  ambiente      text check (ambiente in ('sandbox', 'producao')),
  link          text,
  enviada_em    timestamptz,
  paga_em       timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.faturas is 'Fatura mensal da empresa à Livih; cobrada pelo Asaas (asaas_id, link de pagamento).';
comment on column public.faturas.status is
  'a_enviar → enviando (a asaas-cobranca pegou; evita duas cobranças da mesma fatura) → aberta → paga ou vencida. '
  'erro volta a a_enviar no reenvio; a_cancelar → cancelada (a função apaga a cobrança no Asaas).';
-- Uma fatura por mês, sem contar as canceladas (cancelar uma de teste libera o mês para a de verdade).
create unique index faturas_uma_por_mes on public.faturas (org_id, competencia) where status <> 'cancelada';
create index faturas_fila_idx on public.faturas (criado_em) where status in ('a_enviar', 'a_cancelar', 'erro');
alter table public.faturas enable row level security;
create policy faturas_ver on public.faturas for select to authenticated using (public.cobranca_pode(org_id, '{dono,admin}'));
revoke all on public.faturas from anon, authenticated;
grant select on public.faturas to authenticated;

-- ---------- itens de uma competência ----------
-- Sem conferência de papel: só para as funções abaixo. Preços do catálogo de hoje (troca de preço vale do mês em
-- diante); os atendimentos a mais saem pelo preço do plano atual.
create function public.cobranca_itens(p_org uuid, p_competencia date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_anterior date := (p_competencia - interval '1 month')::date;
  c public.contratos_cobranca;
  p public.planos;
  v_itens jsonb := '[]';
  v_juntos boolean := public.modulo_ativo(p_org, 'erp') and public.modulo_ativo(p_org, 'os');
  v_qtd integer;
  v_valor numeric;
begin
  select * into c from public.contratos_cobranca where org_id = p_org;
  select pl.* into p from public.organizacoes o join public.planos pl on pl.codigo = o.plano where o.id = p_org;

  if c.valor_fixo is not null then
    if c.valor_fixo > 0 then
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'descricao', 'Plano e módulos (valor combinado)', 'quantidade', 1, 'valor', c.valor_fixo));
    end if;
  else
    if p.preco_mensal is not null then
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'descricao', 'Plano ' || p.nome, 'quantidade', 1, 'valor', p.preco_mensal));
    end if;
    -- ERP e OS juntos no mesmo CNPJ saem por R$ 149 (decisão de 01/11); os demais módulos com preço somam à parte.
    if v_juntos then
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'descricao', 'Módulos Pedidos e estoque (ERP) e Ordens de serviço', 'quantidade', 1, 'valor', 149));
    end if;
    v_itens := v_itens || coalesce((
      select jsonb_agg(jsonb_build_object('descricao', 'Módulo ' || m.nome, 'quantidade', 1, 'valor', m.preco_mensal)
                       order by m.ordem)
        from public.modulos m
       where m.preco_mensal is not null and public.modulo_ativo(p_org, m.codigo)
         and not (v_juntos and m.codigo in ('erp', 'os'))), '[]');
  end if;

  -- Atendimentos a mais e pacotes do mês anterior.
  select count(*) into v_qtd from public.atendimentos_agente a
   where a.org_id = p_org and a.mes = v_anterior and a.excedente;
  if v_qtd > 0 then
    v_itens := v_itens || jsonb_build_array(jsonb_build_object(
      'descricao', 'Atendimentos a mais do agente em ' || to_char(v_anterior, 'MM/YYYY'),
      'quantidade', v_qtd, 'valor', round(v_qtd * p.excedente_preco, 2)));
  end if;
  select count(*), coalesce(sum(cr.valor), 0) into v_qtd, v_valor from public.creditos_atendimentos cr
   where cr.org_id = p_org and cr.mes = v_anterior and cr.tipo = 'pacote';
  if v_qtd > 0 then
    v_itens := v_itens || jsonb_build_array(jsonb_build_object(
      'descricao', 'Pacotes de atendimentos comprados em ' || to_char(v_anterior, 'MM/YYYY'),
      'quantidade', v_qtd, 'valor', v_valor));
  end if;
  return v_itens;
end $$;
revoke execute on function public.cobranca_itens(uuid, date) from public, anon, authenticated;

-- Vencimento: o dia 10 da competência, ou 3 dias à frente se isso já passou (o Asaas recusa data passada).
create function public.cobranca_vencimento(p_base date) returns date
language sql stable set search_path = '' as $$
  select greatest(p_base, (now() at time zone 'America/Sao_Paulo')::date + 3);
$$;
revoke execute on function public.cobranca_vencimento(date) from public, anon, authenticated;

-- Cria a fatura de uma empresa numa competência (uma só por mês). Devolve o id, ou nulo se não há o que cobrar ou o
-- valor fica abaixo do mínimo do Asaas (R$ 5).
create function public.cobranca_criar_fatura(p_org uuid, p_competencia date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_itens jsonb := public.cobranca_itens(p_org, p_competencia);
  v_valor numeric := (select coalesce(sum((i ->> 'valor')::numeric), 0) from jsonb_array_elements(v_itens) i);
  v_dados boolean := exists (select 1 from public.dados_cobranca where org_id = p_org);
  v_id uuid;
begin
  if v_valor < 5 then
    return null;
  end if;
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, erro)
  values (p_org, p_competencia, public.cobranca_vencimento(p_competencia + 9), v_itens, v_valor,
          case when v_dados then 'a_enviar' else 'erro' end,
          case when not v_dados then 'Faltam os dados de cobrança da empresa. Preencha e salve; a fatura é reenviada no dia seguinte.' end)
  on conflict (org_id, competencia) where status <> 'cancelada' do nothing
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.cobranca_criar_fatura(uuid, date) from public, anon, authenticated;

-- Fechamento do mês (cron no dia 1): uma fatura para cada empresa ativa com contrato ligado e já começado. Um erro numa
-- empresa não derruba as outras. Devolve quantas criou.
create function public.cobranca_fechar_mes() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_comp date := public.mes_brasilia();
  v_total integer := 0;
  c record;
begin
  for c in
    select cc.org_id from public.contratos_cobranca cc join public.organizacoes o on o.id = cc.org_id
     where cc.ativo and cc.inicio <= v_comp and o.status = 'ativa'
  loop
    begin
      if public.cobranca_criar_fatura(c.org_id, v_comp) is not null then
        v_total := v_total + 1;
      end if;
    exception when others then
      raise warning 'livih: fatura de % não criada: %', c.org_id, sqlerrm;
    end;
  end loop;
  if v_total > 0 then
    perform public.chamar_funcao('asaas-cobranca');
  end if;
  return v_total;
end $$;
revoke execute on function public.cobranca_fechar_mes() from public, anon, authenticated;

-- Reenvio diário do que ficou em erro (Asaas fora do ar, dados corrigidos depois), até 5 tentativas, só com o contrato
-- ainda ligado; a presa em "enviando" há mais de 1 h (a função caiu no meio) volta para a fila. A função confere no
-- Asaas pela referência da fatura antes de criar outra cobrança.
create function public.cobranca_reenviar() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.faturas set status = 'a_enviar', atualizado_em = now()
   where status = 'enviando' and atualizado_em < now() - interval '1 hour';
  update public.faturas f
     set status = 'a_enviar', erro = null, atualizado_em = now(), vencimento = public.cobranca_vencimento(f.vencimento)
   where f.status = 'erro' and f.tentativas < 5 and f.asaas_id is null
     and exists (select 1 from public.dados_cobranca d where d.org_id = f.org_id)
     and exists (select 1 from public.contratos_cobranca cc where cc.org_id = f.org_id and cc.ativo);
  if exists (select 1 from public.faturas where status in ('a_enviar', 'a_cancelar')) then
    perform public.chamar_funcao('asaas-cobranca');
  end if;
end $$;
revoke execute on function public.cobranca_reenviar() from public, anon, authenticated;

-- 09:00 UTC = 06:00 em Brasília; reenvio às 12:00 UTC = 09:00 em Brasília.
select cron.schedule('livih-cobranca-fechar', '0 9 1 * *', 'select public.cobranca_fechar_mes()');
select cron.schedule('livih-cobranca-reenviar', '0 12 * * *', 'select public.cobranca_reenviar()');

-- ---------- plataforma ----------
create function public.plataforma_definir_contrato(p_org uuid, p_ativo boolean, p_inicio date, p_valor_fixo numeric,
                                                   p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes jsonb;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma muda a cobrança. Entre com a conta da plataforma.';
  end if;
  if not exists (select 1 from public.organizacoes where id = p_org) then
    raise exception 'Empresa não encontrada. Atualize a página e tente de novo.';
  end if;
  if p_inicio is null then
    raise exception 'Informe o mês da primeira fatura.';
  end if;
  if p_valor_fixo is not null and (p_valor_fixo < 0 or nullif(btrim(p_motivo), '') is null) then
    raise exception 'Informe o valor combinado (zero ou mais) e o motivo.';
  end if;
  if p_ativo and not exists (select 1 from public.dados_cobranca where org_id = p_org) then
    raise exception 'Salve os dados de cobrança (acima, nesta janela) antes de cobrar esta empresa.';
  end if;
  select to_jsonb(c) - 'asaas_cliente_id' - 'atualizado_em' - 'atualizado_por' into v_antes
    from public.contratos_cobranca c where c.org_id = p_org;
  insert into public.contratos_cobranca (org_id, ativo, inicio, valor_fixo, motivo_valor, atualizado_por)
  values (p_org, p_ativo, date_trunc('month', p_inicio)::date, p_valor_fixo,
          case when p_valor_fixo is not null then btrim(p_motivo) end, auth.uid())
  on conflict (org_id) do update set
    ativo = excluded.ativo, inicio = excluded.inicio, valor_fixo = excluded.valor_fixo,
    motivo_valor = excluded.motivo_valor, atualizado_em = now(), atualizado_por = auth.uid();
  insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
  select p_org, 'atendente', auth.uid(), 'definir_contrato_cobranca', 'contratos_cobranca', p_org::text, v_antes,
         to_jsonb(c) - 'asaas_cliente_id' - 'atualizado_em' - 'atualizado_por'
    from public.contratos_cobranca c where c.org_id = p_org;
end $$;
revoke execute on function public.plataforma_definir_contrato(uuid, boolean, date, numeric, text) from public, anon;
grant execute on function public.plataforma_definir_contrato(uuid, boolean, date, numeric, text) to authenticated;

-- Gera agora a fatura do mês corrente (empresa que começa no meio do mês, ou teste no sandbox).
create function public.plataforma_gerar_fatura(p_org uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma muda a cobrança. Entre com a conta da plataforma.';
  end if;
  if not exists (select 1 from public.contratos_cobranca where org_id = p_org and ativo) then
    raise exception 'Marque "Cobrar esta empresa" e salve antes de gerar a fatura.';
  end if;
  if not exists (select 1 from public.contratos_cobranca where org_id = p_org and inicio <= public.mes_brasilia()) then
    raise exception 'A primeira fatura desta empresa é de um mês que ainda não chegou.';
  end if;
  if exists (select 1 from public.faturas where org_id = p_org and competencia = public.mes_brasilia() and status <> 'cancelada') then
    raise exception 'A fatura deste mês já existe.';
  end if;
  v_id := public.cobranca_criar_fatura(p_org, public.mes_brasilia());
  if v_id is null then
    raise exception 'Não há valor a cobrar neste mês: o total fica abaixo de R$ 5 (o plano não tem preço e não há módulos, atendimentos a mais nem pacotes que cheguem a isso).';
  end if;
  perform public.chamar_funcao('asaas-cobranca');
  return v_id;
end $$;
revoke execute on function public.plataforma_gerar_fatura(uuid) from public, anon;
grant execute on function public.plataforma_gerar_fatura(uuid) to authenticated;

-- Tenta de novo uma fatura com problema (dados corrigidos, Asaas de volta), com o vencimento acertado e as tentativas zeradas.
create function public.plataforma_reenviar_fatura(p_fatura uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma muda a cobrança. Entre com a conta da plataforma.';
  end if;
  update public.faturas f
     set status = 'a_enviar', erro = null, tentativas = 0, atualizado_em = now(),
         vencimento = public.cobranca_vencimento(f.vencimento)
   where f.id = p_fatura and f.status = 'erro' and f.asaas_id is null;
  if not found then
    raise exception 'Só dá para tentar de novo uma fatura sem link de pagamento.';
  end if;
  perform public.chamar_funcao('asaas-cobranca');
end $$;
revoke execute on function public.plataforma_reenviar_fatura(uuid) from public, anon;
grant execute on function public.plataforma_reenviar_fatura(uuid) to authenticated;

-- Cancela uma fatura (teste no sandbox, cobrança por engano) e libera o mês. Com cobrança no Asaas, a função apaga lá.
create function public.plataforma_cancelar_fatura(p_fatura uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f public.faturas;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma muda a cobrança. Entre com a conta da plataforma.';
  end if;
  select * into f from public.faturas where id = p_fatura for update;
  if f.id is null or f.status in ('paga', 'cancelada', 'a_cancelar', 'enviando') then
    raise exception 'Esta fatura não pode ser cancelada agora (já paga, já cancelada ou sendo enviada).';
  end if;
  update public.faturas
     set status = case when f.asaas_id is null then 'cancelada' else 'a_cancelar' end, atualizado_em = now()
   where id = p_fatura;
  insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
  values (f.org_id, 'atendente', auth.uid(), 'cancelar_fatura', 'faturas', f.id::text,
          jsonb_build_object('status', f.status, 'valor', f.valor, 'competencia', f.competencia),
          jsonb_build_object('status', 'cancelada'));
  if f.asaas_id is not null then
    perform public.chamar_funcao('asaas-cobranca');
  end if;
end $$;
revoke execute on function public.plataforma_cancelar_fatura(uuid) from public, anon;
grant execute on function public.plataforma_cancelar_fatura(uuid) to authenticated;
