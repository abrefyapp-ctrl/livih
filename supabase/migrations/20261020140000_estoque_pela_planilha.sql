-- Estoque pela planilha (pedido de 20/10, JoGrampo subiu 928 produtos e o estoque ficou zero).
--
-- A importação de produtos ganhou a coluna Estoque (ou Quantidade / Saldo). O número é o SALDO FINAL: o Livih lança o
-- ajuste que leva o saldo atual até ele (motivo "Estoque pela planilha", com quem subiu). Subir a mesma planilha de
-- novo não duplica nada, e serve para conferências periódicas. Produto que não controlava estoque passa a controlar.
--
-- p_itens: [{ "codigo": "14/19" | null, "nome": "..." | null, "saldo": 12 }] — acha pelo código; sem código, pelo
-- nome exato (só se houver um produto com esse nome).
create function public.estoque_definir_saldos(p_org uuid, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_prod public.produtos;
  v_saldo numeric;
  v_atual numeric;
  v_alterados integer := 0;
  v_iguais integer := 0;
  v_nao jsonb := '[]';
begin
  if not public.tem_papel(p_org, '{dono,admin}') or not public.modulo_ativo(p_org, 'erp') then
    raise exception 'sem acesso';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) > 20000 then
    raise exception 'itens inválidos';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_saldo := (v_item ->> 'saldo')::numeric;
    if v_saldo is null or v_saldo < 0 then
      v_nao := v_nao || jsonb_build_object('codigo', v_item ->> 'codigo', 'nome', v_item ->> 'nome', 'motivo', 'quantidade inválida');
      continue;
    end if;
    v_prod := null;
    if nullif(btrim(v_item ->> 'codigo'), '') is not null then
      select * into v_prod from public.produtos
       where org_id = p_org and lower(codigo) = lower(btrim(v_item ->> 'codigo')) limit 1;
    elsif nullif(btrim(v_item ->> 'nome'), '') is not null
          and (select count(*) from public.produtos where org_id = p_org and lower(nome) = lower(btrim(v_item ->> 'nome'))) = 1 then
      select * into v_prod from public.produtos where org_id = p_org and lower(nome) = lower(btrim(v_item ->> 'nome'));
    end if;
    if v_prod.id is null then
      v_nao := v_nao || jsonb_build_object('codigo', v_item ->> 'codigo', 'nome', v_item ->> 'nome', 'motivo', 'produto não encontrado');
      continue;
    end if;

    if not v_prod.controla_estoque then
      update public.produtos set controla_estoque = true where id = v_prod.id;
    end if;
    select coalesce(sum(quantidade), 0) into v_atual from public.estoque_movimentos where produto_id = v_prod.id;
    if v_saldo = v_atual then
      v_iguais := v_iguais + 1;
    else
      insert into public.estoque_movimentos (org_id, produto_id, quantidade, tipo, motivo, autor_id)
      values (p_org, v_prod.id, v_saldo - v_atual, 'ajuste', 'Estoque pela planilha', auth.uid());
      v_alterados := v_alterados + 1;
    end if;
  end loop;

  return jsonb_build_object('alterados', v_alterados, 'iguais', v_iguais, 'nao_encontrados', v_nao);
end $$;

revoke execute on function public.estoque_definir_saldos(uuid, jsonb) from public, anon;
grant execute on function public.estoque_definir_saldos(uuid, jsonb) to authenticated;
