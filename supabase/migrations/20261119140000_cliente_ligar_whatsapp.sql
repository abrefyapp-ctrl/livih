-- WhatsApp do cliente ligado já ao fechar a venda do Balcão (docs/balcao.md, pedido do usuário em 19/11/2026).
--
-- Caso real (19/11, JoGrampo): o WhatsApp digitado no Balcão para o Affonso Ditzel não ficou em lugar nenhum, porque
-- a NF-e não saiu (faltava o endereço do cliente) e o número só era ligado ao cliente no envio da nota
-- (nota_whatsapp_preparar). Agora o Balcão chama esta função logo depois de fechar a venda: o número vira contato
-- ligado ao cliente (ou o contato que já tem o número passa a ser ligado a ele), como no envio da nota.
--
-- Mesmas regras do envio da nota: o telefone de um contato que já existe nunca muda (decisão de 18/11; o telefone é a
-- identidade do contato no WhatsApp), e o contato novo nasce sem vendedor responsável (o do envio da nota é criado
-- pelo sistema; aqui, sem o ajuste, o gatilho contato_responsavel_padrao o poria na carteira de quem vendeu).
-- Quem pode: quem vê o cliente (pode_ver_cliente) e o usuário do balcão da empresa (eh_balcao).

create function public.cliente_ligar_whatsapp(p_cliente uuid, p_telefone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_ct uuid;
begin
  select * into c from public.clientes where id = p_cliente;
  if c.id is null or not (public.pode_ver_cliente(c.id) or public.eh_balcao(c.org_id)) then
    raise exception 'cliente não encontrado';
  end if;
  if coalesce(p_telefone, '') !~ '^55[0-9]{10,11}$' then
    raise exception 'Confira o WhatsApp: DDD e número, como (41) 99999-8888.';
  end if;

  select id into v_ct from public.contatos where org_id = c.org_id and telefone = p_telefone;
  if v_ct is null then
    insert into public.contatos (org_id, telefone, nome, origem)
    values (c.org_id, p_telefone, left(coalesce(nullif(btrim(c.nome), ''), c.razao_social), 120), 'balcao')
    on conflict (org_id, telefone) do nothing
    returning id into v_ct;
    if v_ct is null then
      select id into v_ct from public.contatos where org_id = c.org_id and telefone = p_telefone;
    else
      -- Como no envio da nota: sem vendedor responsável (o gatilho põe quem criou, se for da equipe).
      update public.contatos set responsavel_id = null where id = v_ct and responsavel_id is not null;
    end if;
  end if;

  insert into public.contatos_clientes (org_id, contato_id, cliente_id, criado_por)
  values (c.org_id, v_ct, c.id, auth.uid())
  on conflict do nothing;
  return v_ct;
end $$;
revoke execute on function public.cliente_ligar_whatsapp(uuid, text) from public, anon;
grant execute on function public.cliente_ligar_whatsapp(uuid, text) to authenticated;
