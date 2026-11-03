-- Planos, entrega 4b: plano anual e módulos contratados pelo dono (docs/planos-modulos.md, decisões de 02/11).
--
-- Anual ("pague 10 e use 12"): Essencial R$ 499, Start R$ 999, Pro R$ 1.499, Business R$ 1.999; ERP ou OS R$ 799, os
-- dois juntos R$ 1.098.
-- - O dono escolhe o anual em Plano e consumo; ele começa no dia 1 seguinte (no teste grátis, já na primeira fatura).
--   A fatura do mês em que o ciclo começa leva o plano e os módulos do ano inteiro, mais o resto do mês anterior
--   (atendimentos a mais, pacotes, ajustes); nos outros meses, a fatura sai só com esse resto (R$ 5 ou mais).
-- - Pagamento à vista (Pix, boleto ou cartão, como no mensal) ou no cartão em 2 a 12 parcelas sem juros (a Livih
--   absorve a taxa): contratos_cobranca.anual_parcelas, copiado para faturas.parcelas.
-- - Subir no anual vale na hora e gera uma cobrança avulsa (faturas.tipo = 'avulsa', vence em 3 dias) da diferença
--   anual proporcional aos meses que faltam, contando o atual; a data de renovação não muda. Descer, só na renovação.
-- - Renovação automática no dia 1 em que o ano fecha, pelo preço de tabela do momento; aviso ao dono 15 dias antes.
--   Voltar ao mensal fica agendado para a renovação.
-- - Encerrar o anual (plataforma): calcula a devolução (integral até 7 dias depois do pagamento; depois, o pago menos
--   os meses usados a preço mensal; do 10º mês em diante, nada) e desliga a cobrança. A devolução é feita no painel do
--   Asaas: é rara e precisa de conferência.
-- Módulos pelo dono (ERP e OS), com as regras da troca de plano:
-- - Ligar vale na hora. Mensal: a diferença dos dias que faltam vira ajuste na próxima fatura (se a fatura do mês já
--   saiu). Anual: cobrança avulsa da diferença anual dos meses que faltam. ERP com OS: só os R$ 29,90 a mais.
-- - Desligar vale no dia 1 seguinte (no anual, na renovação), sem devolução; no teste grátis, na hora.
-- - O Essencial não tem módulos: ligar pede para subir de plano, e descer ao Essencial pede para desligar antes.
-- Faturas: além da fatura do mês (tipo 'mes', uma por mês), cobranças avulsas no mesmo mês.

-- ---------- preços do anual e plano sem módulos ----------
-- planos.preco_anual já existe desde a migration 20261101120000 (R$ 499, 999, 1.499 e 1.999).
alter table public.planos add column permite_modulos boolean not null default true;
comment on column public.planos.permite_modulos is 'Falso: o plano não tem ERP nem OS (Essencial, decisão de 01/11).';
update public.planos set permite_modulos = false where codigo = 'essencial';

alter table public.modulos add column preco_anual numeric(10, 2) check (preco_anual > 0);
comment on column public.modulos.preco_anual is 'Preço do módulo no plano anual. Nulo: sem cobrança.';
update public.modulos set preco_anual = 799 where codigo in ('erp', 'os');

alter table public.organizacao_modulos add column desliga_em date check (extract(day from desliga_em) = 1);
comment on column public.organizacao_modulos.desliga_em is
  'Dia 1 em que o módulo desliga (pedido pelo dono; no anual, a renovação). Até lá, continua ligado.';

-- ---------- ciclo do contrato ----------
alter table public.contratos_cobranca
  add column ciclo text not null default 'mensal' check (ciclo in ('mensal', 'anual')),
  add column anual_inicio date check (extract(day from anual_inicio) = 1),
  add column ciclo_proximo text check (ciclo_proximo in ('mensal', 'anual')),
  add column ciclo_proximo_em date check (extract(day from ciclo_proximo_em) = 1),
  add column anual_parcelas integer not null default 1 check (anual_parcelas between 1 and 12),
  add column aviso_renovacao_em date,
  add constraint contratos_cobranca_anual_check check ((ciclo = 'anual') = (anual_inicio is not null)),
  add constraint contratos_cobranca_proximo_check check ((ciclo_proximo is null) = (ciclo_proximo_em is null));
comment on column public.contratos_cobranca.anual_inicio is
  'Dia 1 do mês em que o ano atual começou; renova 12 meses depois. A fatura desse mês leva o ano inteiro.';
comment on column public.contratos_cobranca.ciclo_proximo is
  'Troca de ciclo agendada para ciclo_proximo_em: anual no dia 1 seguinte, ou mensal na renovação.';
comment on column public.contratos_cobranca.anual_parcelas is
  '1: à vista (Pix, boleto ou cartão); 2 a 12: cartão parcelado sem juros. Vale para a próxima fatura anual.';
comment on column public.contratos_cobranca.aviso_renovacao_em is 'Renovação já avisada ao dono (15 dias antes).';

-- ---------- faturas avulsas e parceladas ----------
alter table public.faturas
  add column tipo text not null default 'mes' check (tipo in ('mes', 'avulsa')),
  add column parcelas integer not null default 1 check (parcelas between 1 and 12),
  add column asaas_parcelamento text;
comment on column public.faturas.tipo is
  'mes: a fatura do mês (uma por mês); avulsa: cobrança na hora (diferença do anual ao subir de plano ou ligar módulo).';
comment on column public.faturas.parcelas is 'Mais de 1: cartão parcelado no Asaas (asaas_parcelamento é o parcelamento).';
drop index public.faturas_uma_por_mes;
create unique index faturas_uma_por_mes on public.faturas (org_id, competencia) where status <> 'cancelada' and tipo = 'mes';

-- ---------- ajudantes ----------
-- Meses do primeiro dia 1 ao segundo (dez → mar = 3).
create function public.meses_entre(p_de date, p_ate date) returns integer
language sql immutable set search_path = '' as $$
  select ((extract(year from p_ate) - extract(year from p_de)) * 12 + extract(month from p_ate) - extract(month from p_de))::integer;
$$;
revoke execute on function public.meses_entre(date, date) from public, anon;
grant execute on function public.meses_entre(date, date) to authenticated, service_role;

-- Módulos pagos ligados na empresa (os de preço no catálogo).
create function public.modulos_pagos(p_org uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.codigo order by m.ordem), '{}') from public.modulos m
   where m.preco_mensal is not null and public.modulo_ativo(p_org, m.codigo);
$$;
revoke execute on function public.modulos_pagos(uuid) from public, anon, authenticated;

-- Itens dos módulos de uma lista, no mensal ou no anual. ERP e OS juntos no mesmo CNPJ: R$ 109,80 por mês ou R$ 1.098
-- por ano (decisão de 02/11). Item anual leva "anual": true (a devolução do anual soma só esses).
create function public.modulos_itens(p_modulos text[], p_anual boolean, p_sufixo text default '') returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.i || case when p_anual then '{"anual": true}'::jsonb else '{}'::jsonb end order by x.o), '[]')
    from (
      select 0 as o, jsonb_build_object('descricao', 'Módulos Pedidos e estoque (ERP) e Ordens de serviço' || p_sufixo,
                                        'quantidade', 1, 'valor', case when p_anual then 1098 else 109.80 end) as i
       where p_modulos @> array['erp', 'os']
      union all
      select m.ordem, jsonb_build_object('descricao', 'Módulo ' || m.nome || p_sufixo, 'quantidade', 1,
                                         'valor', case when p_anual then m.preco_anual else m.preco_mensal end)
        from public.modulos m
       where m.codigo = any(p_modulos) and m.preco_mensal is not null
         and not (p_modulos @> array['erp', 'os'] and m.codigo in ('erp', 'os'))
    ) x;
$$;
revoke execute on function public.modulos_itens(text[], boolean, text) from public, anon, authenticated;

create function public.modulos_valor(p_modulos text[], p_anual boolean) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((i ->> 'valor')::numeric), 0) from jsonb_array_elements(public.modulos_itens(p_modulos, p_anual)) i;
$$;
revoke execute on function public.modulos_valor(text[], boolean) from public, anon, authenticated;

-- ---------- itens da fatura (da migration 20261102140000) ----------
-- Anual: plano e módulos do ano inteiro só na fatura do mês em que o ciclo começa.
create or replace function public.cobranca_itens(p_org uuid, p_competencia date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_anterior date := (p_competencia - interval '1 month')::date;
  c public.contratos_cobranca;
  p public.planos;
  v_itens jsonb := '[]';
  v_periodo text;
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
  elsif c.ciclo = 'anual' then
    if c.anual_inicio = p_competencia then
      v_periodo := ' anual (' || to_char(p_competencia, 'MM/YYYY') || ' a '
                   || to_char((p_competencia + interval '11 months')::date, 'MM/YYYY') || ')';
      if p.preco_anual is not null then
        v_itens := v_itens || jsonb_build_array(jsonb_build_object(
          'descricao', 'Plano ' || p.nome || v_periodo, 'quantidade', 1, 'valor', p.preco_anual, 'anual', true));
      end if;
      v_itens := v_itens || public.modulos_itens(public.modulos_pagos(p_org), true, v_periodo);
    end if;
  else
    if p.preco_mensal is not null then
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'descricao', 'Plano ' || p.nome, 'quantidade', 1, 'valor', p.preco_mensal));
    end if;
    v_itens := v_itens || public.modulos_itens(public.modulos_pagos(p_org), false);
  end if;

  -- Atendimentos a mais, pacotes e ajustes do mês anterior (também no anual: o cliente não espera o ano para pagar).
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
  v_itens := v_itens || coalesce((
    select jsonb_agg(jsonb_build_object('descricao', a.descricao, 'quantidade', 1, 'valor', a.valor) order by a.criado_em)
      from public.cobranca_ajustes a where a.org_id = p_org and a.mes = v_anterior), '[]');
  return v_itens;
end $$;

-- Fatura do mês (da migration 20261101150000): a anual leva as parcelas escolhidas pelo dono.
create or replace function public.cobranca_criar_fatura(p_org uuid, p_competencia date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_itens jsonb := public.cobranca_itens(p_org, p_competencia);
  v_valor numeric := (select coalesce(sum((i ->> 'valor')::numeric), 0) from jsonb_array_elements(v_itens) i);
  v_dados boolean := exists (select 1 from public.dados_cobranca where org_id = p_org);
  v_parcelas integer := coalesce((select cc.anual_parcelas from public.contratos_cobranca cc
                                   where cc.org_id = p_org and cc.ciclo = 'anual' and cc.anual_inicio = p_competencia
                                     and cc.valor_fixo is null), 1);
  v_id uuid;
begin
  if v_valor < 5 then
    return null;
  end if;
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, erro, parcelas)
  values (p_org, p_competencia, public.cobranca_vencimento(p_competencia + 9), v_itens, v_valor,
          case when v_dados then 'a_enviar' else 'erro' end,
          case when not v_dados then 'Faltam os dados de cobrança da empresa. Preencha e salve; a fatura é reenviada no dia seguinte.' end,
          v_parcelas)
  on conflict (org_id, competencia) where status <> 'cancelada' and tipo = 'mes' do nothing
  returning id into v_id;
  return v_id;
end $$;

-- Cobrança avulsa (diferença do anual), com vencimento em 3 dias. Devolve o id, ou nulo abaixo de R$ 5. Quem chama
-- também chama a asaas-cobranca.
create function public.cobranca_criar_avulsa(p_org uuid, p_itens jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_valor numeric := (select coalesce(sum((i ->> 'valor')::numeric), 0) from jsonb_array_elements(p_itens) i);
  v_dados boolean := exists (select 1 from public.dados_cobranca where org_id = p_org);
  v_id uuid;
begin
  if v_valor < 5 then
    return null;
  end if;
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, erro, tipo)
  values (p_org, public.mes_brasilia(), public.cobranca_vencimento((now() at time zone 'America/Sao_Paulo')::date + 3),
          p_itens, v_valor, case when v_dados then 'a_enviar' else 'erro' end,
          case when not v_dados then 'Faltam os dados de cobrança da empresa. Preencha e salve; a fatura é reenviada no dia seguinte.' end,
          'avulsa')
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.cobranca_criar_avulsa(uuid, jsonb) from public, anon, authenticated;

-- Fatura do mês pulado (da migration 20261102120000): só a fatura do mês conta, não a avulsa.
create or replace function public.cobranca_fatura_mes_pulado(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_comp date := public.mes_brasilia();
begin
  if exists (select 1 from public.contratos_cobranca where org_id = p_org and ativo and inicio <= v_comp)
     and exists (select 1 from public.organizacoes where id = p_org and status = 'ativa')
     and not exists (select 1 from public.faturas where org_id = p_org and competencia = v_comp and tipo = 'mes') then
    if public.cobranca_criar_fatura(p_org, v_comp) is not null then
      perform public.chamar_funcao('asaas-cobranca');
    end if;
  end if;
exception when others then
  raise warning 'livih: fatura do mês pulado de % não criada: %', p_org, sqlerrm;
end $$;

-- Gerar a fatura do mês pela tela Empresas (da migration 20261101150000): a avulsa não ocupa o mês.
create or replace function public.plataforma_gerar_fatura(p_org uuid)
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
  if exists (select 1 from public.faturas where org_id = p_org and competencia = public.mes_brasilia() and tipo = 'mes'
                and status <> 'cancelada') then
    raise exception 'A fatura deste mês já existe.';
  end if;
  v_id := public.cobranca_criar_fatura(p_org, public.mes_brasilia());
  if v_id is null then
    raise exception 'Não há valor a cobrar neste mês: o total fica abaixo de R$ 5 (o plano não tem preço e não há módulos, atendimentos a mais nem pacotes que cheguem a isso).';
  end if;
  perform public.chamar_funcao('asaas-cobranca');
  return v_id;
end $$;

-- Contrato pela plataforma (da migration 20261101150000). No anual, desligar a cobrança ou combinar um valor passa
-- antes por "Encerrar o anual" (a devolução precisa ser calculada). Mudar o mês da primeira fatura de um anual que
-- ainda não foi cobrado leva junto o começo do ano.
create or replace function public.plataforma_definir_contrato(p_org uuid, p_ativo boolean, p_inicio date,
                                                              p_valor_fixo numeric, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes jsonb;
  c public.contratos_cobranca;
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
  select * into c from public.contratos_cobranca where org_id = p_org for update;
  if c.ciclo = 'anual' and (not p_ativo or p_valor_fixo is not null) then
    raise exception 'Esta empresa está no plano anual. Para desligar a cobrança ou combinar um valor, use antes "Encerrar o anual", nesta janela.';
  end if;
  select to_jsonb(cc) - 'asaas_cliente_id' - 'atualizado_em' - 'atualizado_por' into v_antes
    from public.contratos_cobranca cc where cc.org_id = p_org;
  insert into public.contratos_cobranca (org_id, ativo, inicio, valor_fixo, motivo_valor, atualizado_por)
  values (p_org, p_ativo, date_trunc('month', p_inicio)::date, p_valor_fixo,
          case when p_valor_fixo is not null then btrim(p_motivo) end, auth.uid())
  on conflict (org_id) do update set
    ativo = excluded.ativo, inicio = excluded.inicio, valor_fixo = excluded.valor_fixo,
    motivo_valor = excluded.motivo_valor, atualizado_em = now(), atualizado_por = auth.uid();
  -- Sem cobrança ou com valor combinado, o anual pedido pelo dono para o dia 1 seguinte não vale mais.
  if not p_ativo or p_valor_fixo is not null then
    update public.contratos_cobranca set ciclo_proximo = null, ciclo_proximo_em = null
     where org_id = p_org and ciclo = 'mensal' and ciclo_proximo is not null;
  end if;
  if c.ciclo = 'anual' and c.anual_inicio > public.mes_brasilia() then
    update public.contratos_cobranca
       set anual_inicio = greatest(date_trunc('month', p_inicio)::date, public.mes_brasilia())
     where org_id = p_org;
  end if;
  insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
  select p_org, 'atendente', auth.uid(), 'definir_contrato_cobranca', 'contratos_cobranca', p_org::text, v_antes,
         to_jsonb(cc) - 'asaas_cliente_id' - 'atualizado_em' - 'atualizado_por'
    from public.contratos_cobranca cc where cc.org_id = p_org;
end $$;

-- Módulo pela plataforma (da migration 20261013120000): ligar ou desligar à mão também desfaz o desligamento agendado.
create or replace function public.plataforma_definir_modulo(p_org uuid, p_modulo text, p_ativo boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_padrao boolean;
  v_antes boolean;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma muda os módulos. Entre com a conta da plataforma.';
  end if;
  select padrao into v_padrao from public.modulos where codigo = p_modulo;
  if v_padrao is null then
    raise exception 'Módulo não encontrado. Atualize a página e tente de novo.';
  end if;
  if not exists (select 1 from public.organizacoes where id = p_org) then
    raise exception 'Empresa não encontrada. Atualize a página e tente de novo.';
  end if;
  v_antes := public.modulo_ativo(p_org, p_modulo);
  if p_ativo = v_padrao then
    delete from public.organizacao_modulos where org_id = p_org and modulo = p_modulo;
  else
    insert into public.organizacao_modulos (org_id, modulo, ativo, atualizado_por)
    values (p_org, p_modulo, p_ativo, auth.uid())
    on conflict (org_id, modulo) do update
      set ativo = excluded.ativo, desliga_em = null, atualizado_em = now(), atualizado_por = auth.uid();
  end if;
  if v_antes is distinct from p_ativo then
    insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'atendente', auth.uid(), 'definir_modulo', 'modulos', p_modulo,
            jsonb_build_object('ativo', v_antes), jsonb_build_object('ativo', p_ativo));
  end if;
end $$;

-- ---------- situação para a tela do dono (da migration 20261102140000) ----------
create or replace function public.plano_troca_situacao(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.organizacoes;
  c public.contratos_cobranca;
  v_motivo text;
  v_mes date := public.mes_brasilia();
  v_renova date;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'Só o dono e os administradores da empresa veem o plano.';
  end if;
  select * into o from public.organizacoes where id = p_org;
  select * into c from public.contratos_cobranca where org_id = p_org;
  v_motivo := case
    when c.org_id is null or not c.ativo then 'Para escolher ou trocar o plano, fale com a equipe da Livih.'
    when c.valor_fixo is not null then 'O plano da sua empresa tem um valor combinado. Para trocar, fale com a equipe da Livih.'
  end;
  v_renova := (c.anual_inicio + interval '12 months')::date;
  return jsonb_build_object(
    'pode_trocar', v_motivo is null,
    'motivo', v_motivo,
    'eh_dono', public.eh_dono_de_fato(p_org),
    'plano', o.plano,
    'plano_proximo', o.plano_proximo,
    -- Quando valem as descidas e os desligamentos pedidos agora: dia 1 seguinte, ou a renovação no anual.
    'vale_em', coalesce(o.plano_proximo_em, v_renova, (v_mes + interval '1 month')::date),
    'fim_periodo', coalesce(v_renova, (v_mes + interval '1 month')::date),
    'numeros_ativos', (select count(*) from public.canais where org_id = p_org and ativo),
    'ciclo', coalesce(c.ciclo, 'mensal'),
    'anual_inicio', c.anual_inicio,
    'renova_em', v_renova,
    'ciclo_proximo', c.ciclo_proximo,
    'ciclo_proximo_em', c.ciclo_proximo_em,
    'anual_parcelas', coalesce(c.anual_parcelas, 1),
    'teste_gratis', c.inicio > v_mes,
    'planos', (select jsonb_agg(jsonb_build_object('codigo', p.codigo, 'nome', p.nome, 'preco_mensal', p.preco_mensal,
                                                   'preco_anual', p.preco_anual, 'permite_modulos', p.permite_modulos,
                                                   'numeros_whatsapp', p.numeros_whatsapp, 'atendimentos', p.atendimentos)
                                order by p.ordem)
                 from public.planos p where p.codigo <> 'interno'),
    'modulos', (select coalesce(jsonb_agg(jsonb_build_object('codigo', m.codigo, 'nome', m.nome, 'descricao', m.descricao,
                                                            'preco_mensal', m.preco_mensal, 'preco_anual', m.preco_anual,
                                                            'ativo', public.modulo_ativo(p_org, m.codigo),
                                                            'desliga_em', om.desliga_em)
                                         order by m.ordem), '[]')
                  from public.modulos m
                  left join public.organizacao_modulos om on om.org_id = p_org and om.modulo = m.codigo
                 where m.preco_mensal is not null),
    'juntos', jsonb_build_object('mensal', public.modulos_valor(array['erp', 'os'], false),
                                 'anual', public.modulos_valor(array['erp', 'os'], true)));
end $$;

-- ---------- troca de plano (da migration 20261102140000), agora também no anual ----------
-- Anual: subir vale na hora, com uma cobrança avulsa da diferença anual proporcional aos meses que faltam (contando o
-- atual) até a renovação, que não muda; a franquia a mais do mês segue a proporção dos dias, como no mensal. Descer
-- fica para a renovação. Se a fatura anual ainda não saiu, ela sai com o plano novo: sem diferença e com a franquia
-- cheia. Descer a um plano sem módulos (Essencial) pede para desligar antes os módulos que passariam da data.
create or replace function public.plano_trocar(p_org uuid, p_plano text, p_confirmar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.organizacoes;
  atual public.planos;
  novo public.planos;
  c public.contratos_cobranca;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := public.mes_brasilia();
  v_prox date := (public.mes_brasilia() + interval '1 month')::date;
  v_anual boolean;
  v_renova date;
  v_fim date;
  v_dias integer;
  v_dias_mes integer;
  v_meses integer;
  v_valor numeric := 0;
  v_cheio boolean;
  v_extra integer;
  v_reducao integer := 0;
  v_limite integer;
  v_qtd integer;
  v_modulos text;
  v_avulsa uuid;
begin
  if not public.eh_dono_de_fato(p_org) then
    raise exception 'Só o dono da empresa troca o plano. Se precisar trocar, fale com o dono.';
  end if;
  select * into o from public.organizacoes where id = p_org for update;
  -- A mesma trava do gatilho dos números: descer e conectar um número ao mesmo tempo não passam juntos do limite.
  perform pg_advisory_xact_lock(hashtextextended('livih-canais:' || p_org::text, 0));
  select * into novo from public.planos where codigo = p_plano and codigo <> 'interno';
  if novo.codigo is null then
    raise exception 'Escolha um dos planos da lista.';
  end if;
  select * into c from public.contratos_cobranca where org_id = p_org for update;
  if c.org_id is null or not c.ativo then
    raise exception 'Para escolher ou trocar o plano, fale com a equipe da Livih.';
  end if;
  if c.valor_fixo is not null then
    raise exception 'O plano da sua empresa tem um valor combinado. Para trocar, fale com a equipe da Livih.';
  end if;
  select * into atual from public.planos where codigo = o.plano;
  v_anual := c.ciclo = 'anual';
  v_renova := (c.anual_inicio + interval '12 months')::date;
  v_fim := case when v_anual then v_renova else v_prox end;

  if novo.codigo = o.plano then
    if o.plano_proximo is null then
      return jsonb_build_object('tipo', 'igual', 'plano', novo.nome);
    end if;
    if p_confirmar then
      update public.organizacoes set plano_proximo = null, plano_proximo_em = null where id = p_org;
      insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
      values (p_org, 'atendente', auth.uid(), 'cancelar_troca_plano', 'organizacoes', p_org::text,
              jsonb_build_object('plano_proximo', o.plano_proximo), jsonb_build_object('plano_proximo', null));
    end if;
    return jsonb_build_object('tipo', 'cancelar', 'plano', novo.nome);
  end if;

  -- Menos números do que a empresa tem: remove antes (decisão de 02/11).
  select count(*) into v_qtd from public.canais where org_id = p_org and ativo;
  if novo.numeros_whatsapp is not null and v_qtd > novo.numeros_whatsapp then
    raise exception 'O plano % permite % de WhatsApp, e a empresa tem % em Configurações → WhatsApp. Para trocar, remova % lá (botão Remover; Desconectar não libera a vaga) e tente de novo.',
      novo.nome,
      case when novo.numeros_whatsapp = 1 then '1 número' else novo.numeros_whatsapp || ' números' end,
      case when v_qtd = 1 then '1 número' else v_qtd || ' números' end, case when v_qtd - novo.numeros_whatsapp = 1 then '1 número' else (v_qtd - novo.numeros_whatsapp) || ' números' end;
  end if;

  if coalesce(novo.preco_mensal, 0) > coalesce(atual.preco_mensal, 0) then
    v_dias_mes := v_prox - v_mes;
    v_dias := v_prox - v_hoje;
    v_meses := public.meses_entre(v_mes, v_renova);
    -- A fatura que leva o plano (a do mês, ou a do começo do ano) ainda vai sair: sai com o plano novo inteiro.
    v_cheio := c.inicio <= v_mes and (not v_anual or c.anual_inicio = v_mes)
      and not exists (select 1 from public.faturas where org_id = p_org and competencia = v_mes and tipo = 'mes'
                         and status <> 'cancelada');
    if not v_cheio then
      if c.inicio <= v_mes and (not v_anual or c.anual_inicio <= v_mes) then
        v_valor := case when v_anual
                        then round((novo.preco_anual - coalesce(atual.preco_anual, 0)) * v_meses / 12, 2)
                        else round((novo.preco_mensal - coalesce(atual.preco_mensal, 0)) * v_dias / v_dias_mes, 2) end;
      end if;
      -- Plano interno (sem limite) não tem franquia para comparar: o plano novo vem cheio.
      if atual.atendimentos is not null then
        v_extra := floor((novo.atendimentos - atual.atendimentos) * v_dias::numeric / v_dias_mes);
        v_reducao := (novo.atendimentos - atual.atendimentos) - v_extra;
      end if;
    end if;
    select f.limite into v_limite from public.franquia_do_mes(p_org) f;
    if p_confirmar then
      update public.organizacoes set plano = novo.codigo, plano_proximo = null, plano_proximo_em = null where id = p_org;
      if v_valor >= 0.01 and v_anual then
        v_avulsa := public.cobranca_criar_avulsa(p_org, jsonb_build_array(jsonb_build_object(
          'descricao', 'Diferença do plano ' || novo.nome || ' anual de ' || to_char(v_mes, 'MM/YYYY') || ' a '
                       || to_char((v_renova - interval '1 month')::date, 'MM/YYYY') || ' (' || v_meses || ' de 12 meses)',
          'quantidade', 1, 'valor', v_valor, 'anual', true)));
      elsif v_valor >= 0.01 then
        insert into public.cobranca_ajustes (org_id, mes, descricao, valor, criado_por)
        values (p_org, v_mes, 'Diferença do plano ' || novo.nome || ' de ' || to_char(v_hoje, 'DD/MM') || ' a '
                || to_char(v_prox - 1, 'DD/MM') || ' (' || v_dias || ' de ' || v_dias_mes || ' dias)', v_valor, auth.uid());
      end if;
      if v_reducao > 0 then
        insert into public.creditos_atendimentos (org_id, mes, tipo, quantidade, motivo, criado_por)
        values (p_org, v_mes, 'troca', -v_reducao, 'Troca para o plano ' || novo.nome || ' em ' || to_char(v_hoje, 'DD/MM'),
                auth.uid());
      end if;
      insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
      values (p_org, 'atendente', auth.uid(), 'trocar_plano', 'organizacoes', p_org::text,
              jsonb_build_object('plano', o.plano),
              jsonb_build_object('plano', novo.codigo, 'ajuste', v_valor, 'reducao_franquia', v_reducao,
                                 'ciclo', c.ciclo, 'fatura_avulsa', v_avulsa));
      -- O consumo do mês conta desde o dia 1: com o limite novo, o aviso de 80 % ou 100 % pode valer na hora. O aviso
      -- não pode desfazer a troca.
      begin
        perform public.avisar_franquia(p_org);
      exception when others then
        raise warning 'livih: aviso de franquia na troca de plano falhou (%): %', p_org, sqlerrm;
      end;
      perform public.cobranca_avisar_plataforma(p_org, 'subiu para o plano ' || novo.nome
        || case when v_valor >= 0.01 and v_anual then ' (cobrança avulsa de ' || public.reais(v_valor) || ')'
                when v_valor >= 0.01 then ' (ajuste de ' || public.reais(v_valor) || ' na próxima fatura)' else '' end);
      if v_avulsa is not null then
        perform public.chamar_funcao('asaas-cobranca');
      end if;
    end if;
    return jsonb_build_object('tipo', 'subir', 'plano', novo.nome, 'valor', v_valor, 'dias', v_dias,
                              'dias_mes', v_dias_mes, 'meses', v_meses, 'anual', v_anual, 'renova_em', v_renova,
                              'teste_gratis', c.inicio > v_mes,
                              'limite_mes', case when v_limite is null then null
                                                 else v_limite + (novo.atendimentos - coalesce(atual.atendimentos, 0)) - v_reducao end);
  end if;

  -- Plano sem módulos: os módulos ligados têm de desligar até a data da descida.
  if not novo.permite_modulos then
    select string_agg(m.nome, ' e ' order by m.ordem) into v_modulos
      from public.modulos m left join public.organizacao_modulos om on om.org_id = p_org and om.modulo = m.codigo
     where m.preco_mensal is not null and public.modulo_ativo(p_org, m.codigo)
       and (om.desliga_em is null or om.desliga_em > v_fim);
    if v_modulos is not null then
      raise exception 'O plano % não inclui ERP nem Ordens de serviço. Para descer, desligue antes estes módulos aqui em Plano e consumo: % (eles continuam até a troca).',
        novo.nome, v_modulos;
    end if;
  end if;

  -- O mesmo plano já agendado: nada a fazer (sem outra auditoria nem outro aviso).
  if novo.codigo = o.plano_proximo then
    return jsonb_build_object('tipo', 'descer', 'plano', novo.nome, 'vale_em', o.plano_proximo_em, 'anual', v_anual);
  end if;
  if p_confirmar then
    update public.organizacoes set plano_proximo = novo.codigo, plano_proximo_em = v_fim where id = p_org;
    insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'atendente', auth.uid(), 'agendar_troca_plano', 'organizacoes', p_org::text,
            jsonb_build_object('plano', o.plano, 'plano_proximo', o.plano_proximo),
            jsonb_build_object('plano_proximo', novo.codigo, 'vale_em', v_fim));
    perform public.cobranca_avisar_plataforma(p_org, 'vai para o plano ' || novo.nome || ' em ' || to_char(v_fim, 'DD/MM/YYYY'));
  end if;
  return jsonb_build_object('tipo', 'descer', 'plano', novo.nome, 'vale_em', v_fim, 'anual', v_anual);
end $$;

-- ---------- mensal ou anual pelo dono ----------
-- p_ciclo 'anual': começa no dia 1 seguinte (no teste grátis, na primeira fatura); já no anual, só muda as parcelas da
-- próxima fatura anual e desfaz a volta ao mensal agendada. p_ciclo 'mensal': volta na renovação; se a fatura anual
-- ainda não saiu, volta na hora. Escolher de novo o ciclo atual desfaz a troca agendada.
-- tipo: 'anual' (agendado ou já valendo), 'mensal' (idem), 'cancelar', 'parcelas' ou 'igual'.
create function public.plano_ciclo(p_org uuid, p_ciclo text, p_parcelas integer default 1, p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.organizacoes;
  c public.contratos_cobranca;
  p public.planos;
  v_mes date := public.mes_brasilia();
  v_prox date := (public.mes_brasilia() + interval '1 month')::date;
  v_teste boolean;
  v_renova date;
  v_inicio date;
  v_plano text;
  v_modulos text[];
  v_valor numeric;
  v_agora boolean;
begin
  if not public.eh_dono_de_fato(p_org) then
    raise exception 'Só o dono da empresa troca o plano. Se precisar trocar, fale com o dono.';
  end if;
  if p_ciclo not in ('mensal', 'anual') then
    raise exception 'Escolha mensal ou anual.';
  end if;
  if p_parcelas is null or p_parcelas not between 1 and 12 then
    raise exception 'Escolha de 1 a 12 parcelas.';
  end if;
  select * into o from public.organizacoes where id = p_org for update;
  select * into c from public.contratos_cobranca where org_id = p_org for update;
  if c.org_id is null or not c.ativo then
    raise exception 'Para escolher ou trocar o plano, fale com a equipe da Livih.';
  end if;
  if c.valor_fixo is not null then
    raise exception 'O plano da sua empresa tem um valor combinado. Para trocar, fale com a equipe da Livih.';
  end if;
  v_teste := c.inicio > v_mes;
  v_renova := (c.anual_inicio + interval '12 months')::date;

  if p_ciclo = 'anual' then
    if c.ciclo = 'anual' then
      if p_confirmar and (c.anual_parcelas <> p_parcelas or c.ciclo_proximo is not null) then
        update public.contratos_cobranca set anual_parcelas = p_parcelas, ciclo_proximo = null, ciclo_proximo_em = null
         where org_id = p_org;
        insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
        values (p_org, 'atendente', auth.uid(), 'definir_ciclo', 'contratos_cobranca', p_org::text,
                jsonb_build_object('anual_parcelas', c.anual_parcelas, 'ciclo_proximo', c.ciclo_proximo),
                jsonb_build_object('anual_parcelas', p_parcelas, 'ciclo_proximo', null));
      end if;
      return jsonb_build_object('tipo', case when c.ciclo_proximo is not null then 'cancelar'
                                             when c.anual_parcelas <> p_parcelas then 'parcelas' else 'igual' end,
                                'ciclo', 'anual', 'parcelas', p_parcelas, 'renova_em', v_renova);
    end if;
    if c.ciclo_proximo = 'anual' and c.anual_parcelas = p_parcelas then
      return jsonb_build_object('tipo', 'igual', 'ciclo', 'anual', 'vale_em', c.ciclo_proximo_em, 'parcelas', p_parcelas);
    end if;
    v_inicio := case when v_teste then c.inicio else v_prox end;
    -- O valor do primeiro ano: plano e módulos que valem nesse dia (descida e desligamentos agendados contam).
    v_plano := case when o.plano_proximo is not null and o.plano_proximo_em <= v_inicio then o.plano_proximo else o.plano end;
    select * into p from public.planos where codigo = v_plano;
    if p.preco_anual is null then
      raise exception 'Para escolher o anual, a empresa precisa estar num dos planos da lista. Fale com a equipe da Livih.';
    end if;
    select coalesce(array_agg(m.codigo order by m.ordem), '{}') into v_modulos
      from public.modulos m left join public.organizacao_modulos om on om.org_id = p_org and om.modulo = m.codigo
     where m.preco_mensal is not null and public.modulo_ativo(p_org, m.codigo)
       and (om.desliga_em is null or om.desliga_em > v_inicio);
    v_valor := p.preco_anual + public.modulos_valor(v_modulos, true);
    if p_confirmar then
      if v_teste then
        update public.contratos_cobranca set ciclo = 'anual', anual_inicio = c.inicio, anual_parcelas = p_parcelas,
               ciclo_proximo = null, ciclo_proximo_em = null, aviso_renovacao_em = null
         where org_id = p_org;
      else
        update public.contratos_cobranca set ciclo_proximo = 'anual', ciclo_proximo_em = v_prox, anual_parcelas = p_parcelas
         where org_id = p_org;
      end if;
      insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
      values (p_org, 'atendente', auth.uid(), 'definir_ciclo', 'contratos_cobranca', p_org::text,
              jsonb_build_object('ciclo', c.ciclo, 'ciclo_proximo', c.ciclo_proximo),
              jsonb_build_object('ciclo', 'anual', 'vale_em', v_inicio, 'parcelas', p_parcelas, 'valor', v_valor));
      perform public.cobranca_avisar_plataforma(p_org, 'escolheu o plano anual a partir de ' || to_char(v_inicio, 'MM/YYYY')
        || ' (' || public.reais(v_valor) || case when p_parcelas > 1 then ' em ' || p_parcelas || 'x no cartão' else '' end || ')');
    end if;
    return jsonb_build_object('tipo', 'anual', 'ciclo', 'anual', 'vale_em', v_inicio, 'valor', v_valor,
                              'valor_plano', p.preco_anual, 'parcelas', p_parcelas, 'plano', p.nome);
  end if;

  -- Mensal.
  if c.ciclo = 'mensal' then
    if c.ciclo_proximo is null then
      return jsonb_build_object('tipo', 'igual', 'ciclo', 'mensal');
    end if;
    if p_confirmar then
      update public.contratos_cobranca set ciclo_proximo = null, ciclo_proximo_em = null where org_id = p_org;
      insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
      values (p_org, 'atendente', auth.uid(), 'definir_ciclo', 'contratos_cobranca', p_org::text,
              jsonb_build_object('ciclo_proximo', c.ciclo_proximo), jsonb_build_object('ciclo_proximo', null));
    end if;
    return jsonb_build_object('tipo', 'cancelar', 'ciclo', 'mensal');
  end if;
  if c.ciclo_proximo = 'mensal' then
    return jsonb_build_object('tipo', 'mensal', 'ciclo', 'mensal', 'vale_em', c.ciclo_proximo_em, 'agora', false);
  end if;
  -- A fatura anual ainda não saiu (teste grátis, ou dia 1 antes do fechamento): volta ao mensal na hora.
  v_agora := c.anual_inicio > v_mes
    or (c.anual_inicio = v_mes and not exists (select 1 from public.faturas where org_id = p_org and competencia = v_mes
                                                  and tipo = 'mes' and status <> 'cancelada'));
  if p_confirmar then
    if v_agora then
      update public.contratos_cobranca set ciclo = 'mensal', anual_inicio = null, ciclo_proximo = null,
             ciclo_proximo_em = null, aviso_renovacao_em = null
       where org_id = p_org;
      -- Descida e desligamentos marcados para a renovação passam para o dia 1 seguinte, como no mensal.
      update public.organizacoes set plano_proximo_em = v_prox where id = p_org and plano_proximo_em > v_prox;
      update public.organizacao_modulos set desliga_em = v_prox where org_id = p_org and desliga_em > v_prox;
    else
      update public.contratos_cobranca set ciclo_proximo = 'mensal', ciclo_proximo_em = v_renova where org_id = p_org;
    end if;
    insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'atendente', auth.uid(), 'definir_ciclo', 'contratos_cobranca', p_org::text,
            jsonb_build_object('ciclo', 'anual'),
            jsonb_build_object('ciclo', 'mensal', 'vale_em', case when v_agora then v_mes else v_renova end));
    perform public.cobranca_avisar_plataforma(p_org, case when v_agora then 'voltou ao plano mensal antes da fatura anual'
                                                          else 'volta ao plano mensal na renovação, em ' || to_char(v_renova, 'DD/MM/YYYY') end);
  end if;
  return jsonb_build_object('tipo', 'mensal', 'ciclo', 'mensal', 'agora', v_agora,
                            'vale_em', case when v_agora then v_mes else v_renova end);
end $$;
revoke execute on function public.plano_ciclo(uuid, text, integer, boolean) from public, anon;
grant execute on function public.plano_ciclo(uuid, text, integer, boolean) to authenticated;

-- ---------- módulos pelo dono ----------
-- Ligar vale na hora: mensal, a diferença dos dias que faltam vira ajuste na próxima fatura (se a fatura do mês já
-- saiu); anual, cobrança avulsa da diferença anual dos meses que faltam. Desligar vale no dia 1 seguinte (anual: na
-- renovação), sem devolução; no teste grátis, na hora. Ligar um módulo com desligamento agendado só desfaz o
-- agendamento. tipo: 'ligar', 'manter', 'desligar' ou 'igual'.
create function public.modulo_contratar(p_org uuid, p_modulo text, p_ligar boolean, p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.organizacoes;
  c public.contratos_cobranca;
  pl public.planos;
  m public.modulos;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := public.mes_brasilia();
  v_prox date := (public.mes_brasilia() + interval '1 month')::date;
  v_anual boolean;
  v_teste boolean;
  v_renova date;
  v_fim date;
  v_ativo boolean;
  v_desliga date;
  v_antes text[];
  v_depois text[];
  v_dif numeric;
  v_valor numeric := 0;
  v_cheio boolean;
  v_dias integer;
  v_dias_mes integer;
  v_meses integer;
  v_avulsa uuid;
  v_sem_nota boolean;
  v_proximo public.planos;
begin
  if not public.eh_dono_de_fato(p_org) then
    raise exception 'Só o dono da empresa contrata ou desliga módulos. Se precisar, fale com o dono.';
  end if;
  select * into o from public.organizacoes where id = p_org for update;
  select * into m from public.modulos where codigo = p_modulo and preco_mensal is not null;
  if m.codigo is null then
    raise exception 'Escolha um dos módulos da lista.';
  end if;
  select * into c from public.contratos_cobranca where org_id = p_org for update;
  if c.org_id is null or not c.ativo then
    raise exception 'Para contratar ou desligar módulos, fale com a equipe da Livih.';
  end if;
  if c.valor_fixo is not null then
    raise exception 'O plano da sua empresa tem um valor combinado. Para mudar os módulos, fale com a equipe da Livih.';
  end if;
  select * into pl from public.planos where codigo = o.plano;
  v_anual := c.ciclo = 'anual';
  v_teste := c.inicio > v_mes;
  v_renova := (c.anual_inicio + interval '12 months')::date;
  v_fim := case when v_anual then v_renova else v_prox end;
  v_ativo := public.modulo_ativo(p_org, p_modulo);
  select om.desliga_em into v_desliga from public.organizacao_modulos om where om.org_id = p_org and om.modulo = p_modulo;
  v_antes := public.modulos_pagos(p_org);

  if p_ligar then
    if v_ativo then
      if v_desliga is null then
        return jsonb_build_object('tipo', 'igual', 'modulo', m.nome);
      end if;
      if p_confirmar then
        update public.organizacao_modulos set desliga_em = null, atualizado_em = now(), atualizado_por = auth.uid()
         where org_id = p_org and modulo = p_modulo;
        insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
        values (p_org, 'atendente', auth.uid(), 'manter_modulo', 'modulos', p_modulo,
                jsonb_build_object('desliga_em', v_desliga), jsonb_build_object('desliga_em', null));
      end if;
      return jsonb_build_object('tipo', 'manter', 'modulo', m.nome);
    end if;
    if not pl.permite_modulos then
      raise exception 'O plano % não inclui ERP nem Ordens de serviço. Para contratar, suba para o Start ou um plano acima, aqui em Plano e consumo.', pl.nome;
    end if;
    select * into v_proximo from public.planos where codigo = o.plano_proximo;
    if v_proximo.codigo is not null and not v_proximo.permite_modulos then
      raise exception 'O plano %, que começa em %, não inclui ERP nem Ordens de serviço. Para contratar, cancele antes a troca (botão Manter o plano %), aqui em Plano e consumo.',
        v_proximo.nome, to_char(o.plano_proximo_em, 'DD/MM/YYYY'), pl.nome;
    end if;
    v_depois := v_antes || p_modulo;
    v_dif := public.modulos_valor(v_depois, v_anual) - public.modulos_valor(v_antes, v_anual);
    v_dias_mes := v_prox - v_mes;
    v_dias := v_prox - v_hoje;
    v_meses := public.meses_entre(v_mes, v_renova);
    -- A fatura que leva os módulos ainda vai sair (ou é o teste grátis): ela já sai com o módulo, sem diferença.
    v_cheio := v_teste or coalesce(c.anual_inicio > v_mes, false)
      or ((not v_anual or c.anual_inicio = v_mes)
          and not exists (select 1 from public.faturas where org_id = p_org and competencia = v_mes and tipo = 'mes'
                             and status <> 'cancelada'));
    if not v_cheio then
      v_valor := case when v_anual then round(v_dif * v_meses / 12, 2) else round(v_dif * v_dias / v_dias_mes, 2) end;
    end if;
    if p_confirmar then
      insert into public.organizacao_modulos (org_id, modulo, ativo, atualizado_por)
      values (p_org, p_modulo, true, auth.uid())
      on conflict (org_id, modulo) do update set ativo = true, desliga_em = null, atualizado_em = now(),
                                                 atualizado_por = auth.uid();
      if v_valor >= 0.01 and v_anual then
        v_avulsa := public.cobranca_criar_avulsa(p_org, jsonb_build_array(jsonb_build_object(
          'descricao', 'Módulo ' || m.nome || ' anual de ' || to_char(v_mes, 'MM/YYYY') || ' a '
                       || to_char((v_renova - interval '1 month')::date, 'MM/YYYY') || ' (' || v_meses || ' de 12 meses)',
          'quantidade', 1, 'valor', v_valor, 'anual', true)));
      elsif v_valor >= 0.01 then
        insert into public.cobranca_ajustes (org_id, mes, descricao, valor, criado_por)
        values (p_org, v_mes, 'Módulo ' || m.nome || ' de ' || to_char(v_hoje, 'DD/MM') || ' a ' || to_char(v_prox - 1, 'DD/MM')
                || ' (' || v_dias || ' de ' || v_dias_mes || ' dias)', v_valor, auth.uid());
      end if;
      insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
      values (p_org, 'atendente', auth.uid(), 'contratar_modulo', 'modulos', p_modulo,
              jsonb_build_object('ativo', false),
              jsonb_build_object('ativo', true, 'ajuste', v_valor, 'ciclo', c.ciclo, 'fatura_avulsa', v_avulsa));
      perform public.cobranca_avisar_plataforma(p_org, 'contratou o módulo ' || m.nome
        || case when v_valor >= 0.01 and v_anual then ' (cobrança avulsa de ' || public.reais(v_valor) || ')'
                when v_valor >= 0.01 then ' (ajuste de ' || public.reais(v_valor) || ' na próxima fatura)' else '' end
        || '. Se for emitir nota, confira a vaga na Focus.');
      if v_avulsa is not null then
        perform public.chamar_funcao('asaas-cobranca');
      end if;
    end if;
    return jsonb_build_object('tipo', 'ligar', 'modulo', m.nome, 'valor', v_valor, 'diferenca', v_dif,
                              'anual', v_anual, 'dias', v_dias, 'dias_mes', v_dias_mes, 'meses', v_meses,
                              'renova_em', v_renova, 'teste_gratis', v_teste,
                              'total_modulos', public.modulos_valor(v_depois, v_anual));
  end if;

  -- Desligar.
  if not v_ativo then
    return jsonb_build_object('tipo', 'igual', 'modulo', m.nome);
  end if;
  if v_desliga is not null then
    return jsonb_build_object('tipo', 'desligar', 'modulo', m.nome, 'vale_em', v_desliga, 'agora', false);
  end if;
  -- Sem ERP nem OS depois disso, a nota fiscal some (as notas emitidas continuam visíveis).
  v_sem_nota := p_modulo in ('erp', 'os') and not exists (
    select 1 from public.modulos mm left join public.organizacao_modulos om on om.org_id = p_org and om.modulo = mm.codigo
     where mm.codigo in ('erp', 'os') and mm.codigo <> p_modulo and public.modulo_ativo(p_org, mm.codigo)
       and om.desliga_em is null);
  if p_confirmar then
    if v_teste then
      delete from public.organizacao_modulos where org_id = p_org and modulo = p_modulo and not m.padrao;
      update public.organizacao_modulos set ativo = false, desliga_em = null where org_id = p_org and modulo = p_modulo;
    else
      update public.organizacao_modulos set desliga_em = v_fim, atualizado_em = now(), atualizado_por = auth.uid()
       where org_id = p_org and modulo = p_modulo;
    end if;
    insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'atendente', auth.uid(), 'desligar_modulo', 'modulos', p_modulo,
            jsonb_build_object('ativo', true),
            jsonb_build_object('ativo', not v_teste, 'desliga_em', case when not v_teste then v_fim end));
    perform public.cobranca_avisar_plataforma(p_org, 'desliga o módulo ' || m.nome
      || case when v_teste then ' (teste grátis, na hora)' else ' em ' || to_char(v_fim, 'DD/MM/YYYY') end);
  end if;
  return jsonb_build_object('tipo', 'desligar', 'modulo', m.nome, 'agora', v_teste,
                            'vale_em', case when v_teste then null else v_fim end, 'sem_nota', v_sem_nota);
end $$;
revoke execute on function public.modulo_contratar(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.modulo_contratar(uuid, text, boolean, boolean) to authenticated;

-- ---------- agendados do dia 1 (da migration 20261102140000) ----------
-- Antes das faturas do mês: renovação ou fim do anual, começo do anual, módulos desligados e descidas de plano.
create or replace function public.planos_aplicar_agendados() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_mes date := public.mes_brasilia();
  v_total integer := 0;
begin
  for r in
    select org_id, anual_inicio, ciclo_proximo from public.contratos_cobranca
     where ciclo = 'anual' and (anual_inicio + interval '12 months')::date <= v_mes
       for update
  loop
    if r.ciclo_proximo = 'mensal' then
      update public.contratos_cobranca set ciclo = 'mensal', anual_inicio = null, ciclo_proximo = null,
             ciclo_proximo_em = null, aviso_renovacao_em = null
       where org_id = r.org_id;
    else
      update public.contratos_cobranca set anual_inicio = (r.anual_inicio + interval '12 months')::date,
             ciclo_proximo = null, ciclo_proximo_em = null, aviso_renovacao_em = null
       where org_id = r.org_id;
    end if;
    insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
    values (r.org_id, 'sistema', case when r.ciclo_proximo = 'mensal' then 'voltar_ao_mensal' else 'renovar_anual' end,
            'contratos_cobranca', r.org_id::text, jsonb_build_object('anual_inicio', r.anual_inicio),
            jsonb_build_object('anual_inicio', case when r.ciclo_proximo = 'mensal' then null
                                                    else (r.anual_inicio + interval '12 months')::date end));
    v_total := v_total + 1;
  end loop;

  -- Pedido no mensal: o anual começa no mês marcado, se a cobrança já começou (no teste grátis, ele já vale).
  for r in
    select org_id from public.contratos_cobranca
     where ciclo = 'mensal' and ciclo_proximo = 'anual' and ciclo_proximo_em <= v_mes and inicio <= v_mes
       for update
  loop
    update public.contratos_cobranca set ciclo = 'anual', anual_inicio = v_mes, ciclo_proximo = null,
           ciclo_proximo_em = null, aviso_renovacao_em = null
     where org_id = r.org_id;
    insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
    values (r.org_id, 'sistema', 'comecar_anual', 'contratos_cobranca', r.org_id::text,
            jsonb_build_object('ciclo', 'mensal'), jsonb_build_object('ciclo', 'anual', 'anual_inicio', v_mes));
    v_total := v_total + 1;
  end loop;

  for r in
    select om.org_id, om.modulo, m.padrao from public.organizacao_modulos om join public.modulos m on m.codigo = om.modulo
     where om.desliga_em <= v_mes
       for update of om
  loop
    if r.padrao then
      update public.organizacao_modulos set ativo = false, desliga_em = null where org_id = r.org_id and modulo = r.modulo;
    else
      delete from public.organizacao_modulos where org_id = r.org_id and modulo = r.modulo;
    end if;
    insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
    values (r.org_id, 'sistema', 'aplicar_desligar_modulo', 'modulos', r.modulo,
            jsonb_build_object('ativo', true), jsonb_build_object('ativo', false));
    v_total := v_total + 1;
  end loop;

  for r in
    select id, plano, plano_proximo from public.organizacoes
     where plano_proximo is not null and plano_proximo_em <= v_mes
       for update
  loop
    update public.organizacoes set plano = r.plano_proximo, plano_proximo = null, plano_proximo_em = null where id = r.id;
    insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
    values (r.id, 'sistema', 'aplicar_troca_plano', 'organizacoes', r.id::text,
            jsonb_build_object('plano', r.plano), jsonb_build_object('plano', r.plano_proximo));
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

-- ---------- aviso de renovação, 15 dias antes ----------
-- Uma vez por renovação; quem pediu para voltar ao mensal não recebe. O valor é o do plano e dos módulos que valem na
-- renovação, pela tabela de hoje.
create function public.cobranca_avisar_renovacoes() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r record;
  v_valor numeric;
  v_total integer := 0;
begin
  for r in
    select cc.org_id, o.nome as org_nome, (cc.anual_inicio + interval '12 months')::date as renova, cc.anual_parcelas,
           coalesce(pp.nome, pa.nome) as plano_nome, coalesce(pp.preco_anual, pa.preco_anual) as plano_valor
      from public.contratos_cobranca cc
      join public.organizacoes o on o.id = cc.org_id
      join public.planos pa on pa.codigo = o.plano
      left join public.planos pp on pp.codigo = o.plano_proximo
                                and o.plano_proximo_em <= (cc.anual_inicio + interval '12 months')::date
     where cc.ciclo = 'anual' and cc.ativo and cc.valor_fixo is null and cc.ciclo_proximo is null and o.status = 'ativa'
       and (cc.anual_inicio + interval '12 months')::date - 15 <= v_hoje
       and (cc.anual_inicio + interval '12 months')::date > v_hoje
       and cc.aviso_renovacao_em is distinct from (cc.anual_inicio + interval '12 months')::date
  loop
    v_valor := coalesce(r.plano_valor, 0) + public.modulos_valor(coalesce((
      select array_agg(m.codigo) from public.modulos m
        left join public.organizacao_modulos om on om.org_id = r.org_id and om.modulo = m.codigo
       where m.preco_mensal is not null and public.modulo_ativo(r.org_id, m.codigo)
         and (om.desliga_em is null or om.desliga_em > r.renova)), '{}'), true);
    update public.contratos_cobranca set aviso_renovacao_em = r.renova where org_id = r.org_id;
    perform public.cobranca_avisar(r.org_id, '🔁', 'O plano anual da Livih renova em ' || to_char(r.renova, 'DD/MM'),
      'O plano anual da empresa ' || r.org_nome || ' renova sozinho em ' || to_char(r.renova, 'DD/MM/YYYY')
      || ', por ' || public.reais(v_valor) || ' (plano ' || r.plano_nome || case when v_valor > coalesce(r.plano_valor, 0)
                                                                              then ' e módulos' else '' end
      || ', pelo preço de tabela)'
      || case when r.anual_parcelas > 1 then ', no cartão em ' || r.anual_parcelas || 'x sem juros' else '' end
      || '. Para passar ao mensal ou trocar de plano, o dono muda em Configurações → Plano e consumo até '
      || to_char(r.renova - 1, 'DD/MM') || '. Se nada mudar, a fatura do ano sai nesse dia, com vencimento no dia 10.',
      null, '/configuracoes/uso',
      'anual renova em ' || to_char(r.renova, 'DD/MM/YYYY') || ' (' || public.reais(v_valor) || ')');
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;
revoke execute on function public.cobranca_avisar_renovacoes() from public, anon, authenticated;

-- 12:20 UTC = 09:20 em Brasília, depois da rotina de atrasos.
select cron.schedule('livih-cobranca-renovacoes', '20 12 * * *', 'select public.cobranca_avisar_renovacoes()');

-- ---------- encerrar o anual (plataforma) ----------
-- Devolução (decisão de 01/11, site-planos.md): integral até 7 dias depois do pagamento da fatura anual; depois, o pago
-- no ano (itens anuais das faturas pagas: a anual e as diferenças avulsas) menos os meses usados, contando o atual, a
-- preço mensal de hoje (plano e módulos); do 10º mês em diante, nada. Confirmado: volta ao mensal e desliga a
-- cobrança. A devolução, se houver, é feita no painel do Asaas, e a plataforma decide se suspende a empresa.
create function public.plataforma_encerrar_anual(p_org uuid, p_confirmar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.contratos_cobranca;
  v_mes date := public.mes_brasilia();
  v_renova date;
  v_pago numeric;
  v_pago_em timestamptz;
  v_meses integer;
  v_mensal numeric;
  v_integral boolean;
  v_devolver numeric;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma muda a cobrança. Entre com a conta da plataforma.';
  end if;
  select * into c from public.contratos_cobranca where org_id = p_org for update;
  if c.ciclo is distinct from 'anual' then
    raise exception 'Esta empresa não está mais no plano anual. Atualize a página.';
  end if;
  v_renova := (c.anual_inicio + interval '12 months')::date;
  select coalesce(sum((i ->> 'valor')::numeric), 0) into v_pago
    from public.faturas f cross join lateral jsonb_array_elements(f.itens) i
   where f.org_id = p_org and f.status = 'paga' and f.competencia >= c.anual_inicio and f.competencia < v_renova
     and (i ->> 'anual')::boolean is true;
  select f.paga_em into v_pago_em from public.faturas f
   where f.org_id = p_org and f.tipo = 'mes' and f.competencia = c.anual_inicio and f.status = 'paga';
  v_meses := greatest(public.meses_entre(c.anual_inicio, v_mes) + 1, 1);
  v_mensal := coalesce((select p.preco_mensal from public.organizacoes o join public.planos p on p.codigo = o.plano
                         where o.id = p_org), 0) + public.modulos_valor(public.modulos_pagos(p_org), false);
  v_integral := v_pago_em is not null and v_pago_em >= now() - interval '7 days';
  v_devolver := case when v_pago <= 0 then 0
                     when v_integral then v_pago
                     when v_meses >= 10 then 0
                     else greatest(0, round(v_pago - v_meses * v_mensal, 2)) end;
  if p_confirmar then
    update public.contratos_cobranca set ciclo = 'mensal', anual_inicio = null, ciclo_proximo = null, ciclo_proximo_em = null,
           aviso_renovacao_em = null, ativo = false, atualizado_em = now(), atualizado_por = auth.uid()
     where org_id = p_org;
    insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'atendente', auth.uid(), 'encerrar_anual', 'contratos_cobranca', p_org::text,
            jsonb_build_object('ciclo', 'anual', 'anual_inicio', c.anual_inicio, 'ativo', c.ativo),
            jsonb_build_object('ciclo', 'mensal', 'ativo', false, 'pago', v_pago, 'meses_usados', v_meses,
                               'mensal', v_mensal, 'devolver', v_devolver));
  end if;
  return jsonb_build_object('pago', v_pago, 'meses_usados', v_meses, 'mensal', v_mensal, 'integral', v_integral,
                            'devolver', v_devolver, 'anual_inicio', c.anual_inicio, 'renova_em', v_renova);
end $$;
revoke execute on function public.plataforma_encerrar_anual(uuid, boolean) from public, anon;
grant execute on function public.plataforma_encerrar_anual(uuid, boolean) to authenticated;
