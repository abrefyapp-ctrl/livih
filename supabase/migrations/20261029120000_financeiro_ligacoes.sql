-- Financeiro, entrega 2 (docs/financeiro.md, 28/10): os lançamentos nascem do pedido, da OS e da nota de entrada.
--
-- - Pedido: a condição de pagamento passa a ter forma e prazos (dias depois da confirmação, ex.: {30,60,90}).
--   Confirmar gera o a receber em parcelas; voltar para rascunho ou cancelar cancela as parcelas. Mudar o total, a
--   forma ou os prazos de um pedido confirmado refaz as parcelas. Com pagamento já registrado, essas mudanças são
--   recusadas (desfaz-se no financeiro antes). Os pedidos confirmados antes desta migration não ganham parcelas: a
--   JoGrampo tem 17 entregues que provavelmente já foram pagos.
-- - OS: um lançamento por item faturado, mantido por um gatilho em os_itens. Assim os três caminhos que gravam
--   faturamento e pagamento (os_faturar, os_registrar_pagamento e a importação da planilha) entram juntos. O
--   pagamento da OS vira baixa na primeira conta da empresa (o Caixa), e a baixa feita no financeiro volta para a OS
--   (pago_em), para o painel e a previsão das OS seguirem certos até lerem os lançamentos (entrega 3).
-- - Nota de entrada: as duplicatas do XML (cobr > dup) viram o a pagar do fornecedor; sem duplicata, uma parcela
--   com o valor da nota, vencendo na emissão, para conferir.
--
-- Migração: os itens de OS já faturados ganham o lançamento (e a baixa, se pagos). Em 28/10 só a Cactos (demonstração)
-- tinha itens faturados: 54, dos quais 39 pagos.

-- ============================================================================
-- Ligações dos lançamentos
-- ============================================================================
alter table public.fin_lancamentos
  add column pedido_id uuid,
  add column os_item_id uuid,
  add column nota_entrada_id uuid,
  add foreign key (pedido_id, org_id) references public.pedidos (id, org_id) on delete set null (pedido_id),
  add foreign key (os_item_id, org_id) references public.os_itens (id, org_id) on delete set null (os_item_id),
  add foreign key (nota_entrada_id, org_id) references public.notas_entrada (id, org_id) on delete set null (nota_entrada_id);
create index fin_lancamentos_pedido_idx on public.fin_lancamentos (pedido_id) where pedido_id is not null;
create unique index fin_lancamentos_os_item_ativo on public.fin_lancamentos (os_item_id)
  where os_item_id is not null and cancelado_em is null;
create index fin_lancamentos_nota_idx on public.fin_lancamentos (nota_entrada_id) where nota_entrada_id is not null;
comment on column public.fin_lancamentos.os_item_id is 'item de OS faturado; no máximo um lançamento ativo por item';

-- A visão foi criada com l.*: recriar para trazer as colunas novas.
drop view public.fin_lancamentos_situacao;
create view public.fin_lancamentos_situacao with (security_invoker = true) as
select l.*,
       l.valor - l.valor_pago as restante,
       case
         when l.cancelado_em is not null then 'cancelado'
         when l.valor_pago >= l.valor then 'pago'
         when l.vencimento < (now() at time zone 'America/Sao_Paulo')::date then 'vencido'
         when l.valor_pago > 0 then 'parcial'
         else 'aberto'
       end as situacao
  from public.fin_lancamentos l;
grant select on public.fin_lancamentos_situacao to authenticated;
comment on view public.fin_lancamentos_situacao is 'lançamentos com o que falta pagar e a situação: aberto, parcial, vencido (mesmo pago em parte), pago ou cancelado';

-- ============================================================================
-- Padrões da empresa (sem conferir quem chama: só as funções e os gatilhos usam)
-- ============================================================================
create function public.fin_preparar_org(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.fin_categorias where org_id = p_org) then
    insert into public.fin_categorias (org_id, nome, tipo) values
      (p_org, 'Vendas', 'receita'),
      (p_org, 'Serviços', 'receita'),
      (p_org, 'Fornecedores', 'despesa'),
      (p_org, 'Impostos', 'despesa'),
      (p_org, 'Folha de pagamento', 'despesa'),
      (p_org, 'Aluguel', 'despesa'),
      (p_org, 'Despesas gerais', 'despesa');
  end if;
  if not exists (select 1 from public.fin_contas where org_id = p_org) then
    insert into public.fin_contas (org_id, nome, tipo) values (p_org, 'Caixa', 'caixa');
  end if;
end $$;

create or replace function public.fin_preparar(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.fin_exigir(p_org);
  perform public.fin_preparar_org(p_org);
end $$;

-- Categoria padrão pelo nome (a empresa pode ter renomeado ou desativado: aí fica sem categoria).
create function public.fin_categoria(p_org uuid, p_nome text, p_tipo text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.fin_categorias
   where org_id = p_org and tipo = p_tipo and ativa and lower(nome) = lower(p_nome)
   limit 1;
$$;

-- Conta das baixas automáticas (pagamento registrado na OS): a primeira conta ativa, que nasce como Caixa.
create function public.fin_conta_padrao(p_org uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.fin_preparar_org(p_org);
  select id into v_id from public.fin_contas where org_id = p_org and ativa order by criado_em limit 1;
  if v_id is null then
    raise exception 'a empresa não tem conta ativa no financeiro: reative uma em Financeiro → Contas';
  end if;
  return v_id;
end $$;

revoke execute on function public.fin_preparar_org(uuid), public.fin_categoria(uuid, text, text),
  public.fin_conta_padrao(uuid) from public, anon, authenticated;

-- ============================================================================
-- Pago recalculado e devolvido para a OS
-- ============================================================================
-- livih.fin_os = 'on' enquanto o gatilho da OS mexe no financeiro: aí a OS já está certa e não se escreve de volta.
create or replace function public.fin_recalcular_pago(p_lancamento uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  l public.fin_lancamentos;
begin
  update public.fin_lancamentos f
     set valor_pago = coalesce(b.total, 0),
         pago_em = case when coalesce(b.total, 0) >= f.valor then b.ultima end,
         atualizado_em = now()
    from (select sum(valor) as total, max(data) as ultima
            from public.fin_baixas where lancamento_id = p_lancamento and desfeita_em is null) b
   where f.id = p_lancamento
  returning f.* into l;
  if l.os_item_id is not null and coalesce(current_setting('livih.fin_os', true), '') <> 'on' then
    perform set_config('livih.fin_os', 'on', true);
    perform set_config('livih.os_item', 'on', true);
    update public.os_itens set pago_em = l.pago_em where id = l.os_item_id and pago_em is distinct from l.pago_em;
    perform set_config('livih.os_item', 'off', true);
    perform set_config('livih.fin_os', 'off', true);
  end if;
end $$;
revoke execute on function public.fin_recalcular_pago(uuid) from public, anon, authenticated;

-- Desfaz as baixas ativas de um lançamento (pedido cancelado não chega aqui: é recusado antes).
create function public.fin_desfazer_baixas(p_lancamento uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.fin_baixas set desfeita_em = now(), desfeita_por = auth.uid(), motivo_desfazer = p_motivo
   where lancamento_id = p_lancamento and desfeita_em is null;
  perform public.fin_recalcular_pago(p_lancamento);
end $$;
revoke execute on function public.fin_desfazer_baixas(uuid, text) from public, anon, authenticated;

-- Lançamento do pedido ou da OS se cancela lá (cancelar o pedido, desfazer o faturamento), para os dois não divergirem.
create or replace function public.fin_cancelar_lancamento(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  l public.fin_lancamentos;
begin
  select * into l from public.fin_lancamentos where id = p_id for update;
  if l.id is null then
    raise exception 'lançamento não encontrado';
  end if;
  perform public.fin_exigir(l.org_id);
  if l.origem = 'pedido' then
    raise exception 'este lançamento vem do pedido: cancele o pedido ou volte ele para rascunho';
  end if;
  if l.origem = 'os' then
    raise exception 'este lançamento vem da OS: desfaça o faturamento do item na OS';
  end if;
  if l.cancelado_em is not null then
    raise exception 'o lançamento já está cancelado';
  end if;
  if l.valor_pago > 0 then
    raise exception 'desfaça as baixas antes de cancelar';
  end if;
  update public.fin_lancamentos
     set cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = nullif(btrim(p_motivo), ''),
         atualizado_em = now()
   where id = p_id;
  perform public.auditar(l.org_id, 'cancelar', 'fin_lancamentos', p_id::text,
                         jsonb_build_object('valor', l.valor, 'vencimento', l.vencimento),
                         jsonb_build_object('motivo', p_motivo));
end $$;

-- ============================================================================
-- OS: um lançamento por item faturado
-- ============================================================================
create function public.fin_sincronizar_os_item(p_item uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  i public.os_itens;
  o public.ordens_servico;
  l public.fin_lancamentos;
  v_cobrar boolean;
begin
  select * into i from public.os_itens where id = p_item;
  if i.id is null then
    return;
  end if;
  select * into o from public.ordens_servico where id = i.os_id;
  select * into l from public.fin_lancamentos where os_item_id = i.id and cancelado_em is null for update;
  v_cobrar := i.faturado_em is not null and i.cobranca = 'cobrado' and coalesce(i.valor, 0) > 0;

  perform set_config('livih.fin_os', 'on', true);
  if not v_cobrar then
    -- Faturamento desfeito, item virou garantia/cortesia ou valor zerado: sai do a receber.
    if l.id is not null then
      perform public.fin_desfazer_baixas(l.id, 'faturamento desfeito na OS');
      update public.fin_lancamentos
         set cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = 'faturamento desfeito na OS',
             atualizado_em = now()
       where id = l.id;
    end if;
    perform set_config('livih.fin_os', 'off', true);
    return;
  end if;

  if l.id is null then
    perform public.fin_preparar_org(i.org_id);
    insert into public.fin_lancamentos (org_id, tipo, descricao, categoria_id, cliente_id, origem, grupo_id, vencimento,
                                        valor, os_item_id, criado_por)
    values (i.org_id, 'receber',
            left(concat_ws(' · ', 'OS nº ' || o.numero, nullif(concat_ws(' ', i.modelo, i.identificacao), '')), 200),
            public.fin_categoria(i.org_id, 'Serviços', 'receita'), o.cliente_id, 'os', gen_random_uuid(),
            coalesce(i.vencimento_em, i.faturado_em), i.valor, i.id, auth.uid())
    returning * into l;
  else
    update public.fin_lancamentos
       set vencimento = coalesce(i.vencimento_em, i.faturado_em),
           valor = greatest(i.valor, valor_pago),
           cliente_id = coalesce(o.cliente_id, cliente_id),
           atualizado_em = now()
     where id = l.id
    returning * into l;
  end if;

  if i.pago_em is not null and l.valor_pago < l.valor then
    insert into public.fin_baixas (org_id, lancamento_id, conta_id, data, valor, forma, observacao, criado_por)
    values (i.org_id, l.id, public.fin_conta_padrao(i.org_id), i.pago_em, l.valor - l.valor_pago, 'outro',
            'registrado na OS', auth.uid());
    perform public.fin_recalcular_pago(l.id);
  elsif i.pago_em is null and l.valor_pago > 0 and l.valor_pago >= l.valor then
    -- Pagamento desfeito na OS (só quando a OS dizia pago; pagamento em parte feito no financeiro fica).
    perform public.fin_desfazer_baixas(l.id, 'pagamento desfeito na OS');
  end if;
  perform set_config('livih.fin_os', 'off', true);
end $$;
revoke execute on function public.fin_sincronizar_os_item(uuid) from public, anon, authenticated;

create function public.fin_os_item_gatilho() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('livih.fin_os', true), '') = 'on' then
    return null;
  end if;
  if tg_op = 'INSERT' or (new.faturado_em, new.vencimento_em, new.pago_em, new.valor, new.cobranca)
                         is distinct from (old.faturado_em, old.vencimento_em, old.pago_em, old.valor, old.cobranca) then
    perform public.fin_sincronizar_os_item(new.id);
  end if;
  return null;
end $$;
revoke execute on function public.fin_os_item_gatilho() from public, anon, authenticated;
create trigger fin_os_item after insert or update on public.os_itens
for each row execute function public.fin_os_item_gatilho();

-- ============================================================================
-- Pedido: condição de pagamento e parcelas
-- ============================================================================
alter table public.pedidos
  add column pagamento_forma text check (pagamento_forma in ('pix', 'boleto', 'dinheiro', 'cartao_credito', 'cartao_debito',
                                                             'transferencia', 'cheque', 'outro')),
  add column pagamento_prazos smallint[] check (
    pagamento_prazos is null
    or (cardinality(pagamento_prazos) between 1 and 24 and 0 <= all (pagamento_prazos) and 720 >= all (pagamento_prazos))
  );
comment on column public.pedidos.pagamento_forma is 'forma de pagamento combinada; vai para a NF-e e para as parcelas';
comment on column public.pedidos.pagamento_prazos is 'dias depois da confirmação de cada parcela: {0} à vista, {30}, {30,60,90}; vazio = à vista';

-- Gera as parcelas do pedido: o total dividido pelos prazos, os centavos que sobram na última.
create function public.fin_gerar_parcelas_pedido(p_pedido uuid)
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
  if p.id is null or coalesce(p.total, 0) <= 0 then
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

create function public.fin_pedido_gatilho() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ativo boolean := new.status not in ('rascunho', 'cancelado');
  v_era_ativo boolean := old.status not in ('rascunho', 'cancelado');
  v_mudou boolean := (new.total, new.pagamento_prazos) is distinct from (old.total, old.pagamento_prazos);
  v_tem_lancamento boolean;
begin
  if not v_ativo and not v_era_ativo then
    return null;
  end if;
  if v_ativo and v_era_ativo and not v_mudou then
    return null;
  end if;
  select exists (select 1 from public.fin_lancamentos where pedido_id = new.id and cancelado_em is null)
    into v_tem_lancamento;
  -- Pedido confirmado antes do financeiro: só ganha parcelas se mudar o total ou os prazos.
  if v_ativo and v_era_ativo and not v_tem_lancamento and not v_mudou then
    return null;
  end if;
  if exists (select 1 from public.fin_lancamentos where pedido_id = new.id and cancelado_em is null and valor_pago > 0) then
    raise exception 'o pedido já tem pagamento registrado no financeiro: desfaça o pagamento lá antes de %',
      case when not v_ativo then 'cancelar ou voltar o pedido para rascunho' else 'mudar o total ou as parcelas' end;
  end if;
  update public.fin_lancamentos
     set cancelado_em = now(), cancelado_por = auth.uid(), atualizado_em = now(),
         motivo_cancelamento = case when new.status = 'cancelado' then 'pedido cancelado'
                                    when new.status = 'rascunho' then 'pedido voltou para rascunho'
                                    else 'pedido mudou: parcelas refeitas' end
   where pedido_id = new.id and cancelado_em is null;
  if v_ativo then
    perform public.fin_gerar_parcelas_pedido(new.id);
  end if;
  return null;
end $$;
revoke execute on function public.fin_pedido_gatilho() from public, anon, authenticated;
create trigger fin_pedido after update on public.pedidos
for each row execute function public.fin_pedido_gatilho();

-- Parcelas do pedido para a tela do pedido: quem vê o pedido vê as parcelas dele, sem a permissão Financeiro.
create function public.pedido_parcelas(p_pedido uuid)
returns table (parcela smallint, parcelas smallint, vencimento date, valor numeric, valor_pago numeric, situacao text)
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.pedidos;
begin
  select * into p from public.pedidos where id = p_pedido;
  if p.id is null or not public.pode_ver_pedido(p.org_id, p.contato_id, p.responsavel_id) then
    raise exception 'pedido não encontrado';
  end if;
  return query
  select s.parcela, s.parcelas, s.vencimento, s.valor, s.valor_pago, s.situacao
    from public.fin_lancamentos_situacao s
   where s.pedido_id = p_pedido and s.cancelado_em is null
   order by s.parcela;
end $$;
revoke execute on function public.pedido_parcelas(uuid) from public, anon;
grant execute on function public.pedido_parcelas(uuid) to authenticated;

-- ============================================================================
-- Nota de entrada: duplicatas do XML viram o a pagar
-- ============================================================================
alter table public.notas_entrada add column duplicatas jsonb;
comment on column public.notas_entrada.duplicatas is 'parcelas da nota (cobr > dup do XML): [{"numero", "vencimento", "valor"}]';

-- Só as parcelas com vencimento e valor válidos (o XML pode vir torto); nada válido = null.
create function public.fin_duplicatas_validas(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  d jsonb;
  v_venc date;
  v_valor numeric(14, 2);
  v_saida jsonb := '[]';
begin
  if jsonb_typeof(p) is distinct from 'array' then
    return null;
  end if;
  for d in select value from jsonb_array_elements(p) loop
    begin
      v_venc := (d ->> 'vencimento')::date;
      v_valor := round((d ->> 'valor')::numeric, 2);
    exception when others then
      continue;
    end;
    if v_venc is not null and v_valor > 0 then
      v_saida := v_saida || jsonb_build_object('numero', left(d ->> 'numero', 20), 'vencimento', v_venc, 'valor', v_valor);
    end if;
  end loop;
  return nullif(v_saida, '[]');
end $$;
revoke execute on function public.fin_duplicatas_validas(jsonb) from public, anon, authenticated;

create function public.fin_nota_entrada_gatilho() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_grupo uuid := gen_random_uuid();
  v_desc text := left(concat_ws(' · ', 'NF ' || coalesce(new.numero, 's/n'), new.emitente_nome), 200);
  v_n int := coalesce(jsonb_array_length(new.duplicatas), 0);
begin
  if v_n = 0 and coalesce(new.valor_total, 0) <= 0 then
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
create trigger fin_nota_entrada after insert on public.notas_entrada
for each row execute function public.fin_nota_entrada_gatilho();

-- nota_entrada_lancar igual à de 20261021130000, gravando também as duplicatas que vêm em p_nota.
create or replace function public.nota_entrada_lancar(p_org uuid, p_nota jsonb, p_itens jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nota uuid;
  v_item jsonb;
  v_prod uuid;
  v_controla boolean;
  v_qtd numeric;
  v_fator numeric;
  v_unit numeric;
  v_cnpj text := nullif(regexp_replace(coalesce(p_nota ->> 'emitente_cnpj', ''), '\D', '', 'g'), '');
  v_chave text := nullif(regexp_replace(coalesce(p_nota ->> 'chave', ''), '\D', '', 'g'), '');
  v_numero text := nullif(btrim(coalesce(p_nota ->> 'numero', '')), '');
  v_serie text := nullif(btrim(coalesce(p_nota ->> 'serie', '')), '');
  v_motivo text;
  v_quando timestamptz;
  v_criados integer := 0;
  v_itens integer := 0;
  v_unidades numeric := 0;
begin
  if not public.tem_papel(p_org, '{dono,admin}') or not public.modulo_ativo(p_org, 'erp') then
    raise exception 'sem acesso';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 or jsonb_array_length(p_itens) > 2000 then
    raise exception 'a nota não tem itens para lançar';
  end if;
  if v_chave is not null and length(v_chave) <> 44 then v_chave := null; end if;
  if v_cnpj is not null and length(v_cnpj) not in (11, 14) then v_cnpj := null; end if;

  -- Nota repetida: pela chave; sem chave (foto ilegível), pelo fornecedor + número + série.
  select criado_em into v_quando from public.notas_entrada
   where org_id = p_org
     and ((v_chave is not null and chave = v_chave)
          or (v_chave is null and v_cnpj is not null and v_numero is not null and chave is null
              and emitente_cnpj = v_cnpj and numero = v_numero and coalesce(serie, '') = coalesce(v_serie, '')));
  if v_quando is not null then
    raise exception 'esta nota já foi lançada em %', to_char(v_quando at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
  end if;

  insert into public.notas_entrada (org_id, chave, numero, serie, emissao, emitente_cnpj, emitente_nome, valor_total,
                                    origem, arquivo_path, autor_id, duplicatas)
  values (p_org, v_chave, left(v_numero, 20), left(v_serie, 5), nullif(p_nota ->> 'emissao', '')::date, v_cnpj,
          left(nullif(btrim(p_nota ->> 'emitente_nome'), ''), 200), nullif(p_nota ->> 'valor_total', '')::numeric,
          coalesce(nullif(p_nota ->> 'origem', ''), 'xml'),
          case when (p_nota ->> 'arquivo_path') like p_org::text || '/%' then left(p_nota ->> 'arquivo_path', 300) end,
          auth.uid(), public.fin_duplicatas_validas(p_nota -> 'duplicatas'))
  returning id into v_nota;

  v_motivo := left(concat_ws(' · ', 'NF ' || coalesce(v_numero, 's/n'), nullif(btrim(p_nota ->> 'emitente_nome'), '')), 300);

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item ->> 'quantidade')::numeric;
    v_fator := coalesce(nullif(v_item ->> 'fator', '')::numeric, 1);
    v_unit := nullif(v_item ->> 'valor_unitario', '')::numeric;
    if v_qtd is null or v_qtd <= 0 or v_fator <= 0 then
      raise exception 'quantidade inválida em "%"', left(v_item ->> 'descricao', 80);
    end if;

    v_prod := nullif(v_item ->> 'produto_id', '')::uuid;
    if v_prod is not null then
      select controla_estoque into v_controla from public.produtos where id = v_prod and org_id = p_org;
      if not found then raise exception 'produto não encontrado'; end if;
      if not v_controla then
        update public.produtos set controla_estoque = true where id = v_prod;
      end if;
    elsif jsonb_typeof(v_item -> 'novo') = 'object' then
      insert into public.produtos (org_id, nome, codigo, unidade, ncm, preco, controla_estoque)
      values (p_org,
              left(btrim(v_item -> 'novo' ->> 'nome'), 200),
              nullif(btrim(v_item -> 'novo' ->> 'codigo'), ''),
              coalesce(nullif(lower(btrim(v_item -> 'novo' ->> 'unidade')), ''), 'un'),
              case when (v_item -> 'novo' ->> 'ncm') ~ '^\d{8}$' then v_item -> 'novo' ->> 'ncm' end,
              0, true)
      returning id into v_prod;
      v_criados := v_criados + 1;
    else
      raise exception 'item sem produto: "%"', left(v_item ->> 'descricao', 80);
    end if;

    insert into public.estoque_movimentos (org_id, produto_id, quantidade, tipo, motivo, autor_id, nota_entrada_id)
    values (p_org, v_prod, v_qtd * v_fator, 'entrada', v_motivo, auth.uid(), v_nota);

    insert into public.notas_entrada_itens (nota_id, org_id, produto_id, codigo_fornecedor, descricao, unidade,
                                            quantidade, fator, valor_unitario, valor_total, ncm)
    values (v_nota, p_org, v_prod, left(nullif(btrim(v_item ->> 'codigo_fornecedor'), ''), 60),
            left(coalesce(nullif(btrim(v_item ->> 'descricao'), ''), '(sem descrição)'), 300),
            left(nullif(btrim(v_item ->> 'unidade'), ''), 10), v_qtd, v_fator, v_unit,
            nullif(v_item ->> 'valor_total', '')::numeric, left(v_item ->> 'ncm', 8));

    if v_cnpj is not null and nullif(btrim(v_item ->> 'codigo_fornecedor'), '') is not null then
      insert into public.produtos_fornecedores (org_id, fornecedor_cnpj, codigo_fornecedor, produto_id, fator,
                                                unidade_fornecedor, descricao_fornecedor)
      values (p_org, v_cnpj, left(btrim(v_item ->> 'codigo_fornecedor'), 60), v_prod, v_fator,
              left(nullif(btrim(v_item ->> 'unidade'), ''), 10), left(v_item ->> 'descricao', 300))
      on conflict (org_id, fornecedor_cnpj, lower(codigo_fornecedor)) do update
        set produto_id = excluded.produto_id, fator = excluded.fator, unidade_fornecedor = excluded.unidade_fornecedor,
            descricao_fornecedor = excluded.descricao_fornecedor, atualizado_em = now();
    end if;

    if v_unit is not null and v_unit >= 0 then
      insert into public.produtos_custos (produto_id, org_id, custo, nota_id)
      values (v_prod, p_org, round(v_unit / v_fator, 4), v_nota)
      on conflict (produto_id) do update set custo = excluded.custo, nota_id = excluded.nota_id, atualizado_em = now();
    end if;

    v_itens := v_itens + 1;
    v_unidades := v_unidades + v_qtd * v_fator;
  end loop;

  return jsonb_build_object('nota_id', v_nota, 'itens', v_itens, 'criados', v_criados, 'unidades', v_unidades);
end $$;

-- ============================================================================
-- Itens de OS já faturados (só a Cactos em 28/10)
-- ============================================================================
select public.fin_sincronizar_os_item(i.id)
  from public.os_itens i
 where i.faturado_em is not null and i.cobranca = 'cobrado' and coalesce(i.valor, 0) > 0;
