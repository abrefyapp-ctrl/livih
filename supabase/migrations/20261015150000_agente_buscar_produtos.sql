-- Ferramenta do agente: buscar produtos no cadastro em vez de ler o catálogo inteiro na base de conhecimento.
--
-- Motivo (15/10): na JoGrampo a base tinha 175 mil caracteres (catálogo de 277 produtos, máquinas duplicadas) e
-- ia inteira em toda resposta: ~95 mil tokens e R$ 0,13 por resposta, 16x o previsto. Com a busca, o agente recebe
-- só os produtos que o cliente perguntou.
--
-- Busca por palavras, sem acento e sem maiúscula: cada palavra precisa aparecer em nome, código, categoria, marca
-- ou detalhes. Se nenhum produto tem todas, devolve os que batem mais palavras (o agente decide se pergunta mais).

create function public.sem_acento(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;

create function public.agente_buscar_produtos(p_conversa uuid, p_busca text, p_limite integer default 8)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_termo text := public.sem_acento(btrim(coalesce(p_busca, '')));
  v_palavras text[];
  v_res jsonb;
  v_todas boolean := true;
begin
  select org_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then
    raise exception 'conversa não encontrada';
  end if;
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

revoke execute on function public.agente_buscar_produtos(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.agente_buscar_produtos(uuid, text, integer) to service_role;
