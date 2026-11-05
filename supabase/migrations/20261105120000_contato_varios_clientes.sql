-- Um contato ligado a mais de um cliente (docs/clientes.md, "Contato de mais de uma empresa"; pedido da JoGrampo em
-- 05/11: a mesma compradora compra por 2 ou mais CNPJs do grupo).
--
-- Muda a decisão de 23/10 ("um contato é de no máximo um cliente"). A tabela contatos_clientes guarda todas as
-- empresas do contato; contatos.cliente_id continua como a PRINCIPAL, a que o pedido e a OS novos pegam quando ninguém
-- escolhe outra. Assim pedido, OS, nota, cobrança e campanhas seguem como estão. Regra que os gatilhos garantem: a
-- principal é sempre uma das ligações, e só fica vazia quando o contato não tem nenhuma.
--   - gravar contatos.cliente_id (tela antiga, importação, agente) cria a ligação; trocar a principal mantém a outra
--     ligação; apagar a principal (null) solta essa empresa e promove a ligação mais antiga que sobrar;
--   - criar a primeira ligação faz dela a principal; tirar a principal promove a mais antiga que sobrar.
-- Agente (decisões de 05/11):
--   - contato com 2 ou mais empresas: antes do primeiro orçamento, pergunta para qual delas é (montar_pedido recusa
--     sem a empresa e devolve a lista); o parâmetro novo p_empresa aceita o CNPJ/CPF ou o nome;
--   - CNPJ/CPF diferente do que o contato já tem: liga mais essa empresa (cadastra, se for nova), o orçamento em
--     aberto passa a sair nela e fica um aviso na conversa. Antes ele parava e chamava a equipe.
-- Importação de planilha: celular de contato já ligado a outro cliente ganha mais uma ligação (antes virava aviso).

-- ============================================================================
-- Ligações
-- ============================================================================
create table public.contatos_clientes (
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  contato_id uuid not null,
  cliente_id uuid not null,
  criado_por uuid references auth.users (id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  primary key (contato_id, cliente_id),
  foreign key (contato_id, org_id) references public.contatos (id, org_id) on delete cascade,
  foreign key (cliente_id, org_id) references public.clientes (id, org_id) on delete cascade
);
comment on table public.contatos_clientes is
  'Empresas (clientes) por que o contato compra; a principal fica em contatos.cliente_id';
create index contatos_clientes_cliente_idx on public.contatos_clientes (cliente_id);

insert into public.contatos_clientes (org_id, contato_id, cliente_id, criado_por, criado_em)
select org_id, id, cliente_id, null, criado_em from public.contatos where cliente_id is not null;

-- Ver: quem usa o contato (carteira ou "vê todos os clientes"). Ligar: quem edita o contato e vê o cliente.
-- Soltar: quem edita o contato.
alter table public.contatos_clientes enable row level security;
create policy contatos_clientes_ver on public.contatos_clientes for select to authenticated
  using (public.eh_membro(org_id) and public.pode_usar_contato(contato_id));
create policy contatos_clientes_ligar on public.contatos_clientes for insert to authenticated
  with check (public.eh_membro(org_id) and public.pode_ver_contato(contato_id) and public.pode_ver_cliente(cliente_id));
create policy contatos_clientes_soltar on public.contatos_clientes for delete to authenticated
  using (public.eh_membro(org_id) and public.pode_ver_contato(contato_id));
grant select, insert, delete on public.contatos_clientes to authenticated;

-- contatos.cliente_id → ligações. Roda depois de contatos_conferir_cliente, que barra o cliente que a pessoa não vê.
create function public.contatos_cliente_principal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_outro uuid;
begin
  if new.cliente_id is not null then
    insert into public.contatos_clientes (org_id, contato_id, cliente_id) values (new.org_id, new.id, new.cliente_id)
    on conflict do nothing;
  end if;
  if tg_op = 'UPDATE' and old.cliente_id is not null and new.cliente_id is null then
    delete from public.contatos_clientes where contato_id = new.id and cliente_id = old.cliente_id;
    select cliente_id into v_outro from public.contatos_clientes where contato_id = new.id
     order by criado_em, cliente_id limit 1;
    if v_outro is not null then
      update public.contatos set cliente_id = v_outro where id = new.id and cliente_id is null;
    end if;
  end if;
  return null;
end $$;
create trigger contatos_cliente_principal after insert or update of cliente_id on public.contatos
for each row execute function public.contatos_cliente_principal();

-- Ligações → contatos.cliente_id: a primeira vira a principal; tirar a principal promove a mais antiga que sobrar.
create function public.contatos_clientes_principal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.contatos set cliente_id = new.cliente_id where id = new.contato_id and cliente_id is null;
  else
    update public.contatos c set cliente_id = (
      select cc.cliente_id from public.contatos_clientes cc where cc.contato_id = old.contato_id
       order by cc.criado_em, cc.cliente_id limit 1)
     where c.id = old.contato_id and c.cliente_id = old.cliente_id;
  end if;
  return null;
end $$;
create trigger contatos_clientes_principal after insert or delete on public.contatos_clientes
for each row execute function public.contatos_clientes_principal();

-- Igual ao de 20261024120000, mais: escolher como principal um cliente que o contato já tem não passa pela conferência
-- (a ligação já existe; a promoção automática também cai aqui).
create or replace function public.contatos_conferir_cliente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.cliente_id is not null and auth.role() = 'authenticated'
     and (tg_op = 'INSERT' or new.cliente_id is distinct from old.cliente_id)
     and not exists (select 1 from public.contatos_clientes where contato_id = new.id and cliente_id = new.cliente_id)
     and not public.pode_ver_cliente(new.cliente_id) then
    raise exception 'cliente não encontrado';
  end if;
  return new;
end $$;

-- Igual ao de 20261024120000: o vendedor vê o cliente que tem um contato dele, agora por qualquer das ligações.
create or replace function public.pode_ver_cliente_linha(p_org uuid, p_cliente uuid, p_responsavel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org)
     and (
       public.ve_todos_clientes(p_org)
       or p_responsavel = auth.uid()
       or p_responsavel is null
       or exists (select 1 from public.contatos_clientes cc
                   where cc.cliente_id = p_cliente and public.pode_ver_contato(cc.contato_id))
     );
$$;

revoke execute on function public.contatos_cliente_principal(), public.contatos_clientes_principal()
from public, anon, authenticated;

-- ============================================================================
-- Importação de planilha
-- ============================================================================
-- Igual ao de 20261102130000: o celular de um contato que já é de outro cliente liga mais esta empresa.
create or replace function public.clientes_importar(p_org uuid, p_linhas jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_linha jsonb;
  v_n integer := 0;
  v_doc text;
  v_tipo text;
  v_nome text;
  v_cli uuid;
  v_ct public.contatos;
  v_cel text;
  v_criados integer := 0;
  v_atualizados integer := 0;
  v_ct_criados integer := 0;
  v_ct_ligados integer := 0;
  v_avisos jsonb := '[]';
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin importam clientes';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'a planilha não tem linhas';
  end if;
  if jsonb_array_length(p_linhas) > 5000 then
    raise exception 'no máximo 5.000 linhas por importação';
  end if;

  for v_linha in select x from jsonb_array_elements(p_linhas) x loop
    v_n := v_n + 1;
    -- Normaliza: só o texto útil de cada campo.
    select jsonb_object_agg(k, nullif(btrim(v), '')) into v_linha
      from jsonb_each_text(v_linha) as e(k, v);
    v_doc := public.limpar_documento(v_linha ->> 'documento');
    v_tipo := case when lower(coalesce(v_linha ->> 'tipo', '')) in ('pf', 'cpf', 'pessoa fisica', 'pessoa física', 'fisica', 'física') then 'pf'
                   when lower(coalesce(v_linha ->> 'tipo', '')) in ('pj', 'cnpj', 'pessoa juridica', 'pessoa jurídica', 'juridica', 'jurídica', 'empresa') then 'pj'
                   when length(v_doc) = 11 then 'pf'
                   else 'pj' end;
    if v_doc is not null and not ((v_tipo = 'pj' and public.cnpj_valido(v_doc)) or (v_tipo = 'pf' and public.cpf_valido(v_doc))) then
      v_avisos := v_avisos || to_jsonb(format('Linha %s: %s %s inválido, entrou sem documento.', v_n,
                                              case when v_tipo = 'pf' then 'CPF' else 'CNPJ' end, v_linha ->> 'documento'));
      v_doc := null;
    end if;
    v_nome := left(coalesce(v_linha ->> 'nome', v_linha ->> 'razao_social'), 200);
    if v_nome is null and v_doc is null then
      v_avisos := v_avisos || to_jsonb(format('Linha %s: sem nome nem CNPJ/CPF, ignorada.', v_n));
      continue;
    end if;
    -- CEP e UF fora do formato não derrubam a linha: ficam de fora, com aviso.
    if v_linha ->> 'cep' is not null and regexp_replace(v_linha ->> 'cep', '\D', '', 'g') !~ '^\d{8}$' then
      v_avisos := v_avisos || to_jsonb(format('Linha %s: CEP "%s" ignorado (precisa de 8 números).', v_n, v_linha ->> 'cep'));
      v_linha := v_linha - 'cep';
    end if;
    if v_linha ->> 'uf' is not null and upper(v_linha ->> 'uf') !~ '^[A-Z]{2}$' then
      v_avisos := v_avisos || to_jsonb(format('Linha %s: UF "%s" ignorada (use a sigla, ex.: PR).', v_n, v_linha ->> 'uf'));
      v_linha := v_linha - 'uf';
    end if;

    v_cli := null;
    if v_doc is not null then
      select id into v_cli from public.clientes where org_id = p_org and documento = v_doc;
    elsif v_nome is not null then
      select min(id::text)::uuid into v_cli from public.clientes
       where org_id = p_org and lower(nome) = lower(v_nome)
      having count(*) = 1;
    end if;

    if v_cli is null then
      if v_nome is null then
        v_nome := left(v_doc, 200);
      end if;
      insert into public.clientes (org_id, tipo, nome, razao_social, documento, inscricao_estadual, cep, logradouro, numero,
                                   complemento, bairro, cidade, uf, email, telefone, observacoes)
      values (p_org, v_tipo, v_nome, left(v_linha ->> 'razao_social', 200), v_doc, left(v_linha ->> 'inscricao_estadual', 30),
              v_linha ->> 'cep', left(v_linha ->> 'logradouro', 200), left(v_linha ->> 'numero', 20),
              left(v_linha ->> 'complemento', 100), left(v_linha ->> 'bairro', 100), left(v_linha ->> 'cidade', 100),
              v_linha ->> 'uf', left(v_linha ->> 'email', 200), left(v_linha ->> 'telefone', 30), left(v_linha ->> 'observacoes', 2000))
      returning id into v_cli;
      -- Cliente da empresa (o gatilho põe quem criou; importação é para a equipe toda).
      update public.clientes set responsavel_id = null where id = v_cli;
      v_criados := v_criados + 1;
    else
      update public.clientes c set
        tipo = case when v_doc is not null then v_tipo else c.tipo end,
        nome = coalesce(left(v_linha ->> 'nome', 200), c.nome),
        documento = coalesce(v_doc, c.documento),
        razao_social = coalesce(left(v_linha ->> 'razao_social', 200), c.razao_social),
        inscricao_estadual = coalesce(left(v_linha ->> 'inscricao_estadual', 30), c.inscricao_estadual),
        cep = coalesce(v_linha ->> 'cep', c.cep),
        logradouro = coalesce(left(v_linha ->> 'logradouro', 200), c.logradouro),
        numero = coalesce(left(v_linha ->> 'numero', 20), c.numero),
        complemento = coalesce(left(v_linha ->> 'complemento', 100), c.complemento),
        bairro = coalesce(left(v_linha ->> 'bairro', 100), c.bairro),
        cidade = coalesce(left(v_linha ->> 'cidade', 100), c.cidade),
        uf = coalesce(v_linha ->> 'uf', c.uf),
        email = coalesce(left(v_linha ->> 'email', 200), c.email),
        telefone = coalesce(left(v_linha ->> 'telefone', 30), c.telefone),
        observacoes = coalesce(left(v_linha ->> 'observacoes', 2000), c.observacoes)
       where c.id = v_cli;
      v_atualizados := v_atualizados + 1;
    end if;

    -- Celular → contato do WhatsApp (mesmo formato de contatos.telefone: só números, com 55).
    v_cel := regexp_replace(coalesce(v_linha ->> 'celular', ''), '\D', '', 'g');
    if length(v_cel) in (10, 11) then
      v_cel := '55' || v_cel;
    end if;
    if v_cel <> '' and v_cel ~ '^[0-9]{12,15}$' then
      select * into v_ct from public.contatos where org_id = p_org and telefone = v_cel;
      if v_ct.id is null then
        insert into public.contatos (org_id, telefone, nome, origem, cliente_id)
        values (p_org, v_cel, coalesce(left(v_linha ->> 'contato', 200), v_nome), 'importacao', v_cli)
        returning * into v_ct;
        update public.contatos set responsavel_id = null where id = v_ct.id;
        v_ct_criados := v_ct_criados + 1;
      elsif not exists (select 1 from public.contatos_clientes where contato_id = v_ct.id and cliente_id = v_cli) then
        -- Contato já ligado a outro cliente: ganha mais esta empresa (a principal não muda).
        insert into public.contatos_clientes (org_id, contato_id, cliente_id) values (p_org, v_ct.id, v_cli);
        v_ct_ligados := v_ct_ligados + 1;
      end if;
    elsif v_cel <> '' then
      v_avisos := v_avisos || to_jsonb(format('Linha %s: celular "%s" ignorado (use DDD + número).', v_n, v_linha ->> 'celular'));
    end if;
  end loop;

  perform public.auditar(p_org, 'clientes_importar', 'clientes', null, null,
                         jsonb_build_object('linhas', v_n, 'criados', v_criados, 'atualizados', v_atualizados));
  return jsonb_build_object('criados', v_criados, 'atualizados', v_atualizados, 'contatos_criados', v_ct_criados,
                            'contatos_ligados', v_ct_ligados, 'avisos', v_avisos);
end $$;

-- ============================================================================
-- Agente
-- ============================================================================
-- Igual ao de 20261024120000, mais a chave "clientes" (todas as empresas do contato).
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
    -- Todas as empresas do contato, a principal primeiro. CNPJ formatado para o agente escolher a do orçamento
    -- (montar_pedido com empresa); CPF não vai.
    'clientes', (select coalesce(jsonb_agg(jsonb_build_object(
                    'nome', cl.nome, 'razao_social', cl.razao_social, 'tipo', cl.tipo,
                    'cnpj', case when cl.tipo = 'pj' then public.formatar_documento(cl.documento) end,
                    'cidade', cl.cidade, 'uf', cl.uf, 'principal', cl.id = ct.cliente_id)
                  order by cl.id = ct.cliente_id desc, cc.criado_em), '[]'::jsonb)
                   from public.contatos ct
                   join public.contatos_clientes cc on cc.contato_id = ct.id
                   join public.clientes cl on cl.id = cc.cliente_id
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

-- Liga o contato da conversa a mais um cliente (o primeiro vira o principal) e o orçamento em aberto passa a sair nele.
create or replace function public.agente_ligar_cliente(p_conv public.conversas, p_cliente public.clientes, p_como text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_outros text;
begin
  select string_agg(coalesce(cl.razao_social, cl.nome), ', ' order by cc.criado_em) into v_outros
    from public.contatos_clientes cc join public.clientes cl on cl.id = cc.cliente_id
   where cc.contato_id = p_conv.contato_id and cc.cliente_id <> p_cliente.id;
  insert into public.contatos_clientes (org_id, contato_id, cliente_id)
  values (p_conv.org_id, p_conv.contato_id, p_cliente.id) on conflict do nothing;
  update public.pedidos set cliente_id = p_cliente.id
   where id = (public.agente_rascunho_atual(p_conv.id)).id and cliente_id is distinct from p_cliente.id;
  perform public.aviso_sistema(p_conv.id,
    case when v_outros is null then
      format('O agente ligou este contato ao cliente %s (%s %s), %s. Se estiver errado, desfaça no perfil do contato.',
             coalesce(p_cliente.razao_social, p_cliente.nome), case p_cliente.tipo when 'pj' then 'CNPJ' else 'CPF' end,
             public.formatar_documento(p_cliente.documento), p_como)
    else
      format('O agente ligou este contato também ao cliente %s (%s %s), %s. Ele já compra por %s; o orçamento em aberto passa a sair no novo. Se estiver errado, tire no perfil do contato.',
             coalesce(p_cliente.razao_social, p_cliente.nome), case p_cliente.tipo when 'pj' then 'CNPJ' else 'CPF' end,
             public.formatar_documento(p_cliente.documento), p_como, v_outros)
    end);
  return jsonb_build_object('sucesso', true, 'cliente', coalesce(p_cliente.razao_social, p_cliente.nome));
end $$;

-- Igual ao de 20261026130000, menos a recusa do contato que já tem cliente: o CNPJ/CPF de uma empresa que ele já tem
-- só faz o orçamento em aberto sair nela; o de outra empresa liga mais uma (agente_ligar_cliente).
create or replace function public.agente_identificar_cliente(p_conversa uuid, p_documento text, p_nome text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_doc record;
  v_cli public.clientes;
begin
  perform public.agente_marcar();
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    raise exception 'conversa não encontrada';
  end if;
  if v_conv.estado <> 'bot' then
    return jsonb_build_object('sucesso', false, 'aviso', 'A conversa está com a equipe.');
  end if;
  if not exists (select 1 from public.agentes where canal_id = v_conv.canal_id and identificar_cliente) then
    return jsonb_build_object('sucesso', false,
      'aviso', 'Esta empresa não identifica clientes pelo agente: guarde o CNPJ/CPF com atualizar_contato e siga.');
  end if;
  select * into v_doc from public.documento_cliente(p_documento);
  if v_doc.documento is null then
    return jsonb_build_object('sucesso', false,
      'aviso', 'CNPJ ou CPF inválido (os dígitos não conferem). Peça para o cliente conferir e mandar de novo.');
  end if;

  select cl.* into v_cli from public.contatos_clientes cc join public.clientes cl on cl.id = cc.cliente_id
   where cc.contato_id = v_conv.contato_id and cl.documento = v_doc.documento;
  if v_cli.id is not null then
    update public.pedidos set cliente_id = v_cli.id
     where id = (public.agente_rascunho_atual(p_conversa)).id and cliente_id is distinct from v_cli.id;
    return jsonb_build_object('sucesso', true, 'ja_identificado', true, 'cliente', coalesce(v_cli.razao_social, v_cli.nome));
  end if;

  select * into v_cli from public.clientes where org_id = v_conv.org_id and documento = v_doc.documento;
  if v_cli.id is null then
    return jsonb_build_object('sucesso', true, 'encontrado', false, 'tipo', v_doc.tipo,
      'aviso', case v_doc.tipo
        when 'pj' then 'Cliente novo. Confirme a razão social com o cliente e chame cadastrar_cliente com o CNPJ.'
        else 'Cliente novo. Peça o nome completo (se ainda não tiver) e chame cadastrar_cliente com o CPF e o nome.' end);
  end if;

  if v_cli.tipo = 'pf' then
    if nullif(btrim(coalesce(p_nome, '')), '') is null then
      return jsonb_build_object('sucesso', false, 'encontrado', true,
        'aviso', 'Para conferir o cadastro, peça o nome completo do cliente e chame identificar_cliente de novo com o CPF e o nome. Não diga o nome do cadastro.');
    end if;
    if not public.nomes_conferem(p_nome, v_cli.nome) then
      perform public.aviso_sistema(p_conversa,
        format('O contato informou o CPF %s com o nome "%s", que não confere com o cadastro (%s). O agente não ligou: confira.',
               public.formatar_documento(v_doc.documento), left(btrim(p_nome), 100), v_cli.nome));
      return jsonb_build_object('sucesso', false,
        'aviso', 'O nome não confere com o cadastro desse CPF. Não diga o nome do cadastro e não monte o orçamento: diga que a equipe vai conferir e chame chamar_humano.');
    end if;
  end if;

  return public.agente_ligar_cliente(v_conv, v_cli, 'pelo ' || case v_cli.tipo when 'pj' then 'CNPJ' else 'CPF e nome' end)
         || jsonb_build_object('encontrado', true);
end $$;

-- Igual ao de 20261026130000: cadastra também quando o contato já tem outra empresa, e liga mais esta.
create or replace function public.agente_cadastrar_cliente(p_conversa uuid, p_documento text, p_nome text, p_dados jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_doc record;
  v_cli public.clientes;
  v_resp uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_d jsonb := coalesce(p_dados, '{}');
  v_txt text;
  v_outros text;
begin
  perform public.agente_marcar();
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    raise exception 'conversa não encontrada';
  end if;
  if v_conv.estado <> 'bot' then
    return jsonb_build_object('sucesso', false, 'aviso', 'A conversa está com a equipe.');
  end if;
  if not exists (select 1 from public.agentes where canal_id = v_conv.canal_id and identificar_cliente) then
    return jsonb_build_object('sucesso', false,
      'aviso', 'Esta empresa não identifica clientes pelo agente: guarde o CNPJ/CPF com atualizar_contato e siga.');
  end if;
  select * into v_doc from public.documento_cliente(p_documento);
  if v_doc.documento is null then
    return jsonb_build_object('sucesso', false,
      'aviso', 'CNPJ ou CPF inválido (os dígitos não conferem). Peça para o cliente conferir e mandar de novo.');
  end if;
  -- Já existe: o caminho é o da identificação, que confere tudo.
  if exists (select 1 from public.clientes where org_id = v_conv.org_id and documento = v_doc.documento) then
    return public.agente_identificar_cliente(p_conversa, v_doc.documento, p_nome);
  end if;
  v_nome := coalesce(v_nome, nullif(btrim(v_d ->> 'razao_social'), ''));
  if v_nome is null or length(v_nome) < 3 then
    return jsonb_build_object('sucesso', false,
      'aviso', case v_doc.tipo when 'pj' then 'Peça a razão social da empresa e chame cadastrar_cliente de novo com ela.'
                               else 'Peça o nome completo do cliente e chame cadastrar_cliente de novo com ele.' end);
  end if;

  -- Carteira: quem atende a conversa; senão, o responsável pelo contato (se for da equipe).
  select u into v_resp from (values (v_conv.atribuida_a), ((select responsavel_id from public.contatos where id = v_conv.contato_id))) x(u)
   where u is not null and exists (select 1 from public.membros_org m where m.org_id = v_conv.org_id and m.user_id = x.u and m.ativo)
   limit 1;

  v_txt := nullif(regexp_replace(coalesce(v_d ->> 'cep', ''), '\D', '', 'g'), '');
  insert into public.clientes (org_id, tipo, nome, razao_social, documento, cep, logradouro, numero, complemento, bairro,
                               cidade, uf, email, responsavel_id, criado_por, observacoes)
  values (v_conv.org_id, v_doc.tipo,
          left(coalesce(case when v_doc.tipo = 'pj' then nullif(btrim(v_d ->> 'nome'), '') end, v_nome), 200),
          case when v_doc.tipo = 'pj' then left(coalesce(nullif(btrim(v_d ->> 'razao_social'), ''), v_nome), 200) end,
          v_doc.documento,
          case when v_txt ~ '^\d{8}$' then v_txt end,
          left(nullif(btrim(v_d ->> 'logradouro'), ''), 200), left(nullif(btrim(v_d ->> 'numero'), ''), 20),
          left(nullif(btrim(v_d ->> 'complemento'), ''), 100), left(nullif(btrim(v_d ->> 'bairro'), ''), 100),
          left(nullif(btrim(v_d ->> 'cidade'), ''), 100),
          case when upper(btrim(coalesce(v_d ->> 'uf', ''))) ~ '^[A-Z]{2}$' then upper(btrim(v_d ->> 'uf')) end,
          left(nullif(lower(btrim(v_d ->> 'email')), ''), 200), v_resp, null,
          case when v_d ? 'razao_social' then 'Cadastrado pelo agente com os dados da Receita.' else 'Cadastrado pelo agente com os dados informados pelo cliente.' end)
  returning * into v_cli;

  select string_agg(coalesce(cl.razao_social, cl.nome), ', ' order by cc.criado_em) into v_outros
    from public.contatos_clientes cc join public.clientes cl on cl.id = cc.cliente_id
   where cc.contato_id = v_conv.contato_id;
  insert into public.contatos_clientes (org_id, contato_id, cliente_id) values (v_conv.org_id, v_conv.contato_id, v_cli.id);
  update public.pedidos set cliente_id = v_cli.id where id = (public.agente_rascunho_atual(p_conversa)).id;
  perform public.aviso_sistema(p_conversa,
    format('O agente cadastrou o cliente %s (%s %s)%s e ligou este contato %sa ele.%s Confira em Clientes.',
           coalesce(v_cli.razao_social, v_cli.nome), case v_cli.tipo when 'pj' then 'CNPJ' else 'CPF' end,
           public.formatar_documento(v_cli.documento),
           case when v_d ? 'razao_social' then ' com os dados da Receita' else '' end,
           case when v_outros is not null then 'também ' else '' end,
           case when v_outros is not null then format(' Ele já compra por %s; o orçamento em aberto passa a sair no novo.', v_outros) else '' end));
  return jsonb_build_object('sucesso', true, 'cadastrado', true, 'cliente', coalesce(v_cli.razao_social, v_cli.nome));
end $$;

-- Montagem do orçamento: além da identificação (20261026130000), a empresa quando o contato tem mais de uma.
-- p_empresa: o CNPJ/CPF ou o nome de uma das empresas do contato.
drop function public.agente_montar_pedido(uuid, jsonb, text);
create function public.agente_montar_pedido(p_conversa uuid, p_itens jsonb, p_observacao text default null,
                                            p_empresa text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_n integer;
  v_lista text;
  v_cli public.clientes;
  v_digitos text := regexp_replace(coalesce(p_empresa, ''), '\D', '', 'g');
  v_termo text := public.sem_acento(lower(btrim(coalesce(p_empresa, ''))));
  v_ped public.pedidos;
  v_res jsonb;
begin
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    raise exception 'conversa não encontrada';
  end if;
  if v_conv.estado = 'bot'
     and exists (select 1 from public.agentes where canal_id = v_conv.canal_id and identificar_cliente)
     and not exists (select 1 from public.contatos_clientes where contato_id = v_conv.contato_id) then
    return jsonb_build_object('sucesso', false, 'identificar_cliente', true,
      'aviso', 'Antes do orçamento, identifique o cliente: peça o CNPJ (empresa) ou o CPF (pessoa) e chame identificar_cliente. Não monte o pedido antes disso.');
  end if;

  select count(*), string_agg(coalesce(cl.razao_social, cl.nome), '; ' order by cc.criado_em) into v_n, v_lista
    from public.contatos_clientes cc join public.clientes cl on cl.id = cc.cliente_id
   where cc.contato_id = v_conv.contato_id and cl.ativo;

  if v_termo <> '' then
    select cl.* into v_cli
      from public.contatos_clientes cc join public.clientes cl on cl.id = cc.cliente_id
     where cc.contato_id = v_conv.contato_id and cl.ativo
       and ((length(v_digitos) >= 11 and cl.documento = v_digitos)
            or v_termo in (public.sem_acento(lower(cl.nome)), public.sem_acento(lower(coalesce(cl.razao_social, '')))))
     order by cc.criado_em limit 1;
    if v_cli.id is null then
      return jsonb_build_object('sucesso', false,
        'aviso', 'Essa empresa não está entre as deste WhatsApp' || coalesce(' (' || v_lista || ')', '') ||
                 '. Se o cliente passou um CNPJ ou CPF novo, chame identificar_cliente com ele; senão, pergunte de novo para qual empresa é o orçamento.');
    end if;
  elsif v_n >= 2 and (public.agente_rascunho_atual(p_conversa)).id is null then
    return jsonb_build_object('sucesso', false, 'escolher_empresa', true,
      'empresas', (select jsonb_agg(coalesce(cl.razao_social, cl.nome) order by cc.criado_em)
                     from public.contatos_clientes cc join public.clientes cl on cl.id = cc.cliente_id
                    where cc.contato_id = v_conv.contato_id and cl.ativo),
      'aviso', 'Este WhatsApp compra por mais de uma empresa (' || v_lista || '). Antes do orçamento, pergunte numa frase para qual delas ele é e monte de novo com empresa = o nome ou o CNPJ da escolhida.');
  end if;

  v_res := public.agente_montar_pedido_itens(p_conversa, p_itens, p_observacao);
  if coalesce((v_res ->> 'sucesso')::boolean, false) then
    v_ped := public.agente_rascunho_atual(p_conversa);
    if v_cli.id is not null and v_ped.cliente_id is distinct from v_cli.id then
      update public.pedidos set cliente_id = v_cli.id where id = v_ped.id returning * into v_ped;
    end if;
    if v_n >= 2 then
      v_res := v_res || jsonb_build_object(
        'empresa', (select coalesce(razao_social, nome) from public.clientes where id = v_ped.cliente_id),
        'aviso_empresa', 'Este WhatsApp compra por mais de uma empresa: ao confirmar, diga em nome de qual empresa o orçamento sai.');
    end if;
  end if;
  return v_res;
end $$;

revoke execute on function public.agente_montar_pedido(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.agente_montar_pedido(uuid, jsonb, text, text) to service_role;
