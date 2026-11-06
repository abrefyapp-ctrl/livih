-- Alerta de estoque mínimo (docs/levantamento-funcionalidades.md, ERP item 4; pedido de 06/11).
--
-- Hoje o estoque mínimo era só um filtro na tela Produtos: ninguém era avisado de olhar, e o produto acabava antes da
-- compra. Agora quem a empresa marcar em Configurações → Equipe ("Alerta de estoque") recebe, no celular (push) e no
-- WhatsApp cadastrado no perfil, como os lembretes de tarefa:
--   - na hora: quando uma saída faz o saldo de um produto passar para baixo do mínimo (a mesma regra da tela: saldo
--     menor que o mínimo). Só na passagem: o produto que continua abaixo não avisa de novo até ser reposto;
--   - de manhã (8 h, de segunda a sábado): um resumo com os produtos abaixo do mínimo, se houver algum.
-- Só produtos que controlam estoque e têm mínimo definido; só empresas ativas com o ERP ligado. Ninguém marcado =
-- ninguém avisado (sem padrão: o dono escolhe quem cuida das compras).

alter table public.membros_org add column recebe_alerta_estoque boolean not null default false;
comment on column public.membros_org.recebe_alerta_estoque is
  'Recebe o alerta de produto abaixo do estoque mínimo (na hora e o resumo da manhã)';

create function public.membro_definir_alerta_estoque(p_org uuid, p_usuario uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes boolean;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin mudam esta permissão';
  end if;
  select recebe_alerta_estoque into v_antes from public.membros_org where org_id = p_org and user_id = p_usuario;
  if v_antes is null then
    raise exception 'membro não encontrado';
  end if;
  update public.membros_org set recebe_alerta_estoque = coalesce(p_valor, false) where org_id = p_org and user_id = p_usuario;
  if v_antes is distinct from coalesce(p_valor, false) then
    perform public.auditar(p_org, 'recebe_alerta_estoque', 'membros_org', p_usuario::text,
                           jsonb_build_object('recebe_alerta_estoque', v_antes),
                           jsonb_build_object('recebe_alerta_estoque', coalesce(p_valor, false)));
  end if;
end $$;
revoke execute on function public.membro_definir_alerta_estoque(uuid, uuid, boolean) from public, anon;
grant execute on function public.membro_definir_alerta_estoque(uuid, uuid, boolean) to authenticated;

-- Quantidade sem zeros sobrando e com vírgula: 12.500 → "12,5".
create function public.estoque_qtd(p numeric) returns text
language sql immutable set search_path = '' as $$
  select replace(trim_scale(p)::text, '.', ',');
$$;

-- Manda o alerta para quem recebe, pelo push e pelo WhatsApp do perfil (canal escolhido como nos lembretes de tarefa).
create function public.estoque_avisar_equipe(p_org uuid, p_titulo text, p_corpo text, p_whatsapp text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  m record;
  v_canal uuid;
  v_n integer := 0;
begin
  for m in
    select mo.user_id, p.telefone from public.membros_org mo left join public.perfis p on p.user_id = mo.user_id
     where mo.org_id = p_org and mo.ativo and mo.recebe_alerta_estoque
  loop
    if exists (select 1 from public.push_inscricoes i where i.user_id = m.user_id) then
      insert into public.push_fila (user_id, titulo, corpo, url)
      values (m.user_id, left(p_titulo, 80), left(p_corpo, 180), '/produtos?abaixo=1');
    end if;
    if m.telefone is not null then
      select cn.id into v_canal from public.canais cn
       where cn.org_id = p_org and cn.ativo
       order by (cn.responsavel_id is distinct from m.user_id) desc, (cn.status_conexao = 'WORKING') desc,
                (cn.tipo = 'waha') desc, cn.criado_em
       limit 1;
      if v_canal is not null then
        insert into public.alertas (org_id, canal_id, telefone, texto) values (p_org, v_canal, m.telefone, p_whatsapp);
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Na hora: a saída que leva o saldo para baixo do mínimo.
create function public.estoque_alerta_minimo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.produtos;
  v_depois numeric;
  v_antes numeric;
begin
  if new.quantidade >= 0 then
    return null;
  end if;
  select * into v_p from public.produtos where id = new.produto_id;
  if v_p.estoque_minimo is null or not v_p.controla_estoque or not v_p.ativo then
    return null;
  end if;
  select coalesce(sum(quantidade), 0) into v_depois from public.estoque_movimentos where produto_id = new.produto_id;
  v_antes := v_depois - new.quantidade;
  if not (v_antes >= v_p.estoque_minimo and v_depois < v_p.estoque_minimo) then
    return null;
  end if;
  if not public.modulo_ativo(v_p.org_id, 'erp')
     or (select status from public.organizacoes where id = v_p.org_id) <> 'ativa' then
    return null;
  end if;
  perform public.estoque_avisar_equipe(
    v_p.org_id,
    'Estoque baixo: ' || v_p.nome,
    format('Saldo %s %s, mínimo %s. Hora de repor.', public.estoque_qtd(v_depois), v_p.unidade, public.estoque_qtd(v_p.estoque_minimo)),
    '📦 *Estoque abaixo do mínimo*' || E'\n' || v_p.nome || coalesce(' (' || v_p.codigo || ')', '')
      || E'\n' || format('Saldo: %s %s · mínimo: %s', public.estoque_qtd(v_depois), v_p.unidade, public.estoque_qtd(v_p.estoque_minimo))
      || E'\n\n_Livih · Produtos_');
  return null;
exception when others then
  -- O alerta nunca pode impedir a baixa do estoque (confirmação de pedido, ajuste).
  return null;
end $$;
create trigger estoque_alerta_minimo after insert on public.estoque_movimentos
for each row execute function public.estoque_alerta_minimo();

-- De manhã: o resumo do que está abaixo do mínimo, por empresa.
create function public.estoque_resumo_diario() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  o record;
  v_linhas text;
  v_total integer;
  v_n integer := 0;
begin
  for o in
    select og.id from public.organizacoes og
     where og.status = 'ativa' and public.modulo_ativo(og.id, 'erp')
       and exists (select 1 from public.membros_org mo where mo.org_id = og.id and mo.ativo and mo.recebe_alerta_estoque)
  loop
    select count(*),
           string_agg(format('• %s%s: %s %s (mínimo %s)', s.nome, coalesce(' (' || s.codigo || ')', ''),
                             public.estoque_qtd(s.saldo), s.unidade, public.estoque_qtd(s.estoque_minimo)), E'\n'
                      order by s.saldo - s.estoque_minimo, s.nome) filter (where s.ordem <= 15)
      into v_total, v_linhas
      from (select ps.*, row_number() over (order by ps.saldo - ps.estoque_minimo, ps.nome) as ordem
              from public.produtos_saldo ps
             where ps.org_id = o.id and ps.ativo and ps.controla_estoque and ps.estoque_minimo is not null
               and ps.saldo < ps.estoque_minimo) s;
    if v_total = 0 then
      continue;
    end if;
    perform public.estoque_avisar_equipe(
      o.id,
      format('%s %s abaixo do estoque mínimo', v_total, case when v_total = 1 then 'produto' else 'produtos' end),
      'Toque para ver a lista e programar a compra.',
      '📦 *Estoque abaixo do mínimo*' || E'\n' || v_linhas
        || case when v_total > 15 then E'\n' || format('e mais %s. Veja todos em Produtos → Só abaixo do mínimo.', v_total - 15) else '' end
        || E'\n\n_Livih · resumo da manhã_');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke execute on function public.estoque_qtd(numeric), public.estoque_avisar_equipe(uuid, text, text, text),
  public.estoque_alerta_minimo(), public.estoque_resumo_diario() from public, anon, authenticated;

-- 11 h UTC = 8 h em Brasília, de segunda a sábado.
select cron.schedule('livih-estoque-resumo', '0 11 * * 1-6', 'select public.estoque_resumo_diario()');
