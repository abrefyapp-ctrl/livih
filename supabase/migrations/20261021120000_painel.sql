-- Painel e Relatório do piloto (plano em docs/painel-relatorio-piloto.md; decisões de 20/10).
--
-- Tudo é calculado aqui, onde os dados estão; a tela recebe só os números. Regras de leitura:
--   - dono/admin (e a plataforma) veem a empresa toda e podem filtrar por número e por vendedor;
--   - atendente vê só a carteira dele: conversas atribuídas a ele ou de números dele, e as oportunidades dele.
-- Definições (iguais às do plano):
--   - pedido = mensagem do cliente que abre um turno (a primeira da conversa ou a primeira depois de uma nossa);
--   - resposta = a primeira mensagem do agente ou da equipe depois dele (sem mensagem automática do celular nem
--     aviso do sistema). "Sem resposta" = pedido sem resposta há mais de 1 hora.

create index if not exists mensagens_org_data_idx on public.mensagens (org_id, criado_em);
create index if not exists oportunidade_historico_org_data_idx on public.oportunidade_historico (org_id, criado_em);

-- Configuração do painel por empresa: valor da estimativa de horas, o "antes" contado no diagnóstico e o início do
-- piloto (se vazio, a conexão do primeiro número).
create table public.painel_config (
  org_id uuid primary key references public.organizacoes (id) on delete cascade,
  minutos_por_resposta numeric(5, 2) not null default 2 check (minutos_por_resposta > 0 and minutos_por_resposta <= 60),
  antes_tempo_resposta_min numeric(8, 2) check (antes_tempo_resposta_min >= 0),
  piloto_inicio date,
  atualizado_em timestamptz not null default now()
);
create trigger painel_config_atualizado_em before update on public.painel_config
for each row execute function public.tocar_atualizado_em();
alter table public.painel_config enable row level security;
create policy painel_config_ver on public.painel_config for select to authenticated using (public.eh_membro(org_id));
create policy painel_config_gerir on public.painel_config for all to authenticated
  using (public.tem_papel(org_id, '{dono,admin}')) with check (public.tem_papel(org_id, '{dono,admin}'));
grant select, insert, update, delete on public.painel_config to authenticated;

-- ============================================================================
-- Um período (uso interno: chamado por painel_resumo e painel_relatorio, que conferem quem pede)
-- ============================================================================
create function public.painel_periodo(p_org uuid, p_de timestamptz, p_ate timestamptz, p_canal uuid, p_vendedor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_res jsonb;
begin
  with conv as (
    select c.id, c.contato_id, c.canal_id, c.criado_em
      from public.conversas c join public.canais cn on cn.id = c.canal_id
     where c.org_id = p_org
       and (p_canal is null or c.canal_id = p_canal)
       and (p_vendedor is null or c.atribuida_a = p_vendedor or cn.responsavel_id = p_vendedor)
  ),
  msg as (
    select m.conversa_id, m.criado_em, m.direcao, m.autor_tipo, m.autor_id,
           lag(m.direcao) over (partition by m.conversa_id order by m.criado_em) as anterior
      from public.mensagens m join conv on conv.id = m.conversa_id
     where m.org_id = p_org and m.autor_tipo <> 'sistema' and not m.automatica
       and m.criado_em >= p_de - interval '7 days' and m.criado_em < p_ate
  ),
  pedido as (
    select msg.conversa_id, msg.criado_em as em,
           r.criado_em as resposta_em, r.autor_tipo as quem, r.autor_id,
           (a.horario is not null and not public.agente_no_horario(a.horario, msg.criado_em)) as fora
      from msg
      join conv on conv.id = msg.conversa_id
      left join public.agentes a on a.canal_id = conv.canal_id
      left join lateral (
        select y.criado_em, y.autor_tipo, y.autor_id from public.mensagens y
         where y.conversa_id = msg.conversa_id and y.direcao = 'saida' and not y.automatica
           and y.autor_tipo in ('bot', 'atendente') and y.criado_em > msg.criado_em
         order by y.criado_em limit 1) r on true
     where msg.direcao = 'entrada' and (msg.anterior is null or msg.anterior = 'saida')
       and msg.criado_em >= p_de and msg.criado_em < p_ate
  ),
  tempos as (
    select pedido.*, extract(epoch from resposta_em - em) as seg from pedido
  ),
  opp as (
    select o.*, e.tipo as tipo_etapa, e.nome as etapa_nome, e.ordem as etapa_ordem
      from public.oportunidades o join public.etapas_funil e on e.id = o.etapa_id
     where o.org_id = p_org
       and (p_canal is null or o.contato_id in (select contato_id from conv))
       and (p_vendedor is null or o.responsavel_id = p_vendedor or o.contato_id in (select contato_id from conv))
  ),
  bot_conv as (
    select distinct m.conversa_id from public.mensagens m join conv on conv.id = m.conversa_id
     where m.org_id = p_org and m.autor_tipo = 'bot' and m.direcao = 'saida' and not m.automatica
       and m.criado_em >= p_de and m.criado_em < p_ate
  ),
  passadas as (
    select au.entidade_id::uuid as conversa_id, au.criado_em, au.depois ->> 'motivo' as motivo
      from public.auditoria au
     where au.org_id = p_org and au.acao = 'conversa_estado' and au.ator_tipo = 'bot'
       and au.depois ->> 'estado' = 'aguardando_humano'
       and au.criado_em >= p_de and au.criado_em < p_ate
       and au.entidade_id::uuid in (select id from conv)
  )
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate,
    'resposta', jsonb_build_object(
      'pedidos', (select count(*) from tempos),
      'sem_resposta', (select count(*) from tempos where resposta_em is null and em < now() - interval '1 hour'),
      'geral', (select jsonb_build_object('n', count(seg), 'mediana_seg', percentile_cont(0.5) within group (order by seg),
                                          'pct_5min', round(100.0 * count(*) filter (where seg <= 300) / nullif(count(*), 0)))
                  from tempos),
      'agente', (select jsonb_build_object('n', count(*), 'mediana_seg', percentile_cont(0.5) within group (order by seg),
                                           'pct_5min', round(100.0 * count(*) filter (where seg <= 300) / nullif(count(*), 0)))
                   from tempos where quem = 'bot'),
      'equipe', (select jsonb_build_object('n', count(*), 'mediana_seg', percentile_cont(0.5) within group (order by seg),
                                           'pct_5min', round(100.0 * count(*) filter (where seg <= 300) / nullif(count(*), 0)))
                   from tempos where quem = 'atendente'),
      'fora_horario', (select jsonb_build_object('n', count(*), 'mediana_seg', percentile_cont(0.5) within group (order by seg))
                         from tempos where fora),
      'dentro_horario', (select jsonb_build_object('n', count(*), 'mediana_seg', percentile_cont(0.5) within group (order by seg))
                           from tempos where not fora),
      'por_dia', (select coalesce(jsonb_agg(d order by d ->> 'dia'), '[]') from (
                    select jsonb_build_object(
                             'dia', to_char(em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
                             'pedidos', count(*),
                             'agente_mediana_seg', percentile_cont(0.5) within group (order by seg) filter (where quem = 'bot'),
                             'equipe_mediana_seg', percentile_cont(0.5) within group (order by seg) filter (where quem = 'atendente')) d
                      from tempos group by to_char(em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')) x)
    ),
    'leads', (select jsonb_build_object(
                'novos', count(*),
                'com_oportunidade', count(*) filter (where exists (select 1 from public.oportunidades o where o.contato_id = conv.contato_id)),
                'respondidos', count(*) filter (where exists (
                   select 1 from public.mensagens y where y.conversa_id = conv.id and y.direcao = 'saida'
                      and not y.automatica and y.autor_tipo in ('bot', 'atendente'))))
                from conv where conv.criado_em >= p_de and conv.criado_em < p_ate),
    'funil', jsonb_build_object(
      'criadas', (select count(*) from opp where criado_em >= p_de and criado_em < p_ate),
      'mudancas', (select count(*) from public.oportunidade_historico h join opp on opp.id = h.oportunidade_id
                    where h.org_id = p_org and h.etapa_de is not null and h.etapa_para is not null
                      and h.criado_em >= p_de and h.criado_em < p_ate),
      'ganhas', (select count(*) from opp where tipo_etapa = 'ganho' and fechada_em >= p_de and fechada_em < p_ate),
      'perdidas', (select count(*) from opp where tipo_etapa = 'perdido' and fechada_em >= p_de and fechada_em < p_ate),
      'valor_ganho', (select coalesce(sum(valor_estimado), 0) from opp where tipo_etapa = 'ganho' and fechada_em >= p_de and fechada_em < p_ate),
      'etapas', (select coalesce(jsonb_agg(jsonb_build_object('nome', e.nome, 'tipo', e.tipo, 'abertas', coalesce(x.n, 0),
                                                              'valor', coalesce(x.valor, 0)) order by e.ordem), '[]')
                   from public.etapas_funil e
                   left join (select etapa_id, count(*) n, sum(valor_estimado) valor from opp where fechada_em is null group by etapa_id) x
                     on x.etapa_id = e.id
                  where e.org_id = p_org and e.tipo = 'aberta')
    ),
    'agente', jsonb_build_object(
      'conversas', (select count(*) from bot_conv),
      'passadas', (select count(distinct conversa_id) from passadas),
      'respostas', (select count(*) from public.mensagens m join conv on conv.id = m.conversa_id
                     where m.org_id = p_org and m.autor_tipo = 'bot' and m.direcao = 'saida' and not m.automatica
                       and m.criado_em >= p_de and m.criado_em < p_ate),
      'motivos', (select coalesce(jsonb_agg(motivo order by criado_em desc), '[]')
                    from (select motivo, criado_em from passadas where motivo is not null order by criado_em desc limit 5) x)
    ),
    'pedidos', case when public.modulo_ativo(p_org, 'erp') then (
      select jsonb_build_object(
        'criados', count(*) filter (where p.criado_em >= p_de and p.criado_em < p_ate),
        'pelo_agente', count(*) filter (where p.origem = 'agente' and p.criado_em >= p_de and p.criado_em < p_ate),
        'confirmados', count(*) filter (where p.confirmado_em >= p_de and p.confirmado_em < p_ate),
        'valor_confirmado', coalesce(sum(p.total) filter (where p.confirmado_em >= p_de and p.confirmado_em < p_ate
                                                           and p.status <> 'cancelado'), 0))
        from public.pedidos p
       where p.org_id = p_org
         and (p_vendedor is null or p.responsavel_id = p_vendedor or p.contato_id in (select contato_id from conv))
         and (p_canal is null or p.contato_id in (select contato_id from conv))) end,
    'vendedores', case when p_vendedor is null then (
      select coalesce(jsonb_agg(v order by v ->> 'nome'), '[]') from (
        select jsonb_build_object(
                 'user_id', mo.user_id,
                 'nome', coalesce(pf.nome, 'Sem nome'),
                 'conversas', (select count(distinct m.conversa_id) from public.mensagens m join conv on conv.id = m.conversa_id
                                where m.org_id = p_org and m.autor_id = mo.user_id and m.autor_tipo = 'atendente'
                                  and m.criado_em >= p_de and m.criado_em < p_ate),
                 'respostas', (select count(*) from tempos where tempos.autor_id = mo.user_id and quem = 'atendente'),
                 'mediana_seg', (select percentile_cont(0.5) within group (order by seg) from tempos
                                  where tempos.autor_id = mo.user_id and quem = 'atendente'),
                 'oportunidades_abertas', (select count(*) from opp where opp.responsavel_id = mo.user_id and fechada_em is null)) v
          from public.membros_org mo left join public.perfis pf on pf.user_id = mo.user_id
         where mo.org_id = p_org and mo.ativo) x) end
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.painel_periodo(uuid, timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated;

-- Quem pede: dono/admin filtram à vontade; atendente fica preso à própria carteira.
create function public.painel_filtro_vendedor(p_org uuid, p_vendedor uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_membro(p_org) then
    raise exception 'sem acesso';
  end if;
  if public.tem_papel(p_org, '{dono,admin}') then
    return p_vendedor;
  end if;
  return auth.uid();
end $$;
revoke execute on function public.painel_filtro_vendedor(uuid, uuid) from public, anon, authenticated;

-- ============================================================================
-- Para a tela
-- ============================================================================
create function public.painel_resumo(p_org uuid, p_de timestamptz, p_ate timestamptz, p_canal uuid default null,
                                     p_vendedor uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_vend uuid := public.painel_filtro_vendedor(p_org, p_vendedor);
begin
  if p_ate <= p_de or p_ate - p_de > interval '366 days' then
    raise exception 'período inválido';
  end if;
  return jsonb_build_object(
    'atual', public.painel_periodo(p_org, p_de, p_ate, p_canal, v_vend),
    'anterior', public.painel_periodo(p_org, p_de - (p_ate - p_de), p_de, p_canal, v_vend),
    'gerencia', public.tem_papel(p_org, '{dono,admin}'),
    'vendedor', v_vend,
    'config', (select jsonb_build_object('minutos_por_resposta', c.minutos_por_resposta,
                                         'antes_tempo_resposta_min', c.antes_tempo_resposta_min, 'piloto_inicio', c.piloto_inicio)
                 from public.painel_config c where c.org_id = p_org));
end $$;

-- Listas para agir agora (não dependem do período): pedidos sem resposta há mais de 1 hora e oportunidades abertas
-- sem mensagem nossa há mais de 3 dias.
create function public.painel_pendencias(p_org uuid, p_canal uuid default null, p_vendedor uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_vend uuid := public.painel_filtro_vendedor(p_org, p_vendedor);
  v_res jsonb;
begin
  with conv as (
    select c.id, c.contato_id, c.canal_id, cn.nome as numero
      from public.conversas c join public.canais cn on cn.id = c.canal_id
     where c.org_id = p_org and c.estado <> 'encerrada'
       and (p_canal is null or c.canal_id = p_canal)
       and (v_vend is null or c.atribuida_a = v_vend or cn.responsavel_id = v_vend)
  ),
  ultima as (
    select conv.id, conv.contato_id, conv.numero, u.criado_em, u.direcao
      from conv
      cross join lateral (select m.criado_em, m.direcao from public.mensagens m
                           where m.conversa_id = conv.id and m.autor_tipo <> 'sistema' and not m.automatica
                           order by m.criado_em desc limit 1) u
  )
  select jsonb_build_object(
    'sem_resposta', (
      select coalesce(jsonb_agg(jsonb_build_object('conversa_id', s.id, 'contato', coalesce(ct.nome, ct.nome_whatsapp, ct.telefone),
                                                   'numero', s.numero, 'desde', s.criado_em) order by s.criado_em), '[]')
        from (select * from ultima where direcao = 'entrada' and criado_em < now() - interval '1 hour'
               order by criado_em limit 30) s
        join public.contatos ct on ct.id = s.contato_id),
    'sem_retorno', (
      select coalesce(jsonb_agg(x order by x ->> 'ultimo_contato' nulls first), '[]') from (
        select jsonb_build_object('oportunidade_id', o.id, 'titulo', o.titulo, 'contato_id', o.contato_id,
                                  'contato', coalesce(ct.nome, ct.nome_whatsapp, ct.telefone), 'etapa', e.nome,
                                  'ultimo_contato', ul.em) x
          from public.oportunidades o
          join public.etapas_funil e on e.id = o.etapa_id and e.tipo = 'aberta'
          join public.contatos ct on ct.id = o.contato_id
          left join lateral (select max(m.criado_em) em from public.mensagens m join public.conversas c on c.id = m.conversa_id
                              where c.contato_id = o.contato_id and m.direcao = 'saida' and not m.automatica
                                and m.autor_tipo in ('bot', 'atendente')) ul on true
         where o.org_id = p_org and o.fechada_em is null
           and (ul.em is null or ul.em < now() - interval '3 days')
           and (p_canal is null or o.contato_id in (select contato_id from conv))
           and (v_vend is null or o.responsavel_id = v_vend or o.contato_id in (select contato_id from conv))
         order by ul.em nulls first
         limit 30) y)
  ) into v_res;
  return v_res;
end $$;

-- Relatório do piloto: primeira semana contra a última (dono/admin).
create function public.painel_relatorio(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_inicio timestamptz;
  v_fim timestamptz := now();
  v_ultima_de timestamptz;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'sem acesso';
  end if;
  select coalesce((c.piloto_inicio::timestamp at time zone 'America/Sao_Paulo'),
                  (select min(coalesce(cn.conectado_em, cn.criado_em)) from public.canais cn where cn.org_id = p_org))
    into v_inicio
    from (select 1) um left join public.painel_config c on c.org_id = p_org;
  v_inicio := coalesce(v_inicio, now() - interval '7 days');
  v_ultima_de := greatest(v_fim - interval '7 days', v_inicio + interval '7 days');
  return jsonb_build_object(
    'empresa', (select nome from public.organizacoes where id = p_org),
    'inicio', v_inicio, 'fim', v_fim,
    'dias', greatest(1, ceil(extract(epoch from v_fim - v_inicio) / 86400)),
    'primeira_semana', public.painel_periodo(p_org, v_inicio, least(v_inicio + interval '7 days', v_fim), null, null),
    'ultima_semana', case when v_ultima_de < v_fim then public.painel_periodo(p_org, v_ultima_de, v_fim, null, null) end,
    'total', public.painel_periodo(p_org, v_inicio, v_fim, null, null),
    'config', (select jsonb_build_object('minutos_por_resposta', c.minutos_por_resposta,
                                         'antes_tempo_resposta_min', c.antes_tempo_resposta_min)
                 from public.painel_config c where c.org_id = p_org));
end $$;

revoke execute on function
  public.painel_resumo(uuid, timestamptz, timestamptz, uuid, uuid), public.painel_pendencias(uuid, uuid, uuid),
  public.painel_relatorio(uuid)
from public, anon;
grant execute on function
  public.painel_resumo(uuid, timestamptz, timestamptz, uuid, uuid), public.painel_pendencias(uuid, uuid, uuid),
  public.painel_relatorio(uuid)
to authenticated;
