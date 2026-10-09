-- Ponto de retomada do agente.
--
-- Quando o agente volta a atender uma conversa, ele recebia as últimas 40 mensagens sem distinção. Assim, podia
-- responder uma pergunta que a equipe já tinha resolvido, ou retomar um assunto de dias atrás. A conversa volta
-- para o agente de três jeitos:
--   - o atendente devolve a conversa ao agente (estado → 'bot');
--   - uma conversa encerrada é reaberta por mensagem nova do cliente (estado → 'bot');
--   - o agente do número é religado (agentes.ativo → true).
-- O banco guarda a hora de cada um e agente_contexto marca as mensagens anteriores ao mais recente deles
-- ("anterior": true). O histórico continua indo inteiro para o agente, como contexto (nome, o que a equipe
-- combinou), mas o prompt manda responder só às mensagens depois do ponto.

alter table public.agentes add column ativado_em timestamptz;
alter table public.conversas add column bot_desde timestamptz;

-- clock_timestamp, como mensagens.criado_em: a mensagem que reabre a conversa é gravada depois, na mesma
-- transação, e precisa ficar do lado "novo" do ponto.
create function public.agente_marcar_ativacao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ativo and (tg_op = 'INSERT' or not old.ativo) then
    new.ativado_em := clock_timestamp();
  end if;
  return new;
end $$;

create trigger agentes_marcar_ativacao before insert or update of ativo on public.agentes
for each row execute function public.agente_marcar_ativacao();

create function public.conversa_marcar_volta_bot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.estado = 'bot' and old.estado <> 'bot' then
    new.bot_desde := clock_timestamp();
  end if;
  return new;
end $$;

create trigger conversas_marcar_volta_bot before update of estado on public.conversas
for each row execute function public.conversa_marcar_volta_bot();

revoke execute on function public.agente_marcar_ativacao(), public.conversa_marcar_volta_bot()
  from public, anon, authenticated;

-- Igual à versão de 20261007140000, mais `retomado_em` e `anterior` em cada mensagem.
create or replace function public.agente_contexto(p_conversa uuid, p_limite integer default 40)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_retomado timestamptz;
  v_res jsonb;
begin
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    raise exception 'conversa não encontrada';
  end if;

  -- greatest ignora nulos: sem nenhuma marca, nenhuma mensagem é "anterior".
  select greatest(a.ativado_em, v_conv.bot_desde) into v_retomado
    from public.agentes a where a.canal_id = v_conv.canal_id;
  v_retomado := coalesce(v_retomado, v_conv.bot_desde);

  select jsonb_build_object(
    'conversa', jsonb_build_object('id', v_conv.id, 'estado', v_conv.estado),
    'retomado_em', to_char(v_retomado at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
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
                     'em', to_char(m.criado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
                     'anterior', coalesce(m.criado_em < v_retomado, false)
                   ) order by m.criado_em), '[]'::jsonb)
                    from (select * from public.mensagens where conversa_id = p_conversa
                           order by criado_em desc limit p_limite) m)
  ) into v_res;
  return v_res;
end $$;
