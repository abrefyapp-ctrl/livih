-- Equipes e o gestor de equipe (docs/equipes-origem-prospeccao.md, entrega 1; pedido da CEFEQ em 10/11).
--
-- A CEFEQ tem 25 vendedores, cada um com o seu número, em 6 canais de venda (3 lojas, externas, televendas e
-- e-commerce), cada canal com um gestor. Pediram que "o gerente veja só a equipe dele". Até aqui havia só dono e admin
-- (veem tudo) e atendente (vê os números dele, os da empresa e a carteira dele).
--
-- Decisões de 10/11 (usuário):
--   - uma equipe por pessoa (membros_org.equipe_id); uma equipe pode ter mais de um gestor;
--   - gestor é uma marcação no membro (membros_org.gestor), não um papel novo: para a tela ele continua "atendente" e
--     não mexe em configuração, cobrança nem equipes. (Também evita valor novo no enum papel_org, que não pode ser usado
--     na mesma transação em que é criado.)
--   - o gestor vê e responde o que os vendedores da equipe veem pelos números e pela carteira deles (conversas,
--     contatos, funil, pedidos, clientes, tarefas e agenda), inclusive de quem saiu da empresa (membro desativado
--     continua na equipe: o histórico do vendedor que saiu era a dor da CEFEQ);
--   - no agente, o gestor só liga e desliga os números da equipe; instruções e regras seguem com dono e admin;
--   - o Painel entra nesta entrega: dono e admin filtram por equipe; o gestor abre já na equipe dele e filtra os
--     vendedores dela.
-- A regra é uma só, gestor_ve(org, pessoa), acrescentada nas funções de "quem vê" que já existiam.
-- Revisão (revisor-banco, 10/11): o gestor "enxerga" só os atendentes da equipe (dono e admin podem estar numa equipe,
-- para o rodízio por equipe da entrega 2, sem o gestor ver o número deles); agente_ligar exige empresa ativa; o
-- gestor vê também a tarefa criada por alguém da equipe; a lista "sem resposta" do Painel só traz conversa que a
-- pessoa consegue abrir.

-- membros_org é lida em toda checagem de RLS: não esperar muito pela trava do alter table.
set lock_timeout = '5s';

-- ============================================================================
-- Equipes
-- ============================================================================
create table public.equipes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 60),
  criado_em timestamptz not null default now(),
  unique (id, org_id)
);
create unique index equipes_org_nome_idx on public.equipes (org_id, lower(btrim(nome)));
comment on table public.equipes is 'Equipes de venda da empresa (loja, televendas…); cada pessoa em uma só';

alter table public.equipes enable row level security;
create policy equipes_ver on public.equipes for select to authenticated using (public.eh_membro(org_id));
grant select on public.equipes to authenticated;

alter table public.membros_org
  add column equipe_id uuid,
  add column gestor boolean not null default false,
  add constraint membros_org_equipe_fk foreign key (equipe_id, org_id) references public.equipes (id, org_id),
  add constraint membros_org_gestor_com_equipe check (not gestor or equipe_id is not null);
comment on column public.membros_org.equipe_id is 'Equipe da pessoa (uma só); vazio = sem equipe';
comment on column public.membros_org.gestor is 'Gestor da própria equipe: vê o que os vendedores dela veem e liga/desliga o agente dos números deles';
create index membros_org_equipe_idx on public.membros_org (org_id, equipe_id) where equipe_id is not null;

-- ============================================================================
-- A regra: sou gestor ativo e essa pessoa é atendente da minha equipe (ou sou eu). Quem chama já confere eh_membro
-- (empresa ativa); agente_ligar confere à parte.
-- ============================================================================
create function public.gestor_ve(p_org uuid, p_usuario uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_usuario is not null and exists (
    select 1 from public.membros_org eu
      join public.membros_org ele on ele.org_id = eu.org_id and ele.equipe_id = eu.equipe_id
     where eu.org_id = p_org and eu.user_id = auth.uid() and eu.ativo and eu.gestor
       and ele.user_id = p_usuario and (ele.papel = 'atendente' or ele.user_id = eu.user_id));
$$;
revoke execute on function public.gestor_ve(uuid, uuid) from public, anon;
grant execute on function public.gestor_ve(uuid, uuid) to authenticated, service_role;

-- A equipe que a pessoa logada gerencia (nulo = não é gestor).
create function public.equipe_que_gerencio(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.equipe_id from public.membros_org m
   where m.org_id = p_org and m.user_id = auth.uid() and m.ativo and m.gestor;
$$;
revoke execute on function public.equipe_que_gerencio(uuid) from public, anon;
grant execute on function public.equipe_que_gerencio(uuid) to authenticated;

-- ============================================================================
-- Configuração (dono e admin)
-- ============================================================================
create function public.equipe_salvar(p_org uuid, p_equipe uuid, p_nome text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_nome text := btrim(coalesce(p_nome, ''));
  v_antes text;
  v_id uuid;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'Só dono e admin mudam as equipes.';
  end if;
  if v_nome = '' then
    raise exception 'Dê um nome para a equipe.';
  end if;
  if length(v_nome) > 60 then
    raise exception 'O nome da equipe pode ter até 60 letras.';
  end if;
  if exists (select 1 from public.equipes e
              where e.org_id = p_org and lower(btrim(e.nome)) = lower(v_nome) and e.id is distinct from p_equipe) then
    raise exception 'Já existe uma equipe com esse nome.';
  end if;
  if p_equipe is null then
    insert into public.equipes (org_id, nome) values (p_org, v_nome) returning id into v_id;
    perform public.auditar(p_org, 'equipe_criar', 'equipes', v_id::text, null, jsonb_build_object('nome', v_nome));
  else
    select nome into v_antes from public.equipes where id = p_equipe and org_id = p_org;
    if v_antes is null then
      raise exception 'Equipe não encontrada.';
    end if;
    update public.equipes set nome = v_nome where id = p_equipe returning id into v_id;
    perform public.auditar(p_org, 'equipe_renomear', 'equipes', v_id::text,
                           jsonb_build_object('nome', v_antes), jsonb_build_object('nome', v_nome));
  end if;
  return v_id;
end $$;

-- Remover a equipe tira as pessoas dela (e a marcação de gestor); as conversas e contatos não mudam.
create function public.equipe_remover(p_equipe uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_eq public.equipes;
  v_pessoas integer;
begin
  select * into v_eq from public.equipes where id = p_equipe;
  if v_eq.id is null or not public.tem_papel(v_eq.org_id, '{dono,admin}') then
    raise exception 'Só dono e admin mudam as equipes.';
  end if;
  update public.membros_org set equipe_id = null, gestor = false where org_id = v_eq.org_id and equipe_id = p_equipe;
  get diagnostics v_pessoas = row_count;
  delete from public.equipes where id = p_equipe;
  perform public.auditar(v_eq.org_id, 'equipe_remover', 'equipes', p_equipe::text,
                         jsonb_build_object('nome', v_eq.nome, 'pessoas', v_pessoas), null);
end $$;

-- Põe a pessoa numa equipe (ou tira, com nulo) e diz se é gestor dela. A troca fica na auditoria pelo gatilho
-- membros_org_auditar.
create function public.membro_definir_equipe(p_org uuid, p_usuario uuid, p_equipe uuid, p_gestor boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'Só dono e admin mudam as equipes.';
  end if;
  if p_equipe is not null and not exists (select 1 from public.equipes where id = p_equipe and org_id = p_org) then
    raise exception 'Equipe não encontrada.';
  end if;
  update public.membros_org
     set equipe_id = p_equipe, gestor = coalesce(p_gestor, false) and p_equipe is not null
   where org_id = p_org and user_id = p_usuario;
  if not found then
    raise exception 'Pessoa não encontrada na equipe.';
  end if;
end $$;

revoke execute on function public.equipe_salvar(uuid, uuid, text), public.equipe_remover(uuid),
  public.membro_definir_equipe(uuid, uuid, uuid, boolean)
from public, anon;
grant execute on function public.equipe_salvar(uuid, uuid, text), public.equipe_remover(uuid),
  public.membro_definir_equipe(uuid, uuid, uuid, boolean)
to authenticated;

-- ============================================================================
-- Ligar e desligar o agente de um número: dono, admin ou o gestor da equipe do vendedor do número
-- ============================================================================
create function public.agente_ligar(p_canal uuid, p_ativo boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_canal public.canais;
begin
  select * into v_canal from public.canais where id = p_canal;
  if v_canal.id is null or not public.eh_membro(v_canal.org_id)
     or not (public.tem_papel(v_canal.org_id, '{dono,admin}') or public.gestor_ve(v_canal.org_id, v_canal.responsavel_id)) then
    raise exception 'Só dono, admin ou o gestor da equipe do vendedor ligam e desligam o agente deste número.';
  end if;
  update public.agentes set ativo = coalesce(p_ativo, false) where canal_id = p_canal;
  if not found then
    raise exception 'Este número ainda não tem agente. Fale com o suporte da Livih.';
  end if;
end $$;
revoke execute on function public.agente_ligar(uuid, boolean) from public, anon;
grant execute on function public.agente_ligar(uuid, boolean) to authenticated;

-- ============================================================================
-- Quem vê o quê: as funções de sempre, mais "gestor da equipe"
-- ============================================================================
-- Igual a 20261007190000, mais o número de vendedor da minha equipe.
create or replace function public.pode_ver_canal(p_canal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.canais c
     where c.id = p_canal and public.eh_membro(c.org_id)
       and (c.responsavel_id is null or c.responsavel_id = auth.uid() or public.tem_papel(c.org_id, '{dono,admin}')
            or public.gestor_ve(c.org_id, c.responsavel_id))
  );
$$;

-- Igual a 20261007200000, mais o contato na carteira de alguém da minha equipe.
create or replace function public.pode_ver_contato(p_contato uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contatos c
     where c.id = p_contato and public.eh_membro(c.org_id)
       and (
         public.tem_papel(c.org_id, '{dono,admin}')
         or c.responsavel_id = auth.uid()
         or public.gestor_ve(c.org_id, c.responsavel_id)
         or exists (select 1 from public.conversas v where v.contato_id = c.id and public.pode_ver_canal(v.canal_id))
         or (c.responsavel_id is null and not exists (select 1 from public.conversas v where v.contato_id = c.id))
       )
  );
$$;

-- Igual a 20261009150000, com a mesma regra.
create or replace function public.pode_ver_contato_linha(p_org uuid, p_contato uuid, p_responsavel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org)
     and (
       public.tem_papel(p_org, '{dono,admin}')
       or p_responsavel = auth.uid()
       or public.gestor_ve(p_org, p_responsavel)
       or exists (select 1 from public.conversas v where v.contato_id = p_contato and public.pode_ver_canal(v.canal_id))
       or (p_responsavel is null and not exists (select 1 from public.conversas v where v.contato_id = p_contato))
     );
$$;

-- Funil (igual a 20261027150000, mais a oportunidade de alguém da minha equipe).
alter policy oport_ver on public.oportunidades
  using (public.eh_membro(org_id) and (responsavel_id = (select auth.uid()) or public.gestor_ve(org_id, responsavel_id)
                                       or public.pode_ver_contato(contato_id)));
alter policy oport_editar on public.oportunidades
  using (public.eh_membro(org_id) and (responsavel_id = (select auth.uid()) or public.gestor_ve(org_id, responsavel_id)
                                       or public.pode_ver_contato(contato_id)))
  with check (public.eh_membro(org_id));

-- Pedidos (igual a 20261013130000; a versão de 4 parâmetros chama esta).
create or replace function public.pode_ver_pedido(p_org uuid, p_contato uuid, p_responsavel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org) and public.modulo_ativo(p_org, 'erp')
     and (p_contato is null or p_responsavel = auth.uid() or public.gestor_ve(p_org, p_responsavel)
          or public.pode_ver_contato(p_contato));
$$;

-- Clientes (igual a 20261105120000).
create or replace function public.pode_ver_cliente_linha(p_org uuid, p_cliente uuid, p_responsavel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org)
     and (
       public.ve_todos_clientes(p_org)
       or p_responsavel = auth.uid()
       or p_responsavel is null
       or public.gestor_ve(p_org, p_responsavel)
       or exists (select 1 from public.contatos_clientes cc
                   where cc.cliente_id = p_cliente and public.pode_ver_contato(cc.contato_id))
     );
$$;

-- Tarefas (igual a 20261105130000).
create or replace function public.pode_ver_tarefa(p_org uuid, p_responsavel uuid, p_criado_por uuid, p_contato uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org)
     and (public.tem_papel(p_org, '{dono,admin}')
          or p_responsavel = auth.uid()
          or p_criado_por = auth.uid()
          or public.gestor_ve(p_org, p_responsavel)
          or public.gestor_ve(p_org, p_criado_por)
          or (p_contato is not null and public.pode_ver_contato(p_contato)));
$$;

-- Agenda (igual a 20261012140000).
create or replace function public.pode_ver_compromisso(p_org uuid, p_responsavel uuid, p_contato uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org)
     and (p_responsavel = auth.uid() or public.gestor_ve(p_org, p_responsavel) or p_contato is null
          or public.pode_ver_contato(p_contato));
$$;

-- ============================================================================
-- Painel por equipe
-- ============================================================================
-- Quem entra nos números do Painel (nulo = a empresa toda):
--   - dono/admin: o vendedor escolhido; senão a equipe escolhida; senão todos;
--   - gestor: o vendedor escolhido, se for da equipe dele; senão a equipe dele;
--   - atendente: só ele.
create function public.painel_membros(p_org uuid, p_vendedor uuid, p_equipe uuid) returns uuid[]
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
    return (select array_agg(user_id) from public.membros_org where org_id = p_org and equipe_id = v_minha);
  end if;
  return array[auth.uid()];
end $$;
revoke execute on function public.painel_membros(uuid, uuid, uuid) from public, anon, authenticated;

-- Um período: igual a 20261021120000, com um conjunto de pessoas no lugar de um vendedor só. A lista "Por vendedor"
-- aparece quando há mais de uma pessoa (a empresa ou uma equipe).
drop function public.painel_periodo(uuid, timestamptz, timestamptz, uuid, uuid);
create function public.painel_periodo(p_org uuid, p_de timestamptz, p_ate timestamptz, p_canal uuid, p_membros uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_res jsonb;
begin
  with conv as (
    select c.id, c.contato_id, c.canal_id, c.criado_em
      from public.conversas c join public.canais cn on cn.id = c.canal_id
     where c.org_id = p_org
       and (p_canal is null or c.canal_id = p_canal)
       and (p_membros is null or c.atribuida_a = any(p_membros) or cn.responsavel_id = any(p_membros))
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
       and (p_membros is null or o.responsavel_id = any(p_membros) or o.contato_id in (select contato_id from conv))
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
         and (p_membros is null or p.responsavel_id = any(p_membros) or p.contato_id in (select contato_id from conv))
         and (p_canal is null or p.contato_id in (select contato_id from conv))) end,
    'vendedores', case when p_membros is null or cardinality(p_membros) > 1 then (
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
         where mo.org_id = p_org and mo.ativo and (p_membros is null or mo.user_id = any(p_membros))) x) end
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.painel_periodo(uuid, timestamptz, timestamptz, uuid, uuid[]) from public, anon, authenticated;

drop function public.painel_resumo(uuid, timestamptz, timestamptz, uuid, uuid);
create function public.painel_resumo(p_org uuid, p_de timestamptz, p_ate timestamptz, p_canal uuid default null,
                                     p_vendedor uuid default null, p_equipe uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_membros uuid[] := public.painel_membros(p_org, p_vendedor, p_equipe);
begin
  if p_ate <= p_de or p_ate - p_de > interval '366 days' then
    raise exception 'período inválido';
  end if;
  return jsonb_build_object(
    'atual', public.painel_periodo(p_org, p_de, p_ate, p_canal, v_membros),
    'anterior', public.painel_periodo(p_org, p_de - (p_ate - p_de), p_de, p_canal, v_membros),
    'gerencia', public.tem_papel(p_org, '{dono,admin}'),
    'equipe_gestor', public.equipe_que_gerencio(p_org),
    'vendedor', case when cardinality(v_membros) = 1 then v_membros[1] end,
    'config', (select jsonb_build_object('minutos_por_resposta', c.minutos_por_resposta,
                                         'antes_tempo_resposta_min', c.antes_tempo_resposta_min, 'piloto_inicio', c.piloto_inicio)
                 from public.painel_config c where c.org_id = p_org));
end $$;

-- Igual a 20261105130000, com o conjunto de pessoas. As listas levam à conversa: com filtro de pessoas, só entra
-- conversa de número que quem pede consegue abrir (a atribuída a alguém da equipe num número de outra equipe, não).
drop function public.painel_pendencias(uuid, uuid, uuid);
create function public.painel_pendencias(p_org uuid, p_canal uuid default null, p_vendedor uuid default null,
                                         p_equipe uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_membros uuid[] := public.painel_membros(p_org, p_vendedor, p_equipe);
  v_res jsonb;
begin
  with conv as (
    select c.id, c.contato_id, c.canal_id, cn.nome as numero
      from public.conversas c join public.canais cn on cn.id = c.canal_id
     where c.org_id = p_org and c.estado <> 'encerrada'
       and (p_canal is null or c.canal_id = p_canal)
       and (v_membros is null or ((c.atribuida_a = any(v_membros) or cn.responsavel_id = any(v_membros))
                                  and public.pode_ver_canal(c.canal_id)))
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
           and not exists (select 1 from public.tarefas tf
                            where tf.status = 'aberta' and tf.vence_em >= now()
                              and (tf.oportunidade_id = o.id or (tf.oportunidade_id is null and tf.contato_id = o.contato_id)))
           and (p_canal is null or o.contato_id in (select contato_id from conv))
           and (v_membros is null or o.responsavel_id = any(v_membros) or o.contato_id in (select contato_id from conv))
         order by ul.em nulls first
         limit 30) y)
  ) into v_res;
  return v_res;
end $$;

-- Igual a 20261105170000, com o conjunto de pessoas.
drop function public.painel_perdas(uuid, timestamptz, timestamptz, uuid);
create function public.painel_perdas(p_org uuid, p_de timestamptz, p_ate timestamptz, p_vendedor uuid default null,
                                     p_equipe uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_membros uuid[] := public.painel_membros(p_org, p_vendedor, p_equipe);
begin
  if p_ate <= p_de or p_ate - p_de > interval '366 days' then
    raise exception 'período inválido';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('motivo', x.motivo, 'quantidade', x.n, 'valor', x.valor)
                              order by x.n desc, x.motivo), '[]')
      from (
        select coalesce(mp.nome, 'Sem motivo informado') as motivo, count(*) as n, coalesce(sum(o.valor_estimado), 0) as valor
          from public.oportunidades o
          join public.etapas_funil e on e.id = o.etapa_id and e.tipo = 'perdido'
          left join public.motivos_perda mp on mp.id = o.motivo_perda_id
         where o.org_id = p_org and o.fechada_em >= p_de and o.fechada_em < p_ate
           and (v_membros is null or o.responsavel_id = any(v_membros))
         group by 1
      ) x
  );
end $$;

drop function public.painel_filtro_vendedor(uuid, uuid);

revoke execute on function
  public.painel_resumo(uuid, timestamptz, timestamptz, uuid, uuid, uuid), public.painel_pendencias(uuid, uuid, uuid, uuid),
  public.painel_perdas(uuid, timestamptz, timestamptz, uuid, uuid)
from public, anon;
grant execute on function
  public.painel_resumo(uuid, timestamptz, timestamptz, uuid, uuid, uuid), public.painel_pendencias(uuid, uuid, uuid, uuid),
  public.painel_perdas(uuid, timestamptz, timestamptz, uuid, uuid)
to authenticated;
