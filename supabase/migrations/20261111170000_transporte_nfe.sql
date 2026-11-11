-- Transporte na NF-e (pedido da JoGrampo em 11/11): quem paga o frete, a transportadora que coleta e os volumes
-- (quantidade de embalagens, espécie, marca, numeração, peso líquido e bruto). Até aqui a nota só dizia "frete por conta
-- do emitente" quando o pedido tinha frete, e "sem frete" quando não tinha.
--
-- - transportadoras: o cadastro de cada empresa, para escolher na próxima nota em vez de digitar de novo. Quem grava é
--   a função nfe-emitir (chave de serviço), ao emitir com a transportadora preenchida; a tela só lê.
-- - notas_fiscais.transporte: o transporte enviado na nota, para a tela preencher de novo o "Emitir de novo" depois de
--   uma recusa e para conferir o que saiu.
-- O peso é digitado na nota (decisão de 11/11): o produto não tem peso no cadastro.

create table public.transportadoras (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  -- CNPJ (14, pode ter letras desde 07/2026) ou CPF (11), só os caracteres.
  documento text not null check (documento ~ '^([0-9A-Z]{12}[0-9]{2}|[0-9]{11})$'),
  nome text not null check (char_length(btrim(nome)) between 2 and 60),
  inscricao_estadual text check (char_length(inscricao_estadual) <= 14),
  endereco text check (char_length(endereco) <= 60),
  municipio text check (char_length(municipio) <= 60),
  uf text check (uf ~ '^[A-Z]{2}$'),
  usada_em timestamptz not null default now(),
  unique (org_id, documento)
);
comment on table public.transportadoras is
  'Transportadoras usadas nas NF-e da empresa (gravadas pela função nfe-emitir); a tela lista para escolher na próxima nota.';
comment on column public.transportadoras.usada_em is 'Última nota emitida com ela: a lista vem da mais usada recentemente.';

alter table public.transportadoras enable row level security;
-- Só quem emite nota usa a lista (dono, admin e "Emite nota fiscal"), como em notas_fiscais.
create policy transportadoras_ver on public.transportadoras for select to authenticated
  using (public.emite_nota_fiscal(org_id));
revoke all on public.transportadoras from public, anon, authenticated;
grant select on public.transportadoras to authenticated;

alter table public.notas_fiscais add column transporte jsonb;
comment on column public.notas_fiscais.transporte is
  'Transporte enviado na NF-e: modalidade do frete, transportadora e volume (o que a pessoa preencheu ao emitir).';
