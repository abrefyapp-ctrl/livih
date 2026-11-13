-- O agente pergunta a cidade quando a distribuição espera por ela (docs/equipes-origem-prospeccao.md, entrega 2;
-- pedido da CEFEQ: "cliente de Castro ou Piraí vai para a loja de Castro").
--
-- Na 20261113120000, sem a cidade do contato e com equipes por cidade cadastradas, a distribuição espera
-- (conversas.distribuir_pendente_em) até a cidade chegar, a conversa passar para a equipe ou o cron soltar em ~15 min.
-- Faltava o agente saber que deve perguntar: o contexto ganha "perguntar_cidade", e o prompt (n8n/gerar_workflow.py)
-- pede a cidade numa pergunta curta e grava com atualizar_contato, que já aceitava o campo cidade.

-- Igual ao de 20261105120000, mais a chave "perguntar_cidade".
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
    -- A distribuição está esperando a cidade do contato: o agente pergunta e grava com atualizar_contato, e o
    -- gatilho de contatos distribui (20261113120000).
    'perguntar_cidade', v_conv.distribuir_pendente_em is not null,
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
    -- De qual empresa (ou pessoa) cliente o contato é. Sem documento, o orçamento sai sem CNPJ/CPF.
    'cliente', (select jsonb_build_object('nome', cl.nome, 'razao_social', cl.razao_social, 'tipo', cl.tipo,
                                          'cidade', cl.cidade, 'uf', cl.uf, 'tem_documento', cl.documento is not null)
                  from public.contatos ct join public.clientes cl on cl.id = ct.cliente_id
                 where ct.id = v_conv.contato_id and cl.ativo),
    -- Todas as empresas do contato, a principal primeiro. CNPJ formatado para o agente escolher a do orçamento
    -- (montar_pedido com empresa); CPF não vai.
    'clientes', (select coalesce(jsonb_agg(jsonb_build_object(
                    'nome', cl.nome, 'razao_social', cl.razao_social, 'tipo', cl.tipo,
                    'cnpj', case when cl.tipo = 'pj' then public.formatar_documento(cl.documento) end,
                    'cidade', cl.cidade, 'uf', cl.uf, 'principal', cl.id = ct.cliente_id)
                  order by cl.id = ct.cliente_id desc, cc.criado_em), '[]'::jsonb)
                   from public.contatos ct
                   join public.contatos_clientes cc on cc.contato_id = ct.id
                   join public.clientes cl on cl.id = cc.cliente_id
                  where ct.id = v_conv.contato_id and cl.ativo),
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
                     'descricao', m.descricao,
                     'em', to_char(m.criado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
                     'anterior', coalesce(m.criado_em < v_retomado, false)
                   ) order by m.criado_em), '[]'::jsonb)
                    from (select * from public.mensagens where conversa_id = p_conversa
                           order by criado_em desc limit p_limite) m)
  ) into v_res;
  return v_res;
end $$;
