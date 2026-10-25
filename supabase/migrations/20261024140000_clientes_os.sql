-- Clientes, entrega 3 (docs/clientes.md): a ordem de serviço pelo cliente.
--
-- 1. Prazo de pagamento por CLIENTE (a empresa que paga), não mais por contato. os_prazos_cliente estava vazia
--    quando esta migration foi escrita (24/10): recriada com cliente_id; a guarda abaixo recusa se houver dados.
-- 2. os_prazo_cliente passa a receber o cliente; os_faturar e os_previsao_itens usam o cliente da OS. Iguais aos de
--    20261022130000, só com essa troca.
-- 3. os_importar liga cada linha a um cliente: o informado, senão pelo CNPJ/CPF, pelo contato, pelo nome (fantasia
--    ou razão social); sem nenhum, cria o cliente. Linhas do mesmo cliente, NF, nº e recebimento viram uma OS.
--    Devolve também quantos clientes foram criados.

do $$
begin
  if exists (select 1 from public.os_prazos_cliente) then
    raise exception 'os_prazos_cliente tem dados: migrar os prazos por contato para o cliente antes';
  end if;
end $$;

drop table public.os_prazos_cliente;
create table public.os_prazos_cliente (
  org_id uuid not null,
  cliente_id uuid not null,
  prazo_pagamento_dias integer not null check (prazo_pagamento_dias between 0 and 365),
  primary key (org_id, cliente_id),
  foreign key (cliente_id, org_id) references public.clientes (id, org_id) on delete cascade
);
alter table public.os_prazos_cliente enable row level security;
create policy os_prazos_ver on public.os_prazos_cliente for select to authenticated using (public.os_membro(org_id));
create policy os_prazos_gerir on public.os_prazos_cliente for all to authenticated
  using (public.os_gerente(org_id)) with check (public.os_gerente(org_id));
grant select, insert, update, delete on public.os_prazos_cliente to authenticated;

-- Prazo de pagamento de um cliente (o dele, senão o padrão da empresa).
drop function public.os_prazo_cliente(uuid, uuid);
create function public.os_prazo_cliente(p_org uuid, p_cliente uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select prazo_pagamento_dias from public.os_prazos_cliente where org_id = p_org and cliente_id = p_cliente),
    (select prazo_pagamento_dias from public.os_config where org_id = p_org),
    30
  );
$$;
revoke execute on function public.os_prazo_cliente(uuid, uuid) from public, anon, authenticated;

create or replace function public.os_faturar(p_itens uuid[], p_data date, p_vencimento date default null)
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
                              else coalesce(p_vencimento, p_data + public.os_prazo_cliente(v_org, o.cliente_id)) end,
         pago_em = case when p_data is null then null else i.pago_em end
    from public.ordens_servico o
   where o.id = i.os_id and i.id = any (p_itens);
  perform set_config('livih.os_item', 'off', true);
end $$;

create or replace function public.os_previsao_itens(p_org uuid)
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
           o.cliente_id, e.ordem,
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
                   + public.os_prazo_cliente(p_org, c.cliente_id) end,
         (v_aprov_ordem is not null and c.ordem <= v_aprov_ordem and c.faturado_em is null),
         (c.desfecho is null and c.ordem < v_fim_ordem and c.normal_atual > 0 and c.na_etapa > c.normal_atual * v_fator),
         c.na_etapa,
         c.normal_atual
    from calc c;
end $$;

create or replace function public.os_importar(p_org uuid, p_linhas jsonb)
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
  v_cliente uuid;
  v_doc text;
  v_nome text;
  v_criados integer := 0;
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
    -- Cliente da linha: o informado; senão pelo CNPJ/CPF; pelo contato; pelo nome (fantasia ou razão social); senão
    -- cria (documento só se for válido).
    v_cliente := nullif(v_linha ->> 'cliente_id', '')::uuid;
    v_doc := nullif(regexp_replace(coalesce(v_linha ->> 'documento', ''), '\D', '', 'g'), '');
    v_nome := nullif(btrim(coalesce(v_linha ->> 'cliente', '')), '');
    if v_cliente is not null and not exists (select 1 from public.clientes where id = v_cliente and org_id = p_org) then
      raise exception 'cliente inválido na importação';
    end if;
    if v_cliente is null and v_doc is not null then
      select id into v_cliente from public.clientes where org_id = p_org and documento = v_doc;
    end if;
    if v_cliente is null and nullif(v_linha ->> 'contato_id', '') is not null then
      select cliente_id into v_cliente from public.contatos where id = (v_linha ->> 'contato_id')::uuid and org_id = p_org;
    end if;
    if v_cliente is null and v_nome is not null then
      select id into v_cliente from public.clientes
       where org_id = p_org and (lower(nome) = lower(v_nome) or lower(razao_social) = lower(v_nome))
       order by ativo desc, criado_em limit 1;
    end if;
    if v_cliente is null and v_nome is not null then
      insert into public.clientes (org_id, tipo, nome, documento)
      values (p_org, case when length(v_doc) = 11 then 'pf' else 'pj' end, left(v_nome, 200),
              case when (length(v_doc) = 14 and public.cnpj_valido(v_doc)) or (length(v_doc) = 11 and public.cpf_valido(v_doc))
                   then v_doc end)
      returning id into v_cliente;
      v_criados := v_criados + 1;
    end if;
    v_chave := concat_ws('|', coalesce(v_cliente::text, lower(coalesce(v_nome, ''))), v_linha ->> 'contato_id',
                         btrim(coalesce(v_linha ->> 'nf_cliente', '')), btrim(coalesce(v_linha ->> 'numero_cliente', '')),
                         v_linha ->> 'recebida_em');
    v_os := (v_ordens ->> v_chave)::uuid;
    if v_os is null then
      insert into public.ordens_servico (org_id, contato_id, cliente_id, cliente_nome, nf_cliente, numero_cliente, recebida_em)
      values (p_org, nullif(v_linha ->> 'contato_id', '')::uuid, v_cliente, v_nome, nullif(btrim(v_linha ->> 'nf_cliente'), ''),
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
                                              + public.os_prazo_cliente(p_org, v_cliente)) end,
           pago_em = case when nullif(v_linha ->> 'faturado_em', '') is null then null else nullif(v_linha ->> 'pago_em', '')::date end
     where id = v_item;
    perform set_config('livih.os_item', 'off', true);
  end loop;
  perform set_config('livih.os_importando', 'off', true);

  return jsonb_build_object('ordens', (select count(*) from jsonb_object_keys(v_ordens)), 'itens', v_n_itens,
                            'clientes_criados', v_criados);
end $$;
