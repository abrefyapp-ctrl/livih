-- CNPJ alfanumérico (Receita Federal, IN RFB 2.229/2024; inscrições novas desde 07/2026). Passo 3 das pendências de
-- 01/11, antes de cadastrar cliente novo: o CNPJ passa a ter 12 caracteres de letras maiúsculas ou números e 2 dígitos
-- verificadores numéricos (12.ABC.345/01DE-35). Os CNPJs só de números continuam válidos com a mesma conta.
--
-- Até aqui o banco tirava tudo o que não fosse número ('\D') antes de validar: o CNPJ com letras virava outro, e a
-- conta recusava. Agora:
--   - cnpj_valido: cada caractere vale o código ASCII menos 48 (0–9 = 0–9, A = 17 … Z = 42), com os mesmos pesos e o
--     mesmo módulo 11 do CNPJ numérico (conta da Receita; conferida com o exemplo oficial 12ABC34501DE35);
--   - limpar_documento: tira pontuação e espaços e põe as letras em maiúsculas. Substitui o '\D' onde entra CNPJ, CPF ou
--     chave de acesso (cliente, importação de clientes e de OS, dados de cobrança, fornecedor do financeiro e nota de
--     entrada); CEP e telefone seguem só com números;
--   - chave de acesso da NF-e (44) e da NFS-e nacional (50): levam o CNPJ do emitente, então também podem ter letras;
--   - documento_cliente (agente): tenta com as letras e, se não fechar, só com os números, como antes (o cliente pode
--     escrever "meu CNPJ é 11.222.333/0001-81" e o agente mandar a frase inteira).
-- As funções abaixo são cópia da versão mais recente de cada uma, só com a limpeza do documento trocada.

create function public.limpar_documento(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g')), '');
$$;
comment on function public.limpar_documento(text) is
  'CNPJ (com letras, desde 07/2026), CPF ou chave de acesso sem pontuação e em maiúsculas; vazio vira nulo.';
revoke execute on function public.limpar_documento(text) from public, anon;
grant execute on function public.limpar_documento(text) to authenticated, service_role;

create or replace function public.cnpj_valido(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  pesos1 int[] := '{5,4,3,2,9,8,7,6,5,4,3,2}';
  pesos2 int[] := '{6,5,4,3,2,9,8,7,6,5,4,3,2}';
  s int;
  dv int;
begin
  if p is null or p !~ '^[0-9A-Z]{12}[0-9]{2}$' or p ~ '^(.)\1{13}$' then
    return false;
  end if;
  s := 0;
  for i in 1..12 loop s := s + (ascii(substr(p, i, 1)) - 48) * pesos1[i]; end loop;
  dv := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  if dv <> ascii(substr(p, 13, 1)) - 48 then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + (ascii(substr(p, i, 1)) - 48) * pesos2[i]; end loop;
  dv := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return dv = ascii(substr(p, 14, 1)) - 48;
end $$;

create or replace function public.documento_cliente(p text, out tipo text, out documento text)
language plpgsql immutable set search_path = '' as $$
declare
  v text := coalesce(public.limpar_documento(p), '');
  n text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  -- Sem fechar com as letras (frase inteira: "meu CNPJ é …"), tenta só com os números, como antes.
  if not (public.cnpj_valido(v) or public.cpf_valido(v)) then
    v := n;
  end if;
  if length(v) = 14 and public.cnpj_valido(v) then tipo := 'pj'; documento := v;
  elsif length(v) = 11 and public.cpf_valido(v) then tipo := 'pf'; documento := v;
  end if;
end $$;

-- ---------- colunas com CNPJ ou chave de acesso ----------
alter table public.fin_lancamentos drop constraint fin_lancamentos_fornecedor_cnpj_check;
alter table public.fin_lancamentos add constraint fin_lancamentos_fornecedor_cnpj_check
  check (fornecedor_cnpj ~ '^\d{11}$|^[0-9A-Z]{12}\d{2}$');
alter table public.produtos_fornecedores drop constraint produtos_fornecedores_fornecedor_cnpj_check;
alter table public.produtos_fornecedores add constraint produtos_fornecedores_fornecedor_cnpj_check
  check (fornecedor_cnpj ~ '^\d{11}$|^[0-9A-Z]{12}\d{2}$');
alter table public.notas_entrada drop constraint notas_entrada_emitente_cnpj_check;
alter table public.notas_entrada add constraint notas_entrada_emitente_cnpj_check
  check (emitente_cnpj ~ '^\d{11}$|^[0-9A-Z]{12}\d{2}$');
alter table public.notas_entrada drop constraint notas_entrada_chave_check;
alter table public.notas_entrada add constraint notas_entrada_chave_check check (chave ~ '^[0-9A-Z]{44}$');
alter table public.notas_fiscais drop constraint notas_fiscais_chave_check;
alter table public.notas_fiscais add constraint notas_fiscais_chave_check check (chave ~ '^([0-9A-Z]{44}|[0-9A-Z]{50})$');

-- ---------- funções que limpavam o documento com '\D' ----------

-- clientes_preparar: da migration 20261024120000, só com a limpeza do documento trocada.
create or replace function public.clientes_preparar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.documento := public.limpar_documento(new.documento);
  new.cep := nullif(regexp_replace(coalesce(new.cep, ''), '\D', '', 'g'), '');
  new.uf := nullif(upper(btrim(coalesce(new.uf, ''))), '');
  new.nome := btrim(new.nome);
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' and new.responsavel_id is null
       and exists (select 1 from public.membros_org where org_id = new.org_id and user_id = auth.uid() and ativo) then
      new.responsavel_id := auth.uid();
    end if;
    if tg_op = 'UPDATE' and new.responsavel_id is distinct from old.responsavel_id
       and not public.tem_papel(new.org_id, '{dono,admin}') then
      raise exception 'só dono e admin trocam o vendedor responsável pelo cliente';
    end if;
  end if;
  if new.responsavel_id is not null and not exists (
    select 1 from public.membros_org where org_id = new.org_id and user_id = new.responsavel_id
  ) then
    raise exception 'o responsável precisa ser da equipe';
  end if;
  return new;
end $$;

-- os_importar: da migration 20261024140000, só com a limpeza do documento trocada.
create or replace function public.os_importar(p_org uuid, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_linha jsonb;
  v_chave text;
  v_os uuid;
  v_tipo uuid;
  v_item uuid;
  v_passo jsonb;
  v_etapa uuid;
  v_data date;
  v_ordens jsonb := '{}';
  v_n_itens integer := 0;
  v_primeira uuid;
  v_cliente uuid;
  v_doc text;
  v_nome text;
  v_criados integer := 0;
begin
  if not public.os_gerente(p_org) then
    raise exception 'só dono e admin importam';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'a planilha não tem linhas';
  end if;
  if jsonb_array_length(p_linhas) > 2000 then
    raise exception 'no máximo 2.000 linhas por importação';
  end if;
  perform public.os_preparar(p_org);
  select id into v_primeira from public.os_etapas where org_id = p_org and ativo order by ordem limit 1;

  perform set_config('livih.os_importando', 'on', true);
  for v_linha in select x from jsonb_array_elements(p_linhas) x loop
    if nullif(v_linha ->> 'recebida_em', '') is null then
      raise exception 'linha sem data de recebimento';
    end if;
    -- Cliente da linha: o informado; senão pelo CNPJ/CPF; pelo contato; pelo nome (fantasia ou razão social); senão
    -- cria (documento só se for válido).
    v_cliente := nullif(v_linha ->> 'cliente_id', '')::uuid;
    v_doc := public.limpar_documento(v_linha ->> 'documento');
    v_nome := nullif(btrim(coalesce(v_linha ->> 'cliente', '')), '');
    if v_cliente is not null and not exists (select 1 from public.clientes where id = v_cliente and org_id = p_org) then
      raise exception 'cliente inválido na importação';
    end if;
    if v_cliente is null and v_doc is not null then
      select id into v_cliente from public.clientes where org_id = p_org and documento = v_doc;
    end if;
    if v_cliente is null and nullif(v_linha ->> 'contato_id', '') is not null then
      select cliente_id into v_cliente from public.contatos where id = (v_linha ->> 'contato_id')::uuid and org_id = p_org;
    end if;
    if v_cliente is null and v_nome is not null then
      select id into v_cliente from public.clientes
       where org_id = p_org and (lower(nome) = lower(v_nome) or lower(razao_social) = lower(v_nome))
       order by ativo desc, criado_em limit 1;
    end if;
    if v_cliente is null and v_nome is not null then
      insert into public.clientes (org_id, tipo, nome, documento)
      values (p_org, case when length(v_doc) = 11 then 'pf' else 'pj' end, left(v_nome, 200),
              case when (length(v_doc) = 14 and public.cnpj_valido(v_doc)) or (length(v_doc) = 11 and public.cpf_valido(v_doc))
                   then v_doc end)
      returning id into v_cliente;
      v_criados := v_criados + 1;
    end if;
    v_chave := concat_ws('|', coalesce(v_cliente::text, lower(coalesce(v_nome, ''))), v_linha ->> 'contato_id',
                         btrim(coalesce(v_linha ->> 'nf_cliente', '')), btrim(coalesce(v_linha ->> 'numero_cliente', '')),
                         v_linha ->> 'recebida_em');
    v_os := (v_ordens ->> v_chave)::uuid;
    if v_os is null then
      insert into public.ordens_servico (org_id, contato_id, cliente_id, cliente_nome, nf_cliente, numero_cliente, recebida_em)
      values (p_org, nullif(v_linha ->> 'contato_id', '')::uuid, v_cliente, v_nome, nullif(btrim(v_linha ->> 'nf_cliente'), ''),
              nullif(btrim(v_linha ->> 'numero_cliente'), ''), (v_linha ->> 'recebida_em')::date)
      returning id into v_os;
      v_ordens := v_ordens || jsonb_build_object(v_chave, v_os);
    end if;

    v_tipo := null;
    if nullif(btrim(v_linha ->> 'tipo'), '') is not null then
      select id into v_tipo from public.os_tipos_item where org_id = p_org and ativo and lower(nome) = lower(btrim(v_linha ->> 'tipo'));
      if v_tipo is null then
        insert into public.os_tipos_item (org_id, nome) values (p_org, btrim(v_linha ->> 'tipo')) returning id into v_tipo;
      end if;
    end if;

    -- Entra na primeira etapa no recebimento; os passos da planilha seguem em ordem de data.
    insert into public.os_itens (org_id, os_id, tipo_id, modelo, identificacao, valor, observacao, cobranca, etapa_id, etapa_desde, ordem)
    values (p_org, v_os, v_tipo, nullif(btrim(v_linha ->> 'modelo'), ''), nullif(btrim(v_linha ->> 'identificacao'), ''),
            coalesce(nullif(v_linha ->> 'valor', '')::numeric, 0), nullif(btrim(v_linha ->> 'observacao'), ''),
            coalesce(nullif(v_linha ->> 'cobranca', ''), 'cobrado'), v_primeira, (v_linha ->> 'recebida_em')::date, v_n_itens)
    returning id into v_item;
    v_n_itens := v_n_itens + 1;

    perform set_config('livih.os_item', 'on', true);
    for v_passo in select x from jsonb_array_elements(coalesce(v_linha -> 'etapas', '[]')) x order by (x ->> 'data')::date loop
      v_etapa := (v_passo ->> 'etapa_id')::uuid;
      v_data := (v_passo ->> 'data')::date;
      if not exists (select 1 from public.os_etapas where id = v_etapa and org_id = p_org and ativo) then
        raise exception 'etapa inválida na importação';
      end if;
      if v_etapa <> (select etapa_id from public.os_itens where id = v_item) then
        insert into public.os_item_historico (org_id, item_id, etapa_de, etapa_para, data, importado, autor_id)
        select p_org, v_item, etapa_id, v_etapa, greatest(v_data, etapa_desde), true, auth.uid() from public.os_itens where id = v_item;
        update public.os_itens set etapa_id = v_etapa, etapa_desde = greatest(v_data, etapa_desde) where id = v_item;
      end if;
    end loop;
    update public.os_itens
       set desfecho = nullif(v_linha ->> 'desfecho', ''),
           desfecho_em = case when nullif(v_linha ->> 'desfecho', '') is null then null
                              else coalesce(nullif(v_linha ->> 'desfecho_em', '')::date, etapa_desde) end,
           faturado_em = nullif(v_linha ->> 'faturado_em', '')::date,
           vencimento_em = case when nullif(v_linha ->> 'faturado_em', '') is null then null
                                else coalesce(nullif(v_linha ->> 'vencimento_em', '')::date,
                                              (v_linha ->> 'faturado_em')::date
                                              + public.os_prazo_cliente(p_org, v_cliente)) end,
           pago_em = case when nullif(v_linha ->> 'faturado_em', '') is null then null else nullif(v_linha ->> 'pago_em', '')::date end
     where id = v_item;
    perform set_config('livih.os_item', 'off', true);
  end loop;
  perform set_config('livih.os_importando', 'off', true);

  return jsonb_build_object('ordens', (select count(*) from jsonb_object_keys(v_ordens)), 'itens', v_n_itens,
                            'clientes_criados', v_criados);
end $$;

-- clientes_importar: da migration 20261024150000, só com a limpeza do documento trocada.
create or replace function public.clientes_importar(p_org uuid, p_linhas jsonb)
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
    v_doc := public.limpar_documento(v_linha ->> 'documento');
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

-- fin_criar_lancamento: da migration 20261028120000, só com a limpeza do documento trocada.
create or replace function public.fin_criar_lancamento(p_org uuid, p_tipo text, p_descricao text, p_categoria uuid,
                                            p_emissora uuid, p_cliente uuid, p_fornecedor_cnpj text,
                                            p_fornecedor_nome text, p_parcelas jsonb, p_observacao text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_grupo uuid := gen_random_uuid();
  v_total int;
  v_p jsonb;
  v_n int := 0;
  v_valor numeric(14, 2);
  v_venc date;
begin
  perform public.fin_exigir(p_org);
  if p_tipo is null or p_tipo not in ('receber', 'pagar') then
    raise exception 'escolha se é a receber ou a pagar';
  end if;
  if coalesce(btrim(p_descricao), '') = '' then
    raise exception 'informe a descrição do lançamento';
  end if;
  if p_categoria is not null and not exists (
    select 1 from public.fin_categorias
     where id = p_categoria and org_id = p_org
       and tipo = case p_tipo when 'receber' then 'receita' else 'despesa' end
  ) then
    raise exception 'a categoria não é desta empresa ou é do outro lado (receita no a receber, despesa no a pagar)';
  end if;
  if p_emissora is not null and not exists (select 1 from public.emissoras where id = p_emissora and org_id = p_org) then
    raise exception 'CNPJ da empresa não encontrado';
  end if;
  if p_cliente is not null and (p_tipo <> 'receber'
       or not exists (select 1 from public.clientes where id = p_cliente and org_id = p_org)) then
    raise exception 'cliente não encontrado (só o a receber tem cliente)';
  end if;
  if p_tipo = 'receber' and (p_fornecedor_cnpj is not null or p_fornecedor_nome is not null) then
    raise exception 'só o a pagar tem fornecedor';
  end if;
  if jsonb_typeof(p_parcelas) is distinct from 'array' then
    raise exception 'informe as parcelas';
  end if;
  v_total := jsonb_array_length(p_parcelas);
  if v_total < 1 or v_total > 120 then
    raise exception 'informe de 1 a 120 parcelas';
  end if;

  for v_p in select value from jsonb_array_elements(p_parcelas) loop
    v_n := v_n + 1;
    begin
      v_venc := (v_p ->> 'vencimento')::date;
      v_valor := round((v_p ->> 'valor')::numeric, 2);
    exception when others then
      raise exception 'parcela %: vencimento ou valor inválido', v_n;
    end;
    if v_venc is null or v_valor is null or v_valor <= 0 then
      raise exception 'parcela %: informe o vencimento e um valor maior que zero', v_n;
    end if;
    insert into public.fin_lancamentos (org_id, tipo, descricao, categoria_id, emissora_id, cliente_id,
                                        fornecedor_cnpj, fornecedor_nome, origem, grupo_id, parcela, parcelas,
                                        vencimento, valor, observacao, criado_por)
    values (p_org, p_tipo, btrim(p_descricao), p_categoria, p_emissora, p_cliente,
            public.limpar_documento(p_fornecedor_cnpj), nullif(btrim(p_fornecedor_nome), ''),
            'manual', v_grupo, v_n, v_total, v_venc, v_valor, nullif(btrim(p_observacao), ''), auth.uid());
  end loop;
  return v_grupo;
end $$;

-- nota_entrada_lancar: da migration 20261029120000, só com a limpeza do documento trocada.
create or replace function public.nota_entrada_lancar(p_org uuid, p_nota jsonb, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nota uuid;
  v_item jsonb;
  v_prod uuid;
  v_controla boolean;
  v_qtd numeric;
  v_fator numeric;
  v_unit numeric;
  v_cnpj text := public.limpar_documento(p_nota ->> 'emitente_cnpj');
  v_chave text := public.limpar_documento(p_nota ->> 'chave');
  v_numero text := nullif(btrim(coalesce(p_nota ->> 'numero', '')), '');
  v_serie text := nullif(btrim(coalesce(p_nota ->> 'serie', '')), '');
  v_motivo text;
  v_quando timestamptz;
  v_criados integer := 0;
  v_itens integer := 0;
  v_unidades numeric := 0;
begin
  if not public.tem_papel(p_org, '{dono,admin}') or not public.modulo_ativo(p_org, 'erp') then
    raise exception 'sem acesso';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 2000 then
    raise exception 'a nota não tem itens para lançar';
  end if;
  if v_chave is not null and length(v_chave) <> 44 then v_chave := null; end if;
  if v_cnpj is not null and length(v_cnpj) not in (11, 14) then v_cnpj := null; end if;

  -- Nota repetida: pela chave; sem chave (foto ilegível), pelo fornecedor + número + série.
  select criado_em into v_quando from public.notas_entrada
   where org_id = p_org
     and ((v_chave is not null and chave = v_chave)
          or (v_chave is null and v_cnpj is not null and v_numero is not null and chave is null
              and emitente_cnpj = v_cnpj and numero = v_numero and coalesce(serie, '') = coalesce(v_serie, '')));
  if v_quando is not null then
    raise exception 'esta nota já foi lançada em %', to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
  end if;

  insert into public.notas_entrada (org_id, chave, numero, serie, emissao, emitente_cnpj, emitente_nome, valor_total,
                                    origem, arquivo_path, autor_id, duplicatas)
  values (p_org, v_chave, left(v_numero, 20), left(v_serie, 5), nullif(p_nota ->> 'emissao', '')::date, v_cnpj,
          left(nullif(btrim(p_nota ->> 'emitente_nome'), ''), 200), nullif(p_nota ->> 'valor_total', '')::numeric,
          coalesce(nullif(p_nota ->> 'origem', ''), 'xml'),
          case when (p_nota ->> 'arquivo_path') like p_org::text || '/%' then left(p_nota ->> 'arquivo_path', 300) end,
          auth.uid(), public.fin_duplicatas_validas(p_nota -> 'duplicatas'))
  returning id into v_nota;

  v_motivo := left(concat_ws(' · ', 'NF ' || coalesce(v_numero, 's/n'), nullif(btrim(p_nota ->> 'emitente_nome'), '')), 300);

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item ->> 'quantidade')::numeric;
    v_fator := coalesce(nullif(v_item ->> 'fator', '')::numeric, 1);
    v_unit := nullif(v_item ->> 'valor_unitario', '')::numeric;
    if v_qtd is null or v_qtd <= 0 or v_fator <= 0 then
      raise exception 'quantidade inválida em "%"', left(v_item ->> 'descricao', 80);
    end if;

    v_prod := nullif(v_item ->> 'produto_id', '')::uuid;
    if v_prod is not null then
      select controla_estoque into v_controla from public.produtos where id = v_prod and org_id = p_org;
      if not found then raise exception 'produto não encontrado'; end if;
      if not v_controla then
        update public.produtos set controla_estoque = true where id = v_prod;
      end if;
    elsif jsonb_typeof(v_item -> 'novo') = 'object' then
      insert into public.produtos (org_id, nome, codigo, unidade, ncm, preco, controla_estoque)
      values (p_org,
              left(btrim(v_item -> 'novo' ->> 'nome'), 200),
              nullif(btrim(v_item -> 'novo' ->> 'codigo'), ''),
              coalesce(nullif(lower(btrim(v_item -> 'novo' ->> 'unidade')), ''), 'un'),
              case when (v_item -> 'novo' ->> 'ncm') ~ '^\d{8}$' then v_item -> 'novo' ->> 'ncm' end,
              0, true)
      returning id into v_prod;
      v_criados := v_criados + 1;
    else
      raise exception 'item sem produto: "%"', left(v_item ->> 'descricao', 80);
    end if;

    insert into public.estoque_movimentos (org_id, produto_id, quantidade, tipo, motivo, autor_id, nota_entrada_id)
    values (p_org, v_prod, v_qtd * v_fator, 'entrada', v_motivo, auth.uid(), v_nota);

    insert into public.notas_entrada_itens (nota_id, org_id, produto_id, codigo_fornecedor, descricao, unidade,
                                            quantidade, fator, valor_unitario, valor_total, ncm)
    values (v_nota, p_org, v_prod, left(nullif(btrim(v_item ->> 'codigo_fornecedor'), ''), 60),
            left(coalesce(nullif(btrim(v_item ->> 'descricao'), ''), '(sem descrição)'), 300),
            left(nullif(btrim(v_item ->> 'unidade'), ''), 10), v_qtd, v_fator, v_unit,
            nullif(v_item ->> 'valor_total', '')::numeric, left(v_item ->> 'ncm', 8));

    if v_cnpj is not null and nullif(btrim(v_item ->> 'codigo_fornecedor'), '') is not null then
      insert into public.produtos_fornecedores (org_id, fornecedor_cnpj, codigo_fornecedor, produto_id, fator,
                                                unidade_fornecedor, descricao_fornecedor)
      values (p_org, v_cnpj, left(btrim(v_item ->> 'codigo_fornecedor'), 60), v_prod, v_fator,
              left(nullif(btrim(v_item ->> 'unidade'), ''), 10), left(v_item ->> 'descricao', 300))
      on conflict (org_id, fornecedor_cnpj, lower(codigo_fornecedor)) do update
        set produto_id = excluded.produto_id, fator = excluded.fator, unidade_fornecedor = excluded.unidade_fornecedor,
            descricao_fornecedor = excluded.descricao_fornecedor, atualizado_em = now();
    end if;

    if v_unit is not null and v_unit >= 0 then
      insert into public.produtos_custos (produto_id, org_id, custo, nota_id)
      values (v_prod, p_org, round(v_unit / v_fator, 4), v_nota)
      on conflict (produto_id) do update set custo = excluded.custo, nota_id = excluded.nota_id, atualizado_em = now();
    end if;

    v_itens := v_itens + 1;
    v_unidades := v_unidades + v_qtd * v_fator;
  end loop;

  return jsonb_build_object('nota_id', v_nota, 'itens', v_itens, 'criados', v_criados, 'unidades', v_unidades);
end $$;

-- cobranca_salvar_dados: da migration 20261101140000, só com a limpeza do documento trocada.
create or replace function public.cobranca_salvar_dados(p_org uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_doc text := coalesce(public.limpar_documento(p_dados ->> 'documento'), '');
  v_email text := lower(btrim(coalesce(p_dados ->> 'email', '')));
  v_tel text := nullif(regexp_replace(coalesce(p_dados ->> 'telefone', ''), '\D', '', 'g'), '');
  v_mudou text[];
  v_cep text := regexp_replace(coalesce(p_dados ->> 'cep', ''), '\D', '', 'g');
  v_uf text := upper(btrim(coalesce(p_dados ->> 'uf', '')));
  v_antes jsonb;
  campo text;
begin
  if not public.cobranca_pode(p_org, '{dono}') then
    raise exception 'Só o dono da empresa muda os dados de cobrança.';
  end if;
  if not exists (select 1 from public.organizacoes where id = p_org) then
    raise exception 'Empresa não encontrada. Atualize a página e tente de novo.';
  end if;
  if length(btrim(coalesce(p_dados ->> 'nome', ''))) < 2 then
    raise exception 'Informe o nome ou a razão social de quem paga.';
  end if;
  if length(btrim(p_dados ->> 'nome')) > 200 then
    raise exception 'O nome tem até 200 caracteres.';
  end if;
  if not (public.cnpj_valido(v_doc) or public.cpf_valido(v_doc)) then
    raise exception 'CNPJ ou CPF inválido. Confira o que foi digitado.';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(v_email) > 200 then
    raise exception 'Informe um e-mail de cobrança válido.';
  end if;
  -- Um formato só, o brasileiro sem o 55 (o Asaas espera assim): tira o 55 de quem digitou com ele.
  if v_tel ~ '^55\d{10,11}$' then
    v_tel := substr(v_tel, 3);
  end if;
  if v_tel is not null and v_tel !~ '^\d{10,11}$' then
    raise exception 'Telefone inválido. Use o DDD e o número, como (41) 99999-9999.';
  end if;
  if v_cep !~ '^\d{8}$' then
    raise exception 'CEP inválido. Use os 8 números.';
  end if;
  foreach campo in array array['logradouro', 'numero', 'bairro', 'cidade'] loop
    if nullif(btrim(coalesce(p_dados ->> campo, '')), '') is null then
      raise exception 'Preencha o endereço completo: rua, número, bairro e cidade.';
    end if;
  end loop;
  if length(btrim(p_dados ->> 'logradouro')) > 200 then
    raise exception 'A rua tem até 200 caracteres.';
  end if;
  if length(btrim(p_dados ->> 'numero')) > 20 then
    raise exception 'O número tem até 20 caracteres. Ponha o resto no complemento.';
  end if;
  if length(btrim(coalesce(p_dados ->> 'complemento', ''))) > 100 then
    raise exception 'O complemento tem até 100 caracteres.';
  end if;
  if length(btrim(p_dados ->> 'bairro')) > 100 or length(btrim(p_dados ->> 'cidade')) > 100 then
    raise exception 'O bairro e a cidade têm até 100 caracteres cada.';
  end if;
  if not v_uf = any ('{AC,AL,AM,AP,BA,CE,DF,ES,GO,MA,MG,MS,MT,PA,PB,PE,PI,PR,RJ,RN,RO,RR,RS,SC,SE,SP,TO}') then
    raise exception 'Informe a UF com a sigla do estado, como PR.';
  end if;

  select to_jsonb(d) - 'atualizado_em' - 'atualizado_por' into v_antes from public.dados_cobranca d where d.org_id = p_org;
  insert into public.dados_cobranca (org_id, nome, documento, email, telefone, cep, logradouro, numero, complemento,
                                     bairro, cidade, uf, atualizado_por)
  values (p_org, btrim(p_dados ->> 'nome'), v_doc, v_email, v_tel, v_cep, btrim(p_dados ->> 'logradouro'),
          btrim(p_dados ->> 'numero'), nullif(btrim(coalesce(p_dados ->> 'complemento', '')), ''),
          btrim(p_dados ->> 'bairro'), btrim(p_dados ->> 'cidade'), v_uf, auth.uid())
  on conflict (org_id) do update set
    nome = excluded.nome, documento = excluded.documento, email = excluded.email, telefone = excluded.telefone,
    cep = excluded.cep, logradouro = excluded.logradouro, numero = excluded.numero, complemento = excluded.complemento,
    bairro = excluded.bairro, cidade = excluded.cidade, uf = excluded.uf,
    atualizado_em = now(), atualizado_por = auth.uid();
  -- Só os nomes dos campos que mudaram (sem CPF nem endereço na auditoria, que é imutável).
  select coalesce(array_agg(n.key order by n.key), '{}') into v_mudou
    from public.dados_cobranca d, jsonb_each(to_jsonb(d) - 'atualizado_em' - 'atualizado_por' - 'org_id') n
   where d.org_id = p_org and (v_antes is null or v_antes -> n.key is distinct from n.value);
  insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
  values (p_org, 'atendente', auth.uid(), 'salvar_dados_cobranca', 'dados_cobranca', p_org::text,
          jsonb_build_object('existia', v_antes is not null), jsonb_build_object('campos', to_jsonb(v_mudou)));
end $$;
