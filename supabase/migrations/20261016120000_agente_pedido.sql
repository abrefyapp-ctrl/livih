-- O agente monta o rascunho do pedido pela conversa e envia o orçamento em PDF (docs/agente-pedido.md).
--
-- Decisões de 16/10 (usuário): depois de montar, o agente continua atendendo; o próprio agente envia o PDF (sem
-- conferência humana; preço sempre do cadastro). A equipe fica sabendo por um aviso de sistema na conversa.
--
-- O agente só mexe no rascunho que ele mesmo criou (origem 'agente') e só enquanto a conversa está com ele.
-- Não define frete nem desconto.

-- R$ 1.027,00 (o banco não tem locale pt-BR).
create function public.reais(p numeric) returns text
language sql immutable set search_path = '' as $$
  select 'R$ ' || translate(to_char(coalesce(p, 0), 'FM999,999,999,990.00'), ',.', '.,');
$$;

-- Aviso só para a equipe, dentro da conversa. Não entra na fila (não vai para o WhatsApp) nem gera notificação
-- (o push só olha mensagens recebidas do cliente).
create function public.aviso_sistema(p_conversa uuid, p_texto text) returns void
language sql security definer set search_path = '' as $$
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, status_entrega)
  select c.org_id, c.id, 'saida', 'sistema', 'texto', p_texto, 'enviada'
    from public.conversas c where c.id = p_conversa;
$$;
revoke execute on function public.aviso_sistema(uuid, text) from public, anon, authenticated;

-- Rascunho do agente em aberto para o cliente da conversa.
create function public.agente_rascunho_atual(p_conversa uuid) returns public.pedidos
language sql stable security definer set search_path = '' as $$
  select p.* from public.pedidos p join public.conversas c on c.id = p_conversa
   where p.org_id = c.org_id and p.contato_id = c.contato_id and p.status = 'rascunho' and p.origem = 'agente'
   order by p.criado_em desc limit 1;
$$;
revoke execute on function public.agente_rascunho_atual(uuid) from public, anon, authenticated;

-- ============================================================================
-- Montar (ou atualizar) o rascunho. p_itens é a lista COMPLETA: [{"codigo": "14/19", "quantidade": 10}, ...]
-- ============================================================================
create function public.agente_montar_pedido(p_conversa uuid, p_itens jsonb, p_observacao text default null)
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
    'pedido_numero', v_ped.numero,
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

-- ============================================================================
-- Dados para o PDF do rascunho do agente (formato do DadosOrcamento da tela; o serviço de PDF desenha).
-- ============================================================================
create function public.agente_dados_orcamento(p_conversa uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ped public.pedidos;
  v_emi public.emissoras;
begin
  v_ped := public.agente_rascunho_atual(p_conversa);
  if v_ped.id is null then
    return jsonb_build_object('sucesso', false, 'aviso', 'Não há orçamento montado pelo agente nesta conversa: monte com montar_pedido.');
  end if;
  if not exists (select 1 from public.pedido_itens where pedido_id = v_ped.id) then
    return jsonb_build_object('sucesso', false, 'aviso', 'O orçamento está sem itens.');
  end if;
  select * into v_emi from public.emissoras where id = v_ped.emissora_id;
  if v_emi.id is null then
    select * into v_emi from public.emissoras where org_id = v_ped.org_id and padrao;
  end if;

  return jsonb_build_object(
    'sucesso', true,
    'org_id', v_ped.org_id,
    'pedido', to_jsonb(v_ped),
    'itens', (select jsonb_agg(to_jsonb(i) || jsonb_build_object('codigo', p.codigo, 'unidade', p.unidade) order by i.ordem)
                from public.pedido_itens i left join public.produtos p on p.id = i.produto_id
               where i.pedido_id = v_ped.id),
    'emissora', to_jsonb(v_emi),
    'logo_path', v_emi.logo_path,
    'cliente', (select jsonb_build_object('nome', coalesce(nullif(btrim(ct.nome), ''), ct.nome_whatsapp, ct.telefone, 'Cliente'),
                                          'empresa', ct.empresa, 'telefone', ct.telefone, 'email', ct.email)
                  from public.contatos ct where ct.id = v_ped.contato_id),
    'vendedor', (select jsonb_build_object('nome', coalesce(pf.nome, u.email::text, 'Equipe'), 'telefone', pf.telefone, 'email', u.email)
                   from auth.users u left join public.perfis pf on pf.user_id = u.id
                  where u.id = v_ped.responsavel_id)
  );
end $$;

-- ============================================================================
-- Enviar um arquivo (o PDF) na conversa, como o agente. Igual ao enviar_arquivo da equipe, sem auth.uid().
-- ============================================================================
create function public.agente_enviar_arquivo(p_conversa uuid, p_path text, p_nome text, p_legenda text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_mime text;
  v_tamanho bigint;
  v_tipo public.tipo_msg;
  v_legenda text := nullif(btrim(coalesce(p_legenda, '')), '');
  v_nome text := coalesce(nullif(left(btrim(coalesce(p_nome, '')), 200), ''), 'arquivo');
  v_msg uuid;
begin
  perform public.agente_marcar();
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    raise exception 'conversa não encontrada';
  end if;
  if v_conv.estado <> 'bot' then
    return jsonb_build_object('enviado', false, 'aviso', 'A conversa está com a equipe: não envie.');
  end if;
  if coalesce(p_path, '') not like v_conv.org_id::text || '/' || p_conversa::text || '/%' then
    raise exception 'arquivo não pertence a esta conversa';
  end if;
  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint into v_mime, v_tamanho
    from storage.objects o where o.bucket_id = 'midias' and o.name = p_path;
  if v_tamanho is null then
    raise exception 'arquivo não encontrado';
  end if;
  if exists (select 1 from public.mensagens where midia_path = p_path) then
    raise exception 'arquivo já enviado';
  end if;
  v_mime := coalesce(nullif(v_mime, ''), 'application/octet-stream');
  v_tipo := case
    when v_mime in ('image/jpeg', 'image/png') and v_tamanho <= 5242880 then 'imagem'
    when v_mime in ('video/mp4', 'video/3gpp') and v_tamanho <= 16777216 then 'video'
    else 'documento'
  end;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, midia_path, midia_mime, midia_nome, status_entrega)
  values (v_conv.org_id, p_conversa, 'saida', 'bot', v_tipo, v_legenda, p_path, v_mime, v_nome, 'pendente')
  returning id into v_msg;
  insert into public.fila_envio (org_id, conversa_id, mensagem_id) values (v_conv.org_id, p_conversa, v_msg);
  update public.conversas
     set ultima_mensagem_em = now(), ultima_mensagem_resumo = left('📎 ' || coalesce(v_legenda, v_nome), 140)
   where id = p_conversa;
  return jsonb_build_object('enviado', true, 'mensagem_id', v_msg);
end $$;

revoke execute on function
  public.agente_montar_pedido(uuid, jsonb, text), public.agente_dados_orcamento(uuid),
  public.agente_enviar_arquivo(uuid, text, text, text)
from public, anon, authenticated;
grant execute on function
  public.agente_montar_pedido(uuid, jsonb, text), public.agente_dados_orcamento(uuid),
  public.agente_enviar_arquivo(uuid, text, text, text)
to service_role;
