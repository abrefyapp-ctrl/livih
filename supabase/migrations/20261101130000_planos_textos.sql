-- Textos da franquia de atendimentos (revisão de textos de 01/11 sobre a 20261101120000, já aplicada).
--
-- O que muda é só o que a pessoa lê: "mensalidade" no lugar de "fatura" (a tela usa mensalidade), "sua empresa" no
-- lugar de "vocês", números com ponto de milhar, nada de "franquia" (termo interno) e, no "parar", deixar claro que
-- só as conversas novas vão para a equipe e que a conversa já passada fica com ela. A regra não muda.

-- 1000 → '1.000' (to_char com vírgula fixa, sem depender da localidade do banco).
create function public.numero_br(p numeric) returns text
language sql immutable set search_path = '' as $$
  select replace(to_char(p, 'FM999,999,999'), ',', '.');
$$;
revoke execute on function public.numero_br(numeric) from public, anon, authenticated;

create or replace function public.avisar_franquia(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f record;
  v_nivel integer;
  v_org text;
  v_titulo text;
  v_corpo text;
  v_canal uuid;
  m record;
begin
  select * into f from public.franquia_do_mes(p_org);
  if f.limite is null or f.limite = 0 then
    return;
  end if;
  v_nivel := case when f.usados >= f.limite then 100 when f.usados * 100 >= f.limite * 80 then 80 end;
  if v_nivel is null then
    return;
  end if;
  insert into public.avisos_franquia (org_id, mes, nivel, limite) values (p_org, public.mes_brasilia(), v_nivel, f.limite)
  on conflict do nothing;
  if not found then
    return;
  end if;
  -- Chegou direto a 100 % (ex.: pacote que acabou): o de 80 % desse limite não sai mais depois.
  if v_nivel = 100 then
    insert into public.avisos_franquia (org_id, mes, nivel, limite) values (p_org, public.mes_brasilia(), 80, f.limite)
    on conflict do nothing;
  end if;

  select nome into v_org from public.organizacoes where id = p_org;
  if v_nivel = 80 then
    v_titulo := 'Atendimentos do agente: 80 % usados';
    v_corpo := 'Sua empresa usou ' || public.numero_br(f.usados) || ' de ' || public.numero_br(f.limite)
      || ' atendimentos do agente este mês. '
      || case f.escolha when 'parar' then 'Quando acabarem, as conversas novas vão para a equipe.'
                        else 'Quando acabarem, o agente continua, e cada atendimento a mais entra na próxima mensalidade.' end;
  else
    v_titulo := case f.escolha when 'parar' then 'Os atendimentos do agente acabaram'
                               else 'Atendimentos do agente: o limite do mês acabou' end;
    v_corpo := 'Sua empresa usou os ' || public.numero_br(f.limite) || ' atendimentos do agente deste mês. '
      || case f.escolha when 'parar' then 'As conversas novas vão para a equipe até o dia 1º ou até o dono comprar um pacote.'
                        else 'O agente continua, e cada atendimento a mais entra na próxima mensalidade.' end;
  end if;

  -- Dono e administradores: celular (quem ativou) e WhatsApp (quem cadastrou o número), por um número da empresa.
  for m in
    select mo.user_id, pf.telefone
      from public.membros_org mo
      left join public.perfis pf on pf.user_id = mo.user_id
     where mo.org_id = p_org and mo.ativo and mo.papel in ('dono', 'admin')
  loop
    if exists (select 1 from public.push_inscricoes i where i.user_id = m.user_id) then
      insert into public.push_fila (user_id, titulo, corpo, url)
      values (m.user_id, v_titulo, left(v_corpo, 180), '/configuracoes/uso');
    end if;
    if m.telefone is not null then
      select cn.id into v_canal from public.canais cn
       where cn.org_id = p_org and cn.ativo
       order by (cn.responsavel_id is distinct from m.user_id) desc, (cn.status_conexao = 'WORKING') desc,
                (cn.tipo = 'waha') desc, cn.criado_em
       limit 1;
      if v_canal is not null then
        insert into public.alertas (org_id, canal_id, telefone, texto)
        values (p_org, v_canal, m.telefone,
                '⚠️ *' || v_titulo || '*' || E'\n' || v_corpo || E'\n\n'
                || 'Veja o consumo e as opções em Configurações → Plano e consumo.' || E'\n\n_Livih · Plano_');
      end if;
    end if;
  end loop;

  -- Equipe da plataforma: só no celular, com o nome da empresa.
  insert into public.push_fila (user_id, titulo, corpo, url)
  select ap.user_id, left(v_org || ': ' || lower(v_titulo), 80),
         left(public.numero_br(f.usados) || ' de ' || public.numero_br(f.limite) || ' atendimentos · escolha: '
              || f.escolha, 180), '/empresas'
    from public.admins_plataforma ap
   where exists (select 1 from public.push_inscricoes i where i.user_id = ap.user_id);
end $$;

-- Última versão em 20261101120000_planos_franquia.sql; muda só o motivo gravado na conversa.
create or replace function public.agente_deve_responder(p_conversa uuid, p_mensagem uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_motivo text;
begin
  if not exists (
    select 1 from public.conversas c
      join public.agentes a on a.canal_id = c.canal_id and a.ativo
      join public.organizacoes o on o.id = c.org_id and o.status = 'ativa'
      join public.contatos ct on ct.id = c.contato_id and not ct.sem_agente
     where c.id = p_conversa and c.estado = 'bot'
  ) then
    return false;
  end if;
  if p_mensagem is distinct from (
    select id from public.mensagens
     where conversa_id = p_conversa and direcao = 'entrada'
     order by criado_em desc limit 1
  ) then
    return false;
  end if;

  if public.agente_franquia_esgotada(p_conversa) then
    perform public.agente_chamar_humano(
      p_conversa,
      'Os atendimentos do agente deste mês acabaram, e esta conversa passou para a equipe e fica com ela. '
      || 'O agente volta a atender só as conversas novas, no dia 1º ou quando o dono comprar um pacote.'
    );
    -- O limite pode ter acabado sem atendimento novo (troca de plano no meio do mês): o aviso de 100 % sai aqui.
    begin
      perform public.avisar_franquia((select org_id from public.conversas where id = p_conversa));
    exception when others then
      raise warning 'livih: aviso de franquia falhou: %', sqlerrm;
    end;
    return false;
  end if;

  v_motivo := public.agente_suspeita_robo(p_conversa);
  if v_motivo is not null then
    perform public.agente_chamar_humano(
      p_conversa,
      'Possível atendimento automático do outro lado (' || v_motivo || '). O agente parou para não conversar com outro robô.'
    );
    return false;
  end if;
  return true;
end $$;

-- Última versão em 20261101120000_planos_franquia.sql; muda só a mensagem de quem não tem plano com limite.
create or replace function public.plano_comprar_pacote(p_org uuid, p_limite_atual integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  p public.planos;
begin
  if not exists (select 1 from public.membros_org
                  where org_id = p_org and user_id = auth.uid() and ativo and papel = 'dono') then
    raise exception 'Só o dono da empresa compra pacotes de atendimentos.';
  end if;
  select pl.* into p from public.organizacoes o join public.planos pl on pl.codigo = o.plano where o.id = p_org for update of o;
  if p.atendimentos is null then
    raise exception 'A sua empresa ainda não tem um plano com limite de atendimentos. Fale com a equipe da Livih.';
  end if;
  if p_limite_atual is distinct from (select limite from public.franquia_do_mes(p_org)) then
    raise exception 'O limite do mês mudou enquanto você comprava. Confira o consumo antes de comprar de novo.';
  end if;
  insert into public.creditos_atendimentos (org_id, mes, tipo, quantidade, valor, criado_por)
  values (p_org, public.mes_brasilia(), 'pacote', p.pacote_atendimentos, p.pacote_preco, auth.uid());
  insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, depois)
  values (p_org, 'atendente', auth.uid(), 'comprar_pacote_atendimentos', 'organizacoes', p_org::text,
          jsonb_build_object('quantidade', p.pacote_atendimentos, 'valor', p.pacote_preco));
  return (select limite from public.franquia_do_mes(p_org));
end $$;
