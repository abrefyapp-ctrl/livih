-- Equipe pela tela de Configurações.
--
-- Quem gerencia a equipe continua sendo só o dono (policy membros_gerir). Convite é pela Edge Function
-- convidar-membro (precisa da service role para criar o usuário no Auth); papel e ativo mudam direto
-- em membros_org pela própria policy.

-- Equipe com e-mail e último acesso: auth.users não é legível pelo app, então vem por função.
create function public.equipe_listar(p_org uuid)
returns table (user_id uuid, nome text, email text, papel public.papel_org, ativo boolean,
               ultimo_acesso timestamptz, senha_definida boolean, criado_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, p.nome, u.email::text, m.papel, m.ativo, u.last_sign_in_at,
         u.encrypted_password is not null and u.encrypted_password <> '', m.criado_em
    from public.membros_org m
    join auth.users u on u.id = m.user_id
    left join public.perfis p on p.user_id = m.user_id
   where m.org_id = p_org and public.eh_membro(p_org)
   order by m.ativo desc, p.nome nulls last;
$$;

-- A organização nunca fica sem dono ativo (o último dono não se rebaixa, desativa nem sai).
create function public.membros_org_um_dono() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_org uuid := coalesce(old.org_id, new.org_id);
begin
  if old.papel = 'dono' and old.ativo
     and (tg_op = 'DELETE' or new.papel <> 'dono' or not new.ativo)
     and not exists (
       select 1 from public.membros_org
        where org_id = v_org and papel = 'dono' and ativo and user_id <> old.user_id
     ) then
    raise exception 'a organização precisa de pelo menos um dono ativo';
  end if;
  return coalesce(new, old);
end $$;

create trigger membros_org_um_dono before update or delete on public.membros_org
for each row execute function public.membros_org_um_dono();

-- Usado só pela Edge Function de convite: id do usuário pelo e-mail, se já existir.
create function public.usuario_por_email(p_email text)
returns table (id uuid, senha_definida boolean) language sql stable security definer set search_path = '' as $$
  select u.id, u.encrypted_password is not null and u.encrypted_password <> ''
    from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
$$;

revoke execute on function public.equipe_listar(uuid), public.usuario_por_email(text) from public, anon;
grant execute on function public.equipe_listar(uuid) to authenticated;
revoke execute on function public.usuario_por_email(text) from authenticated;
grant execute on function public.usuario_por_email(text) to service_role;
