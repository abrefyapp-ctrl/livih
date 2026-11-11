-- Prospecção ativa no Painel (docs/equipes-origem-prospeccao.md, entrega 5, pedido da CEFEQ em 10/11).
--
-- A CEFEQ quer saber quantos contatos cada vendedor faz por dia por iniciativa própria (ativo), não só quantos
-- atende (receptivo). Os dados já existem: a mensagem que o vendedor manda pelo celular é gravada
-- (registrar_saida_celular) e a da tela também.
--
-- Contato ativo = mensagem nossa, escrita por uma pessoa (não pelo agente, não automática, não de campanha), para um
-- contato que não trocou nenhuma mensagem com a empresa nos 30 dias anteriores. Rajadas contam uma vez: a segunda
-- mensagem já tem a primeira nos 30 dias. Quem é o vendedor: o autor da mensagem (enviada pela tela) ou o
-- responsável pelo número (enviada pelo celular, sem autor).
--   - Respondeu: o contato escreveu em até 7 dias.
--   - Virou oportunidade: oportunidade do contato criada em até 30 dias.
-- Campanha conta à parte (enviadas e respondidas), porque é envio em massa pelo número oficial.
--
-- Nos primeiros 30 dias de um número na Livih, a empresa não tem o histórico de antes: mensagem do vendedor para
-- um cliente com quem ele já falava pelo celular conta como ativa. Para a medição da CEFEQ isso é aceitável (o
-- vendedor puxou a conversa do mesmo jeito); o texto da tela avisa.
--
-- Mensagem pelo celular não tem autor: vale o responsável pelo número hoje. Se o número passar para outro vendedor,
-- o histórico do anterior vai junto (limitação registrada no doc; resolver gravando o responsável na mensagem).
-- "Respondeu" conta qualquer resposta, inclusive a saudação automática do WhatsApp Business do cliente.
--
-- Função separada do painel_resumo (que já é grande), com os mesmos filtros: número, vendedor e equipe, limitados
-- pelo painel_membros (dono/admin a empresa, gestor a equipe, atendente só ele). O painel_membros passa a deixar de
-- fora da equipe do gestor o dono e o admin que estejam nela, como o gestor_ve (revisão de 10/11): vale também para
-- o resto do Painel.

-- Igual a 20261110210000, mas a equipe do gestor só traz os atendentes (e ele mesmo): dono e admin numa equipe não
-- ficam sob o gestor, como no gestor_ve.
create or replace function public.painel_membros(p_org uuid, p_vendedor uuid, p_equipe uuid) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
declare
  v_minha uuid;
begin
  if not public.eh_membro(p_org) then
    raise exception 'sem acesso';
  end if;
  if public.tem_papel(p_org, '{dono,admin}') then
    if p_vendedor is not null then
      return array[p_vendedor];
    end if;
    if p_equipe is not null then
      return coalesce((select array_agg(user_id) from public.membros_org where org_id = p_org and equipe_id = p_equipe), '{}');
    end if;
    return null;
  end if;
  v_minha := public.equipe_que_gerencio(p_org);
  if v_minha is not null then
    if p_vendedor is not null and (p_vendedor = auth.uid() or public.gestor_ve(p_org, p_vendedor)) then
      return array[p_vendedor];
    end if;
    return coalesce((select array_agg(user_id) from public.membros_org
                      where org_id = p_org and equipe_id = v_minha and (papel = 'atendente' or user_id = auth.uid())),
                    array[auth.uid()]);
  end if;
  return array[auth.uid()];
end $$;
revoke execute on function public.painel_membros(uuid, uuid, uuid) from public, anon, authenticated;

create function public.painel_prospeccao_periodo(p_org uuid, p_de timestamptz, p_ate timestamptz, p_canal uuid,
                                                 p_membros uuid[], p_detalhe boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_res jsonb;
begin
  -- Os limites absolutos (p_de - 30 dias, p_ate + 7 dias) e o y.org_id deixam o índice (org_id, criado_em) servir e o
  -- custo proporcional ao período, não ao histórico da empresa (revisão de 11/11).
  with saida as (
    select distinct on (cv.contato_id, m.criado_em)
           m.criado_em, cv.contato_id, coalesce(m.autor_id, cn.responsavel_id) as vendedor
      from public.mensagens m
      join public.conversas cv on cv.id = m.conversa_id
      join public.canais cn on cn.id = cv.canal_id
     where m.org_id = p_org and m.direcao = 'saida' and m.autor_tipo = 'atendente' and not m.automatica
       and m.status_entrega <> 'erro'                  -- a que não saiu (sem WhatsApp, recusada pela Meta) não conta
       and m.modelo ->> 'campanha_id' is null          -- campanha (campanhas_liberar grava o id no modelo) conta à parte
       and m.criado_em >= p_de and m.criado_em < p_ate
       and (p_canal is null or cv.canal_id = p_canal)
       and (p_membros is null or coalesce(m.autor_id, cn.responsavel_id) = any(p_membros))
     order by cv.contato_id, m.criado_em, m.id
  ),
  ativos as (
    select s.*,
           exists (select 1 from public.mensagens y join public.conversas c2 on c2.id = y.conversa_id
                    where y.org_id = p_org and c2.contato_id = s.contato_id and y.direcao = 'entrada'
                      and y.criado_em > s.criado_em and y.criado_em < s.criado_em + interval '7 days'
                      and y.criado_em < p_ate + interval '7 days') as respondeu,
           -- Folga de 1 hora: o vendedor que abre o negócio no funil e manda a mensagem logo depois também conta.
           exists (select 1 from public.oportunidades o
                    where o.org_id = p_org and o.contato_id = s.contato_id
                      and o.criado_em >= s.criado_em - interval '1 hour'
                      and o.criado_em < s.criado_em + interval '30 days') as oportunidade
      from saida s
     where not exists (select 1 from public.mensagens y join public.conversas c2 on c2.id = y.conversa_id
                        where y.org_id = p_org and c2.contato_id = s.contato_id and y.autor_tipo <> 'sistema'
                          and y.criado_em >= p_de - interval '30 days'
                          and y.criado_em < s.criado_em and y.criado_em >= s.criado_em - interval '30 days')
  )
  select jsonb_build_object(
    'total', (select count(*) from ativos),
    'hoje', (select count(*) from ativos where criado_em >= v_hoje),
    'responderam', (select count(*) from ativos where respondeu),
    'oportunidades', (select count(*) from ativos where oportunidade),
    -- Mandadas do número da empresa pelo celular (sem autor e sem responsável pelo número).
    'sem_vendedor', case when p_membros is null then (select count(*) from ativos where vendedor is null) end,
    'campanha', case when p_detalhe and p_membros is null then (
      select jsonb_build_object('enviadas', count(*), 'responderam', count(cd.respondido_em))
        from public.campanha_destinatarios cd join public.campanhas ca on ca.id = cd.campanha_id
       where cd.org_id = p_org and cd.status = 'enviado' and cd.enviado_em >= p_de and cd.enviado_em < p_ate
         and (p_canal is null or ca.canal_id = p_canal)) end,
    -- Os vendedores do filtro que têm número (no filtro de número, só o dono dele) ou fizeram contato ativo, inclusive
    -- os que ficaram em zero. Quem saiu da empresa aparece se tiver contato ativo no período, para a soma bater.
    'vendedores', case when p_detalhe and (p_membros is null or cardinality(p_membros) > 1) then (
      select coalesce(jsonb_agg(v order by (v ->> 'total')::int desc, v ->> 'nome'), '[]') from (
        select jsonb_build_object(
                 'user_id', mo.user_id,
                 'nome', coalesce(pf.nome, 'Sem nome'),
                 'total', count(a.vendedor),
                 'hoje', count(a.vendedor) filter (where a.criado_em >= v_hoje),
                 'responderam', count(a.vendedor) filter (where a.respondeu),
                 'oportunidades', count(a.vendedor) filter (where a.oportunidade)) v
          from public.membros_org mo
          left join public.perfis pf on pf.user_id = mo.user_id
          left join ativos a on a.vendedor = mo.user_id
         where mo.org_id = p_org and (p_membros is null or mo.user_id = any(p_membros))
           and (a.vendedor is not null
                or (mo.ativo and exists (select 1 from public.canais cn
                                          where cn.org_id = p_org and cn.ativo and cn.responsavel_id = mo.user_id
                                            and (p_canal is null or cn.id = p_canal))))
         group by mo.user_id, pf.nome) x) end
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.painel_prospeccao_periodo(uuid, timestamptz, timestamptz, uuid, uuid[], boolean)
  from public, anon, authenticated;

create function public.painel_prospeccao(p_org uuid, p_de timestamptz, p_ate timestamptz, p_canal uuid default null,
                                         p_vendedor uuid default null, p_equipe uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_membros uuid[] := public.painel_membros(p_org, p_vendedor, p_equipe);
begin
  if p_ate <= p_de or p_ate - p_de > interval '366 days' then
    raise exception 'período inválido';
  end if;
  return jsonb_build_object(
    'atual', public.painel_prospeccao_periodo(p_org, p_de, p_ate, p_canal, v_membros, true),
    'anterior', public.painel_prospeccao_periodo(p_org, p_de - (p_ate - p_de), p_de, p_canal, v_membros, false));
end $$;
revoke execute on function public.painel_prospeccao(uuid, timestamptz, timestamptz, uuid, uuid, uuid) from public, anon;
grant execute on function public.painel_prospeccao(uuid, timestamptz, timestamptz, uuid, uuid, uuid) to authenticated;
