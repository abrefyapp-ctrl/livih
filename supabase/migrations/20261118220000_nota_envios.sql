-- Mandar a NF-e ao cliente pelo WhatsApp e por e-mail (docs/balcao.md, entrega 2; decisões de 27/10).
--
-- No balcão, o vendedor marca antes de fechar para onde vai a nota; quando ela é autorizada e o DANFE está
-- guardado, a Livih manda sozinha (nfe-retorno, pelo _shared/envioNota.ts). Depois, "Enviar ao cliente" no bloco da
-- nota reenvia (Edge Function nota-enviar). Cada envio vira uma linha em nota_envios, com o resultado, para a tela
-- mostrar o que saiu e por que não saiu.
--
-- WhatsApp (decisões de 27/10): sai pelo número da empresa e fica na conversa, sem mexer nela (não passa a conversa
-- para a equipe nem tira do agente, como o aviso de pedido). Conversa: a mais recente do contato num número ativo;
-- sem conversa, abre uma no número compartilhado da empresa (o primeiro sem vendedor; senão, o primeiro ativo).
-- Número sem contato: cria o contato (origem 'balcao') e liga ao cliente da venda. Na API oficial, fora das 24 h,
-- só com modelo aprovado: aí não sai, e o motivo fica no envio (mandar pelo e-mail ou pelo número do celular).
-- E-mail: a Focus manda (POST /v2/nfe/{ref}/email), em segundo plano.
--
-- "Salvar no cadastro" (27/10): o e-mail corrigido vai para o cliente. O WhatsApp corrigido NÃO troca o telefone de
-- um contato (o telefone é a identidade dele no WhatsApp e das conversas): vira um contato ligado ao cliente.

create table public.nota_envios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  nota_id uuid not null references public.notas_fiscais (id) on delete cascade,
  canal text not null check (canal in ('whatsapp', 'email')),
  destino text not null check (length(destino) between 5 and 200),
  contato_id uuid references public.contatos (id) on delete set null,
  -- enviando: uma função pegou o envio (o gatilho da Focus e um reenvio na tela não mandam o mesmo duas vezes).
  situacao text not null default 'pendente' check (situacao in ('pendente', 'enviando', 'enviado', 'erro')),
  resultado text check (length(resultado) <= 500),
  mensagem_id uuid,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index nota_envios_nota_idx on public.nota_envios (nota_id, criado_em desc);
create index nota_envios_pendentes_idx on public.nota_envios (nota_id) where situacao = 'pendente';
comment on table public.nota_envios is 'Envio da NF-e ao cliente (WhatsApp ou e-mail) e o resultado; grava pela nota-enviar e nfe-retorno';
alter table public.nota_envios enable row level security;
-- Quem vê a nota vê os envios dela (a política de notas_fiscais vale dentro do exists). Gravação só com a chave de serviço.
create policy nota_envios_ver on public.nota_envios for select to authenticated
  using (exists (select 1 from public.notas_fiscais n where n.id = nota_envios.nota_id));
grant select on public.nota_envios to authenticated;

-- Para a tela: os WhatsApps e o e-mail do cliente, o contato que conversou por último primeiro. Quem vê o cliente
-- (equipe ou balcão) vê; o usuário do balcão não lê contatos direto, então vem por aqui.
create function public.nota_destinos(p_cliente uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c public.clientes;
begin
  select * into c from public.clientes where id = p_cliente;
  if c.id is null or not (public.pode_ver_cliente(c.id) or public.eh_balcao(c.org_id)) then
    raise exception 'cliente não encontrado';
  end if;
  return jsonb_build_object(
    'email', c.email,
    'telefone', c.telefone,
    'contatos', (select coalesce(jsonb_agg(jsonb_build_object('id', ct.id, 'nome', coalesce(nullif(btrim(ct.nome), ''), ct.nome_whatsapp),
                                                              'telefone', ct.telefone, 'email', ct.email)
                                           order by ult.em desc nulls last, ct.criado_em desc), '[]')
                   from public.contatos ct
                   left join lateral (select max(v.ultima_mensagem_em) as em from public.conversas v where v.contato_id = ct.id) ult on true
                  where ct.org_id = c.org_id
                    and (ct.id in (select cc.contato_id from public.contatos_clientes cc where cc.cliente_id = c.id)))
  );
end $$;
revoke execute on function public.nota_destinos(uuid) from public, anon;
grant execute on function public.nota_destinos(uuid) to authenticated;

-- Prepara o envio pelo WhatsApp (chamada pela Edge Function, com a chave de serviço): acha ou cria o contato e a
-- conversa e confere se dá para mandar. Devolve {ok, conversa_id} ou {ok: false, motivo}.
create function public.nota_whatsapp_preparar(p_envio uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.nota_envios;
  n public.notas_fiscais;
  v_cliente uuid;
  v_ct public.contatos;
  v_conv public.conversas;
  v_canal public.canais;
  v_entrada timestamptz;
  v_motivo text;
begin
  select * into e from public.nota_envios where id = p_envio and canal = 'whatsapp' for update;
  if e.id is null then
    raise exception 'envio não encontrado';
  end if;
  select * into n from public.notas_fiscais where id = e.nota_id;
  select p.cliente_id into v_cliente from public.pedidos p where p.id = n.pedido_id;
  if (select status from public.organizacoes where id = e.org_id) <> 'ativa' then
    return jsonb_build_object('ok', false, 'motivo', 'a empresa não está ativa');
  end if;

  if e.contato_id is not null then
    select * into v_ct from public.contatos where id = e.contato_id and org_id = e.org_id;
  end if;
  if v_ct.id is null then
    select * into v_ct from public.contatos where org_id = e.org_id and telefone = e.destino;
  end if;
  if v_ct.id is null then
    insert into public.contatos (org_id, telefone, nome, origem)
    values (e.org_id, e.destino, (select left(coalesce(nullif(btrim(cl.nome), ''), cl.razao_social), 120) from public.clientes cl where cl.id = v_cliente), 'balcao')
    returning * into v_ct;
  end if;
  if v_cliente is not null then
    insert into public.contatos_clientes (org_id, contato_id, cliente_id, criado_por)
    values (e.org_id, v_ct.id, v_cliente, e.criado_por) on conflict do nothing;
  end if;
  update public.nota_envios set contato_id = v_ct.id where id = e.id;

  if v_ct.descadastrado_em is not null then
    return jsonb_build_object('ok', false, 'motivo', 'o cliente pediu para não receber mensagens neste WhatsApp');
  end if;

  select c.* into v_conv from public.conversas c join public.canais k on k.id = c.canal_id and k.ativo
   where c.contato_id = v_ct.id order by c.ultima_mensagem_em desc nulls last limit 1;
  if v_conv.id is null then
    select * into v_canal from public.canais where org_id = e.org_id and ativo
     order by (responsavel_id is null) desc, criado_em limit 1;
    if v_canal.id is null then
      return jsonb_build_object('ok', false, 'motivo', 'a empresa não tem número de WhatsApp conectado');
    end if;
    insert into public.conversas (org_id, canal_id, contato_id) values (e.org_id, v_canal.id, v_ct.id)
    on conflict (canal_id, contato_id) do update set canal_id = excluded.canal_id
    returning * into v_conv;
  end if;
  select * into v_canal from public.canais where id = v_conv.canal_id;

  if v_canal.tipo = 'waha' and v_canal.status_conexao is distinct from 'WORKING' then
    v_motivo := 'o número de WhatsApp da empresa está desconectado';
  elsif v_canal.tipo = 'meta' then
    select max(criado_em) into v_entrada from public.mensagens
     where conversa_id = v_conv.id and direcao = 'entrada' and not automatica;
    if v_entrada is null or v_entrada < now() - interval '23 hours 30 minutes' then
      v_motivo := 'na API oficial, fora das 24 horas da última mensagem do cliente, só sai com modelo aprovado: mande por e-mail';
    end if;
  end if;
  if v_motivo is not null then
    return jsonb_build_object('ok', false, 'motivo', v_motivo);
  end if;
  return jsonb_build_object('ok', true, 'conversa_id', v_conv.id, 'org_id', e.org_id);
end $$;
revoke execute on function public.nota_whatsapp_preparar(uuid) from public, anon, authenticated;
grant execute on function public.nota_whatsapp_preparar(uuid) to service_role;

-- Põe o DANFE (já copiado para midias/<org>/<conversa>/) na fila da conversa e marca o envio.
create function public.nota_whatsapp_enfileirar(p_envio uuid, p_conversa uuid, p_path text, p_nome text, p_legenda text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  e public.nota_envios;
  v_msg uuid;
begin
  select * into e from public.nota_envios where id = p_envio for update;
  if e.id is null or e.situacao = 'enviado' then
    raise exception 'envio não encontrado ou já feito';
  end if;
  if coalesce(p_path, '') not like e.org_id::text || '/' || p_conversa::text || '/%' then
    raise exception 'arquivo fora da conversa';
  end if;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, autor_id, tipo, texto, midia_path, midia_mime, midia_nome, status_entrega)
  values (e.org_id, p_conversa, 'saida', 'atendente', e.criado_por, 'documento', nullif(btrim(p_legenda), ''), p_path, 'application/pdf',
          left(coalesce(nullif(btrim(p_nome), ''), 'nota-fiscal.pdf'), 200), 'pendente')
  returning id into v_msg;
  insert into public.fila_envio (org_id, conversa_id, mensagem_id) values (e.org_id, p_conversa, v_msg);
  update public.conversas set ultima_mensagem_em = now(), ultima_mensagem_resumo = left('📎 ' || coalesce(nullif(btrim(p_legenda), ''), p_nome), 140)
   where id = p_conversa;
  update public.nota_envios set situacao = 'enviado', mensagem_id = v_msg, enviado_em = now(),
         resultado = 'Na fila do WhatsApp'
   where id = e.id;
  return v_msg;
end $$;
revoke execute on function public.nota_whatsapp_enfileirar(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.nota_whatsapp_enfileirar(uuid, uuid, text, text, text) to service_role;
