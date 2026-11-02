-- Dados de cobrança de cada empresa cliente (docs/cobranca-asaas.md, entrega 1; decisões de 01/11).
--
-- Quem paga a Livih: nome ou razão social, CNPJ ou CPF, e-mail de cobrança, telefone e endereço. A plataforma
-- preenche ao criar a empresa e o dono confere e corrige na tela Plano e consumo. Tabela própria, separada das
-- emissoras: quem paga a Livih nem sempre é quem aparece no orçamento, e há empresa sem emissora. Quando a empresa
-- ainda não tem dados de cobrança, a emissora padrão serve de sugestão (cobranca_dados devolve com sugerido = true).
-- O id do cliente no Asaas entra na entrega 2.
-- Dono e administradores de empresa SUSPENSA também veem e corrigem (revisão de 01/11): a suspensão por atraso
-- (entrega 3) não pode impedir de acertar o e-mail para receber a fatura e pagar. Por isso a conferência de papel aqui
-- não usa tem_papel, que exige empresa ativa.
-- A auditoria guarda só os nomes dos campos que mudaram: é imutável, e CPF e endereço não podem ficar nela para sempre
-- (LGPD). Pendência à parte: CNPJ alfanumérico (Receita, desde 07/2026), que mexe também em cnpj_valido e nas emissoras.

create table public.dados_cobranca (
  org_id         uuid primary key references public.organizacoes (id) on delete cascade,
  nome           text not null check (length(btrim(nome)) between 2 and 200),
  documento      text not null check (public.cnpj_valido(documento) or public.cpf_valido(documento)),
  email          text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and length(email) <= 200),
  telefone       text check (telefone ~ '^\d{10,11}$'),
  cep            text not null check (cep ~ '^\d{8}$'),
  logradouro     text not null check (length(btrim(logradouro)) between 1 and 200),
  numero         text not null check (length(btrim(numero)) between 1 and 20),
  complemento    text check (length(complemento) <= 100),
  bairro         text not null check (length(btrim(bairro)) between 1 and 100),
  cidade         text not null check (length(btrim(cidade)) between 1 and 100),
  uf             text not null check (uf = any ('{AC,AL,AM,AP,BA,CE,DF,ES,GO,MA,MG,MS,MT,PA,PB,PE,PI,PR,RJ,RN,RO,RR,RS,SC,SE,SP,TO}')),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);
comment on table public.dados_cobranca is 'Quem paga a Livih por empresa cliente (cobrança pelo Asaas, docs/cobranca-asaas.md).';
-- Papel na empresa sem olhar se ela está suspensa (ver o topo), ou equipe da plataforma.
create function public.cobranca_pode(p_org uuid, p_papeis public.papel_org[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.membros_org m
                  where m.org_id = p_org and m.user_id = auth.uid() and m.ativo and m.papel = any (p_papeis))
      or public.eh_admin_plataforma();
$$;
revoke execute on function public.cobranca_pode(uuid, public.papel_org[]) from public, anon;
grant execute on function public.cobranca_pode(uuid, public.papel_org[]) to authenticated;

alter table public.dados_cobranca enable row level security;
create policy dados_cobranca_ver on public.dados_cobranca for select to authenticated
  using (public.cobranca_pode(org_id, '{dono,admin}'));
revoke all on public.dados_cobranca from anon, authenticated;
grant select on public.dados_cobranca to authenticated;

-- Dados salvos ou, sem eles, a sugestão da emissora padrão (sem e-mail e telefone obrigatórios: o dono confere).
create function public.cobranca_dados(p_org uuid)
returns table (nome text, documento text, email text, telefone text, cep text, logradouro text, numero text,
               complemento text, bairro text, cidade text, uf text, sugerido boolean, atualizado_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.cobranca_pode(p_org, '{dono,admin}') then
    raise exception 'Só o dono e os administradores da empresa veem os dados de cobrança.';
  end if;
  if exists (select 1 from public.dados_cobranca d where d.org_id = p_org) then
    return query
    select d.nome, d.documento, d.email, d.telefone, d.cep, d.logradouro, d.numero, d.complemento, d.bairro, d.cidade,
           d.uf, false, d.atualizado_em
      from public.dados_cobranca d where d.org_id = p_org;
  else
    return query
    select e.razao_social, e.cnpj, e.email,
           case when e.telefone ~ '^55\d{10,11}$' then substr(e.telefone, 3) else e.telefone end, e.cep, e.logradouro, e.numero, e.complemento, e.bairro, e.cidade,
           e.uf, true, null::timestamptz
      from public.emissoras e where e.org_id = p_org
     order by e.padrao desc, e.criado_em
     limit 1;
  end if;
end $$;
revoke execute on function public.cobranca_dados(uuid) from public, anon;
grant execute on function public.cobranca_dados(uuid) to authenticated;

-- Salva os dados (dono da empresa ou equipe da plataforma). Mensagens para a pessoa, campo a campo.
create function public.cobranca_salvar_dados(p_org uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_doc text := regexp_replace(coalesce(p_dados ->> 'documento', ''), '\D', '', 'g');
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
    raise exception 'CNPJ ou CPF inválido. Confira os números.';
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
revoke execute on function public.cobranca_salvar_dados(uuid, jsonb) from public, anon;
grant execute on function public.cobranca_salvar_dados(uuid, jsonb) to authenticated;
