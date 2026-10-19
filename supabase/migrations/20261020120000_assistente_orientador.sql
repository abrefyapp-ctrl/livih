-- Assistente orientador (item 8; plano em docs/assistente-orientador.md).
--
-- Conversa que monta (empresa nova) ou revisa (agente existente) as instruções, as regras de chamar a equipe e a
-- base de conhecimento, e devolve uma PROPOSTA com antes e depois. Nada é aplicado sem o dono/admin mandar; aplicar
-- guarda a foto do antes para desfazer. Decisões de 20/10: gpt-5, dono/admin e plataforma, todos os planos.

create table public.assistente_sessoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  criado_por uuid references auth.users (id) on delete set null,
  modo text not null check (modo in ('montar', 'revisar')),
  status text not null default 'conversando'
    check (status in ('conversando', 'pensando', 'proposta', 'aplicada', 'desfeita', 'erro')),
  mensagens jsonb not null default '[]',
  proposta jsonb,
  anterior jsonb,
  erro text,
  aplicada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index assistente_sessoes_org_idx on public.assistente_sessoes (org_id, criado_em desc);
create trigger assistente_sessoes_atualizado_em before update on public.assistente_sessoes
for each row execute function public.tocar_atualizado_em();

alter table public.assistente_sessoes enable row level security;
create policy assistente_sessoes_ver on public.assistente_sessoes for select to authenticated
  using (public.tem_papel(org_id, '{dono,admin}'));
revoke insert, update, delete on public.assistente_sessoes from anon, authenticated;

alter table public.uso_ia drop constraint uso_ia_tipo_check;
alter table public.uso_ia add constraint uso_ia_tipo_check
  check (tipo in ('resposta', 'transcricao', 'descricao', 'simulador', 'importacao', 'assistente'));

-- Preço de tabela do gpt-5 em 20/10 (fonte: agregadores; conferir no painel da OpenAI).
insert into public.precos_ia (modelo, usd_por_milhao_entrada, usd_por_milhao_saida, observacao)
values ('gpt-5', 1.25, 10.00, 'Assistente orientador (20/10). Conferir no painel da OpenAI.')
on conflict (modelo) do nothing;

-- ============================================================================
-- Aplicar a proposta (seções escolhidas) e desfazer
-- ============================================================================
-- p_secoes: { "instrucoes": bool, "regras": bool, "base": [índices da proposta.base aprovados] }
-- proposta: { instrucoes: {texto}, regras: {lista}, base: [{acao: criar|atualizar|desativar, id, titulo, conteudo}] }
create function public.assistente_aplicar(p_sessao uuid, p_secoes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s public.assistente_sessoes;
  v_ag public.agentes;
  v_item jsonb;
  v_idx integer;
  v_antes_base jsonb := '[]';
  v_criados jsonb := '[]';
  v_novo uuid;
  v_aplicou integer := 0;
begin
  select * into v_s from public.assistente_sessoes where id = p_sessao for update;
  if v_s.id is null or not public.tem_papel(v_s.org_id, '{dono,admin}') then
    raise exception 'sessão não encontrada';
  end if;
  if v_s.proposta is null or v_s.status not in ('proposta', 'conversando') then
    raise exception 'não há proposta para aplicar';
  end if;
  select * into v_ag from public.agentes where org_id = v_s.org_id order by ativo desc, atualizado_em desc limit 1;
  if v_ag.id is null then
    raise exception 'empresa sem agente';
  end if;

  -- Instruções e regras (as outras linhas do agente acompanham pelo trigger agentes_sincronizar).
  if coalesce((p_secoes ->> 'instrucoes')::boolean, false) and v_s.proposta -> 'instrucoes' ->> 'texto' is not null then
    update public.agentes set prompt = v_s.proposta -> 'instrucoes' ->> 'texto' where id = v_ag.id;
    v_aplicou := v_aplicou + 1;
  end if;
  if coalesce((p_secoes ->> 'regras')::boolean, false) and jsonb_typeof(v_s.proposta -> 'regras' -> 'lista') = 'array' then
    update public.agentes
       set regras_humano = coalesce(regras_humano, '{}'::jsonb) || jsonb_build_object('casos', v_s.proposta -> 'regras' -> 'lista')
     where id = v_ag.id;
    v_aplicou := v_aplicou + 1;
  end if;

  -- Base: só os itens aprovados; guarda como estavam.
  for v_idx in select (x #>> '{}')::integer from jsonb_array_elements(coalesce(p_secoes -> 'base', '[]')) x loop
    v_item := v_s.proposta -> 'base' -> v_idx;
    continue when v_item is null;
    if v_item ->> 'acao' = 'criar' then
      insert into public.base_conhecimento (org_id, titulo, conteudo, ativo)
      values (v_s.org_id, left(v_item ->> 'titulo', 200), v_item ->> 'conteudo', true)
      returning id into v_novo;
      v_criados := v_criados || to_jsonb(v_novo);
      v_aplicou := v_aplicou + 1;
    elsif v_item ->> 'acao' in ('atualizar', 'desativar') then
      select v_antes_base || coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'titulo', b.titulo, 'conteudo', b.conteudo, 'ativo', b.ativo)), '[]')
        into v_antes_base
        from public.base_conhecimento b where b.id = (v_item ->> 'id')::uuid and b.org_id = v_s.org_id;
      if v_item ->> 'acao' = 'atualizar' then
        update public.base_conhecimento
           set titulo = coalesce(left(v_item ->> 'titulo', 200), titulo), conteudo = coalesce(v_item ->> 'conteudo', conteudo)
         where id = (v_item ->> 'id')::uuid and org_id = v_s.org_id;
      else
        update public.base_conhecimento set ativo = false where id = (v_item ->> 'id')::uuid and org_id = v_s.org_id;
      end if;
      v_aplicou := v_aplicou + 1;
    end if;
  end loop;

  if v_aplicou = 0 then
    raise exception 'escolha ao menos uma parte da proposta';
  end if;
  update public.assistente_sessoes
     set status = 'aplicada', aplicada_em = now(),
         anterior = jsonb_build_object('agente_id', v_ag.id, 'prompt', v_ag.prompt, 'regras_humano', v_ag.regras_humano,
                                       'base', v_antes_base, 'criados', v_criados)
   where id = p_sessao;
  return jsonb_build_object('aplicadas', v_aplicou);
end $$;

create function public.assistente_desfazer(p_sessao uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_s public.assistente_sessoes;
  v_b jsonb;
begin
  select * into v_s from public.assistente_sessoes where id = p_sessao for update;
  if v_s.id is null or not public.tem_papel(v_s.org_id, '{dono,admin}') then
    raise exception 'sessão não encontrada';
  end if;
  if v_s.status <> 'aplicada' or v_s.anterior is null then
    raise exception 'nada para desfazer';
  end if;
  update public.agentes
     set prompt = v_s.anterior ->> 'prompt', regras_humano = v_s.anterior -> 'regras_humano'
   where id = (v_s.anterior ->> 'agente_id')::uuid and org_id = v_s.org_id;
  for v_b in select * from jsonb_array_elements(v_s.anterior -> 'base') loop
    update public.base_conhecimento
       set titulo = v_b ->> 'titulo', conteudo = v_b ->> 'conteudo', ativo = (v_b ->> 'ativo')::boolean
     where id = (v_b ->> 'id')::uuid and org_id = v_s.org_id;
  end loop;
  delete from public.base_conhecimento
   where org_id = v_s.org_id and id in (select (x #>> '{}')::uuid from jsonb_array_elements(v_s.anterior -> 'criados') x);
  update public.assistente_sessoes set status = 'desfeita' where id = p_sessao;
end $$;

revoke execute on function public.assistente_aplicar(uuid, jsonb), public.assistente_desfazer(uuid) from public, anon;
grant execute on function public.assistente_aplicar(uuid, jsonb), public.assistente_desfazer(uuid) to authenticated;

-- ============================================================================
-- Simulador com a base proposta (testar a proposta antes de aplicar)
-- ============================================================================
drop function public.agente_contexto_simulado(uuid, jsonb, text, jsonb);

create function public.agente_contexto_simulado(p_org uuid, p_mensagens jsonb, p_prompt text default null,
                                                p_casos jsonb default null, p_base text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ag public.agentes;
  v_agora text := to_char(clock_timestamp() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
begin
  select * into v_ag from public.agentes where org_id = p_org order by ativo desc, atualizado_em desc limit 1;
  if v_ag.id is null then
    raise exception 'empresa sem agente';
  end if;
  if jsonb_typeof(p_mensagens) is distinct from 'array' then
    raise exception 'mensagens inválidas';
  end if;

  return jsonb_build_object(
    'conversa', jsonb_build_object('id', null, 'estado', 'bot'),
    'dentro_do_horario', public.agente_no_horario(v_ag.horario, clock_timestamp()),
    'primeira_resposta', not exists (select 1 from jsonb_array_elements(p_mensagens) m where m ->> 'de' = 'assistente'),
    'retomado_em', null,
    'organizacao', (select jsonb_build_object('nome', o.nome) from public.organizacoes o where o.id = p_org),
    'agente', jsonb_build_object(
      'nome', v_ag.nome, 'modelo', v_ag.modelo, 'prompt', coalesce(p_prompt, v_ag.prompt),
      'regras_humano', case when jsonb_typeof(p_casos) = 'array'
                            then coalesce(v_ag.regras_humano, '{}'::jsonb) || jsonb_build_object('casos', p_casos)
                            else v_ag.regras_humano end,
      'mensagem_fora_horario', v_ag.mensagem_fora_horario, 'horario', v_ag.horario, 'saudacao', v_ag.saudacao),
    'base_conhecimento', coalesce(p_base, (select string_agg('## ' || b.titulo || E'\n\n' || b.conteudo, E'\n\n---\n\n' order by b.titulo)
                            from public.base_conhecimento b where b.org_id = p_org and b.ativo)),
    'contato', jsonb_build_object('nome', null, 'nome_whatsapp', 'Cliente de teste', 'telefone', null, 'empresa', null,
                                  'email', null, 'dados', '{}'::jsonb),
    'oportunidade', null,
    'etapas', (select jsonb_agg(e.nome order by e.ordem) from public.etapas_funil e where e.org_id = p_org),
    'mensagens', (select coalesce(jsonb_agg(jsonb_build_object(
                     'de', case when t.m ->> 'de' = 'assistente' then 'assistente' else 'cliente' end,
                     'tipo', 'texto', 'texto', left(coalesce(t.m ->> 'texto', ''), 4000), 'descricao', null,
                     'em', v_agora, 'anterior', false) order by t.ord), '[]'::jsonb)
                    from jsonb_array_elements(p_mensagens) with ordinality t(m, ord))
  );
end $$;

revoke execute on function public.agente_contexto_simulado(uuid, jsonb, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.agente_contexto_simulado(uuid, jsonb, text, jsonb, text) to service_role;
