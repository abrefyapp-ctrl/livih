-- Produtos ganham categoria, marca e NCM.
--
-- Motivo (15/10): os catálogos da JoGrampo saem da base de conhecimento (175 mil caracteres lidos em toda resposta
-- do agente) e vêm para o cadastro de produtos, que o agente consulta só no que o cliente perguntou. Categoria e
-- marca ajudam a buscar e filtrar; o NCM será obrigatório na NF-e.

alter table public.produtos
  add column categoria text check (length(categoria) <= 100),
  add column marca text check (length(marca) <= 100),
  add column ncm text check (ncm ~ '^\d{8}$');

create index produtos_categoria_idx on public.produtos (org_id, lower(categoria));

-- A view foi criada com p.*, que congela a lista de colunas: recriada para incluir as novas.
drop view public.produtos_saldo;
create view public.produtos_saldo with (security_invoker = true) as
  select p.*, coalesce((select sum(m.quantidade) from public.estoque_movimentos m where m.produto_id = p.id), 0)::numeric(14, 3) as saldo
    from public.produtos p;
grant select on public.produtos_saldo to authenticated;
