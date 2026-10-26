-- O agente identifica o cliente pelo CNPJ/CPF antes do orçamento (docs/agente-identificar-cliente.md; pedido da
-- JoGrampo em 26/10: ~1.250 clientes importados, quase nenhum com o WhatsApp ligado).
--
-- Muda a decisão de 23/10 (docs/clientes.md: "o agente só lê o cliente do contato"): agora ele liga o contato ao
-- cliente que já existe e cadastra o cliente novo. Cuidados:
--   - CNPJ achado: liga sozinho e confirma só a razão social (dado público);
--   - CPF achado: liga só se o nome informado bater com o do cadastro (confirmar de quem é um CPF vazaria dado pessoal);
--   - contato já ligado a outro cliente: não troca, chama a equipe;
--   - cada ligação ou cadastro vira um aviso na conversa para a equipe conferir (dá para desfazer no perfil do contato);
--   - a carteira do cliente que já existe não muda; o cliente novo fica com quem atende a conversa.
-- Por canal (agentes.identificar_cliente, como as outras regras do agente): ligado, a montagem do pedido recusa
-- contato sem cliente, para o agente não pular a etapa; desligado, o agente não liga nem cadastra (como antes).

alter table public.agentes add column identificar_cliente boolean not null default false;
comment on column public.agentes.identificar_cliente is
  'O agente pede CNPJ/CPF e liga ou cadastra o cliente antes de montar o orçamento';

-- As outras linhas do agente da empresa acompanham (igual a 20261010140000, com identificar_cliente).
create or replace function public.agentes_sincronizar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if (new.prompt, new.regras_humano, new.telefone_alerta, new.modelo, new.saudacao, new.horario, new.mensagem_fora_horario,
      new.identificar_cliente)
     is distinct from
     (old.prompt, old.regras_humano, old.telefone_alerta, old.modelo, old.saudacao, old.horario, old.mensagem_fora_horario,
      old.identificar_cliente) then
    update public.agentes
       set prompt = new.prompt, regras_humano = new.regras_humano,
           telefone_alerta = new.telefone_alerta, modelo = new.modelo,
           saudacao = new.saudacao, horario = new.horario, mensagem_fora_horario = new.mensagem_fora_horario,
           identificar_cliente = new.identificar_cliente
     where org_id = new.org_id and id <> new.id;
  end if;
  return new;
end $$;

-- "Maria da Silva Souza" e "maria souza" conferem: mesmo primeiro e mesmo último nome, sem acento e sem "da/de/do".
create function public.nomes_conferem(p_a text, p_b text) returns boolean
language sql immutable set search_path = '' as $$
  with a as (select array_agg(w order by n) t from regexp_split_to_table(public.sem_acento(lower(coalesce(p_a, ''))), '[^a-z]+')
                                                  with ordinality x(w, n) where length(w) > 1 and w not in ('da', 'de', 'do', 'das', 'dos')),
       b as (select array_agg(w order by n) t from regexp_split_to_table(public.sem_acento(lower(coalesce(p_b, ''))), '[^a-z]+')
                                                  with ordinality x(w, n) where length(w) > 1 and w not in ('da', 'de', 'do', 'das', 'dos'))
  select coalesce(cardinality(a.t) >= 2 and cardinality(b.t) >= 2 and a.t[1] = b.t[1]
                  and a.t[cardinality(a.t)] = b.t[cardinality(b.t)], false)
    from a, b;
$$;

-- CNPJ/CPF válido → (tipo, documento); senão null.
create function public.documento_cliente(p text, out tipo text, out documento text)
language plpgsql immutable set search_path = '' as $$
declare
  v text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(v) = 14 and public.cnpj_valido(v) then tipo := 'pj'; documento := v;
  elsif length(v) = 11 and public.cpf_valido(v) then tipo := 'pf'; documento := v;
  end if;
end $$;

create function public.formatar_documento(p text) returns text
language sql immutable set search_path = '' as $$
  select case length(p)
    when 14 then substr(p, 1, 2) || '.' || substr(p, 3, 3) || '.' || substr(p, 6, 3) || '/' || substr(p, 9, 4) || '-' || substr(p, 13, 2)
    when 11 then substr(p, 1, 3) || '.' || substr(p, 4, 3) || '.' || substr(p, 7, 3) || '-' || substr(p, 10, 2)
    else p end;
$$;

-- Liga o contato da conversa ao cliente (o gatilho contatos_cliente_nos_rascunhos leva o cliente aos rascunhos).
create function public.agente_ligar_cliente(p_conv public.conversas, p_cliente public.clientes, p_como text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.contatos set cliente_id = p_cliente.id where id = p_conv.contato_id;
  perform public.aviso_sistema(p_conv.id,
    format('O agente ligou este contato ao cliente %s (%s %s), %s. Se estiver errado, desfaça no perfil do contato.',
           coalesce(p_cliente.razao_social, p_cliente.nome), case p_cliente.tipo when 'pj' then 'CNPJ' else 'CPF' end,
           public.formatar_documento(p_cliente.documento), p_como));
  return jsonb_build_object('sucesso', true, 'cliente', coalesce(p_cliente.razao_social, p_cliente.nome));
end $$;

-- Identifica o cliente pelo CNPJ/CPF que o contato informou. p_nome: o nome completo, para conferir o CPF.
create function public.agente_identificar_cliente(p_conversa uuid, p_documento text, p_nome text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_doc record;
  v_atual public.clientes;
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

  select cl.* into v_atual from public.clientes cl join public.contatos ct on ct.cliente_id = cl.id
   where ct.id = v_conv.contato_id;
  if v_atual.id is not null then
    if v_atual.documento = v_doc.documento then
      return jsonb_build_object('sucesso', true, 'ja_identificado', true, 'cliente', coalesce(v_atual.razao_social, v_atual.nome));
    end if;
    perform public.aviso_sistema(p_conversa,
      format('O contato informou o %s %s, mas já está ligado ao cliente %s. O agente não trocou: confira.',
             case v_doc.tipo when 'pj' then 'CNPJ' else 'CPF' end, public.formatar_documento(v_doc.documento),
             coalesce(v_atual.razao_social, v_atual.nome)));
    return jsonb_build_object('sucesso', false,
      'aviso', 'Este contato já está ligado a outro cliente no cadastro. Não troque e não monte o orçamento: diga que a equipe vai conferir e chame chamar_humano.');
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

-- Cadastra o cliente novo e liga o contato. p_dados: o que a Receita devolveu (BrasilAPI, pelo n8n), nos nomes da
-- tabela clientes: razao_social, nome (fantasia), cep, logradouro, numero, complemento, bairro, cidade, uf, email.
create function public.agente_cadastrar_cliente(p_conversa uuid, p_documento text, p_nome text, p_dados jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversas;
  v_doc record;
  v_cli public.clientes;
  v_resp uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_d jsonb := coalesce(p_dados, '{}');
  v_txt text;
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
  -- Já existe (ou o contato já tem cliente): o caminho é o da identificação, que confere tudo.
  if exists (select 1 from public.clientes where org_id = v_conv.org_id and documento = v_doc.documento)
     or exists (select 1 from public.contatos where id = v_conv.contato_id and cliente_id is not null) then
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

  update public.contatos set cliente_id = v_cli.id where id = v_conv.contato_id;
  perform public.aviso_sistema(p_conversa,
    format('O agente cadastrou o cliente %s (%s %s)%s e ligou este contato a ele. Confira em Clientes.',
           coalesce(v_cli.razao_social, v_cli.nome), case v_cli.tipo when 'pj' then 'CNPJ' else 'CPF' end,
           public.formatar_documento(v_cli.documento),
           case when v_d ? 'razao_social' then ' com os dados da Receita' else '' end));
  return jsonb_build_object('sucesso', true, 'cadastrado', true, 'cliente', coalesce(v_cli.razao_social, v_cli.nome));
end $$;

-- A montagem do pedido passa a conferir a identificação. O corpo de antes (20261019140000) segue igual, com outro nome.
alter function public.agente_montar_pedido(uuid, jsonb, text) rename to agente_montar_pedido_itens;

create function public.agente_montar_pedido(p_conversa uuid, p_itens jsonb, p_observacao text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.conversas v
      join public.agentes a on a.canal_id = v.canal_id and a.identificar_cliente
      join public.contatos ct on ct.id = v.contato_id and ct.cliente_id is null
     where v.id = p_conversa and v.estado = 'bot'
  ) then
    return jsonb_build_object('sucesso', false, 'identificar_cliente', true,
      'aviso', 'Antes do orçamento, identifique o cliente: peça o CNPJ (empresa) ou o CPF (pessoa) e chame identificar_cliente. Não monte o pedido antes disso.');
  end if;
  return public.agente_montar_pedido_itens(p_conversa, p_itens, p_observacao);
end $$;

-- Simulador: não há contato. Mostra o que aconteceria, sem ligar nem cadastrar.
create function public.simulador_identificar_cliente(p_org uuid, p_documento text, p_nome text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_doc record;
  v_cli public.clientes;
begin
  select * into v_doc from public.documento_cliente(p_documento);
  if v_doc.documento is null then
    return jsonb_build_object('sucesso', false, 'aviso', 'CNPJ ou CPF inválido (os dígitos não conferem). Peça para o cliente conferir e mandar de novo.');
  end if;
  select * into v_cli from public.clientes where org_id = p_org and documento = v_doc.documento;
  if v_cli.id is null then
    return jsonb_build_object('sucesso', true, 'simulado', true, 'encontrado', false, 'tipo', v_doc.tipo,
      'aviso', 'Simulador: cliente novo. Na conversa de verdade, confirme os dados e chame cadastrar_cliente.');
  end if;
  return jsonb_build_object('sucesso', true, 'simulado', true, 'encontrado', true,
    'cliente', case when v_cli.tipo = 'pj' then coalesce(v_cli.razao_social, v_cli.nome) end,
    'aviso', 'Simulador: na conversa de verdade o contato seria ligado a este cliente' ||
             case when v_cli.tipo = 'pf' then ' (se o nome conferir).' else '.' end);
end $$;

revoke execute on function public.agente_identificar_cliente(uuid, text, text), public.agente_cadastrar_cliente(uuid, text, text, jsonb),
  public.agente_montar_pedido(uuid, jsonb, text), public.agente_montar_pedido_itens(uuid, jsonb, text),
  public.agente_ligar_cliente(public.conversas, public.clientes, text), public.simulador_identificar_cliente(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.agente_identificar_cliente(uuid, text, text), public.agente_cadastrar_cliente(uuid, text, text, jsonb),
  public.agente_montar_pedido(uuid, jsonb, text), public.simulador_identificar_cliente(uuid, text, text)
to service_role;
