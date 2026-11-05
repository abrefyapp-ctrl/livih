-- Follow-up do agente: retomar o cliente que parou de responder (docs/crm-acompanhamento.md, entrega 2; decisões de
-- 05/11).
--
-- Quatro casos (cada um liga e desliga por empresa, com o tempo de espera):
--   - orçamento sem resposta: o PDF do orçamento saiu depois da última mensagem do cliente e o pedido segue rascunho;
--   - conversa parada: a última mensagem é nossa (do agente; da equipe também, se a empresa quiser);
--   - oportunidade parada: oportunidade aberta sem mensagem nenhuma há X dias;
--   - o cliente pediu para falar depois: ferramenta do agente agendar_retorno (ou a equipe cria "o agente retoma").
-- A retomada é uma tarefa do agente (tarefas.executor = 'agente'): a equipe vê na lista e pode cancelar.
--
-- Como sai: dentro das 24 h do WhatsApp (ou no WAHA, a qualquer hora), a Edge Function agente-followup escreve UMA
-- mensagem curta no tom do agente, ou decide não mandar; fora das 24 h no número da API oficial, vai o modelo aprovado
-- que a empresa escolheu (sem modelo, a retomada passa para a equipe). Duas tentativas; sem resposta, vira tarefa para
-- o vendedor. O cliente respondeu (ou alguém da equipe escreveu): as retomadas abertas daquele contato fecham.
--
-- Cuidados: só entra o que parou DEPOIS de a empresa ligar a retomada (ligar não dispara mensagem para conversas
-- antigas); uma retomada aberta por contato; no máximo uma retomada enviada por contato a cada 20 h; só no horário de
-- atendimento do agente; nunca para contato descadastrado ou "sem agente"; quem já tem próximo passo marcado pela
-- equipe não é retomado.

-- ============================================================================
-- Configuração por empresa
-- ============================================================================
create table public.agente_followup (
  org_id uuid primary key references public.organizacoes (id) on delete cascade,
  ativo boolean not null default false,
  -- Quando foi ligada: só conversas e oportunidades paradas depois disso são retomadas.
  ativado_em timestamptz,
  -- Horas (ou dias) de espera de cada caso; nulo = caso desligado.
  orcamento_horas integer default 24 check (orcamento_horas between 1 and 720),
  conversa_horas integer default 24 check (conversa_horas between 1 and 720),
  oportunidade_dias integer default 3 check (oportunidade_dias between 1 and 90),
  -- Também retoma conversas em que a última mensagem foi da equipe (o vendedor é avisado).
  equipe boolean not null default true,
  -- O agente pode combinar com o cliente uma data para retomar (agendar_retorno).
  pedido_cliente boolean not null default true,
  -- Dias entre a 1ª e a 2ª tentativa, e da 2ª até a tarefa do vendedor.
  intervalo_dias integer not null default 2 check (intervalo_dias between 1 and 30),
  -- Modelo da API oficial para fora das 24 h, no formato das campanhas:
  -- {nome, idioma, categoria, cabecalho, corpo, rodape, variaveis: [{fonte: 'nome'|'empresa'|'fixo', valor}]}.
  modelo jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);
comment on table public.agente_followup is 'Retomada do cliente pelo agente (follow-up), por empresa';
alter table public.agente_followup enable row level security;
create policy agente_followup_ver on public.agente_followup for select to authenticated using (public.eh_membro(org_id));
grant select on public.agente_followup to authenticated;

-- Dono e admin salvam. p_cfg: as colunas acima (menos as de controle).
create function public.followup_salvar(p_org uuid, p_cfg jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_modelo jsonb := nullif(p_cfg -> 'modelo', 'null'::jsonb);
  v_n integer;
  v_var jsonb;
  v_ativo boolean := coalesce((p_cfg ->> 'ativo')::boolean, false);
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin mudam a retomada do agente';
  end if;
  if v_modelo is not null then
    if coalesce(v_modelo ->> 'nome', '') !~ '^[a-z0-9_]+$' or coalesce(v_modelo ->> 'idioma', '') !~ '^[a-z]{2}(_[A-Z]{2})?$'
       or coalesce(btrim(v_modelo ->> 'corpo'), '') = '' then
      raise exception 'modelo inválido';
    end if;
    select count(distinct m[1]) into v_n from regexp_matches(v_modelo ->> 'corpo', '\{\{\s*(\d+)\s*\}\}', 'g') m;
    if jsonb_array_length(coalesce(v_modelo -> 'variaveis', '[]')) <> v_n then
      raise exception 'preencha todas as variáveis do modelo';
    end if;
    for v_var in select * from jsonb_array_elements(coalesce(v_modelo -> 'variaveis', '[]')) loop
      if v_var ->> 'fonte' not in ('nome', 'empresa', 'fixo')
         or (v_var ->> 'fonte' = 'fixo' and coalesce(btrim(v_var ->> 'valor'), '') = '') then
        raise exception 'preencha todas as variáveis do modelo';
      end if;
    end loop;
  end if;

  insert into public.agente_followup as f (org_id, ativo, ativado_em, orcamento_horas, conversa_horas, oportunidade_dias,
                                           equipe, pedido_cliente, intervalo_dias, modelo, atualizado_em, atualizado_por)
  values (p_org, v_ativo, case when v_ativo then now() end,
          (p_cfg ->> 'orcamento_horas')::integer, (p_cfg ->> 'conversa_horas')::integer, (p_cfg ->> 'oportunidade_dias')::integer,
          coalesce((p_cfg ->> 'equipe')::boolean, true), coalesce((p_cfg ->> 'pedido_cliente')::boolean, true),
          coalesce((p_cfg ->> 'intervalo_dias')::integer, 2), v_modelo, now(), auth.uid())
  on conflict (org_id) do update set
    ativo = excluded.ativo,
    -- Religar conta do zero: o que parou enquanto estava desligada não é retomado.
    ativado_em = case when excluded.ativo and not f.ativo then now() when excluded.ativo then f.ativado_em end,
    orcamento_horas = excluded.orcamento_horas, conversa_horas = excluded.conversa_horas,
    oportunidade_dias = excluded.oportunidade_dias, equipe = excluded.equipe, pedido_cliente = excluded.pedido_cliente,
    intervalo_dias = excluded.intervalo_dias, modelo = excluded.modelo, atualizado_em = now(), atualizado_por = auth.uid();

  -- Desligar cancela as retomadas que o agente ainda faria.
  if not v_ativo then
    update public.tarefas set status = 'cancelada', resultado = 'Não enviada: a retomada pelo agente foi desligada'
     where org_id = p_org and executor = 'agente' and status = 'aberta';
  end if;
end $$;
revoke execute on function public.followup_salvar(uuid, jsonb) from public, anon;
grant execute on function public.followup_salvar(uuid, jsonb) to authenticated;

-- ============================================================================
-- Tarefas: o que a retomada precisa guardar
-- ============================================================================
alter table public.tarefas
  add column followup_motivo text check (followup_motivo in ('orcamento', 'conversa', 'oportunidade', 'pedido_cliente',
                                                              'manual', 'sem_resposta')),
  add column tentativa smallint check (tentativa between 1 and 2),
  -- O que originou a retomada ("msg:<id>", "op:<id>:<id>"): a mesma parada não é retomada duas vezes.
  add column followup_ref text,
  add column mensagem_id uuid references public.mensagens (id) on delete set null,
  -- A Edge Function está escrevendo (a rodada seguinte não pega a mesma tarefa).
  add column enviando_em timestamptz;
comment on column public.tarefas.followup_motivo is
  'Retomada (follow-up): por que foi criada. sem_resposta = tarefa do vendedor depois das 2 tentativas do agente';
create unique index tarefas_uma_retomada_aberta on public.tarefas (contato_id) where executor = 'agente' and status = 'aberta';
create index tarefas_followup_ref_idx on public.tarefas (contato_id, followup_ref) where followup_ref is not null;
create index tarefas_retomadas_vencidas_idx on public.tarefas (vence_em) where executor = 'agente' and status = 'aberta';

-- A retomada criada à mão pela equipe ("o agente retoma") é a primeira tentativa.
create function public.tarefas_retomada_manual() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.executor = 'agente' then
    new.followup_motivo := coalesce(new.followup_motivo, 'manual');
    new.tentativa := coalesce(new.tentativa, 1);
    new.responsavel_id := null;
    new.lembrete_minutos := null;
  end if;
  return new;
end $$;
create trigger tarefas_retomada_manual before insert on public.tarefas
for each row execute function public.tarefas_retomada_manual();
revoke execute on function public.tarefas_retomada_manual() from public, anon, authenticated;

-- ============================================================================
-- O cliente respondeu (ou a equipe escreveu): as retomadas daquele contato fecham
-- ============================================================================
create function public.followup_fechar_por_mensagem() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_contato uuid;
begin
  select contato_id into v_contato from public.conversas where id = new.conversa_id;
  if new.direcao = 'entrada' then
    update public.tarefas set status = 'feita', resultado = 'O cliente respondeu', enviando_em = null
     where contato_id = v_contato and status = 'aberta' and followup_motivo is not null;
  else
    -- A equipe escreveu ao cliente: as retomadas que o agente faria perdem o sentido.
    update public.tarefas set status = 'cancelada', resultado = 'A equipe escreveu ao cliente antes', enviando_em = null
     where contato_id = v_contato and status = 'aberta' and executor = 'agente';
  end if;
  return null;
end $$;
create trigger mensagens_fechar_retomadas after insert on public.mensagens
for each row when ((new.direcao = 'entrada' and not new.automatica)
                   or (new.direcao = 'saida' and new.autor_tipo = 'atendente' and new.modelo is null))
execute function public.followup_fechar_por_mensagem();
revoke execute on function public.followup_fechar_por_mensagem() from public, anon, authenticated;

-- ============================================================================
-- Peças da rodada
-- ============================================================================
-- Quem da equipe cuida do contato: o vendedor da oportunidade, quem atende a conversa, o dono do número ou o da
-- carteira (o primeiro que ainda é da equipe).
create function public.followup_responsavel(p_contato uuid, p_oportunidade uuid, p_conversa uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select u from (values
    (1, (select responsavel_id from public.oportunidades where id = p_oportunidade)),
    (2, (select atribuida_a from public.conversas where id = p_conversa)),
    (3, (select cn.responsavel_id from public.conversas c join public.canais cn on cn.id = c.canal_id where c.id = p_conversa)),
    (4, (select responsavel_id from public.contatos where id = p_contato))
  ) x(o, u)
   where u is not null
     and exists (select 1 from public.membros_org m join public.contatos ct on ct.org_id = m.org_id
                  where ct.id = p_contato and m.user_id = x.u and m.ativo)
   order by o limit 1;
$$;

-- A retomada não pôde sair pelo agente: cancela e cria a tarefa para a pessoa (que também fecha se o cliente
-- responder, por ter followup_motivo).
create function public.followup_para_equipe(p_tarefa uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.tarefas;
begin
  update public.tarefas set status = 'cancelada', resultado = left('Passou para a equipe: ' || p_motivo, 500), enviando_em = null
   where id = p_tarefa and status = 'aberta'
  returning * into t;
  if t.id is null then
    return;
  end if;
  insert into public.tarefas (org_id, titulo, observacao, vence_em, executor, responsavel_id, contato_id, oportunidade_id,
                              conversa_id, followup_motivo, followup_ref, lembrete_minutos)
  values (t.org_id, left(t.titulo || ' (o agente não pôde)', 200),
          left('O agente não retomou porque ' || p_motivo || '.' || coalesce(E'\n' || t.observacao, ''), 2000),
          now(), 'equipe', public.followup_responsavel(t.contato_id, t.oportunidade_id, t.conversa_id), t.contato_id,
          t.oportunidade_id, t.conversa_id, t.followup_motivo, t.followup_ref, 0);
end $$;

-- Depois de enviar: a 2ª tentativa ou, depois dela, a tarefa do vendedor.
create function public.followup_proxima(p_tarefa uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.tarefas;
  v_dias integer;
begin
  select * into t from public.tarefas where id = p_tarefa;
  select intervalo_dias into v_dias from public.agente_followup where org_id = t.org_id;
  v_dias := coalesce(v_dias, 2);
  if coalesce(t.tentativa, 1) < 2 then
    insert into public.tarefas (org_id, titulo, observacao, vence_em, executor, contato_id, oportunidade_id, conversa_id,
                                followup_motivo, tentativa, followup_ref)
    values (t.org_id, t.titulo, t.observacao, now() + make_interval(days => v_dias), 'agente', t.contato_id,
            t.oportunidade_id, t.conversa_id, t.followup_motivo, 2, t.followup_ref)
    on conflict do nothing;
  else
    insert into public.tarefas (org_id, titulo, observacao, vence_em, executor, responsavel_id, contato_id, oportunidade_id,
                                conversa_id, followup_motivo, followup_ref, lembrete_minutos)
    values (t.org_id, 'O cliente não respondeu às 2 retomadas do agente',
            'Decida o próximo passo: ligar, mandar outra proposta ou encerrar a oportunidade.',
            now() + make_interval(days => v_dias), 'equipe',
            public.followup_responsavel(t.contato_id, t.oportunidade_id, t.conversa_id), t.contato_id, t.oportunidade_id,
            t.conversa_id, 'sem_resposta', t.followup_ref, 0);
  end if;
end $$;

-- Marca a retomada como enviada: aviso na conversa (só a equipe vê), aviso no celular de quem atende a conversa
-- (quando ela está com a equipe) e a próxima tentativa.
create function public.followup_registrar_envio(p_tarefa uuid, p_conversa uuid, p_mensagem uuid, p_texto text, p_resultado text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t public.tarefas;
  v_conv public.conversas;
begin
  update public.tarefas set status = 'feita', resultado = p_resultado, mensagem_id = p_mensagem, enviando_em = null,
                            conversa_id = p_conversa
   where id = p_tarefa
  returning * into t;
  select * into v_conv from public.conversas where id = p_conversa;
  perform public.aviso_sistema(p_conversa,
    format('Retomada do agente (%s de 2): %s. Se o cliente responder, a conversa segue %s.',
           coalesce(t.tentativa, 1), lower(t.titulo),
           case when v_conv.estado = 'bot' then 'com o agente' else 'com a equipe' end));
  if v_conv.estado <> 'bot' and v_conv.atribuida_a is not null then
    insert into public.push_fila (user_id, titulo, corpo, url, conversa_id)
    values (v_conv.atribuida_a, 'O agente retomou uma conversa sua',
            left(coalesce((select coalesce(nome, nome_whatsapp) from public.contatos where id = v_conv.contato_id), 'Cliente')
                 || ': ' || p_texto, 180),
            '/conversas/' || p_conversa, p_conversa);
  end if;
  perform public.followup_proxima(p_tarefa);
end $$;

-- Fora das 24 h no número da API oficial: o modelo configurado, com as variáveis preenchidas como nas campanhas.
create function public.followup_enviar_modelo(p_tarefa uuid, p_conversa uuid, p_modelo jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_params text[];
  v_texto text;
  v_msg uuid;
begin
  select * into v_conv from public.conversas where id = p_conversa;
  v_params := public.campanha_parametros(p_modelo, v_conv.contato_id);
  v_texto := concat_ws(E'\n\n',
    nullif('*' || nullif(btrim(p_modelo ->> 'cabecalho'), '') || '*', '**'),
    regexp_replace(p_modelo ->> 'corpo', '\{\{\s*(\d+)\s*\}\}', '§\1§', 'g'),
    nullif('_' || nullif(btrim(p_modelo ->> 'rodape'), '') || '_', '__'));
  for i in 1 .. coalesce(array_length(v_params, 1), 0) loop
    v_texto := replace(v_texto, '§' || i || '§', v_params[i]);
  end loop;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, status_entrega, modelo)
  values (v_conv.org_id, p_conversa, 'saida', 'bot', 'texto', v_texto, 'pendente',
          jsonb_build_object('nome', p_modelo ->> 'nome', 'idioma', p_modelo ->> 'idioma', 'parametros', to_jsonb(v_params)))
  returning id into v_msg;
  insert into public.fila_envio (org_id, conversa_id, mensagem_id) values (v_conv.org_id, p_conversa, v_msg);
  update public.conversas set ultima_mensagem_em = now(), ultima_mensagem_resumo = left(v_texto, 140) where id = p_conversa;
  perform public.followup_registrar_envio(p_tarefa, p_conversa, v_msg, v_texto, 'Modelo de retomada enviado (fora das 24 horas)');
end $$;

-- ============================================================================
-- Detecção dos casos
-- ============================================================================
create function public.followup_detectar() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer := 0;
  v_k integer;
begin
  -- Orçamento sem resposta e conversa parada: a última mensagem de verdade (sem avisos e sem respostas automáticas
  -- do celular) é nossa, saiu depois de a retomada ser ligada e espera há mais que o tempo do caso.
  insert into public.tarefas (org_id, titulo, vence_em, executor, contato_id, conversa_id, oportunidade_id,
                              followup_motivo, tentativa, followup_ref)
  select x.org_id, x.titulo, now(), 'agente', x.contato_id, x.conversa_id, x.oportunidade_id, x.motivo, 1, x.ref
    from (
      select c.org_id, c.contato_id, c.id as conversa_id,
             (select o.id from public.oportunidades o where o.contato_id = c.contato_id and o.fechada_em is null
               order by o.atualizado_em desc limit 1) as oportunidade_id,
             case when orc.sim then 'orcamento' else 'conversa' end as motivo,
             case when orc.sim then 'Retomar o orçamento sem resposta' else 'Retomar a conversa parada' end as titulo,
             'msg:' || u.id as ref
        from public.conversas c
        join public.agente_followup f on f.org_id = c.org_id and f.ativo
        join public.organizacoes og on og.id = c.org_id and og.status = 'ativa'
        join public.agentes a on a.canal_id = c.canal_id and a.ativo
        join public.contatos ct on ct.id = c.contato_id and not ct.sem_agente and ct.descadastrado_em is null
        cross join lateral (select m.id, m.direcao, m.autor_tipo, m.criado_em from public.mensagens m
                             where m.conversa_id = c.id and m.autor_tipo <> 'sistema' and not m.automatica
                             order by m.criado_em desc limit 1) u
        cross join lateral (select max(m.criado_em) as em from public.mensagens m
                             where m.conversa_id = c.id and m.direcao = 'entrada' and not m.automatica) e
        cross join lateral (select exists (select 1 from public.mensagens m
                                            where m.conversa_id = c.id and m.direcao = 'saida' and m.tipo = 'documento'
                                              and m.midia_nome ilike 'orcamento%' and m.criado_em > coalesce(e.em, '-infinity'))
                                   and exists (select 1 from public.pedidos p
                                                where p.contato_id = c.contato_id and p.status = 'rascunho') as sim) orc
       where c.estado <> 'encerrada'
         and e.em is not null
         and u.direcao = 'saida' and (u.autor_tipo = 'bot' or (u.autor_tipo = 'atendente' and f.equipe))
         and u.criado_em >= f.ativado_em
         and ((orc.sim and f.orcamento_horas is not null and u.criado_em < now() - make_interval(hours => f.orcamento_horas))
           or (not orc.sim and f.conversa_horas is not null and u.criado_em < now() - make_interval(hours => f.conversa_horas)))
    ) x
   where not exists (select 1 from public.tarefas t where t.contato_id = x.contato_id and t.followup_ref = x.ref)
     and not exists (select 1 from public.tarefas t where t.contato_id = x.contato_id and t.status = 'aberta'
                      and (t.executor = 'agente' or t.followup_motivo is null))
  on conflict do nothing;
  get diagnostics v_k = row_count;
  v_n := v_n + v_k;

  -- Oportunidade parada: aberta, sem nenhuma mensagem (de nenhum lado) há X dias, com a última depois de ligar.
  insert into public.tarefas (org_id, titulo, vence_em, executor, contato_id, conversa_id, oportunidade_id,
                              followup_motivo, tentativa, followup_ref)
  select o.org_id, left('Retomar a oportunidade: ' || o.titulo, 200), now(), 'agente', o.contato_id, cv.id, o.id,
         'oportunidade', 1, 'op:' || o.id || ':' || ul.id
    from public.oportunidades o
    join public.etapas_funil e on e.id = o.etapa_id and e.tipo = 'aberta'
    join public.agente_followup f on f.org_id = o.org_id and f.ativo and f.oportunidade_dias is not null
    join public.organizacoes og on og.id = o.org_id and og.status = 'ativa'
    join public.contatos ct on ct.id = o.contato_id and not ct.sem_agente and ct.descadastrado_em is null
    cross join lateral (select c.id from public.conversas c join public.agentes a on a.canal_id = c.canal_id and a.ativo
                         where c.contato_id = o.contato_id and c.estado <> 'encerrada'
                         order by c.ultima_mensagem_em desc nulls last limit 1) cv
    cross join lateral (select m.id, m.criado_em from public.mensagens m join public.conversas c2 on c2.id = m.conversa_id
                         where c2.contato_id = o.contato_id and m.autor_tipo <> 'sistema' and not m.automatica
                         order by m.criado_em desc limit 1) ul
   where o.fechada_em is null
     and ul.criado_em >= f.ativado_em
     and ul.criado_em < now() - make_interval(days => f.oportunidade_dias)
     and not exists (select 1 from public.tarefas t where t.contato_id = o.contato_id and t.followup_ref = 'op:' || o.id || ':' || ul.id)
     and not exists (select 1 from public.tarefas t where t.contato_id = o.contato_id and t.status = 'aberta'
                      and (t.executor = 'agente' or t.followup_motivo is null))
  on conflict do nothing;
  get diagnostics v_k = row_count;
  return v_n + v_k;
end $$;

-- ============================================================================
-- Rodada (cron a cada 5 minutos)
-- ============================================================================
create function public.followup_rodar() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  t public.tarefas;
  v_f public.agente_followup;
  v_ct public.contatos;
  v_conv public.conversas;
  v_canal public.canais;
  v_ag public.agentes;
  v_motivo text;
  v_entrada timestamptz;
  v_total integer := 0;
begin
  perform public.followup_detectar();

  for t in
    select tf.* from public.tarefas tf
     where tf.executor = 'agente' and tf.status = 'aberta' and tf.vence_em <= now()
       and (tf.enviando_em is null or tf.enviando_em < now() - interval '10 minutes')
     order by tf.vence_em
     limit 30
     for update skip locked
  loop
    select * into v_f from public.agente_followup where org_id = t.org_id;
    select * into v_ct from public.contatos where id = t.contato_id;
    -- A conversa da tarefa, se o agente estiver ligado naquele número; senão a mais recente com o agente ligado.
    v_conv := null;
    select c.* into v_conv from public.conversas c join public.agentes a on a.canal_id = c.canal_id and a.ativo
     where c.contato_id = t.contato_id
     order by (c.id = t.conversa_id) desc, c.ultima_mensagem_em desc nulls last
     limit 1;

    v_motivo := case
      when v_f.org_id is null or not v_f.ativo then 'a retomada pelo agente está desligada'
      when (select status from public.organizacoes where id = t.org_id) <> 'ativa' then 'a empresa não está ativa'
      when v_ct.sem_agente then 'o contato está marcado para não ser atendido pelo agente'
      when v_ct.descadastrado_em is not null then 'o contato pediu para não receber mensagens'
      when v_conv.id is null then 'não há conversa num número com o agente ligado'
    end;
    if v_motivo is not null then
      update public.tarefas set status = 'cancelada', resultado = left('Não enviada: ' || v_motivo, 500), enviando_em = null
       where id = t.id;
      continue;
    end if;

    select * into v_ag from public.agentes where canal_id = v_conv.canal_id;
    select * into v_canal from public.canais where id = v_conv.canal_id;
    -- Fora do horário do agente ou número desconectado: tenta de novo mais tarde.
    if not public.agente_no_horario(v_ag.horario, now()) then
      update public.tarefas set vence_em = now() + interval '30 minutes' where id = t.id;
      continue;
    end if;
    if not v_canal.ativo or (v_canal.tipo = 'waha' and v_canal.status_conexao is distinct from 'WORKING') then
      update public.tarefas set vence_em = now() + interval '1 hour' where id = t.id;
      continue;
    end if;
    -- No máximo uma retomada enviada por contato a cada 20 h.
    if exists (select 1 from public.tarefas x where x.contato_id = t.contato_id and x.executor = 'agente'
                and x.mensagem_id is not null and x.concluida_em > now() - interval '20 hours') then
      update public.tarefas set vence_em = now() + interval '20 hours' where id = t.id;
      continue;
    end if;
    if public.agente_franquia_esgotada(v_conv.id) then
      perform public.followup_para_equipe(t.id, 'os atendimentos do agente deste mês acabaram');
      continue;
    end if;

    select max(criado_em) into v_entrada from public.mensagens
     where conversa_id = v_conv.id and direcao = 'entrada' and not automatica;
    if v_canal.tipo = 'meta' and (v_entrada is null or v_entrada < now() - interval '23 hours 30 minutes') then
      if v_f.modelo is null then
        perform public.followup_para_equipe(t.id, 'passaram as 24 horas do WhatsApp e não há modelo de retomada configurado');
      else
        perform public.followup_enviar_modelo(t.id, v_conv.id, v_f.modelo);
        v_total := v_total + 1;
      end if;
      continue;
    end if;

    -- O agente escreve: a Edge Function lê a conversa e chama agente_followup_concluir.
    update public.tarefas set enviando_em = now(), conversa_id = v_conv.id where id = t.id;
    perform public.chamar_funcao('agente-followup', jsonb_build_object('tarefa_id', t.id));
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

-- ============================================================================
-- Edge Function agente-followup
-- ============================================================================
-- O que a função precisa para escrever: o contexto do agente, o motivo e a tentativa. valido = false se a tarefa
-- fechou nesse meio tempo (o cliente respondeu).
create function public.agente_followup_dados(p_tarefa uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tarefas;
begin
  select * into t from public.tarefas where id = p_tarefa;
  if t.id is null or t.status <> 'aberta' or t.executor <> 'agente' or t.enviando_em is null or t.conversa_id is null then
    return jsonb_build_object('valido', false);
  end if;
  return jsonb_build_object(
    'valido', true,
    'org_id', t.org_id,
    'conversa_id', t.conversa_id,
    'motivo', t.followup_motivo,
    'tentativa', coalesce(t.tentativa, 1),
    'titulo', t.titulo,
    'observacao', t.observacao,
    'oportunidade', (select jsonb_build_object('titulo', o.titulo, 'resumo', o.resumo, 'etapa', e.nome)
                       from public.oportunidades o join public.etapas_funil e on e.id = o.etapa_id
                      where o.id = t.oportunidade_id),
    'orcamento', (select jsonb_build_object('numero', p.numero, 'total', p.total) from public.pedidos p
                   where p.contato_id = t.contato_id and p.status = 'rascunho' order by p.atualizado_em desc limit 1),
    'contexto', public.agente_contexto(t.conversa_id, 30)
  );
end $$;

-- Resultado da Edge Function: p_texto = a mensagem; nulo = o agente avaliou que não era hora; p_erro = falhou (tenta
-- de novo em 1 hora).
create function public.agente_followup_concluir(p_tarefa uuid, p_texto text, p_erro text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.tarefas;
  v_msg uuid;
begin
  select * into t from public.tarefas where id = p_tarefa for update;
  if t.id is null or t.status <> 'aberta' or t.enviando_em is null then
    return jsonb_build_object('enviado', false, 'motivo', 'a retomada fechou enquanto o agente escrevia');
  end if;
  if p_erro is not null then
    update public.tarefas set enviando_em = null, vence_em = now() + interval '1 hour',
                              resultado = left('Falhou ao escrever, nova tentativa em 1 hora: ' || p_erro, 500)
     where id = p_tarefa;
    return jsonb_build_object('enviado', false, 'motivo', 'erro');
  end if;
  if coalesce(btrim(p_texto), '') = '' then
    update public.tarefas set status = 'feita', enviando_em = null,
                              resultado = 'Não enviada: o agente avaliou que a conversa já tinha terminado'
     where id = p_tarefa;
    return jsonb_build_object('enviado', false, 'motivo', 'não precisava');
  end if;
  v_msg := public.enfileirar_saida(t.conversa_id, left(btrim(p_texto), 1000), 'bot', null);
  perform public.followup_registrar_envio(p_tarefa, t.conversa_id, v_msg, btrim(p_texto), 'Retomada enviada pelo agente');
  return jsonb_build_object('enviado', true, 'mensagem_id', v_msg);
end $$;

-- ============================================================================
-- Ferramenta do agente: o cliente pediu para falar depois
-- ============================================================================
-- p_quando: "AAAA-MM-DD" (às 9 h) ou "AAAA-MM-DD HH:MM", em Brasília, até 120 dias. Com a retomada ligada (e o caso
-- "cliente pediu" ligado), o agente retoma nessa data; senão vira tarefa para a equipe.
create function public.followup_quando(p_quando text)
returns timestamptz language plpgsql stable set search_path = '' as $$
declare
  v text := btrim(replace(coalesce(p_quando, ''), 'T', ' '));
begin
  if v ~ '^\d{4}-\d{2}-\d{2}$' then
    return (v || ' 09:00')::timestamp at time zone 'America/Sao_Paulo';
  elsif v ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}' then
    return left(v, 16)::timestamp at time zone 'America/Sao_Paulo';
  end if;
  return null;
exception when others then
  return null;
end $$;

create function public.agente_agendar_retorno(p_conversa uuid, p_quando text, p_assunto text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_f public.agente_followup;
  v_q timestamptz := public.followup_quando(p_quando);
  v_assunto text := left(nullif(btrim(coalesce(p_assunto, '')), ''), 150);
  v_data text;
begin
  perform public.agente_marcar();
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    raise exception 'conversa não encontrada';
  end if;
  if v_q is null or v_q <= now() or v_q > now() + interval '120 days' then
    return jsonb_build_object('sucesso', false,
      'aviso', 'Data inválida. Mande a data em AAAA-MM-DD (ou AAAA-MM-DD HH:MM), no futuro e em até 120 dias.');
  end if;
  v_assunto := coalesce(v_assunto, 'retomar a conversa');
  v_data := to_char(v_q at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  select * into v_f from public.agente_followup where org_id = v_conv.org_id;

  if v_f.ativo and v_f.pedido_cliente then
    update public.tarefas set status = 'cancelada', resultado = 'Trocada por um novo retorno combinado com o cliente',
                              enviando_em = null
     where contato_id = v_conv.contato_id and executor = 'agente' and status = 'aberta';
    insert into public.tarefas (org_id, titulo, observacao, vence_em, executor, contato_id, conversa_id, oportunidade_id,
                                followup_motivo, tentativa, followup_ref)
    values (v_conv.org_id, left('Retomar: ' || v_assunto, 200),
            'O cliente pediu para falar de novo nesta data. Assunto: ' || v_assunto, v_q, 'agente', v_conv.contato_id,
            p_conversa, (select o.id from public.oportunidades o where o.contato_id = v_conv.contato_id and o.fechada_em is null
                          order by o.atualizado_em desc limit 1),
            'pedido_cliente', 1, 'retorno:' || p_conversa || ':' || extract(epoch from now())::bigint);
    perform public.aviso_sistema(p_conversa, format('O agente combinou com o cliente retomar em %s: %s.', v_data, v_assunto));
    return jsonb_build_object('sucesso', true, 'quando', v_data,
      'aviso', 'Combinado: você volta a falar com o cliente nesta data. Confirme a data em uma frase, sem prometer mais nada.');
  end if;

  insert into public.tarefas (org_id, titulo, observacao, vence_em, executor, responsavel_id, contato_id, conversa_id,
                              oportunidade_id, lembrete_minutos)
  values (v_conv.org_id, left('Cliente pediu retorno: ' || v_assunto, 200),
          'Combinado pelo agente na conversa.', v_q, 'equipe',
          public.followup_responsavel(v_conv.contato_id, null, p_conversa), v_conv.contato_id, p_conversa,
          (select o.id from public.oportunidades o where o.contato_id = v_conv.contato_id and o.fechada_em is null
            order by o.atualizado_em desc limit 1), 0);
  perform public.aviso_sistema(p_conversa, format('O agente anotou para a equipe retomar com o cliente em %s: %s.', v_data, v_assunto));
  return jsonb_build_object('sucesso', true, 'quando', v_data,
    'aviso', 'Anotado para a equipe falar com o cliente nesta data. Confirme a data em uma frase.');
end $$;

-- Simulador: confere a data e mostra o que aconteceria.
create function public.simulador_agendar_retorno(p_org uuid, p_quando text, p_assunto text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_q timestamptz := public.followup_quando(p_quando);
begin
  if v_q is null or v_q <= now() or v_q > now() + interval '120 days' then
    return jsonb_build_object('sucesso', false,
      'aviso', 'Data inválida. Mande a data em AAAA-MM-DD (ou AAAA-MM-DD HH:MM), no futuro e em até 120 dias.');
  end if;
  return jsonb_build_object('sucesso', true, 'simulado', true,
    'quando', to_char(v_q at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
    'aviso', 'Simulador: na conversa de verdade, o retorno ficaria marcado para esta data. Confirme a data em uma frase.');
end $$;

-- ============================================================================
-- Permissões, consumo e cron
-- ============================================================================
revoke execute on function
  public.followup_responsavel(uuid, uuid, uuid), public.followup_para_equipe(uuid, text), public.followup_proxima(uuid),
  public.followup_registrar_envio(uuid, uuid, uuid, text, text), public.followup_enviar_modelo(uuid, uuid, jsonb),
  public.followup_detectar(), public.followup_rodar(), public.followup_quando(text),
  public.agente_followup_dados(uuid), public.agente_followup_concluir(uuid, text, text),
  public.agente_agendar_retorno(uuid, text, text), public.simulador_agendar_retorno(uuid, text, text)
from public, anon, authenticated;
grant execute on function
  public.agente_followup_dados(uuid), public.agente_followup_concluir(uuid, text, text),
  public.agente_agendar_retorno(uuid, text, text), public.simulador_agendar_retorno(uuid, text, text)
to service_role;

alter table public.uso_ia drop constraint uso_ia_tipo_check;
alter table public.uso_ia add constraint uso_ia_tipo_check
  check (tipo in ('resposta', 'transcricao', 'descricao', 'simulador', 'importacao', 'assistente', 'nota',
                  'foto_catalogo', 'identificacao', 'followup'));

select cron.schedule('livih-followup', '*/5 * * * *', 'select public.followup_rodar()');
