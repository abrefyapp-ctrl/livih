-- Aviso de status do pedido ao cliente pelo WhatsApp (docs/levantamento-funcionalidades.md, ERP item 3; decisões de
-- 06/11). Estava no MVP do ERP e não tinha sido feito: o cliente perguntava no WhatsApp "e o meu pedido?".
--
-- Desligado por padrão: cada empresa liga em Configurações (dono e admin), para ninguém receber mensagem que a empresa
-- não esperava. Por padrão avisa em confirmado, enviado e entregue ("separando" fica de fora, para não mandar mensagem
-- demais), e a empresa escolhe as situações e edita o texto de cada uma ({nome} e {numero}).
--
-- Como sai, igual à retomada do agente: na conversa mais recente do cliente num número ativo; dentro das 24 h do
-- WhatsApp (ou no WAHA, a qualquer hora) vai o texto; fora das 24 h no número da API oficial vai o modelo aprovado que a
-- empresa escolheu (variáveis: nome, empresa, número do pedido, situação ou texto fixo). Sem modelo, sem conversa, sem
-- contato ou contato descadastrado: não sai, e o motivo fica registrado no pedido (pedido_avisos_envios).
--
-- Só avisa quando uma pessoa muda a situação (auth.uid() presente): o agente já conversa com o cliente quando ele
-- mesmo mexe no pedido. Um aviso por pedido e situação: voltar para rascunho e confirmar de novo não repete.

create table public.pedido_avisos (
  org_id uuid primary key references public.organizacoes (id) on delete cascade,
  ativo boolean not null default false,
  situacoes text[] not null default '{confirmado,enviado,entregue}'
    check (situacoes <@ '{confirmado,separando,enviado,entregue}'::text[]),
  -- Texto de cada situação; {nome} = primeiro nome do cliente, {numero} = número do pedido.
  textos jsonb not null default jsonb_build_object(
    'confirmado', 'Olá, {nome}! O seu pedido nº {numero} foi confirmado. Avisamos por aqui quando ele sair para entrega.',
    'separando', 'Olá, {nome}! Estamos separando o seu pedido nº {numero}.',
    'enviado', 'Olá, {nome}! O seu pedido nº {numero} saiu para entrega.',
    'entregue', 'Olá, {nome}! O seu pedido nº {numero} foi entregue. Obrigado pela compra! Qualquer dúvida, é só responder esta mensagem.'),
  -- Modelo da API oficial para fora das 24 h, no formato da retomada, com as fontes extras 'pedido' e 'situacao'.
  modelo jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);
comment on table public.pedido_avisos is 'Aviso ao cliente pelo WhatsApp quando o pedido muda de situação, por empresa';
alter table public.pedido_avisos enable row level security;
create policy pedido_avisos_ver on public.pedido_avisos for select to authenticated using (public.eh_membro(org_id));
grant select on public.pedido_avisos to authenticated;

-- O que aconteceu com cada aviso: a tela do pedido mostra se saiu ou por que não saiu.
create table public.pedido_avisos_envios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  status text not null,
  enviado boolean not null,
  modelo boolean not null default false,
  mensagem_id uuid references public.mensagens (id) on delete set null,
  conversa_id uuid references public.conversas (id) on delete set null,
  resultado text not null,
  criado_em timestamptz not null default now()
);
create index pedido_avisos_envios_pedido_idx on public.pedido_avisos_envios (pedido_id, criado_em);
comment on table public.pedido_avisos_envios is 'Avisos de situação do pedido: enviado ou o motivo de não ter saído';
alter table public.pedido_avisos_envios enable row level security;
-- Quem vê o pedido vê os avisos dele (a RLS de pedidos vale dentro da subconsulta).
create policy pedido_avisos_envios_ver on public.pedido_avisos_envios for select to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id));
grant select on public.pedido_avisos_envios to authenticated;

-- ============================================================================
-- Configuração (dono e admin)
-- ============================================================================
-- p_cfg: {ativo, situacoes, textos, modelo}.
create function public.pedido_avisos_salvar(p_org uuid, p_cfg jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_modelo jsonb := nullif(p_cfg -> 'modelo', 'null'::jsonb);
  v_situacoes text[];
  v_textos jsonb := coalesce(p_cfg -> 'textos', '{}');
  v_s text;
  v_n integer;
  v_var jsonb;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin mudam o aviso de pedidos';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_situacoes from jsonb_array_elements_text(coalesce(p_cfg -> 'situacoes', '[]')) x;
  if not v_situacoes <@ '{confirmado,separando,enviado,entregue}'::text[] then
    raise exception 'situação inválida';
  end if;
  if coalesce((p_cfg ->> 'ativo')::boolean, false) and cardinality(v_situacoes) = 0 then
    raise exception 'escolha ao menos uma situação para avisar';
  end if;
  foreach v_s in array v_situacoes loop
    if length(btrim(coalesce(v_textos ->> v_s, ''))) not between 1 and 1000 then
      raise exception 'escreva o texto de cada situação marcada (até 1.000 caracteres)';
    end if;
  end loop;
  -- Guarda só os textos das quatro situações.
  select coalesce(jsonb_object_agg(k, btrim(v)), '{}') into v_textos from jsonb_each_text(v_textos) as e(k, v)
   where k in ('confirmado', 'separando', 'enviado', 'entregue') and length(btrim(v)) between 1 and 1000;

  if v_modelo is not null then
    if coalesce(v_modelo ->> 'nome', '') !~ '^[a-z0-9_]+$' or coalesce(v_modelo ->> 'idioma', '') !~ '^[a-z]{2}(_[A-Z]{2})?$'
       or coalesce(btrim(v_modelo ->> 'corpo'), '') = '' then
      raise exception 'modelo inválido';
    end if;
    select count(distinct m[1]) into v_n from regexp_matches(v_modelo ->> 'corpo', '\{\{\s*(\d+)\s*\}\}', 'g') m;
    if jsonb_array_length(coalesce(v_modelo -> 'variaveis', '[]')) <> v_n then
      raise exception 'preencha todas as variáveis do modelo';
    end if;
    for v_var in select * from jsonb_array_elements(coalesce(v_modelo -> 'variaveis', '[]')) loop
      if coalesce(v_var ->> 'fonte', '') not in ('nome', 'empresa', 'fixo', 'pedido', 'situacao')
         or (v_var ->> 'fonte' = 'fixo' and coalesce(btrim(v_var ->> 'valor'), '') = '') then
        raise exception 'preencha todas as variáveis do modelo';
      end if;
    end loop;
  end if;

  insert into public.pedido_avisos (org_id, ativo, situacoes, textos, modelo, atualizado_em, atualizado_por)
  values (p_org, coalesce((p_cfg ->> 'ativo')::boolean, false), v_situacoes, v_textos, v_modelo, now(), auth.uid())
  on conflict (org_id) do update set
    ativo = excluded.ativo, situacoes = excluded.situacoes, textos = excluded.textos, modelo = excluded.modelo,
    atualizado_em = now(), atualizado_por = auth.uid();
  perform public.auditar(p_org, 'pedido_avisos_salvar', 'pedido_avisos', p_org::text, null,
                         jsonb_build_object('ativo', coalesce((p_cfg ->> 'ativo')::boolean, false), 'situacoes', v_situacoes));
end $$;
revoke execute on function public.pedido_avisos_salvar(uuid, jsonb) from public, anon;
grant execute on function public.pedido_avisos_salvar(uuid, jsonb) to authenticated;

-- ============================================================================
-- Envio
-- ============================================================================
-- Situação em palavras, para a variável 'situacao' do modelo.
create function public.pedido_situacao_texto(p_status text) returns text
language sql immutable set search_path = '' as $$
  select case p_status when 'confirmado' then 'confirmado' when 'separando' then 'em separação'
                       when 'enviado' then 'saiu para entrega' when 'entregue' then 'entregue' else p_status end;
$$;

create function public.pedido_avisar(p_pedido uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_p public.pedidos;
  v_cfg public.pedido_avisos;
  v_ct public.contatos;
  v_conv public.conversas;
  v_canal public.canais;
  v_motivo text;
  v_entrada timestamptz;
  v_nome text;
  v_texto text;
  v_modelo jsonb;
  v_params text[];
  v_msg uuid;
  v_usa_modelo boolean := false;
begin
  select * into v_p from public.pedidos where id = p_pedido;
  select * into v_cfg from public.pedido_avisos where org_id = v_p.org_id;
  if v_cfg.org_id is null or not v_cfg.ativo or not (p_status = any (v_cfg.situacoes)) then
    return;
  end if;
  -- Um aviso por pedido e situação.
  if exists (select 1 from public.pedido_avisos_envios where pedido_id = p_pedido and status = p_status and enviado) then
    return;
  end if;

  select * into v_ct from public.contatos where id = v_p.contato_id;
  if v_ct.id is not null then
    select c.* into v_conv from public.conversas c join public.canais k on k.id = c.canal_id and k.ativo
     where c.contato_id = v_ct.id
     order by c.ultima_mensagem_em desc nulls last
     limit 1;
    select * into v_canal from public.canais where id = v_conv.canal_id;
  end if;

  v_motivo := case
    when (select status from public.organizacoes where id = v_p.org_id) <> 'ativa' then 'a empresa não está ativa'
    when v_ct.id is null then 'o pedido não tem cliente com WhatsApp'
    when v_ct.descadastrado_em is not null then 'o cliente pediu para não receber mensagens'
    when v_conv.id is null then 'o cliente não tem conversa num número ativo'
    when v_canal.tipo = 'waha' and v_canal.status_conexao is distinct from 'WORKING' then 'o número de WhatsApp está desconectado'
  end;

  if v_motivo is null and v_canal.tipo = 'meta' then
    select max(criado_em) into v_entrada from public.mensagens
     where conversa_id = v_conv.id and direcao = 'entrada' and not automatica;
    v_usa_modelo := v_entrada is null or v_entrada < now() - interval '23 hours 30 minutes';
    if v_usa_modelo and v_cfg.modelo is null then
      v_motivo := 'passaram as 24 horas do WhatsApp e não há modelo de aviso configurado';
    end if;
  end if;

  if v_motivo is not null then
    insert into public.pedido_avisos_envios (org_id, pedido_id, status, enviado, conversa_id, resultado)
    values (v_p.org_id, p_pedido, p_status, false, v_conv.id, 'Não enviado: ' || v_motivo);
    return;
  end if;

  if v_usa_modelo then
    -- 'pedido' e 'situacao' viram texto fixo; o resto preenche como nas campanhas.
    select jsonb_set(v_cfg.modelo, '{variaveis}', coalesce(jsonb_agg(
             case v ->> 'fonte'
               when 'pedido' then jsonb_build_object('fonte', 'fixo', 'valor', v_p.numero::text)
               when 'situacao' then jsonb_build_object('fonte', 'fixo', 'valor', public.pedido_situacao_texto(p_status))
               else v end order by n), '[]'))
      into v_modelo
      from jsonb_array_elements(coalesce(v_cfg.modelo -> 'variaveis', '[]')) with ordinality x(v, n);
    v_params := public.campanha_parametros(v_modelo, v_ct.id);
    v_texto := concat_ws(E'\n\n',
      nullif('*' || nullif(btrim(v_modelo ->> 'cabecalho'), '') || '*', '**'),
      regexp_replace(v_modelo ->> 'corpo', '\{\{\s*(\d+)\s*\}\}', '§\1§', 'g'),
      nullif('_' || nullif(btrim(v_modelo ->> 'rodape'), '') || '_', '__'));
    for i in 1 .. coalesce(array_length(v_params, 1), 0) loop
      v_texto := replace(v_texto, '§' || i || '§', v_params[i]);
    end loop;
    insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, status_entrega, modelo)
    values (v_p.org_id, v_conv.id, 'saida', 'bot', 'texto', v_texto, 'pendente',
            jsonb_build_object('nome', v_modelo ->> 'nome', 'idioma', v_modelo ->> 'idioma', 'parametros', to_jsonb(v_params)))
    returning id into v_msg;
  else
    -- Sem nome conhecido, "Olá, {nome}!" vira "Olá!".
    v_nome := split_part(coalesce(nullif(btrim(v_ct.nome), ''), nullif(btrim(v_ct.nome_whatsapp), ''), ''), ' ', 1);
    v_texto := coalesce(v_cfg.textos ->> p_status, '');
    v_texto := case when v_nome = '' then regexp_replace(v_texto, ',? ?\{nome\}', '', 'gi')
                    else regexp_replace(v_texto, '\{nome\}', v_nome, 'gi') end;
    v_texto := regexp_replace(v_texto, '\{numero\}', v_p.numero::text, 'gi');
    insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, status_entrega)
    values (v_p.org_id, v_conv.id, 'saida', 'bot', 'texto', v_texto, 'pendente')
    returning id into v_msg;
  end if;

  insert into public.fila_envio (org_id, conversa_id, mensagem_id) values (v_p.org_id, v_conv.id, v_msg);
  update public.conversas set ultima_mensagem_em = now(), ultima_mensagem_resumo = left(v_texto, 140) where id = v_conv.id;
  insert into public.pedido_avisos_envios (org_id, pedido_id, status, enviado, modelo, mensagem_id, conversa_id, resultado)
  values (v_p.org_id, p_pedido, p_status, true, v_usa_modelo, v_msg, v_conv.id,
          case when v_usa_modelo then 'Enviado pelo modelo (fora das 24 horas)' else 'Enviado' end);
end $$;
revoke execute on function public.pedido_avisar(uuid, text), public.pedido_situacao_texto(text) from public, anon, authenticated;

-- Situação mudada por uma pessoa: avisa. Um erro no aviso não pode impedir a mudança do pedido.
create function public.pedidos_avisar_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    begin
      perform public.pedido_avisar(new.id, new.status);
    exception when others then
      insert into public.pedido_avisos_envios (org_id, pedido_id, status, enviado, resultado)
      values (new.org_id, new.id, new.status, false, left('Não enviado: erro inesperado (' || sqlerrm || ')', 500));
    end;
  end if;
  return null;
end $$;
revoke execute on function public.pedidos_avisar_cliente() from public, anon, authenticated;
create trigger pedidos_avisar_cliente after update of status on public.pedidos
for each row when (new.status is distinct from old.status and new.status in ('confirmado', 'separando', 'enviado', 'entregue'))
execute function public.pedidos_avisar_cliente();
