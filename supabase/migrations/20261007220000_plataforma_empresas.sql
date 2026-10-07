-- Painel da plataforma (equipe F7): cadastrar empresas, gerar o acesso do dono, suspender e reativar.
--
-- Empresa suspensa: a equipe dela perde o acesso a tudo (eh_membro/tem_papel exigem organização ativa)
-- e o agente para de responder. Nada é apagado; reativar devolve tudo como estava.

create or replace function public.eh_membro(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros_org m join public.organizacoes o on o.id = m.org_id
     where m.org_id = p_org and m.user_id = auth.uid() and m.ativo and o.status = 'ativa'
  ) or public.eh_admin_plataforma();
$$;

create or replace function public.tem_papel(p_org uuid, p_papeis public.papel_org[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membros_org m join public.organizacoes o on o.id = m.org_id
     where m.org_id = p_org and m.user_id = auth.uid() and m.ativo and m.papel = any (p_papeis) and o.status = 'ativa'
  ) or public.eh_admin_plataforma();
$$;

-- A equipe continua vendo o nome e a situação da própria empresa suspensa (para a tela explicar).
drop policy membros_ver on public.membros_org;
create policy membros_ver on public.membros_org for select to authenticated
  using (public.eh_membro(org_id) or user_id = auth.uid());
drop policy org_ver on public.organizacoes;
create policy org_ver on public.organizacoes for select to authenticated
  using (
    public.eh_membro(id) or exists (
      select 1 from public.membros_org where org_id = organizacoes.id and user_id = auth.uid() and ativo
    )
  );

create or replace function public.agente_deve_responder(p_conversa uuid, p_mensagem uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_motivo text;
begin
  if not exists (
    select 1 from public.conversas c
      join public.agentes a on a.canal_id = c.canal_id and a.ativo
      join public.organizacoes o on o.id = c.org_id and o.status = 'ativa'
     where c.id = p_conversa and c.estado = 'bot'
  ) then
    return false;
  end if;
  if p_mensagem is distinct from (
    select id from public.mensagens
     where conversa_id = p_conversa and direcao = 'entrada'
     order by criado_em desc limit 1
  ) then
    return false;
  end if;

  v_motivo := public.agente_suspeita_robo(p_conversa);
  if v_motivo is not null then
    perform public.agente_chamar_humano(
      p_conversa,
      'Possível atendimento automático do outro lado (' || v_motivo || '). O agente parou para não conversar com outro robô.'
    );
    return false;
  end if;
  return true;
end $$;

-- Lista do painel: uma linha por empresa, com o dono e sinais de uso.
create function public.plataforma_empresas()
returns table (id uuid, nome text, slug text, status text, criado_em timestamptz,
               dono_nome text, dono_email text, dono_senha_definida boolean,
               membros int, numeros int, numeros_conectados int,
               conversas_30d int, ultima_mensagem_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_admin_plataforma() then
    raise exception 'só a equipe da plataforma';
  end if;
  return query
  select o.id, o.nome, o.slug, o.status, o.criado_em,
         d.nome, d.email, d.senha_definida,
         (select count(*)::int from public.membros_org m where m.org_id = o.id and m.ativo),
         (select count(*)::int from public.canais c where c.org_id = o.id and c.ativo),
         (select count(*)::int from public.canais c where c.org_id = o.id and c.ativo and c.status_conexao = 'WORKING'),
         (select count(*)::int from public.conversas v where v.org_id = o.id and v.ultima_mensagem_em > now() - interval '30 days'),
         (select max(v.ultima_mensagem_em) from public.conversas v where v.org_id = o.id)
    from public.organizacoes o
    left join lateral (
      select p.nome, u.email::text as email,
             u.encrypted_password is not null and u.encrypted_password <> '' as senha_definida
        from public.membros_org m
        join auth.users u on u.id = m.user_id
        left join public.perfis p on p.user_id = m.user_id
       where m.org_id = o.id and m.papel = 'dono' and m.ativo
       order by m.criado_em limit 1
    ) d on true
   order by o.criado_em desc;
end $$;

-- Empresa nova sem ninguém dentro: o dono entra pelo link gerado em seguida (convidar-membro, papel dono).
create function public.plataforma_criar_empresa(p_nome text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_nome text := btrim(p_nome);
  v_base text;
  v_slug text;
  v_n int := 1;
  v_org uuid;
begin
  if not public.eh_admin_plataforma() then
    raise exception 'só a equipe da plataforma cria empresas';
  end if;
  if length(v_nome) < 2 then
    raise exception 'informe o nome da empresa';
  end if;
  v_base := left(btrim(regexp_replace(lower(translate(v_nome, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                                                         'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '[^a-z0-9]+', '-', 'g'), '-'), 40);
  if length(v_base) < 2 then
    v_base := 'empresa';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.organizacoes where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  insert into public.organizacoes (nome, slug) values (v_nome, v_slug) returning id into v_org;
  return v_org;
end $$;

create function public.plataforma_definir_status(p_org uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin_plataforma() then
    raise exception 'só a equipe da plataforma';
  end if;
  if p_status not in ('ativa', 'suspensa') then
    raise exception 'situação inválida';
  end if;
  update public.organizacoes set status = p_status where id = p_org;
end $$;

-- Pedidos de acesso (o formulário do site grava aqui por uma Edge Function; o painel aprova ou recusa).
create table public.pedidos_acesso (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  nome text not null,
  email text not null,
  telefone text,
  mensagem text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  org_id uuid references public.organizacoes (id) on delete set null,
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  decidido_por uuid references auth.users (id) on delete set null
);
alter table public.pedidos_acesso enable row level security;
create policy pedidos_ver on public.pedidos_acesso for select to authenticated using (public.eh_admin_plataforma());
create policy pedidos_decidir on public.pedidos_acesso for update to authenticated
  using (public.eh_admin_plataforma()) with check (public.eh_admin_plataforma());
revoke insert, update, delete on public.pedidos_acesso from anon, authenticated;
grant update (status, org_id, decidido_em, decidido_por) on public.pedidos_acesso to authenticated;

-- Roteiro do dono de empresa nova: o que já foi feito (a tela mostra até completar).
create function public.org_primeiros_passos(p_org uuid)
returns table (whatsapp boolean, instrucoes boolean, base boolean, equipe boolean, agente_ligado boolean)
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.canais where org_id = p_org and ativo and status_conexao = 'WORKING'),
         exists (select 1 from public.agentes where org_id = p_org and length(btrim(prompt)) > 0),
         exists (select 1 from public.base_conhecimento where org_id = p_org),
         (select count(*) from public.membros_org where org_id = p_org and ativo) > 1,
         exists (select 1 from public.agentes where org_id = p_org and ativo)
   where public.eh_membro(p_org);
$$;
revoke execute on function public.org_primeiros_passos(uuid) from public, anon;
grant execute on function public.org_primeiros_passos(uuid) to authenticated;

revoke execute on function public.plataforma_empresas(), public.plataforma_criar_empresa(text),
  public.plataforma_definir_status(uuid, text) from public, anon;
grant execute on function public.plataforma_empresas(), public.plataforma_criar_empresa(text),
  public.plataforma_definir_status(uuid, text) to authenticated;
