-- Saudação e horário de atendimento do agente, configuráveis por empresa (Configurações → Agente).
-- 10/10: a JoGrampo usava a saudação e a ausência do WhatsApp Business no celular, que tiravam a conversa
-- do agente. Agora o próprio agente cumprimenta na primeira resposta e sabe se está fora do horário — e,
-- fora do horário, continua atendendo (avisa que a equipe retorna). As colunas horario e
-- mensagem_fora_horario já existiam sem uso.
--
-- horario: null = sem horário (24 h). Senão {"1": ["08:00","18:00"], ..., "7": null} com a chave = dia ISO
-- (1 = segunda … 7 = domingo); dia ausente ou null = fechado. Horário de Brasília.

alter table public.agentes add column saudacao text;

create function public.agente_horario_valido(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v jsonb;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(p) loop
    if k not in ('1', '2', '3', '4', '5', '6', '7') then return false; end if;
    continue when v = 'null'::jsonb;
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) <> 2
       or coalesce(v ->> 0, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(v ->> 1, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$'
       or (v ->> 0) >= (v ->> 1) then
      return false;
    end if;
  end loop;
  return true;
end $$;

alter table public.agentes add constraint agentes_horario_valido check (public.agente_horario_valido(horario));

create function public.agente_no_horario(p_horario jsonb, p_quando timestamptz) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p_horario is null then true
    else coalesce((
      select to_char(l, 'HH24:MI') >= (f ->> 0) and to_char(l, 'HH24:MI') < (f ->> 1)
        from (select p_quando at time zone 'America/Sao_Paulo' as l) t,
             lateral (select p_horario -> extract(isodow from t.l)::int::text as f) d
       where jsonb_typeof(d.f) = 'array'
    ), false)
  end;
$$;

-- Agente único da empresa: saudação e horário acompanham as instruções em todos os números.
create or replace function public.agentes_sincronizar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if (new.prompt, new.regras_humano, new.telefone_alerta, new.modelo, new.saudacao, new.horario, new.mensagem_fora_horario)
     is distinct from
     (old.prompt, old.regras_humano, old.telefone_alerta, old.modelo, old.saudacao, old.horario, old.mensagem_fora_horario) then
    update public.agentes
       set prompt = new.prompt, regras_humano = new.regras_humano,
           telefone_alerta = new.telefone_alerta, modelo = new.modelo,
           saudacao = new.saudacao, horario = new.horario, mensagem_fora_horario = new.mensagem_fora_horario
     where org_id = new.org_id and id <> new.id;
  end if;
  return new;
end $$;

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
    -- Calculados aqui, não pela IA: dia da semana e hora certos, e se a conversa já teve resposta recente.
    'dentro_do_horario', (select public.agente_no_horario(a.horario, clock_timestamp())
                            from public.agentes a where a.canal_id = v_conv.canal_id),
    'primeira_resposta', not exists (
      select 1 from public.mensagens m
       where m.conversa_id = p_conversa and m.direcao = 'saida' and not m.automatica
         and m.autor_tipo in ('bot', 'atendente') and m.criado_em > clock_timestamp() - interval '12 hours'),
    'retomado_em', to_char(v_retomado at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
    'organizacao', (select jsonb_build_object('nome', o.nome) from public.organizacoes o where o.id = v_conv.org_id),
    'agente', (select jsonb_build_object('nome', a.nome, 'modelo', a.modelo, 'prompt', a.prompt,
                                         'regras_humano', a.regras_humano, 'mensagem_fora_horario', a.mensagem_fora_horario,
                                         'horario', a.horario, 'saudacao', a.saudacao)
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
                     'de', case when m.automatica then 'mensagem automática do celular'
                                when m.autor_tipo = 'contato' then 'cliente' when m.autor_tipo = 'bot' then 'assistente'
                                when m.autor_tipo = 'atendente' then 'atendente' else 'sistema' end,
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

