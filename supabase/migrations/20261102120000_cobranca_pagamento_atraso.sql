-- Pagamento e atraso das faturas da Livih (docs/cobranca-asaas.md, entrega 3; decisões de 01/11).
--
-- Até aqui a fatura ficava "Em aberto" mesmo depois de paga: nada voltava do Asaas. Agora:
--   - webhook do Asaas (Edge Function asaas-webhook, com o token próprio) chama cobranca_evento_asaas, que marca a
--     fatura como paga, vencida, estornada ou cancelada (apagada no painel do Asaas) e acompanha a troca de vencimento
--     feita lá (dar prazo a um cliente é mudar o vencimento no Asaas). Cada evento é gravado uma vez só
--     (asaas_eventos): o Asaas reenvia o mesmo evento quando não recebe resposta;
--   - rotina diária (cron às 09:15 em Brasília): aos 3 dias de atraso, aviso ao dono e aos administradores; aos 10,
--     suspensão da empresa com o motivo 'inadimplencia' (o mesmo efeito do Suspender da tela Empresas). Um aviso e uma
--     suspensão por fatura: se a plataforma reativar à mão, a mesma fatura não suspende de novo;
--   - pagamento (ou fatura cancelada, estornada ou com vencimento novo) reativa sozinho, mas só o que foi suspenso por
--     atraso e só quando não sobra outra fatura com 10 dias de atraso. Suspensão feita pela plataforma continua;
--   - empresa suspensa não recebe fatura no fechamento do dia 1: ao reativar, a fatura do mês que ficou para trás é
--     criada (se o mês ainda não teve nenhuma, nem cancelada: cancelar uma fatura pode ter sido de propósito).
-- Aviso e suspensão só para fatura de PRODUÇÃO: no sandbox ninguém paga de verdade, e a JoGrampo fica lá até a
-- produção do Asaas (passo 6 das pendências). O webhook vale nos dois, para testar o pagamento no sandbox, com um token
-- por conta do Asaas: evento do sandbox não mexe em fatura de produção.
-- Os avisos ao cliente saem pelo número de avisos da Livih (plataforma_config.canal_alertas), não pelo número da
-- própria empresa: quem cobra é a Livih, e o número da empresa suspensa pode parar.

-- ---------- empresa: por que está suspensa ----------
alter table public.organizacoes add column motivo_suspensao text check (motivo_suspensao in ('plataforma', 'inadimplencia'));
comment on column public.organizacoes.motivo_suspensao is
  'Quem suspendeu: plataforma (tela Empresas) ou inadimplencia (fatura com 10 dias de atraso; o pagamento reativa). Nulo na ativa.';
update public.organizacoes set motivo_suspensao = 'plataforma' where status = 'suspensa';

-- A tela Empresas mostra "Suspensa por atraso" (coluna nova no retorno: precisa recriar).
drop function public.plataforma_empresas();
create function public.plataforma_empresas()
returns table (id uuid, nome text, slug text, status text, criado_em timestamptz,
               dono_nome text, dono_email text, dono_senha_definida boolean,
               membros int, numeros int, numeros_conectados int,
               conversas_30d int, ultima_mensagem_em timestamptz, motivo_suspensao text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_admin_plataforma() then
    raise exception 'só a equipe da plataforma';
  end if;
  return query
  select o.id, o.nome, o.slug, o.status, o.criado_em,
         d.nome, d.email, d.senha_definida,
         (select count(*)::int from public.membros_org m where m.org_id = o.id and m.ativo),
         (select count(*)::int from public.canais c where c.org_id = o.id and c.ativo),
         (select count(*)::int from public.canais c where c.org_id = o.id and c.ativo and c.status_conexao = 'WORKING'),
         (select count(*)::int from public.conversas v where v.org_id = o.id and v.ultima_mensagem_em > now() - interval '30 days'),
         (select max(v.ultima_mensagem_em) from public.conversas v where v.org_id = o.id),
         o.motivo_suspensao
    from public.organizacoes o
    left join lateral (
      select p.nome, u.email::text as email,
             u.encrypted_password is not null and u.encrypted_password <> '' as senha_definida
        from public.membros_org m
        join auth.users u on u.id = m.user_id
        left join public.perfis p on p.user_id = m.user_id
       where m.org_id = o.id and m.papel = 'dono' and m.ativo
       order by m.criado_em limit 1
    ) d on true
   order by o.criado_em desc;
end $$;
revoke execute on function public.plataforma_empresas() from public, anon;
grant execute on function public.plataforma_empresas() to authenticated;

-- ---------- faturas: estornada, aviso e suspensão ----------
alter table public.faturas drop constraint faturas_status_check;
alter table public.faturas add constraint faturas_status_check
  check (status in ('a_enviar', 'enviando', 'aberta', 'paga', 'vencida', 'estornada', 'a_cancelar', 'cancelada', 'erro'));
alter table public.faturas add column aviso_atraso_em timestamptz, add column suspensao_em timestamptz;
comment on column public.faturas.status is
  'a_enviar → enviando (a asaas-cobranca pegou; evita duas cobranças da mesma fatura) → aberta → paga ou vencida '
  '(webhook do Asaas); paga → estornada (devolvida pelo Asaas). erro volta a a_enviar no reenvio; a_cancelar → '
  'cancelada (a função apaga a cobrança no Asaas, ou ela foi apagada no painel do Asaas).';
comment on column public.faturas.aviso_atraso_em is 'Aviso de 3 dias de atraso mandado ao dono (um por fatura).';
comment on column public.faturas.suspensao_em is
  'Fatura chegou a 10 dias de atraso (suspendeu a empresa, se estava ativa). Enquanto ela não for paga, a empresa não reativa sozinha.';
create index faturas_atraso_idx on public.faturas (vencimento) where status in ('aberta', 'vencida');

-- Estornada também não se cancela (o dinheiro já voltou pelo Asaas).
create or replace function public.plataforma_cancelar_fatura(p_fatura uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f public.faturas;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'Só a equipe da plataforma muda a cobrança. Entre com a conta da plataforma.';
  end if;
  select * into f from public.faturas where id = p_fatura for update;
  if f.id is null or f.status in ('paga', 'estornada', 'cancelada', 'a_cancelar', 'enviando') then
    raise exception 'Esta fatura não pode ser cancelada agora (já paga, estornada, já cancelada ou sendo enviada).';
  end if;
  update public.faturas
     set status = case when f.asaas_id is null then 'cancelada' else 'a_cancelar' end, atualizado_em = now()
   where id = p_fatura;
  insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
  values (f.org_id, 'atendente', auth.uid(), 'cancelar_fatura', 'faturas', f.id::text,
          jsonb_build_object('status', f.status, 'valor', f.valor, 'competencia', f.competencia),
          jsonb_build_object('status', 'cancelada'));
  if f.asaas_id is not null then
    perform public.chamar_funcao('asaas-cobranca');
  end if;
end $$;

-- ---------- eventos do Asaas já recebidos ----------
create table public.asaas_eventos (
  id           text primary key,
  evento       text not null,
  pagamento_id text,
  fatura_id    uuid references public.faturas (id) on delete set null,
  resultado    text,
  recebido_em  timestamptz not null default now()
);
comment on table public.asaas_eventos is
  'Eventos do webhook do Asaas já tratados (o Asaas reenvia o mesmo evento). Sem dados do cliente; apagados após 180 dias.';
alter table public.asaas_eventos enable row level security;  -- sem policy: só as funções
revoke all on public.asaas_eventos from anon, authenticated;

-- ---------- avisos de cobrança ----------
-- Um aviso que falha (canal apagado, fila com problema) nunca desfaz o evento, a suspensão ou a fatura: as duas
-- funções engolem o erro e deixam só o warning no log.

-- Equipe da plataforma: só no celular, com o nome da empresa no título.
create function public.cobranca_avisar_plataforma(p_org uuid, p_texto text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- O gatilho da push_fila chama a Edge Function por comando, mesmo sem linha: só insere se houver para quem.
  if exists (select 1 from public.admins_plataforma ap join public.push_inscricoes i on i.user_id = ap.user_id) then
    insert into public.push_fila (user_id, titulo, corpo, url)
    select ap.user_id, left(coalesce((select nome from public.organizacoes where id = p_org), 'Empresa'), 80),
           left(p_texto, 180), '/empresas'
      from public.admins_plataforma ap
     where exists (select 1 from public.push_inscricoes i where i.user_id = ap.user_id);
  end if;
exception when others then
  raise warning 'livih: aviso de cobrança à plataforma falhou (%): %', p_org, sqlerrm;
end $$;
revoke execute on function public.cobranca_avisar_plataforma(uuid, text) from public, anon, authenticated;

-- Dono e administradores: celular (quem ativou) e WhatsApp (quem cadastrou o número), pelo número de avisos da Livih.
-- O alerta fica na empresa cobrada (org_id), não na F7: quem vê a tabela alertas é o dono da empresa do alerta.
-- O link de pagamento vai só no WhatsApp (a notificação do celular é curta). Depois, a plataforma.
create function public.cobranca_avisar(p_org uuid, p_icone text, p_titulo text, p_corpo text, p_link text,
                                       p_url text, p_plataforma text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_canal uuid := (select canal_alertas from public.plataforma_config where id = 1);
begin
  begin
    if exists (select 1 from public.membros_org mo join public.push_inscricoes i on i.user_id = mo.user_id
                where mo.org_id = p_org and mo.ativo and mo.papel in ('dono', 'admin')) then
      insert into public.push_fila (user_id, titulo, corpo, url)
      select mo.user_id, p_titulo, case when length(p_corpo) > 180 then left(p_corpo, 179) || '…' else p_corpo end, p_url
        from public.membros_org mo
       where mo.org_id = p_org and mo.ativo and mo.papel in ('dono', 'admin')
         and exists (select 1 from public.push_inscricoes i where i.user_id = mo.user_id);
    end if;
    if v_canal is not null and exists (select 1 from public.membros_org mo join public.perfis pf on pf.user_id = mo.user_id
                                        where mo.org_id = p_org and mo.ativo and mo.papel in ('dono', 'admin')
                                          and pf.telefone is not null) then
      insert into public.alertas (org_id, canal_id, telefone, texto)
      select p_org, v_canal, pf.telefone,
             p_icone || ' *' || p_titulo || '*' || E'\n' || p_corpo
             || case when p_link is not null then E'\n\n' || 'Pague por aqui: ' || p_link else '' end
             || E'\n\n_Livih · Cobrança_'
        from public.membros_org mo
        join public.perfis pf on pf.user_id = mo.user_id
       where mo.org_id = p_org and mo.ativo and mo.papel in ('dono', 'admin') and pf.telefone is not null;
    end if;
  exception when others then
    raise warning 'livih: aviso de cobrança ao dono falhou (%): %', p_org, sqlerrm;
  end;
  perform public.cobranca_avisar_plataforma(p_org, p_plataforma);
end $$;
revoke execute on function public.cobranca_avisar(uuid, text, text, text, text, text, text) from public, anon, authenticated;

-- ---------- reativação ----------
-- Fatura do mês corrente que o fechamento do dia 1 pulou (empresa suspensa naquele dia). Só se o mês não teve
-- nenhuma fatura, nem cancelada (cancelar pode ter sido de propósito). Mês inteiro suspenso não é cobrado: a empresa
-- não usou. Sem conferência de papel: só para as funções abaixo.
create function public.cobranca_fatura_mes_pulado(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_comp date := public.mes_brasilia();
begin
  if exists (select 1 from public.contratos_cobranca where org_id = p_org and ativo and inicio <= v_comp)
     and exists (select 1 from public.organizacoes where id = p_org and status = 'ativa')
     and not exists (select 1 from public.faturas where org_id = p_org and competencia = v_comp) then
    if public.cobranca_criar_fatura(p_org, v_comp) is not null then
      perform public.chamar_funcao('asaas-cobranca');
    end if;
  end if;
exception when others then
  raise warning 'livih: fatura do mês pulado de % não criada: %', p_org, sqlerrm;
end $$;
revoke execute on function public.cobranca_fatura_mes_pulado(uuid) from public, anon, authenticated;

-- Reativa a empresa suspensa por atraso quando não sobra fatura com 10 dias de atraso.
create function public.cobranca_reativar(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.organizacoes where id = p_org and status = 'suspensa'
                    and motivo_suspensao = 'inadimplencia') then
    return;
  end if;
  if exists (select 1 from public.faturas where org_id = p_org and status in ('aberta', 'vencida')
                and suspensao_em is not null) then
    return;
  end if;
  update public.organizacoes set status = 'ativa', motivo_suspensao = null where id = p_org;
  insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
  values (p_org, 'sistema', 'reativar_apos_pagamento', 'organizacoes', p_org::text,
          jsonb_build_object('status', 'suspensa', 'motivo', 'inadimplencia'), jsonb_build_object('status', 'ativa'));
  perform public.cobranca_fatura_mes_pulado(p_org);
  perform public.cobranca_avisar(p_org, '✅', 'Acesso à Livih liberado',
    'Recebemos o pagamento da empresa ' || (select nome from public.organizacoes where id = p_org)
    || '. A equipe já pode entrar na Livih e o agente voltou a responder. Agradecemos!',
    null, '/', 'reativada depois do pagamento');
end $$;
revoke execute on function public.cobranca_reativar(uuid) from public, anon, authenticated;

-- Reativar à mão uma empresa suspensa por atraso também cria a fatura do mês pulado (o resto do status, como antes).
create or replace function public.plataforma_definir_status(p_org uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_motivo text := (select motivo_suspensao from public.organizacoes where id = p_org);
begin
  if not public.eh_admin_plataforma() then
    raise exception 'só a equipe da plataforma';
  end if;
  if p_status not in ('ativa', 'suspensa') then
    raise exception 'situação inválida';
  end if;
  update public.organizacoes
     set status = p_status, motivo_suspensao = case when p_status = 'suspensa' then 'plataforma' end
   where id = p_org;
  if p_status = 'ativa' and v_motivo = 'inadimplencia' then
    perform public.cobranca_fatura_mes_pulado(p_org);
  end if;
end $$;

-- Fatura paga, cancelada ou estornada: avisa a plataforma do pagamento e tenta reativar (vale para todos os caminhos:
-- webhook, cancelamento pela tela e a asaas-cobranca).
create function public.faturas_situacao_mudou() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'paga' then
    perform public.cobranca_avisar_plataforma(new.org_id,
      'pagou a fatura de ' || to_char(new.competencia, 'MM/YYYY') || ' (' || public.reais(new.valor) || ')'
      || case when new.ambiente = 'sandbox' then ' · teste' else '' end);
  end if;
  perform public.cobranca_reativar(new.org_id);
  return null;
end $$;
revoke execute on function public.faturas_situacao_mudou() from public, anon, authenticated;

create trigger faturas_situacao_mudou after update of status on public.faturas
for each row when (old.status is distinct from new.status and new.status in ('paga', 'cancelada', 'estornada'))
execute function public.faturas_situacao_mudou();

-- ---------- webhook do Asaas ----------
-- Chamada pela asaas-webhook (chave de serviço), com o ambiente descoberto pelo token (um por conta do Asaas): evento
-- do sandbox não mexe em fatura de produção. Devolve o que fez, para o log. Pagamento que não é de fatura da Livih
-- (a conta do Asaas pode cobrar outras coisas da F7) é só registrado.
create function public.cobranca_evento_asaas(p_evento_id text, p_evento text, p_pagamento jsonb, p_ambiente text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_venc date := nullif(p_pagamento ->> 'dueDate', '')::date;
  v_ref text := coalesce(p_pagamento ->> 'externalReference', '');
  v_id text := p_ambiente || ':' || p_evento_id;
  f public.faturas;
  v_res text;
begin
  if nullif(btrim(p_evento_id), '') is null or nullif(btrim(p_evento), '') is null
     or coalesce(p_ambiente, '') not in ('sandbox', 'producao') then
    raise exception 'evento do Asaas sem id, sem tipo ou sem ambiente';
  end if;
  insert into public.asaas_eventos (id, evento, pagamento_id) values (v_id, p_evento, p_pagamento ->> 'id')
  on conflict (id) do nothing;
  if not found then
    return 'repetido';
  end if;

  select * into f from public.faturas
   where asaas_id = p_pagamento ->> 'id' and ambiente = p_ambiente for update;
  -- Evento que chega antes de a asaas-cobranca gravar o id da cobrança (segundos depois de criada, ou a função caiu
  -- no meio): acha pela referência, que é o id da fatura, e grava o id. Comparado como texto: referência de outra
  -- cobrança da F7 que não é um uuid não pode derrubar a chamada.
  if f.id is null and v_ref ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then
    select * into f from public.faturas where id::text = lower(v_ref) and asaas_id is null for update;
    if f.id is not null then
      update public.faturas set asaas_id = p_pagamento ->> 'id', ambiente = p_ambiente where id = f.id;
    end if;
  end if;

  if f.id is null then
    v_res := 'desconhecido';
  elsif p_evento in ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED') then
    -- Cartão: CONFIRMED na hora e RECEIVED dias depois; Pix e boleto: RECEIVED. Vale o primeiro.
    -- 'a_cancelar': o cliente pagou antes de a cobrança ser apagada (o Asaas não apaga cobrança paga).
    -- 'enviando', 'a_enviar' e 'erro': pago antes de a Livih gravar o link (achado pela referência).
    if f.status in ('aberta', 'vencida', 'a_cancelar', 'enviando', 'a_enviar', 'erro') then
      update public.faturas set status = 'paga', paga_em = now(), erro = null, atualizado_em = now() where id = f.id;
      v_res := 'paga';
    elsif f.status <> 'paga' then
      -- Cancelada ou estornada e paga mesmo assim: o dinheiro entrou; a plataforma decide (devolver ou abater).
      perform public.cobranca_avisar_plataforma(f.org_id,
        'pagou a fatura de ' || to_char(f.competencia, 'MM/YYYY') || ', que estava ' || f.status
        || ' na Livih. Confira no painel do Asaas.');
      v_res := 'pagamento de fatura ' || f.status;
    end if;
  elsif p_evento = 'PAYMENT_OVERDUE' then
    if f.status = 'aberta' then
      update public.faturas set status = 'vencida', atualizado_em = now() where id = f.id;
      v_res := 'vencida';
    end if;
  elsif p_evento = 'PAYMENT_REFUNDED' then
    if f.status = 'paga' then
      update public.faturas set status = 'estornada', atualizado_em = now() where id = f.id;
      perform public.cobranca_avisar_plataforma(f.org_id,
        'fatura de ' || to_char(f.competencia, 'MM/YYYY') || ' estornada no Asaas (não é mais cobrada).');
      v_res := 'estornada';
    end if;
  elsif p_evento = 'PAYMENT_RECEIVED_IN_CASH_UNDONE' then
    -- Recebimento em dinheiro marcado por engano no painel do Asaas e desfeito: volta a dever, e o atraso conta de novo.
    if f.status = 'paga' then
      update public.faturas
         set status = case when f.vencimento < v_hoje then 'vencida' else 'aberta' end, paga_em = null,
             aviso_atraso_em = null, suspensao_em = null, atualizado_em = now()
       where id = f.id;
      perform public.cobranca_avisar_plataforma(f.org_id,
        'pagamento da fatura de ' || to_char(f.competencia, 'MM/YYYY') || ' desfeito no Asaas: voltou a dever.');
      v_res := 'pagamento desfeito';
    end if;
  elsif p_evento = 'PAYMENT_DELETED' then
    if f.status in ('aberta', 'vencida', 'a_cancelar') then
      update public.faturas set status = 'cancelada', atualizado_em = now() where id = f.id;
      v_res := 'cancelada';
    end if;
  elsif p_evento = 'PAYMENT_RESTORED' then
    if f.status = 'cancelada' then
      begin
        update public.faturas
           set status = case when f.vencimento < v_hoje then 'vencida' else 'aberta' end,
               aviso_atraso_em = null, suspensao_em = null, atualizado_em = now()
         where id = f.id;
        v_res := 'restaurada';
      exception when unique_violation then
        perform public.cobranca_avisar_plataforma(f.org_id,
          'cobrança da fatura de ' || to_char(f.competencia, 'MM/YYYY')
          || ' restaurada no Asaas, mas o mês já tem outra fatura na Livih. Apague uma das duas no Asaas.');
        v_res := 'não restaurada: o mês já tem outra fatura';
      end;
    end if;
  elsif p_evento = 'PAYMENT_UPDATED' then
    -- Vencimento mudado no painel do Asaas (prazo combinado com o cliente): conta o atraso de novo a partir dele.
    if f.status in ('aberta', 'vencida') and v_venc is not null and v_venc <> f.vencimento then
      update public.faturas
         set vencimento = v_venc, status = case when v_venc < v_hoje then 'vencida' else 'aberta' end,
             aviso_atraso_em = null, suspensao_em = null, atualizado_em = now()
       where id = f.id;
      perform public.cobranca_reativar(f.org_id);
      v_res := 'vencimento ' || to_char(v_venc, 'DD/MM/YYYY');
    end if;
  elsif p_evento = 'PAYMENT_CHARGEBACK_REQUESTED' then
    perform public.cobranca_avisar_plataforma(f.org_id,
      'contestou no cartão a fatura de ' || to_char(f.competencia, 'MM/YYYY') || '. Veja no painel do Asaas.');
    v_res := 'contestação avisada';
  end if;

  v_res := coalesce(v_res, 'sem mudança');
  update public.asaas_eventos set fatura_id = f.id, resultado = v_res where id = v_id;
  return v_res;
end $$;
revoke execute on function public.cobranca_evento_asaas(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.cobranca_evento_asaas(text, text, jsonb, text) to service_role;

-- ---------- atraso: aviso aos 3 dias e suspensão aos 10 ----------
-- A fatura ainda 'aberta' depois do vencimento (webhook perdido) passa a 'vencida' aqui. Se o cron ficar dias sem
-- rodar, a fatura que já passou dos 10 dias vai direto para a suspensão (com o aviso dela, não o de 3 dias).
create function public.cobranca_atrasos() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  f record;
  v_suspendeu boolean;
begin
  for f in
    select fa.id, fa.org_id, o.nome as org_nome, fa.competencia, fa.vencimento, fa.valor, fa.link
      from public.faturas fa join public.organizacoes o on o.id = fa.org_id
     where fa.status in ('aberta', 'vencida') and fa.ambiente = 'producao' and fa.aviso_atraso_em is null
       and fa.vencimento + 3 <= v_hoje and fa.vencimento + 10 > v_hoje
  loop
    update public.faturas set status = 'vencida', aviso_atraso_em = now(), atualizado_em = now() where id = f.id;
    perform public.cobranca_avisar(f.org_id, '⚠️', 'Fatura da Livih em atraso',
      'A fatura de ' || to_char(f.competencia, 'MM/YYYY') || ' da empresa ' || f.org_nome
      || ' (' || public.reais(f.valor) || ') venceu em ' || to_char(f.vencimento, 'DD/MM') || ' e ainda não foi paga. '
      -- A suspensão roda às 09:15 do 10º dia: o prazo seguro é o dia anterior.
      || 'Pague até ' || to_char(f.vencimento + 9, 'DD/MM') || ' para o acesso não ser suspenso. '
      || 'Pix e cartão compensam na hora; boleto leva até 3 dias úteis. '
      || 'A fatura também está em Configurações → Plano e consumo.',
      f.link, '/configuracoes/uso',
      'fatura de ' || to_char(f.competencia, 'MM/YYYY') || ' (' || public.reais(f.valor) || ') com 3 dias de atraso');
  end loop;

  for f in
    select fa.id, fa.org_id, o.nome as org_nome, fa.competencia, fa.vencimento, fa.valor, fa.link
      from public.faturas fa join public.organizacoes o on o.id = fa.org_id
     where fa.status in ('aberta', 'vencida') and fa.ambiente = 'producao' and fa.suspensao_em is null
       and fa.vencimento + 10 <= v_hoje
  loop
    update public.organizacoes set status = 'suspensa', motivo_suspensao = 'inadimplencia'
     where id = f.org_id and status = 'ativa';
    v_suspendeu := found;
    -- A marca vale só com a empresa suspensa por atraso. Suspensa pela plataforma (outro motivo), a fatura fica sem a
    -- marca e suspende por atraso no dia seguinte a uma reativação à mão.
    update public.faturas
       set status = 'vencida', aviso_atraso_em = coalesce(aviso_atraso_em, now()), atualizado_em = now(),
           suspensao_em = case when v_suspendeu or exists (select 1 from public.organizacoes
                                                             where id = f.org_id and motivo_suspensao = 'inadimplencia')
                               then now() end
     where id = f.id;
    if v_suspendeu then
      insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
      values (f.org_id, 'sistema', 'suspender_por_atraso', 'organizacoes', f.org_id::text,
              jsonb_build_object('status', 'ativa'),
              jsonb_build_object('status', 'suspensa', 'motivo', 'inadimplencia', 'fatura', f.id));
      perform public.cobranca_avisar(f.org_id, '⛔', 'Acesso à Livih suspenso',
        'A fatura de ' || to_char(f.competencia, 'MM/YYYY') || ' da empresa ' || f.org_nome
        || ' (' || public.reais(f.valor) || ') venceu em ' || to_char(f.vencimento, 'DD/MM') || '. '
        || 'Pague para voltar a usar: o acesso volta sozinho quando o pagamento é confirmado. '
        || 'Pix e cartão compensam na hora; boleto leva até 3 dias úteis. '
        -- Empresa suspensa: os webhooks de WhatsApp ignoram o que chega (canal só de empresa ativa).
        || 'Enquanto isso, o agente não responde, a equipe não consegue entrar na Livih e as mensagens que chegarem '
        || 'não entram nela. Nada foi apagado. Ao entrar na Livih, você vê a fatura e pode pagar por lá.',
        f.link, '/',
        'suspensa: fatura de ' || to_char(f.competencia, 'MM/YYYY') || ' (' || public.reais(f.valor) || ') com 10 dias de atraso');
    end if;
  end loop;

  delete from public.asaas_eventos where recebido_em < now() - interval '180 days';
end $$;
revoke execute on function public.cobranca_atrasos() from public, anon, authenticated;

-- 12:15 UTC = 09:15 em Brasília, depois do reenvio das 09:00.
select cron.schedule('livih-cobranca-atrasos', '15 12 * * *', 'select public.cobranca_atrasos()');
