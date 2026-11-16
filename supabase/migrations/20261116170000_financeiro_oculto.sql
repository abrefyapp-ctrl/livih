-- Financeiro escondido por empresa (pedido do usuário em 16/11, CEFEQ).
--
-- O Financeiro aparece sozinho com o ERP ou as OS. A CEFEQ usa o ERP da Livih (pedidos e estoque), mas o financeiro
-- dela é no Sollus: o menu, a permissão e o bloco de pagamento do orçamento só confundiriam. E, escondido, o banco não
-- pode continuar gerando parcelas que ninguém vê nem baixa (viram "vencidas" se o Financeiro for ligado depois).
--
-- organizacoes.financeiro_oculto, mudado só pela equipe da plataforma (Empresas → Módulos). Com ele ligado, o pedido
-- confirmado e a nota de entrada não geram lançamentos, e as funções fin_* tratam o Financeiro como desligado
-- (fin_ligado). Não esconde empresa que já tem pagamento registrado: o cancelamento do pedido ficaria travado. A OS fatura no Financeiro como antes: quem esconde o Financeiro
-- não usa OS (a CEFEQ não tem); se um dia usar, olhar fin_sincronizar_os_item.

alter table public.organizacoes add column financeiro_oculto boolean not null default false;
comment on column public.organizacoes.financeiro_oculto is
  'Financeiro escondido (a empresa usa outro sistema): sem menu, sem pagamento no orçamento e sem lançamentos automáticos';

create function public.plataforma_definir_financeiro_oculto(p_org uuid, p_oculto boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes boolean;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma esconde ou mostra o Financeiro. Entre com a conta da plataforma.';
  end if;
  select financeiro_oculto into v_antes from public.organizacoes where id = p_org;
  if v_antes is null then
    raise exception 'Empresa não encontrada. Atualize a página e tente de novo.';
  end if;
  -- Com pagamento registrado, o pedido só se cancela desfazendo o pagamento no Financeiro, que estaria escondido.
  if coalesce(p_oculto, false) and not v_antes and exists (
    select 1 from public.fin_lancamentos where org_id = p_org and cancelado_em is null and valor_pago > 0
  ) then
    raise exception 'Esta empresa já tem pagamentos registrados no Financeiro. Escondido, os pedidos desses lançamentos não poderiam ser cancelados. Desfaça os pagamentos antes ou deixe o Financeiro visível.';
  end if;
  update public.organizacoes set financeiro_oculto = coalesce(p_oculto, false) where id = p_org;
  perform public.auditar(p_org, 'financeiro_oculto', 'organizacoes', p_org::text,
                         jsonb_build_object('oculto', v_antes), jsonb_build_object('oculto', coalesce(p_oculto, false)));
end $$;
revoke execute on function public.plataforma_definir_financeiro_oculto(uuid, boolean) from public, anon;
grant execute on function public.plataforma_definir_financeiro_oculto(uuid, boolean) to authenticated;

-- Igual a 20261028120000: escondido, o Financeiro também fica desligado para as funções fin_* (lançamento manual,
-- baixa, contas), não só para a tela (revisão de 16/11).
create or replace function public.fin_ligado(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.modulo_ativo(p_org, 'erp') or public.modulo_ativo(p_org, 'os'))
     and not coalesce((select o.financeiro_oculto from public.organizacoes o where o.id = p_org), false);
$$;

-- Igual a 20261029120000, sem parcelas na empresa com o Financeiro escondido.
create or replace function public.fin_gerar_parcelas_pedido(p_pedido uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.pedidos;
  v_prazos smallint[];
  v_n int;
  v_base numeric(14, 2);
  v_grupo uuid := gen_random_uuid();
  v_base_data date;
  v_desc text;
begin
  select * into p from public.pedidos where id = p_pedido;
  if p.id is null or coalesce(p.total, 0) <= 0
     or (select o.financeiro_oculto from public.organizacoes o where o.id = p.org_id) then
    return;
  end if;
  perform public.fin_preparar_org(p.org_id);
  v_prazos := coalesce(p.pagamento_prazos, '{0}');
  v_n := cardinality(v_prazos);
  v_base := floor(p.total * 100 / v_n) / 100;
  v_base_data := coalesce(p.confirmado_em, now()) at time zone 'America/Sao_Paulo';
  v_desc := left('Pedido nº ' || p.numero || coalesce(' · ' || (select nome from public.clientes where id = p.cliente_id), ''), 200);
  insert into public.fin_lancamentos (org_id, tipo, descricao, categoria_id, cliente_id, origem, grupo_id, parcela,
                                      parcelas, vencimento, valor, pedido_id, criado_por)
  select p.org_id, 'receber', v_desc, public.fin_categoria(p.org_id, 'Vendas', 'receita'), p.cliente_id, 'pedido',
         v_grupo, n, v_n, v_base_data + v_prazos[n],
         case when n = v_n then p.total - v_base * (v_n - 1) else v_base end,
         p.id, auth.uid()
    from generate_series(1, v_n) n;
end $$;
revoke execute on function public.fin_gerar_parcelas_pedido(uuid) from public, anon, authenticated;

-- Igual a 20261029120000, sem contas a pagar na empresa com o Financeiro escondido.
create or replace function public.fin_nota_entrada_gatilho() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_grupo uuid := gen_random_uuid();
  v_desc text := left(concat_ws(' · ', 'NF ' || coalesce(new.numero, 's/n'), new.emitente_nome), 200);
  v_n int := coalesce(jsonb_array_length(new.duplicatas), 0);
begin
  if (v_n = 0 and coalesce(new.valor_total, 0) <= 0)
     or (select o.financeiro_oculto from public.organizacoes o where o.id = new.org_id) then
    return null;
  end if;
  perform public.fin_preparar_org(new.org_id);
  if v_n > 0 then
    insert into public.fin_lancamentos (org_id, tipo, descricao, categoria_id, fornecedor_cnpj, fornecedor_nome, origem,
                                        grupo_id, parcela, parcelas, vencimento, valor, nota_entrada_id, criado_por)
    select new.org_id, 'pagar', v_desc, public.fin_categoria(new.org_id, 'Fornecedores', 'despesa'), new.emitente_cnpj,
           new.emitente_nome, 'nota_entrada', v_grupo,
           row_number() over (order by (d.v ->> 'vencimento')::date, d.n), v_n,
           (d.v ->> 'vencimento')::date, (d.v ->> 'valor')::numeric, new.id, new.autor_id
      from jsonb_array_elements(new.duplicatas) with ordinality as d (v, n);
  else
    insert into public.fin_lancamentos (org_id, tipo, descricao, categoria_id, fornecedor_cnpj, fornecedor_nome, origem,
                                        grupo_id, vencimento, valor, observacao, nota_entrada_id, criado_por)
    values (new.org_id, 'pagar', v_desc, public.fin_categoria(new.org_id, 'Fornecedores', 'despesa'), new.emitente_cnpj,
            new.emitente_nome, 'nota_entrada', v_grupo,
            coalesce(new.emissao, (now() at time zone 'America/Sao_Paulo')::date), new.valor_total,
            'A nota não trouxe as parcelas: confira o vencimento.', new.id, new.autor_id);
  end if;
  return null;
end $$;
revoke execute on function public.fin_nota_entrada_gatilho() from public, anon, authenticated;
