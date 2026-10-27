-- Campanhas: divulgação para os contatos pela API oficial do WhatsApp (docs/campanhas.md, pedido de 26/10).
--
-- Só número da API oficial: disparo em massa por número do celular (QR code) é o que mais leva a banimento. Fora
-- da janela de 24 h a Meta só entrega modelo aprovado; a campanha usa um modelo de Marketing, cobrado pela Meta
-- da própria empresa por mensagem entregue.
--
-- Como funciona: dono ou admin escolhe o público (filtros sobre os contatos), o número, o modelo e as variáveis,
-- confirma que os contatos autorizaram receber mensagens, e agenda. A lista de destinatários é tirada na hora
-- (não muda depois). O cron libera aos poucos (20 por minuto, até o limite por dia do número) para a fila de envio
-- de sempre: cada mensagem entra na conversa do contato naquele número (criada se não existir, com o agente).
-- Quem responde "SAIR" (e variações) sai de todas as campanhas da empresa.

-- ============================================================================
-- Descadastro
-- ============================================================================
alter table public.contatos add column descadastrado_em timestamptz;
comment on column public.contatos.descadastrado_em is
  'pediu para não receber campanhas (respondeu SAIR ou a equipe marcou); null = pode receber';

-- ============================================================================
-- Tabelas
-- ============================================================================
create table public.campanhas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 120),
  canal_id uuid not null,
  -- {nome, idioma, categoria, cabecalho, corpo, rodape, variaveis: [{fonte: 'nome'|'empresa'|'fixo', valor}]}
  modelo jsonb not null,
  -- {tags[], etapas[], responsaveis[], com_cliente, inativos_dias}
  filtros jsonb not null default '{}',
  status text not null default 'agendada'
    check (status in ('agendada', 'enviando', 'pausada', 'concluida', 'cancelada')),
  agendada_para timestamptz not null default now(),
  limite_dia integer not null default 250 check (limite_dia between 1 and 100000),
  criado_por uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  iniciada_em timestamptz,
  concluida_em timestamptz,
  unique (id, org_id),
  foreign key (canal_id, org_id) references public.canais (id, org_id) on delete cascade
);
create index campanhas_org_idx on public.campanhas (org_id, criado_em desc);
create index campanhas_ativas_idx on public.campanhas (status, agendada_para) where status in ('agendada', 'enviando');

create table public.campanha_destinatarios (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  campanha_id uuid not null,
  contato_id uuid not null references public.contatos (id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'pulado')),
  motivo text,
  conversa_id uuid references public.conversas (id) on delete set null,
  mensagem_id uuid references public.mensagens (id) on delete set null,
  enviado_em timestamptz,
  respondido_em timestamptz,
  unique (campanha_id, contato_id),
  foreign key (campanha_id, org_id) references public.campanhas (id, org_id) on delete cascade
);
create index campanha_dest_pendentes_idx on public.campanha_destinatarios (campanha_id, id) where status = 'pendente';
create index campanha_dest_conversa_idx on public.campanha_destinatarios (conversa_id) where status = 'enviado';
create index campanha_dest_envio_idx on public.campanha_destinatarios (enviado_em) where status = 'enviado';

-- Dono e admin veem; gravar, só pelas funções.
alter table public.campanhas enable row level security;
alter table public.campanha_destinatarios enable row level security;
create policy campanhas_ver on public.campanhas for select to authenticated
  using (public.tem_papel(org_id, '{dono,admin}'));
create policy campanha_destinatarios_ver on public.campanha_destinatarios for select to authenticated
  using (public.tem_papel(org_id, '{dono,admin}'));
grant select on public.campanhas, public.campanha_destinatarios to authenticated;

-- ============================================================================
-- Público
-- ============================================================================
-- Contatos que a campanha alcança com estes filtros: com telefone, sem descadastro. Filtros vazios = todos.
create function public.campanha_elegiveis(p_org uuid, p_filtros jsonb)
returns table (contato_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.id
    from public.contatos c
   where c.org_id = p_org
     and c.telefone ~ '^[0-9]{10,15}$'
     and c.descadastrado_em is null
     and (coalesce(jsonb_array_length(p_filtros -> 'tags'), 0) = 0
          or c.tags && array(select jsonb_array_elements_text(p_filtros -> 'tags')))
     and (coalesce(jsonb_array_length(p_filtros -> 'responsaveis'), 0) = 0
          or c.responsavel_id in (select (jsonb_array_elements_text(p_filtros -> 'responsaveis'))::uuid))
     and (coalesce(jsonb_array_length(p_filtros -> 'etapas'), 0) = 0
          or exists (select 1 from public.oportunidades o
                      where o.contato_id = c.id and o.fechada_em is null
                        and o.etapa_id in (select (jsonb_array_elements_text(p_filtros -> 'etapas'))::uuid)))
     and (p_filtros -> 'com_cliente' is null or jsonb_typeof(p_filtros -> 'com_cliente') <> 'boolean'
          or (c.cliente_id is not null) = (p_filtros ->> 'com_cliente')::boolean)
     and (nullif(p_filtros ->> 'inativos_dias', '') is null
          or not exists (select 1 from public.conversas v
                          where v.contato_id = c.id
                            and v.ultima_mensagem_em >= now() - make_interval(days => (p_filtros ->> 'inativos_dias')::int)));
$$;
revoke execute on function public.campanha_elegiveis(uuid, jsonb) from public, anon, authenticated;

-- Prévia para a tela: quantos e alguns nomes.
create function public.campanha_publico(p_org uuid, p_filtros jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin fazem campanhas';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.campanha_elegiveis(p_org, coalesce(p_filtros, '{}'))),
    'descadastrados', (select count(*) from public.contatos where org_id = p_org and descadastrado_em is not null),
    'amostra', coalesce((
      select jsonb_agg(coalesce(c.nome, c.nome_whatsapp, c.telefone) order by c.nome nulls last)
        from (select c.* from public.campanha_elegiveis(p_org, coalesce(p_filtros, '{}')) e
                join public.contatos c on c.id = e.contato_id
               order by c.nome nulls last limit 5) c), '[]'::jsonb));
end $$;

-- Etiquetas em uso, para o filtro.
create function public.campanha_etiquetas(p_org uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct t order by t), '{}')
    from public.contatos c, unnest(c.tags) t
   where c.org_id = p_org and public.tem_papel(p_org, '{dono,admin}') and btrim(t) <> '';
$$;

-- ============================================================================
-- Criar, pausar, retomar, cancelar
-- ============================================================================
-- p_dados: {nome, canal_id, modelo, filtros, agendada_para?, limite_dia?, consentimento: true}
create function public.campanha_criar(p_org uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_modelo jsonb := p_dados -> 'modelo';
  v_n integer;
  v_var jsonb;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin fazem campanhas';
  end if;
  if coalesce((p_dados ->> 'consentimento')::boolean, false) is not true then
    raise exception 'confirme que os contatos autorizaram receber mensagens da empresa';
  end if;
  if not exists (select 1 from public.canais where id = (p_dados ->> 'canal_id')::uuid and org_id = p_org and ativo and tipo = 'meta') then
    raise exception 'campanha só sai por número da API oficial';
  end if;
  if coalesce(v_modelo ->> 'nome', '') !~ '^[a-z0-9_]+$' or coalesce(v_modelo ->> 'idioma', '') !~ '^[a-z]{2}(_[A-Z]{2})?$'
     or coalesce(btrim(v_modelo ->> 'corpo'), '') = '' then
    raise exception 'modelo inválido';
  end if;
  -- Uma variável para cada {{n}} do corpo; fixa não pode ficar vazia (a Meta recusa parâmetro vazio).
  select count(distinct m[1]) into v_n from regexp_matches(v_modelo ->> 'corpo', '\{\{\s*(\d+)\s*\}\}', 'g') m;
  if jsonb_array_length(coalesce(v_modelo -> 'variaveis', '[]')) <> v_n then
    raise exception 'preencha todas as variáveis do modelo';
  end if;
  for v_var in select * from jsonb_array_elements(coalesce(v_modelo -> 'variaveis', '[]')) loop
    if v_var ->> 'fonte' not in ('nome', 'empresa', 'fixo')
       or (v_var ->> 'fonte' = 'fixo' and coalesce(btrim(v_var ->> 'valor'), '') = '') then
      raise exception 'preencha todas as variáveis do modelo';
    end if;
  end loop;

  insert into public.campanhas (org_id, nome, canal_id, modelo, filtros, agendada_para, limite_dia)
  values (p_org, left(btrim(coalesce(p_dados ->> 'nome', '')), 120), (p_dados ->> 'canal_id')::uuid, v_modelo,
          coalesce(p_dados -> 'filtros', '{}'), coalesce((p_dados ->> 'agendada_para')::timestamptz, now()),
          coalesce((p_dados ->> 'limite_dia')::integer, 250))
  returning id into v_id;
  insert into public.campanha_destinatarios (org_id, campanha_id, contato_id)
  select p_org, v_id, e.contato_id from public.campanha_elegiveis(p_org, coalesce(p_dados -> 'filtros', '{}')) e;
  if not found then
    raise exception 'nenhum contato com esses filtros';
  end if;
  return v_id;
end $$;

create function public.campanha_acao(p_campanha uuid, p_acao text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.campanhas;
begin
  select * into v from public.campanhas where id = p_campanha for update;
  if v.id is null or not public.tem_papel(v.org_id, '{dono,admin}') then
    raise exception 'campanha não encontrada';
  end if;
  if p_acao = 'pausar' and v.status in ('agendada', 'enviando') then
    update public.campanhas set status = 'pausada' where id = p_campanha;
  elsif p_acao = 'retomar' and v.status = 'pausada' then
    update public.campanhas set status = case when iniciada_em is null then 'agendada' else 'enviando' end where id = p_campanha;
  elsif p_acao = 'cancelar' and v.status in ('agendada', 'enviando', 'pausada') then
    update public.campanhas set status = 'cancelada', concluida_em = now() where id = p_campanha;
    update public.campanha_destinatarios set status = 'pulado', motivo = 'campanha cancelada'
     where campanha_id = p_campanha and status = 'pendente';
  else
    raise exception 'não dá para % uma campanha %', p_acao, v.status;
  end if;
end $$;

-- ============================================================================
-- Envio (cron, a cada minuto)
-- ============================================================================
-- Texto do modelo para um contato: o que o cliente lê e o que fica no histórico.
create function public.campanha_parametros(p_modelo jsonb, p_contato uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(
           left(case v ->> 'fonte'
             when 'nome' then coalesce(nullif(btrim(c.nome), ''), nullif(btrim(c.nome_whatsapp), ''), 'cliente')
             when 'empresa' then coalesce(nullif(btrim(cl.nome), ''), nullif(btrim(c.empresa), ''),
                                          nullif(btrim(c.nome), ''), nullif(btrim(c.nome_whatsapp), ''), 'cliente')
             else btrim(v ->> 'valor') end, 200) order by n), '{}')
    from jsonb_array_elements(coalesce(p_modelo -> 'variaveis', '[]')) with ordinality x(v, n)
    join public.contatos c on c.id = p_contato
    left join public.clientes cl on cl.id = c.cliente_id;
$$;

create function public.campanhas_liberar() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.campanhas;
  d record;
  v_hoje integer;
  v_vez integer;
  v_conversa uuid;
  v_msg uuid;
  v_params text[];
  v_texto text;
begin
  update public.campanhas set status = 'enviando', iniciada_em = coalesce(iniciada_em, now())
   where status = 'agendada' and agendada_para <= now();

  for v in select * from public.campanhas where status = 'enviando' order by agendada_para for update skip locked loop
    -- Número desligado ou fora da API oficial: pausa e a tela mostra.
    if not exists (select 1 from public.canais where id = v.canal_id and ativo and tipo = 'meta') then
      update public.campanhas set status = 'pausada' where id = v.id;
      continue;
    end if;
    -- Limite do dia (fuso de Brasília) por número, somando as campanhas dele.
    select count(*) into v_hoje from public.campanha_destinatarios d2 join public.campanhas c2 on c2.id = d2.campanha_id
     where c2.canal_id = v.canal_id and d2.status = 'enviado'
       and d2.enviado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
    v_vez := least(20, v.limite_dia - v_hoje);
    continue when v_vez <= 0;

    for d in select dd.id, dd.contato_id, c.descadastrado_em, c.telefone
               from public.campanha_destinatarios dd join public.contatos c on c.id = dd.contato_id
              where dd.campanha_id = v.id and dd.status = 'pendente'
              order by dd.id limit v_vez for update of dd skip locked loop
      if d.descadastrado_em is not null then
        update public.campanha_destinatarios set status = 'pulado', motivo = 'pediu para não receber' where id = d.id;
        continue;
      end if;
      select id into v_conversa from public.conversas where canal_id = v.canal_id and contato_id = d.contato_id;
      if v_conversa is null then
        insert into public.conversas (org_id, canal_id, contato_id) values (v.org_id, v.canal_id, d.contato_id)
        returning id into v_conversa;
      end if;
      v_params := public.campanha_parametros(v.modelo, d.contato_id);
      v_texto := concat_ws(E'\n\n',
        nullif('*' || nullif(btrim(v.modelo ->> 'cabecalho'), '') || '*', '**'),
        regexp_replace(v.modelo ->> 'corpo', '\{\{\s*(\d+)\s*\}\}', '§\1§', 'g'),
        nullif('_' || nullif(btrim(v.modelo ->> 'rodape'), '') || '_', '__'));
      for i in 1 .. coalesce(array_length(v_params, 1), 0) loop
        v_texto := replace(v_texto, '§' || i || '§', v_params[i]);
      end loop;
      insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, autor_id, tipo, texto, status_entrega, modelo)
      values (v.org_id, v_conversa, 'saida', 'atendente', v.criado_por, 'texto', v_texto, 'pendente',
              jsonb_build_object('nome', v.modelo ->> 'nome', 'idioma', v.modelo ->> 'idioma', 'parametros', to_jsonb(v_params),
                                 'campanha_id', v.id))
      returning id into v_msg;
      insert into public.fila_envio (org_id, conversa_id, mensagem_id) values (v.org_id, v_conversa, v_msg);
      update public.conversas set ultima_mensagem_em = now(), ultima_mensagem_resumo = left(v_texto, 140) where id = v_conversa;
      update public.campanha_destinatarios
         set status = 'enviado', conversa_id = v_conversa, mensagem_id = v_msg, enviado_em = now()
       where id = d.id;
    end loop;

    if not exists (select 1 from public.campanha_destinatarios where campanha_id = v.id and status = 'pendente') then
      update public.campanhas set status = 'concluida', concluida_em = now() where id = v.id;
    end if;
  end loop;
end $$;
revoke execute on function public.campanhas_liberar(), public.campanha_parametros(jsonb, uuid) from public, anon, authenticated;

select cron.schedule('livih-campanhas', '* * * * *', 'select public.campanhas_liberar()');

-- ============================================================================
-- Resposta e descadastro (mensagem recebida)
-- ============================================================================
create function public.campanha_mensagem_recebida() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_contato uuid;
begin
  if new.direcao <> 'entrada' then
    return null;
  end if;
  update public.campanha_destinatarios set respondido_em = new.criado_em
   where conversa_id = new.conversa_id and status = 'enviado' and respondido_em is null
     and enviado_em >= new.criado_em - interval '7 days' and enviado_em <= new.criado_em;
  -- "SAIR" sozinho (e variações) depois de uma campanha nos últimos 30 dias: não recebe mais.
  if public.sem_acento(btrim(regexp_replace(coalesce(new.texto, ''), '[^[:alpha:] ]', '', 'g')))
       in ('sair', 'parar', 'pare', 'stop', 'cancelar', 'descadastrar', 'nao quero receber', 'remover')
     and exists (select 1 from public.campanha_destinatarios
                  where conversa_id = new.conversa_id and status = 'enviado' and enviado_em >= now() - interval '30 days') then
    select contato_id into v_contato from public.conversas where id = new.conversa_id;
    update public.contatos set descadastrado_em = now() where id = v_contato and descadastrado_em is null;
    if found then
      perform public.aviso_sistema(new.conversa_id,
        'O contato pediu para não receber mais campanhas e saiu da lista. Para incluir de novo, edite o contato.');
    end if;
  end if;
  return null;
end $$;
create trigger campanha_mensagem_recebida after insert on public.mensagens
for each row execute function public.campanha_mensagem_recebida();

-- ============================================================================
-- Resultado
-- ============================================================================
-- Por campanha: destinatários, enviadas, entregues, lidas, com erro, respostas e orçamentos (pedido do contato até
-- 7 dias depois do envio).
create function public.campanhas_resumo(p_org uuid)
returns table (campanha_id uuid, total bigint, pendentes bigint, enviadas bigint, entregues bigint, lidas bigint,
               erros bigint, puladas bigint, respostas bigint, orcamentos bigint)
language sql stable security definer set search_path = '' as $$
  select d.campanha_id,
         count(*),
         count(*) filter (where d.status = 'pendente'),
         count(*) filter (where d.status = 'enviado'),
         count(*) filter (where m.status_entrega in ('entregue', 'lida')),
         count(*) filter (where m.status_entrega = 'lida'),
         count(*) filter (where m.status_entrega = 'erro'),
         count(*) filter (where d.status = 'pulado'),
         count(*) filter (where d.respondido_em is not null),
         count(*) filter (where d.status = 'enviado' and exists (
           select 1 from public.pedidos p where p.contato_id = d.contato_id
              and p.criado_em between d.enviado_em and d.enviado_em + interval '7 days'))
    from public.campanha_destinatarios d
    left join public.mensagens m on m.id = d.mensagem_id
   where d.org_id = p_org and public.tem_papel(p_org, '{dono,admin}')
   group by d.campanha_id;
$$;

revoke execute on function public.campanha_publico(uuid, jsonb), public.campanha_etiquetas(uuid),
  public.campanha_criar(uuid, jsonb), public.campanha_acao(uuid, text), public.campanhas_resumo(uuid) from public, anon;
grant execute on function public.campanha_publico(uuid, jsonb), public.campanha_etiquetas(uuid),
  public.campanha_criar(uuid, jsonb), public.campanha_acao(uuid, text), public.campanhas_resumo(uuid) to authenticated;
