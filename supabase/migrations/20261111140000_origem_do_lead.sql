-- Origem do lead (docs/equipes-origem-prospeccao.md, entrega 3, pedido da CEFEQ em 10/11).
--
-- A CEFEQ quer saber de onde vem cada contato (site, Google Ads, campanha...) e quantos viram venda. contatos.origem
-- e oportunidades.origem existiam, mas só diziam como o registro foi criado ('whatsapp' pelo webhook ou pelo agente,
-- 'manual' pela tela). Agora a origem é gravada sozinha, no começo de cada ciclo de conversa.
--
-- Ciclo = primeira mensagem com o contato depois de 30 dias sem nenhuma (em qualquer número da empresa; nota interna
-- e mensagem com erro de envio não contam), a mesma régua dos contatos ativos (20261111100000). Cada ciclo é uma
-- linha nova em origem_ciclos, que só recebe acréscimos: o Painel de um mês fechado não muda quando o contato volta
-- meses depois por outro caminho. A origem do ciclo, em ordem:
--   1. mensagem de campanha (modelo.campanha_id) → 'Campanha';
--   2. mensagem escrita por alguém da equipe → 'Prospecção ativa';
--   3. mensagem do contato que contém o texto de uma regra (a mensagem pronta do botão do site, por exemplo) → a
--      origem da regra (a de texto mais longo vence);
--   4. a origem do número (ex.: o número do Google Ads) → canais.origem;
--   5. sem origem (o Painel mostra "Direto no WhatsApp").
-- Mensagem do agente ou automática não abre ciclo. Resposta a status fica para a entrega 4.
--
-- A saída nasce 'pendente' e só depois vira 'erro' (número sem WhatsApp, Meta recusou): o ciclo guarda a mensagem
-- que o abriu, e o Painel e a oportunidade ignoram o ciclo cuja mensagem deu erro.
--
-- O contato recebe a origem só quando ele escreveu primeiro (número ou regra) e ainda não tinha uma de verdade
-- (nulo, 'whatsapp' ou 'manual'). 'Campanha' e 'Prospecção ativa' dizem como o ciclo começou, não de onde o contato
-- veio, e nos primeiros 30 dias de um número na Livih marcariam a carteira antiga do vendedor (revisão de 11/11).
-- A oportunidade criada em até 30 dias do ciclo nasce com a origem dele.
--
-- O Painel ganha o bloco "Origem" (painel_origens). "Venda" é a oportunidade ganha; a nota do Sollus fica para a
-- integração. Não há dados de antes: o Painel diz desde quando mede.

-- ============================================================================
-- Onde a origem fica
-- ============================================================================
alter table public.canais add column origem text check (origem is null or length(origem) between 1 and 60);
comment on column public.canais.origem is
  'Origem dos contatos que escrevem neste número (ex.: Google Ads, Site). Vale quando nenhuma regra de texto casa.';

create table public.origem_regras (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  texto text not null check (length(btrim(texto)) between 3 and 100),
  origem text not null check (length(btrim(origem)) between 1 and 60),
  criado_em timestamptz not null default now()
);
create unique index origem_regras_texto_unico on public.origem_regras (org_id, public.sem_acento(btrim(texto)));
comment on table public.origem_regras is
  'Se a primeira mensagem do contato contém o texto (sem acento e sem diferenciar maiúsculas), a origem é esta.';
alter table public.origem_regras enable row level security;
create policy origem_regras_ver on public.origem_regras for select to authenticated using (public.eh_membro(org_id));
revoke all on public.origem_regras from public, anon, authenticated;
grant select on public.origem_regras to authenticated;

create table public.origem_ciclos (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  contato_id uuid not null references public.contatos (id) on delete cascade,
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  mensagem_id uuid not null references public.mensagens (id) on delete cascade,
  origem text,
  recebido boolean not null,
  em timestamptz not null
);
create index origem_ciclos_periodo on public.origem_ciclos (org_id, em);
create index origem_ciclos_contato on public.origem_ciclos (contato_id, em);
comment on table public.origem_ciclos is
  'Um registro por ciclo de conversa (primeira mensagem depois de 30 dias sem nenhuma), só acréscimo. Lido pelo Painel.';
comment on column public.origem_ciclos.origem is 'Campanha, Prospecção ativa, origem da regra ou do número; nulo = direto.';
comment on column public.origem_ciclos.recebido is 'O contato escreveu primeiro (conta tempo de resposta).';
alter table public.origem_ciclos enable row level security;
revoke all on public.origem_ciclos from public, anon, authenticated;

-- Nomes que o Painel usa ou que só dizem como o registro foi criado: não podem ser origem configurada.
create function public.origem_reservada(p text) returns boolean
language sql immutable set search_path = '' as $$
  select public.sem_acento(btrim(coalesce(p, '')))
         in ('campanha', 'prospeccao ativa', 'direto no whatsapp', 'whatsapp', 'manual', 'importacao');
$$;
revoke execute on function public.origem_reservada(text) from public, anon, authenticated;

-- ============================================================================
-- Gravar o ciclo
-- ============================================================================
create function public.mensagens_origem() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_origem text;
  v_texto text;
begin
  if new.autor_tipo = 'sistema' or new.status_entrega = 'erro' then
    return null;
  end if;
  -- Saída que não é campanha nem de pessoa (agente, automática) não abre ciclo.
  if new.direcao = 'saida' and new.modelo ->> 'campanha_id' is null
     and (new.automatica or new.autor_tipo <> 'atendente') then
    return null;
  end if;
  select * into v_conv from public.conversas where id = new.conversa_id;
  -- Na entrada, trava o contato (o webhook já o travou em contato_por_whatsapp, mesma ordem): duas mensagens do
  -- mesmo contato em dois números ao mesmo tempo não abrem dois ciclos.
  if new.direcao = 'entrada' then
    perform 1 from public.contatos where id = v_conv.contato_id for update;
  end if;
  if exists (select 1 from public.mensagens y join public.conversas c2 on c2.id = y.conversa_id
              where y.org_id = new.org_id and c2.contato_id = v_conv.contato_id and y.id <> new.id
                and y.autor_tipo <> 'sistema' and y.status_entrega <> 'erro'
                and y.criado_em > new.criado_em - interval '30 days' and y.criado_em <= new.criado_em) then
    return null;
  end if;

  if new.direcao = 'saida' then
    v_origem := case when new.modelo ->> 'campanha_id' is not null then 'Campanha' else 'Prospecção ativa' end;
  else
    v_texto := public.sem_acento(new.texto);
    select r.origem into v_origem from public.origem_regras r
     where r.org_id = new.org_id and position(public.sem_acento(btrim(r.texto)) in v_texto) > 0
     order by length(btrim(r.texto)) desc, r.criado_em
     limit 1;
    if v_origem is null then
      select cn.origem into v_origem from public.canais cn where cn.id = v_conv.canal_id;
    end if;
  end if;

  insert into public.origem_ciclos (org_id, contato_id, conversa_id, mensagem_id, origem, recebido, em)
  values (new.org_id, v_conv.contato_id, v_conv.id, new.id, v_origem, new.direcao = 'entrada', new.criado_em);

  if new.direcao = 'entrada' and v_origem is not null then
    update public.contatos set origem = v_origem
     where id = v_conv.contato_id and (origem is null or origem in ('whatsapp', 'manual'));
  end if;
  return null;
end $$;
revoke execute on function public.mensagens_origem() from public, anon, authenticated;
create trigger mensagens_origem after insert on public.mensagens
for each row execute function public.mensagens_origem();

-- A oportunidade nasce com a origem do ciclo mais recente do contato (até 30 dias, mensagem sem erro). Só troca o
-- que não diz de onde o contato veio: nulo, 'whatsapp' (criada pelo agente) e 'manual' (criada pela tela).
create function public.oportunidade_origem() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_origem text;
  v_achou boolean;
begin
  if new.origem is null or new.origem in ('whatsapp', 'manual') then
    select oc.origem, true into v_origem, v_achou
      from public.origem_ciclos oc join public.mensagens m on m.id = oc.mensagem_id
     where oc.contato_id = new.contato_id and m.status_entrega <> 'erro'
       and oc.em >= coalesce(new.criado_em, now()) - interval '30 days'
     order by oc.em desc limit 1;
    if v_achou and v_origem is not null then
      new.origem := v_origem;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.oportunidade_origem() from public, anon, authenticated;
create trigger oportunidade_origem before insert on public.oportunidades
for each row execute function public.oportunidade_origem();

-- ============================================================================
-- Configurar (dono e admin)
-- ============================================================================
create function public.canal_definir_origem(p_canal uuid, p_origem text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_canal public.canais;
  v_origem text := nullif(btrim(p_origem), '');
begin
  select * into v_canal from public.canais where id = p_canal;
  if v_canal.id is null or not public.tem_papel(v_canal.org_id, '{dono,admin}') then
    raise exception 'Só dono e admin definem a origem do número.';
  end if;
  if length(v_origem) > 60 then
    raise exception 'A origem pode ter até 60 letras.';
  end if;
  if public.origem_reservada(v_origem) then
    raise exception 'A origem "%" é usada pela Livih. Escolha outro nome, como "Site" ou "Google Ads".', v_origem;
  end if;
  update public.canais set origem = v_origem where id = p_canal;
end $$;
revoke execute on function public.canal_definir_origem(uuid, text) from public, anon;
grant execute on function public.canal_definir_origem(uuid, text) to authenticated;

create function public.origem_regra_salvar(p_org uuid, p_id uuid, p_texto text, p_origem text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_texto text := btrim(coalesce(p_texto, ''));
  v_origem text := btrim(coalesce(p_origem, ''));
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'Só dono e admin mudam as regras de origem.';
  end if;
  if length(v_texto) < 3 or length(v_texto) > 100 then
    raise exception 'O texto da mensagem precisa ter de 3 a 100 letras.';
  end if;
  if length(v_origem) < 1 or length(v_origem) > 60 then
    raise exception 'Informe a origem (até 60 letras).';
  end if;
  if public.origem_reservada(v_origem) then
    raise exception 'A origem "%" é usada pela Livih. Escolha outro nome, como "Site" ou "Google Ads".', v_origem;
  end if;
  if exists (select 1 from public.origem_regras
              where org_id = p_org and public.sem_acento(btrim(texto)) = public.sem_acento(v_texto)
                and id is distinct from p_id) then
    raise exception 'Já existe uma regra com esse texto.';
  end if;
  if p_id is null then
    insert into public.origem_regras (org_id, texto, origem) values (p_org, v_texto, v_origem) returning id into v_id;
  else
    update public.origem_regras set texto = v_texto, origem = v_origem
     where id = p_id and org_id = p_org returning id into v_id;
    if v_id is null then
      raise exception 'Regra não encontrada.';
    end if;
  end if;
  return v_id;
end $$;
revoke execute on function public.origem_regra_salvar(uuid, uuid, text, text) from public, anon;
grant execute on function public.origem_regra_salvar(uuid, uuid, text, text) to authenticated;

create function public.origem_regra_remover(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.origem_regras where id = p_id;
  if v_org is null or not public.tem_papel(v_org, '{dono,admin}') then
    raise exception 'Só dono e admin mudam as regras de origem.';
  end if;
  delete from public.origem_regras where id = p_id;
end $$;
revoke execute on function public.origem_regra_remover(uuid) from public, anon;
grant execute on function public.origem_regra_remover(uuid) to authenticated;

-- ============================================================================
-- Painel: bloco "Origem"
-- ============================================================================
-- Ciclos que começaram no período (mensagem sem erro), com os mesmos filtros do Painel (número, equipe, vendedor pelo
-- painel_membros: conversa atribuída a alguém do filtro ou no número de alguém do filtro). Oportunidades pela coluna
-- origem, criadas ou ganhas no período, do responsável no filtro ou de um contato desses ciclos; as que não dizem de
-- onde vieram ('whatsapp', 'manual', nulo) entram em "Direto no WhatsApp". 'desde' = primeiro ciclo da empresa.
create function public.painel_origens(p_org uuid, p_de timestamptz, p_ate timestamptz, p_canal uuid default null,
                                      p_vendedor uuid default null, p_equipe uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_membros uuid[] := public.painel_membros(p_org, p_vendedor, p_equipe);
  v_linhas jsonb;
begin
  if p_ate <= p_de or p_ate - p_de > interval '366 days' then
    raise exception 'período inválido';
  end if;
  with ciclo as (
    select oc.conversa_id, oc.contato_id, oc.em, oc.recebido, coalesce(oc.origem, 'Direto no WhatsApp') as origem
      from public.origem_ciclos oc
      join public.mensagens m on m.id = oc.mensagem_id
      join public.conversas c on c.id = oc.conversa_id
      join public.canais cn on cn.id = c.canal_id
     where oc.org_id = p_org and oc.em >= p_de and oc.em < p_ate and m.status_entrega <> 'erro'
       and (p_canal is null or c.canal_id = p_canal)
       and (v_membros is null or c.atribuida_a = any(v_membros) or cn.responsavel_id = any(v_membros))
  ),
  resposta as (
    select ciclo.*,
           (select min(y.criado_em) from public.mensagens y
             where y.conversa_id = ciclo.conversa_id and y.direcao = 'saida' and not y.automatica
               and y.autor_tipo in ('bot', 'atendente') and y.criado_em > ciclo.em
               and y.criado_em < ciclo.em + interval '30 days') as respondida_em
      from ciclo where ciclo.recebido
  ),
  opp as (
    select coalesce(case when o.origem in ('whatsapp', 'manual') then null else o.origem end, 'Direto no WhatsApp') as origem,
           o.criado_em, o.fechada_em, o.valor_estimado, e.tipo as tipo_etapa
      from public.oportunidades o join public.etapas_funil e on e.id = o.etapa_id
     where o.org_id = p_org
       and ((o.criado_em >= p_de and o.criado_em < p_ate) or (o.fechada_em >= p_de and o.fechada_em < p_ate))
       and (p_canal is null or o.contato_id in (select contato_id from ciclo))
       and (v_membros is null or o.responsavel_id = any(v_membros) or o.contato_id in (select contato_id from ciclo))
  ),
  origens as (
    select origem from ciclo union select origem from opp
  )
  select coalesce(jsonb_agg(x order by (x ->> 'contatos')::int desc, x ->> 'origem'), '[]') into v_linhas from (
    select jsonb_build_object(
             'origem', og.origem,
             'contatos', (select count(*) from ciclo where ciclo.origem = og.origem),
             'recebidos', (select count(*) from resposta r where r.origem = og.origem),
             'sem_resposta', (select count(*) from resposta r where r.origem = og.origem and r.respondida_em is null
                                and r.em < now() - interval '1 hour'),
             'mediana_resposta_seg', (select percentile_cont(0.5) within group (order by extract(epoch from r.respondida_em - r.em))
                                        from resposta r where r.origem = og.origem and r.respondida_em is not null),
             'oportunidades', (select count(*) from opp where opp.origem = og.origem and opp.criado_em >= p_de and opp.criado_em < p_ate),
             'ganhas', (select count(*) from opp where opp.origem = og.origem and opp.tipo_etapa = 'ganho'
                          and opp.fechada_em >= p_de and opp.fechada_em < p_ate),
             'valor_ganho', (select coalesce(sum(valor_estimado), 0) from opp where opp.origem = og.origem
                               and opp.tipo_etapa = 'ganho' and opp.fechada_em >= p_de and opp.fechada_em < p_ate)) x
      from origens og) y;
  return jsonb_build_object(
    'desde', (select min(em) from public.origem_ciclos where org_id = p_org),
    'linhas', v_linhas);
end $$;
revoke execute on function public.painel_origens(uuid, timestamptz, timestamptz, uuid, uuid, uuid) from public, anon;
grant execute on function public.painel_origens(uuid, timestamptz, timestamptz, uuid, uuid, uuid) to authenticated;
