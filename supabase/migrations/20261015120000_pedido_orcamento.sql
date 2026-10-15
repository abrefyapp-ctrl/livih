-- Orçamento no pedido (entrega 2 do orçamento em PDF): de qual empresa (CNPJ) ele sai, validade, condições de
-- pagamento e prazo de entrega.
--
-- Pedido novo vem com a emissora padrão e os padrões dela. Trocar a emissora no rascunho recarrega os padrões só
-- nos campos que ainda estavam com o padrão da anterior (o que a equipe escreveu à mão fica).
-- Como cliente, desconto e frete, esses campos só mudam no rascunho: depois de confirmado, é o que foi combinado.

alter table public.pedidos
  add column emissora_id uuid,
  add column validade date,
  add column condicoes_pagamento text check (length(condicoes_pagamento) <= 1000),
  add column prazo_entrega text check (length(prazo_entrega) <= 500),
  -- Empresa que já está em pedido não sai: o pedido precisa continuar dizendo de qual CNPJ saiu.
  add foreign key (emissora_id, org_id) references public.emissoras (id, org_id) on delete restrict;
create index pedidos_emissora_idx on public.pedidos (emissora_id);

-- Hoje no fuso da empresa (Brasil): validade = hoje + dias da emissora.
create function public.hoje_brasil() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create function public.pedido_padroes_orcamento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_nova public.emissoras;
  v_antiga public.emissoras;
  v_base date;
begin
  if tg_op = 'INSERT' then
    if new.emissora_id is null then
      select id into new.emissora_id from public.emissoras where org_id = new.org_id and padrao;
    end if;
    select * into v_nova from public.emissoras where id = new.emissora_id;
    if v_nova.id is not null then
      new.validade := coalesce(new.validade, public.hoje_brasil() + v_nova.validade_dias);
      new.condicoes_pagamento := coalesce(new.condicoes_pagamento, v_nova.condicoes_pagamento);
      new.prazo_entrega := coalesce(new.prazo_entrega, v_nova.prazo_entrega);
    end if;
    return new;
  end if;

  -- UPDATE trocando a emissora: só sobrescreve o que ainda é o padrão da anterior (ou está vazio).
  if new.emissora_id is distinct from old.emissora_id and new.emissora_id is not null then
    select * into v_nova from public.emissoras where id = new.emissora_id;
    select * into v_antiga from public.emissoras where id = old.emissora_id;
    v_base := (old.criado_em at time zone 'America/Sao_Paulo')::date;
    if new.validade is null or new.validade = v_base + v_antiga.validade_dias then
      new.validade := v_base + v_nova.validade_dias;
    end if;
    if new.condicoes_pagamento is null or new.condicoes_pagamento is not distinct from v_antiga.condicoes_pagamento then
      new.condicoes_pagamento := v_nova.condicoes_pagamento;
    end if;
    if new.prazo_entrega is null or new.prazo_entrega is not distinct from v_antiga.prazo_entrega then
      new.prazo_entrega := v_nova.prazo_entrega;
    end if;
  end if;
  return new;
end $$;

-- Roda antes de pedido_preparar (ordem alfabética), que confere a regra do rascunho com os valores finais.
create trigger pedido_padroes_orcamento before insert or update of emissora_id on public.pedidos
for each row execute function public.pedido_padroes_orcamento();

-- Mesma função de antes; a regra do rascunho passa a cobrir também os campos do orçamento.
create or replace function public.pedido_preparar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_contato uuid;
begin
  if tg_op = 'UPDATE' and old.status <> 'rascunho'
     and (new.contato_id, new.desconto, new.frete, new.emissora_id, new.validade, new.condicoes_pagamento, new.prazo_entrega)
         is distinct from
         (old.contato_id, old.desconto, old.frete, old.emissora_id, old.validade, old.condicoes_pagamento, old.prazo_entrega) then
    raise exception 'cliente, valores e condições só mudam no rascunho';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('pedido_numero:' || new.org_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero from public.pedidos where org_id = new.org_id;
    new.criado_por := coalesce(new.criado_por, auth.uid());
    new.responsavel_id := coalesce(new.responsavel_id, auth.uid());
    new.status := 'rascunho';
    new.estoque_baixado := false;
  end if;
  if new.responsavel_id is not null and not exists (
    select 1 from public.membros_org where org_id = new.org_id and user_id = new.responsavel_id and ativo
  ) then
    raise exception 'o responsável precisa ser da equipe';
  end if;
  if new.oportunidade_id is not null then
    select contato_id into v_contato from public.oportunidades where id = new.oportunidade_id;
    if new.contato_id is null then
      new.contato_id := v_contato;
    elsif v_contato is distinct from new.contato_id then
      raise exception 'a oportunidade é de outro cliente';
    end if;
  end if;
  new.total := greatest(new.subtotal - new.desconto + new.frete, 0);
  return new;
end $$;

-- Rascunhos que já existem passam a sair pela emissora padrão; o gatilho acima preenche validade (a partir da
-- data de criação), condições e prazo. Pedidos já confirmados ficam como estão.
update public.pedidos p
   set emissora_id = e.id
  from public.emissoras e
 where e.org_id = p.org_id and e.padrao and p.emissora_id is null and p.status = 'rascunho';
