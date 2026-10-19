-- Busca de documentos: os "mais próximos" precisam bater no produto, não só no tipo do documento.
--
-- Caso (19/10, achado no simulador): "vista explodida do 80W e a do 14/45". Sem vista do 14/45 cadastrada, a busca
-- devolvia a do 80W como a mais próxima (batia "vista explodida") e o agente fazia uma pergunta confusa em vez de
-- dizer que a equipe envia. Agora, sem documento com todos os termos, só entra quem bate ao menos uma palavra que
-- não seja de tipo; se nenhum bater, volta "nenhum encontrado" e o agente chama a equipe.

create or replace function public.buscar_documentos_org(p_org uuid, p_busca text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := p_org;
  v_termo text := public.sem_acento(btrim(coalesce(p_busca, '')));
  v_palavras text[];
  v_res jsonb;
  v_todas boolean := true;
  v_genericas text[];
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

  -- Palavras que dizem só o TIPO do documento (as fixas e as dos tipos cadastrados pela empresa). Sozinhas, não
  -- bastam para um documento ser "o mais próximo": "vista explodida do 14/45" não pode devolver a do 80W.
  select array_agg(distinct w) into v_genericas
    from (select unnest(array['vista', 'vistas', 'explodida', 'explodidas', 'manual', 'manuais', 'catalogo', 'catalogos',
                              'ficha', 'tecnica', 'tabela', 'precos', 'preco', 'certificado', 'garantia', 'desenho',
                              'pecas', 'peca', 'foto', 'fotos', 'pdf', 'lista', 'folder', 'informacoes']) w
          union
          select regexp_split_to_table(public.sem_acento(tipo), '[^a-z0-9/.,-]+')
            from public.documentos where org_id = v_org and tipo is not null) t
   where length(w) >= 2;

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
           (select coalesce(sum(1.0 / pw.freq), 0) from palavras pw where b.texto like '%' || pw.w || '%') as peso,
           (select count(*) from palavras pw where b.texto like '%' || pw.w || '%' and pw.w <> all (v_genericas)) as especificos
      from base b
  ), escolhidos as (
    select * from pontos
     where acertos > 0
       and (acertos = cardinality(v_palavras)
            or (not exists (select 1 from pontos where acertos = cardinality(v_palavras)) and especificos > 0))
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
