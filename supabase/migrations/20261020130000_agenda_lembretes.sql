-- Lembrete de compromisso para a equipe (pedido de 20/10): notificação no celular (Web Push) e WhatsApp.
--
-- Cada compromisso tem a antecedência do lembrete (padrão 30 min; nulo = sem lembrete). Uma rotina por minuto
-- (pg_cron) acha os que chegaram na hora e avisa o RESPONSÁVEL:
--   - notificação no celular, se ele ativou em algum aparelho (push_fila → push-enviar), abrindo a Agenda;
--   - WhatsApp, se ele cadastrou o número em "Seus dados" (alertas → whatsapp-enviar), saindo por um número da
--     empresa (de preferência um que não seja o dele: mandar para si mesmo cai no "Você" do WhatsApp).
-- Remarcar (mudar o início ou a antecedência) faz o lembrete valer de novo.

alter table public.compromissos
  add column lembrete_minutos integer default 30 check (lembrete_minutos in (10, 30, 60, 120, 1440)),
  add column lembrete_enviado_em timestamptz;

create function public.compromisso_lembrete_remarcado() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.inicio is distinct from old.inicio or new.lembrete_minutos is distinct from old.lembrete_minutos then
    new.lembrete_enviado_em := null;
  end if;
  return new;
end $$;
create trigger compromisso_lembrete_remarcado before update on public.compromissos
for each row execute function public.compromisso_lembrete_remarcado();

-- Rodada do lembrete. Só compromissos marcados/confirmados, com responsável, que ainda não começaram há mais de
-- 5 min (o cron parado não dispara um monte de lembrete atrasado depois). Devolve quantos avisou.
create function public.agenda_lembretes() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  v_quando text;
  v_hora text;
  v_cliente text;
  v_tel text;
  v_canal uuid;
  v_total integer := 0;
begin
  for c in
    select cp.*, ct.nome as contato_nome, ct.nome_whatsapp, ct.telefone as contato_telefone
      from public.compromissos cp
      left join public.contatos ct on ct.id = cp.contato_id
     where cp.lembrete_minutos is not null and cp.lembrete_enviado_em is null and cp.responsavel_id is not null
       and cp.status in ('marcado', 'confirmado')
       and cp.inicio - make_interval(mins => cp.lembrete_minutos) <= now()
       and cp.inicio > now() - interval '5 minutes'
     order by cp.inicio
     limit 200
     for update of cp skip locked
  loop
    v_hora := to_char(c.inicio at time zone 'America/Sao_Paulo', 'HH24:MI');
    v_quando := case (c.inicio at time zone 'America/Sao_Paulo')::date - (now() at time zone 'America/Sao_Paulo')::date
                  when 0 then 'Hoje às ' || v_hora
                  when 1 then 'Amanhã às ' || v_hora
                  else to_char(c.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') end;
    v_cliente := coalesce(c.contato_nome, c.nome_whatsapp);

    -- Celular (só quem ativou as notificações em algum aparelho).
    if exists (select 1 from public.push_inscricoes i where i.user_id = c.responsavel_id) then
      insert into public.push_fila (user_id, titulo, corpo, url)
      values (c.responsavel_id, left('Compromisso: ' || v_quando, 80),
              left(c.titulo || coalesce(' · ' || v_cliente, '') || coalesce(' · ' || c.local, ''), 180), '/agenda');
    end if;

    -- WhatsApp (só quem cadastrou o número), por um número da empresa.
    select p.telefone into v_tel from public.perfis p where p.user_id = c.responsavel_id;
    if v_tel is not null then
      select cn.id into v_canal from public.canais cn
       where cn.org_id = c.org_id and cn.ativo
       order by (cn.responsavel_id is distinct from c.responsavel_id) desc, (cn.status_conexao = 'WORKING') desc,
                (cn.tipo = 'waha') desc, cn.criado_em
       limit 1;
      if v_canal is not null then
        insert into public.alertas (org_id, canal_id, telefone, texto)
        values (c.org_id, v_canal, v_tel,
                '📅 *Lembrete de compromisso*' || E'\n' || c.titulo || E'\n' || v_quando
                || coalesce(E'\nCliente: ' || v_cliente || coalesce(' (' || c.contato_telefone || ')', ''), '')
                || coalesce(E'\nLocal: ' || c.local, '')
                || E'\n\n_Livih · Agenda_');
      end if;
    end if;

    update public.compromissos set lembrete_enviado_em = now() where id = c.id;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $$;

revoke execute on function public.agenda_lembretes() from public, anon, authenticated;

-- Para a tela: quem da equipe recebe lembrete por onde (sem expor telefone nem aparelhos).
create function public.agenda_avisos_equipe(p_org uuid)
returns table (user_id uuid, celular boolean, whatsapp boolean)
language sql stable security definer set search_path = '' as $$
  select m.user_id,
         exists (select 1 from public.push_inscricoes i where i.user_id = m.user_id),
         exists (select 1 from public.perfis p where p.user_id = m.user_id and p.telefone is not null)
    from public.membros_org m
   where m.org_id = p_org and m.ativo and public.eh_membro(p_org);
$$;
revoke execute on function public.agenda_avisos_equipe(uuid) from public, anon;
grant execute on function public.agenda_avisos_equipe(uuid) to authenticated;

select cron.schedule('livih-agenda-lembretes', '* * * * *', 'select public.agenda_lembretes()');
