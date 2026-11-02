-- Planos e franquia de atendimentos do agente (docs/planos-modulos.md, decisões de 29/10 e 01/11; passos 2 e 5).
--
-- Sem a contagem, "350 atendimentos por mês" é uma promessa que ninguém confere. Aqui:
--   - catálogo `planos` (Essencial, Start, Pro, Business e o 'interno', sem limite, de quem ainda não tem plano);
--     `organizacoes.plano` já existia (sempre 'interno') e passa a apontar para ele;
--   - ATENDIMENTO de 24 h: começa quando o agente manda mensagem numa conversa sem atendimento iniciado nas últimas
--     24 h; o que ele mandar nas 24 h seguintes é o mesmo atendimento. Contado por gatilho em toda mensagem do agente
--     (texto, arquivo, documento), na hora em que é gravada: o `uso_ia` chega minutos depois, pelo coletor da VPS, e
--     não serve para parar o agente a tempo. O simulador não grava em `mensagens` e não conta;
--   - limite do mês = franquia do plano + créditos do mês (pacotes comprados pelo dono e cortesias da plataforma);
--   - ao passar do limite, vale a escolha do dono (`ao_passar_franquia`): 'parar' (padrão: sem cobrança surpresa)
--     faz o agente_deve_responder passar a conversa para a equipe, como o agente desligado, com aviso à equipe;
--     'continuar' deixa o agente seguir e marca o atendimento como excedente, cobrado na fatura seguinte. Atendimento
--     já começado segue até fechar as 24 h, mesmo depois do limite: já foi contado;
--   - aviso aos 80 % e aos 100 % (uma vez por limite no mês: comprar pacote faz valer de novo) ao dono e aos
--     administradores (celular e WhatsApp, como os lembretes da agenda) e à equipe da plataforma (celular).
-- O pacote vale no mês da compra e entra na mensalidade seguinte (a cobrança é o passo 6, ainda por fazer).
-- Escolha e compra são do dono (mexem no que a empresa paga); administradores veem o consumo. O consumo do mês
-- conta desde o dia 1, também no plano 'interno': trocar de plano no meio do mês já leva em conta o que foi usado.
-- Caso aceito: se o limite acaba enquanto o agente pensa, a resposta dele ainda sai (a "despedida" do
-- agente_responder) e conta um atendimento além do limite, sem cobrança.

-- ---------- catálogo ----------
create table public.planos (
  codigo               text primary key check (codigo ~ '^[a-z_]+$'),
  nome                 text not null,
  preco_mensal         numeric(10, 2),
  preco_anual          numeric(10, 2),
  numeros_whatsapp     integer,
  atendimentos         integer check (atendimentos >= 0),
  excedente_preco      numeric(10, 2) not null default 0.40,
  pacote_atendimentos  integer not null default 100 check (pacote_atendimentos > 0),
  pacote_preco         numeric(10, 2) not null default 29.90,
  ordem                integer not null default 0
);
comment on table public.planos is 'Planos do núcleo (docs/planos-modulos.md). atendimentos nulo = sem franquia (plano interno).';
alter table public.planos enable row level security;
create policy planos_ver on public.planos for select to authenticated using (true);
revoke insert, update, delete, truncate on public.planos from anon, authenticated;
grant select on public.planos to authenticated;

insert into public.planos (codigo, nome, preco_mensal, preco_anual, numeros_whatsapp, atendimentos, ordem) values
  ('interno', 'Sem plano definido', null, null, null, null, 0),
  ('essencial', 'Essencial', 49.90, 499, 1, 150, 1),
  ('start', 'Start', 99.90, 999, 2, 350, 2),
  ('pro', 'Pro', 149.90, 1499, 3, 500, 3),
  ('business', 'Business', 199.90, 1999, 5, 800, 4);

alter table public.organizacoes
  add constraint organizacoes_plano_fkey foreign key (plano) references public.planos (codigo),
  add column ao_passar_franquia text not null default 'parar' check (ao_passar_franquia in ('parar', 'continuar'));
comment on column public.organizacoes.ao_passar_franquia is
  'O que acontece quando acabam os atendimentos do mês: parar o agente (a equipe atende) ou continuar pagando o excedente.';

-- ---------- atendimentos e créditos ----------
create table public.atendimentos_agente (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizacoes (id) on delete cascade,
  conversa_id  uuid references public.conversas (id) on delete set null,
  mes          date not null,
  iniciado_em  timestamptz not null default now(),
  excedente    boolean not null default false
);
comment on table public.atendimentos_agente is 'Um atendimento de 24 h do agente por linha (franquia do plano). mes = mês do início, em Brasília.';
comment on column public.atendimentos_agente.excedente is 'Passou do limite com a escolha "continuar": entra na fatura seguinte.';
create index atendimentos_agente_org_mes_idx on public.atendimentos_agente (org_id, mes);
create index atendimentos_agente_conversa_idx on public.atendimentos_agente (conversa_id, iniciado_em desc);
alter table public.atendimentos_agente enable row level security;
create policy atendimentos_agente_ver on public.atendimentos_agente for select to authenticated
  using (public.tem_papel(org_id, '{dono,admin}'));
revoke insert, update, delete on public.atendimentos_agente from anon, authenticated;

create table public.creditos_atendimentos (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizacoes (id) on delete cascade,
  mes         date not null,
  tipo        text not null check (tipo in ('pacote', 'cortesia')),
  quantidade  integer not null check (quantidade > 0),
  valor       numeric(10, 2),
  motivo      text,
  criado_por  uuid references auth.users (id) on delete set null,
  criado_em   timestamptz not null default now()
);
comment on table public.creditos_atendimentos is
  'Atendimentos a mais no mês: pacote comprado pelo dono (valor entra na mensalidade seguinte) ou cortesia da plataforma.';
create index creditos_atendimentos_org_mes_idx on public.creditos_atendimentos (org_id, mes);
alter table public.creditos_atendimentos enable row level security;
create policy creditos_atendimentos_ver on public.creditos_atendimentos for select to authenticated
  using (public.tem_papel(org_id, '{dono,admin}'));
revoke insert, update, delete on public.creditos_atendimentos from anon, authenticated;

-- Avisos de 80 % e 100 % já mandados (um por limite no mês: com pacote novo, o limite muda e o aviso volta a valer).
create table public.avisos_franquia (
  org_id     uuid not null references public.organizacoes (id) on delete cascade,
  mes        date not null,
  nivel      integer not null check (nivel in (80, 100)),
  limite     integer not null,
  enviado_em timestamptz not null default now(),
  primary key (org_id, mes, nivel, limite)
);
alter table public.avisos_franquia enable row level security;  -- sem policy: só as funções
revoke all on public.avisos_franquia from anon, authenticated;

-- ---------- regra única do consumo ----------
create function public.mes_brasilia() returns date
language sql stable set search_path = '' as $$
  select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Franquia, créditos, limite e uso do mês corrente. Sem conferência de papel: só para as funções abaixo.
create function public.franquia_do_mes(p_org uuid)
returns table (plano text, plano_nome text, franquia integer, creditos integer, limite integer, usados integer,
               excedentes integer, escolha text)
language sql stable security definer set search_path = '' as $$
  select o.plano, p.nome, p.atendimentos, cr.total,
         case when p.atendimentos is not null then p.atendimentos + cr.total end,
         us.total, us.excedentes, o.ao_passar_franquia
    from public.organizacoes o
    join public.planos p on p.codigo = o.plano
    cross join lateral (select coalesce(sum(c.quantidade), 0)::integer as total
                          from public.creditos_atendimentos c
                         where c.org_id = o.id and c.mes = public.mes_brasilia()) cr
    cross join lateral (select count(*)::integer as total, (count(*) filter (where a.excedente))::integer as excedentes
                          from public.atendimentos_agente a
                         where a.org_id = o.id and a.mes = public.mes_brasilia()) us
   where o.id = p_org;
$$;
revoke execute on function public.mes_brasilia(), public.franquia_do_mes(uuid) from public, anon, authenticated;

-- ---------- avisos ----------
create function public.avisar_franquia(p_org uuid) returns void
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
    v_corpo := 'Vocês usaram ' || f.usados || ' de ' || f.limite || ' atendimentos do agente este mês. '
      || case f.escolha when 'parar' then 'No limite, o agente para e a equipe atende.'
                        else 'No limite, o agente continua e cada atendimento a mais entra na próxima fatura.' end;
  else
    v_titulo := case f.escolha when 'parar' then 'Os atendimentos do agente acabaram'
                               else 'Atendimentos do agente: franquia do mês usada' end;
    v_corpo := 'Vocês usaram os ' || f.limite || ' atendimentos do agente deste mês. '
      || case f.escolha when 'parar' then 'O agente parou de começar atendimentos novos e as conversas vão para a equipe.'
                        else 'O agente continua, e cada atendimento a mais entra na próxima fatura.' end;
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
         left(f.usados || ' de ' || f.limite || ' atendimentos · escolha: ' || f.escolha, 180), '/empresas'
    from public.admins_plataforma ap
   where exists (select 1 from public.push_inscricoes i where i.user_id = ap.user_id);
end $$;
revoke execute on function public.avisar_franquia(uuid) from public, anon, authenticated;

-- ---------- contagem: toda mensagem do agente ----------
create function public.contar_atendimento_agente() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  f record;
begin
  -- Duas mensagens do agente ao mesmo tempo na mesma conversa contam um atendimento só.
  perform pg_advisory_xact_lock(hashtextextended('livih-atendimento:' || new.conversa_id::text, 0));
  if exists (select 1 from public.atendimentos_agente a
              where a.conversa_id = new.conversa_id and a.iniciado_em > now() - interval '24 hours') then
    return null;
  end if;
  -- Atendimento novo (raro): trava por empresa, para dois começando juntos no limite não escaparem do excedente.
  perform pg_advisory_xact_lock(hashtextextended('livih-franquia:' || new.org_id::text, 0));
  select * into f from public.franquia_do_mes(new.org_id);
  insert into public.atendimentos_agente (org_id, conversa_id, mes, excedente)
  values (new.org_id, new.conversa_id, public.mes_brasilia(),
          f.limite is not null and f.usados >= f.limite and f.escolha = 'continuar');
  -- O aviso não pode derrubar a resposta ao cliente: se falhar, a mensagem sai e o aviso fica para o próximo.
  begin
    perform public.avisar_franquia(new.org_id);
  exception when others then
    raise warning 'livih: aviso de franquia falhou (%): %', new.org_id, sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.contar_atendimento_agente() from public, anon, authenticated;

create trigger mensagens_contar_atendimento after insert on public.mensagens
for each row when (new.autor_tipo = 'bot' and new.direcao = 'saida' and new.conversa_id is not null)
execute function public.contar_atendimento_agente();

-- ---------- o agente para no limite (escolha "parar") ----------
-- Verdadeiro quando a próxima resposta começaria um atendimento novo e o limite do mês já foi usado.
create function public.agente_franquia_esgotada(p_conversa uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  f record;
begin
  if exists (select 1 from public.atendimentos_agente a
              where a.conversa_id = p_conversa and a.iniciado_em > now() - interval '24 hours') then
    return false;
  end if;
  select fm.* into f from public.conversas c, public.franquia_do_mes(c.org_id) fm where c.id = p_conversa;
  return f.limite is not null and f.usados >= f.limite and f.escolha = 'parar';
end $$;
revoke execute on function public.agente_franquia_esgotada(uuid) from public, anon, authenticated;
grant execute on function public.agente_franquia_esgotada(uuid) to service_role;

-- Última versão em 20261009140000_contato_sem_agente.sql, mais a franquia antes da trava de robô.
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
      'Os atendimentos do agente deste mês acabaram e esta conversa ficou com a equipe. O agente volta a atender '
      || 'conversas novas quando o mês virar ou o dono comprar um pacote.'
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

-- ---------- tela da empresa (Configurações → Plano e consumo) ----------
create function public.plano_consumo(p_org uuid)
returns table (plano text, plano_nome text, preco_mensal numeric, numeros_whatsapp integer, franquia integer,
               creditos integer, limite integer, usados integer, excedentes integer, escolha text,
               excedente_preco numeric, pacote_atendimentos integer, pacote_preco numeric, pacotes_mes integer,
               valor_pacotes_mes numeric, mes date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'Só o dono e os administradores da empresa veem o plano.';
  end if;
  return query
  select f.plano, f.plano_nome, p.preco_mensal, p.numeros_whatsapp, f.franquia, f.creditos, f.limite, f.usados,
         f.excedentes, f.escolha, p.excedente_preco, p.pacote_atendimentos, p.pacote_preco,
         (select count(*)::integer from public.creditos_atendimentos c
           where c.org_id = p_org and c.mes = public.mes_brasilia() and c.tipo = 'pacote'),
         (select coalesce(sum(c.valor), 0) from public.creditos_atendimentos c
           where c.org_id = p_org and c.mes = public.mes_brasilia() and c.tipo = 'pacote'),
         public.mes_brasilia()
    from public.franquia_do_mes(p_org) f
    join public.planos p on p.codigo = f.plano;
end $$;
revoke execute on function public.plano_consumo(uuid) from public, anon;
grant execute on function public.plano_consumo(uuid) to authenticated;

create function public.plano_definir_escolha(p_org uuid, p_escolha text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes text;
begin
  if not public.tem_papel(p_org, '{dono}') then
    raise exception 'Só o dono da empresa escolhe o que acontece ao passar dos atendimentos do mês.';
  end if;
  if p_escolha not in ('parar', 'continuar') then
    raise exception 'Escolha parar ou continuar.';
  end if;
  select ao_passar_franquia into v_antes from public.organizacoes where id = p_org for update;
  if v_antes is distinct from p_escolha then
    update public.organizacoes set ao_passar_franquia = p_escolha where id = p_org;
    insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'atendente', auth.uid(), 'definir_escolha_franquia', 'organizacoes', p_org::text,
            jsonb_build_object('ao_passar_franquia', v_antes), jsonb_build_object('ao_passar_franquia', p_escolha));
  end if;
end $$;
revoke execute on function public.plano_definir_escolha(uuid, text) from public, anon;
grant execute on function public.plano_definir_escolha(uuid, text) to authenticated;

-- Compra de pacote pelo dono: vale no mês e entra na mensalidade seguinte. Devolve o novo limite.
-- Só o dono de fato (a equipe da plataforma dá cortesia, não compra em nome do cliente). p_limite_atual é o limite
-- que a tela mostrou: se já mudou (clique duplo, nova tentativa da rede), a segunda compra é recusada.
create function public.plano_comprar_pacote(p_org uuid, p_limite_atual integer)
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
    raise exception 'A empresa ainda não tem plano com franquia. Fale com a equipe da Livih.';
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
revoke execute on function public.plano_comprar_pacote(uuid, integer) from public, anon;
grant execute on function public.plano_comprar_pacote(uuid, integer) to authenticated;

-- ---------- plataforma (tela Empresas) ----------
create function public.plataforma_planos_consumo()
returns table (org_id uuid, plano text, plano_nome text, limite integer, usados integer, excedentes integer,
               creditos integer, escolha text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_admin_plataforma() then
    raise exception 'só a equipe da plataforma';
  end if;
  return query
  select o.id, f.plano, f.plano_nome, f.limite, f.usados, f.excedentes, f.creditos, f.escolha
    from public.organizacoes o, public.franquia_do_mes(o.id) f;
end $$;
revoke execute on function public.plataforma_planos_consumo() from public, anon;
grant execute on function public.plataforma_planos_consumo() to authenticated;

create function public.plataforma_definir_plano(p_org uuid, p_plano text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes text;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'só a equipe da plataforma';
  end if;
  if not exists (select 1 from public.planos where codigo = p_plano) then
    raise exception 'plano inexistente';
  end if;
  select plano into v_antes from public.organizacoes where id = p_org for update;
  if not found then
    raise exception 'empresa inexistente';
  end if;
  if v_antes is distinct from p_plano then
    update public.organizacoes set plano = p_plano where id = p_org;
    insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'atendente', auth.uid(), 'definir_plano', 'organizacoes', p_org::text,
            jsonb_build_object('plano', v_antes), jsonb_build_object('plano', p_plano));
    -- O consumo do mês conta desde o dia 1, mesmo no plano anterior: com a troca, o dono já recebe os avisos.
    perform public.avisar_franquia(p_org);
  end if;
end $$;
revoke execute on function public.plataforma_definir_plano(uuid, text) from public, anon;
grant execute on function public.plataforma_definir_plano(uuid, text) to authenticated;

create function public.plataforma_dar_cortesia(p_org uuid, p_quantidade integer, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin_plataforma() then
    raise exception 'só a equipe da plataforma';
  end if;
  if coalesce(p_quantidade, 0) < 1 or p_quantidade > 10000 then
    raise exception 'Informe de 1 a 10.000 atendimentos.';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Informe o motivo da cortesia.';
  end if;
  if not exists (select 1 from public.organizacoes where id = p_org) then
    raise exception 'empresa inexistente';
  end if;
  insert into public.creditos_atendimentos (org_id, mes, tipo, quantidade, motivo, criado_por)
  values (p_org, public.mes_brasilia(), 'cortesia', p_quantidade, left(btrim(p_motivo), 300), auth.uid());
end $$;
revoke execute on function public.plataforma_dar_cortesia(uuid, integer, text) from public, anon;
grant execute on function public.plataforma_dar_cortesia(uuid, integer, text) to authenticated;
