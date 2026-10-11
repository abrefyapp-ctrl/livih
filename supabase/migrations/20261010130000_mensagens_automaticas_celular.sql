-- Mensagens automáticas do celular (saudação e ausência do WhatsApp Business).
-- 10/10, JoGrampo: a saudação ("Jogrampo agradece seu contato...") e a mensagem de ausência saem do
-- celular ~1 s depois do cliente e chegam pelo webhook iguais a uma mensagem digitada — nenhum campo do
-- protocolo diferencia. registrar_saida_celular passava a conversa para 'humano' e a Liv parava.
-- Agora a empresa cadastra esses textos em agentes.regras_humano.mensagens_automaticas (já sincronizado
-- entre os números pelo agentes_sincronizar). Mensagem do celular igual a um deles (sem diferenciar
-- maiúsculas, espaços e caracteres invisíveis) entra no histórico marcada como automática e NÃO tira a
-- conversa do agente.

alter table public.mensagens add column automatica boolean not null default false;
comment on column public.mensagens.automatica is
  'Saída pelo celular reconhecida como mensagem automática do WhatsApp Business (saudação/ausência).';

-- "‎Jogrampo  agradece\n" = "jogrampo agradece": tira marcas de direção/espaços de largura zero, junta espaços.
create function public.texto_comparavel(p text) returns text
language sql immutable set search_path = '' as $$
  select lower(btrim(regexp_replace(regexp_replace(p, '[\u200b-\u200f\u2060\ufeff]', '', 'g'), '\s+', ' ', 'g')));
$$;

create function public.eh_mensagem_automatica(p_canal uuid, p_texto text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_texto is not null and exists (
    select 1 from public.agentes a,
           jsonb_array_elements_text(coalesce(a.regras_humano -> 'mensagens_automaticas', '[]'::jsonb)) t(x)
     where a.canal_id = p_canal
       and public.texto_comparavel(t.x) <> ''
       and public.texto_comparavel(t.x) = public.texto_comparavel(p_texto)
  );
$$;

create or replace function public.registrar_saida_celular(
  p_canal uuid,
  p_wa_id text,
  p_telefone text,
  p_lid text,
  p_tipo public.tipo_msg,
  p_texto text,
  p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_evento bigint;
  v_contato uuid;
  v_conversa public.conversas;
  v_auto boolean;
begin
  select org_id into v_org from public.canais where id = p_canal and ativo;
  if v_org is null then
    raise exception 'canal inativo ou inexistente';
  end if;

  insert into public.eventos_recebidos (canal_id, wa_id, payload)
  values (p_canal, p_wa_id, p_payload)
  on conflict (canal_id, wa_id) do nothing
  returning id into v_evento;
  if v_evento is null then
    return jsonb_build_object('duplicada', true);
  end if;

  v_auto := public.eh_mensagem_automatica(p_canal, p_texto);
  v_contato := public.contato_por_whatsapp(v_org, p_telefone, p_lid, null);

  -- Conversa nova aberta por mensagem automática segue o caminho normal (estado padrão e triggers).
  if v_auto then
    insert into public.conversas (org_id, canal_id, contato_id)
    values (v_org, p_canal, v_contato)
    on conflict (canal_id, contato_id) do nothing;
  else
    insert into public.conversas (org_id, canal_id, contato_id, estado)
    values (v_org, p_canal, v_contato, 'humano')
    on conflict (canal_id, contato_id) do nothing;
  end if;

  select * into v_conversa from public.conversas
   where canal_id = p_canal and contato_id = v_contato for update;

  if exists (select 1 from public.mensagens where conversa_id = v_conversa.id and wa_id = p_wa_id) then
    update public.eventos_recebidos set processado_em = now() where id = v_evento;
    return jsonb_build_object('duplicada', true);
  end if;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, wa_id, status_entrega, automatica)
  values (v_org, v_conversa.id, 'saida', 'atendente', p_tipo, p_texto, p_wa_id, 'enviada', v_auto);

  if v_auto then
    update public.conversas
       set ultima_mensagem_em = now(),
           ultima_mensagem_resumo = left(p_texto, 140)
     where id = v_conversa.id;
  else
    update public.conversas
       set ultima_mensagem_em = now(),
           ultima_mensagem_resumo = left(coalesce(p_texto, '[' || p_tipo::text || ']'), 140),
           estado = case when estado in ('bot', 'aguardando_humano', 'encerrada') then 'humano' else estado end,
           motivo_humano = case when estado in ('bot', 'aguardando_humano', 'encerrada')
                                then 'respondida pelo celular' else motivo_humano end,
           nao_lidas = 0
     where id = v_conversa.id;
  end if;

  update public.eventos_recebidos set processado_em = now() where id = v_evento;
  return jsonb_build_object('duplicada', false, 'conversa_id', v_conversa.id, 'automatica', v_auto);
end $$;

-- O agente vê a saudação no histórico como automática, não como um atendente que entrou na conversa.
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


revoke execute on function public.eh_mensagem_automatica(uuid, text) from public, anon, authenticated;
grant execute on function public.eh_mensagem_automatica(uuid, text) to service_role;
