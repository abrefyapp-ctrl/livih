-- Biblioteca de documentos (item 5, parte 1; plano em docs/biblioteca-documentos.md).
--
-- A empresa cadastra os arquivos que costuma mandar (vista explodida, manual, catálogo...). O agente e a equipe
-- enviam na conversa. Origem: o agente prometia arquivos que não tinha (Wyllis, 15/10; Mundo Dos Compressores,
-- 16/10). Decisões de 16/10: cadastro em Configurações → Documentos, só dono/admin cadastram, toda a equipe envia.
--
-- Envio: o arquivo é COPIADO para `midias/org/conversa/...` (uma cópia por envio) e segue pela mesma fila do resto.
-- O histórico continua imutável: o que o cliente recebeu não muda se o documento for trocado ou apagado depois.

-- ============================================================================
-- Documentos
-- ============================================================================
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  tipo text check (length(tipo) <= 60),
  descricao text check (length(descricao) <= 2000),
  palavras_chave text check (length(palavras_chave) <= 500),
  path text not null unique,
  nome_arquivo text not null check (length(btrim(nome_arquivo)) between 1 and 200),
  mime text not null check (length(mime) <= 100),
  tamanho bigint not null check (tamanho > 0),
  ativo boolean not null default true,
  -- Parte 2 (catálogo do fornecedor) acrescenta outras origens sem mudar estas linhas.
  origem text not null default 'empresa' check (origem in ('empresa')),
  fonte_url text check (length(fonte_url) <= 500),
  criado_por uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, org_id),
  check (path like org_id::text || '/%')
);
create index documentos_org_idx on public.documentos (org_id, ativo);
create trigger documentos_atualizado_em before update on public.documentos
for each row execute function public.tocar_atualizado_em();

-- A mesma vista explodida serve a mais de um produto (80/W-LS e 80/W-LS PACARELAS). As FKs compostas garantem
-- documento e produto da mesma empresa.
create table public.documentos_produtos (
  documento_id uuid not null,
  produto_id uuid not null,
  org_id uuid not null,
  primary key (documento_id, produto_id),
  foreign key (documento_id, org_id) references public.documentos (id, org_id) on delete cascade,
  foreign key (produto_id, org_id) references public.produtos (id, org_id) on delete cascade
);
create index documentos_produtos_produto_idx on public.documentos_produtos (produto_id);

-- Quem enviou o quê e quando: segura o reenvio em 24 h e o limite por resposta do agente.
create table public.documentos_envios (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  documento_id uuid references public.documentos (id) on delete set null,
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  mensagem_id uuid not null unique references public.mensagens (id) on delete cascade,
  autor_tipo text not null check (autor_tipo in ('bot', 'equipe')),
  criado_em timestamptz not null default now()
);
create index documentos_envios_conversa_idx on public.documentos_envios (conversa_id, criado_em desc);

alter table public.documentos enable row level security;
create policy documentos_ver on public.documentos for select to authenticated using (public.eh_membro(org_id));
create policy documentos_gerir on public.documentos for all to authenticated
  using (public.tem_papel(org_id, '{dono,admin}')) with check (public.tem_papel(org_id, '{dono,admin}'));

alter table public.documentos_produtos enable row level security;
create policy documentos_produtos_ver on public.documentos_produtos for select to authenticated using (public.eh_membro(org_id));
create policy documentos_produtos_gerir on public.documentos_produtos for all to authenticated
  using (public.tem_papel(org_id, '{dono,admin}')) with check (public.tem_papel(org_id, '{dono,admin}'));

-- Envios: leitura da equipe; gravação só pelas funções abaixo.
alter table public.documentos_envios enable row level security;
create policy documentos_envios_ver on public.documentos_envios for select to authenticated using (public.eh_membro(org_id));
revoke insert, update, delete on public.documentos_envios from anon, authenticated;

-- ============================================================================
-- Arquivos (bucket privado `documentos`, caminho org/documento/arquivo)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 52428800, '{application/pdf,image/jpeg,image/png,image/webp,video/mp4}')
on conflict (id) do nothing;

create policy "documentos: membros veem" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.eh_membro(public.org_do_caminho(name)));
create policy "documentos: dono e admin sobem" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.tem_papel(public.org_do_caminho(name), '{dono,admin}'));
create policy "documentos: dono e admin trocam" on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and public.tem_papel(public.org_do_caminho(name), '{dono,admin}'))
  with check (bucket_id = 'documentos' and public.tem_papel(public.org_do_caminho(name), '{dono,admin}'));
create policy "documentos: dono e admin apagam" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.tem_papel(public.org_do_caminho(name), '{dono,admin}'));

-- ============================================================================
-- Equipe: registra o envio feito pela conversa (a tela copia o arquivo e chama enviar_arquivo antes)
-- ============================================================================
create function public.registrar_envio_documento(p_documento uuid, p_mensagem uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_msg public.mensagens;
begin
  select * into v_msg from public.mensagens where id = p_mensagem;
  if v_msg.id is null or v_msg.midia_path is null or v_msg.autor_tipo <> 'atendente'
     or not public.pode_ver_conversa(v_msg.conversa_id)
     or not exists (select 1 from public.documentos d where d.id = p_documento and d.org_id = v_msg.org_id) then
    raise exception 'envio inválido';
  end if;
  insert into public.documentos_envios (org_id, documento_id, conversa_id, mensagem_id, autor_tipo)
  values (v_msg.org_id, p_documento, v_msg.conversa_id, p_mensagem, 'equipe')
  on conflict (mensagem_id) do nothing;
end $$;

revoke execute on function public.registrar_envio_documento(uuid, uuid) from public, anon;
grant execute on function public.registrar_envio_documento(uuid, uuid) to authenticated;

-- ============================================================================
-- Agente (n8n, chave de serviço)
-- ============================================================================
-- Mesma busca do buscar_produtos: sem acento, todas as palavras primeiro, palavras raras pesam mais. Procura no
-- título, tipo, descrição, palavras-chave e no nome/código dos produtos ligados.
create function public.agente_buscar_documentos(p_conversa uuid, p_busca text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_termo text := public.sem_acento(btrim(coalesce(p_busca, '')));
  v_palavras text[];
  v_res jsonb;
  v_todas boolean := true;
begin
  select org_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then
    raise exception 'conversa não encontrada';
  end if;
  if not exists (select 1 from public.documentos where org_id = v_org and ativo) then
    return jsonb_build_object('encontrados', 0,
      'aviso', 'Esta empresa não tem documentos cadastrados. Não prometa o arquivo: diga que a equipe envia e chame chamar_humano.');
  end if;

  select coalesce(array_agg(distinct w), '{}') into v_palavras
    from regexp_split_to_table(v_termo, '[^a-z0-9/.,-]+') w
   where length(w) >= 2 and w not in ('de', 'da', 'do', 'das', 'dos', 'para', 'com', 'um', 'uma', 'no', 'na', 'em',
                                      'por', 'me', 'manda', 'mande', 'mandar', 'envia', 'envie', 'enviar', 'o', 'os',
                                      'as', 'arquivo', 'documento');
  if cardinality(v_palavras) = 0 then
    return jsonb_build_object('encontrados', 0, 'aviso', 'Diga o produto, o modelo ou o tipo de documento para buscar.');
  end if;

  with base as (
    select d.id, d.titulo, d.tipo,
           public.sem_acento(concat_ws(' ', d.titulo, d.tipo, d.descricao, d.palavras_chave,
             (select string_agg(concat_ws(' ', p.nome, p.codigo), ' ')
                from public.documentos_produtos dp join public.produtos p on p.id = dp.produto_id
               where dp.documento_id = d.id))) as texto,
           (select jsonb_agg(p.nome order by p.nome)
              from public.documentos_produtos dp join public.produtos p on p.id = dp.produto_id
             where dp.documento_id = d.id) as produtos
      from public.documentos d
     where d.org_id = v_org and d.ativo
  ), palavras as (
    select w, greatest((select count(*) from base b where b.texto like '%' || w || '%'), 1) as freq
      from unnest(v_palavras) w
  ), pontos as (
    select b.*,
           (select count(*) from palavras pw where b.texto like '%' || pw.w || '%') as acertos,
           (select coalesce(sum(1.0 / pw.freq), 0) from palavras pw where b.texto like '%' || pw.w || '%') as peso
      from base b
  ), escolhidos as (
    select * from pontos
     where acertos > 0
       and (acertos = cardinality(v_palavras) or not exists (select 1 from pontos where acertos = cardinality(v_palavras)))
     order by acertos desc, peso desc, length(titulo)
     limit 5
  )
  select jsonb_agg(jsonb_build_object('id', e.id, 'titulo', e.titulo, 'tipo', e.tipo, 'produtos', e.produtos)
                   order by e.acertos desc, e.peso desc, length(e.titulo)),
         bool_and(e.acertos = cardinality(v_palavras))
    into v_res, v_todas
    from escolhidos e;

  return jsonb_build_object(
    'encontrados', coalesce(jsonb_array_length(v_res), 0),
    'documentos', coalesce(v_res, '[]'::jsonb),
    'aviso', case
      when v_res is null then 'Nenhum documento encontrado. Não prometa o arquivo: diga que a equipe envia e chame chamar_humano.'
      when not v_todas then 'Nenhum documento tem todos os termos; estes são os mais próximos. Confirme com o cliente antes de enviar.'
    end);
end $$;

-- Confere tudo antes de o n8n copiar o arquivo e devolve a origem e o destino da cópia.
create function public.agente_preparar_documento(p_conversa uuid, p_documento uuid, p_reenviar boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_doc public.documentos;
  v_anterior timestamptz;
  v_desde timestamptz;
  v_na_resposta integer;
begin
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    raise exception 'conversa não encontrada';
  end if;
  if v_conv.estado <> 'bot' then
    return jsonb_build_object('enviado', false, 'aviso', 'A conversa está com a equipe: não envie.');
  end if;
  select * into v_doc from public.documentos where id = p_documento and org_id = v_conv.org_id;
  if v_doc.id is null or not v_doc.ativo then
    return jsonb_build_object('enviado', false,
      'aviso', 'Documento não encontrado. Use um id devolvido por buscar_documentos; se não houver, chame a equipe.');
  end if;

  select max(criado_em) into v_anterior from public.documentos_envios
   where conversa_id = p_conversa and documento_id = p_documento and criado_em > now() - interval '24 hours';
  if v_anterior is not null and not coalesce(p_reenviar, false) then
    return jsonb_build_object('enviado', false, 'ja_enviado_em',
      to_char(v_anterior at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
      'aviso', 'Este documento já foi enviado nesta conversa. Diga que está na mensagem enviada nesse horário. Só reenvie (reenviar=true) se o cliente disser que não recebeu.');
  end if;

  -- No máximo 3 documentos desde a última mensagem do cliente: o agente não despeja a biblioteca inteira.
  select coalesce(max(criado_em), '-infinity') into v_desde from public.mensagens
   where conversa_id = p_conversa and direcao = 'entrada';
  -- Compara pela hora das mensagens (clock_timestamp), não a do registro de envio (now, início da transação).
  select count(*) into v_na_resposta from public.documentos_envios e join public.mensagens m on m.id = e.mensagem_id
   where e.conversa_id = p_conversa and e.autor_tipo = 'bot' and m.criado_em > v_desde;
  if v_na_resposta >= 3 then
    return jsonb_build_object('enviado', false,
      'aviso', 'Limite de 3 documentos por resposta. Pergunte ao cliente qual dos outros ele precisa.');
  end if;

  return jsonb_build_object(
    'enviado', false, 'pronto', true,
    'origem', v_doc.path,
    'destino', v_conv.org_id::text || '/' || p_conversa::text || '/' || (extract(epoch from clock_timestamp()) * 1000)::bigint
               || '-' || substr(md5(random()::text), 1, 6) || '-'
               || coalesce(nullif(regexp_replace(public.sem_acento(v_doc.nome_arquivo), '[^a-z0-9._-]+', '_', 'g'), ''), 'documento'),
    'nome', v_doc.nome_arquivo,
    'titulo', v_doc.titulo);
end $$;

-- Depois da cópia: entra na fila pelo mesmo caminho do orçamento e registra o envio.
create function public.agente_enviar_documento(p_conversa uuid, p_documento uuid, p_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.documentos;
  v_res jsonb;
begin
  select d.* into v_doc from public.documentos d join public.conversas c on c.org_id = d.org_id
   where d.id = p_documento and c.id = p_conversa;
  if v_doc.id is null then
    raise exception 'documento não encontrado';
  end if;
  v_res := public.agente_enviar_arquivo(p_conversa, p_path, v_doc.nome_arquivo, v_doc.titulo);
  if coalesce((v_res ->> 'enviado')::boolean, false) then
    insert into public.documentos_envios (org_id, documento_id, conversa_id, mensagem_id, autor_tipo)
    values (v_doc.org_id, v_doc.id, p_conversa, (v_res ->> 'mensagem_id')::uuid, 'bot');
  end if;
  return v_res || jsonb_build_object('titulo', v_doc.titulo);
end $$;

revoke execute on function
  public.agente_buscar_documentos(uuid, text), public.agente_preparar_documento(uuid, uuid, boolean),
  public.agente_enviar_documento(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function
  public.agente_buscar_documentos(uuid, text), public.agente_preparar_documento(uuid, uuid, boolean),
  public.agente_enviar_documento(uuid, uuid, text)
to service_role;
