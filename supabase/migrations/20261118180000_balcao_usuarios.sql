-- Usuário do balcão (docs/balcao.md, decisões do usuário em 18/11).
--
-- Para abrir o balcão, o atendente precisava de "Vê todos os clientes", e um atendente vê bem mais do que o balcão
-- usa: na JoGrampo, o número de WhatsApp é compartilhado, então ele veria todas as conversas, contatos e
-- oportunidades, além dos pedidos de todos os clientes. Decidido: um usuário só para a área do balcão, cadastrado
-- pelo dono ou admin, que não conecta WhatsApp e só vê o balcão, as vendas de balcão da loja, os produtos e os
-- clientes (busca, cadastro e correção do cadastro fiscal, sem arquivar nem trocar o responsável).
--
-- Desenho: o usuário do balcão NÃO entra em membros_org. Tudo o que hoje depende de "ser da equipe" (eh_membro,
-- tem_papel, as 41 políticas e as 51 funções que leem membros_org: conversas, distribuição de contatos, alertas,
-- painel, equipes, OS, financeiro...) continua fechado para ele sem mudar nada. Ele fica em balcao_usuarios, e só
-- o que o balcão usa ganha uma política a mais com eh_balcao (as políticas de uma tabela somam). "Vê todos os
-- clientes" continua para quem é da equipe e cuida do faturamento.

create table public.balcao_usuarios (
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ativo boolean not null default true,
  emite_nota_fiscal boolean not null default false,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  primary key (org_id, user_id)
);
comment on table public.balcao_usuarios is
  'Usuários só do balcão (não são da equipe): veem o balcão, as vendas de balcão, os produtos e os clientes.';
comment on column public.balcao_usuarios.emite_nota_fiscal is 'Emite a NF-e das vendas de balcão (o dono ou admin liga).';
alter table public.balcao_usuarios enable row level security;
-- A pessoa vê a própria linha (o app monta a lista de empresas por ela); dono e admin veem os da empresa.
-- Gravação só pelas funções abaixo e pelo convite (convidar-membro, com a chave de serviço).
create policy balcao_usuarios_ver on public.balcao_usuarios for select to authenticated
  using (user_id = (select auth.uid()) or public.tem_papel(org_id, '{dono,admin}'));
grant select on public.balcao_usuarios to authenticated;

-- Quem é da equipe não é do balcão ao mesmo tempo (teria os dois acessos e a regra ficaria confusa).
create function public.balcao_usuarios_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.ativo and exists (select 1 from public.membros_org where org_id = new.org_id and user_id = new.user_id and ativo) then
    raise exception 'essa pessoa já é da equipe desta empresa: para o balcão, use outro e-mail';
  end if;
  new.atualizado_em := now();
  return new;
end $$;
create trigger balcao_usuarios_validar before insert or update on public.balcao_usuarios
for each row execute function public.balcao_usuarios_validar();
revoke execute on function public.balcao_usuarios_validar() from public, anon, authenticated;

create function public.eh_balcao(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.balcao_usuarios b join public.organizacoes o on o.id = b.org_id
     where b.org_id = p_org and b.user_id = auth.uid() and b.ativo and o.status = 'ativa'
  );
$$;
revoke execute on function public.eh_balcao(uuid) from public, anon;
grant execute on function public.eh_balcao(uuid) to authenticated;

-- ============================================================================
-- O que o balcão vê (uma política a mais em cada tabela; as da equipe não mudam)
-- ============================================================================
create policy org_ver_balcao on public.organizacoes for select to authenticated using (public.eh_balcao(id));
create policy emissoras_ver_balcao on public.emissoras for select to authenticated using (public.eh_balcao(org_id));
create policy produtos_ver_balcao on public.produtos for select to authenticated
  using (public.eh_balcao(org_id) and public.modulo_ativo(org_id, 'erp'));
create policy estoque_ver_balcao on public.estoque_movimentos for select to authenticated
  using (public.eh_balcao(org_id) and public.modulo_ativo(org_id, 'erp'));
-- Vendas de balcão da loja inteira (para reimprimir e reenviar a nota de um colega); os outros pedidos, não.
create policy pedidos_ver_balcao on public.pedidos for select to authenticated
  using (origem = 'balcao' and public.eh_balcao(org_id) and public.modulo_ativo(org_id, 'erp'));
create policy notas_fiscais_ver_balcao on public.notas_fiscais for select to authenticated
  using (public.eh_balcao(org_id) and pedido_id is not null
         and exists (select 1 from public.pedidos p where p.id = notas_fiscais.pedido_id and p.origem = 'balcao'));
-- Clientes: busca todos, cadastra e corrige; o responsável nasce vazio (não é da equipe) e só dono e admin trocam.
create policy clientes_ver_balcao on public.clientes for select to authenticated using (public.eh_balcao(org_id));
create policy clientes_criar_balcao on public.clientes for insert to authenticated
  with check (public.eh_balcao(org_id) and responsavel_id is null);
create policy clientes_editar_balcao on public.clientes for update to authenticated
  using (public.eh_balcao(org_id)) with check (public.eh_balcao(org_id));

-- Arquivar cliente não é do balcão (trocar o responsável já é só de dono e admin, em clientes_preparar).
create function public.clientes_balcao_guardar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.ativo is distinct from old.ativo and not public.eh_membro(old.org_id) and public.eh_balcao(old.org_id) then
    raise exception 'quem é do balcão não arquiva cliente: peça ao dono ou ao admin';
  end if;
  return new;
end $$;
create trigger clientes_balcao_guardar before update on public.clientes
for each row execute function public.clientes_balcao_guardar();
revoke execute on function public.clientes_balcao_guardar() from public, anon, authenticated;

-- Igual a 20261013120000, com o usuário do balcão (o menu depende dos módulos).
create or replace function public.org_modulos(p_org uuid)
returns table (codigo text, nome text, descricao text, adicional boolean, padrao boolean, ativo boolean)
language sql stable security definer set search_path = '' as $$
  select m.codigo, m.nome, m.descricao, m.adicional, m.padrao, public.modulo_ativo(p_org, m.codigo)
    from public.modulos m
   where public.eh_membro(p_org) or public.eh_balcao(p_org) or public.eh_admin_plataforma()
   order by m.ordem;
$$;

-- Igual a 20261025130000, mais o usuário do balcão que o dono ou admin deixou emitir.
create or replace function public.emite_nota_fiscal(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tem_papel(p_org, '{dono,admin}') or exists (
    select 1 from public.membros_org m join public.organizacoes o on o.id = m.org_id
     where m.org_id = p_org and m.user_id = auth.uid() and m.ativo and m.emite_nota_fiscal and o.status = 'ativa'
  ) or (public.eh_balcao(p_org)
        and exists (select 1 from public.balcao_usuarios b
                     where b.org_id = p_org and b.user_id = auth.uid() and b.emite_nota_fiscal));
$$;

-- Igual a 20261118140000: o usuário do balcão abre o balcão sem "Vê todos os clientes".
create or replace function public.balcao_pode(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.modulo_ativo(p_org, 'erp') and public.modulo_ativo(p_org, 'balcao')
     and (public.eh_balcao(p_org) or (public.eh_membro(p_org) and public.ve_todos_clientes(p_org)));
$$;

-- Igual a 20261013130000, com uma exceção: a venda que balcao_fechar está fechando (livih.balcao_pedido), que o
-- usuário do balcão não "vê" pela regra da equipe. Fora dela, ele não muda situação de pedido nenhum.
create or replace function public.pedido_mudar_status(p_pedido uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.pedidos;
  v_baixa boolean;
begin
  select * into v from public.pedidos where id = p_pedido for update;
  if v.id is null or not (public.pode_ver_pedido(v.org_id, v.contato_id, v.responsavel_id)
                          or coalesce(current_setting('livih.balcao_pedido', true), '') = v.id::text) then
    raise exception 'pedido não encontrado';
  end if;
  if not (
    (v.status = 'rascunho' and p_status in ('confirmado', 'cancelado')) or
    (v.status = 'confirmado' and p_status in ('rascunho', 'separando', 'enviado', 'entregue', 'cancelado')) or
    (v.status = 'separando' and p_status in ('confirmado', 'enviado', 'entregue', 'cancelado')) or
    (v.status = 'enviado' and p_status in ('entregue', 'cancelado'))
  ) then
    raise exception 'não dá para passar de % para %', v.status, p_status;
  end if;
  if p_status <> 'rascunho' and p_status <> 'cancelado' and not exists (select 1 from public.pedido_itens where pedido_id = v.id) then
    raise exception 'o pedido não tem itens';
  end if;

  v_baixa := p_status not in ('rascunho', 'cancelado');
  if v_baixa and not v.estoque_baixado then
    insert into public.estoque_movimentos (org_id, produto_id, quantidade, tipo, pedido_id, autor_id)
    select i.org_id, i.produto_id, -i.quantidade, 'pedido', v.id, auth.uid()
      from public.pedido_itens i join public.produtos pr on pr.id = i.produto_id
     where i.pedido_id = v.id and pr.controla_estoque;
  elsif not v_baixa and v.estoque_baixado then
    -- Devolve o líquido que o pedido ainda tem baixado em cada produto.
    insert into public.estoque_movimentos (org_id, produto_id, quantidade, tipo, pedido_id, autor_id, motivo)
    select v.org_id, m.produto_id, -sum(m.quantidade), 'estorno', v.id, auth.uid(),
           case when p_status = 'cancelado' then 'pedido cancelado' else 'pedido voltou para rascunho' end
      from public.estoque_movimentos m
     where m.pedido_id = v.id and m.tipo in ('pedido', 'estorno')
     group by m.produto_id
    having sum(m.quantidade) <> 0;
  end if;

  perform set_config('livih.pedido_status', 'on', true);
  update public.pedidos
     set status = p_status,
         estoque_baixado = v_baixa,
         confirmado_em = case when v_baixa then coalesce(confirmado_em, now()) when p_status = 'rascunho' then null else confirmado_em end
   where id = v.id;
  perform set_config('livih.pedido_status', 'off', true);
end $$;

-- Igual a 20261118140000, marcando a venda que está sendo fechada para a pedido_mudar_status aceitar o usuário do
-- balcão (ele não é da equipe, então não "vê" o pedido pela regra de antes).
create or replace function public.balcao_fechar(p_org uuid, p_itens jsonb, p_cliente uuid, p_forma text, p_prazos smallint[],
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

  perform set_config('livih.balcao_pedido', v_ped.id::text, true);
  perform public.pedido_mudar_status(v_ped.id, 'confirmado');
  perform public.pedido_mudar_status(v_ped.id, 'entregue');
  perform set_config('livih.balcao_pedido', '', true);

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

-- ============================================================================
-- Dono e admin cuidam dos usuários do balcão (Configurações → Equipe)
-- ============================================================================
create function public.balcao_usuarios_listar(p_org uuid)
returns table (user_id uuid, nome text, email text, ativo boolean, emite_nota_fiscal boolean, criado_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só o dono ou um admin vê os usuários do balcão';
  end if;
  return query
    select b.user_id, coalesce(nullif(btrim(pf.nome), ''), u.email::text), u.email::text, b.ativo, b.emite_nota_fiscal, b.criado_em
      from public.balcao_usuarios b
      join auth.users u on u.id = b.user_id
      left join public.perfis pf on pf.user_id = b.user_id
     where b.org_id = p_org
     order by b.ativo desc, 2;
end $$;
revoke execute on function public.balcao_usuarios_listar(uuid) from public, anon;
grant execute on function public.balcao_usuarios_listar(uuid) to authenticated;

-- Liga ou desliga "Emite nota fiscal" e tira (ou devolve) o acesso. Tirar não apaga: as vendas continuam com ele.
create function public.balcao_usuario_definir(p_org uuid, p_usuario uuid, p_ativo boolean, p_emite_nota boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes public.balcao_usuarios;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só o dono ou um admin muda os usuários do balcão';
  end if;
  select * into v_antes from public.balcao_usuarios where org_id = p_org and user_id = p_usuario;
  if v_antes.user_id is null then
    raise exception 'usuário do balcão não encontrado';
  end if;
  update public.balcao_usuarios
     set ativo = coalesce(p_ativo, ativo), emite_nota_fiscal = coalesce(p_emite_nota, emite_nota_fiscal)
   where org_id = p_org and user_id = p_usuario;
  perform public.auditar(p_org, 'balcao_usuario_definir', 'balcao_usuarios', p_usuario::text,
                         jsonb_build_object('ativo', v_antes.ativo, 'emite_nota_fiscal', v_antes.emite_nota_fiscal),
                         jsonb_build_object('ativo', coalesce(p_ativo, v_antes.ativo),
                                            'emite_nota_fiscal', coalesce(p_emite_nota, v_antes.emite_nota_fiscal)));
end $$;
revoke execute on function public.balcao_usuario_definir(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.balcao_usuario_definir(uuid, uuid, boolean, boolean) to authenticated;
