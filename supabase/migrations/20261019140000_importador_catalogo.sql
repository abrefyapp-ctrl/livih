-- Importador de catálogo com IA (item 7; plano em docs/importador-catalogo.md).
--
-- PDF, Excel, foto ou texto → a Edge Function importar-catalogo extrai os produtos em segundo plano e a tela mostra a
-- prévia de importação de sempre. Decisão de 19/10: catálogo de fornecedor entra SEM preço (o preço dele é custo).
-- Por isso, preço 0 passa a significar "sem preço": o agente não informa valor e o orçamento recusa o item.

-- ============================================================================
-- Importações (gravadas pela Edge Function; dono/admin acompanham)
-- ============================================================================
create table public.importacoes_catalogo (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  criado_por uuid references auth.users (id) on delete set null,
  origem text not null check (origem in ('pdf', 'imagem', 'texto', 'planilha')),
  nome text check (length(nome) <= 200),
  path text,
  modo_preco text not null check (modo_preco in ('venda', 'sem_preco')),
  status text not null default 'na_fila' check (status in ('na_fila', 'lendo', 'pronto', 'erro')),
  progresso integer not null default 0,
  total integer not null default 0,
  resultado jsonb,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index importacoes_catalogo_org_idx on public.importacoes_catalogo (org_id, criado_em desc);
create trigger importacoes_catalogo_atualizado_em before update on public.importacoes_catalogo
for each row execute function public.tocar_atualizado_em();

alter table public.importacoes_catalogo enable row level security;
create policy importacoes_catalogo_ver on public.importacoes_catalogo for select to authenticated
  using (public.tem_papel(org_id, '{dono,admin}'));
revoke insert, update, delete on public.importacoes_catalogo from anon, authenticated;

-- Arquivo enviado para importar (privado; só dono/admin da empresa).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('importacoes', 'importacoes', false, 52428800,
        '{application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain}')
on conflict (id) do nothing;
create policy "importacoes: dono e admin veem" on storage.objects for select to authenticated
  using (bucket_id = 'importacoes' and public.tem_papel(public.org_do_caminho(name), '{dono,admin}'));
create policy "importacoes: dono e admin sobem" on storage.objects for insert to authenticated
  with check (bucket_id = 'importacoes' and public.tem_papel(public.org_do_caminho(name), '{dono,admin}'));

alter table public.uso_ia drop constraint uso_ia_tipo_check;
alter table public.uso_ia add constraint uso_ia_tipo_check
  check (tipo in ('resposta', 'transcricao', 'descricao', 'simulador', 'importacao'));

-- ============================================================================
-- Produto sem preço (preço 0)
-- ============================================================================
create or replace function public.buscar_produtos_org(p_org uuid, p_busca text, p_limite integer default 8)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := p_org;
  v_termo text := public.sem_acento(btrim(coalesce(p_busca, '')));
  v_palavras text[];
  v_res jsonb;
  v_todas boolean := true;
begin
  if not public.modulo_ativo(v_org, 'erp') then
    return jsonb_build_object('encontrados', 0, 'aviso', 'Esta empresa não usa o cadastro de produtos.');
  end if;

  -- Palavras de 2+ letras, sem as que não ajudam a achar produto.
  select coalesce(array_agg(distinct w), '{}') into v_palavras
    from regexp_split_to_table(v_termo, '[^a-z0-9/.,-]+') w
   where length(w) >= 2 and w not in ('de', 'da', 'do', 'das', 'dos', 'para', 'com', 'um', 'uma', 'no', 'na', 'em', 'por', 'qual', 'quanto', 'preco', 'valor', 'tem', 'voces');
  if cardinality(v_palavras) = 0 then
    return jsonb_build_object('encontrados', 0, 'aviso', 'Diga o nome, a referência ou o tipo do produto para buscar.');
  end if;

  -- Ordem: nome/código igual à busca; mais palavras encontradas; mais palavras inteiras no nome/código ("prego"
  -- acha "Prego 2,05x45" antes de "Pregador"); palavras raras valem mais ("14/19" pesa mais que "grampo").
  with base as (
    select p.*,
           public.sem_acento(concat_ws(' ', p.nome, p.codigo, p.categoria, p.marca, p.descricao)) as texto,
           ' ' || regexp_replace(public.sem_acento(concat_ws(' ', p.nome, p.codigo)), '[^a-z0-9/,.-]+', ' ', 'g') || ' ' as titulo
      from public.produtos p
     where p.org_id = v_org and p.ativo
  ), palavras as (
    select w, greatest((select count(*) from base b where b.texto like '%' || w || '%'), 1) as freq
      from unnest(v_palavras) w
  ), pontos as (
    select b.*,
           (select count(*) from palavras pw where b.texto like '%' || pw.w || '%') as acertos,
           (select count(*) from palavras pw where b.titulo like '% ' || pw.w || ' %') as inteiras,
           (select coalesce(sum(1.0 / pw.freq), 0) from palavras pw where b.texto like '%' || pw.w || '%') as peso,
           (public.sem_acento(b.nome) = v_termo or public.sem_acento(b.codigo) = v_termo) as exato
      from base b
  ), escolhidos as (
    select * from pontos
     where acertos > 0
       and (acertos = cardinality(v_palavras) or not exists (select 1 from pontos where acertos = cardinality(v_palavras)))
     order by exato desc, acertos desc, inteiras desc, peso desc, length(nome)
     limit least(greatest(coalesce(p_limite, 8), 1), 20)
  )
  select jsonb_agg(jsonb_build_object(
           'nome', e.nome, 'codigo', e.codigo, 'unidade', e.unidade, 'preco', nullif(e.preco, 0),
           'preco_texto', case when e.preco = 0 then 'sob consulta: a equipe confirma o valor' end,
           'categoria', e.categoria, 'marca', e.marca, 'detalhes', e.descricao)
         order by e.exato desc, e.acertos desc, e.inteiras desc, e.peso desc, length(e.nome)),
         bool_and(e.acertos = cardinality(v_palavras))
    into v_res, v_todas
    from escolhidos e;

  return jsonb_build_object(
    'encontrados', coalesce(jsonb_array_length(v_res), 0),
    'produtos', coalesce(v_res, '[]'::jsonb),
    'aviso', case
      when v_res is null then 'Nenhum produto encontrado com esses termos. Não invente: pergunte mais detalhes ou chame a equipe.'
      when not v_todas then 'Nenhum produto tem todos os termos; estes são os mais próximos. Confirme com o cliente antes de passar preço.'
    end);
end $$;

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
    elsif v_prod.preco = 0 then
      v_nao := v_nao || jsonb_build_object('codigo', v_item ->> 'codigo', 'motivo', 'sem preço cadastrado: não informe valor; chame a equipe para confirmar');
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

create or replace function public.simulador_montar_pedido(p_org uuid, p_itens jsonb, p_observacao text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_prod public.produtos;
  v_qtd numeric;
  v_itens jsonb := '[]';
  v_nao jsonb := '[]';
  v_total numeric := 0;
  v_sub numeric;
begin
  if not public.modulo_ativo(p_org, 'erp') then
    return jsonb_build_object('sucesso', false, 'aviso', 'Esta empresa não monta pedidos pelo Livih: anote o pedido e chame a equipe.');
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    return jsonb_build_object('sucesso', false, 'aviso', 'Informe os itens: código do produto (da busca) e quantidade.');
  end if;
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := case when (v_item ->> 'quantidade') ~ '^\s*\d+([.,]\d+)?\s*$'
                  then replace(btrim(v_item ->> 'quantidade'), ',', '.')::numeric end;
    select * into v_prod from public.produtos
     where org_id = p_org and ativo and lower(codigo) = lower(btrim(v_item ->> 'codigo'))
     limit 1;
    if v_prod.id is null then
      v_nao := v_nao || jsonb_build_object('codigo', v_item ->> 'codigo', 'motivo', 'código não encontrado no cadastro (use o código que veio da busca)');
    elsif v_prod.preco = 0 then
      v_nao := v_nao || jsonb_build_object('codigo', v_item ->> 'codigo', 'motivo', 'sem preço cadastrado: não informe valor; chame a equipe para confirmar');
    elsif v_qtd is null or v_qtd <= 0 then
      v_nao := v_nao || jsonb_build_object('codigo', v_item ->> 'codigo', 'motivo', 'quantidade inválida');
    else
      v_sub := round(v_qtd * v_prod.preco, 2);
      v_total := v_total + v_sub;
      v_itens := v_itens || jsonb_build_object('codigo', v_prod.codigo, 'nome', left(v_prod.nome, 200), 'quantidade', v_qtd,
                                               'unidade', v_prod.unidade, 'preco_unitario', v_prod.preco, 'subtotal', v_sub);
    end if;
  end loop;
  if jsonb_array_length(v_itens) = 0 then
    return jsonb_build_object('sucesso', false, 'nao_encontrados', v_nao,
                              'aviso', 'Nenhum item válido: busque o produto de novo e use o código exato.');
  end if;
  return jsonb_build_object(
    'sucesso', true, 'simulado', true, 'orcamento_numero', 'TESTE', 'pedido_numero', 'TESTE',
    'itens', v_itens, 'total', v_total, 'total_formatado', public.reais(v_total), 'nao_encontrados', v_nao,
    'aviso', 'Frete não incluso: é calculado pela equipe.');
end $$;
