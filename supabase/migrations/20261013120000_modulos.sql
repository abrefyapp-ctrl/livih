-- Módulos por empresa: o que cada organização tem ligado no Livih.
--
-- O catálogo (modulos) diz o que existe e se vem ligado para toda empresa (padrao) ou é pacote pago à parte
-- (adicional). A escolha de cada empresa fica em organizacao_modulos e só existe quando foge do padrão
-- (ex.: ERP ligado para a JoGrampo, ou a agenda desligada para alguém). Só a equipe da plataforma liga e
-- desliga, porque mexe no que a empresa paga. modulo_ativo() é a regra única, usada nas políticas de acesso
-- das tabelas de cada módulo e na tela.

create table public.modulos (
  codigo text primary key check (codigo ~ '^[a-z_]+$'),
  nome text not null,
  descricao text not null,
  padrao boolean not null default false,
  adicional boolean not null default false,
  ordem integer not null default 0
);
alter table public.modulos enable row level security;
create policy modulos_ver on public.modulos for select to authenticated using (true);
grant select on public.modulos to authenticated;

insert into public.modulos (codigo, nome, descricao, padrao, adicional, ordem) values
  ('agenda', 'Agenda', 'Compromissos da equipe ligados aos clientes.', true, false, 1),
  ('erp', 'Pedidos e estoque (ERP)', 'Catálogo, pedidos montados pelo agente e baixa de estoque.', false, true, 2);

create table public.organizacao_modulos (
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  modulo text not null references public.modulos (codigo) on delete cascade,
  ativo boolean not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null,
  primary key (org_id, modulo)
);
alter table public.organizacao_modulos enable row level security;
-- Leitura pela RPC org_modulos e escrita pela RPC da plataforma: nenhuma policy direta.

create function public.modulo_ativo(p_org uuid, p_modulo text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select om.ativo from public.organizacao_modulos om where om.org_id = p_org and om.modulo = p_modulo),
    (select m.padrao from public.modulos m where m.codigo = p_modulo),
    false
  );
$$;
revoke execute on function public.modulo_ativo(uuid, text) from public, anon;
grant execute on function public.modulo_ativo(uuid, text) to authenticated, service_role;

-- Módulos da empresa (membros dela e a equipe da plataforma).
create function public.org_modulos(p_org uuid)
returns table (codigo text, nome text, descricao text, adicional boolean, padrao boolean, ativo boolean)
language sql stable security definer set search_path = '' as $$
  select m.codigo, m.nome, m.descricao, m.adicional, m.padrao, public.modulo_ativo(p_org, m.codigo)
    from public.modulos m
   where public.eh_membro(p_org) or public.eh_admin_plataforma()
   order by m.ordem;
$$;
revoke execute on function public.org_modulos(uuid) from public, anon;
grant execute on function public.org_modulos(uuid) to authenticated;

-- Liga ou desliga um módulo numa empresa (equipe da plataforma). Voltar ao padrão apaga a exceção.
create function public.plataforma_definir_modulo(p_org uuid, p_modulo text, p_ativo boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_padrao boolean;
  v_antes boolean;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'só a equipe da plataforma';
  end if;
  select padrao into v_padrao from public.modulos where codigo = p_modulo;
  if v_padrao is null then
    raise exception 'módulo inexistente';
  end if;
  if not exists (select 1 from public.organizacoes where id = p_org) then
    raise exception 'empresa inexistente';
  end if;
  v_antes := public.modulo_ativo(p_org, p_modulo);
  if p_ativo = v_padrao then
    delete from public.organizacao_modulos where org_id = p_org and modulo = p_modulo;
  else
    insert into public.organizacao_modulos (org_id, modulo, ativo, atualizado_por)
    values (p_org, p_modulo, p_ativo, auth.uid())
    on conflict (org_id, modulo) do update set ativo = excluded.ativo, atualizado_em = now(), atualizado_por = auth.uid();
  end if;
  if v_antes is distinct from p_ativo then
    insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'atendente', auth.uid(), 'definir_modulo', 'modulos', p_modulo,
            jsonb_build_object('ativo', v_antes), jsonb_build_object('ativo', p_ativo));
  end if;
end $$;
revoke execute on function public.plataforma_definir_modulo(uuid, text, boolean) from public, anon;
grant execute on function public.plataforma_definir_modulo(uuid, text, boolean) to authenticated;

-- Agenda passa a respeitar o módulo: desligado, ninguém marca nem edita (o que já existe continua guardado).
drop policy compromissos_criar on public.compromissos;
create policy compromissos_criar on public.compromissos for insert to authenticated
  with check (public.eh_membro(org_id) and public.modulo_ativo(org_id, 'agenda')
              and (contato_id is null or public.pode_ver_contato(contato_id)));
drop policy compromissos_editar on public.compromissos;
create policy compromissos_editar on public.compromissos for update to authenticated
  using (public.pode_ver_compromisso(org_id, responsavel_id, contato_id) and public.modulo_ativo(org_id, 'agenda'))
  with check (public.eh_membro(org_id) and (contato_id is null or public.pode_ver_contato(contato_id)));
