-- Simulador de conversa (item 6 do roadmap; plano em docs/simulador-agente.md).
--
-- Testar o agente sem WhatsApp: um workflow separado no n8n (LvhSimuladorAg01), gerado do mesmo script do agente
-- (mesmo prompt, mesmas ferramentas), recebe a conversa de teste inteira a cada pergunta e não grava nada. Leituras
-- são reais (produtos, documentos, base); o que gravaria (orçamento, envio, chamar a equipe) só é simulado.
--
-- Para não duplicar as buscas, o corpo delas passa para funções por empresa; as do agente só acham a empresa da
-- conversa e chamam essas.

-- ============================================================================
-- Buscas por empresa (mesmo corpo de antes, sem depender de conversa)
-- ============================================================================
create function public.buscar_produtos_org(p_org uuid, p_busca text, p_limite integer default 8)
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
           'nome', e.nome, 'codigo', e.codigo, 'unidade', e.unidade, 'preco', e.preco,
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

create function public.buscar_documentos_org(p_org uuid, p_busca text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := p_org;
  v_termo text := public.sem_acento(btrim(coalesce(p_busca, '')));
  v_palavras text[];
  v_res jsonb;
  v_todas boolean := true;
begin
  if not exists (select 1 from public.documentos where org_id = v_org and ativo) then
    return jsonb_build_object('encontrados', 0,
      'aviso', 'Esta empresa não tem documentos cadastrados. Não prometa o arquivo: diga que a equipe envia e chame chamar_humano.');
  end if;

  select coalesce(array_agg(distinct w), '{}') into v_palavras
    from regexp_split_to_table(v_termo, '[^a-z0-9/.,-]+') w
   where length(w) >= 2 and w not in ('de', 'da', 'do', 'das', 'dos', 'para', 'com', 'um', 'uma', 'no', 'na', 'em',
                                      'por', 'me', 'manda', 'mande', 'mandar', 'envia', 'envie', 'enviar', 'o', 'os',
                                      'as', 'arquivo', 'documento');
  if cardinality(v_palavras) = 0 then
    return jsonb_build_object('encontrados', 0, 'aviso', 'Diga o produto, o modelo ou o tipo de documento para buscar.');
  end if;

  with base as (
    select d.id, d.titulo, d.tipo,
           public.sem_acento(concat_ws(' ', d.titulo, d.tipo, d.descricao, d.palavras_chave,
             (select string_agg(concat_ws(' ', p.nome, p.codigo), ' ')
                from public.documentos_produtos dp join public.produtos p on p.id = dp.produto_id
               where dp.documento_id = d.id))) as texto,
           (select jsonb_agg(p.nome order by p.nome)
              from public.documentos_produtos dp join public.produtos p on p.id = dp.produto_id
             where dp.documento_id = d.id) as produtos
      from public.documentos d
     where d.org_id = v_org and d.ativo
  ), palavras as (
    select w, greatest((select count(*) from base b where b.texto like '%' || w || '%'), 1) as freq
      from unnest(v_palavras) w
  ), pontos as (
    select b.*,
           (select count(*) from palavras pw where b.texto like '%' || pw.w || '%') as acertos,
           (select coalesce(sum(1.0 / pw.freq), 0) from palavras pw where b.texto like '%' || pw.w || '%') as peso
      from base b
  ), escolhidos as (
    select * from pontos
     where acertos > 0
       and (acertos = cardinality(v_palavras) or not exists (select 1 from pontos where acertos = cardinality(v_palavras)))
     order by acertos desc, peso desc, length(titulo)
     limit 5
  )
  select jsonb_agg(jsonb_build_object('id', e.id, 'titulo', e.titulo, 'tipo', e.tipo, 'produtos', e.produtos)
                   order by e.acertos desc, e.peso desc, length(e.titulo)),
         bool_and(e.acertos = cardinality(v_palavras))
    into v_res, v_todas
    from escolhidos e;

  return jsonb_build_object(
    'encontrados', coalesce(jsonb_array_length(v_res), 0),
    'documentos', coalesce(v_res, '[]'::jsonb),
    'aviso', case
      when v_res is null then 'Nenhum documento encontrado. Não prometa o arquivo: diga que a equipe envia e chame chamar_humano.'
      when not v_todas then 'Nenhum documento tem todos os termos; estes são os mais próximos. Confirme com o cliente antes de enviar.'
    end);
end $$;

create or replace function public.agente_buscar_produtos(p_conversa uuid, p_busca text, p_limite integer default 8)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then
    raise exception 'conversa não encontrada';
  end if;
  return public.buscar_produtos_org(v_org, p_busca, p_limite);
end $$;

create or replace function public.agente_buscar_documentos(p_conversa uuid, p_busca text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then
    raise exception 'conversa não encontrada';
  end if;
  return public.buscar_documentos_org(v_org, p_busca);
end $$;

-- ============================================================================
-- Contexto da conversa de teste: mesmo formato do agente_contexto, montado com as mensagens que a tela manda.
-- Instruções e regras podem vir do formulário ainda não salvo (testar antes de salvar).
-- ============================================================================
create function public.agente_contexto_simulado(p_org uuid, p_mensagens jsonb, p_prompt text default null,
                                                p_casos jsonb default null)
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
    'base_conhecimento', (select string_agg('## ' || b.titulo || E'\n\n' || b.conteudo, E'\n\n---\n\n' order by b.titulo)
                            from public.base_conhecimento b where b.org_id = p_org and b.ativo),
    'contato', jsonb_build_object('nome', null, 'nome_whatsapp', 'Cliente de teste', 'telefone', null, 'empresa', null,
                                  'email', null, 'dados', '{}'::jsonb),
    'oportunidade', null,
    'etapas', (select jsonb_agg(e.nome order by e.ordem) from public.etapas_funil e where e.org_id = p_org),
    'mensagens', (select coalesce(jsonb_agg(jsonb_build_object(
                     'de', case when t.m ->> 'de' = 'assistente' then 'assistente' else 'cliente' end,
                     'tipo', 'texto', 'texto', left(coalesce(t.m ->> 'texto', ''), 4000), 'descricao', null,
                     'em', v_agora, 'anterior', false) order by t.ord), '[]'::jsonb)
                    from jsonb_array_elements(p_mensagens) with ordinality t(m, ord))
  );
end $$;

-- Orçamento de teste: mesma conferência do agente_montar_pedido (código do cadastro, quantidade, preço do cadastro),
-- sem gravar pedido nem aviso na conversa.
create function public.simulador_montar_pedido(p_org uuid, p_itens jsonb, p_observacao text default null)
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

-- Documento de teste: confere que existe e está ativo, sem copiar nem enviar.
create function public.simulador_documento(p_org uuid, p_documento uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('enviado', true, 'simulado', true, 'titulo', d.titulo)
       from public.documentos d where d.id = p_documento and d.org_id = p_org and d.ativo),
    jsonb_build_object('enviado', false,
      'aviso', 'Documento não encontrado. Use um id devolvido por buscar_documentos; se não houver, chame a equipe.'));
$$;

-- ============================================================================
-- Limite de uso (o teste custa IA de verdade) e consumo
-- ============================================================================
create table public.simulacoes_agente (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index simulacoes_agente_org_idx on public.simulacoes_agente (org_id, criado_em desc);
alter table public.simulacoes_agente enable row level security;
revoke all on public.simulacoes_agente from anon, authenticated;

-- 200 respostas de teste por empresa em 24 h. Devolve se pode seguir (e já conta esta).
create function public.simulador_registrar(p_org uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.simulacoes_agente where org_id = p_org and criado_em > now() - interval '24 hours') >= 200 then
    return false;
  end if;
  insert into public.simulacoes_agente (org_id, user_id) values (p_org, p_user);
  return true;
end $$;

-- O coletor da VPS grava o consumo do simulador como 'simulador' (fora da contagem de respostas ao cliente).
alter table public.uso_ia drop constraint uso_ia_tipo_check;
alter table public.uso_ia add constraint uso_ia_tipo_check check (tipo in ('resposta', 'transcricao', 'descricao', 'simulador'));

revoke execute on function
  public.buscar_produtos_org(uuid, text, integer), public.buscar_documentos_org(uuid, text),
  public.agente_contexto_simulado(uuid, jsonb, text, jsonb), public.simulador_montar_pedido(uuid, jsonb, text),
  public.simulador_documento(uuid, uuid), public.simulador_registrar(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.buscar_produtos_org(uuid, text, integer), public.buscar_documentos_org(uuid, text),
  public.agente_contexto_simulado(uuid, jsonb, text, jsonb), public.simulador_montar_pedido(uuid, jsonb, text),
  public.simulador_documento(uuid, uuid), public.simulador_registrar(uuid, uuid)
to service_role;
