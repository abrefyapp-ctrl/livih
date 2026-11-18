-- Venda de balcão, entrega 1 (docs/balcao.md, decisões de 27/10 e 18/11; pedido do usuário em 18/11).
--
-- A venda de balcão era um pedido comum: criar, marcar "sem cliente", adicionar itens, confirmar, emitir. Várias
-- telas para uma venda de um minuto. Agora é um módulo (catálogo de módulos, ligado pela plataforma como o ERP e as
-- OS) com uma tela própria que fecha a venda numa chamada só: balcao_fechar cria o pedido com os itens, confirma
-- (baixa o estoque e gera as parcelas), marca como entregue e, no dinheiro, Pix e débito, já dá a parcela como paga
-- na conta do caixa. Decisões de 18/11:
-- - abre o balcão quem tem "Vê todos os clientes" (dono e admin sempre); sem papel novo;
-- - dinheiro, Pix e débito fecham pagos, na conta escolhida pelo dono ou admin (sem escolha: a primeira conta do
--   tipo caixa, depois a primeira ativa); crédito fica a receber em 30 dias (maquininha); a prazo em boleto, nos
--   prazos escolhidos na hora (30, 30/60, 30/60/90 ou digitados), e exige cliente;
-- - a venda baixa o estoque ao fechar e vender sem saldo continua livre;
-- - desconto por item e no total (migration 20261118120000).
-- O módulo não tem preço por enquanto (preco_mensal nulo): não entra na fatura nem na tela do plano do dono.
-- O cliente está no balcão: a venda não manda o aviso de situação do pedido pelo WhatsApp.

insert into public.modulos (codigo, nome, descricao, padrao, adicional, ordem) values
  ('balcao', 'Balcão', 'Venda rápida no balcão: busca o produto, fecha a venda e emite a NF-e. Precisa do ERP.', false, true, 4);

alter table public.pedidos drop constraint pedidos_origem_check;
alter table public.pedidos add constraint pedidos_origem_check check (origem in ('manual', 'agente', 'balcao'));

alter table public.organizacoes add column balcao_conta_id uuid,
  add constraint organizacoes_balcao_conta_fk foreign key (balcao_conta_id, id)
    references public.fin_contas (id, org_id) on delete set null (balcao_conta_id);
comment on column public.organizacoes.balcao_conta_id is
  'Conta do financeiro onde entram as vendas de balcão pagas na hora (dinheiro, Pix, débito). Nula: a primeira conta do tipo caixa.';

-- Quem abre o balcão: ERP e Balcão ligados e "Vê todos os clientes" (que já inclui dono e admin).
create function public.balcao_pode(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org) and public.modulo_ativo(p_org, 'erp') and public.modulo_ativo(p_org, 'balcao')
     and public.ve_todos_clientes(p_org);
$$;
revoke execute on function public.balcao_pode(uuid) from public, anon;
grant execute on function public.balcao_pode(uuid) to authenticated;

-- Conta das vendas pagas na hora: a escolhida, senão a primeira do tipo caixa, senão a primeira ativa.
create function public.balcao_conta(p_org uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.id from public.organizacoes o join public.fin_contas c on c.id = o.balcao_conta_id and c.ativa
      where o.id = p_org),
    (select c.id from public.fin_contas c where c.org_id = p_org and c.ativa and c.tipo = 'caixa' order by c.criado_em limit 1),
    (select c.id from public.fin_contas c where c.org_id = p_org and c.ativa order by c.criado_em limit 1)
  );
$$;
revoke execute on function public.balcao_conta(uuid) from public, anon, authenticated;

-- O que a tela do balcão precisa saber ao abrir.
create function public.balcao_config(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_gerencia boolean := public.tem_papel(p_org, '{dono,admin}');
  v_fin boolean := public.fin_ligado(p_org);
  v_conta uuid;
  e public.emissoras;
begin
  if not public.balcao_pode(p_org) then
    raise exception 'o balcão não está liberado para você nesta empresa';
  end if;
  select * into e from public.emissoras where org_id = p_org order by padrao_balcao desc, padrao desc, criado_em limit 1;
  v_conta := case when v_fin then public.balcao_conta(p_org) end;
  return jsonb_build_object(
    'financeiro', v_fin,
    'conta', (select jsonb_build_object('id', c.id, 'nome', c.nome) from public.fin_contas c where c.id = v_conta),
    'conta_escolhida', (select balcao_conta_id from public.organizacoes where id = p_org),
    'contas', case when v_gerencia and v_fin then
                (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'tipo', c.tipo) order by c.nome), '[]')
                   from public.fin_contas c where c.org_id = p_org and c.ativa) end,
    'emissora', case when e.id is not null then
                  jsonb_build_object('id', e.id, 'nome', coalesce(nullif(btrim(e.nome_fantasia), ''), e.razao_social),
                                     'pronta', e.nfe_status = 'pronta', 'balcao', e.padrao_balcao) end,
    'emite_nota', public.emite_nota_fiscal(p_org) and public.nota_fiscal_liberada(p_org),
    'gerencia', v_gerencia
  );
end $$;
revoke execute on function public.balcao_config(uuid) from public, anon;
grant execute on function public.balcao_config(uuid) to authenticated;

-- Dono e admin escolhem a conta do caixa (nula volta ao automático).
create function public.balcao_definir_conta(p_org uuid, p_conta uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_antes uuid;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só o dono ou um admin escolhe a conta do caixa';
  end if;
  if p_conta is not null and not exists (select 1 from public.fin_contas where id = p_conta and org_id = p_org and ativa) then
    raise exception 'escolha uma conta ativa da empresa';
  end if;
  select balcao_conta_id into v_antes from public.organizacoes where id = p_org;
  update public.organizacoes set balcao_conta_id = p_conta where id = p_org;
  if v_antes is distinct from p_conta then
    perform public.auditar(p_org, 'balcao_definir_conta', 'organizacoes', p_org::text,
                           jsonb_build_object('balcao_conta_id', v_antes), jsonb_build_object('balcao_conta_id', p_conta));
  end if;
end $$;
revoke execute on function public.balcao_definir_conta(uuid, uuid) from public, anon;
grant execute on function public.balcao_definir_conta(uuid, uuid) to authenticated;

-- Mais vendidos dos últimos 90 dias, para a tela abrir com eles (antes de buscar).
create function public.balcao_mais_vendidos(p_org uuid) returns table (produto_id uuid)
language sql stable security definer set search_path = '' as $$
  select i.produto_id
    from public.pedido_itens i
    join public.pedidos p on p.id = i.pedido_id
    join public.produtos pr on pr.id = i.produto_id and pr.ativo
   where public.balcao_pode(p_org) and p.org_id = p_org and p.status not in ('rascunho', 'cancelado')
     and p.criado_em > now() - interval '90 days'
   group by i.produto_id
   order by count(*) desc, sum(i.quantidade) desc
   limit 12;
$$;
revoke execute on function public.balcao_mais_vendidos(uuid) from public, anon;
grant execute on function public.balcao_mais_vendidos(uuid) to authenticated;

-- Fecha a venda: pedido, itens, confirmação, entrega e o pagamento na hora, tudo ou nada.
-- p_itens: [{"produto_id": uuid, "quantidade": n, "desconto": R$} ou {..., "desconto_percentual": %}]
-- p_forma: dinheiro | pix | cartao_debito | cartao_credito | a_prazo. p_prazos só no a prazo (dias depois de hoje).
create function public.balcao_fechar(p_org uuid, p_itens jsonb, p_cliente uuid, p_forma text, p_prazos smallint[],
                                     p_desconto numeric, p_observacao text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ped public.pedidos;
  v_emissora uuid;
  v_forma text;
  v_prazos smallint[];
  v_item jsonb;
  v_prod public.produtos;
  v_qtd numeric;
  v_ordem integer := 0;
  v_conta uuid;
  v_pago boolean := false;
  l record;
begin
  if not public.balcao_pode(p_org) then
    raise exception 'o balcão não está liberado para você nesta empresa';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'a venda não tem itens';
  end if;
  if jsonb_array_length(p_itens) > 200 then
    raise exception 'a venda passa de 200 itens: divida em duas';
  end if;
  if p_cliente is not null and not exists (select 1 from public.clientes where id = p_cliente and org_id = p_org) then
    raise exception 'cliente não encontrado nesta empresa';
  end if;
  if coalesce(p_desconto, 0) < 0 then
    raise exception 'o desconto não pode ser negativo';
  end if;

  case p_forma
    when 'dinheiro', 'pix', 'cartao_debito' then v_forma := p_forma; v_prazos := '{0}';
    when 'cartao_credito' then v_forma := p_forma; v_prazos := '{30}';
    when 'a_prazo' then
      if p_cliente is null then
        raise exception 'venda a prazo precisa de cliente: escolha o cliente antes de fechar';
      end if;
      if p_prazos is null or cardinality(p_prazos) not between 1 and 12
         or 1 > any (p_prazos) or 365 < any (p_prazos) then
        raise exception 'informe de 1 a 12 prazos, entre 1 e 365 dias';
      end if;
      v_forma := 'boleto';
      v_prazos := (select array_agg(x order by x) from unnest(p_prazos) x);
    else
      raise exception 'escolha a forma de pagamento';
  end case;

  -- A nota da venda de balcão sai pelo CNPJ do balcão (sem ele, o padrão do pedido).
  select id into v_emissora from public.emissoras where org_id = p_org and padrao_balcao;

  insert into public.pedidos (org_id, cliente_id, origem, emissora_id, pagamento_forma, pagamento_prazos, observacao)
  values (p_org, p_cliente, 'balcao', v_emissora, v_forma, v_prazos, nullif(btrim(p_observacao), ''))
  returning * into v_ped;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_prod from public.produtos
     where id = (v_item ->> 'produto_id')::uuid and org_id = p_org and ativo;
    if v_prod.id is null then
      raise exception 'produto não encontrado ou inativo: atualize a tela e adicione de novo';
    end if;
    v_qtd := (v_item ->> 'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then
      raise exception 'quantidade inválida em %', v_prod.nome;
    end if;
    insert into public.pedido_itens (org_id, pedido_id, produto_id, descricao, quantidade, preco_unitario, desconto,
                                     desconto_percentual, ordem)
    values (p_org, v_ped.id, v_prod.id, left(v_prod.nome, 200), v_qtd, v_prod.preco,
            coalesce((v_item ->> 'desconto')::numeric, 0), (v_item ->> 'desconto_percentual')::numeric, v_ordem);
    v_ordem := v_ordem + 1;
  end loop;

  select * into v_ped from public.pedidos where id = v_ped.id;
  if coalesce(p_desconto, 0) > v_ped.subtotal then
    raise exception 'o desconto no total passa do valor dos itens';
  end if;
  if coalesce(p_desconto, 0) > 0 then
    update public.pedidos set desconto = round(p_desconto, 2) where id = v_ped.id;
  end if;

  perform public.pedido_mudar_status(v_ped.id, 'confirmado');
  perform public.pedido_mudar_status(v_ped.id, 'entregue');

  -- Pago na hora: a parcela única (vencimento hoje) recebe a baixa inteira na conta do caixa.
  if v_forma in ('dinheiro', 'pix', 'cartao_debito') then
    v_conta := public.balcao_conta(p_org);
    for l in select id, valor - valor_pago as falta from public.fin_lancamentos
              where pedido_id = v_ped.id and cancelado_em is null and valor - valor_pago > 0 loop
      if v_conta is null then
        raise exception 'a empresa não tem conta ativa no financeiro para receber a venda: crie uma em Financeiro → Contas';
      end if;
      insert into public.fin_baixas (org_id, lancamento_id, conta_id, data, valor, forma, observacao, criado_por)
      values (p_org, l.id, v_conta, public.hoje_brasil(), l.falta, v_forma, 'Venda de balcão', auth.uid());
      perform public.fin_recalcular_pago(l.id);
      v_pago := true;
    end loop;
  end if;

  select * into v_ped from public.pedidos where id = v_ped.id;
  return jsonb_build_object('pedido_id', v_ped.id, 'numero', v_ped.numero, 'total', v_ped.total, 'pago', v_pago,
                            'emissora_id', v_ped.emissora_id, 'forma', v_forma, 'prazos', to_jsonb(v_prazos));
end $$;
revoke execute on function public.balcao_fechar(uuid, jsonb, uuid, text, smallint[], numeric, text) from public, anon;
grant execute on function public.balcao_fechar(uuid, jsonb, uuid, text, smallint[], numeric, text) to authenticated;

-- Igual a 20261106130000, sem o aviso nas vendas de balcão (o cliente está na loja).
create or replace function public.pedidos_avisar_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.origem <> 'balcao' then
    begin
      perform public.pedido_avisar(new.id, new.status);
    exception when others then
      insert into public.pedido_avisos_envios (org_id, pedido_id, status, enviado, resultado)
      values (new.org_id, new.id, new.status, false, left('Não enviado: erro inesperado (' || sqlerrm || ')', 500));
    end;
  end if;
  return null;
end $$;
