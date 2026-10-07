-- Carteira: o vendedor vê só os clientes dele (decisão do usuário em 07/10).
--
-- Contato visível para:
--   - dono e admin: todos;
--   - o responsável pelo contato;
--   - quem pode ver alguma conversa dele (número da empresa = todos; número de vendedor = ele);
--   - toda a equipe, se o contato não tem conversa nem responsável (cadastrado à mão, sem dono).
-- Oportunidades, histórico do funil e notas seguem o contato (a oportunidade também é visível para o
-- responsável por ela).

create index if not exists conversas_contato_idx on public.conversas (contato_id);

create function public.pode_ver_contato(p_contato uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.contatos c
     where c.id = p_contato and public.eh_membro(c.org_id)
       and (
         public.tem_papel(c.org_id, '{dono,admin}')
         or c.responsavel_id = auth.uid()
         or exists (select 1 from public.conversas v where v.contato_id = c.id and public.pode_ver_canal(v.canal_id))
         or (c.responsavel_id is null and not exists (select 1 from public.conversas v where v.contato_id = c.id))
       )
  );
$$;
grant execute on function public.pode_ver_contato(uuid) to authenticated;

-- Contato criado pela tela nasce na carteira de quem criou. Só quando quem cria é uma pessoa logada da
-- própria equipe: o sistema (mensagem chegando, agente) cria sem responsável.
create function public.contato_responsavel_padrao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.responsavel_id is null and auth.role() = 'authenticated'
     and exists (select 1 from public.membros_org where org_id = new.org_id and user_id = auth.uid() and ativo) then
    new.responsavel_id := auth.uid();
  end if;
  return new;
end $$;
create trigger contatos_responsavel_padrao before insert on public.contatos
for each row execute function public.contato_responsavel_padrao();

drop policy contatos_ver on public.contatos;
create policy contatos_ver on public.contatos for select to authenticated using (public.pode_ver_contato(id));
drop policy contatos_editar on public.contatos;
create policy contatos_editar on public.contatos for update to authenticated
  using (public.pode_ver_contato(id)) with check (public.eh_membro(org_id));

drop policy oport_ver on public.oportunidades;
create policy oport_ver on public.oportunidades for select to authenticated
  using (public.eh_membro(org_id) and (responsavel_id = auth.uid() or public.pode_ver_contato(contato_id)));
drop policy oport_criar on public.oportunidades;
create policy oport_criar on public.oportunidades for insert to authenticated
  with check (public.eh_membro(org_id) and public.pode_ver_contato(contato_id));
drop policy oport_editar on public.oportunidades;
create policy oport_editar on public.oportunidades for update to authenticated
  using (public.eh_membro(org_id) and (responsavel_id = auth.uid() or public.pode_ver_contato(contato_id)))
  with check (public.eh_membro(org_id));

-- Histórico do funil: o da oportunidade que a pessoa vê (a subconsulta já passa pela RLS de oportunidades).
drop policy oport_hist_ver on public.oportunidade_historico;
create policy oport_hist_ver on public.oportunidade_historico for select to authenticated
  using (exists (select 1 from public.oportunidades o where o.id = oportunidade_id));

drop policy notas_ver on public.notas;
create policy notas_ver on public.notas for select to authenticated
  using (
    public.eh_membro(org_id)
    and (conversa_id is null or public.pode_ver_conversa(conversa_id))
    and (contato_id is null or public.pode_ver_contato(contato_id))
  );

-- Responsável por oportunidade/contato precisa ser da equipe.
create function public.responsavel_da_equipe() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.responsavel_id is not null and not exists (
    select 1 from public.membros_org where org_id = new.org_id and user_id = new.responsavel_id
  ) then
    raise exception 'o responsável precisa ser da equipe';
  end if;
  return new;
end $$;
create trigger contatos_responsavel_da_equipe before insert or update of responsavel_id on public.contatos
for each row execute function public.responsavel_da_equipe();
create trigger oportunidades_responsavel_da_equipe before insert or update of responsavel_id on public.oportunidades
for each row execute function public.responsavel_da_equipe();
