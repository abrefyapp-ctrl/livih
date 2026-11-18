-- Desconto por produto (docs/balcao.md, decisões de 18/11).
--
-- O pedido só tinha desconto no total. A JoGrampo dá desconto em um produto só, e o balcão e o orçamento precisam
-- mostrar isso na linha do item. Decidido em 18/11: cada item tem um desconto que a tela aceita em R$ ou em %,
-- guardado em R$; o desconto no total continua; vale para pedido, orçamento e balcão. Limite de desconto por
-- vendedor fica para o caixa.
--
-- desconto (R$) é o que vale para as contas. desconto_percentual só existe quando a pessoa digitou em %: aí o R$ é
-- recalculado quando muda a quantidade ou o preço, para 10% continuar 10%. Digitar em R$ apaga o percentual.
-- O valor do item (total) já sai com o desconto, e o subtotal do pedido passa a somar os itens com desconto: o total
-- do pedido (subtotal − desconto no total + frete) e o financeiro não mudam de regra. Itens antigos ficam com
-- desconto 0, então nenhum pedido muda de valor.

alter table public.pedido_itens
  add column desconto numeric(14, 2) not null default 0 check (desconto >= 0),
  add column desconto_percentual numeric(5, 2) check (desconto_percentual > 0 and desconto_percentual <= 100),
  add column total numeric(14, 2) generated always as (round(quantidade * preco_unitario, 2) - desconto) stored;
comment on column public.pedido_itens.desconto is 'Desconto do item em R$ (o que vale para o total e para a NF-e).';
comment on column public.pedido_itens.desconto_percentual is
  'Percentual digitado na tela, quando o desconto foi dado em %; o R$ acompanha a quantidade e o preço.';
comment on column public.pedido_itens.total is 'Valor do item: quantidade × preço − desconto do item.';
comment on column public.pedido_itens.subtotal is 'Quantidade × preço, antes do desconto do item.';

-- Calcula o R$ a partir do percentual e não deixa o desconto passar do valor do item. Só mexe na própria linha,
-- então não precisa de security definer.
create function public.pedido_item_desconto() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_bruto numeric := round(new.quantidade * new.preco_unitario, 2);
begin
  if new.desconto_percentual is not null then
    new.desconto := round(v_bruto * new.desconto_percentual / 100, 2);
  end if;
  if new.desconto > v_bruto then
    raise exception 'o desconto do item não pode passar do valor do item (R$ %)',
      replace(btrim(to_char(v_bruto, '999999999990.00')), '.', ',');
  end if;
  return new;
end $$;
create trigger pedido_item_desconto before insert or update on public.pedido_itens
for each row execute function public.pedido_item_desconto();
revoke execute on function public.pedido_item_desconto() from public, anon, authenticated;

-- Igual ao de 20261013130000, somando o valor do item já com o desconto.
create or replace function public.pedido_recalcular() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
begin
  update public.pedidos
     set subtotal = coalesce((select sum(total) from public.pedido_itens where pedido_id = v_pedido), 0)
   where id = v_pedido;
  return null;
end $$;
