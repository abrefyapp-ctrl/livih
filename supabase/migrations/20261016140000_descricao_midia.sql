-- O agente lê imagem e PDF (roadmap, item 6, antecipado em 16/10), no mesmo modelo da transcrição de áudio:
-- quando chega uma imagem ou um PDF do cliente, a IA gera uma descrição em texto (o que é o produto, marca,
-- medidas; ou os itens e quantidades do documento), gravada na mensagem; só então o agente é chamado, já lendo a
-- descrição. A equipe vê a mesma descrição na conversa. Depende da mídia guardada (migration 20261016130000).
--
-- Também: agente_montar_pedido devolve `orcamento_numero` em vez de `pedido_numero`. Com o campo chamado "pedido",
-- o agente às vezes escrevia "Pedido nº 1" ao cliente, apesar da instrução de dizer "orçamento".

alter table public.mensagens add column descricao text;
comment on column public.mensagens.descricao is
  'descrição automática de imagem ou PDF recebido (IA), como a transcrição do áudio; não faz parte do conteúdo imutável';

-- Consumo: a descrição entra no uso_ia como as respostas e as transcrições.
alter table public.uso_ia drop constraint uso_ia_tipo_check;
alter table public.uso_ia add constraint uso_ia_tipo_check check (tipo in ('resposta', 'transcricao', 'descricao'));

-- Grava a descrição e diz se o agente deve ser chamado (mesma regra de registrar_transcricao).
create function public.registrar_descricao(p_mensagem uuid, p_descricao text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_msg public.mensagens;
  v_conversa public.conversas;
  v_agente_ativo boolean;
begin
  update public.mensagens set descricao = left(btrim(p_descricao), 4000) where id = p_mensagem returning * into v_msg;
  if v_msg.id is null then
    raise exception 'mensagem não encontrada';
  end if;
  select * into v_conversa from public.conversas where id = v_msg.conversa_id;
  if v_msg.id = (select id from public.mensagens where conversa_id = v_msg.conversa_id order by criado_em desc limit 1) then
    update public.conversas
       set ultima_mensagem_resumo = left(case when v_msg.tipo = 'imagem' then '🖼️ ' else '📎 ' end || btrim(p_descricao), 140)
     where id = v_conversa.id;
  end if;
  select coalesce(bool_or(ativo), false) into v_agente_ativo from public.agentes where canal_id = v_conversa.canal_id;
  return jsonb_build_object('org_id', v_conversa.org_id, 'conversa_id', v_conversa.id, 'mensagem_id', v_msg.id,
                            'chamar_agente', v_conversa.estado = 'bot' and v_agente_ativo);
end $$;
revoke execute on function public.registrar_descricao(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_descricao(uuid, text) to service_role;

-- Contexto do agente: igual ao de 20261010140000, com a descrição de cada mensagem.
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
                     'descricao', m.descricao,
                     'em', to_char(m.criado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
                     'anterior', coalesce(m.criado_em < v_retomado, false)
                   ) order by m.criado_em), '[]'::jsonb)
                    from (select * from public.mensagens where conversa_id = p_conversa
                           order by criado_em desc limit p_limite) m)
  ) into v_res;
  return v_res;
end $$;

-- Montar pedido: igual ao de 20261016120000, devolvendo orcamento_numero.
create or replace function public.agente_montar_pedido(p_conversa uuid, p_itens jsonb, p_observacao text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_ped public.pedidos;
  v_item jsonb;
  v_prod public.produtos;
  v_qtd numeric;
  v_validos jsonb := '[]';
  v_nao jsonb := '[]';
  v_novo boolean := false;
  v_resp uuid;
  v_ordem integer := 0;
begin
  perform public.agente_marcar();
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    raise exception 'conversa não encontrada';
  end if;
  if v_conv.estado <> 'bot' then
    return jsonb_build_object('sucesso', false, 'aviso', 'A conversa está com a equipe: não monte pedido.');
  end if;
  if not public.modulo_ativo(v_conv.org_id, 'erp') then
    return jsonb_build_object('sucesso', false, 'aviso', 'Esta empresa não monta pedidos pelo Livih: anote o pedido e chame a equipe.');
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    return jsonb_build_object('sucesso', false, 'aviso', 'Informe os itens: código do produto (da busca) e quantidade.');
  end if;

  -- Confere cada item contra o cadastro antes de mexer em qualquer coisa.
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := case when (v_item ->> 'quantidade') ~ '^\s*\d+([.,]\d+)?\s*$'
                  then replace(btrim(v_item ->> 'quantidade'), ',', '.')::numeric end;
    select * into v_prod from public.produtos
     where org_id = v_conv.org_id and ativo and lower(codigo) = lower(btrim(v_item ->> 'codigo'))
     limit 1;
    if v_prod.id is null then
      v_nao := v_nao || jsonb_build_object('codigo', v_item ->> 'codigo', 'motivo', 'código não encontrado no cadastro (use o código que veio da busca)');
    elsif v_qtd is null or v_qtd <= 0 then
      v_nao := v_nao || jsonb_build_object('codigo', v_item ->> 'codigo', 'motivo', 'quantidade inválida');
    else
      v_validos := v_validos || jsonb_build_object('produto_id', v_prod.id, 'quantidade', v_qtd);
    end if;
  end loop;
  if jsonb_array_length(v_validos) = 0 then
    return jsonb_build_object('sucesso', false, 'nao_encontrados', v_nao,
                              'aviso', 'Nenhum item válido: busque o produto de novo e use o código exato.');
  end if;

  v_ped := public.agente_rascunho_atual(p_conversa);
  if v_ped.id is null then
    -- Responsável: o vendedor da carteira do cliente, se for da equipe.
    select ct.responsavel_id into v_resp from public.contatos ct
     where ct.id = v_conv.contato_id
       and exists (select 1 from public.membros_org m where m.org_id = v_conv.org_id and m.user_id = ct.responsavel_id and m.ativo);
    insert into public.pedidos (org_id, contato_id, origem, responsavel_id, oportunidade_id)
    values (v_conv.org_id, v_conv.contato_id, 'agente', v_resp,
            (select op.id from public.oportunidades op
              where op.contato_id = v_conv.contato_id and op.fechada_em is null
              order by op.criado_em desc limit 1))
    returning * into v_ped;
    v_novo := true;
  end if;

  -- Lista completa: substitui os itens. Preço e descrição sempre do cadastro.
  delete from public.pedido_itens where pedido_id = v_ped.id;
  for v_item in select * from jsonb_array_elements(v_validos) loop
    insert into public.pedido_itens (org_id, pedido_id, produto_id, descricao, quantidade, preco_unitario, ordem)
    select v_conv.org_id, v_ped.id, p.id, left(p.nome, 200), (v_item ->> 'quantidade')::numeric, p.preco, v_ordem
      from public.produtos p where p.id = (v_item ->> 'produto_id')::uuid;
    v_ordem := v_ordem + 1;
  end loop;
  if nullif(btrim(coalesce(p_observacao, '')), '') is not null then
    update public.pedidos set observacao = left(btrim(p_observacao), 2000) where id = v_ped.id;
  end if;
  select * into v_ped from public.pedidos where id = v_ped.id;

  perform public.aviso_sistema(p_conversa,
    format('O agente %s o orçamento #%s (%s). Confira em Pedidos.',
           case when v_novo then 'montou' else 'atualizou' end, v_ped.numero, public.reais(v_ped.total)));

  return jsonb_build_object(
    'sucesso', true,
    'orcamento_numero', v_ped.numero,
    'itens', (select jsonb_agg(jsonb_build_object('codigo', p.codigo, 'nome', i.descricao, 'quantidade', i.quantidade,
                                                   'unidade', p.unidade, 'preco_unitario', i.preco_unitario,
                                                   'subtotal', i.subtotal) order by i.ordem)
                from public.pedido_itens i left join public.produtos p on p.id = i.produto_id
               where i.pedido_id = v_ped.id),
    'total', v_ped.total,
    'total_formatado', public.reais(v_ped.total),
    'nao_encontrados', v_nao,
    'aviso', 'Frete não incluso: é calculado pela equipe.'
  );
end $$;
