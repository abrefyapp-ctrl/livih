-- Livih — fase 2: funções do agente (n8n), transcrição de áudio e alertas para a equipe.
--
-- Todas as agente_* recebem a conversa e tiram a organização dela: o agente de uma empresa não
-- alcança dados de outra. Só service_role executa. Cada uma marca livih.autor = bot, para que
-- histórico do funil e auditoria registrem que foi o agente.

-- Ordem das mensagens: o relógio real, não o início da transação (now()). Duas mensagens
-- gravadas na mesma transação teriam a mesma hora e ordem indefinida no histórico do agente.
alter table public.mensagens alter column criado_em set default clock_timestamp();
alter table public.auditoria alter column criado_em set default clock_timestamp();

-- ============================================================================
-- Alertas para a equipe (ex.: "lead quente aguardando você")
-- ============================================================================
-- Não passam pela fila de conversas: o destinatário é alguém da equipe, não um contato do CRM.

create table public.alertas (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  canal_id uuid not null references public.canais (id) on delete cascade,
  telefone text not null check (telefone ~ '^[0-9]{10,15}$'),
  texto text not null,
  conversa_id uuid references public.conversas (id) on delete set null,
  status public.status_fila not null default 'pendente',
  tentativas integer not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  erro text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index alertas_pendentes_idx on public.alertas (proxima_tentativa_em) where status in ('pendente', 'erro');
alter table public.alertas enable row level security;
create policy alertas_ver on public.alertas for select to authenticated using (public.tem_papel(org_id, '{dono,admin}'));
revoke insert, update, delete on public.alertas from authenticated;

create trigger alertas_disparar after insert on public.alertas
for each statement execute function public.fila_disparar();

create function public.alertas_reivindicar(p_limite integer default 10)
returns table (alerta_id bigint, canal_tipo text, instance_id text, telefone text, texto text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with lote as (
    select a.id from public.alertas a
     where a.status in ('pendente', 'erro') and a.proxima_tentativa_em <= now() and a.tentativas < 6
     order by a.proxima_tentativa_em limit p_limite
     for update skip locked
  ), marcados as (
    update public.alertas a set status = 'enviando', tentativas = a.tentativas + 1
      from lote where a.id = lote.id
    returning a.id, a.canal_id, a.telefone, a.texto
  )
  select m.id, c.tipo, c.instance_id, m.telefone, m.texto
    from marcados m join public.canais c on c.id = m.canal_id;
end $$;

create function public.alerta_resultado(p_alerta bigint, p_ok boolean, p_erro text default null)
returns void language sql security definer set search_path = '' as $$
  update public.alertas
     set status = case when p_ok then 'enviada'::public.status_fila else 'erro'::public.status_fila end,
         enviado_em = case when p_ok then now() end,
         erro = case when p_ok then null else left(p_erro, 500) end,
         proxima_tentativa_em = case when p_ok then proxima_tentativa_em
                                     else now() + make_interval(mins => power(2, greatest(tentativas - 1, 0))::int) end
   where id = p_alerta;
$$;

-- O cron passa a olhar alertas também.
create or replace function public.fila_manutencao() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.fila_envio set status = 'erro', erro = coalesce(erro, 'travado em enviando')
   where status = 'enviando' and proxima_tentativa_em < now() - interval '5 minutes';
  update public.alertas set status = 'erro', erro = coalesce(erro, 'travado em enviando')
   where status = 'enviando' and proxima_tentativa_em < now() - interval '5 minutes';
  if exists (select 1 from public.fila_envio
              where status in ('pendente', 'erro') and proxima_tentativa_em <= now() and tentativas < 6)
     or exists (select 1 from public.alertas
              where status in ('pendente', 'erro') and proxima_tentativa_em <= now() and tentativas < 6) then
    perform public.chamar_funcao('whatsapp-enviar');
  end if;
end $$;

-- ============================================================================
-- Transcrição de áudio (gravada depois da mensagem, pela Edge Function)
-- ============================================================================

create function public.registrar_transcricao(p_mensagem uuid, p_transcricao text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_msg public.mensagens;
  v_conversa public.conversas;
  v_agente_ativo boolean;
begin
  update public.mensagens set transcricao = p_transcricao where id = p_mensagem returning * into v_msg;
  select * into v_conversa from public.conversas where id = v_msg.conversa_id;
  if v_msg.id = (select id from public.mensagens where conversa_id = v_msg.conversa_id order by criado_em desc limit 1) then
    update public.conversas set ultima_mensagem_resumo = left('🎤 ' || p_transcricao, 140) where id = v_conversa.id;
  end if;
  select coalesce(bool_or(ativo), false) into v_agente_ativo from public.agentes where canal_id = v_conversa.canal_id;
  return jsonb_build_object('org_id', v_conversa.org_id, 'conversa_id', v_conversa.id, 'mensagem_id', v_msg.id,
                            'chamar_agente', v_conversa.estado = 'bot' and v_agente_ativo);
end $$;

-- ============================================================================
-- Agente: leitura
-- ============================================================================

create function public.agente_marcar() returns void
language sql set search_path = '' as $$
  select set_config('livih.autor', 'bot', true);
$$;

-- A mensagem que acordou o agente ainda é a última do contato e a conversa segue com o bot?
-- Se o contato mandou outra depois (ou um atendente assumiu), esta execução desiste.
create function public.agente_deve_responder(p_conversa uuid, p_mensagem uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversas c
     join public.agentes a on a.canal_id = c.canal_id and a.ativo
     where c.id = p_conversa and c.estado = 'bot'
  ) and p_mensagem = (
    select id from public.mensagens
     where conversa_id = p_conversa and direcao = 'entrada'
     order by criado_em desc limit 1
  );
$$;

create function public.agente_contexto(p_conversa uuid, p_limite integer default 40)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_res jsonb;
begin
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    raise exception 'conversa não encontrada';
  end if;

  select jsonb_build_object(
    'conversa', jsonb_build_object('id', v_conv.id, 'estado', v_conv.estado),
    'organizacao', (select jsonb_build_object('nome', o.nome) from public.organizacoes o where o.id = v_conv.org_id),
    'agente', (select jsonb_build_object('nome', a.nome, 'modelo', a.modelo, 'prompt', a.prompt,
                                         'regras_humano', a.regras_humano, 'mensagem_fora_horario', a.mensagem_fora_horario,
                                         'horario', a.horario)
                 from public.agentes a where a.canal_id = v_conv.canal_id),
    'base_conhecimento', (select string_agg('## ' || b.titulo || E'\n\n' || b.conteudo, E'\n\n---\n\n' order by b.titulo)
                            from public.base_conhecimento b where b.org_id = v_conv.org_id and b.ativo),
    'contato', (select jsonb_build_object('nome', ct.nome, 'nome_whatsapp', ct.nome_whatsapp, 'telefone', ct.telefone,
                                          'empresa', ct.empresa, 'email', ct.email, 'dados', ct.dados)
                  from public.contatos ct where ct.id = v_conv.contato_id),
    'oportunidade', (select jsonb_build_object('titulo', op.titulo, 'resumo', op.resumo, 'etapa', e.nome)
                       from public.oportunidades op join public.etapas_funil e on e.id = op.etapa_id
                      where op.contato_id = v_conv.contato_id and op.fechada_em is null
                      order by op.criado_em desc limit 1),
    'etapas', (select jsonb_agg(e.nome order by e.ordem) from public.etapas_funil e where e.org_id = v_conv.org_id),
    'mensagens', (select coalesce(jsonb_agg(jsonb_build_object(
                     'de', case m.autor_tipo when 'contato' then 'cliente' when 'bot' then 'assistente'
                                             when 'atendente' then 'atendente' else 'sistema' end,
                     'tipo', m.tipo,
                     'texto', coalesce(m.transcricao, m.texto),
                     'em', to_char(m.criado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
                   ) order by m.criado_em), '[]'::jsonb)
                    from (select * from public.mensagens where conversa_id = p_conversa
                           order by criado_em desc limit p_limite) m)
  ) into v_res;
  return v_res;
end $$;

-- ============================================================================
-- Agente: ações
-- ============================================================================

create function public.agente_responder(p_conversa uuid, p_texto text, p_mensagem uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.agente_marcar();
  -- Confere de novo na hora de gravar: entre pensar e responder o cliente pode ter escrito de
  -- novo ou um atendente pode ter assumido. Exceção: se foi o próprio agente que acabou de passar
  -- a conversa para a equipe nesta rodada, a mensagem de despedida ("vou chamar alguém") sai.
  if not public.agente_deve_responder(p_conversa, p_mensagem)
     and not exists (
       select 1 from public.conversas c
        where c.id = p_conversa and c.estado = 'aguardando_humano' and c.atribuida_a is null
          and p_mensagem = (select id from public.mensagens where conversa_id = p_conversa and direcao = 'entrada'
                             order by criado_em desc limit 1)
          and exists (select 1 from public.auditoria a
                       where a.entidade = 'conversas' and a.entidade_id = p_conversa::text
                         and a.acao = 'conversa_estado' and a.ator_tipo = 'bot'
                         and a.criado_em >= (select criado_em from public.mensagens where id = p_mensagem))
     ) then
    return jsonb_build_object('enviado', false, 'motivo', 'conversa mudou enquanto o agente pensava');
  end if;
  return jsonb_build_object('enviado', true, 'mensagem_id', public.enfileirar_saida(p_conversa, p_texto, 'bot', null));
end $$;

create function public.agente_atualizar_contato(p_conversa uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_contato uuid;
  v_extra jsonb;
begin
  perform public.agente_marcar();
  select contato_id into v_contato from public.conversas where id = p_conversa;
  -- nome, empresa e email têm coluna; o resto (cargo, segmento, cidade…) vai para dados.
  v_extra := coalesce(p_dados, '{}'::jsonb) - 'nome' - 'empresa' - 'email';
  update public.contatos
     set nome = coalesce(nullif(btrim(p_dados ->> 'nome'), ''), nome),
         empresa = coalesce(nullif(btrim(p_dados ->> 'empresa'), ''), empresa),
         email = coalesce(nullif(btrim(p_dados ->> 'email'), ''), email),
         dados = dados || jsonb_strip_nulls(v_extra)
   where id = v_contato;
  return jsonb_build_object('sucesso', true);
end $$;

create function public.agente_registrar_oportunidade(p_conversa uuid, p_titulo text, p_resumo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_op uuid;
begin
  perform public.agente_marcar();
  select * into v_conv from public.conversas where id = p_conversa;
  select id into v_op from public.oportunidades
   where contato_id = v_conv.contato_id and fechada_em is null order by criado_em desc limit 1;
  if v_op is null then
    insert into public.oportunidades (org_id, contato_id, etapa_id, titulo, resumo, origem)
    select v_conv.org_id, v_conv.contato_id, e.id, coalesce(nullif(btrim(p_titulo), ''), 'Atendimento WhatsApp'), p_resumo, 'whatsapp'
      from public.etapas_funil e where e.org_id = v_conv.org_id and e.tipo = 'aberta' order by e.ordem limit 1
    returning id into v_op;
    return jsonb_build_object('sucesso', true, 'acao', 'criada');
  end if;
  update public.oportunidades
     set titulo = coalesce(nullif(btrim(p_titulo), ''), titulo), resumo = coalesce(p_resumo, resumo)
   where id = v_op;
  return jsonb_build_object('sucesso', true, 'acao', 'atualizada');
end $$;

create function public.agente_mover_etapa(p_conversa uuid, p_etapa text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_etapa public.etapas_funil;
  v_op uuid;
begin
  perform public.agente_marcar();
  select * into v_conv from public.conversas where id = p_conversa;
  select * into v_etapa from public.etapas_funil
   where org_id = v_conv.org_id and lower(nome) = lower(btrim(p_etapa));
  if v_etapa.id is null then
    return jsonb_build_object('sucesso', false, 'erro', 'etapa inexistente',
      'etapas', (select jsonb_agg(nome order by ordem) from public.etapas_funil where org_id = v_conv.org_id));
  end if;
  if v_etapa.tipo <> 'aberta' then
    return jsonb_build_object('sucesso', false, 'erro', 'ganho e perdido são decididos pela equipe, não pelo assistente');
  end if;
  select id into v_op from public.oportunidades
   where contato_id = v_conv.contato_id and fechada_em is null order by criado_em desc limit 1;
  if v_op is null then
    insert into public.oportunidades (org_id, contato_id, etapa_id, titulo, origem)
    values (v_conv.org_id, v_conv.contato_id, v_etapa.id, 'Atendimento WhatsApp', 'whatsapp');
  else
    update public.oportunidades set etapa_id = v_etapa.id where id = v_op;
  end if;
  return jsonb_build_object('sucesso', true, 'etapa', v_etapa.nome);
end $$;

create function public.agente_nota(p_conversa uuid, p_texto text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.agente_marcar();
  insert into public.notas (org_id, contato_id, conversa_id, autor_tipo, autor_id, texto)
  select org_id, contato_id, id, 'bot', null, p_texto from public.conversas where id = p_conversa;
  return jsonb_build_object('sucesso', true);
end $$;

create function public.agente_chamar_humano(p_conversa uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_agente public.agentes;
  v_contato public.contatos;
begin
  perform public.agente_marcar();
  select * into v_conv from public.conversas where id = p_conversa for update;
  if v_conv.estado <> 'bot' then
    return jsonb_build_object('sucesso', true, 'aviso', 'a conversa já está com a equipe');
  end if;
  update public.conversas set estado = 'aguardando_humano', motivo_humano = left(p_motivo, 300) where id = p_conversa;

  select * into v_agente from public.agentes where canal_id = v_conv.canal_id;
  select * into v_contato from public.contatos where id = v_conv.contato_id;
  if v_agente.telefone_alerta is not null then
    insert into public.alertas (org_id, canal_id, telefone, texto, conversa_id)
    values (v_conv.org_id, v_conv.canal_id, v_agente.telefone_alerta,
            '🔔 *Livih — conversa aguardando você*' || E'\n\n' ||
            'Contato: ' || coalesce(v_contato.nome, v_contato.nome_whatsapp, 'sem nome') ||
            coalesce(' (' || v_contato.telefone || ')', '') || E'\n' ||
            'Motivo: ' || p_motivo,
            p_conversa);
  end if;
  return jsonb_build_object('sucesso', true, 'equipe_avisada', v_agente.telefone_alerta is not null);
end $$;

-- ============================================================================
-- Permissões
-- ============================================================================

revoke execute on function
  public.alertas_reivindicar(integer), public.alerta_resultado(bigint, boolean, text),
  public.registrar_transcricao(uuid, text), public.agente_marcar(),
  public.agente_deve_responder(uuid, uuid), public.agente_contexto(uuid, integer),
  public.agente_responder(uuid, text, uuid), public.agente_atualizar_contato(uuid, jsonb),
  public.agente_registrar_oportunidade(uuid, text, text), public.agente_mover_etapa(uuid, text),
  public.agente_nota(uuid, text), public.agente_chamar_humano(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.alertas_reivindicar(integer), public.alerta_resultado(bigint, boolean, text),
  public.registrar_transcricao(uuid, text),
  public.agente_deve_responder(uuid, uuid), public.agente_contexto(uuid, integer),
  public.agente_responder(uuid, text, uuid), public.agente_atualizar_contato(uuid, jsonb),
  public.agente_registrar_oportunidade(uuid, text, text), public.agente_mover_etapa(uuid, text),
  public.agente_nota(uuid, text), public.agente_chamar_humano(uuid, text)
to service_role;
