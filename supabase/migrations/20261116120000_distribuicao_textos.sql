-- Textos da distribuição dos contatos (revisão de textos de 13/11, adiada porque a 20261113120000 já estava aplicada).
-- A CEFEQ começa a configurar a distribuição em 16/11; os avisos e erros que ela vai ler precisam se explicar sozinhos:
--   - o aviso na conversa dizia "(quem mais atendeu…)" e "(equipe do número, Televendas)": agora é uma frase que diz
--     por que a pessoa recebeu ("foi quem mais atendeu este cliente nos últimos 90 dias");
--   - pessoa sem nome aparecia como "a equipe" (parecia que ninguém tinha recebido): agora aparece o e-mail;
--   - erros de ausência, de cidade e de equipe dizem o que fazer.
-- Só texto: a regra de quem recebe não muda.

create or replace function public.distribuir_contato(p_conversa uuid, p_mensagem uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_canal public.canais;
  v_ct public.contatos;
  v_msg public.mensagens;
  v_ciclo_novo boolean := false;
  v_inicio timestamptz;
  v_vendedor uuid;
  v_motivo text;
  v_rodizio boolean := false;
  v_cidade text;
  v_equipe uuid;
  v_nome text;
begin
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    return null;
  end if;
  select * into v_canal from public.canais where id = v_conv.canal_id;
  if not v_canal.distribuir or v_canal.responsavel_id is not null then
    -- O número deixou de distribuir: a espera perde o sentido (o cron não fica voltando nela).
    if v_conv.distribuir_pendente_em is not null then
      update public.conversas set distribuir_pendente_em = null
       where id in (select id from public.conversas where id = p_conversa for update skip locked);
    end if;
    return null;
  end if;

  if p_mensagem is null then
    if v_conv.distribuir_pendente_em is null then
      return null;
    end if;
  else
    select * into v_msg from public.mensagens where id = p_mensagem;
    v_ciclo_novo := not exists (
      select 1 from public.mensagens y join public.conversas c2 on c2.id = y.conversa_id
       where y.org_id = v_conv.org_id and c2.contato_id = v_conv.contato_id and y.id <> v_msg.id
         and y.autor_tipo <> 'sistema' and y.status_entrega <> 'erro'
         and y.criado_em > v_msg.criado_em - interval '30 days' and y.criado_em <= v_msg.criado_em);
    v_inicio := case when v_ciclo_novo then v_msg.criado_em
                     else (select max(oc.em) from public.origem_ciclos oc where oc.contato_id = v_conv.contato_id) end;
  end if;

  -- Duas vezes: sem trava (a maioria das mensagens sai aqui) e de novo depois das travas.
  for i in 1..2 loop
    if i = 2 then
      select * into v_ct from public.contatos where id = v_conv.contato_id for update;
      -- Dois contatos chegando juntos não caem na mesma pessoa.
      perform pg_advisory_xact_lock(hashtextextended('livih-distribuir:' || v_conv.org_id::text, 0));
      select * into v_conv from public.conversas where id = p_conversa;
    else
      select * into v_ct from public.contatos where id = v_conv.contato_id;
    end if;
    if p_mensagem is null then
      if v_conv.distribuir_pendente_em is null then
        return null;
      end if;
    elsif v_conv.distribuir_pendente_em is null
          and v_ct.distribuido_em is not null
          and (v_inicio is null or v_ct.distribuido_em >= v_inicio)
          and (public.membro_disponivel(v_conv.org_id, v_ct.responsavel_id)
               or (v_ct.responsavel_id = v_conv.atribuida_a and public.membro_presente(v_conv.org_id, v_ct.responsavel_id))) then
      return null;
    end if;
  end loop;

  -- 0. No meio do ciclo, quem está atendendo agora.
  if not v_ciclo_novo and public.membro_presente(v_conv.org_id, v_conv.atribuida_a) then
    v_vendedor := v_conv.atribuida_a;
    v_motivo := 'já estava atendendo a conversa';
  end if;

  -- 1. Quem mais atendeu.
  if v_vendedor is null then
    v_vendedor := public.vendedor_que_mais_atendeu(v_conv.org_id, v_ct.id);
    if v_vendedor is not null then
      v_motivo := format('foi quem mais atendeu este cliente nos últimos %s dias',
                         (select o.distribuicao_janela_dias from public.organizacoes o where o.id = v_conv.org_id));
    end if;
  end if;

  -- 2. A equipe da cidade.
  if v_vendedor is null then
    v_cidade := public.cidade_do_contato(v_ct.id);
    if v_cidade is not null then
      select ec.equipe_id into v_equipe from public.equipes_cidades ec
       where ec.org_id = v_conv.org_id and ec.chave = v_cidade;
      if v_equipe is not null then
        v_vendedor := public.vendedor_do_rodizio(v_conv.org_id, v_equipe);
        v_motivo := format('é da equipe %s, que atende a cidade %s',
                           (select e.nome from public.equipes e where e.id = v_equipe),
                           (select ec.cidade from public.equipes_cidades ec where ec.org_id = v_conv.org_id and ec.chave = v_cidade));
        v_rodizio := true;
      end if;
    elsif p_mensagem is not null
          and v_conv.estado = 'bot' and not v_ct.sem_agente
          and exists (select 1 from public.agentes a where a.canal_id = v_canal.id and a.ativo)
          and exists (select 1 from public.equipes_cidades ec where ec.org_id = v_conv.org_id) then
      -- Sem cidade e o agente atendendo: espera ele perguntar (até ~15 minutos, pelo cron).
      update public.conversas set distribuir_pendente_em = coalesce(distribuir_pendente_em, now())
       where id = v_conv.id;
      return null;
    end if;
  end if;

  -- 3. A equipe do número.
  if v_vendedor is null and v_canal.equipe_id is not null then
    v_vendedor := public.vendedor_do_rodizio(v_conv.org_id, v_canal.equipe_id);
    v_motivo := format('é da equipe %s, que recebe os contatos deste número',
                       (select e.nome from public.equipes e where e.id = v_canal.equipe_id));
    v_rodizio := true;
  end if;

  -- 4. Rodízio entre todos.
  if v_vendedor is null then
    v_vendedor := public.vendedor_do_rodizio(v_conv.org_id, null);
    v_motivo := 'era a vez no rodízio entre quem recebe contatos novos';
    v_rodizio := true;
  end if;

  update public.conversas set distribuir_pendente_em = null
   where id in (select c.id from public.conversas c
                 where c.contato_id = v_ct.id and c.distribuir_pendente_em is not null
                   for update skip locked);
  if v_vendedor is null then
    -- Ninguém disponível: fica como está (o aviso de "aguardando" vai para todos que veem o número).
    return null;
  end if;

  update public.contatos set responsavel_id = v_vendedor, distribuido_em = now() where id = v_ct.id;
  if v_rodizio then
    update public.membros_org set ultima_distribuicao_em = now() where org_id = v_conv.org_id and user_id = v_vendedor;
  end if;
  -- Conversa em atendimento com outra pessoa (ausente, que saiu, ou de um ciclo antigo): passa para quem recebeu,
  -- senão as mensagens seguintes continuariam avisando só a pessoa antiga (revisão de 13/11).
  if v_conv.estado = 'humano' and v_conv.atribuida_a is distinct from v_vendedor then
    update public.conversas set atribuida_a = v_vendedor
     where id in (select id from public.conversas where id = v_conv.id for update skip locked);
  end if;
  if v_vendedor is distinct from v_ct.responsavel_id then
    -- Sem nome no perfil, a parte do e-mail antes do @ (antes era "a equipe", que parecia que ninguém tinha recebido).
    -- O e-mail inteiro não: o agente lê os avisos da conversa e poderia repassá-lo ao cliente (revisão de 16/11).
    select coalesce(nullif(btrim(p.nome), ''), split_part(u.email::text, '@', 1)) into v_nome
      from auth.users u left join public.perfis p on p.user_id = u.id
     where u.id = v_vendedor;
    perform public.aviso_sistema(v_conv.id, format('Contato distribuído para %s: %s.', coalesce(v_nome, 'uma pessoa da equipe'), v_motivo));
    perform public.push_enfileirar(array[v_vendedor], v_conv.id, 'Contato para você',
                                   public.push_nome_contato(v_ct.id) || ' foi encaminhado para você.');
  end if;
  return v_vendedor;
end $$;

create or replace function public.membro_definir_ausencia(p_org uuid, p_usuario uuid, p_ausente boolean, p_ate date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes public.membros_org;
begin
  if not public.eh_membro(p_org)
     or not (public.tem_papel(p_org, '{dono,admin}') or public.gestor_ve(p_org, p_usuario)) then
    raise exception 'Só o dono, o admin ou o gestor da equipe desta pessoa marcam a ausência. Peça a um deles.';
  end if;
  if coalesce(p_ausente, false) and p_ate is not null and p_ate < public.hoje_brasilia() then
    raise exception 'O último dia de ausência já passou. Escolha hoje ou um dia depois.';
  end if;
  select * into v_antes from public.membros_org where org_id = p_org and user_id = p_usuario;
  if v_antes.user_id is null then
    raise exception 'Esta pessoa não faz mais parte da empresa. Recarregue a tela.';
  end if;
  update public.membros_org
     set ausente = coalesce(p_ausente, false),
         ausente_ate = case when coalesce(p_ausente, false) then p_ate end
   where org_id = p_org and user_id = p_usuario;
  perform public.auditar(p_org, 'membro_ausencia', 'membros_org', p_usuario::text,
                         jsonb_build_object('ausente', v_antes.ausente, 'ate', v_antes.ausente_ate),
                         jsonb_build_object('ausente', coalesce(p_ausente, false),
                                            'ate', case when coalesce(p_ausente, false) then p_ate end));
end $$;

create or replace function public.canal_definir_equipe(p_canal uuid, p_equipe uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_canal public.canais;
begin
  select * into v_canal from public.canais where id = p_canal;
  if v_canal.id is null or not public.tem_papel(v_canal.org_id, '{dono,admin}') then
    raise exception 'Só dono e admin escolhem a equipe que recebe os contatos do número. Peça a um deles.';
  end if;
  if p_equipe is not null and not exists (select 1 from public.equipes where id = p_equipe and org_id = v_canal.org_id) then
    raise exception 'Esta equipe foi removida. Recarregue a tela e escolha outra.';
  end if;
  update public.canais set equipe_id = p_equipe where id = p_canal;
  perform public.auditar(v_canal.org_id, 'canal_equipe', 'canais', p_canal::text,
                         jsonb_build_object('equipe_id', v_canal.equipe_id), jsonb_build_object('equipe_id', p_equipe));
end $$;

-- Lista completa das cidades da equipe (substitui a anterior). Uma cidade só pode estar em uma equipe.
create or replace function public.equipe_definir_cidades(p_equipe uuid, p_cidades text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_eq public.equipes;
  v_cidade text;
  v_outra text;
  v_antes jsonb;
begin
  select * into v_eq from public.equipes where id = p_equipe;
  if v_eq.id is null or not public.tem_papel(v_eq.org_id, '{dono,admin}') then
    raise exception 'Só dono e admin mudam as equipes.';
  end if;
  if cardinality(p_cidades) > 200 then
    raise exception 'Cada equipe aceita até 200 cidades. Tire algumas ou passe parte delas para outra equipe.';
  end if;
  foreach v_cidade in array coalesce(p_cidades, '{}') loop
    if length(btrim(v_cidade)) > 100 then
      -- O caso comum é faltar a vírgula entre as cidades (13/11).
      raise exception 'O nome da cidade "%…" passa de 100 letras. Confira se faltou uma vírgula entre as cidades.',
        left(btrim(v_cidade), 40);
    end if;
    select e.nome into v_outra from public.equipes_cidades ec join public.equipes e on e.id = ec.equipe_id
     where ec.org_id = v_eq.org_id and ec.chave = public.cidade_chave(v_cidade) and ec.equipe_id <> p_equipe;
    if v_outra is not null then
      raise exception '% já está na equipe %. Tire a cidade de lá e salve de novo aqui.', btrim(v_cidade), v_outra;
    end if;
  end loop;
  select coalesce(jsonb_agg(cidade order by cidade), '[]') into v_antes from public.equipes_cidades where equipe_id = p_equipe;
  delete from public.equipes_cidades where equipe_id = p_equipe;
  begin
    insert into public.equipes_cidades (org_id, equipe_id, cidade, chave)
    select distinct on (public.cidade_chave(c)) v_eq.org_id, p_equipe, btrim(c), public.cidade_chave(c)
      from unnest(coalesce(p_cidades, '{}')) c
     where public.cidade_chave(c) is not null
     order by public.cidade_chave(c), btrim(c);
  exception when unique_violation then
    -- Outra pessoa salvou a mesma cidade em outra equipe ao mesmo tempo.
    raise exception 'Uma dessas cidades acabou de ser colocada em outra equipe. Recarregue a tela e confira.';
  end;
  perform public.auditar(v_eq.org_id, 'equipe_cidades', 'equipes', p_equipe::text, jsonb_build_object('cidades', v_antes),
                         jsonb_build_object('cidades', (select coalesce(jsonb_agg(cidade order by cidade), '[]')
                                                          from public.equipes_cidades where equipe_id = p_equipe)));
end $$;
