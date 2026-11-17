-- Simulador com foto e áudio (docs/simulador-agente.md, pedido de 17/11).
--
-- O "Testar agente" só aceitava texto, e cliente de verdade manda foto do produto e áudio. A Edge Function
-- agente-simular passa a descrever a foto e transcrever o áudio com o mesmo código da entrada pelo WhatsApp
-- (_shared/descricao.ts e _shared/atendimento.ts). Aqui o contexto simulado repassa ao agente o tipo e a descrição
-- de cada mensagem da tela, para o nó Contexto do n8n montar a linha igual à de uma conversa real ("o cliente
-- enviou uma imagem — descrição automática…", ou o texto transcrito do áudio). Tipo desconhecido vira texto.
-- Só a definição de 20261020120000 muda nas mensagens; o resto é igual.

create or replace function public.agente_contexto_simulado(p_org uuid, p_mensagens jsonb, p_prompt text default null,
                                                           p_casos jsonb default null, p_base text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ag public.agentes;
  v_agora text := to_char(clock_timestamp() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
begin
  select * into v_ag from public.agentes where org_id = p_org order by ativo desc, atualizado_em desc limit 1;
  if v_ag.id is null then
    raise exception 'empresa sem agente';
  end if;
  if jsonb_typeof(p_mensagens) is distinct from 'array' then
    raise exception 'mensagens inválidas';
  end if;

  return jsonb_build_object(
    'conversa', jsonb_build_object('id', null, 'estado', 'bot'),
    'dentro_do_horario', public.agente_no_horario(v_ag.horario, clock_timestamp()),
    'primeira_resposta', not exists (select 1 from jsonb_array_elements(p_mensagens) m where m ->> 'de' = 'assistente'),
    'retomado_em', null,
    'organizacao', (select jsonb_build_object('nome', o.nome) from public.organizacoes o where o.id = p_org),
    'agente', jsonb_build_object(
      'nome', v_ag.nome, 'modelo', v_ag.modelo, 'prompt', coalesce(p_prompt, v_ag.prompt),
      'regras_humano', case when jsonb_typeof(p_casos) = 'array'
                            then coalesce(v_ag.regras_humano, '{}'::jsonb) || jsonb_build_object('casos', p_casos)
                            else v_ag.regras_humano end,
      'mensagem_fora_horario', v_ag.mensagem_fora_horario, 'horario', v_ag.horario, 'saudacao', v_ag.saudacao),
    'base_conhecimento', coalesce(p_base, (select string_agg('## ' || b.titulo || E'\n\n' || b.conteudo, E'\n\n---\n\n' order by b.titulo)
                            from public.base_conhecimento b where b.org_id = p_org and b.ativo)),
    'contato', jsonb_build_object('nome', null, 'nome_whatsapp', 'Cliente de teste', 'telefone', null, 'empresa', null,
                                  'email', null, 'dados', '{}'::jsonb),
    'oportunidade', null,
    'etapas', (select jsonb_agg(e.nome order by e.ordem) from public.etapas_funil e where e.org_id = p_org),
    'mensagens', (select coalesce(jsonb_agg(jsonb_build_object(
                     'de', case when t.m ->> 'de' = 'assistente' then 'assistente' else 'cliente' end,
                     'tipo', case when t.m ->> 'de' is distinct from 'assistente' and t.m ->> 'tipo' in ('imagem', 'audio')
                                  then t.m ->> 'tipo' else 'texto' end,
                     'texto', left(coalesce(t.m ->> 'texto', ''), 4000),
                     'descricao', case when t.m ->> 'de' is distinct from 'assistente' and t.m ->> 'tipo' = 'imagem'
                                       then nullif(left(coalesce(t.m ->> 'descricao', ''), 4000), '') end,
                     'em', v_agora, 'anterior', false) order by t.ord), '[]'::jsonb)
                    from jsonb_array_elements(p_mensagens) with ordinality t(m, ord))
  );
end $$;

revoke execute on function public.agente_contexto_simulado(uuid, jsonb, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.agente_contexto_simulado(uuid, jsonb, text, jsonb, text) to service_role;
