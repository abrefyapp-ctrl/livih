-- Distribuição automática dos contatos novos do número da empresa (docs/crm-acompanhamento.md, entrega 3; 05/11).
--
-- No número da empresa (canal sem vendedor responsável) toda a equipe vê as conversas, e o contato novo ficava sem
-- dono. Com a opção ligada no número, o contato novo que ainda não tem vendedor entra na carteira do próximo da fila
-- (rodízio entre quem está marcado "Recebe contatos novos" em Configurações → Equipe), e essa pessoa é avisada no
-- celular. Quem já tem vendedor continua com ele (por isso "rodízio" e "carteira primeiro" do plano são uma opção só).
--
-- A distribuição é pela carteira (contatos.responsavel_id), não por conversas.atribuida_a: atribuida_a é "quem está
-- atendendo agora" (o "Com você" da tela e a despedida do agente ao chamar a equipe dependem dele). O agente segue
-- atendendo normalmente. Quando a conversa passa a aguardar a equipe, o aviso no celular vai só para o vendedor do
-- contato (antes ia para todos que veem o número).
--
-- Vale para toda conversa nova no número (cliente que escreve, campanha, mensagem mandada pelo celular), menos a que a
-- própria equipe começa pela tela (já nasce com quem começou).

alter table public.canais add column distribuir boolean not null default false;
comment on column public.canais.distribuir is
  'Número da empresa: contato novo sem vendedor entra na carteira do próximo da fila (membros_org.recebe_contatos)';

alter table public.membros_org
  add column recebe_contatos boolean not null default false,
  add column ultima_distribuicao_em timestamptz;
comment on column public.membros_org.recebe_contatos is 'Entra no rodízio dos contatos novos dos números da empresa';

-- ============================================================================
-- Configuração (dono e admin)
-- ============================================================================
create function public.membro_definir_recebe_contatos(p_org uuid, p_usuario uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes boolean;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin mudam esta permissão';
  end if;
  select recebe_contatos into v_antes from public.membros_org where org_id = p_org and user_id = p_usuario;
  if v_antes is null then
    raise exception 'membro não encontrado';
  end if;
  update public.membros_org set recebe_contatos = coalesce(p_valor, false) where org_id = p_org and user_id = p_usuario;
  if v_antes is distinct from coalesce(p_valor, false) then
    perform public.auditar(p_org, 'recebe_contatos', 'membros_org', p_usuario::text,
                           jsonb_build_object('recebe_contatos', v_antes), jsonb_build_object('recebe_contatos', coalesce(p_valor, false)));
  end if;
end $$;

create function public.canal_definir_distribuicao(p_canal uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_canal public.canais;
begin
  select * into v_canal from public.canais where id = p_canal;
  if v_canal.id is null or not public.tem_papel(v_canal.org_id, '{dono,admin}') then
    raise exception 'só dono e admin mudam a distribuição';
  end if;
  if coalesce(p_valor, false) and v_canal.responsavel_id is not null then
    raise exception 'número de vendedor não distribui: os contatos dele já são dele';
  end if;
  update public.canais set distribuir = coalesce(p_valor, false) where id = p_canal;
  perform public.auditar(v_canal.org_id, 'canal_distribuir', 'canais', p_canal::text,
                         jsonb_build_object('distribuir', v_canal.distribuir), jsonb_build_object('distribuir', coalesce(p_valor, false)));
end $$;

revoke execute on function public.membro_definir_recebe_contatos(uuid, uuid, boolean), public.canal_definir_distribuicao(uuid, boolean)
from public, anon;
grant execute on function public.membro_definir_recebe_contatos(uuid, uuid, boolean), public.canal_definir_distribuicao(uuid, boolean)
to authenticated;

-- Número que passa a ter vendedor deixa de distribuir.
create function public.canais_distribuir_so_empresa() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.responsavel_id is not null then
    new.distribuir := false;
  end if;
  return new;
end $$;
create trigger canais_distribuir_so_empresa before insert or update of responsavel_id, distribuir on public.canais
for each row execute function public.canais_distribuir_so_empresa();

-- ============================================================================
-- Rodízio
-- ============================================================================
-- Escolhe o próximo da fila (quem recebeu há mais tempo, ou nunca), põe o contato na carteira dele, deixa um aviso na
-- conversa e avisa no celular. Devolve quem recebeu (nulo = não distribuiu).
create function public.distribuir_contato(p_conversa uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_vendedor uuid;
  v_nome text;
begin
  select c.* into v_conv from public.conversas c
    join public.canais cn on cn.id = c.canal_id and cn.distribuir and cn.responsavel_id is null
    join public.contatos ct on ct.id = c.contato_id and ct.responsavel_id is null
   where c.id = p_conversa;
  if v_conv.id is null then
    return null;
  end if;
  -- Dois contatos chegando juntos não caem na mesma pessoa.
  perform pg_advisory_xact_lock(hashtextextended('livih-distribuir:' || v_conv.org_id::text, 0));
  select m.user_id into v_vendedor from public.membros_org m
   where m.org_id = v_conv.org_id and m.ativo and m.recebe_contatos
   order by m.ultima_distribuicao_em nulls first, m.criado_em
   limit 1;
  if v_vendedor is null then
    return null;
  end if;
  update public.contatos set responsavel_id = v_vendedor where id = v_conv.contato_id and responsavel_id is null;
  if not found then
    return null;
  end if;
  update public.membros_org set ultima_distribuicao_em = now() where org_id = v_conv.org_id and user_id = v_vendedor;
  select coalesce(nullif(btrim(p.nome), ''), 'a equipe') into v_nome from public.perfis p where p.user_id = v_vendedor;
  perform public.aviso_sistema(p_conversa, format('Contato novo distribuído para %s (rodízio do número da empresa).', coalesce(v_nome, 'a equipe')));
  perform public.push_enfileirar(array[v_vendedor], p_conversa, 'Contato novo para você',
                                 public.push_nome_contato(v_conv.contato_id) || ' entrou na sua carteira.');
  return v_vendedor;
end $$;

create function public.conversas_distribuir() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A conversa que a equipe começa pela tela já nasce com quem começou.
  if new.atribuida_a is null then
    perform public.distribuir_contato(new.id);
  end if;
  return null;
end $$;
create trigger conversas_distribuir after insert on public.conversas
for each row execute function public.conversas_distribuir();

-- ============================================================================
-- Avisos no celular: com distribuição, só o vendedor do contato
-- ============================================================================
-- Quem recebe o aviso de uma conversa aguardando a equipe: o vendedor do contato, se o número distribui e ele ainda é
-- da equipe; senão, todos que veem o número (como antes).
create function public.push_destino_conversa(p_conversa uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select array[ct.responsavel_id]
       from public.conversas c
       join public.canais cn on cn.id = c.canal_id and cn.distribuir
       join public.contatos ct on ct.id = c.contato_id
       join public.membros_org m on m.org_id = c.org_id and m.user_id = ct.responsavel_id and m.ativo
      where c.id = p_conversa),
    public.push_equipe_do_canal((select canal_id from public.conversas where id = p_conversa)));
$$;

-- Iguais aos de 20261009160000, com o destino acima.
create or replace function public.push_conversa_aguardando() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ultima text;
begin
  if new.estado = 'aguardando_humano' and (tg_op = 'INSERT' or old.estado <> 'aguardando_humano') then
    select coalesce(m.transcricao, m.texto, '[' || m.tipo::text || ']') into v_ultima
      from public.mensagens m where m.conversa_id = new.id and m.direcao = 'entrada'
     order by m.criado_em desc limit 1;
    perform public.push_enfileirar(
      public.push_destino_conversa(new.id), new.id,
      public.push_nome_contato(new.contato_id) || ' aguarda atendimento',
      coalesce(nullif(v_ultima, ''), new.motivo_humano, 'Nova conversa para a equipe')
    );
  end if;
  return null;
end $$;

create or replace function public.push_mensagem_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_texto text := coalesce(new.transcricao, new.texto, '[' || new.tipo::text || ']');
begin
  if new.direcao <> 'entrada' or new.autor_tipo <> 'contato' then return null; end if;
  select * into v_conv from public.conversas where id = new.conversa_id;
  if v_conv.estado = 'humano' and v_conv.atribuida_a is not null then
    perform public.push_enfileirar(array[v_conv.atribuida_a], v_conv.id, public.push_nome_contato(v_conv.contato_id), v_texto);
  elsif v_conv.estado = 'aguardando_humano' then
    perform public.push_enfileirar(public.push_destino_conversa(v_conv.id), v_conv.id,
                                   public.push_nome_contato(v_conv.contato_id) || ' aguarda atendimento', v_texto);
  end if;
  return null;
end $$;

revoke execute on function public.distribuir_contato(uuid), public.conversas_distribuir(), public.push_destino_conversa(uuid),
  public.canais_distribuir_so_empresa()
from public, anon, authenticated;
