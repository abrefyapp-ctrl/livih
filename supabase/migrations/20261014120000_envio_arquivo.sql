-- Envio de arquivo pela conversa (imagem, vídeo, PDF, planilha…).
--
-- Fluxo: a tela sobe o arquivo no bucket privado `midias` (caminho org/conversa/uuid-nome) e chama
-- enviar_arquivo, que grava a mensagem e põe na fila. A Edge Function de envio gera uma URL assinada
-- e entrega pelo WAHA ou pela API oficial.
--
-- O arquivo faz parte do histórico: sem policy de UPDATE/DELETE no bucket, como nas mensagens.

alter table public.mensagens add column midia_nome text;
comment on column public.mensagens.midia_nome is 'nome original do arquivo (mostrado na tela e enviado como nome do documento)';

-- Arquivo também é conteúdo: path, tipo e nome não mudam depois de gravados.
create or replace function public.mensagens_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('livih.lgpd', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'mensagens não podem ser apagadas';
  end if;
  if (new.id, new.org_id, new.conversa_id, new.direcao, new.autor_tipo, new.autor_id, new.tipo,
      new.texto, new.midia_path, new.criado_em, new.modelo, new.midia_nome)
     is distinct from
     (old.id, old.org_id, old.conversa_id, old.direcao, old.autor_tipo, old.autor_id, old.tipo,
      old.texto, old.midia_path, old.criado_em, old.modelo, old.midia_nome) then
    raise exception 'o conteúdo de uma mensagem não pode ser alterado';
  end if;
  return new;
end $$;

-- 50 MB: limite do upload no Supabase. A Meta aceita documento até 100 MB, então não é ela que limita.
insert into storage.buckets (id, name, public, file_size_limit)
values ('midias', 'midias', false, 52428800)
on conflict (id) do nothing;

-- Quem pode ler/subir um arquivo: quem vê a conversa do caminho org/conversa/arquivo.
create function public.pode_acessar_midia(p_nome text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_partes text[] := string_to_array(p_nome, '/');
  v_conversa uuid;
begin
  if coalesce(array_length(v_partes, 1), 0) <> 3
     or v_partes[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_conversa := v_partes[2]::uuid;
  return exists (select 1 from public.conversas c where c.id = v_conversa and c.org_id::text = v_partes[1])
         and public.pode_ver_conversa(v_conversa);
end $$;

revoke execute on function public.pode_acessar_midia(text) from public, anon;
grant execute on function public.pode_acessar_midia(text) to authenticated;

create policy "midias: ler da conversa" on storage.objects for select to authenticated
  using (bucket_id = 'midias' and public.pode_acessar_midia(name));
create policy "midias: subir na conversa" on storage.objects for insert to authenticated
  with check (bucket_id = 'midias' and public.pode_acessar_midia(name));

-- Atendente envia um arquivo já subido. Mesma regra de enviar_mensagem: quem vê o número, e quem envia
-- assume a conversa. O tipo sai do arquivo guardado (não do que a tela diz): imagem e vídeo só nos
-- formatos e tamanhos que o WhatsApp mostra na conversa; o resto vai como documento.
create function public.enviar_arquivo(p_conversa uuid, p_path text, p_nome text, p_legenda text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conversa public.conversas;
  v_mime text;
  v_tamanho bigint;
  v_tipo public.tipo_msg;
  v_legenda text := nullif(btrim(coalesce(p_legenda, '')), '');
  v_nome text := left(btrim(coalesce(p_nome, '')), 200);
  v_msg uuid;
begin
  select * into v_conversa from public.conversas where id = p_conversa for update;
  if v_conversa.id is null or not public.pode_ver_canal(v_conversa.canal_id) then
    raise exception 'conversa não encontrada';
  end if;
  if coalesce(p_path, '') not like v_conversa.org_id::text || '/' || p_conversa::text || '/%' then
    raise exception 'arquivo não pertence a esta conversa';
  end if;
  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint into v_mime, v_tamanho
    from storage.objects o
   where o.bucket_id = 'midias' and o.name = p_path and o.owner_id = auth.uid()::text;
  if v_tamanho is null then
    raise exception 'arquivo não encontrado';
  end if;
  if exists (select 1 from public.mensagens where midia_path = p_path) then
    raise exception 'arquivo já enviado';
  end if;
  if v_nome = '' then
    v_nome := 'arquivo';
  end if;
  v_mime := coalesce(nullif(v_mime, ''), 'application/octet-stream');

  v_tipo := case
    when v_mime in ('image/jpeg', 'image/png') and v_tamanho <= 5242880 then 'imagem'
    when v_mime in ('video/mp4', 'video/3gpp') and v_tamanho <= 16777216 then 'video'
    else 'documento'
  end;

  if v_conversa.estado <> 'humano' or v_conversa.atribuida_a is null then
    update public.conversas
       set estado = 'humano', atribuida_a = coalesce(atribuida_a, auth.uid()), nao_lidas = 0
     where id = p_conversa;
  else
    update public.conversas set nao_lidas = 0 where id = p_conversa;
  end if;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, autor_id, tipo, texto,
                                midia_path, midia_mime, midia_nome, status_entrega)
  values (v_conversa.org_id, p_conversa, 'saida', 'atendente', auth.uid(), v_tipo, v_legenda,
          p_path, v_mime, v_nome, 'pendente')
  returning id into v_msg;
  insert into public.fila_envio (org_id, conversa_id, mensagem_id) values (v_conversa.org_id, p_conversa, v_msg);
  update public.conversas
     set ultima_mensagem_em = now(), ultima_mensagem_resumo = left('📎 ' || coalesce(v_legenda, v_nome), 140)
   where id = p_conversa;
  return v_msg;
end $$;

revoke execute on function public.enviar_arquivo(uuid, text, text, text) from public, anon;
grant execute on function public.enviar_arquivo(uuid, text, text, text) to authenticated;

-- A fila passa o arquivo para a função de envio.
drop function public.fila_reivindicar(integer);
create function public.fila_reivindicar(p_limite integer default 20)
returns table (fila_id bigint, mensagem_id uuid, canal_id uuid, canal_tipo text, instance_id text,
               telefone text, whatsapp_lid text, texto text, tentativas integer, modelo jsonb,
               tipo text, midia_path text, midia_mime text, midia_nome text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with lote as (
    select f.id from public.fila_envio f
     where f.status in ('pendente', 'erro') and f.proxima_tentativa_em <= now() and f.tentativas < 6
     order by f.proxima_tentativa_em
     limit p_limite
     for update skip locked
  ), marcados as (
    update public.fila_envio f set status = 'enviando', tentativas = f.tentativas + 1
      from lote where f.id = lote.id
    returning f.id, f.mensagem_id, f.conversa_id, f.tentativas
  )
  select m.id, m.mensagem_id, cv.canal_id, ca.tipo, ca.instance_id, ct.telefone, ct.whatsapp_lid,
         msg.texto, m.tentativas, msg.modelo, msg.tipo::text, msg.midia_path, msg.midia_mime, msg.midia_nome
    from marcados m
    join public.conversas cv on cv.id = m.conversa_id
    join public.canais ca on ca.id = cv.canal_id
    join public.contatos ct on ct.id = cv.contato_id
    join public.mensagens msg on msg.id = m.mensagem_id;
end $$;

revoke execute on function public.fila_reivindicar(integer) from public, anon, authenticated;
grant execute on function public.fila_reivindicar(integer) to service_role;
