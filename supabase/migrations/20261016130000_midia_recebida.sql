-- Guardar a mídia recebida (roadmap, próximo passo 3): imagem, PDF, vídeo e áudio que o cliente manda (ou que a
-- equipe manda pelo celular) passam a ir para o bucket `midias`, como já acontece com o que a equipe envia pelo Livih.
-- Antes só ficava o registro de que chegou um documento, com o nome: a equipe não abria o arquivo no Livih e o
-- histórico de auditoria ficava incompleto (caso JoGrampo, 15/10: requisição de compra em PDF).
--
-- A mensagem entra primeiro (o webhook responde rápido) e o arquivo é baixado em segundo plano. Por isso o caminho do
-- arquivo pode passar de vazio para preenchido UMA vez, só pela função guardar_midia. Depois disso volta a valer a
-- regra de sempre: o conteúdo da mensagem não muda.

create or replace function public.mensagens_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('livih.lgpd', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'mensagens não podem ser apagadas';
  end if;
  -- Única exceção: guardar_midia preenche o arquivo de uma mensagem que ainda não tinha (vazio → caminho, uma vez).
  if coalesce(current_setting('livih.midia', true), '') = 'on'
     and old.midia_path is null and new.midia_path is not null
     and (new.id, new.org_id, new.conversa_id, new.direcao, new.autor_tipo, new.autor_id, new.tipo,
          new.texto, new.criado_em, new.modelo)
         is not distinct from
         (old.id, old.org_id, old.conversa_id, old.direcao, old.autor_tipo, old.autor_id, old.tipo,
          old.texto, old.criado_em, old.modelo) then
    return new;
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

-- Onde guardar a mídia de uma mensagem que acabou de entrar (pelo número e pelo id do WhatsApp).
create function public.midia_destino(p_canal uuid, p_wa_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('mensagem_id', m.id, 'org_id', m.org_id, 'conversa_id', m.conversa_id,
                            'ja_tem', m.midia_path is not null)
    from public.mensagens m join public.conversas c on c.id = m.conversa_id
   where c.canal_id = p_canal and m.wa_id = p_wa_id
   limit 1;
$$;

-- Liga o arquivo já subido à mensagem. Confere que o arquivo existe e está na pasta da conversa.
create function public.guardar_midia(p_mensagem uuid, p_path text, p_nome text, p_mime text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_msg public.mensagens;
begin
  select * into v_msg from public.mensagens where id = p_mensagem;
  if v_msg.id is null then
    raise exception 'mensagem não encontrada';
  end if;
  if v_msg.midia_path is not null then
    return jsonb_build_object('guardado', false, 'motivo', 'a mensagem já tem arquivo');
  end if;
  if coalesce(p_path, '') not like v_msg.org_id::text || '/' || v_msg.conversa_id::text || '/%' then
    raise exception 'arquivo não pertence a esta conversa';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'midias' and name = p_path) then
    raise exception 'arquivo não encontrado';
  end if;
  perform set_config('livih.midia', 'on', true);
  update public.mensagens
     set midia_path = p_path,
         midia_nome = coalesce(midia_nome, nullif(left(btrim(coalesce(p_nome, '')), 200), '')),
         midia_mime = coalesce(midia_mime, nullif(p_mime, ''))
   where id = p_mensagem;
  perform set_config('livih.midia', 'off', true);
  return jsonb_build_object('guardado', true);
end $$;

revoke execute on function public.midia_destino(uuid, text), public.guardar_midia(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.midia_destino(uuid, text), public.guardar_midia(uuid, text, text, text)
  to service_role;
