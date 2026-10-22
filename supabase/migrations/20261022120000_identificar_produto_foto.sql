-- Identificar o produto pela foto do cliente (pedido de 22/10; plano em docs/identificar-produto-foto.md).
--
-- O cliente manda a foto ("tenho este grampeador, quero outro igual") e a descrição automática diz só "grampeador
-- preto". Com as fotos dos produtos na biblioteca (documentos de imagem ligados a produtos), o Livih acha QUAL é:
--   1. Cada foto da biblioteca é descrita pela IA e o texto vira embedding (fotos_indice; função indexar-fotos, pelo
--      cron abaixo). Só OpenAI, a mesma chave da descrição e da transcrição.
--   2. Na entrada (_shared/midia.ts), a descrição da foto do cliente vira embedding e busca os produtos mais
--      parecidos (fotos_candidatas), mais os que têm o código legível na foto.
--   3. A IA compara a foto do cliente com as fotos desses candidatos e o resultado vai na própria descrição, que o
--      agente e a equipe já leem. Nenhuma ferramenta nova no n8n.
--
-- Sem índice vetorial (HNSW) de propósito: a busca é sempre dentro de uma empresa (alguns milhares de fotos no
-- máximo); a varredura exata é rápida e não perde resultado pelo filtro de empresa, como o HNSW perderia.

create extension if not exists vector with schema extensions;

-- ============================================================================
-- Índice das fotos
-- ============================================================================
create table public.fotos_indice (
  documento_id uuid primary key references public.documentos (id) on delete cascade,
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  -- O arquivo que foi (ou vai ser) indexado: trocar o arquivo do documento volta a foto para a fila.
  path text not null,
  status text not null default 'pendente' check (status in ('pendente', 'processando', 'pronto', 'erro')),
  descricao text,
  embedding extensions.vector(1536),
  tentativas integer not null default 0,
  erro text check (length(erro) <= 300),
  atualizado_em timestamptz not null default now()
);
create index fotos_indice_fila_idx on public.fotos_indice (atualizado_em) where status <> 'pronto';
create index fotos_indice_org_idx on public.fotos_indice (org_id, status);

-- A equipe vê o andamento (Configurações → Documentos); só a função grava.
alter table public.fotos_indice enable row level security;
create policy fotos_indice_ver on public.fotos_indice for select to authenticated using (public.eh_membro(org_id));
revoke insert, update, delete on public.fotos_indice from anon, authenticated;

-- Toda imagem da biblioteca entra na fila. As que não estão ligadas a produto ficam indexadas mas nunca viram
-- candidatas (a busca exige o produto); quando alguém liga o produto depois, já estão prontas.
create function public.fotos_indice_marcar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.mime like 'image/%' then
    insert into public.fotos_indice (documento_id, org_id, path) values (new.id, new.org_id, new.path)
    on conflict (documento_id) do update
      set path = excluded.path, status = 'pendente', tentativas = 0, erro = null, descricao = null, embedding = null,
          atualizado_em = now()
      where public.fotos_indice.path is distinct from excluded.path;
  else
    delete from public.fotos_indice where documento_id = new.id;
  end if;
  return null;
end $$;

create trigger documentos_fotos_indice after insert or update of path, mime on public.documentos
for each row execute function public.fotos_indice_marcar();

-- Fotos que já estavam na biblioteca.
insert into public.fotos_indice (documento_id, org_id, path)
select id, org_id, path from public.documentos where mime like 'image/%'
on conflict (documento_id) do nothing;

-- ============================================================================
-- Fila (função indexar-fotos, chave de serviço)
-- ============================================================================
-- Pega um lote e marca como "processando". Erro e "processando" travado (função caiu) voltam depois de 10 min,
-- até 3 tentativas. skip locked: duas execuções ao mesmo tempo não pegam a mesma foto.
create function public.fotos_reivindicar(p_limite integer)
returns table (documento_id uuid, org_id uuid, path text, mime text)
language sql security definer set search_path = '' as $$
  with lote as (
    select f.documento_id from public.fotos_indice f
     where f.status = 'pendente'
        or (f.status in ('erro', 'processando') and f.tentativas < 3 and f.atualizado_em < now() - interval '10 minutes')
     order by f.atualizado_em
     limit greatest(1, least(coalesce(p_limite, 10), 50))
     for update skip locked
  )
  update public.fotos_indice f
     set status = 'processando', tentativas = f.tentativas + 1, atualizado_em = now()
    from lote, public.documentos d
   where f.documento_id = lote.documento_id and d.id = f.documento_id
  returning f.documento_id, f.org_id, f.path, d.mime;
$$;

-- Grava o resultado. Se o arquivo foi trocado no meio (path mudou), não grava: a foto nova já está na fila.
create function public.fotos_registrar(p_documento uuid, p_path text, p_descricao text, p_embedding text, p_erro text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_embedding is not null then
    update public.fotos_indice
       set status = 'pronto', descricao = left(btrim(p_descricao), 2000), embedding = p_embedding::extensions.vector,
           erro = null, atualizado_em = now()
     where documento_id = p_documento and path = p_path;
  else
    update public.fotos_indice
       set status = 'erro', erro = left(coalesce(p_erro, 'falha ao indexar'), 300), atualizado_em = now()
     where documento_id = p_documento and path = p_path;
  end if;
end $$;

-- Cron: acorda a função só quando há foto na fila.
create function public.fotos_manutencao() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.fotos_indice
              where status = 'pendente'
                 or (status in ('erro', 'processando') and tentativas < 3 and atualizado_em < now() - interval '10 minutes')) then
    perform public.chamar_funcao('indexar-fotos');
  end if;
end $$;

select cron.schedule('livih-indexar-fotos', '* * * * *', 'select public.fotos_manutencao()');

-- ============================================================================
-- Candidatos para a foto do cliente (entrada, chave de serviço)
-- ============================================================================
-- Os produtos (ativos) cujas fotos (ativas, prontas) mais se parecem com a descrição, uma foto por produto (a mais
-- parecida). Entram também os produtos com o código escrito na descrição ("80/W-LS" legível na etiqueta), mesmo
-- longe na semelhança: o código é a pista mais forte. Códigos curtos (menos de 4 letras/números) não contam, para
-- "123" não casar com "123 mm".
create function public.fotos_candidatas(p_org uuid, p_embedding text, p_texto text, p_limite integer default 5)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_texto text := ' ' || btrim(regexp_replace(public.sem_acento(p_texto), '[^a-z0-9]+', ' ', 'g')) || ' ';
  v_res jsonb;
begin
  with fotos as (
    select f.documento_id, f.path, dp.produto_id,
           f.embedding operator(extensions.<=>) p_embedding::extensions.vector as distancia
      from public.fotos_indice f
      join public.documentos d on d.id = f.documento_id and d.ativo
      join public.documentos_produtos dp on dp.documento_id = f.documento_id
      join public.produtos p on p.id = dp.produto_id and p.ativo
     where f.org_id = p_org and f.status = 'pronto'
  ), por_produto as (
    select distinct on (produto_id) * from fotos order by produto_id, distancia
  ), pelo_codigo as (
    select pp.produto_id from por_produto pp join public.produtos p on p.id = pp.produto_id
     where length(regexp_replace(public.sem_acento(p.codigo), '[^a-z0-9]+', '', 'g')) >= 4
       and v_texto like '% ' || btrim(regexp_replace(public.sem_acento(p.codigo), '[^a-z0-9]+', ' ', 'g')) || ' %'
  ), escolhidos as (
    select pp.*, pp.produto_id in (select produto_id from pelo_codigo) as codigo_na_foto
      from por_produto pp
     where pp.produto_id in (select produto_id from pelo_codigo)
        or pp.produto_id in (select produto_id from por_produto order by distancia limit p_limite)
     order by codigo_na_foto desc, distancia
     limit p_limite + 2
  )
  select jsonb_agg(jsonb_build_object(
           'produto_id', e.produto_id, 'codigo', p.codigo, 'nome', p.nome, 'documento_id', e.documento_id,
           'path', e.path, 'distancia', round(e.distancia::numeric, 4), 'codigo_na_foto', e.codigo_na_foto)
         order by e.codigo_na_foto desc, e.distancia)
    into v_res
    from escolhidos e join public.produtos p on p.id = e.produto_id;
  return coalesce(v_res, '[]'::jsonb);
end $$;

revoke execute on function
  public.fotos_reivindicar(integer), public.fotos_registrar(uuid, text, text, text, text),
  public.fotos_manutencao(), public.fotos_candidatas(uuid, text, text, integer), public.fotos_indice_marcar()
from public, anon, authenticated;
grant execute on function
  public.fotos_reivindicar(integer), public.fotos_registrar(uuid, text, text, text, text),
  public.fotos_candidatas(uuid, text, text, integer)
to service_role;

-- ============================================================================
-- Consumo
-- ============================================================================
alter table public.uso_ia drop constraint uso_ia_tipo_check;
alter table public.uso_ia add constraint uso_ia_tipo_check
  check (tipo in ('resposta', 'transcricao', 'descricao', 'simulador', 'importacao', 'assistente', 'nota',
                  'foto_catalogo', 'identificacao'));

insert into public.precos_ia (modelo, usd_por_milhao_entrada, usd_por_milhao_saida, observacao)
values ('text-embedding-3-small', 0.02, 0, 'Identificação pela foto (22/10). Conferir no painel da OpenAI.')
on conflict (modelo) do nothing;
