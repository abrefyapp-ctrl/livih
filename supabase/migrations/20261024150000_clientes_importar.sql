-- Clientes, entrega 4 (docs/clientes.md): importar a planilha de clientes que a empresa já tem.
--
-- Dono e admin. Cada linha:
--   - acha o cliente pelo CNPJ/CPF; sem documento, pelo nome (só se houver exatamente um com esse nome, para a mesma
--     planilha poder ser importada de novo sem duplicar);
--   - achou: ATUALIZA só o que veio preenchido (célula vazia mantém o que está no cadastro, como nos produtos);
--   - não achou: cria, sem vendedor responsável (cliente da empresa: toda a equipe vê);
--   - celular na linha: liga ao contato com esse telefone (se ele ainda não tem cliente) ou cria o contato, também
--     sem responsável. Contato já ligado a outro cliente não muda.
-- CNPJ/CPF inválido não entra (a linha entra sem documento) e volta em "avisos". Tudo numa transação: erro em
-- qualquer linha desfaz a importação inteira.
--
-- p_linhas: [{"tipo"?, "nome"?, "razao_social"?, "documento"?, "inscricao_estadual"?, "cep"?, "logradouro"?, "numero"?,
--   "complemento"?, "bairro"?, "cidade"?, "uf"?, "email"?, "telefone"?, "observacoes"?, "celular"?, "contato"?}]
-- Devolve {"criados", "atualizados", "contatos_criados", "contatos_ligados", "avisos": [texto]}.

create function public.clientes_importar(p_org uuid, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_linha jsonb;
  v_n integer := 0;
  v_doc text;
  v_tipo text;
  v_nome text;
  v_cli uuid;
  v_ct public.contatos;
  v_cel text;
  v_criados integer := 0;
  v_atualizados integer := 0;
  v_ct_criados integer := 0;
  v_ct_ligados integer := 0;
  v_avisos jsonb := '[]';
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin importam clientes';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'a planilha não tem linhas';
  end if;
  if jsonb_array_length(p_linhas) > 5000 then
    raise exception 'no máximo 5.000 linhas por importação';
  end if;

  for v_linha in select x from jsonb_array_elements(p_linhas) x loop
    v_n := v_n + 1;
    -- Normaliza: só o texto útil de cada campo.
    select jsonb_object_agg(k, nullif(btrim(v), '')) into v_linha
      from jsonb_each_text(v_linha) as e(k, v);
    v_doc := nullif(regexp_replace(coalesce(v_linha ->> 'documento', ''), '\D', '', 'g'), '');
    v_tipo := case when lower(coalesce(v_linha ->> 'tipo', '')) in ('pf', 'cpf', 'pessoa fisica', 'pessoa física', 'fisica', 'física') then 'pf'
                   when lower(coalesce(v_linha ->> 'tipo', '')) in ('pj', 'cnpj', 'pessoa juridica', 'pessoa jurídica', 'juridica', 'jurídica', 'empresa') then 'pj'
                   when length(v_doc) = 11 then 'pf'
                   else 'pj' end;
    if v_doc is not null and not ((v_tipo = 'pj' and public.cnpj_valido(v_doc)) or (v_tipo = 'pf' and public.cpf_valido(v_doc))) then
      v_avisos := v_avisos || to_jsonb(format('Linha %s: %s %s inválido, entrou sem documento.', v_n,
                                              case when v_tipo = 'pf' then 'CPF' else 'CNPJ' end, v_linha ->> 'documento'));
      v_doc := null;
    end if;
    v_nome := left(coalesce(v_linha ->> 'nome', v_linha ->> 'razao_social'), 200);
    if v_nome is null and v_doc is null then
      v_avisos := v_avisos || to_jsonb(format('Linha %s: sem nome nem CNPJ/CPF, ignorada.', v_n));
      continue;
    end if;
    -- CEP e UF fora do formato não derrubam a linha: ficam de fora, com aviso.
    if v_linha ->> 'cep' is not null and regexp_replace(v_linha ->> 'cep', '\D', '', 'g') !~ '^\d{8}$' then
      v_avisos := v_avisos || to_jsonb(format('Linha %s: CEP "%s" ignorado (precisa de 8 números).', v_n, v_linha ->> 'cep'));
      v_linha := v_linha - 'cep';
    end if;
    if v_linha ->> 'uf' is not null and upper(v_linha ->> 'uf') !~ '^[A-Z]{2}$' then
      v_avisos := v_avisos || to_jsonb(format('Linha %s: UF "%s" ignorada (use a sigla, ex.: PR).', v_n, v_linha ->> 'uf'));
      v_linha := v_linha - 'uf';
    end if;

    v_cli := null;
    if v_doc is not null then
      select id into v_cli from public.clientes where org_id = p_org and documento = v_doc;
    elsif v_nome is not null then
      select min(id::text)::uuid into v_cli from public.clientes
       where org_id = p_org and lower(nome) = lower(v_nome)
      having count(*) = 1;
    end if;

    if v_cli is null then
      if v_nome is null then
        v_nome := left(v_doc, 200);
      end if;
      insert into public.clientes (org_id, tipo, nome, razao_social, documento, inscricao_estadual, cep, logradouro, numero,
                                   complemento, bairro, cidade, uf, email, telefone, observacoes)
      values (p_org, v_tipo, v_nome, left(v_linha ->> 'razao_social', 200), v_doc, left(v_linha ->> 'inscricao_estadual', 30),
              v_linha ->> 'cep', left(v_linha ->> 'logradouro', 200), left(v_linha ->> 'numero', 20),
              left(v_linha ->> 'complemento', 100), left(v_linha ->> 'bairro', 100), left(v_linha ->> 'cidade', 100),
              v_linha ->> 'uf', left(v_linha ->> 'email', 200), left(v_linha ->> 'telefone', 30), left(v_linha ->> 'observacoes', 2000))
      returning id into v_cli;
      -- Cliente da empresa (o gatilho põe quem criou; importação é para a equipe toda).
      update public.clientes set responsavel_id = null where id = v_cli;
      v_criados := v_criados + 1;
    else
      update public.clientes c set
        tipo = case when v_doc is not null then v_tipo else c.tipo end,
        nome = coalesce(left(v_linha ->> 'nome', 200), c.nome),
        documento = coalesce(v_doc, c.documento),
        razao_social = coalesce(left(v_linha ->> 'razao_social', 200), c.razao_social),
        inscricao_estadual = coalesce(left(v_linha ->> 'inscricao_estadual', 30), c.inscricao_estadual),
        cep = coalesce(v_linha ->> 'cep', c.cep),
        logradouro = coalesce(left(v_linha ->> 'logradouro', 200), c.logradouro),
        numero = coalesce(left(v_linha ->> 'numero', 20), c.numero),
        complemento = coalesce(left(v_linha ->> 'complemento', 100), c.complemento),
        bairro = coalesce(left(v_linha ->> 'bairro', 100), c.bairro),
        cidade = coalesce(left(v_linha ->> 'cidade', 100), c.cidade),
        uf = coalesce(v_linha ->> 'uf', c.uf),
        email = coalesce(left(v_linha ->> 'email', 200), c.email),
        telefone = coalesce(left(v_linha ->> 'telefone', 30), c.telefone),
        observacoes = coalesce(left(v_linha ->> 'observacoes', 2000), c.observacoes)
       where c.id = v_cli;
      v_atualizados := v_atualizados + 1;
    end if;

    -- Celular → contato do WhatsApp (mesmo formato de contatos.telefone: só números, com 55).
    v_cel := regexp_replace(coalesce(v_linha ->> 'celular', ''), '\D', '', 'g');
    if length(v_cel) in (10, 11) then
      v_cel := '55' || v_cel;
    end if;
    if v_cel <> '' and v_cel ~ '^[0-9]{12,15}$' then
      select * into v_ct from public.contatos where org_id = p_org and telefone = v_cel;
      if v_ct.id is null then
        insert into public.contatos (org_id, telefone, nome, origem, cliente_id)
        values (p_org, v_cel, coalesce(left(v_linha ->> 'contato', 200), v_nome), 'importacao', v_cli)
        returning * into v_ct;
        update public.contatos set responsavel_id = null where id = v_ct.id;
        v_ct_criados := v_ct_criados + 1;
      elsif v_ct.cliente_id is null then
        update public.contatos set cliente_id = v_cli where id = v_ct.id;
        v_ct_ligados := v_ct_ligados + 1;
      elsif v_ct.cliente_id <> v_cli then
        v_avisos := v_avisos || to_jsonb(format('Linha %s: o celular %s já é de um contato ligado a outro cliente; ficou como estava.', v_n, v_linha ->> 'celular'));
      end if;
    elsif v_cel <> '' then
      v_avisos := v_avisos || to_jsonb(format('Linha %s: celular "%s" ignorado (use DDD + número).', v_n, v_linha ->> 'celular'));
    end if;
  end loop;

  perform public.auditar(p_org, 'clientes_importar', 'clientes', null, null,
                         jsonb_build_object('linhas', v_n, 'criados', v_criados, 'atualizados', v_atualizados));
  return jsonb_build_object('criados', v_criados, 'atualizados', v_atualizados, 'contatos_criados', v_ct_criados,
                            'contatos_ligados', v_ct_ligados, 'avisos', v_avisos);
end $$;

revoke execute on function public.clientes_importar(uuid, jsonb) from public, anon;
grant execute on function public.clientes_importar(uuid, jsonb) to authenticated;
