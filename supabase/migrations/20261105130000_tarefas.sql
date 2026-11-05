-- Tarefas com lembrete (docs/crm-acompanhamento.md, entrega 1; decisões de 05/11).
--
-- O acompanhamento do lead era só a lista "sem retorno" do Painel, que ninguém é avisado de olhar. A tarefa é o
-- próximo passo ("ligar quinta", "mandar proposta"): data e hora, responsável, ligada ao contato e, se houver, à
-- oportunidade e à conversa, com lembrete no celular e no WhatsApp da pessoa (a mesma rotina da agenda).
--
-- executor: 'equipe' (uma pessoa) ou 'agente'. As retomadas do agente (entrega 2) são tarefas do agente na mesma
-- tabela, para a equipe ver e poder cancelar; nesta entrega nada cria tarefa do agente ainda.
--
-- Quem vê: a carteira do contato (pode_ver_contato); sem contato, o responsável, quem criou, dono e admin. Apagar é
-- de quem criou, dono e admin (o normal é concluir ou cancelar).
--
-- Painel: a oportunidade com tarefa aberta e no prazo tem próximo passo, então sai da lista "sem retorno".

create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  observacao text check (length(observacao) <= 2000),
  vence_em timestamptz not null,
  executor text not null default 'equipe' check (executor in ('equipe', 'agente')),
  responsavel_id uuid references auth.users (id) on delete set null,
  contato_id uuid,
  oportunidade_id uuid,
  conversa_id uuid,
  status text not null default 'aberta' check (status in ('aberta', 'feita', 'cancelada')),
  -- Como terminou, em texto curto (o agente usa na entrega 2: "respondeu", "não precisou", "sem resposta").
  resultado text check (length(resultado) <= 500),
  -- Antecedência do lembrete em minutos (0 = na hora; nulo = sem lembrete).
  lembrete_minutos integer default 0 check (lembrete_minutos in (0, 10, 30, 60, 120, 1440)),
  lembrete_enviado_em timestamptz,
  concluida_em timestamptz,
  concluida_por uuid references auth.users (id) on delete set null,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (contato_id, org_id) references public.contatos (id, org_id) on delete cascade,
  foreign key (oportunidade_id, org_id) references public.oportunidades (id, org_id) on delete set null (oportunidade_id),
  foreign key (conversa_id, org_id) references public.conversas (id, org_id) on delete set null (conversa_id)
);
comment on table public.tarefas is 'Próximos passos da equipe e retomadas do agente, com lembrete';
create index tarefas_abertas_idx on public.tarefas (org_id, vence_em) where status = 'aberta';
create index tarefas_responsavel_idx on public.tarefas (responsavel_id, vence_em) where status = 'aberta';
create index tarefas_contato_idx on public.tarefas (contato_id);
create index tarefas_oportunidade_idx on public.tarefas (oportunidade_id) where oportunidade_id is not null;
create index tarefas_conversa_idx on public.tarefas (conversa_id) where conversa_id is not null;
create trigger tarefas_atualizado_em before update on public.tarefas
for each row execute function public.tocar_atualizado_em();

-- Preenchimento e regras: contato vem da oportunidade ou da conversa; a tarefa da equipe sem responsável fica com
-- quem criou; concluir guarda quando e quem; remarcar faz o lembrete valer de novo.
create function public.tarefas_preparar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_contato uuid;
begin
  new.titulo := btrim(new.titulo);
  if new.oportunidade_id is not null and (tg_op = 'INSERT' or new.oportunidade_id is distinct from old.oportunidade_id) then
    select contato_id into v_contato from public.oportunidades where id = new.oportunidade_id;
    if new.contato_id is null then
      new.contato_id := v_contato;
    elsif v_contato is distinct from new.contato_id then
      raise exception 'a oportunidade é de outro contato';
    end if;
  end if;
  if new.conversa_id is not null and (tg_op = 'INSERT' or new.conversa_id is distinct from old.conversa_id) then
    select contato_id into v_contato from public.conversas where id = new.conversa_id;
    if new.contato_id is null then
      new.contato_id := v_contato;
    elsif v_contato is distinct from new.contato_id then
      raise exception 'a conversa é de outro contato';
    end if;
  end if;
  if new.executor = 'agente' and new.contato_id is null then
    raise exception 'a retomada do agente precisa de um contato';
  end if;

  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
    if new.executor = 'equipe' and new.responsavel_id is null then
      new.responsavel_id := auth.uid();
    end if;
    new.concluida_em := null;
    new.concluida_por := null;
    new.lembrete_enviado_em := null;
  end if;
  if new.responsavel_id is not null and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id)
     and not exists (select 1 from public.membros_org where org_id = new.org_id and user_id = new.responsavel_id and ativo) then
    raise exception 'o responsável precisa ser da equipe';
  end if;

  if tg_op = 'UPDATE' then
    if new.status <> 'aberta' and old.status = 'aberta' then
      new.concluida_em := now();
      new.concluida_por := auth.uid();
    elsif new.status = 'aberta' and old.status <> 'aberta' then
      new.concluida_em := null;
      new.concluida_por := null;
      new.resultado := null;
    end if;
    if new.vence_em is distinct from old.vence_em or new.lembrete_minutos is distinct from old.lembrete_minutos
       or new.responsavel_id is distinct from old.responsavel_id or (new.status = 'aberta' and old.status <> 'aberta') then
      new.lembrete_enviado_em := null;
    end if;
  end if;
  return new;
end $$;
create trigger tarefas_preparar before insert or update on public.tarefas
for each row execute function public.tarefas_preparar();
revoke execute on function public.tarefas_preparar() from public, anon, authenticated;

-- ============================================================================
-- Quem vê
-- ============================================================================
create function public.pode_ver_tarefa(p_org uuid, p_responsavel uuid, p_criado_por uuid, p_contato uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org)
     and (public.tem_papel(p_org, '{dono,admin}')
          or p_responsavel = auth.uid()
          or p_criado_por = auth.uid()
          or (p_contato is not null and public.pode_ver_contato(p_contato)));
$$;
revoke execute on function public.pode_ver_tarefa(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.pode_ver_tarefa(uuid, uuid, uuid, uuid) to authenticated;

alter table public.tarefas enable row level security;
create policy tarefas_ver on public.tarefas for select to authenticated
  using (public.pode_ver_tarefa(org_id, responsavel_id, criado_por, contato_id));
create policy tarefas_criar on public.tarefas for insert to authenticated
  with check (public.eh_membro(org_id) and (contato_id is null or public.pode_ver_contato(contato_id)));
create policy tarefas_editar on public.tarefas for update to authenticated
  using (public.pode_ver_tarefa(org_id, responsavel_id, criado_por, contato_id))
  with check (public.eh_membro(org_id) and (contato_id is null or public.pode_ver_contato(contato_id)));
create policy tarefas_apagar on public.tarefas for delete to authenticated
  using (public.eh_membro(org_id) and (criado_por = (select auth.uid()) or public.tem_papel(org_id, '{dono,admin}')));
grant select, insert, update, delete on public.tarefas to authenticated;

-- ============================================================================
-- Lembrete (igual ao da agenda, 20261020130000): celular e WhatsApp do responsável
-- ============================================================================
-- Só tarefas da equipe, abertas, com responsável. Não avisa tarefa que venceu há mais de 15 min (cron parado ou
-- tarefa criada já atrasada não dispara lembrete velho).
create function public.tarefas_lembretes() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  t record;
  v_quando text;
  v_hora text;
  v_cliente text;
  v_tel text;
  v_canal uuid;
  v_total integer := 0;
begin
  for t in
    select tf.*, ct.nome as contato_nome, ct.nome_whatsapp, ct.telefone as contato_telefone
      from public.tarefas tf
      left join public.contatos ct on ct.id = tf.contato_id
     where tf.status = 'aberta' and tf.executor = 'equipe' and tf.responsavel_id is not null
       and tf.lembrete_minutos is not null and tf.lembrete_enviado_em is null
       and tf.vence_em - make_interval(mins => tf.lembrete_minutos) <= now()
       and tf.vence_em > now() - interval '15 minutes'
     order by tf.vence_em
     limit 200
     for update of tf skip locked
  loop
    v_hora := to_char(t.vence_em at time zone 'America/Sao_Paulo', 'HH24:MI');
    v_quando := case (t.vence_em at time zone 'America/Sao_Paulo')::date - (now() at time zone 'America/Sao_Paulo')::date
                  when 0 then 'Hoje às ' || v_hora
                  when 1 then 'Amanhã às ' || v_hora
                  else to_char(t.vence_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') end;
    v_cliente := coalesce(t.contato_nome, t.nome_whatsapp);

    if exists (select 1 from public.push_inscricoes i where i.user_id = t.responsavel_id) then
      insert into public.push_fila (user_id, titulo, corpo, url)
      values (t.responsavel_id, left('Tarefa: ' || v_quando, 80),
              left(t.titulo || coalesce(' · ' || v_cliente, ''), 180), '/tarefas');
    end if;

    select p.telefone into v_tel from public.perfis p where p.user_id = t.responsavel_id;
    if v_tel is not null then
      select cn.id into v_canal from public.canais cn
       where cn.org_id = t.org_id and cn.ativo
       order by (cn.responsavel_id is distinct from t.responsavel_id) desc, (cn.status_conexao = 'WORKING') desc,
                (cn.tipo = 'waha') desc, cn.criado_em
       limit 1;
      if v_canal is not null then
        insert into public.alertas (org_id, canal_id, telefone, texto)
        values (t.org_id, v_canal, v_tel,
                '✅ *Tarefa*' || E'\n' || t.titulo || E'\n' || v_quando
                || coalesce(E'\nCliente: ' || v_cliente || coalesce(' (' || t.contato_telefone || ')', ''), '')
                || coalesce(E'\n' || left(t.observacao, 300), '')
                || E'\n\n_Livih · Tarefas_');
      end if;
    end if;

    update public.tarefas set lembrete_enviado_em = now() where id = t.id;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;
revoke execute on function public.tarefas_lembretes() from public, anon, authenticated;

select cron.schedule('livih-tarefas-lembretes', '* * * * *', 'select public.tarefas_lembretes()');

-- ============================================================================
-- Painel: oportunidade com próximo passo no prazo sai do "sem retorno"
-- ============================================================================
-- Igual ao de 20261021120000, com a condição da tarefa em "sem_retorno".
create or replace function public.painel_pendencias(p_org uuid, p_canal uuid default null, p_vendedor uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_vend uuid := public.painel_filtro_vendedor(p_org, p_vendedor);
  v_res jsonb;
begin
  with conv as (
    select c.id, c.contato_id, c.canal_id, cn.nome as numero
      from public.conversas c join public.canais cn on cn.id = c.canal_id
     where c.org_id = p_org and c.estado <> 'encerrada'
       and (p_canal is null or c.canal_id = p_canal)
       and (v_vend is null or c.atribuida_a = v_vend or cn.responsavel_id = v_vend)
  ),
  ultima as (
    select conv.id, conv.contato_id, conv.numero, u.criado_em, u.direcao
      from conv
      cross join lateral (select m.criado_em, m.direcao from public.mensagens m
                           where m.conversa_id = conv.id and m.autor_tipo <> 'sistema' and not m.automatica
                           order by m.criado_em desc limit 1) u
  )
  select jsonb_build_object(
    'sem_resposta', (
      select coalesce(jsonb_agg(jsonb_build_object('conversa_id', s.id, 'contato', coalesce(ct.nome, ct.nome_whatsapp, ct.telefone),
                                                   'numero', s.numero, 'desde', s.criado_em) order by s.criado_em), '[]')
        from (select * from ultima where direcao = 'entrada' and criado_em < now() - interval '1 hour'
               order by criado_em limit 30) s
        join public.contatos ct on ct.id = s.contato_id),
    'sem_retorno', (
      select coalesce(jsonb_agg(x order by x ->> 'ultimo_contato' nulls first), '[]') from (
        select jsonb_build_object('oportunidade_id', o.id, 'titulo', o.titulo, 'contato_id', o.contato_id,
                                  'contato', coalesce(ct.nome, ct.nome_whatsapp, ct.telefone), 'etapa', e.nome,
                                  'ultimo_contato', ul.em) x
          from public.oportunidades o
          join public.etapas_funil e on e.id = o.etapa_id and e.tipo = 'aberta'
          join public.contatos ct on ct.id = o.contato_id
          left join lateral (select max(m.criado_em) em from public.mensagens m join public.conversas c on c.id = m.conversa_id
                              where c.contato_id = o.contato_id and m.direcao = 'saida' and not m.automatica
                                and m.autor_tipo in ('bot', 'atendente')) ul on true
         where o.org_id = p_org and o.fechada_em is null
           and (ul.em is null or ul.em < now() - interval '3 days')
           and not exists (select 1 from public.tarefas tf
                            where tf.status = 'aberta' and tf.vence_em >= now()
                              and (tf.oportunidade_id = o.id or (tf.oportunidade_id is null and tf.contato_id = o.contato_id)))
           and (p_canal is null or o.contato_id in (select contato_id from conv))
           and (v_vend is null or o.responsavel_id = v_vend or o.contato_id in (select contato_id from conv))
         order by ul.em nulls first
         limit 30) y)
  ) into v_res;
  return v_res;
end $$;
