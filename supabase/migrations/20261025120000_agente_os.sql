-- Ordens de serviço, fase 2 (docs/ordens-de-servico.md): o agente consulta a OS do cliente pelo WhatsApp.
--
-- "Meu motor ficou pronto?": agente_consultar_os devolve os itens do cliente da conversa (as OS do cliente do contato,
-- docs/clientes.md, e as do próprio contato), com a etapa, desde quando e a previsão de término. Só leitura: o
-- agente não move etapa nem aprova orçamento; quando o cliente aprova por escrito, ele anota e chama a equipe.
--
-- A previsão (os_previsao_itens) conferia se quem chama é da oficina; o agente usa a chave de serviço. O cálculo vai
-- para os_previsao_itens_base (sem conferência, só para o banco e o agente) e a função da tela continua conferindo.

create function public.os_previsao_itens_base(p_org uuid)
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

revoke execute on function public.os_previsao_itens_base(uuid) from public, anon, authenticated;

create or replace function public.os_previsao_itens(p_org uuid)
returns table (item_id uuid, finaliza_em date, fatura_em date, recebe_em date, em_orcamento boolean, parado boolean,
               dias_na_etapa integer, normal_etapa numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.os_membro(p_org) then
    raise exception 'ordens de serviço não está ligado nesta empresa';
  end if;
  return query select * from public.os_previsao_itens_base(p_org);
end $$;

-- Itens do cliente da conversa: abertos (sem desfecho e antes da entrega) e os encerrados nos últimos 30 dias (para
-- responder "já foi entregue?"). p_busca filtra por OS, NF, nº do cliente, tipo, modelo ou identificação.
create function public.agente_consultar_os(p_conversa uuid, p_busca text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_cliente uuid;
  v_palavras text[];
  v_itens jsonb;
  v_total integer;
begin
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    raise exception 'conversa não encontrada';
  end if;
  if not public.modulo_ativo(v_conv.org_id, 'os') then
    return jsonb_build_object('encontrados', 0,
      'aviso', 'Esta empresa não acompanha ordens de serviço pelo Livih: diga que a equipe confere e chame chamar_humano.');
  end if;
  select cliente_id into v_cliente from public.contatos where id = v_conv.contato_id;
  select coalesce(array_agg(w), '{}') into v_palavras
    from regexp_split_to_table(public.sem_acento(btrim(coalesce(p_busca, ''))), '[^a-z0-9/.-]+') w
   where length(w) >= 2 and w not in ('os', 'meu', 'minha', 'meus', 'minhas', 'do', 'da', 'de', 'que');

  with prev as (select * from public.os_previsao_itens_base(v_conv.org_id)),
  itens as (
    select i.id, o.numero, o.nf_cliente, o.numero_cliente, o.recebida_em, t.nome as tipo, i.modelo, i.identificacao,
           e.nome as etapa, e.marco, i.etapa_desde, i.desfecho, i.desfecho_em, i.valor, i.cobranca,
           p.finaliza_em, p.em_orcamento,
           public.sem_acento(concat_ws(' ', o.numero, o.nf_cliente, o.numero_cliente, t.nome, i.modelo, i.identificacao)) as texto
      from public.os_itens i
      join public.ordens_servico o on o.id = i.os_id
      join public.os_etapas e on e.id = i.etapa_id
      left join public.os_tipos_item t on t.id = i.tipo_id
      left join prev p on p.item_id = i.id
     where o.org_id = v_conv.org_id
       and (o.contato_id = v_conv.contato_id or (v_cliente is not null and o.cliente_id = v_cliente))
       and ((i.desfecho is null and e.marco is distinct from 'entregue')
            or coalesce(i.desfecho_em, case when e.marco = 'entregue' then i.etapa_desde end) >= current_date - 30)
  ),
  filtrados as (
    select * from itens it
     where cardinality(v_palavras) = 0
        or (select bool_or(it.texto like '%' || w || '%') from unnest(v_palavras) w)
  )
  select (select count(*) from filtrados)::integer,
         jsonb_agg(jsonb_build_object(
           'os', f.numero, 'nf_do_cliente', f.nf_cliente, 'os_do_cliente', f.numero_cliente,
           'recebido_em', to_char(f.recebida_em, 'DD/MM/YYYY'),
           'item', concat_ws(' ', f.tipo, f.modelo), 'identificacao', f.identificacao,
           'situacao', case f.desfecho
                         when 'nao_aprovado' then 'orçamento não aprovado'
                         when 'sem_conserto' then 'sem conserto'
                         when 'cancelado' then 'cancelado'
                         else f.etapa end,
           'desde', to_char(coalesce(f.desfecho_em, f.etapa_desde), 'DD/MM/YYYY'),
           'pronto', f.marco in ('finalizado', 'entregue') and f.desfecho is null,
           'entregue', f.marco = 'entregue' and f.desfecho is null,
           'aguardando_aprovacao', coalesce(f.em_orcamento, false) and f.desfecho is null,
           'valor_orcamento', case when f.cobranca = 'cobrado' and f.valor > 0 then public.reais(f.valor) end,
           'cobranca', nullif(f.cobranca, 'cobrado'),
           'previsao_de_termino', case when f.desfecho is null and f.marco is distinct from 'finalizado'
                                         and f.marco is distinct from 'entregue' and f.finaliza_em is not null
                                       then to_char(f.finaliza_em, 'DD/MM/YYYY') end)
           order by f.recebida_em desc, f.numero desc)
    into v_total, v_itens
    from (select * from filtrados order by recebida_em desc, numero desc limit 20) f;

  return jsonb_build_object(
    'encontrados', coalesce(v_total, 0),
    'itens', coalesce(v_itens, '[]'::jsonb),
    'aviso', case
      when coalesce(v_total, 0) = 0 and cardinality(v_palavras) > 0
        then 'Nada com esse termo para este cliente. Pergunte o nº da OS, a NF ou o modelo; se não achar, chame a equipe.'
      when coalesce(v_total, 0) = 0
        then 'Nenhuma ordem de serviço aberta para este cliente. Pergunte o nº da OS ou a NF; se ele insistir, chame a equipe.'
      when v_total > 20 then 'Mais de 20 itens: estes são os 20 mais recentes. Peça o nº da OS ou o modelo para achar o certo.'
      else 'A previsão de término é estimativa: diga "a previsão é…", nunca prometa a data.'
    end);
end $$;

-- Simulador (Configurações → Agente → Testar): não há contato; mostra as OS mais recentes da empresa como exemplo.
create function public.simulador_consultar_os(p_org uuid, p_busca text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.modulo_ativo(p_org, 'os') then
    return jsonb_build_object('encontrados', 0,
      'aviso', 'Esta empresa não acompanha ordens de serviço pelo Livih: diga que a equipe confere e chame chamar_humano.');
  end if;
  return jsonb_build_object('simulado', true,
    'aviso', 'Simulador: na conversa de verdade aparecem só as OS do cliente que está falando.',
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object('os', o.numero, 'item', concat_ws(' ', t.nome, i.modelo), 'situacao', e.nome,
                                          'desde', to_char(i.etapa_desde, 'DD/MM/YYYY')) order by o.recebida_em desc)
        from (select * from public.ordens_servico where org_id = p_org order by recebida_em desc limit 3) o
        join public.os_itens i on i.os_id = o.id and i.desfecho is null
        join public.os_etapas e on e.id = i.etapa_id
        left join public.os_tipos_item t on t.id = i.tipo_id), '[]'::jsonb));
end $$;

revoke execute on function public.agente_consultar_os(uuid, text), public.simulador_consultar_os(uuid, text)
from public, anon, authenticated;
grant execute on function public.agente_consultar_os(uuid, text), public.simulador_consultar_os(uuid, text),
  public.os_previsao_itens_base(uuid)
to service_role;
