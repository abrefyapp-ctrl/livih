-- Distribuição sem carteira, por quem mais atendeu, por cidade e por equipe do número (docs/equipes-origem-prospeccao.md,
-- entrega 2; pedido da CEFEQ em 10/11, regras decididas pelo usuário em 12/11 e 13/11).
--
-- O rodízio de 20261105160000 gravava o vendedor como dono fixo do contato (contatos.responsavel_id) só na criação da
-- conversa: o contato ficava com ele para sempre. A CEFEQ não tem carteira ("os clientes são da CEFEQ"): quem volta
-- meses depois deve ir para o vendedor que mais o atendeu, e, se ele estiver de férias ou tiver saído, para qualquer
-- outro, sem esperar. Em 13/11 nenhuma empresa usava a distribuição (canais.distribuir desligado em todas), então o
-- comportamento muda para todos sem afetar ninguém. "Carteira fixa" vira opção quando algum cliente pedir.
--
-- Quando distribui: na mensagem do contato num número da empresa que distribui, se
--   - o contato está sem vendedor, ou o vendedor dele não está disponível (desativado, fora do rodízio ou ausente), ou
--   - começou um ciclo novo (30 dias sem conversa, a régua de origem_ciclos) depois da última distribuição
--     (contatos.distribuido_em, novo). Contato que nunca foi distribuído também entra.
-- responsavel_id continua sendo "o vendedor do contato agora" (a visibilidade e os avisos no celular dependem dele),
-- mas é reescrito a cada ciclo.
--
-- Quem recebe, em ordem (disponível = ativo, com "Recebe contatos novos" e não ausente):
--   0. no meio do ciclo, quem está atendendo a conversa agora (conversas.atribuida_a), se ativo e não ausente;
--   1. quem mais atendeu o contato na janela da empresa (padrão 90 dias): mais mensagens escritas por ele, sem as
--      automáticas, em qualquer número; empate, a mais recente;
--   2. rodízio na equipe da cidade do contato (equipes_cidades);
--   3. rodízio na equipe do número (canais.equipe_id, novo);
--   4. rodízio entre todos (o de antes).
-- Só o rodízio (2 a 4) mexe em ultima_distribuicao_em: o "mais atendeu" é preferência, não vez na fila.
--
-- Cidade: o agente já grava a cidade em contatos.dados ->> 'cidade' (agente_atualizar_contato); senão vale a do
-- cliente ligado ao contato. Sem cidade, com equipes por cidade cadastradas e o agente atendendo o número, a
-- distribuição espera (conversas.distribuir_pendente_em): distribui quando a cidade chega, quando a conversa passa
-- para a equipe ou cerca de 15 minutos depois (cron, a cada minuto). A pergunta da cidade pelo agente fica para a
-- mudança do n8n.
--
-- Revisão do revisor-banco (13/11) aplicada: travas sempre na ordem contato → empresa (conversa só com skip locked) e
-- checagem barata antes delas; gatilhos que nunca derrubam a mensagem do cliente nem a gravação da cidade; a conversa
-- em atendimento passa para quem recebeu; distribuido_em protegido do atendente; pendência limpa quando o número
-- deixa de distribuir; auditoria das cidades e da janela.
--
-- Ausência (decidida em 13/11): membros_org.ausente e ausente_ate ("Ausente até DD/MM"; sem data, até desmarcar).
-- Marcam dono e admin (qualquer pessoa) e o gestor (as pessoas da equipe dele). Ausente não recebe contato, perde a
-- preferência do "mais atendeu" e não recebe aviso de conversa aguardando. Volta sozinho depois da data.
-- Separado de "Recebe contatos novos", que é papel fixo: usar a mesma opção para férias fazia o gestor esquecer de
-- religar.
--
-- Fora do horário do vendedor (decidido em 13/11): sem regra nova. A Livih não tem horário por pessoa; o agente atende
-- fora do horário e a conversa já está com quem vai atender de manhã.

-- membros_org e canais são lidas em toda checagem de RLS: não esperar muito pela trava do alter table.
set lock_timeout = '5s';

-- ============================================================================
-- Colunas e tabela
-- ============================================================================
alter table public.membros_org
  add column ausente boolean not null default false,
  add column ausente_ate date,
  add constraint membros_org_ausente_ate check (ausente_ate is null or ausente);
comment on column public.membros_org.ausente is 'Férias, folga ou afastamento: não recebe contatos nem avisos de conversa aguardando';
comment on column public.membros_org.ausente_ate is 'Último dia da ausência (horário de Brasília); vazio = até desmarcar';

alter table public.canais
  add column equipe_id uuid,
  add constraint canais_equipe_fk foreign key (equipe_id, org_id) references public.equipes (id, org_id)
    on delete set null (equipe_id);
comment on column public.canais.equipe_id is 'Número da empresa que distribui: a equipe que recebe os contatos (vazio = todos)';

alter table public.contatos add column distribuido_em timestamptz;
comment on column public.contatos.distribuido_em is 'Última distribuição automática; ciclo novo depois dela distribui de novo';

alter table public.conversas add column distribuir_pendente_em timestamptz;
comment on column public.conversas.distribuir_pendente_em is 'Distribuição esperando a cidade do contato (o agente pergunta); o cron solta depois de 15 min';
create index conversas_distribuir_pendente_idx on public.conversas (distribuir_pendente_em)
  where distribuir_pendente_em is not null;

alter table public.organizacoes
  add column distribuicao_janela_dias smallint not null default 90
    check (distribuicao_janela_dias between 7 and 365);
comment on column public.organizacoes.distribuicao_janela_dias is 'Janela do "quem mais atendeu" na distribuição dos contatos';

create table public.equipes_cidades (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  equipe_id uuid not null,
  cidade text not null check (length(btrim(cidade)) between 1 and 100),
  chave text not null,
  criado_em timestamptz not null default now(),
  foreign key (equipe_id, org_id) references public.equipes (id, org_id) on delete cascade,
  unique (org_id, chave)
);
create index equipes_cidades_equipe_idx on public.equipes_cidades (equipe_id);
comment on table public.equipes_cidades is 'Cidades de cada equipe: o contato da cidade vai para o rodízio dessa equipe. Uma cidade, uma equipe';
comment on column public.equipes_cidades.chave is 'Cidade sem acento, minúscula e sem a UF (cidade_chave)';
alter table public.equipes_cidades enable row level security;
create policy equipes_cidades_ver on public.equipes_cidades for select to authenticated using (public.eh_membro(org_id));
revoke all on public.equipes_cidades from public, anon, authenticated;
grant select on public.equipes_cidades to authenticated;

-- ============================================================================
-- Regras pequenas
-- ============================================================================
create function public.hoje_brasilia() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create function public.membro_ausente(p_org uuid, p_usuario uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros_org m
                  where m.org_id = p_org and m.user_id = p_usuario and m.ausente
                    and (m.ausente_ate is null or m.ausente_ate >= public.hoje_brasilia()));
$$;

-- Pode receber contato: ativo, no rodízio e não ausente.
create function public.membro_disponivel(p_org uuid, p_usuario uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_usuario is not null and exists (
    select 1 from public.membros_org m
     where m.org_id = p_org and m.user_id = p_usuario and m.ativo and m.recebe_contatos)
    and not public.membro_ausente(p_org, p_usuario);
$$;

-- "Castro - PR", "castro/pr", "Castro, PR" → "castro".
create function public.cidade_chave(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select nullif(btrim(regexp_replace(
           split_part(split_part(split_part(public.sem_acento(btrim(coalesce(p, ''))), '/', 1), ',', 1), ' - ', 1),
           '\s+', ' ', 'g')), '');
$$;

create function public.cidade_do_contato(p_contato uuid) returns text
language sql stable security definer set search_path = '' as $$
  select public.cidade_chave(coalesce(nullif(btrim(ct.dados ->> 'cidade'), ''), cl.cidade))
    from public.contatos ct left join public.clientes cl on cl.id = ct.cliente_id
   where ct.id = p_contato;
$$;

-- Próximo da fila (quem recebeu há mais tempo, ou nunca), na equipe ou entre todos.
create function public.vendedor_do_rodizio(p_org uuid, p_equipe uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.membros_org m
   where m.org_id = p_org and m.ativo and m.recebe_contatos
     and (p_equipe is null or m.equipe_id = p_equipe)
     and not public.membro_ausente(p_org, m.user_id)
   order by m.ultima_distribuicao_em nulls first, m.criado_em
   limit 1;
$$;

-- Agrupa por pessoa e só depois confere quem está disponível (uma checagem por pessoa, não por mensagem).
create function public.vendedor_que_mais_atendeu(p_org uuid, p_contato uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select r.autor_id from (
    select m.autor_id, count(*) as n, max(m.criado_em) as ultima
      from public.mensagens m join public.conversas c on c.id = m.conversa_id
     where c.org_id = p_org and c.contato_id = p_contato
       and m.direcao = 'saida' and m.autor_tipo = 'atendente' and not coalesce(m.automatica, false)
       and m.status_entrega <> 'erro' and m.autor_id is not null
       and m.criado_em > now() - make_interval(days => (select o.distribuicao_janela_dias from public.organizacoes o where o.id = p_org))
     group by m.autor_id
  ) r
   where public.membro_disponivel(p_org, r.autor_id)
   order by r.n desc, r.ultima desc
   limit 1;
$$;

-- Ativo e não ausente (quem está atendendo a conversa pode ser alguém fora do rodízio, como o dono).
create function public.membro_presente(p_org uuid, p_usuario uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_usuario is not null
     and exists (select 1 from public.membros_org m where m.org_id = p_org and m.user_id = p_usuario and m.ativo)
     and not public.membro_ausente(p_org, p_usuario);
$$;

-- ============================================================================
-- A distribuição
-- ============================================================================
-- A mensagem do contato passa a ser o gatilho (antes era a criação da conversa, que não acontece quando o cliente
-- volta: conversas é única por número e contato).
drop trigger conversas_distribuir on public.conversas;
drop function public.conversas_distribuir();
drop function public.distribuir_contato(uuid);

-- p_mensagem: a mensagem do contato que chegou (confere se precisa distribuir e pode esperar a cidade).
-- Sem mensagem (cidade chegou, conversa passou para a equipe, cron): só distribui a conversa que está esperando, e
-- não espera mais. Devolve quem recebeu (nulo = não mudou).
--
-- Travas, sempre nesta ordem (revisão de 13/11): contato, depois a da empresa; conversa só com skip locked. O webhook
-- já chega com o contato e a conversa travados (contato_por_whatsapp, registrar_entrada); o agente, ao gravar a
-- cidade, chega com o contato. Assim os três caminhos não se esperam em círculo. A checagem barata vem antes das
-- travas: a mensagem que não precisa distribuir (a maioria) não pega a trava da empresa.
create function public.distribuir_contato(p_conversa uuid, p_mensagem uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_canal public.canais;
  v_ct public.contatos;
  v_msg public.mensagens;
  v_ciclo_novo boolean := false;
  v_inicio timestamptz;
  v_vendedor uuid;
  v_motivo text;
  v_rodizio boolean := false;
  v_cidade text;
  v_equipe uuid;
  v_nome text;
begin
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    return null;
  end if;
  select * into v_canal from public.canais where id = v_conv.canal_id;
  if not v_canal.distribuir or v_canal.responsavel_id is not null then
    -- O número deixou de distribuir: a espera perde o sentido (o cron não fica voltando nela).
    if v_conv.distribuir_pendente_em is not null then
      update public.conversas set distribuir_pendente_em = null
       where id in (select id from public.conversas where id = p_conversa for update skip locked);
    end if;
    return null;
  end if;

  if p_mensagem is null then
    if v_conv.distribuir_pendente_em is null then
      return null;
    end if;
  else
    select * into v_msg from public.mensagens where id = p_mensagem;
    v_ciclo_novo := not exists (
      select 1 from public.mensagens y join public.conversas c2 on c2.id = y.conversa_id
       where y.org_id = v_conv.org_id and c2.contato_id = v_conv.contato_id and y.id <> v_msg.id
         and y.autor_tipo <> 'sistema' and y.status_entrega <> 'erro'
         and y.criado_em > v_msg.criado_em - interval '30 days' and y.criado_em <= v_msg.criado_em);
    v_inicio := case when v_ciclo_novo then v_msg.criado_em
                     else (select max(oc.em) from public.origem_ciclos oc where oc.contato_id = v_conv.contato_id) end;
  end if;

  -- Duas vezes: sem trava (a maioria das mensagens sai aqui) e de novo depois das travas.
  for i in 1..2 loop
    if i = 2 then
      select * into v_ct from public.contatos where id = v_conv.contato_id for update;
      -- Dois contatos chegando juntos não caem na mesma pessoa.
      perform pg_advisory_xact_lock(hashtextextended('livih-distribuir:' || v_conv.org_id::text, 0));
      select * into v_conv from public.conversas where id = p_conversa;
    else
      select * into v_ct from public.contatos where id = v_conv.contato_id;
    end if;
    if p_mensagem is null then
      if v_conv.distribuir_pendente_em is null then
        return null;
      end if;
    elsif v_conv.distribuir_pendente_em is null
          and v_ct.distribuido_em is not null
          and (v_inicio is null or v_ct.distribuido_em >= v_inicio)
          and (public.membro_disponivel(v_conv.org_id, v_ct.responsavel_id)
               or (v_ct.responsavel_id = v_conv.atribuida_a and public.membro_presente(v_conv.org_id, v_ct.responsavel_id))) then
      return null;
    end if;
  end loop;

  -- 0. No meio do ciclo, quem está atendendo agora.
  if not v_ciclo_novo and public.membro_presente(v_conv.org_id, v_conv.atribuida_a) then
    v_vendedor := v_conv.atribuida_a;
    v_motivo := 'está atendendo a conversa';
  end if;

  -- 1. Quem mais atendeu.
  if v_vendedor is null then
    v_vendedor := public.vendedor_que_mais_atendeu(v_conv.org_id, v_ct.id);
    if v_vendedor is not null then
      v_motivo := format('quem mais atendeu nos últimos %s dias',
                         (select o.distribuicao_janela_dias from public.organizacoes o where o.id = v_conv.org_id));
    end if;
  end if;

  -- 2. A equipe da cidade.
  if v_vendedor is null then
    v_cidade := public.cidade_do_contato(v_ct.id);
    if v_cidade is not null then
      select ec.equipe_id into v_equipe from public.equipes_cidades ec
       where ec.org_id = v_conv.org_id and ec.chave = v_cidade;
      if v_equipe is not null then
        v_vendedor := public.vendedor_do_rodizio(v_conv.org_id, v_equipe);
        v_motivo := format('cidade %s, equipe %s',
                           (select ec.cidade from public.equipes_cidades ec where ec.org_id = v_conv.org_id and ec.chave = v_cidade),
                           (select e.nome from public.equipes e where e.id = v_equipe));
        v_rodizio := true;
      end if;
    elsif p_mensagem is not null
          and v_conv.estado = 'bot' and not v_ct.sem_agente
          and exists (select 1 from public.agentes a where a.canal_id = v_canal.id and a.ativo)
          and exists (select 1 from public.equipes_cidades ec where ec.org_id = v_conv.org_id) then
      -- Sem cidade e o agente atendendo: espera ele perguntar (até ~15 minutos, pelo cron).
      update public.conversas set distribuir_pendente_em = coalesce(distribuir_pendente_em, now())
       where id = v_conv.id;
      return null;
    end if;
  end if;

  -- 3. A equipe do número.
  if v_vendedor is null and v_canal.equipe_id is not null then
    v_vendedor := public.vendedor_do_rodizio(v_conv.org_id, v_canal.equipe_id);
    v_motivo := format('equipe do número, %s', (select e.nome from public.equipes e where e.id = v_canal.equipe_id));
    v_rodizio := true;
  end if;

  -- 4. Rodízio entre todos.
  if v_vendedor is null then
    v_vendedor := public.vendedor_do_rodizio(v_conv.org_id, null);
    v_motivo := 'rodízio do número da empresa';
    v_rodizio := true;
  end if;

  update public.conversas set distribuir_pendente_em = null
   where id in (select c.id from public.conversas c
                 where c.contato_id = v_ct.id and c.distribuir_pendente_em is not null
                   for update skip locked);
  if v_vendedor is null then
    -- Ninguém disponível: fica como está (o aviso de "aguardando" vai para todos que veem o número).
    return null;
  end if;

  update public.contatos set responsavel_id = v_vendedor, distribuido_em = now() where id = v_ct.id;
  if v_rodizio then
    update public.membros_org set ultima_distribuicao_em = now() where org_id = v_conv.org_id and user_id = v_vendedor;
  end if;
  -- Conversa em atendimento com outra pessoa (ausente, que saiu, ou de um ciclo antigo): passa para quem recebeu,
  -- senão as mensagens seguintes continuariam avisando só a pessoa antiga (revisão de 13/11).
  if v_conv.estado = 'humano' and v_conv.atribuida_a is distinct from v_vendedor then
    update public.conversas set atribuida_a = v_vendedor
     where id in (select id from public.conversas where id = v_conv.id for update skip locked);
  end if;
  if v_vendedor is distinct from v_ct.responsavel_id then
    select coalesce(nullif(btrim(p.nome), ''), 'a equipe') into v_nome from public.perfis p where p.user_id = v_vendedor;
    perform public.aviso_sistema(v_conv.id, format('Contato distribuído para %s (%s).', coalesce(v_nome, 'a equipe'), v_motivo));
    perform public.push_enfileirar(array[v_vendedor], v_conv.id, 'Contato para você',
                                   public.push_nome_contato(v_ct.id) || ' foi encaminhado para você.');
  end if;
  return v_vendedor;
end $$;

-- Os gatilhos nunca derrubam quem os disparou: a mensagem do cliente (webhook) e a cidade (agente) ficam gravadas
-- mesmo se a distribuição falhar; a próxima mensagem ou o cron refazem (revisão de 13/11).
create function public.mensagens_distribuir() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.autor_tipo = 'contato' and exists (
       select 1 from public.conversas c join public.canais cn on cn.id = c.canal_id
        where c.id = new.conversa_id and cn.distribuir and cn.responsavel_id is null) then
    begin
      perform public.distribuir_contato(new.conversa_id, new.id);
    exception when others then
      raise warning 'livih: distribuição falhou (conversa %): %', new.conversa_id, sqlerrm;
    end;
  end if;
  return null;
end $$;
create trigger mensagens_distribuir after insert on public.mensagens
for each row when (new.direcao = 'entrada') execute function public.mensagens_distribuir();

-- A cidade chegou (agente ou cliente ligado ao contato): distribui o que estava esperando.
create function public.contatos_distribuir_cidade() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
begin
  for v_conv in select c.id from public.conversas c
                 where c.contato_id = new.id and c.distribuir_pendente_em is not null loop
    if public.cidade_do_contato(new.id) is null then
      exit;
    end if;
    begin
      perform public.distribuir_contato(v_conv);
    exception when others then
      raise warning 'livih: distribuição falhou (conversa %): %', v_conv, sqlerrm;
    end;
  end loop;
  return null;
end $$;
create trigger contatos_distribuir_cidade after update of dados, cliente_id on public.contatos
for each row when (old.dados is distinct from new.dados or old.cliente_id is distinct from new.cliente_id)
execute function public.contatos_distribuir_cidade();

-- A conversa passou para a equipe antes da cidade: vai para a equipe do número.
create function public.conversas_distribuir_pendente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado <> 'bot' then
    begin
      perform public.distribuir_contato(new.id);
    exception when others then
      raise warning 'livih: distribuição falhou (conversa %): %', new.id, sqlerrm;
    end;
  end if;
  return null;
end $$;
create trigger conversas_distribuir_pendente after update of estado on public.conversas
for each row when (new.distribuir_pendente_em is not null and old.estado is distinct from new.estado)
execute function public.conversas_distribuir_pendente();

-- A cada minuto: quem esperou a cidade mais de 15 minutos. Cada conversa por si: um erro não segura as outras.
create function public.distribuir_pendentes() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
begin
  for v_conv in select id from public.conversas
                 where distribuir_pendente_em is not null and distribuir_pendente_em < now() - interval '15 minutes'
                 order by distribuir_pendente_em limit 200 loop
    begin
      perform public.distribuir_contato(v_conv);
    exception when others then
      raise warning 'livih: distribuição falhou (conversa %): %', v_conv, sqlerrm;
    end;
  end loop;
end $$;
select cron.schedule('livih-distribuir-pendentes', '* * * * *', 'select public.distribuir_pendentes()');

-- contatos tem update aberto para a equipe (contatos_editar): sem isto, o atendente gravaria distribuido_em no
-- futuro e fixaria o contato com ele, a carteira que a CEFEQ não quer (revisão de 13/11). Só as funções da Livih
-- (rodando como dono do banco) mudam a coluna.
create function public.contatos_proteger_distribuido_em() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.distribuido_em := null;
    else
      new.distribuido_em := old.distribuido_em;
    end if;
  end if;
  return new;
end $$;
create trigger contatos_proteger_distribuido_em before insert or update of distribuido_em on public.contatos
for each row execute function public.contatos_proteger_distribuido_em();

-- ============================================================================
-- Avisos no celular: ausente não recebe
-- ============================================================================
-- Igual a 20261009160000, sem os ausentes.
create or replace function public.push_equipe_do_canal(p_canal uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.user_id), '{}')
    from public.canais c
    join public.membros_org m on m.org_id = c.org_id and m.ativo
   where c.id = p_canal
     and (c.responsavel_id is null or c.responsavel_id = m.user_id or m.papel in ('dono', 'admin'))
     and not public.membro_ausente(c.org_id, m.user_id);
$$;

-- Igual a 20261105160000: o vendedor do contato, se ativo e não ausente; senão, todos que veem o número.
create or replace function public.push_destino_conversa(p_conversa uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select array[ct.responsavel_id]
       from public.conversas c
       join public.canais cn on cn.id = c.canal_id and cn.distribuir
       join public.contatos ct on ct.id = c.contato_id
       join public.membros_org m on m.org_id = c.org_id and m.user_id = ct.responsavel_id and m.ativo
      where c.id = p_conversa and not public.membro_ausente(c.org_id, ct.responsavel_id)),
    public.push_equipe_do_canal((select canal_id from public.conversas where id = p_conversa)));
$$;

-- ============================================================================
-- Configuração
-- ============================================================================
-- Ausência: dono e admin em qualquer pessoa; o gestor nas pessoas da equipe dele.
create function public.membro_definir_ausencia(p_org uuid, p_usuario uuid, p_ausente boolean, p_ate date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes public.membros_org;
begin
  if not public.eh_membro(p_org)
     or not (public.tem_papel(p_org, '{dono,admin}') or public.gestor_ve(p_org, p_usuario)) then
    raise exception 'Só dono, admin ou o gestor da equipe marcam a ausência desta pessoa.';
  end if;
  if coalesce(p_ausente, false) and p_ate is not null and p_ate < public.hoje_brasilia() then
    raise exception 'A data de volta já passou. Escolha hoje ou um dia depois.';
  end if;
  select * into v_antes from public.membros_org where org_id = p_org and user_id = p_usuario;
  if v_antes.user_id is null then
    raise exception 'Pessoa não encontrada na equipe.';
  end if;
  update public.membros_org
     set ausente = coalesce(p_ausente, false),
         ausente_ate = case when coalesce(p_ausente, false) then p_ate end
   where org_id = p_org and user_id = p_usuario;
  perform public.auditar(p_org, 'membro_ausencia', 'membros_org', p_usuario::text,
                         jsonb_build_object('ausente', v_antes.ausente, 'ate', v_antes.ausente_ate),
                         jsonb_build_object('ausente', coalesce(p_ausente, false),
                                            'ate', case when coalesce(p_ausente, false) then p_ate end));
end $$;

create function public.canal_definir_equipe(p_canal uuid, p_equipe uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_canal public.canais;
begin
  select * into v_canal from public.canais where id = p_canal;
  if v_canal.id is null or not public.tem_papel(v_canal.org_id, '{dono,admin}') then
    raise exception 'Só dono e admin escolhem a equipe que recebe os contatos do número.';
  end if;
  if p_equipe is not null and not exists (select 1 from public.equipes where id = p_equipe and org_id = v_canal.org_id) then
    raise exception 'Equipe não encontrada.';
  end if;
  update public.canais set equipe_id = p_equipe where id = p_canal;
  perform public.auditar(v_canal.org_id, 'canal_equipe', 'canais', p_canal::text,
                         jsonb_build_object('equipe_id', v_canal.equipe_id), jsonb_build_object('equipe_id', p_equipe));
end $$;

-- Lista completa das cidades da equipe (substitui a anterior). Uma cidade só pode estar em uma equipe.
create function public.equipe_definir_cidades(p_equipe uuid, p_cidades text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_eq public.equipes;
  v_cidade text;
  v_outra text;
  v_antes jsonb;
begin
  select * into v_eq from public.equipes where id = p_equipe;
  if v_eq.id is null or not public.tem_papel(v_eq.org_id, '{dono,admin}') then
    raise exception 'Só dono e admin mudam as equipes.';
  end if;
  if cardinality(p_cidades) > 200 then
    raise exception 'No máximo 200 cidades por equipe.';
  end if;
  foreach v_cidade in array coalesce(p_cidades, '{}') loop
    if length(btrim(v_cidade)) > 100 then
      raise exception 'Nome de cidade muito longo: %.', left(btrim(v_cidade), 40);
    end if;
    select e.nome into v_outra from public.equipes_cidades ec join public.equipes e on e.id = ec.equipe_id
     where ec.org_id = v_eq.org_id and ec.chave = public.cidade_chave(v_cidade) and ec.equipe_id <> p_equipe;
    if v_outra is not null then
      raise exception 'A cidade % já é da equipe %. Tire de lá antes.', btrim(v_cidade), v_outra;
    end if;
  end loop;
  select coalesce(jsonb_agg(cidade order by cidade), '[]') into v_antes from public.equipes_cidades where equipe_id = p_equipe;
  delete from public.equipes_cidades where equipe_id = p_equipe;
  begin
    insert into public.equipes_cidades (org_id, equipe_id, cidade, chave)
    select distinct on (public.cidade_chave(c)) v_eq.org_id, p_equipe, btrim(c), public.cidade_chave(c)
      from unnest(coalesce(p_cidades, '{}')) c
     where public.cidade_chave(c) is not null
     order by public.cidade_chave(c), btrim(c);
  exception when unique_violation then
    -- Outra pessoa salvou a mesma cidade em outra equipe ao mesmo tempo.
    raise exception 'Uma dessas cidades acabou de ser colocada em outra equipe. Recarregue a tela e confira.';
  end;
  perform public.auditar(v_eq.org_id, 'equipe_cidades', 'equipes', p_equipe::text, jsonb_build_object('cidades', v_antes),
                         jsonb_build_object('cidades', (select coalesce(jsonb_agg(cidade order by cidade), '[]')
                                                          from public.equipes_cidades where equipe_id = p_equipe)));
end $$;

create function public.org_definir_janela_distribuicao(p_org uuid, p_dias integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'Só dono e admin mudam a distribuição dos contatos.';
  end if;
  if p_dias is null or p_dias not between 7 and 365 then
    raise exception 'Escolha entre 7 e 365 dias.';
  end if;
  perform public.auditar(p_org, 'distribuicao_janela', 'organizacoes', p_org::text,
                         jsonb_build_object('dias', (select distribuicao_janela_dias from public.organizacoes where id = p_org)),
                         jsonb_build_object('dias', p_dias));
  update public.organizacoes set distribuicao_janela_dias = p_dias where id = p_org;
end $$;

-- ============================================================================
-- Permissões
-- ============================================================================
revoke execute on function public.hoje_brasilia(), public.membro_ausente(uuid, uuid), public.membro_disponivel(uuid, uuid),
  public.cidade_chave(text), public.cidade_do_contato(uuid), public.vendedor_do_rodizio(uuid, uuid),
  public.vendedor_que_mais_atendeu(uuid, uuid), public.distribuir_contato(uuid, uuid), public.mensagens_distribuir(),
  public.contatos_distribuir_cidade(), public.conversas_distribuir_pendente(), public.distribuir_pendentes(),
  public.membro_presente(uuid, uuid), public.contatos_proteger_distribuido_em()
from public, anon, authenticated;

revoke execute on function public.membro_definir_ausencia(uuid, uuid, boolean, date), public.canal_definir_equipe(uuid, uuid),
  public.equipe_definir_cidades(uuid, text[]), public.org_definir_janela_distribuicao(uuid, integer)
from public, anon;
grant execute on function public.membro_definir_ausencia(uuid, uuid, boolean, date), public.canal_definir_equipe(uuid, uuid),
  public.equipe_definir_cidades(uuid, text[]), public.org_definir_janela_distribuicao(uuid, integer)
to authenticated;
