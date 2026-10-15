-- Modo suporte (equipe da plataforma dentro de uma empresa cliente, sem ser membro): criar pedido falhava com
-- "o responsável precisa ser da equipe", porque o pedido novo punha quem cria como responsável sem conferir.
-- Agora só põe quem cria quando a pessoa é da equipe; senão o pedido nasce sem responsável.

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
    if new.responsavel_id is null and exists (
      select 1 from public.membros_org where org_id = new.org_id and user_id = auth.uid() and ativo
    ) then
      new.responsavel_id := auth.uid();
    end if;
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
