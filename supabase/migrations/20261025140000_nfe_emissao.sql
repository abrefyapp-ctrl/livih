-- NF-e pela Focus NFe, entrega 2: emissão a partir do pedido (docs/nfe.md).
--
-- O pedido (de qualquer canal) vira NF-e: a função nfe-emitir monta e envia à Focus; o resultado chega pelo gatilho
-- da Focus (nfe-retorno) ou pela conferência de reserva do cron. A nota autorizada guarda XML e DANFE no bucket
-- privado `notas-fiscais` (cópia própria do Livih: a empresa guarda o XML por 5 anos) e não muda mais; o
-- cancelamento (entrega 3) vira evento.

-- ============================================================================
-- Notas
-- ============================================================================
create table public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  emissora_id uuid not null,
  pedido_id uuid,
  cliente_id uuid,
  -- Referência única da nota na Focus (a mesma que vai no ?ref=).
  ref text not null unique check (ref ~ '^[A-Za-z0-9_-]{1,50}$'),
  ambiente text not null check (ambiente in ('homologacao', 'producao')),
  status text not null default 'processando'
    check (status in ('processando', 'autorizada', 'rejeitada', 'cancelada')),
  numero integer,
  serie integer,
  chave text check (chave ~ '^\d{44}$'),
  valor numeric(14, 2) not null default 0,
  mensagem text check (length(mensagem) <= 4000),
  xml_path text,
  danfe_path text,
  xml_cancelamento_path text,
  autorizada_em timestamptz,
  cancelada_em timestamptz,
  justificativa_cancelamento text check (length(justificativa_cancelamento) <= 255),
  consultas integer not null default 0,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, org_id),
  foreign key (emissora_id, org_id) references public.emissoras (id, org_id),
  foreign key (pedido_id, org_id) references public.pedidos (id, org_id) on delete set null (pedido_id),
  foreign key (cliente_id, org_id) references public.clientes (id, org_id) on delete set null (cliente_id)
);
-- Um pedido tem no máximo uma nota viva (em processamento ou autorizada); rejeitada ou cancelada libera nova emissão.
create unique index notas_fiscais_uma_viva on public.notas_fiscais (pedido_id) where status in ('processando', 'autorizada');
create index notas_fiscais_org_idx on public.notas_fiscais (org_id, criado_em desc);
create index notas_fiscais_processando_idx on public.notas_fiscais (atualizado_em) where status = 'processando';
create trigger notas_fiscais_atualizado_em before update on public.notas_fiscais
for each row execute function public.tocar_atualizado_em();

-- Nota autorizada é documento fiscal: número, chave, valor e arquivos não mudam (nem pelo banco); só o cancelamento.
create function public.notas_fiscais_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('autorizada', 'cancelada') then
      raise exception 'nota fiscal autorizada não é apagada';
    end if;
    return old;
  end if;
  -- O XML e o DANFE podem chegar depois (cópia que falhou na hora); trocar um arquivo já guardado, não.
  if old.status in ('autorizada', 'cancelada')
     and ((new.numero, new.serie, new.chave, new.valor, new.emissora_id, new.ambiente, new.ref)
          is distinct from
          (old.numero, old.serie, old.chave, old.valor, old.emissora_id, old.ambiente, old.ref)
          or (old.xml_path is not null and new.xml_path is distinct from old.xml_path)
          or (old.danfe_path is not null and new.danfe_path is distinct from old.danfe_path)) then
    raise exception 'nota fiscal autorizada não muda (só o cancelamento)';
  end if;
  if old.status = 'cancelada' and new.status <> 'cancelada' then
    raise exception 'nota cancelada não volta';
  end if;
  return new;
end $$;
create trigger notas_fiscais_imutavel before update or delete on public.notas_fiscais
for each row execute function public.notas_fiscais_imutavel();

-- Quem vê o pedido vê a nota dele; gravar, só as funções nfe-* (chave de serviço).
alter table public.notas_fiscais enable row level security;
create policy notas_fiscais_ver on public.notas_fiscais for select to authenticated
  using (public.eh_membro(org_id) and (pedido_id is null and public.emite_nota_fiscal(org_id)
                                       or exists (select 1 from public.pedidos p where p.id = notas_fiscais.pedido_id)));
grant select on public.notas_fiscais to authenticated;
revoke insert, update, delete on public.notas_fiscais from anon, authenticated;

-- ============================================================================
-- Arquivos (bucket privado `notas-fiscais`, caminho org/emissora/AAAA-MM/arquivo)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notas-fiscais', 'notas-fiscais', false, 10485760, '{application/xml,text/xml,application/pdf}')
on conflict (id) do nothing;

-- Lê quem vê a nota (a subconsulta passa pela RLS de notas_fiscais). Ninguém grava pelo app.
create policy "notas-fiscais: quem vê a nota" on storage.objects for select to authenticated
  using (bucket_id = 'notas-fiscais' and exists (
    select 1 from public.notas_fiscais n
     where n.xml_path = storage.objects.name or n.danfe_path = storage.objects.name or n.xml_cancelamento_path = storage.objects.name));

-- ============================================================================
-- Gatilho da Focus (webhook): segredo no Vault, conferido pela função nfe-retorno
-- ============================================================================
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'focus_webhook') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'focus_webhook',
                                'Focus NFe → função nfe-retorno (cabeçalho X-Livih-Focus)');
  end if;
end $$;

create function public.nfe_segredo_webhook() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'focus_webhook';
$$;
revoke execute on function public.nfe_segredo_webhook() from public, anon, authenticated;
grant execute on function public.nfe_segredo_webhook() to service_role;

-- ============================================================================
-- Conferência de reserva: nota em processamento há mais de 2 minutos sem retorno → a função consulta na Focus.
-- ============================================================================
create function public.nfe_manutencao() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.notas_fiscais
              where status = 'processando' and atualizado_em < now() - interval '2 minutes' and consultas < 60) then
    perform public.chamar_funcao('nfe-retorno', '{"conferir": true}'::jsonb);
  end if;
end $$;
revoke execute on function public.nfe_manutencao() from public, anon, authenticated;

select cron.schedule('livih-nfe-conferir', '* * * * *', 'select public.nfe_manutencao()');
