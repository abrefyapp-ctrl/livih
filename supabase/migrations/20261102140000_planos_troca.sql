-- Regras dos planos, entrega 4a (docs/planos-modulos.md, decisões de 02/11; passo 4 das pendências).
--
-- - Preço dos módulos: ERP ou OS a R$ 79,90; os dois juntos no mesmo CNPJ, R$ 109,80 (R$ 79,90 + R$ 29,90). Eram R$ 99
--   e R$ 149. Nenhuma fatura de verdade muda: só a empresa Teste usou o sandbox.
-- - O dono troca o plano sozinho (Configurações → Plano e consumo), com prévia antes de confirmar:
--     subir vale na hora (números do plano novo já no mês; franquia a mais proporcional aos dias que faltam) e a
--     diferença de preço desses dias, contando hoje, vira um ajuste na próxima fatura (cobranca_ajustes); se a fatura do
--     mês ainda não saiu, ela sai com o plano novo inteiro, sem ajuste e com a franquia cheia. Descer vale no dia 1
--     seguinte (organizacoes.plano_proximo e plano_proximo_em, aplicados às 00:05 do dia 1 e de novo no fechamento das
--     06:00), sem devolução.
--   Revisão de 02/11: só o dono de fato troca (no modo suporte, a equipe usa a tela Empresas); a franquia proporcional
--   fecha a brecha de subir no último dia e descer em seguida.
--   Só com a cobrança ligada e sem valor combinado: sem contrato, o plano não é cobrado e subir sairia de graça; com
--   valor combinado (JoGrampo), o preço não segue a tabela. Nesses casos, quem troca é a equipe (tela Empresas).
--   Teste grátis (contrato que começa no mês seguinte): troca sem ajuste.
-- - Limite de números de WhatsApp (canais ativos: "Desconectar" mantém o número; "Remover" libera a vaga): nenhum
--   número novo além do plano, e com uma descida agendada vale o menor dos dois limites, para o dia 1 chegar dentro do
--   plano novo. Plano interno: sem limite. Trocar para um plano com menos números do que a empresa tem é recusado com
--   quantos remover (decisão de 02/11: só desce depois de desconectar).
-- - A troca pela plataforma (tela Empresas) continua imediata e sem ajuste, e desfaz uma descida agendada.

-- ---------- preço dos módulos ----------
update public.modulos set preco_mensal = 79.90 where codigo in ('erp', 'os');

-- ---------- troca agendada e ajustes na fatura ----------
alter table public.organizacoes
  add column plano_proximo text references public.planos (codigo),
  add column plano_proximo_em date check (extract(day from plano_proximo_em) = 1);
comment on column public.organizacoes.plano_proximo is
  'Plano que passa a valer em plano_proximo_em (descida escolhida pelo dono). Nulo: sem troca agendada.';
comment on column public.organizacoes.plano_proximo_em is
  'Dia 1 do mês em que plano_proximo passa a valer (pedida no próprio dia 1, vale no mês seguinte).';

create table public.cobranca_ajustes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizacoes (id) on delete cascade,
  mes        date not null check (extract(day from mes) = 1),
  descricao  text not null check (length(descricao) between 1 and 200),
  valor      numeric(10, 2) not null check (valor > 0),
  criado_em  timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null
);
comment on table public.cobranca_ajustes is
  'Valores a cobrar na fatura do mês seguinte a `mes` (ex.: diferença proporcional ao subir de plano no meio do mês).';
create index cobranca_ajustes_org_mes_idx on public.cobranca_ajustes (org_id, mes);
alter table public.cobranca_ajustes enable row level security;
create policy cobranca_ajustes_ver on public.cobranca_ajustes for select to authenticated
  using (public.cobranca_pode(org_id, '{dono,admin}'));
revoke all on public.cobranca_ajustes from anon, authenticated;
grant select on public.cobranca_ajustes to authenticated;

-- Itens da fatura (da migration 20261101150000): ERP e OS juntos a R$ 109,80 e os ajustes do mês anterior.
create or replace function public.cobranca_itens(p_org uuid, p_competencia date)
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
    -- ERP e OS juntos no mesmo CNPJ: R$ 79,90 + R$ 29,90 (decisão de 02/11); os demais módulos com preço somam à parte.
    if v_juntos then
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'descricao', 'Módulos Pedidos e estoque (ERP) e Ordens de serviço', 'quantidade', 1, 'valor', 109.80));
    end if;
    v_itens := v_itens || coalesce((
      select jsonb_agg(jsonb_build_object('descricao', 'Módulo ' || m.nome, 'quantidade', 1, 'valor', m.preco_mensal)
                       order by m.ordem)
        from public.modulos m
       where m.preco_mensal is not null and public.modulo_ativo(p_org, m.codigo)
         and not (v_juntos and m.codigo in ('erp', 'os'))), '[]');
  end if;

  -- Atendimentos a mais, pacotes e ajustes do mês anterior.
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

-- ---------- franquia proporcional na subida ----------
-- Subir no meio do mês dá a franquia a mais na proporção dos dias que faltam (decisão de 02/11, depois da revisão: no
-- último dia, Essencial → Business pagava ~R$ 4,84 e ganhava 650 atendimentos na hora). O plano passa a ser o novo, e
-- um crédito negativo do tipo 'troca' tira do mês o que corresponde aos dias que já passaram.
alter table public.creditos_atendimentos drop constraint creditos_atendimentos_tipo_check;
alter table public.creditos_atendimentos drop constraint creditos_atendimentos_quantidade_check;
alter table public.creditos_atendimentos add constraint creditos_atendimentos_tipo_check
  check ((tipo in ('pacote', 'cortesia') and quantidade > 0) or (tipo = 'troca' and quantidade < 0));
comment on table public.creditos_atendimentos is
  'Atendimentos a mais no mês: pacote comprado pelo dono (valor entra na mensalidade seguinte) ou cortesia da plataforma; '
  'troca (negativo): a parte da franquia do plano novo que corresponde aos dias do mês antes da subida.';

-- Plano e consumo (da migration 20261101120000) com a redução da troca à parte, para a tela explicar o limite.
drop function public.plano_consumo(uuid);
create function public.plano_consumo(p_org uuid)
returns table (plano text, plano_nome text, preco_mensal numeric, numeros_whatsapp integer, franquia integer,
               creditos integer, limite integer, usados integer, excedentes integer, escolha text,
               excedente_preco numeric, pacote_atendimentos integer, pacote_preco numeric, pacotes_mes integer,
               valor_pacotes_mes numeric, mes date, reducao_troca integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'Só o dono e os administradores da empresa veem o plano.';
  end if;
  return query
  select f.plano, f.plano_nome, p.preco_mensal, p.numeros_whatsapp, f.franquia, f.creditos, f.limite, f.usados,
         f.excedentes, f.escolha, p.excedente_preco, p.pacote_atendimentos, p.pacote_preco,
         (select count(*)::integer from public.creditos_atendimentos c
           where c.org_id = p_org and c.mes = public.mes_brasilia() and c.tipo = 'pacote'),
         (select coalesce(sum(c.valor), 0) from public.creditos_atendimentos c
           where c.org_id = p_org and c.mes = public.mes_brasilia() and c.tipo = 'pacote'),
         public.mes_brasilia(),
         (select coalesce(-sum(c.quantidade), 0)::integer from public.creditos_atendimentos c
           where c.org_id = p_org and c.mes = public.mes_brasilia() and c.tipo = 'troca')
    from public.franquia_do_mes(p_org) f
    join public.planos p on p.codigo = f.plano;
end $$;
revoke execute on function public.plano_consumo(uuid) from public, anon;
grant execute on function public.plano_consumo(uuid) to authenticated;

-- ---------- troca pelo dono ----------
-- Dono de fato (membro com o papel dono, empresa ativa). A equipe da plataforma não passa: no modo suporte ela troca pela
-- tela Empresas (imediata e sem ajuste), não pela tela do cliente.
create function public.eh_dono_de_fato(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros_org m join public.organizacoes o on o.id = m.org_id
                  where m.org_id = p_org and m.user_id = auth.uid() and m.ativo and m.papel = 'dono' and o.status = 'ativa');
$$;
revoke execute on function public.eh_dono_de_fato(uuid) from public, anon;
grant execute on function public.eh_dono_de_fato(uuid) to authenticated;

-- O que a tela precisa para oferecer a troca: os planos, a troca agendada e, se não puder trocar, o porquê.
create function public.plano_troca_situacao(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.organizacoes;
  c public.contratos_cobranca;
  v_motivo text;
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
  return jsonb_build_object(
    'pode_trocar', v_motivo is null,
    'motivo', v_motivo,
    'eh_dono', public.eh_dono_de_fato(p_org),
    'plano', o.plano,
    'plano_proximo', o.plano_proximo,
    'vale_em', coalesce(o.plano_proximo_em, (public.mes_brasilia() + interval '1 month')::date),
    'numeros_ativos', (select count(*) from public.canais where org_id = p_org and ativo),
    'planos', (select jsonb_agg(jsonb_build_object('codigo', p.codigo, 'nome', p.nome, 'preco_mensal', p.preco_mensal,
                                                   'numeros_whatsapp', p.numeros_whatsapp, 'atendimentos', p.atendimentos)
                                order by p.ordem)
                 from public.planos p where p.codigo <> 'interno'));
end $$;
revoke execute on function public.plano_troca_situacao(uuid) from public, anon;
grant execute on function public.plano_troca_situacao(uuid) to authenticated;

-- Troca de plano pelo dono. Sem p_confirmar, só devolve a prévia (o que acontece e quanto custa); com, faz a troca.
-- tipo: 'subir' (vale agora), 'descer' (agenda para o dia 1), 'cancelar' (volta ao plano atual e desfaz a descida
-- agendada) ou 'igual'.
-- Subir: se a fatura deste mês já saiu (com o plano antigo), a diferença dos dias que faltam vira ajuste na próxima
-- fatura e a franquia a mais vem na mesma proporção. Se ela ainda vai sair (dia 1 antes das 06:00, contrato que começou
-- agora), sai com o plano novo inteiro: sem ajuste e com a franquia cheia. No teste grátis, sem ajuste e com a
-- franquia proporcional (nada foi pago, e a brecha de subir e descer continuaria aberta).
create function public.plano_trocar(p_org uuid, p_plano text, p_confirmar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.organizacoes;
  atual public.planos;
  novo public.planos;
  c public.contratos_cobranca;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := public.mes_brasilia();
  v_prox date := (public.mes_brasilia() + interval '1 month')::date;
  v_dias integer;
  v_dias_mes integer;
  v_valor numeric := 0;
  v_cheio boolean;
  v_extra integer;
  v_reducao integer := 0;
  v_limite integer;
  v_qtd integer;
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
  select * into c from public.contratos_cobranca where org_id = p_org;
  if c.org_id is null or not c.ativo then
    raise exception 'Para escolher ou trocar o plano, fale com a equipe da Livih.';
  end if;
  if c.valor_fixo is not null then
    raise exception 'O plano da sua empresa tem um valor combinado. Para trocar, fale com a equipe da Livih.';
  end if;
  select * into atual from public.planos where codigo = o.plano;

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
      v_qtd, case when v_qtd - novo.numeros_whatsapp = 1 then '1 número' else (v_qtd - novo.numeros_whatsapp) || ' números' end;
  end if;

  if coalesce(novo.preco_mensal, 0) > coalesce(atual.preco_mensal, 0) then
    v_dias_mes := v_prox - v_mes;
    v_dias := v_prox - v_hoje;
    v_cheio := c.inicio <= v_mes
      and not exists (select 1 from public.faturas where org_id = p_org and competencia = v_mes and status <> 'cancelada');
    if not v_cheio then
      if c.inicio <= v_mes then
        v_valor := round((novo.preco_mensal - coalesce(atual.preco_mensal, 0)) * v_dias / v_dias_mes, 2);
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
      if v_valor >= 0.01 then
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
              jsonb_build_object('plano', novo.codigo, 'ajuste', v_valor, 'reducao_franquia', v_reducao));
      -- O consumo do mês conta desde o dia 1: com o limite novo, o aviso de 80 % ou 100 % pode valer na hora. O aviso
      -- não pode desfazer a troca.
      begin
        perform public.avisar_franquia(p_org);
      exception when others then
        raise warning 'livih: aviso de franquia na troca de plano falhou (%): %', p_org, sqlerrm;
      end;
      perform public.cobranca_avisar_plataforma(p_org, 'subiu para o plano ' || novo.nome
        || case when v_valor >= 0.01 then ' (ajuste de ' || public.reais(v_valor) || ' na próxima fatura)' else '' end);
    end if;
    return jsonb_build_object('tipo', 'subir', 'plano', novo.nome, 'valor', v_valor, 'dias', v_dias,
                              'dias_mes', v_dias_mes, 'teste_gratis', c.inicio > v_mes,
                              'limite_mes', case when v_limite is null then null
                                                 else v_limite + (novo.atendimentos - coalesce(atual.atendimentos, 0)) - v_reducao end);
  end if;

  -- O mesmo plano já agendado: nada a fazer (sem outra auditoria nem outro aviso).
  if novo.codigo = o.plano_proximo then
    return jsonb_build_object('tipo', 'descer', 'plano', novo.nome, 'vale_em', o.plano_proximo_em);
  end if;
  if p_confirmar then
    update public.organizacoes set plano_proximo = novo.codigo, plano_proximo_em = v_prox where id = p_org;
    insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'atendente', auth.uid(), 'agendar_troca_plano', 'organizacoes', p_org::text,
            jsonb_build_object('plano', o.plano, 'plano_proximo', o.plano_proximo),
            jsonb_build_object('plano_proximo', novo.codigo, 'vale_em', v_prox));
    perform public.cobranca_avisar_plataforma(p_org, 'vai para o plano ' || novo.nome || ' em ' || to_char(v_prox, 'DD/MM'));
  end if;
  return jsonb_build_object('tipo', 'descer', 'plano', novo.nome, 'vale_em', v_prox);
end $$;
revoke execute on function public.plano_trocar(uuid, text, boolean) from public, anon;
grant execute on function public.plano_trocar(uuid, text, boolean) to authenticated;

-- Descidas agendadas passam a valer no mês marcado (cron às 00:05 do dia 1 e de novo no fechamento das 06:00). Pedida
-- no próprio dia 1, a descida é para o mês seguinte: plano_proximo_em impede que valha no mesmo dia.
create function public.planos_aplicar_agendados() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_total integer := 0;
begin
  for r in
    select id, plano, plano_proximo from public.organizacoes
     where plano_proximo is not null and plano_proximo_em <= public.mes_brasilia()
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
revoke execute on function public.planos_aplicar_agendados() from public, anon, authenticated;

-- 03:05 UTC = 00:05 em Brasília: o mês novo já começa no plano novo (franquia e fatura).
select cron.schedule('livih-planos-agendados', '5 3 1 * *', 'select public.planos_aplicar_agendados()');

-- Fechamento do mês (da migration 20261101150000): aplica antes as descidas agendadas, se o cron das 00:05 falhou. Um
-- erro ali não pode parar as faturas de todas as empresas.
create or replace function public.cobranca_fechar_mes() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_comp date := public.mes_brasilia();
  v_total integer := 0;
  c record;
begin
  begin
    perform public.planos_aplicar_agendados();
  exception when others then
    raise warning 'livih: descidas de plano agendadas não aplicadas no fechamento: %', sqlerrm;
  end;
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

-- Troca pela plataforma (da migration 20261101120000): imediata e sem ajuste, e desfaz a descida agendada.
create or replace function public.plataforma_definir_plano(p_org uuid, p_plano text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes text;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'só a equipe da plataforma';
  end if;
  if not exists (select 1 from public.planos where codigo = p_plano) then
    raise exception 'plano inexistente';
  end if;
  select plano into v_antes from public.organizacoes where id = p_org for update;
  if not found then
    raise exception 'empresa inexistente';
  end if;
  update public.organizacoes set plano_proximo = null, plano_proximo_em = null where id = p_org and plano_proximo is not null;
  if v_antes is distinct from p_plano then
    update public.organizacoes set plano = p_plano where id = p_org;
    insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'atendente', auth.uid(), 'definir_plano', 'organizacoes', p_org::text,
            jsonb_build_object('plano', v_antes), jsonb_build_object('plano', p_plano));
    -- O consumo do mês conta desde o dia 1, mesmo no plano anterior: com a troca, o dono já recebe os avisos.
    perform public.avisar_franquia(p_org);
  end if;
end $$;

-- ---------- limite de números de WhatsApp ----------
-- Mensagem quando a empresa não tem vaga para outro número; nula quando tem. Com descida agendada, vale o menor
-- limite. As mensagens começam com "O plano ": a whatsapp-conexao mostra o texto do banco só nesse caso. Sem
-- conferência de papel: usada pelo gatilho e pela whatsapp-conexao (chave de serviço), antes de passos que não se
-- desfazem (registro do número na Meta, troca do código do Embedded Signup).
create function public.canais_sem_vaga(p_org uuid, p_ignorar uuid default null) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limite integer;
  v_plano text;
  v_eh_proximo boolean;
  v_em date;
  v_qtd integer;
begin
  select l.numeros, l.nome, l.proximo, o.plano_proximo_em into v_limite, v_plano, v_eh_proximo, v_em
    from public.organizacoes o
    join public.planos pa on pa.codigo = o.plano
    left join public.planos pp on pp.codigo = o.plano_proximo
    cross join lateral (
      select x.numeros, x.nome, x.proximo
        from (values (pa.numeros_whatsapp, pa.nome, false), (pp.numeros_whatsapp, pp.nome, true)) x(numeros, nome, proximo)
       where x.numeros is not null order by x.numeros, x.proximo limit 1
    ) l
   where o.id = p_org;
  if v_limite is null then
    return null;
  end if;
  select count(*) into v_qtd from public.canais where org_id = p_org and ativo and id is distinct from p_ignorar;
  if v_qtd < v_limite then
    return null;
  end if;
  if v_eh_proximo then
    return format('O plano %s, que começa em %s, permite %s de WhatsApp, e a empresa já tem %s. Para conectar outro, '
      || 'remova um número que não usa (botão Remover; Desconectar não libera a vaga) ou peça ao dono para manter o '
      || 'plano atual em Configurações → Plano e consumo.',
      v_plano, to_char(v_em, 'DD/MM'), case when v_limite = 1 then '1 número' else v_limite || ' números' end, v_qtd);
  end if;
  return format('O plano %s permite %s de WhatsApp, e a empresa já tem %s. Para conectar outro, remova um número que não '
    || 'usa (botão Remover; Desconectar não libera a vaga) ou peça ao dono para subir de plano em Configurações → Plano '
    || 'e consumo.', v_plano, case when v_limite = 1 then '1 número' else v_limite || ' números' end, v_qtd);
end $$;
revoke execute on function public.canais_sem_vaga(uuid, uuid) from public, anon, authenticated;
grant execute on function public.canais_sem_vaga(uuid, uuid) to service_role;

-- Última barreira: vale para quem conecta pela tela e para a equipe da plataforma.
create function public.canais_limite_plano() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_msg text;
begin
  if not new.ativo or (tg_op = 'UPDATE' and old.ativo) then
    return new;
  end if;
  -- Dois números conectados ao mesmo tempo (ou uma descida e uma conexão) não passam juntos do limite.
  perform pg_advisory_xact_lock(hashtextextended('livih-canais:' || new.org_id::text, 0));
  v_msg := public.canais_sem_vaga(new.org_id, new.id);
  if v_msg is not null then
    raise exception '%', v_msg;
  end if;
  return new;
end $$;
revoke execute on function public.canais_limite_plano() from public, anon, authenticated;

create trigger canais_limite_plano before insert or update of ativo on public.canais
for each row execute function public.canais_limite_plano();

-- ---------- nota fiscal só com ERP ou OS ----------
-- A nota faz parte do ERP (NF-e) e das OS (NFS-e) (decisão de 28/10, passo 3 de planos-modulos.md): configurar e emitir
-- exigem um dos dois ligado (nfe-config, nfe-emitir e nfse-emitir conferem). Separada de emite_nota_fiscal de
-- propósito: aquela também decide quem vê as notas avulsas, e as notas já emitidas continuam visíveis sem os módulos.
create function public.nota_fiscal_liberada(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.modulo_ativo(p_org, 'erp') or public.modulo_ativo(p_org, 'os');
$$;
revoke execute on function public.nota_fiscal_liberada(uuid) from public, anon;
grant execute on function public.nota_fiscal_liberada(uuid) to authenticated, service_role;
