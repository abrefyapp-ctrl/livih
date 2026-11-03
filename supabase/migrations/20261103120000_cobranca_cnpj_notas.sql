-- CNPJ adicional e notas além das 100 na fatura (docs/planos-modulos.md, pedido de 03/11).
--
-- O site mostra os dois preços (CNPJ a mais R$ 49 por mês ou R$ 490 por ano; nota além das 100 do mês por CNPJ,
-- R$ 0,20), e a fatura não contava nenhum. A Focus cobra a Livih por CNPJ e por nota; sem isso, quem tem vários CNPJs
-- ou emite muito sai mais caro do que paga.
--
-- Regras (03/11):
-- - CNPJ que conta: emissora cadastrada na Focus (focus_empresa_id) e em produção no fechamento, ou que emitiu nota
--   em produção no mês anterior. Homologação é teste e não paga. A segunda condição fecha a brecha de passar a
--   emissora para homologação na véspera do fechamento e voltar depois (o dono muda o ambiente; revisor-banco, 03/11).
-- - O módulo (ERP, OS ou os dois) já inclui 1 CNPJ: paga-se a partir do segundo, e só com módulo pago ligado.
-- - Mensal: R$ 49 por CNPJ a mais na fatura do mês, como os módulos (o que estiver em produção no fechamento).
-- - Anual: R$ 490 por CNPJ a mais na fatura do ano. CNPJ que entra no meio do ano paga R$ 49 por mês até a
--   renovação, quando passa para o anual. A devolução do anual conta os CNPJs pagos no ano a R$ 49 por mês usado.
-- - Valor combinado (valor_fixo) cobre o CNPJ adicional, como cobre plano e módulos.
-- - Notas: por CNPJ, as autorizadas em produção no mês anterior (horário de Brasília) que passam de 100, a R$ 0,20,
--   como os atendimentos a mais: entram também no anual e no valor combinado. Nota cancelada depois conta, porque a
--   Focus cobra a emissão.
-- Fica para depois: os preços estão escritos aqui, não num catálogo (como os R$ 109,80 dos dois módulos).

-- Contagem das notas em produção por empresa e data (fechamento e CNPJ cobrado).
create index notas_fiscais_producao_idx on public.notas_fiscais (org_id, autorizada_em)
  where ambiente = 'producao' and autorizada_em is not null;

-- CNPJs da empresa que a Focus cobra na fatura de p_competencia: cadastrados lá e em produção agora, ou que emitiram
-- nota em produção no mês anterior.
create function public.cnpjs_cobrados(p_org uuid, p_competencia date) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.emissoras e
   where e.org_id = p_org and e.focus_empresa_id is not null
     and (e.nfe_ambiente = 'producao'
          or exists (select 1 from public.notas_fiscais nf
                      where nf.org_id = p_org and nf.emissora_id = e.id and nf.ambiente = 'producao'
                        and nf.autorizada_em >= ((p_competencia - interval '1 month')::timestamp at time zone 'America/Sao_Paulo')
                        and nf.autorizada_em < (p_competencia::timestamp at time zone 'America/Sao_Paulo')));
$$;
revoke execute on function public.cnpjs_cobrados(uuid, date) from public, anon, authenticated;

-- CNPJs além do primeiro, só com módulo pago ligado (o módulo inclui 1 CNPJ).
create function public.cnpjs_adicionais(p_org uuid, p_competencia date) returns integer
language sql stable security definer set search_path = '' as $$
  select case when cardinality(public.modulos_pagos(p_org)) = 0 then 0
              else greatest(public.cnpjs_cobrados(p_org, p_competencia) - 1, 0) end;
$$;
revoke execute on function public.cnpjs_adicionais(uuid, date) from public, anon, authenticated;

-- CNPJs a mais na fatura do ano que começou em p_inicio: sem as canceladas, ou só as pagas (devolução).
create function public.cnpjs_no_anual(p_org uuid, p_inicio date, p_so_pagas boolean default false) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum((i ->> 'quantidade')::integer), 0)::integer
    from public.faturas f cross join lateral jsonb_array_elements(f.itens) i
   where f.org_id = p_org and f.status <> 'cancelada' and (not p_so_pagas or f.status = 'paga')
     and f.competencia >= p_inicio and f.competencia < (p_inicio + interval '12 months')::date
     and (i ->> 'anual')::boolean is true and (i ->> 'cnpj_adicional')::boolean is true;
$$;
revoke execute on function public.cnpjs_no_anual(uuid, date, boolean) from public, anon, authenticated;

-- Notas além das 100 por CNPJ no mês p_mes (dia 1), em produção, pela data da autorização em Brasília.
create function public.notas_excedentes(p_org uuid, p_mes date) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(greatest(x.n - 100, 0)), 0)::integer
    from (select count(*) as n from public.notas_fiscais nf
           where nf.org_id = p_org and nf.ambiente = 'producao'
             and nf.autorizada_em >= (p_mes::timestamp at time zone 'America/Sao_Paulo')
             and nf.autorizada_em < ((p_mes + interval '1 month')::timestamp at time zone 'America/Sao_Paulo')
           group by nf.emissora_id) x;
$$;
revoke execute on function public.notas_excedentes(uuid, date) from public, anon, authenticated;

-- ---------- itens da fatura (da migration 20261102160000) ----------
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
    if public.anual_a_cobrar(p_org, p_competencia) then
      v_periodo := ' anual (' || to_char(p_competencia, 'MM/YYYY') || ' a '
                   || to_char((p_competencia + interval '11 months')::date, 'MM/YYYY') || ')';
      if p.preco_anual is not null then
        v_itens := v_itens || jsonb_build_array(jsonb_build_object(
          'descricao', 'Plano ' || p.nome || v_periodo, 'quantidade', 1, 'valor', p.preco_anual, 'anual', true));
      end if;
      v_itens := v_itens || public.modulos_itens(public.modulos_pagos(p_org), true, v_periodo);
      v_qtd := public.cnpjs_adicionais(p_org, p_competencia);
      if v_qtd > 0 then
        v_itens := v_itens || jsonb_build_array(jsonb_build_object(
          'descricao', 'CNPJ adicional para nota fiscal' || v_periodo, 'quantidade', v_qtd, 'valor', v_qtd * 490,
          'anual', true, 'cnpj_adicional', true));
      end if;
    else
      -- CNPJ que entrou depois da fatura do ano: por mês até a renovação.
      v_qtd := public.cnpjs_adicionais(p_org, p_competencia) - public.cnpjs_no_anual(p_org, c.anual_inicio);
      if v_qtd > 0 then
        v_itens := v_itens || jsonb_build_array(jsonb_build_object(
          'descricao', 'CNPJ adicional para nota fiscal (ligado depois da fatura do ano)', 'quantidade', v_qtd,
          'valor', round(v_qtd * 49, 2), 'cnpj_adicional', true));
      end if;
    end if;
  else
    if p.preco_mensal is not null then
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'descricao', 'Plano ' || p.nome, 'quantidade', 1, 'valor', p.preco_mensal));
    end if;
    v_itens := v_itens || public.modulos_itens(public.modulos_pagos(p_org), false);
    v_qtd := public.cnpjs_adicionais(p_org, p_competencia);
    if v_qtd > 0 then
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'descricao', 'CNPJ adicional para nota fiscal', 'quantidade', v_qtd, 'valor', round(v_qtd * 49, 2),
        'cnpj_adicional', true));
    end if;
  end if;

  -- Atendimentos a mais, notas a mais, pacotes e ajustes do mês anterior (também no anual e no valor combinado).
  select count(*) into v_qtd from public.atendimentos_agente a
   where a.org_id = p_org and a.mes = v_anterior and a.excedente;
  if v_qtd > 0 then
    v_itens := v_itens || jsonb_build_array(jsonb_build_object(
      'descricao', 'Atendimentos a mais do agente em ' || to_char(v_anterior, 'MM/YYYY'),
      'quantidade', v_qtd, 'valor', round(v_qtd * p.excedente_preco, 2)));
  end if;
  v_qtd := public.notas_excedentes(p_org, v_anterior);
  if v_qtd > 0 then
    v_itens := v_itens || jsonb_build_array(jsonb_build_object(
      'descricao', 'Notas fiscais além das 100 por CNPJ em ' || to_char(v_anterior, 'MM/YYYY'),
      'quantidade', v_qtd, 'valor', round(v_qtd * 0.20, 2)));
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

-- ---------- encerrar o anual (da migration 20261102160000) ----------
-- O mensal de hoje, que desconta os meses usados, passa a contar os CNPJs a mais pagos no ano (só faturas pagas).
create or replace function public.plataforma_encerrar_anual(p_org uuid, p_confirmar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.contratos_cobranca;
  v_mes date := public.mes_brasilia();
  v_prox date := (public.mes_brasilia() + interval '1 month')::date;
  v_renova date;
  v_pago numeric;
  v_pago_em timestamptz;
  v_meses integer;
  v_mensal numeric;
  v_integral boolean;
  v_devolver numeric;
  v_abertas integer;
  v_valor_aberto numeric;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma muda a cobrança. Entre com a conta da plataforma.';
  end if;
  perform 1 from public.organizacoes where id = p_org for update;
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
                         where o.id = p_org), 0) + public.modulos_valor(public.modulos_pagos(p_org), false)
              + public.cnpjs_no_anual(p_org, c.anual_inicio, true) * 49;
  v_integral := v_pago_em is not null and v_pago_em >= now() - interval '7 days';
  v_devolver := case when v_pago <= 0 then 0
                     when v_integral then v_pago
                     when v_meses >= 10 then 0
                     else greatest(0, round(v_pago - v_meses * v_mensal, 2)) end;
  -- Faturas do ano ainda não pagas (a anual e as diferenças avulsas): canceladas junto.
  select count(*), coalesce(sum(f.valor), 0) into v_abertas, v_valor_aberto from public.faturas f
   where f.org_id = p_org and f.status in ('a_enviar', 'enviando', 'erro', 'aberta', 'vencida')
     and f.competencia >= c.anual_inicio and f.competencia < v_renova and f.itens @> '[{"anual": true}]';
  if p_confirmar then
    if exists (select 1 from public.faturas f where f.org_id = p_org and f.status = 'enviando'
                  and f.competencia >= c.anual_inicio and f.itens @> '[{"anual": true}]') then
      raise exception 'Uma fatura do anual está sendo enviada ao Asaas agora. Tente de novo em um minuto.';
    end if;
    update public.faturas f
       set status = case when f.asaas_id is null then 'cancelada' else 'a_cancelar' end, atualizado_em = now()
     where f.org_id = p_org and f.status in ('a_enviar', 'erro', 'aberta', 'vencida')
       and f.competencia >= c.anual_inicio and f.competencia < v_renova and f.itens @> '[{"anual": true}]';
    update public.contratos_cobranca set ciclo = 'mensal', anual_inicio = null, ciclo_proximo = null, ciclo_proximo_em = null,
           aviso_renovacao_em = null, ativo = false, atualizado_em = now(), atualizado_por = auth.uid()
     where org_id = p_org;
    -- Descida e desligamentos marcados para a renovação passam para o dia 1 seguinte, como no mensal.
    update public.organizacoes set plano_proximo_em = v_prox where id = p_org and plano_proximo_em > v_prox;
    update public.organizacao_modulos set desliga_em = v_prox where org_id = p_org and desliga_em > v_prox;
    insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'atendente', auth.uid(), 'encerrar_anual', 'contratos_cobranca', p_org::text,
            jsonb_build_object('ciclo', 'anual', 'anual_inicio', c.anual_inicio, 'ativo', c.ativo),
            jsonb_build_object('ciclo', 'mensal', 'ativo', false, 'pago', v_pago, 'meses_usados', v_meses,
                               'mensal', v_mensal, 'devolver', v_devolver, 'faturas_canceladas', v_abertas));
    if v_abertas > 0 then
      perform public.chamar_funcao('asaas-cobranca');
    end if;
  end if;
  return jsonb_build_object('pago', v_pago, 'meses_usados', v_meses, 'mensal', v_mensal, 'integral', v_integral,
                            'devolver', v_devolver, 'anual_inicio', c.anual_inicio, 'renova_em', v_renova,
                            'faturas_abertas', v_abertas, 'valor_aberto', v_valor_aberto);
end $$;
