-- Cancelar venda de balcão (docs/balcao.md, pedido do usuário em 18/11).
--
-- A venda de balcão já nasce entregue (balcao_fechar), e pedido entregue não volta nem cancela pela
-- pedido_mudar_status. No teste de 18/11 as duas vendas da F7 Tech só saíram pelo banco: na loja, uma venda errada
-- ficaria para sempre. Esta função cancela a venda de balcão inteira: desfaz o pagamento registrado na hora, devolve
-- o estoque e cancela as parcelas (o gatilho fin_pedido faz isso ao mudar para cancelado).
-- Regras:
-- - só dono e admin (como cancelar a NF-e), com motivo, que fica na auditoria, no estorno e nas baixas desfeitas;
-- - só venda de balcão (origem balcao) entregue ou confirmada; os outros pedidos seguem pela pedido_mudar_status;
-- - com NF-e autorizada ou em processamento, recusa: cancela-se a nota antes (o prazo da SEFAZ é de 24 horas), e a
--   mercadoria não pode voltar ao estoque com a nota de saída valendo.

create function public.balcao_cancelar(p_pedido uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.pedidos;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  l record;
begin
  select * into v from public.pedidos where id = p_pedido for update;
  if v.id is null or not public.eh_membro(v.org_id) then
    raise exception 'venda não encontrada';
  end if;
  if not public.tem_papel(v.org_id, '{dono,admin}') then
    raise exception 'só o dono ou um admin cancela venda de balcão';
  end if;
  if v.origem <> 'balcao' then
    raise exception 'este pedido não é venda de balcão: cancele pelo pedido';
  end if;
  if v.status not in ('entregue', 'confirmado') then
    raise exception 'só dá para cancelar venda fechada (esta está %)', v.status;
  end if;
  if length(v_motivo) < 3 then
    raise exception 'escreva o motivo do cancelamento';
  end if;
  if exists (select 1 from public.notas_fiscais where pedido_id = v.id and status = 'processando') then
    raise exception 'a NF-e desta venda ainda está na SEFAZ: espere a resposta e tente de novo';
  end if;
  if exists (select 1 from public.notas_fiscais where pedido_id = v.id and status = 'autorizada') then
    raise exception 'a NF-e desta venda está autorizada: cancele a nota antes, no bloco Nota fiscal do pedido';
  end if;
  v_motivo := left(v_motivo, 200);

  -- Pagamento registrado na hora (ou depois, no Financeiro): desfeito, com o motivo.
  for l in select id from public.fin_lancamentos where pedido_id = v.id and cancelado_em is null and valor_pago > 0 loop
    perform public.fin_desfazer_baixas(l.id, left('Venda de balcão cancelada: ' || v_motivo, 300));
  end loop;

  -- Estoque: devolve o líquido que a venda ainda tem baixado em cada produto (como a pedido_mudar_status).
  if v.estoque_baixado then
    insert into public.estoque_movimentos (org_id, produto_id, quantidade, tipo, pedido_id, autor_id, motivo)
    select v.org_id, m.produto_id, -sum(m.quantidade), 'estorno', v.id, auth.uid(),
           left('venda de balcão cancelada: ' || v_motivo, 300)
      from public.estoque_movimentos m
     where m.pedido_id = v.id and m.tipo in ('pedido', 'estorno')
     group by m.produto_id
    having sum(m.quantidade) <> 0;
  end if;

  perform set_config('livih.pedido_status', 'on', true);
  update public.pedidos set status = 'cancelado', estoque_baixado = false where id = v.id;
  perform set_config('livih.pedido_status', 'off', true);

  perform public.auditar(v.org_id, 'balcao_cancelar', 'pedidos', v.id::text,
                         jsonb_build_object('status', v.status, 'total', v.total),
                         jsonb_build_object('status', 'cancelado', 'motivo', v_motivo));
end $$;
revoke execute on function public.balcao_cancelar(uuid, text) from public, anon;
grant execute on function public.balcao_cancelar(uuid, text) to authenticated;
