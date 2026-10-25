-- Clientes, entrega 2 (docs/clientes.md): o cliente no pedido e no PDF do orçamento.
--
-- 1. O cliente do pedido segue a regra dos outros dados do documento: só muda no rascunho (pedido confirmado não
--    troca de CNPJ). Igual ao pedido_preparar de 20261015130000, com cliente_id na lista.
-- 2. Ligar um contato a um cliente preenche o cliente dos rascunhos desse contato que ainda estão sem cliente
--    (o orçamento aberto passa a sair com o CNPJ).
-- 3. O PDF que o agente envia (agente_dados_orcamento) leva o cadastro do cliente em "fiscal", no mesmo formato da
--    tela (DadosOrcamento.fiscal). O serviço livih-pdf desenha; sem cliente, sai como antes.

create or replace function public.pedido_preparar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_contato uuid;
begin
  if tg_op = 'UPDATE' and old.status <> 'rascunho'
     and (new.contato_id, new.cliente_id, new.desconto, new.frete, new.emissora_id, new.validade, new.condicoes_pagamento, new.prazo_entrega)
         is distinct from
         (old.contato_id, old.cliente_id, old.desconto, old.frete, old.emissora_id, old.validade, old.condicoes_pagamento, old.prazo_entrega) then
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

-- Contato ligado a um cliente: os rascunhos dele sem cliente ganham o cliente.
create function public.contatos_cliente_nos_rascunhos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.cliente_id is not null and new.cliente_id is distinct from old.cliente_id then
    update public.pedidos set cliente_id = new.cliente_id
     where contato_id = new.id and status = 'rascunho' and cliente_id is null;
  end if;
  return null;
end $$;
create trigger contatos_cliente_nos_rascunhos after update of cliente_id on public.contatos
for each row execute function public.contatos_cliente_nos_rascunhos();

-- Igual ao de 20261016120000, com "fiscal" (o cadastro do cliente do pedido).
create or replace function public.agente_dados_orcamento(p_conversa uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ped public.pedidos;
  v_emi public.emissoras;
begin
  v_ped := public.agente_rascunho_atual(p_conversa);
  if v_ped.id is null then
    return jsonb_build_object('sucesso', false, 'aviso', 'Não há orçamento montado pelo agente nesta conversa: monte com montar_pedido.');
  end if;
  if not exists (select 1 from public.pedido_itens where pedido_id = v_ped.id) then
    return jsonb_build_object('sucesso', false, 'aviso', 'O orçamento está sem itens.');
  end if;
  select * into v_emi from public.emissoras where id = v_ped.emissora_id;
  if v_emi.id is null then
    select * into v_emi from public.emissoras where org_id = v_ped.org_id and padrao;
  end if;

  return jsonb_build_object(
    'sucesso', true,
    'org_id', v_ped.org_id,
    'pedido', to_jsonb(v_ped),
    'itens', (select jsonb_agg(to_jsonb(i) || jsonb_build_object('codigo', p.codigo, 'unidade', p.unidade) order by i.ordem)
                from public.pedido_itens i left join public.produtos p on p.id = i.produto_id
               where i.pedido_id = v_ped.id),
    'emissora', to_jsonb(v_emi),
    'logo_path', v_emi.logo_path,
    'cliente', (select jsonb_build_object('nome', coalesce(nullif(btrim(ct.nome), ''), ct.nome_whatsapp, ct.telefone, 'Cliente'),
                                          'empresa', ct.empresa, 'telefone', ct.telefone, 'email', ct.email)
                  from public.contatos ct where ct.id = v_ped.contato_id),
    'fiscal', (select jsonb_build_object('tipo', cl.tipo, 'nome', cl.nome, 'razao_social', cl.razao_social,
                                         'documento', cl.documento, 'inscricao_estadual', cl.inscricao_estadual,
                                         'logradouro', cl.logradouro, 'numero', cl.numero, 'complemento', cl.complemento,
                                         'bairro', cl.bairro, 'cidade', cl.cidade, 'uf', cl.uf, 'cep', cl.cep, 'email', cl.email)
                 from public.clientes cl where cl.id = v_ped.cliente_id),
    'vendedor', (select jsonb_build_object('nome', coalesce(pf.nome, u.email::text, 'Equipe'), 'telefone', pf.telefone, 'email', u.email)
                   from auth.users u left join public.perfis pf on pf.user_id = u.id
                  where u.id = v_ped.responsavel_id)
  );
end $$;
