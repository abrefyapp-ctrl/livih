-- Alerta do agente no WhatsApp de quem vai atender (pedido do usuário em 16/11, implantação da CEFEQ).
--
-- Quando o agente passa a conversa para a equipe (lead quente, pedido de orçamento, reclamação…), o alerta por
-- WhatsApp ia para UM número da empresa (agentes.telefone_alerta). Na CEFEQ, com 27 números e 25 vendedores, uma
-- pessoa receberia os alertas de todos. E o aviso no celular (push) do número de um vendedor ia também para todos os
-- donos e admins: o Diego receberia o dos 25.
--
-- Agora:
--   - Quem atende: o dono do número (número de vendedor) ou o vendedor do contato (número da empresa que distribui),
--     se ativo e não ausente. Sem ele, o(s) gestor(es) da equipe: a do vendedor, ou a equipe que recebe o número.
--     Número da empresa sem distribuição: ninguém em especial (toda a equipe vê, como antes).
--   - WhatsApp: vai para o telefone de "Seus dados" (perfis.telefone) de quem atende, por um número da empresa que não
--     é o dele (a regra dos lembretes de tarefa e do alerta de estoque), com o link da conversa. O telefone de alerta
--     da empresa vira cópia de tudo (opcional).
--   - Aviso no celular: quem atende e o gestor da equipe; sem ninguém em especial, todos que veem o número (como antes).
--     Dono e admin deixam de receber o de cada número de vendedor. Em 16/11 nenhuma empresa tinha número de vendedor.
--   - O convite em lote grava o telefone da planilha no perfil de quem acabou de ser convidado (membro_definir_telefone),
--     para o alerta funcionar no primeiro dia; não sobrescreve o que a pessoa já preencheu.
-- Revisão do revisor-banco (16/11) aplicada: telefone só para quem é só desta empresa e nunca entrou; alerta só por
-- número da empresa e nunca para um telefone que é número ligado à Livih; motivo nulo não desfaz a passagem.

-- ============================================================================
-- Quem atende a conversa
-- ============================================================================
-- O vendedor da conversa, se ativo e não ausente; nulo se não houver.
create function public.vendedor_da_conversa(p_conversa uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select v.vendedor from (
    select case when cn.responsavel_id is not null then cn.responsavel_id
                when cn.distribuir then ct.responsavel_id end as vendedor, c.org_id
      from public.conversas c
      join public.canais cn on cn.id = c.canal_id
      join public.contatos ct on ct.id = c.contato_id
     where c.id = p_conversa
  ) v
   where public.membro_presente(v.org_id, v.vendedor);
$$;

-- Gestores ativos e não ausentes da equipe da conversa: a do vendedor dono do número ou, no número da empresa que
-- distribui, a equipe que recebe o número (sem ela, a do vendedor do contato).
create function public.gestores_da_conversa(p_conversa uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.user_id order by m.criado_em), '{}')
    from public.conversas c
    join public.canais cn on cn.id = c.canal_id
    join public.contatos ct on ct.id = c.contato_id
    join public.membros_org m on m.org_id = c.org_id and m.gestor and m.ativo
   where c.id = p_conversa
     and (cn.responsavel_id is not null or cn.distribuir)
     and m.equipe_id = coalesce(
           (select mv.equipe_id from public.membros_org mv where mv.org_id = c.org_id and mv.user_id = cn.responsavel_id),
           cn.equipe_id,
           (select mv.equipe_id from public.membros_org mv where mv.org_id = c.org_id and mv.user_id = ct.responsavel_id))
     and not public.membro_ausente(c.org_id, m.user_id);
$$;

-- Quem recebe o alerta: o vendedor; sem ele, os gestores da equipe; vazio = ninguém em especial.
create function public.quem_atende_conversa(p_conversa uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce((select array[v] from public.vendedor_da_conversa(p_conversa) v where v is not null),
                  public.gestores_da_conversa(p_conversa));
$$;

-- Número da empresa para mandar um aviso à pessoa: só número da empresa (nunca o de um vendedor: o alerta tem os dados
-- do cliente, e o celular de outro vendedor não deve guardá-los; revisão de 16/11), de preferência conectado e pelo WAHA
-- (o oficial só manda texto livre dentro das 24 horas). Sem número da empresa, não há aviso por WhatsApp (o do celular
-- continua).
create function public.canal_para_avisar(p_org uuid, p_usuario uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select cn.id from public.canais cn
   where cn.org_id = p_org and cn.ativo and cn.responsavel_id is null
   order by (cn.status_conexao = 'WORKING') desc, (cn.tipo = 'waha') desc, cn.criado_em
   limit 1;
$$;

-- ============================================================================
-- Agente chama a equipe: alerta para quem atende + cópia para o número da empresa
-- ============================================================================
-- Igual a 20261007140000 até mudar o estado; os alertas são novos.
create or replace function public.agente_chamar_humano(p_conversa uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_agente public.agentes;
  v_contato public.contatos;
  v_vendedor uuid;
  v_destino uuid[];
  v_pessoa uuid;
  v_tel text;
  v_canal uuid;
  v_ja text[] := '{}';
  v_cliente text;
  v_link text;
  v_equipe text;
  v_avisados integer := 0;
begin
  perform public.agente_marcar();
  select * into v_conv from public.conversas where id = p_conversa for update;
  if v_conv.estado <> 'bot' then
    return jsonb_build_object('sucesso', true, 'aviso', 'a conversa já está com a equipe');
  end if;
  update public.conversas set estado = 'aguardando_humano', motivo_humano = left(p_motivo, 300) where id = p_conversa;

  select * into v_agente from public.agentes where canal_id = v_conv.canal_id;
  select * into v_contato from public.contatos where id = v_conv.contato_id;
  v_cliente := coalesce(v_contato.nome, v_contato.nome_whatsapp, 'sem nome') || coalesce(' (' || v_contato.telefone || ')', '');
  -- O app tem um endereço só; o link abre a conversa (quem não tem acesso a ela vê a lista).
  v_link := 'https://app.livih.com.br/conversas/' || p_conversa;
  -- Motivo nulo deixaria o texto nulo, o alerta falharia e a passagem para a equipe voltaria junto.
  p_motivo := coalesce(nullif(btrim(p_motivo), ''), 'não informado');

  v_vendedor := public.vendedor_da_conversa(p_conversa);
  v_destino := public.quem_atende_conversa(p_conversa);
  if v_vendedor is null and cardinality(v_destino) > 0 then
    select e.nome into v_equipe from public.membros_org m join public.equipes e on e.id = m.equipe_id
     where m.org_id = v_conv.org_id and m.user_id = v_destino[1];
  end if;

  foreach v_pessoa in array v_destino loop
    select p.telefone into v_tel from public.perfis p where p.user_id = v_pessoa;
    continue when v_tel is null or v_tel = any(v_ja);
    -- Telefone que é um número ligado à Livih (o vendedor que pôs o próprio número comercial em "Seus dados"): o
    -- alerta entraria como conversa nova e um agente poderia responder ao outro. Ele já vê a conversa no número.
    continue when exists (select 1 from public.canais cn where cn.telefone = v_tel and cn.ativo);
    v_canal := public.canal_para_avisar(v_conv.org_id, v_pessoa);
    continue when v_canal is null;
    insert into public.alertas (org_id, canal_id, telefone, texto, conversa_id)
    values (v_conv.org_id, v_canal, v_tel,
            case when v_vendedor is not null then '🔔 *Livih — cliente aguardando você*'
                 else '🔔 *Livih — cliente sem vendedor disponível*' || coalesce(E'\n' || 'Equipe: ' || v_equipe, '') end
            || E'\n\n' || 'Contato: ' || v_cliente || E'\n' || 'Motivo: ' || p_motivo || E'\n\n'
            || case when v_vendedor is null then 'Abra e passe para alguém da equipe:' || E'\n' else '' end || v_link,
            p_conversa);
    v_ja := v_ja || v_tel;
    v_avisados := v_avisados + 1;
  end loop;

  -- Cópia para o número da empresa (opcional), pelo número da própria conversa, como antes.
  if v_agente.telefone_alerta is not null and not v_agente.telefone_alerta = any(v_ja) then
    insert into public.alertas (org_id, canal_id, telefone, texto, conversa_id)
    values (v_conv.org_id, v_conv.canal_id, v_agente.telefone_alerta,
            '🔔 *Livih — cliente aguardando a equipe*' || E'\n\n' ||
            'Contato: ' || v_cliente || E'\n' ||
            coalesce('Vendedor: ' || (select coalesce(nullif(btrim(p.nome), ''), split_part(u.email::text, '@', 1))
                                   from auth.users u left join public.perfis p on p.user_id = u.id
                                  where u.id = v_vendedor) || E'\n', '') ||
            'Motivo: ' || p_motivo || E'\n\n' || v_link,
            p_conversa);
    v_avisados := v_avisados + 1;
  end if;
  return jsonb_build_object('sucesso', true, 'equipe_avisada', v_avisados > 0);
end $$;

-- ============================================================================
-- Aviso no celular
-- ============================================================================
-- Quem atende; sem ninguém em especial, todos que veem o número (push_equipe_do_canal, como antes).
create or replace function public.push_destino_conversa(p_conversa uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(public.quem_atende_conversa(p_conversa), '{}'),
                  public.push_equipe_do_canal((select canal_id from public.conversas where id = p_conversa)));
$$;

-- Igual a 20261105160000, com o gestor da equipe junto na passagem (só nela: as mensagens seguintes vão para quem
-- atende, para o gestor não receber cada mensagem do cliente).
create or replace function public.push_conversa_aguardando() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ultima text;
begin
  if new.estado = 'aguardando_humano' and (tg_op = 'INSERT' or old.estado <> 'aguardando_humano') then
    select coalesce(m.transcricao, m.texto, '[' || m.tipo::text || ']') into v_ultima
      from public.mensagens m where m.conversa_id = new.id and m.direcao = 'entrada'
     order by m.criado_em desc limit 1;
    perform public.push_enfileirar(
      array(select distinct u from unnest(public.push_destino_conversa(new.id) || public.gestores_da_conversa(new.id)) u),
      new.id,
      public.push_nome_contato(new.contato_id) || ' aguarda atendimento',
      coalesce(nullif(v_ultima, ''), new.motivo_humano, 'Nova conversa para a equipe')
    );
  end if;
  return null;
end $$;

-- ============================================================================
-- Telefone da planilha no perfil (convite em lote)
-- ============================================================================
-- Dono e admin gravam o telefone de quem acabou de ser convidado: ativo na empresa, sem telefone, que nunca entrou na
-- Livih e não é de outra empresa nem da plataforma. O perfil é de todas as empresas da pessoa, e o convite põe na
-- empresa qualquer conta que já existe, só pelo e-mail: sem essas travas, uma empresa poderia apontar para o próprio
-- WhatsApp os alertas e lembretes que outra manda à pessoa (revisão de 16/11). Fora disso, a pessoa preenche em "Seus
-- dados". Devolve se gravou.
create function public.membro_definir_telefone(p_org uuid, p_usuario uuid, p_telefone text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'Só o dono e o admin cadastram o telefone da equipe.';
  end if;
  if p_telefone is null or p_telefone !~ '^\d{12,15}$' then
    raise exception 'Telefone inválido. Use DDD e número.';
  end if;
  if not exists (select 1 from public.membros_org where org_id = p_org and user_id = p_usuario and ativo) then
    raise exception 'Esta pessoa não faz parte da empresa.';
  end if;
  if exists (select 1 from public.membros_org where user_id = p_usuario and org_id <> p_org)
     or exists (select 1 from public.admins_plataforma where user_id = p_usuario)
     or exists (select 1 from auth.users where id = p_usuario and last_sign_in_at is not null) then
    return false;
  end if;
  update public.perfis set telefone = p_telefone where user_id = p_usuario and telefone is null;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    perform public.auditar(p_org, 'membro_telefone', 'perfis', p_usuario::text, null, jsonb_build_object('telefone', p_telefone));
  end if;
  return v_n > 0;
end $$;

-- ============================================================================
-- Permissões
-- ============================================================================
revoke execute on function public.vendedor_da_conversa(uuid), public.gestores_da_conversa(uuid),
  public.quem_atende_conversa(uuid), public.canal_para_avisar(uuid, uuid)
from public, anon, authenticated;

revoke execute on function public.membro_definir_telefone(uuid, uuid, text) from public, anon;
grant execute on function public.membro_definir_telefone(uuid, uuid, text) to authenticated;
