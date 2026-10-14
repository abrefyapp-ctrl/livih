-- Empresas emissoras: quem aparece no cabeçalho do orçamento/pedido (logo, CNPJ, endereço, contato).
--
-- Decisão de 14/10 (usuário): uma conta pode ter vários CNPJs (a JoGrampo tem dois); uma emissora é a padrão e
-- o pedido pode trocar. Cada emissora traz também os padrões do orçamento (validade, condições, prazo, rodapé).
-- Endereço em campos separados porque a NF-e vai precisar deles.
--
-- Também: telefone no perfil, para o vendedor responsável sair no PDF.

-- ============================================================================
-- CNPJ
-- ============================================================================
create function public.cnpj_valido(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  d int[];
  pesos1 int[] := '{5,4,3,2,9,8,7,6,5,4,3,2}';
  pesos2 int[] := '{6,5,4,3,2,9,8,7,6,5,4,3,2}';
  s int;
  dv int;
begin
  if p !~ '^\d{14}$' or p ~ '^(\d)\1{13}$' then
    return false;
  end if;
  select array_agg(substr(p, i, 1)::int order by i) into d from generate_series(1, 14) i;
  s := 0;
  for i in 1..12 loop s := s + d[i] * pesos1[i]; end loop;
  dv := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  if dv <> d[13] then return false; end if;
  s := 0;
  for i in 1..13 loop s := s + d[i] * pesos2[i]; end loop;
  dv := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return dv = d[14];
end $$;

-- ============================================================================
-- Emissoras
-- ============================================================================
create table public.emissoras (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  razao_social text not null check (length(btrim(razao_social)) between 1 and 200),
  nome_fantasia text check (length(nome_fantasia) <= 200),
  cnpj text not null check (public.cnpj_valido(cnpj)),
  inscricao_estadual text check (length(inscricao_estadual) <= 30),
  cep text check (cep ~ '^\d{8}$'),
  logradouro text check (length(logradouro) <= 200),
  numero text check (length(numero) <= 20),
  complemento text check (length(complemento) <= 100),
  bairro text check (length(bairro) <= 100),
  cidade text check (length(cidade) <= 100),
  uf text check (uf ~ '^[A-Z]{2}$'),
  telefone text check (telefone ~ '^\d{12,15}$'),
  email text check (length(email) <= 200),
  site text check (length(site) <= 200),
  logo_path text,
  padrao boolean not null default false,
  -- Padrões do orçamento
  validade_dias integer not null default 7 check (validade_dias between 1 and 365),
  condicoes_pagamento text check (length(condicoes_pagamento) <= 1000),
  prazo_entrega text check (length(prazo_entrega) <= 500),
  rodape text check (length(rodape) <= 2000),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (org_id, cnpj),
  unique (id, org_id)
);
create unique index emissoras_uma_padrao on public.emissoras (org_id) where padrao;
create trigger emissoras_atualizado_em before update on public.emissoras
for each row execute function public.tocar_atualizado_em();

-- Sempre há exatamente uma padrão quando existe alguma: a primeira nasce padrão; marcar outra desmarca a
-- anterior; apagar a padrão promove a mais antiga que sobrou.
create function public.emissoras_padrao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.padrao then
      update public.emissoras set padrao = true
       where id = (select id from public.emissoras where org_id = old.org_id order by criado_em, id limit 1);
    end if;
    return old;
  end if;
  if not exists (select 1 from public.emissoras where org_id = new.org_id and padrao and id <> new.id) then
    new.padrao := true;
  elsif new.padrao then
    update public.emissoras set padrao = false where org_id = new.org_id and padrao and id <> new.id;
  end if;
  return new;
end $$;

create trigger emissoras_padrao before insert or update of padrao on public.emissoras
for each row when (pg_trigger_depth() = 0) execute function public.emissoras_padrao();
create trigger emissoras_padrao_apagada after delete on public.emissoras
for each row execute function public.emissoras_padrao();

alter table public.emissoras enable row level security;
create policy emissoras_ver on public.emissoras for select to authenticated using (public.eh_membro(org_id));
create policy emissoras_gerir on public.emissoras for all to authenticated
  using (public.tem_papel(org_id, '{dono,admin}')) with check (public.tem_papel(org_id, '{dono,admin}'));

-- ============================================================================
-- Logo (bucket privado `logos`, caminho org/emissora/arquivo)
-- ============================================================================
-- Diferente de `midias`, a logo não é histórico: dono/admin trocam e apagam.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 2097152, '{image/png,image/jpeg}')
on conflict (id) do nothing;

create function public.org_do_caminho(p_nome text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(p_nome, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_nome, '/', 1)::uuid end;
$$;

create policy "logos: membros veem" on storage.objects for select to authenticated
  using (bucket_id = 'logos' and public.eh_membro(public.org_do_caminho(name)));
create policy "logos: dono e admin sobem" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.tem_papel(public.org_do_caminho(name), '{dono,admin}'));
create policy "logos: dono e admin trocam" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.tem_papel(public.org_do_caminho(name), '{dono,admin}'))
  with check (bucket_id = 'logos' and public.tem_papel(public.org_do_caminho(name), '{dono,admin}'));
create policy "logos: dono e admin apagam" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.tem_papel(public.org_do_caminho(name), '{dono,admin}'));

-- ============================================================================
-- Telefone do vendedor
-- ============================================================================
alter table public.perfis add column telefone text check (telefone ~ '^\d{12,15}$');
comment on column public.perfis.telefone is 'telefone de contato (só dígitos, com DDI), sai no PDF do orçamento';
