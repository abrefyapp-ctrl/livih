-- Entrada por nota fiscal (pedido de 20/10): Produtos → Entrada por nota → XML, PDF ou foto da nota do fornecedor.
--
-- A tela lê a nota (XML direto no navegador; PDF e foto pela IA, Edge Function ler-nota), liga cada item a um produto
-- do cadastro ou cria um novo, e chama nota_entrada_lancar, que faz tudo numa transação:
--   - registra a nota (a mesma chave de acesso não entra duas vezes);
--   - cria os produtos novos SEM preço de venda (preço 0 = "sem preço"; o agente já trata e a lista mostra);
--   - lança a entrada no estoque (quantidade da nota × fator da unidade, motivo "NF 123 · Fornecedor");
--   - guarda o vínculo fornecedor (CNPJ) + código do fornecedor → produto e o fator, para a próxima nota vir ligada;
--   - guarda o último custo (valor unitário da nota ÷ fator) em produtos_custos, que só dono/admin leem (o agente e
--     a equipe não veem custo).
-- Só dono e admin lançam (decisão de 20/10, mesma regra do cadastro de produtos).

-- ============================================================================
-- Notas e itens
-- ============================================================================
create table public.notas_entrada (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  chave text check (chave ~ '^\d{44}$'),
  numero text check (length(numero) <= 20),
  serie text check (length(serie) <= 5),
  emissao date,
  emitente_cnpj text check (emitente_cnpj ~ '^\d{11}$|^\d{14}$'),
  emitente_nome text check (length(emitente_nome) <= 200),
  valor_total numeric(14, 2),
  origem text not null check (origem in ('xml', 'pdf', 'imagem')),
  arquivo_path text check (length(arquivo_path) <= 300),
  autor_id uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (id, org_id)
);
create unique index notas_entrada_chave_unica on public.notas_entrada (org_id, chave) where chave is not null;
create unique index notas_entrada_numero_unico on public.notas_entrada (org_id, emitente_cnpj, numero, coalesce(serie, ''))
  where chave is null and emitente_cnpj is not null and numero is not null;
create index notas_entrada_org_idx on public.notas_entrada (org_id, criado_em desc);

create table public.notas_entrada_itens (
  id bigint generated always as identity primary key,
  nota_id uuid not null,
  org_id uuid not null,
  produto_id uuid,
  codigo_fornecedor text check (length(codigo_fornecedor) <= 60),
  descricao text not null check (length(descricao) <= 300),
  unidade text check (length(unidade) <= 10),
  quantidade numeric(14, 4) not null check (quantidade > 0),
  fator numeric(14, 4) not null default 1 check (fator > 0),
  valor_unitario numeric(14, 4),
  valor_total numeric(14, 2),
  ncm text,
  foreign key (nota_id, org_id) references public.notas_entrada (id, org_id) on delete cascade,
  foreign key (produto_id, org_id) references public.produtos (id, org_id) on delete set null (produto_id)
);
create index notas_entrada_itens_nota_idx on public.notas_entrada_itens (nota_id);

-- ============================================================================
-- Vínculo com o fornecedor e custo
-- ============================================================================
-- O código da nota é o do fornecedor, não o da empresa: o vínculo é por fornecedor. fator = quantas unidades do
-- produto vêm em 1 unidade da nota (ex.: nota em CX de 10, produto em UN → 10).
create table public.produtos_fornecedores (
  org_id uuid not null,
  fornecedor_cnpj text not null check (fornecedor_cnpj ~ '^\d{11}$|^\d{14}$'),
  codigo_fornecedor text not null check (length(codigo_fornecedor) between 1 and 60),
  produto_id uuid not null,
  fator numeric(14, 4) not null default 1 check (fator > 0),
  unidade_fornecedor text check (length(unidade_fornecedor) <= 10),
  descricao_fornecedor text check (length(descricao_fornecedor) <= 300),
  atualizado_em timestamptz not null default now(),
  foreign key (produto_id, org_id) references public.produtos (id, org_id) on delete cascade
);
create unique index produtos_fornecedores_unico
  on public.produtos_fornecedores (org_id, fornecedor_cnpj, lower(codigo_fornecedor));

create table public.produtos_custos (
  produto_id uuid primary key,
  org_id uuid not null,
  custo numeric(14, 4) not null check (custo >= 0),
  nota_id uuid references public.notas_entrada (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  foreign key (produto_id, org_id) references public.produtos (id, org_id) on delete cascade
);

-- Entrada no estoque aponta para a nota (sem FK, como pedido_id: o movimento é imutável).
alter table public.estoque_movimentos add column nota_entrada_id uuid;

-- ============================================================================
-- Acesso: só dono/admin leem; escrita só pela função.
-- ============================================================================
alter table public.notas_entrada enable row level security;
alter table public.notas_entrada_itens enable row level security;
alter table public.produtos_fornecedores enable row level security;
alter table public.produtos_custos enable row level security;

create policy notas_entrada_ver on public.notas_entrada for select to authenticated
  using (public.tem_papel(org_id, '{dono,admin}') and public.modulo_ativo(org_id, 'erp'));
create policy notas_entrada_itens_ver on public.notas_entrada_itens for select to authenticated
  using (public.tem_papel(org_id, '{dono,admin}') and public.modulo_ativo(org_id, 'erp'));
create policy produtos_fornecedores_ver on public.produtos_fornecedores for select to authenticated
  using (public.tem_papel(org_id, '{dono,admin}') and public.modulo_ativo(org_id, 'erp'));
create policy produtos_custos_ver on public.produtos_custos for select to authenticated
  using (public.tem_papel(org_id, '{dono,admin}') and public.modulo_ativo(org_id, 'erp'));

-- Tabela nova no public não tem acesso automático: grants aqui.
revoke all on public.notas_entrada, public.notas_entrada_itens, public.produtos_fornecedores, public.produtos_custos
  from anon, authenticated;
grant select on public.notas_entrada, public.notas_entrada_itens, public.produtos_fornecedores, public.produtos_custos
  to authenticated;
grant all on public.notas_entrada, public.notas_entrada_itens, public.produtos_fornecedores, public.produtos_custos
  to service_role;

-- Arquivo da nota (privado; só dono/admin da empresa). Caminho: <org_id>/<uuid>-<nome>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notas-entrada', 'notas-entrada', false, 20971520,
        '{application/xml,text/xml,application/pdf,image/jpeg,image/png,image/webp,image/heic}')
on conflict (id) do nothing;
create policy "notas-entrada: dono e admin veem" on storage.objects for select to authenticated
  using (bucket_id = 'notas-entrada' and public.tem_papel(public.org_do_caminho(name), '{dono,admin}'));
create policy "notas-entrada: dono e admin sobem" on storage.objects for insert to authenticated
  with check (bucket_id = 'notas-entrada' and public.tem_papel(public.org_do_caminho(name), '{dono,admin}'));

alter table public.uso_ia drop constraint uso_ia_tipo_check;
alter table public.uso_ia add constraint uso_ia_tipo_check
  check (tipo in ('resposta', 'transcricao', 'descricao', 'simulador', 'importacao', 'assistente', 'nota'));

-- ============================================================================
-- Lançar a nota
-- ============================================================================
-- p_nota:  { chave, numero, serie, emissao (AAAA-MM-DD), emitente_cnpj, emitente_nome, valor_total, origem, arquivo_path }
-- p_itens: [{ produto_id | null, novo: { nome, codigo, unidade, ncm } | null, codigo_fornecedor, descricao, unidade,
--             quantidade, fator, valor_unitario, valor_total, ncm }]   (itens ignorados na revisão não vêm)
-- Devolve { nota_id, itens, criados, unidades }.
create function public.nota_entrada_lancar(p_org uuid, p_nota jsonb, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nota uuid;
  v_item jsonb;
  v_prod uuid;
  v_controla boolean;
  v_qtd numeric;
  v_fator numeric;
  v_unit numeric;
  v_cnpj text := nullif(regexp_replace(coalesce(p_nota ->> 'emitente_cnpj', ''), '\D', '', 'g'), '');
  v_chave text := nullif(regexp_replace(coalesce(p_nota ->> 'chave', ''), '\D', '', 'g'), '');
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
                                    origem, arquivo_path, autor_id)
  values (p_org, v_chave, left(v_numero, 20), left(v_serie, 5), nullif(p_nota ->> 'emissao', '')::date, v_cnpj,
          left(nullif(btrim(p_nota ->> 'emitente_nome'), ''), 200), nullif(p_nota ->> 'valor_total', '')::numeric,
          coalesce(nullif(p_nota ->> 'origem', ''), 'xml'),
          case when (p_nota ->> 'arquivo_path') like p_org::text || '/%' then left(p_nota ->> 'arquivo_path', 300) end,
          auth.uid())
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
revoke execute on function public.nota_entrada_lancar(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.nota_entrada_lancar(uuid, jsonb, jsonb) to authenticated;
