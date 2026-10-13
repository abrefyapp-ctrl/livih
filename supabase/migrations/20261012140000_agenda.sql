-- Agenda própria (todos os planos): compromissos da equipe, ligados ao cliente e à oportunidade.
--
-- Visibilidade segue a carteira: cada um vê os próprios compromissos, os internos (sem cliente) e os dos
-- clientes que pode ver (pode_ver_contato já inclui dono e admin). O agente vai marcar pelo banco, em RPC
-- própria, numa próxima etapa (origem 'agente').

create type public.status_compromisso as enum ('marcado', 'confirmado', 'realizado', 'nao_compareceu', 'cancelado');

create table public.compromissos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 120),
  inicio timestamptz not null,
  fim timestamptz not null,
  responsavel_id uuid references auth.users (id) on delete set null,
  contato_id uuid,
  oportunidade_id uuid,
  local text check (length(local) <= 300),
  observacao text check (length(observacao) <= 2000),
  status public.status_compromisso not null default 'marcado',
  origem text not null default 'equipe' check (origem in ('equipe', 'agente')),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim > inicio and fim <= inicio + interval '24 hours'),
  foreign key (contato_id, org_id) references public.contatos (id, org_id) on delete set null (contato_id),
  foreign key (oportunidade_id, org_id) references public.oportunidades (id, org_id) on delete set null (oportunidade_id)
);
create index compromissos_periodo_idx on public.compromissos (org_id, inicio);
create index compromissos_contato_idx on public.compromissos (contato_id);
create trigger compromissos_atualizado_em before update on public.compromissos
for each row execute function public.tocar_atualizado_em();

-- Coerência: responsável é da equipe, a oportunidade é do mesmo cliente, e quem criou fica registrado.
create function public.compromisso_validar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_contato uuid;
begin
  if new.responsavel_id is not null and not exists (
    select 1 from public.membros_org where org_id = new.org_id and user_id = new.responsavel_id and ativo
  ) then
    raise exception 'o responsável precisa ser da equipe';
  end if;
  if new.oportunidade_id is not null then
    select contato_id into v_contato from public.oportunidades where id = new.oportunidade_id;
    if new.contato_id is null then
      new.contato_id := v_contato;
    elsif v_contato is distinct from new.contato_id then
      raise exception 'a oportunidade é de outro cliente';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
  end if;
  return new;
end $$;

create trigger compromisso_validar before insert or update on public.compromissos
for each row execute function public.compromisso_validar();
revoke execute on function public.compromisso_validar() from public, anon, authenticated;

alter table public.compromissos enable row level security;

create function public.pode_ver_compromisso(p_org uuid, p_responsavel uuid, p_contato uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org)
     and (p_responsavel = auth.uid() or p_contato is null or public.pode_ver_contato(p_contato));
$$;
revoke execute on function public.pode_ver_compromisso(uuid, uuid, uuid) from public, anon;
grant execute on function public.pode_ver_compromisso(uuid, uuid, uuid) to authenticated;

create policy compromissos_ver on public.compromissos for select to authenticated
  using (public.pode_ver_compromisso(org_id, responsavel_id, contato_id));
create policy compromissos_criar on public.compromissos for insert to authenticated
  with check (public.eh_membro(org_id) and (contato_id is null or public.pode_ver_contato(contato_id)));
create policy compromissos_editar on public.compromissos for update to authenticated
  using (public.pode_ver_compromisso(org_id, responsavel_id, contato_id))
  with check (public.eh_membro(org_id) and (contato_id is null or public.pode_ver_contato(contato_id)));
-- Apagar é exceção (o normal é cancelar, que fica no histórico): só dono e admin.
create policy compromissos_apagar on public.compromissos for delete to authenticated
  using (public.tem_papel(org_id, '{dono,admin}'));

grant select, insert, update, delete on public.compromissos to authenticated;
