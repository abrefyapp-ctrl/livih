-- Correções da entrega 4b (revisão de 02/11 pelo revisor-banco, depois de aplicada; nenhuma empresa estava no anual).
--
-- 1. A fatura do ano não depende mais de sair no mês exato em que o ano começa ou renova. Empresa suspensa na virada,
--    fatura anual cancelada e gerada de novo, ou o fechamento que falhou: a primeira fatura do mês (tipo 'mes') do
--    período sem os itens do ano leva o ano inteiro, e o ano passa a contar dali (anual_a_cobrar). Antes, o ano saía
--    de graça.
-- 2. Encerrar o anual cancela as faturas do ano ainda não pagas (a anual e as diferenças avulsas), para o Asaas não
--    cobrar nem a empresa ser suspensa por um anual encerrado, e traz para o dia 1 seguinte a descida e os
--    desligamentos marcados para a renovação.
-- 3. Antes de a fatura do ano sair (teste grátis, dia 1 antes do fechamento), descer de plano e desligar módulo valem
--    no dia 1 seguinte, e não na renovação de daqui a um ano: a fatura do ano já sai com a troca.
-- 4. Webhook: parcelas 2 a 12 do cartão. Contestação, estorno e exclusão de uma parcela avisam a plataforma; a busca
--    pela referência só aceita a primeira parcela.
-- 5. Agendados do dia 1: uma empresa por vez, cada uma com o próprio tratamento de erro (uma falha não desfaz as
--    outras), travando a empresa antes do contrato, na mesma ordem das funções do dono.
-- 6. Módulo com preço mensal precisa de preço anual (sem ele, sairia de graça no anual).
-- Fica como está, por decisão: a fatura anual parcelada também parcela o resto do mês anterior (atendimentos a mais,
-- pacotes e ajustes), com a taxa paga pela Livih.

alter table public.modulos add constraint modulos_anual_obrigatorio_check check (preco_mensal is null or preco_anual is not null);
create index faturas_parcelamento_idx on public.faturas (asaas_parcelamento) where asaas_parcelamento is not null;

-- O período anual atual ainda não teve a fatura do ano (a do mês com os itens anuais, sem contar as canceladas).
-- Verdadeiro a partir do mês em que o ano começa, até a fatura sair.
create function public.anual_a_cobrar(p_org uuid, p_competencia date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contratos_cobranca c
     where c.org_id = p_org and c.ciclo = 'anual' and c.valor_fixo is null
       and c.anual_inicio <= p_competencia and p_competencia < (c.anual_inicio + interval '12 months')::date
       and not exists (select 1 from public.faturas f
                        where f.org_id = p_org and f.tipo = 'mes' and f.status <> 'cancelada'
                          and f.competencia >= c.anual_inicio
                          and f.competencia < (c.anual_inicio + interval '12 months')::date
                          and f.itens @> '[{"anual": true}]'));
$$;
revoke execute on function public.anual_a_cobrar(uuid, date) from public, anon, authenticated;

-- ---------- 1. fatura do ano ----------
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

-- Fatura do mês (da migration 20261102150000): a que leva o ano usa as parcelas do dono, e o ano passa a contar do mês
-- dela quando ela sai depois do mês em que o ano devia começar.
create or replace function public.cobranca_criar_fatura(p_org uuid, p_competencia date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_anual boolean := public.anual_a_cobrar(p_org, p_competencia);
  v_itens jsonb := public.cobranca_itens(p_org, p_competencia);
  v_valor numeric := (select coalesce(sum((i ->> 'valor')::numeric), 0) from jsonb_array_elements(v_itens) i);
  v_dados boolean := exists (select 1 from public.dados_cobranca where org_id = p_org);
  v_parcelas integer := case when v_anual
                             then coalesce((select anual_parcelas from public.contratos_cobranca where org_id = p_org), 1)
                             else 1 end;
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
  if v_id is not null and v_anual then
    update public.contratos_cobranca set anual_inicio = p_competencia, aviso_renovacao_em = null
     where org_id = p_org and anual_inicio < p_competencia;
  end if;
  return v_id;
end $$;

-- ---------- 3. descer e desligar antes de a fatura do ano sair ----------
create or replace function public.plano_troca_situacao(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.organizacoes;
  c public.contratos_cobranca;
  v_motivo text;
  v_mes date := public.mes_brasilia();
  v_renova date;
  v_fim date;
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
  v_fim := case when c.ciclo = 'anual' and c.anual_inicio <= v_mes and not public.anual_a_cobrar(p_org, v_mes)
                then v_renova else (v_mes + interval '1 month')::date end;
  return jsonb_build_object(
    'pode_trocar', v_motivo is null,
    'motivo', v_motivo,
    'eh_dono', public.eh_dono_de_fato(p_org),
    'plano', o.plano,
    'plano_proximo', o.plano_proximo,
    -- Quando valem as descidas e os desligamentos pedidos agora: dia 1 seguinte, ou a renovação no anual.
    'vale_em', coalesce(o.plano_proximo_em, v_fim),
    'fim_periodo', v_fim,
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
  v_anual_cobrado boolean;
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
  -- A renovação só vale como data depois que a fatura do ano saiu; antes (teste grátis, dia 1 antes do fechamento,
  -- empresa suspensa na virada), descer e desligar valem no dia 1 seguinte, e a fatura do ano já sai com a troca.
  v_anual_cobrado := v_anual and c.anual_inicio <= v_mes and not public.anual_a_cobrar(p_org, v_mes);
  v_fim := case when v_anual_cobrado then v_renova else v_prox end;

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
    v_cheio := c.inicio <= v_mes and case when v_anual then public.anual_a_cobrar(p_org, v_mes)
      else not exists (select 1 from public.faturas where org_id = p_org and competencia = v_mes and tipo = 'mes'
                          and status <> 'cancelada') end;
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
  return jsonb_build_object('tipo', 'descer', 'plano', novo.nome, 'vale_em', v_fim, 'anual', v_anual_cobrado);
end $$;

create or replace function public.plano_ciclo(p_org uuid, p_ciclo text, p_parcelas integer default 1, p_confirmar boolean default false)
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
  v_agora := c.anual_inicio > v_mes or public.anual_a_cobrar(p_org, v_mes);
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

create or replace function public.modulo_contratar(p_org uuid, p_modulo text, p_ligar boolean, p_confirmar boolean default false)
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
  v_anual_cobrado boolean;
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
  -- A renovação só vale como data depois que a fatura do ano saiu; antes (teste grátis, dia 1 antes do fechamento,
  -- empresa suspensa na virada), descer e desligar valem no dia 1 seguinte, e a fatura do ano já sai com a troca.
  v_anual_cobrado := v_anual and c.anual_inicio <= v_mes and not public.anual_a_cobrar(p_org, v_mes);
  v_fim := case when v_anual_cobrado then v_renova else v_prox end;
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
      or case when v_anual then public.anual_a_cobrar(p_org, v_mes)
              else not exists (select 1 from public.faturas where org_id = p_org and competencia = v_mes and tipo = 'mes'
                                  and status <> 'cancelada') end;
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

-- ---------- 2. encerrar o anual ----------
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
                         where o.id = p_org), 0) + public.modulos_valor(public.modulos_pagos(p_org), false);
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

-- ---------- 5. agendados do dia 1, uma empresa por vez ----------
-- Trava a empresa e depois o contrato (a ordem de plano_trocar, plano_ciclo e modulo_contratar) e aplica, nesta
-- ordem: renovação ou fim do anual, começo do anual, módulos desligados e descida de plano.
create function public.planos_aplicar_da_empresa(p_org uuid, p_mes date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  o public.organizacoes;
  c public.contratos_cobranca;
  r record;
  v_total integer := 0;
begin
  select * into o from public.organizacoes where id = p_org for update;
  select * into c from public.contratos_cobranca where org_id = p_org for update;
  if c.ciclo = 'anual' and (c.anual_inicio + interval '12 months')::date <= p_mes then
    if c.ciclo_proximo = 'mensal' then
      update public.contratos_cobranca set ciclo = 'mensal', anual_inicio = null, ciclo_proximo = null,
             ciclo_proximo_em = null, aviso_renovacao_em = null
       where org_id = p_org;
    else
      update public.contratos_cobranca set anual_inicio = (c.anual_inicio + interval '12 months')::date,
             ciclo_proximo = null, ciclo_proximo_em = null, aviso_renovacao_em = null
       where org_id = p_org;
    end if;
    insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'sistema', case when c.ciclo_proximo = 'mensal' then 'voltar_ao_mensal' else 'renovar_anual' end,
            'contratos_cobranca', p_org::text, jsonb_build_object('anual_inicio', c.anual_inicio),
            jsonb_build_object('anual_inicio', case when c.ciclo_proximo = 'mensal' then null
                                                    else (c.anual_inicio + interval '12 months')::date end));
    v_total := v_total + 1;
  elsif c.ciclo = 'mensal' and c.ciclo_proximo = 'anual' and c.ciclo_proximo_em <= p_mes and c.inicio <= p_mes then
    update public.contratos_cobranca set ciclo = 'anual', anual_inicio = p_mes, ciclo_proximo = null,
           ciclo_proximo_em = null, aviso_renovacao_em = null
     where org_id = p_org;
    insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'sistema', 'comecar_anual', 'contratos_cobranca', p_org::text,
            jsonb_build_object('ciclo', 'mensal'), jsonb_build_object('ciclo', 'anual', 'anual_inicio', p_mes));
    v_total := v_total + 1;
  end if;

  for r in
    select om.modulo, m.padrao from public.organizacao_modulos om join public.modulos m on m.codigo = om.modulo
     where om.org_id = p_org and om.desliga_em <= p_mes
       for update of om
  loop
    if r.padrao then
      update public.organizacao_modulos set ativo = false, desliga_em = null where org_id = p_org and modulo = r.modulo;
    else
      delete from public.organizacao_modulos where org_id = p_org and modulo = r.modulo;
    end if;
    insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'sistema', 'aplicar_desligar_modulo', 'modulos', r.modulo,
            jsonb_build_object('ativo', true), jsonb_build_object('ativo', false));
    v_total := v_total + 1;
  end loop;

  if o.plano_proximo is not null and o.plano_proximo_em <= p_mes then
    update public.organizacoes set plano = o.plano_proximo, plano_proximo = null, plano_proximo_em = null where id = p_org;
    insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'sistema', 'aplicar_troca_plano', 'organizacoes', p_org::text,
            jsonb_build_object('plano', o.plano), jsonb_build_object('plano', o.plano_proximo));
    v_total := v_total + 1;
  end if;
  return v_total;
end $$;
revoke execute on function public.planos_aplicar_da_empresa(uuid, date) from public, anon, authenticated;

create or replace function public.planos_aplicar_agendados() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_mes date := public.mes_brasilia();
  v_total integer := 0;
begin
  for r in
    select o.id from public.organizacoes o
     where (o.plano_proximo is not null and o.plano_proximo_em <= v_mes)
        or exists (select 1 from public.contratos_cobranca c
                    where c.org_id = o.id
                      and ((c.ciclo = 'anual' and (c.anual_inicio + interval '12 months')::date <= v_mes)
                           or (c.ciclo = 'mensal' and c.ciclo_proximo = 'anual' and c.ciclo_proximo_em <= v_mes
                               and c.inicio <= v_mes)))
        or exists (select 1 from public.organizacao_modulos om where om.org_id = o.id and om.desliga_em <= v_mes)
  loop
    begin
      v_total := v_total + public.planos_aplicar_da_empresa(r.id, v_mes);
    exception when others then
      raise warning 'livih: agendados do dia 1 de % não aplicados: %', r.id, sqlerrm;
    end;
  end loop;
  return v_total;
end $$;

-- ---------- 4. webhook: parcelas do cartão (da migration 20261102120000) ----------
create or replace function public.cobranca_evento_asaas(p_evento_id text, p_evento text, p_pagamento jsonb, p_ambiente text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_venc date := nullif(p_pagamento ->> 'dueDate', '')::date;
  v_ref text := coalesce(p_pagamento ->> 'externalReference', '');
  v_id text := p_ambiente || ':' || p_evento_id;
  f public.faturas;
  v_res text;
begin
  if nullif(btrim(p_evento_id), '') is null or nullif(btrim(p_evento), '') is null
     or coalesce(p_ambiente, '') not in ('sandbox', 'producao') then
    raise exception 'evento do Asaas sem id, sem tipo ou sem ambiente';
  end if;
  insert into public.asaas_eventos (id, evento, pagamento_id) values (v_id, p_evento, p_pagamento ->> 'id')
  on conflict (id) do nothing;
  if not found then
    return 'repetido';
  end if;

  select * into f from public.faturas
   where asaas_id = p_pagamento ->> 'id' and ambiente = p_ambiente for update;
  -- Evento que chega antes de a asaas-cobranca gravar o id da cobrança (segundos depois de criada, ou a função caiu
  -- no meio): acha pela referência, que é o id da fatura, e grava o id. Comparado como texto: referência de outra
  -- cobrança da F7 que não é um uuid não pode derrubar a chamada.
  -- No parcelamento do anual, todas as parcelas têm a referência: só a primeira é a da fatura.
  if f.id is null and v_ref ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
     and coalesce(nullif(p_pagamento ->> 'installmentNumber', '')::integer, 1) = 1 then
    select * into f from public.faturas where id::text = lower(v_ref) and asaas_id is null for update;
    if f.id is not null then
      update public.faturas set asaas_id = p_pagamento ->> 'id', ambiente = p_ambiente,
             asaas_parcelamento = nullif(p_pagamento ->> 'installment', '')
       where id = f.id;
    end if;
  end if;

  -- Parcela 2 em diante de um parcelamento no cartão: a fatura guarda só a primeira. Contestação, estorno e exclusão
  -- de uma parcela vão para a plataforma conferir no Asaas; os outros eventos não mudam a fatura.
  if f.id is null and nullif(p_pagamento ->> 'installment', '') is not null then
    select * into f from public.faturas where asaas_parcelamento = p_pagamento ->> 'installment' and ambiente = p_ambiente;
    if f.id is not null then
      if p_evento in ('PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_REFUNDED', 'PAYMENT_DELETED') then
        perform public.cobranca_avisar_plataforma(f.org_id,
          'parcela ' || coalesce(p_pagamento ->> 'installmentNumber', '?') || ' da fatura de ' || to_char(f.competencia, 'MM/YYYY')
          || case p_evento when 'PAYMENT_CHARGEBACK_REQUESTED' then ' contestada no cartão'
                           when 'PAYMENT_REFUNDED' then ' estornada' else ' apagada' end
          || ' no Asaas. Confira no painel do Asaas.');
      end if;
      v_res := 'parcela ' || coalesce(p_pagamento ->> 'installmentNumber', '?') || ': ' || p_evento;
      update public.asaas_eventos set fatura_id = f.id, resultado = v_res where id = v_id;
      return v_res;
    end if;
  end if;

  if f.id is null then
    v_res := 'desconhecido';
  elsif p_evento in ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED') then
    -- Cartão: CONFIRMED na hora e RECEIVED dias depois; Pix e boleto: RECEIVED. Vale o primeiro.
    -- 'a_cancelar': o cliente pagou antes de a cobrança ser apagada (o Asaas não apaga cobrança paga).
    -- 'enviando', 'a_enviar' e 'erro': pago antes de a Livih gravar o link (achado pela referência).
    if f.status in ('aberta', 'vencida', 'a_cancelar', 'enviando', 'a_enviar', 'erro') then
      update public.faturas set status = 'paga', paga_em = now(), erro = null, atualizado_em = now() where id = f.id;
      v_res := 'paga';
    elsif f.status <> 'paga' then
      -- Cancelada ou estornada e paga mesmo assim: o dinheiro entrou; a plataforma decide (devolver ou abater).
      perform public.cobranca_avisar_plataforma(f.org_id,
        'pagou a fatura de ' || to_char(f.competencia, 'MM/YYYY') || ', que estava ' || f.status
        || ' na Livih. Confira no painel do Asaas.');
      v_res := 'pagamento de fatura ' || f.status;
    end if;
  elsif p_evento = 'PAYMENT_OVERDUE' then
    if f.status = 'aberta' then
      update public.faturas set status = 'vencida', atualizado_em = now() where id = f.id;
      v_res := 'vencida';
    end if;
  elsif p_evento = 'PAYMENT_REFUNDED' then
    if f.status = 'paga' then
      update public.faturas set status = 'estornada', atualizado_em = now() where id = f.id;
      perform public.cobranca_avisar_plataforma(f.org_id,
        'fatura de ' || to_char(f.competencia, 'MM/YYYY') || ' estornada no Asaas (não é mais cobrada).');
      v_res := 'estornada';
    end if;
  elsif p_evento = 'PAYMENT_RECEIVED_IN_CASH_UNDONE' then
    -- Recebimento em dinheiro marcado por engano no painel do Asaas e desfeito: volta a dever, e o atraso conta de novo.
    if f.status = 'paga' then
      update public.faturas
         set status = case when f.vencimento < v_hoje then 'vencida' else 'aberta' end, paga_em = null,
             aviso_atraso_em = null, suspensao_em = null, atualizado_em = now()
       where id = f.id;
      perform public.cobranca_avisar_plataforma(f.org_id,
        'pagamento da fatura de ' || to_char(f.competencia, 'MM/YYYY') || ' desfeito no Asaas: voltou a dever.');
      v_res := 'pagamento desfeito';
    end if;
  elsif p_evento = 'PAYMENT_DELETED' then
    if f.status in ('aberta', 'vencida', 'a_cancelar') then
      update public.faturas set status = 'cancelada', atualizado_em = now() where id = f.id;
      v_res := 'cancelada';
    end if;
  elsif p_evento = 'PAYMENT_RESTORED' then
    if f.status = 'cancelada' then
      begin
        update public.faturas
           set status = case when f.vencimento < v_hoje then 'vencida' else 'aberta' end,
               aviso_atraso_em = null, suspensao_em = null, atualizado_em = now()
         where id = f.id;
        v_res := 'restaurada';
      exception when unique_violation then
        perform public.cobranca_avisar_plataforma(f.org_id,
          'cobrança da fatura de ' || to_char(f.competencia, 'MM/YYYY')
          || ' restaurada no Asaas, mas o mês já tem outra fatura na Livih. Apague uma das duas no Asaas.');
        v_res := 'não restaurada: o mês já tem outra fatura';
      end;
    end if;
  elsif p_evento = 'PAYMENT_UPDATED' then
    -- Vencimento mudado no painel do Asaas (prazo combinado com o cliente): conta o atraso de novo a partir dele.
    if f.status in ('aberta', 'vencida') and v_venc is not null and v_venc <> f.vencimento then
      update public.faturas
         set vencimento = v_venc, status = case when v_venc < v_hoje then 'vencida' else 'aberta' end,
             aviso_atraso_em = null, suspensao_em = null, atualizado_em = now()
       where id = f.id;
      perform public.cobranca_reativar(f.org_id);
      v_res := 'vencimento ' || to_char(v_venc, 'DD/MM/YYYY');
    end if;
  elsif p_evento = 'PAYMENT_CHARGEBACK_REQUESTED' then
    perform public.cobranca_avisar_plataforma(f.org_id,
      'contestou no cartão a fatura de ' || to_char(f.competencia, 'MM/YYYY') || '. Veja no painel do Asaas.');
    v_res := 'contestação avisada';
  end if;

  v_res := coalesce(v_res, 'sem mudança');
  update public.asaas_eventos set fatura_id = f.id, resultado = v_res where id = v_id;
  return v_res;
end $$;
