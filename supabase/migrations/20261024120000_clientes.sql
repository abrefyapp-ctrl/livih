-- Cadastro de clientes, entrega 1 (plano e decisões de 22 e 23/10 em docs/clientes.md).
--
-- Cliente é quem compra (empresa com CNPJ ou pessoa com CPF), com o cadastro fiscal que o orçamento e a NF-e
-- precisam. Contato continua sendo quem fala no WhatsApp: um cliente tem vários contatos, um contato é de no máximo
-- um cliente (contatos.cliente_id). Pedido e OS também apontam o cliente.
--
-- Visibilidade segue a carteira, como os contatos. A permissão por pessoa "Vê todos os clientes"
-- (membros_org.ve_todos_clientes, pensada para o balcão/PDV) libera o cadastro de todos os clientes, os contatos
-- ligados a eles e os pedidos deles. NÃO libera conversas, oportunidades nem notas: pode_ver_contato, de que elas
-- dependem, não muda.
--
-- Fica para a entrega 3 (OS): prazos de pagamento por cliente (os_prazos_cliente) e a importação de OS pelo cliente;
-- as funções que os usam (os_faturar, os_importar, os_previsao_itens) mudam juntas.

-- ============================================================================
-- CPF
-- ============================================================================
create function public.cpf_valido(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  d int[];
  s int;
  dv int;
begin
  if p !~ '^\d{11}$' or p ~ '^(\d)\1{10}$' then
    return false;
  end if;
  select array_agg(substr(p, i, 1)::int order by i) into d from generate_series(1, 11) i;
  s := 0;
  for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  dv := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  if dv <> d[10] then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  dv := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  return dv = d[11];
end $$;

-- ============================================================================
-- Clientes
-- ============================================================================
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  tipo text not null default 'pj' check (tipo in ('pj', 'pf')),
  -- Como a equipe chama: nome fantasia (PJ) ou nome da pessoa (PF).
  nome text not null check (length(btrim(nome)) between 1 and 200),
  razao_social text check (length(razao_social) <= 200),
  -- Só números; CNPJ para PJ, CPF para PF.
  documento text check (documento is null or (tipo = 'pj' and public.cnpj_valido(documento))
                                         or (tipo = 'pf' and public.cpf_valido(documento))),
  inscricao_estadual text check (length(inscricao_estadual) <= 30),
  cep text check (cep ~ '^\d{8}$'),
  logradouro text check (length(logradouro) <= 200),
  numero text check (length(numero) <= 20),
  complemento text check (length(complemento) <= 100),
  bairro text check (length(bairro) <= 100),
  cidade text check (length(cidade) <= 100),
  uf text check (uf ~ '^[A-Z]{2}$'),
  email text check (length(email) <= 200),
  telefone text check (length(telefone) <= 30),
  responsavel_id uuid references auth.users (id) on delete set null,
  observacoes text check (length(observacoes) <= 2000),
  ativo boolean not null default true,
  criado_por uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, org_id)
);
-- O mesmo CNPJ/CPF não entra duas vezes na mesma empresa (a importação atualiza por ele).
create unique index clientes_documento_unico on public.clientes (org_id, documento) where documento is not null;
create index clientes_org_idx on public.clientes (org_id, ativo, nome);
create index clientes_responsavel_idx on public.clientes (responsavel_id);
create trigger clientes_atualizado_em before update on public.clientes
for each row execute function public.tocar_atualizado_em();

-- Ligações. Apagar o cliente solta contatos, pedidos e OS (ficam sem cliente, não somem).
alter table public.contatos add column cliente_id uuid;
alter table public.contatos add constraint contatos_cliente_fk
  foreign key (cliente_id, org_id) references public.clientes (id, org_id) on delete set null (cliente_id);
create index contatos_cliente_idx on public.contatos (cliente_id);

alter table public.pedidos add column cliente_id uuid;
alter table public.pedidos add constraint pedidos_cliente_fk
  foreign key (cliente_id, org_id) references public.clientes (id, org_id) on delete set null (cliente_id);
create index pedidos_cliente_idx on public.pedidos (cliente_id);

alter table public.ordens_servico add column cliente_id uuid;
alter table public.ordens_servico add constraint ordens_servico_cliente_fk
  foreign key (cliente_id, org_id) references public.clientes (id, org_id) on delete set null (cliente_id);
create index ordens_servico_cliente_idx on public.ordens_servico (cliente_id);

-- ============================================================================
-- Permissão "Vê todos os clientes"
-- ============================================================================
alter table public.membros_org add column ve_todos_clientes boolean not null default false;
comment on column public.membros_org.ve_todos_clientes is
  'vê e edita o cadastro de todos os clientes, os contatos ligados a eles e os pedidos deles (balcão/PDV); não vê conversas';

create function public.ve_todos_clientes(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tem_papel(p_org, '{dono,admin}') or exists (
    select 1 from public.membros_org m join public.organizacoes o on o.id = m.org_id
     where m.org_id = p_org and m.user_id = auth.uid() and m.ativo and m.ve_todos_clientes and o.status = 'ativa'
  );
$$;

-- Dono e admin ligam e desligam (a policy de membros_org só deixa o dono gravar direto).
create function public.membro_definir_ve_todos_clientes(p_org uuid, p_usuario uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes boolean;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin mudam esta permissão';
  end if;
  select ve_todos_clientes into v_antes from public.membros_org where org_id = p_org and user_id = p_usuario;
  if v_antes is null then
    raise exception 'membro não encontrado';
  end if;
  update public.membros_org set ve_todos_clientes = coalesce(p_valor, false)
   where org_id = p_org and user_id = p_usuario;
  if v_antes is distinct from coalesce(p_valor, false) then
    perform public.auditar(p_org, 've_todos_clientes', 'membros_org', p_usuario::text,
                           jsonb_build_object('ve_todos_clientes', v_antes),
                           jsonb_build_object('ve_todos_clientes', coalesce(p_valor, false)));
  end if;
end $$;

-- ============================================================================
-- Quem vê o cliente
-- ============================================================================
-- Dono, admin e quem vê todos; o vendedor: os da carteira dele, os sem responsável e os que têm um contato que ele
-- vê. A versão "linha" recebe os campos para a policy não reler a tabela (mesmo motivo de pode_ver_contato_linha).
create function public.pode_ver_cliente_linha(p_org uuid, p_cliente uuid, p_responsavel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org)
     and (
       public.ve_todos_clientes(p_org)
       or p_responsavel = auth.uid()
       or p_responsavel is null
       or exists (select 1 from public.contatos c where c.cliente_id = p_cliente and public.pode_ver_contato(c.id))
     );
$$;

create function public.pode_ver_cliente(p_cliente uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clientes c
                  where c.id = p_cliente and public.pode_ver_cliente_linha(c.org_id, c.id, c.responsavel_id));
$$;

-- Contato que a pessoa pode usar num pedido: o da carteira ou, para quem vê todos os clientes, o ligado a um
-- cliente. Não serve para conversas, oportunidades e notas (essas continuam em pode_ver_contato).
create function public.pode_usar_contato(p_contato uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.pode_ver_contato(p_contato) or exists (
    select 1 from public.contatos c
     where c.id = p_contato and c.cliente_id is not null and public.ve_todos_clientes(c.org_id)
  );
$$;

revoke execute on function
  public.ve_todos_clientes(uuid), public.membro_definir_ve_todos_clientes(uuid, uuid, boolean),
  public.pode_ver_cliente_linha(uuid, uuid, uuid), public.pode_ver_cliente(uuid), public.pode_usar_contato(uuid)
from public, anon;
grant execute on function
  public.ve_todos_clientes(uuid), public.membro_definir_ve_todos_clientes(uuid, uuid, boolean),
  public.pode_ver_cliente_linha(uuid, uuid, uuid), public.pode_ver_cliente(uuid), public.pode_usar_contato(uuid)
to authenticated;

-- ============================================================================
-- Regras de preenchimento
-- ============================================================================
-- Cliente criado pela tela nasce na carteira de quem criou (como o contato). Trocar a carteira depois: só dono e
-- admin. O sistema (chave de serviço, importação pelo banco) não passa por essas regras.
create function public.clientes_preparar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.documento := nullif(regexp_replace(coalesce(new.documento, ''), '\D', '', 'g'), '');
  new.cep := nullif(regexp_replace(coalesce(new.cep, ''), '\D', '', 'g'), '');
  new.uf := nullif(upper(btrim(coalesce(new.uf, ''))), '');
  new.nome := btrim(new.nome);
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' and new.responsavel_id is null
       and exists (select 1 from public.membros_org where org_id = new.org_id and user_id = auth.uid() and ativo) then
      new.responsavel_id := auth.uid();
    end if;
    if tg_op = 'UPDATE' and new.responsavel_id is distinct from old.responsavel_id
       and not public.tem_papel(new.org_id, '{dono,admin}') then
      raise exception 'só dono e admin trocam o vendedor responsável pelo cliente';
    end if;
  end if;
  if new.responsavel_id is not null and not exists (
    select 1 from public.membros_org where org_id = new.org_id and user_id = new.responsavel_id
  ) then
    raise exception 'o responsável precisa ser da equipe';
  end if;
  return new;
end $$;
create trigger clientes_preparar before insert or update on public.clientes
for each row execute function public.clientes_preparar();

-- Ligar o contato a um cliente que a pessoa não vê é recusado.
create function public.contatos_conferir_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.cliente_id is not null and auth.role() = 'authenticated'
     and (tg_op = 'INSERT' or new.cliente_id is distinct from old.cliente_id)
     and not public.pode_ver_cliente(new.cliente_id) then
    raise exception 'cliente não encontrado';
  end if;
  return new;
end $$;
create trigger contatos_conferir_cliente before insert or update of cliente_id on public.contatos
for each row execute function public.contatos_conferir_cliente();

-- Pedido: sem cliente informado, vem o cliente do contato (pela tela e pelo agente).
create function public.pedidos_cliente_do_contato() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.cliente_id is null and new.contato_id is not null
     and (tg_op = 'INSERT' or new.contato_id is distinct from old.contato_id) then
    select c.cliente_id into new.cliente_id from public.contatos c where c.id = new.contato_id;
  end if;
  return new;
end $$;
create trigger pedidos_cliente_do_contato before insert or update of contato_id on public.pedidos
for each row execute function public.pedidos_cliente_do_contato();

-- OS: igual ao de 20261022130000, mais o cliente. Sem cliente informado, vem o do contato; o nome mostrado
-- (cliente_nome) vem do cliente, senão do contato, senão o digitado.
create or replace function public.os_preparar_ordem() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('os_numero:' || new.org_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero from public.ordens_servico where org_id = new.org_id;
    new.criado_por := coalesce(new.criado_por, auth.uid());
  end if;
  if new.cliente_id is null and new.contato_id is not null
     and (tg_op = 'INSERT' or new.contato_id is distinct from old.contato_id) then
    select c.cliente_id into new.cliente_id from public.contatos c where c.id = new.contato_id;
  end if;
  if new.cliente_id is not null and (tg_op = 'INSERT' or new.cliente_id is distinct from old.cliente_id) then
    select cl.nome into new.cliente_nome from public.clientes cl where cl.id = new.cliente_id;
  elsif new.contato_id is not null and (tg_op = 'INSERT' or new.contato_id is distinct from old.contato_id) then
    select coalesce(nullif(btrim(c.empresa), ''), nullif(btrim(c.nome), ''), nullif(btrim(c.nome_whatsapp), ''), c.telefone)
      into new.cliente_nome
      from public.contatos c where c.id = new.contato_id;
  end if;
  new.cliente_nome := nullif(btrim(new.cliente_nome), '');
  if new.responsavel_id is not null and not exists (
    select 1 from public.membros_org where org_id = new.org_id and user_id = new.responsavel_id and ativo
  ) then
    raise exception 'o responsável precisa ser da equipe';
  end if;
  return new;
end $$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.clientes enable row level security;
create policy clientes_ver on public.clientes for select to authenticated
  using (public.pode_ver_cliente_linha(org_id, id, responsavel_id));
create policy clientes_criar on public.clientes for insert to authenticated
  with check (public.eh_membro(org_id));
create policy clientes_editar on public.clientes for update to authenticated
  using (public.pode_ver_cliente_linha(org_id, id, responsavel_id)) with check (public.eh_membro(org_id));
create policy clientes_apagar on public.clientes for delete to authenticated
  using (public.tem_papel(org_id, '{dono,admin}'));
grant select, insert, update, delete on public.clientes to authenticated;

-- Quem vê todos os clientes vê também os contatos ligados a eles (nome e telefone, para o balcão). As outras
-- tabelas do contato (conversas, oportunidades, notas) seguem em pode_ver_contato e não mudam.
create policy contatos_ver_por_cliente on public.contatos for select to authenticated
  using (cliente_id is not null and public.ve_todos_clientes(org_id));

-- Pedidos: a carteira de antes, mais os pedidos de cliente para quem vê todos os clientes.
create function public.pode_ver_pedido(p_org uuid, p_contato uuid, p_responsavel uuid, p_cliente uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.pode_ver_pedido(p_org, p_contato, p_responsavel)
      or (p_cliente is not null and public.modulo_ativo(p_org, 'erp') and public.ve_todos_clientes(p_org));
$$;
revoke execute on function public.pode_ver_pedido(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.pode_ver_pedido(uuid, uuid, uuid, uuid) to authenticated;

drop policy pedidos_ver on public.pedidos;
create policy pedidos_ver on public.pedidos for select to authenticated
  using (public.pode_ver_pedido(org_id, contato_id, responsavel_id, cliente_id));
drop policy pedidos_criar on public.pedidos;
create policy pedidos_criar on public.pedidos for insert to authenticated
  with check (public.eh_membro(org_id) and public.modulo_ativo(org_id, 'erp')
              and (contato_id is null or public.pode_usar_contato(contato_id))
              and (cliente_id is null or public.pode_ver_cliente(cliente_id)));
drop policy pedidos_editar on public.pedidos;
create policy pedidos_editar on public.pedidos for update to authenticated
  using (public.pode_ver_pedido(org_id, contato_id, responsavel_id, cliente_id))
  with check (public.eh_membro(org_id)
              and (contato_id is null or public.pode_usar_contato(contato_id))
              and (cliente_id is null or public.pode_ver_cliente(cliente_id)));
drop policy pedidos_apagar on public.pedidos;
create policy pedidos_apagar on public.pedidos for delete to authenticated
  using (status = 'rascunho' and public.pode_ver_pedido(org_id, contato_id, responsavel_id, cliente_id));

-- OS: a oficina inteira vê; ligar a um cliente exige ver o cliente (como já é com o contato).
drop policy ordens_servico_criar on public.ordens_servico;
create policy ordens_servico_criar on public.ordens_servico for insert to authenticated
  with check (public.os_membro(org_id) and (contato_id is null or public.pode_ver_contato(contato_id))
              and (cliente_id is null or public.pode_ver_cliente(cliente_id)));
drop policy ordens_servico_editar on public.ordens_servico;
create policy ordens_servico_editar on public.ordens_servico for update to authenticated
  using (public.os_membro(org_id))
  with check (public.os_membro(org_id) and (contato_id is null or public.pode_ver_contato(contato_id))
              and (cliente_id is null or public.pode_ver_cliente(cliente_id)));

-- ============================================================================
-- Agente: o contexto leva o cliente do contato (só leitura)
-- ============================================================================
-- Igual ao de 20261016140000, com a chave "cliente".
create or replace function public.agente_contexto(p_conversa uuid, p_limite integer default 40)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_retomado timestamptz;
  v_res jsonb;
begin
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    raise exception 'conversa não encontrada';
  end if;

  -- greatest ignora nulos: sem nenhuma marca, nenhuma mensagem é "anterior".
  select greatest(a.ativado_em, v_conv.bot_desde) into v_retomado
    from public.agentes a where a.canal_id = v_conv.canal_id;
  v_retomado := coalesce(v_retomado, v_conv.bot_desde);

  select jsonb_build_object(
    'conversa', jsonb_build_object('id', v_conv.id, 'estado', v_conv.estado),
    -- Calculados aqui, não pela IA: dia da semana e hora certos, e se a conversa já teve resposta recente.
    'dentro_do_horario', (select public.agente_no_horario(a.horario, clock_timestamp())
                            from public.agentes a where a.canal_id = v_conv.canal_id),
    'primeira_resposta', not exists (
      select 1 from public.mensagens m
       where m.conversa_id = p_conversa and m.direcao = 'saida' and not m.automatica
         and m.autor_tipo in ('bot', 'atendente') and m.criado_em > clock_timestamp() - interval '12 hours'),
    'retomado_em', to_char(v_retomado at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
    'organizacao', (select jsonb_build_object('nome', o.nome) from public.organizacoes o where o.id = v_conv.org_id),
    'agente', (select jsonb_build_object('nome', a.nome, 'modelo', a.modelo, 'prompt', a.prompt,
                                         'regras_humano', a.regras_humano, 'mensagem_fora_horario', a.mensagem_fora_horario,
                                         'horario', a.horario, 'saudacao', a.saudacao)
                 from public.agentes a where a.canal_id = v_conv.canal_id),
    'base_conhecimento', (select string_agg('## ' || b.titulo || E'\n\n' || b.conteudo, E'\n\n---\n\n' order by b.titulo)
                            from public.base_conhecimento b where b.org_id = v_conv.org_id and b.ativo),
    'contato', (select jsonb_build_object('nome', ct.nome, 'nome_whatsapp', ct.nome_whatsapp, 'telefone', ct.telefone,
                                          'empresa', ct.empresa, 'email', ct.email, 'dados', ct.dados)
                  from public.contatos ct where ct.id = v_conv.contato_id),
    -- De qual empresa (ou pessoa) cliente o contato é. Sem documento, o orçamento sai sem CNPJ/CPF.
    'cliente', (select jsonb_build_object('nome', cl.nome, 'razao_social', cl.razao_social, 'tipo', cl.tipo,
                                          'cidade', cl.cidade, 'uf', cl.uf, 'tem_documento', cl.documento is not null)
                  from public.contatos ct join public.clientes cl on cl.id = ct.cliente_id
                 where ct.id = v_conv.contato_id and cl.ativo),
    'oportunidade', (select jsonb_build_object('titulo', op.titulo, 'resumo', op.resumo, 'etapa', e.nome)
                       from public.oportunidades op join public.etapas_funil e on e.id = op.etapa_id
                      where op.contato_id = v_conv.contato_id and op.fechada_em is null
                      order by op.criado_em desc limit 1),
    'etapas', (select jsonb_agg(e.nome order by e.ordem) from public.etapas_funil e where e.org_id = v_conv.org_id),
    'mensagens', (select coalesce(jsonb_agg(jsonb_build_object(
                     'de', case when m.automatica then 'mensagem automática do celular'
                                when m.autor_tipo = 'contato' then 'cliente' when m.autor_tipo = 'bot' then 'assistente'
                                when m.autor_tipo = 'atendente' then 'atendente' else 'sistema' end,
                     'tipo', m.tipo,
                     'texto', coalesce(m.transcricao, m.texto),
                     'descricao', m.descricao,
                     'em', to_char(m.criado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
                     'anterior', coalesce(m.criado_em < v_retomado, false)
                   ) order by m.criado_em), '[]'::jsonb)
                    from (select * from public.mensagens where conversa_id = p_conversa
                           order by criado_em desc limit p_limite) m)
  ) into v_res;
  return v_res;
end $$;
