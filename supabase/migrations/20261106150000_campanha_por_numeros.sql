-- Campanha para uma lista de números digitada na hora (docs/campanhas.md; pedido de 06/11).
--
-- Antes o público vinha só dos filtros sobre os contatos já cadastrados. Caso real: mandar o modelo para 5 vidraçarias
-- que nunca falaram com a empresa, sem cadastrar cada uma antes. Agora a campanha aceita p_dados.numeros
-- ([{telefone, nome}], até 500) no lugar dos filtros:
--   - o número que já é contato entra como está (o nome digitado só preenche se o contato não tiver nome);
--   - o número novo vira contato na hora (origem 'campanha', sem vendedor, como na importação), para a resposta cair
--     em Conversas e o agente atender;
--   - p_dados.etiqueta (opcional) marca todos, para achar a lista depois (ex.: "vidraçaria");
--   - quem pediu para não receber campanhas fica de fora, como no público por filtros.
-- O resto da campanha (modelo, variáveis, limite por dia, consentimento) é igual.

create or replace function public.campanha_criar(p_org uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_modelo jsonb := p_dados -> 'modelo';
  v_n integer;
  v_var jsonb;
  v_numeros jsonb := nullif(p_dados -> 'numeros', 'null'::jsonb);
  v_etiqueta text := nullif(left(btrim(coalesce(p_dados ->> 'etiqueta', '')), 40), '');
  v_linha jsonb;
  v_tel text;
  v_nome text;
  v_ct uuid;
  v_contatos uuid[] := '{}';
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin fazem campanhas';
  end if;
  if coalesce((p_dados ->> 'consentimento')::boolean, false) is not true then
    raise exception 'confirme que os contatos autorizaram receber mensagens da empresa';
  end if;
  if not exists (select 1 from public.canais where id = (p_dados ->> 'canal_id')::uuid and org_id = p_org and ativo and tipo = 'meta') then
    raise exception 'campanha só sai por número da API oficial';
  end if;
  if coalesce(v_modelo ->> 'nome', '') !~ '^[a-z0-9_]+$' or coalesce(v_modelo ->> 'idioma', '') !~ '^[a-z]{2}(_[A-Z]{2})?$'
     or coalesce(btrim(v_modelo ->> 'corpo'), '') = '' then
    raise exception 'modelo inválido';
  end if;
  -- Uma variável para cada {{n}} do corpo; fixa não pode ficar vazia (a Meta recusa parâmetro vazio).
  select count(distinct m[1]) into v_n from regexp_matches(v_modelo ->> 'corpo', '\{\{\s*(\d+)\s*\}\}', 'g') m;
  if jsonb_array_length(coalesce(v_modelo -> 'variaveis', '[]')) <> v_n then
    raise exception 'preencha todas as variáveis do modelo';
  end if;
  for v_var in select * from jsonb_array_elements(coalesce(v_modelo -> 'variaveis', '[]')) loop
    if v_var ->> 'fonte' not in ('nome', 'empresa', 'fixo')
       or (v_var ->> 'fonte' = 'fixo' and coalesce(btrim(v_var ->> 'valor'), '') = '') then
      raise exception 'preencha todas as variáveis do modelo';
    end if;
  end loop;

  -- Lista de números: acha ou cria cada contato.
  if v_numeros is not null then
    if jsonb_typeof(v_numeros) <> 'array' or jsonb_array_length(v_numeros) = 0 then
      raise exception 'nenhum número na lista';
    end if;
    if jsonb_array_length(v_numeros) > 500 then
      raise exception 'no máximo 500 números por campanha';
    end if;
    for v_linha in select x from jsonb_array_elements(v_numeros) x loop
      v_tel := regexp_replace(coalesce(v_linha ->> 'telefone', ''), '\D', '', 'g');
      if length(v_tel) in (10, 11) then
        v_tel := '55' || v_tel;
      end if;
      if v_tel !~ '^[0-9]{12,15}$' then
        raise exception 'número inválido na lista: %', coalesce(v_linha ->> 'telefone', '');
      end if;
      v_nome := nullif(left(btrim(coalesce(v_linha ->> 'nome', '')), 200), '');
      select id into v_ct from public.contatos where org_id = p_org and telefone = v_tel;
      if v_ct is null then
        insert into public.contatos (org_id, telefone, nome, tags, origem)
        values (p_org, v_tel, v_nome, case when v_etiqueta is null then '{}'::text[] else array[v_etiqueta] end, 'campanha')
        returning id into v_ct;
        -- O gatilho põe quem criou como vendedor; o contato da lista é da equipe toda, como na importação.
        update public.contatos set responsavel_id = null where id = v_ct;
      else
        update public.contatos c set
          nome = coalesce(nullif(btrim(c.nome), ''), v_nome),
          tags = case when v_etiqueta is null or v_etiqueta = any (c.tags) then c.tags else c.tags || v_etiqueta end
         where c.id = v_ct;
      end if;
      if not v_ct = any (v_contatos) then
        v_contatos := v_contatos || v_ct;
      end if;
    end loop;
  end if;

  insert into public.campanhas (org_id, nome, canal_id, modelo, filtros, agendada_para, limite_dia)
  values (p_org, left(btrim(coalesce(p_dados ->> 'nome', '')), 120), (p_dados ->> 'canal_id')::uuid, v_modelo,
          case when v_numeros is null then coalesce(p_dados -> 'filtros', '{}')
               else jsonb_build_object('numeros', cardinality(v_contatos)) || coalesce(jsonb_build_object('etiqueta', v_etiqueta), '{}') end,
          coalesce((p_dados ->> 'agendada_para')::timestamptz, now()),
          coalesce((p_dados ->> 'limite_dia')::integer, 250))
  returning id into v_id;

  if v_numeros is null then
    insert into public.campanha_destinatarios (org_id, campanha_id, contato_id)
    select p_org, v_id, e.contato_id from public.campanha_elegiveis(p_org, coalesce(p_dados -> 'filtros', '{}')) e;
    if not found then
      raise exception 'nenhum contato com esses filtros';
    end if;
  else
    insert into public.campanha_destinatarios (org_id, campanha_id, contato_id)
    select p_org, v_id, c.id from public.contatos c where c.id = any (v_contatos) and c.descadastrado_em is null;
    if not found then
      raise exception 'nenhum número da lista pode receber: todos pediram para não receber campanhas';
    end if;
  end if;
  return v_id;
end $$;
