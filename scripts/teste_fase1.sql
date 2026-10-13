-- Teste da fase 1. Rodar com scripts/testar_migrations.py, que aplica as migrations e este
-- arquivo dentro de begin … rollback: nada fica no banco.

create temp table resultado (n serial, teste text, ok boolean);
grant all on resultado to authenticated, service_role;
grant usage on sequence resultado_n_seq to authenticated, service_role;

-- usuários de teste
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@teste.livih', '{"nome":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'atendente@f7.teste', '{"nome":"Ana"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'outro@cliente.teste', '{"nome":"Caio"}');
insert into public.admins_plataforma (user_id) values ('00000000-0000-0000-0000-0000000000a1');

insert into resultado (teste, ok)
select 'perfil criado no cadastro', count(*) = 3 from public.perfis where user_id::text like '00000000-0000-0000-0000-0000000000%';

-- como admin da plataforma: cria F7 e um cliente
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare v_f7 uuid; v_cli uuid;
begin
  v_f7 := public.criar_organizacao('F7 Teste', 'teste-f7');
  v_cli := public.criar_organizacao('Cliente X', 'teste-cliente-x');
  insert into public.membros_org (org_id, user_id, papel) values
    (v_f7, '00000000-0000-0000-0000-0000000000b1', 'atendente'),
    (v_cli, '00000000-0000-0000-0000-0000000000c1', 'dono');
  insert into public.canais (org_id, nome, telefone, instance_id)
    values (v_f7, 'WhatsApp F7', '5541999990000', 'INST-F7');
  insert into public.agentes (org_id, canal_id, ativo, prompt)
    select v_f7, id, true, 'prompt' from public.canais where instance_id = 'INST-F7';
  perform set_config('teste.f7', v_f7::text, true);
  perform set_config('teste.cli', v_cli::text, true);
end $$;

insert into resultado (teste, ok)
select 'organização nasce com 6 etapas', count(*) = 6 from public.etapas_funil
 where org_id = current_setting('teste.f7')::uuid;

insert into resultado (teste, ok)
select 'criador vira dono', exists (select 1 from public.membros_org
 where org_id = current_setting('teste.f7')::uuid and user_id = '00000000-0000-0000-0000-0000000000a1' and papel = 'dono');

-- atendente comum não cria organização
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.criar_organizacao('Pirata', 'pirata');
  insert into resultado (teste, ok) values ('atendente não cria organização', false);
exception when others then
  insert into resultado (teste, ok) values ('atendente não cria organização', true);
end $$;

-- sistema (Edge Function) registra entrada
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

do $$
declare r jsonb; r2 jsonb; v_canal uuid;
begin
  select id into v_canal from public.canais where instance_id = 'INST-F7';
  r := public.registrar_entrada(v_canal, 'WAMID-1', '5541988887777', null, 'Fulano', 'texto', 'Oi, quero um sistema', '{"x":1}');
  insert into resultado (teste, ok) values ('entrada chama o agente', (r ->> 'chamar_agente')::boolean and r ->> 'estado' = 'bot');
  r2 := public.registrar_entrada(v_canal, 'WAMID-1', '5541988887777', null, 'Fulano', 'texto', 'Oi, quero um sistema', '{"x":1}');
  insert into resultado (teste, ok) values ('mesma mensagem não entra duas vezes', (r2 ->> 'duplicada')::boolean);
  perform set_config('teste.conversa', r ->> 'conversa_id', true);
end $$;

insert into resultado (teste, ok)
select 'contato, conversa e 1 mensagem gravados',
  (select count(*) from public.contatos where org_id = current_setting('teste.f7')::uuid) = 1
  and (select count(*) from public.mensagens where org_id = current_setting('teste.f7')::uuid) = 1
  and (select nao_lidas from public.conversas where id = current_setting('teste.conversa')::uuid) = 1;

-- atendente responde e assume
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

select public.enviar_mensagem(current_setting('teste.conversa')::uuid, 'Olá! Me conta mais.');

insert into resultado (teste, ok)
select 'responder assume a conversa', estado = 'humano' and atribuida_a = '00000000-0000-0000-0000-0000000000b1' and nao_lidas = 0
  from public.conversas where id = current_setting('teste.conversa')::uuid;

insert into resultado (teste, ok)
select 'resposta entra na fila', count(*) = 1 from public.fila_envio where status = 'pendente' and org_id = current_setting('teste.f7')::uuid;

-- atendente não grava mensagem direto nem altera conteúdo
do $$ begin
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, texto, status_entrega)
  values (current_setting('teste.f7')::uuid, current_setting('teste.conversa')::uuid, 'saida', 'atendente', 'x', 'pendente');
  insert into resultado (teste, ok) values ('app não insere mensagem direto', false);
exception when others then
  insert into resultado (teste, ok) values ('app não insere mensagem direto', true);
end $$;

-- outra organização não enxerga nada da F7
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'outra organização não vê conversas, contatos nem mensagens',
  (select count(*) from public.conversas) = 0 and (select count(*) from public.contatos) = 0
  and (select count(*) from public.mensagens) = 0 and (select count(*) from public.etapas_funil) = 6;

do $$ begin
  perform public.enviar_mensagem(current_setting('teste.conversa')::uuid, 'invasão');
  insert into resultado (teste, ok) values ('outra organização não envia na conversa', false);
exception when others then
  insert into resultado (teste, ok) values ('outra organização não envia na conversa', true);
end $$;

do $$ begin
  perform public.registrar_entrada((select id from public.canais where instance_id = 'INST-F7'), 'X', '5541900000000', null, 'x', 'texto', 'x', '{}');
  insert into resultado (teste, ok) values ('app não chama registrar_entrada', false);
exception when others then
  insert into resultado (teste, ok) values ('app não chama registrar_entrada', true);
end $$;

-- conteúdo da mensagem é imutável (nem o dono do banco altera)
reset role;
do $$ begin
  update public.mensagens set texto = 'adulterado';
  insert into resultado (teste, ok) values ('mensagem não pode ser alterada', false);
exception when others then
  insert into resultado (teste, ok) values ('mensagem não pode ser alterada', true);
end $$;
do $$ begin
  delete from public.mensagens;
  insert into resultado (teste, ok) values ('mensagem não pode ser apagada', false);
exception when others then
  insert into resultado (teste, ok) values ('mensagem não pode ser apagada', true);
end $$;

-- fila: reivindica, envia, marca
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$
declare r record; n int := 0;
begin
  for r in select * from public.fila_reivindicar(10) loop
    n := n + 1;
    insert into resultado (teste, ok) values ('fila traz telefone e instância', r.telefone = '5541988887777' and r.instance_id = 'INST-F7');
    perform public.fila_resultado(r.fila_id, true, 'WAMID-OUT-1');
  end loop;
  insert into resultado (teste, ok) values ('fila reivindica 1', n = 1);
  insert into resultado (teste, ok) values ('fila não entrega de novo', (select count(*) from public.fila_reivindicar(10)) = 0);
end $$;

insert into resultado (teste, ok)
select 'mensagem marcada como enviada', status_entrega = 'enviada' and wa_id = 'WAMID-OUT-1'
  from public.mensagens where direcao = 'saida' and org_id = current_setting('teste.f7')::uuid;

select public.registrar_status_entrega((select id from public.canais where instance_id = 'INST-F7'), 'WAMID-OUT-1', 'lida');
select public.registrar_status_entrega((select id from public.canais where instance_id = 'INST-F7'), 'WAMID-OUT-1', 'entregue');
insert into resultado (teste, ok)
select 'recibo não regride (lida não volta para entregue)', status_entrega = 'lida'
  from public.mensagens where direcao = 'saida' and org_id = current_setting('teste.f7')::uuid;

-- falha de envio volta para a fila com espera
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select public.enviar_mensagem(current_setting('teste.conversa')::uuid, 'segunda');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare r record;
begin
  select * into r from public.fila_reivindicar(10);
  perform public.fila_resultado(r.fila_id, false, null, 'timeout');
  insert into resultado (teste, ok)
  select 'falha agenda nova tentativa', status = 'erro' and proxima_tentativa_em > now() from public.fila_envio where id = r.fila_id;
end $$;

-- CRM: oportunidade e histórico
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into public.oportunidades (org_id, contato_id, etapa_id, titulo)
select current_setting('teste.f7')::uuid, (select id from public.contatos limit 1),
       (select id from public.etapas_funil where org_id = current_setting('teste.f7')::uuid and nome = 'Novo'), 'Sistema de pedidos';
update public.oportunidades set etapa_id = (select id from public.etapas_funil
  where org_id = current_setting('teste.f7')::uuid and nome = 'Ganho')
 where org_id = current_setting('teste.f7')::uuid;
insert into resultado (teste, ok)
select 'ganho fecha a oportunidade e o histórico tem 2 passos',
  (select fechada_em is not null from public.oportunidades where org_id = current_setting('teste.f7')::uuid limit 1)
  and (select count(*) from public.oportunidade_historico where org_id = current_setting('teste.f7')::uuid) = 2;

-- auditoria: atendente não lê; dono lê a troca de estado
insert into resultado (teste, ok) select 'atendente não lê auditoria', count(*) = 0 from public.auditoria;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'auditoria registrou a conversa assumida', count(*) >= 1 from public.auditoria
 where acao = 'conversa_estado' and ator_tipo = 'atendente';

-- mensagem digitada no próprio celular: entra como saída do atendente e o bot para
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$
declare r jsonb; v_canal uuid; v_conv uuid;
begin
  select id into v_canal from public.canais where instance_id = 'INST-F7';
  perform public.registrar_entrada(v_canal, 'WAMID-NOVO-1', '5541977776666', null, 'Beltrano', 'texto', 'Oi', '{}');
  r := public.registrar_saida_celular(v_canal, 'WAMID-CEL-1', '5541977776666', null, 'texto', 'Já te respondo', '{}');
  v_conv := (r ->> 'conversa_id')::uuid;
  insert into resultado (teste, ok)
  select 'resposta pelo celular para o bot', estado = 'humano' and motivo_humano = 'respondida pelo celular'
    from public.conversas where id = v_conv;
  r := public.registrar_saida_celular(v_canal, 'WAMID-OUT-1', '5541988887777', null, 'texto', 'Olá! Me conta mais.', '{}');
  insert into resultado (teste, ok) values ('eco do que o Livih enviou é ignorado', (r ->> 'duplicada')::boolean);
  insert into resultado (teste, ok)
  select 'segredo interno confere só o certo', public.verificar_segredo_interno(
      (select decrypted_secret from vault.decrypted_secrets where name = 'livih_interno'))
    and not public.verificar_segredo_interno('chute');
end $$;

insert into resultado (teste, ok)
select 'inserir na fila dispara a Edge Function', count(*) >= 1 from net.http_request_queue
 where url like '%/functions/v1/whatsapp-enviar';

-- LID: contato que chega só com LID e depois se revela com telefone vira um só
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$
declare v_canal uuid; r1 jsonb; r2 jsonb;
begin
  select id into v_canal from public.canais where instance_id = 'INST-F7';
  r1 := public.registrar_entrada(v_canal, 'LID-1', null, '123456789012345', 'Sicrano', 'texto', 'oi pelo lid', '{}');
  r2 := public.registrar_entrada(v_canal, 'LID-2', '5541966665555', '123456789012345', 'Sicrano', 'texto', 'de novo', '{}');
  insert into resultado (teste, ok) values ('LID e telefone caem na mesma conversa', r1 ->> 'conversa_id' = r2 ->> 'conversa_id');
  insert into resultado (teste, ok)
  select 'contato do LID ganha o telefone', telefone = '5541966665555'
    from public.contatos where whatsapp_lid = '123456789012345';
  begin
    perform public.registrar_entrada(v_canal, 'SEM-ID', null, null, 'x', 'texto', 'x', '{}');
    insert into resultado (teste, ok) values ('mensagem sem telefone e sem LID é recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('mensagem sem telefone e sem LID é recusada', true);
  end;
end $$;

-- ============ fase 2: agente ============
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
update public.agentes set telefone_alerta = '5541911112222' where org_id = current_setting('teste.f7')::uuid;
insert into public.base_conhecimento (org_id, titulo, conteudo)
values (current_setting('teste.f7')::uuid, 'Quem somos', 'A F7 resolve problemas com tecnologia.');
do $$
declare v_canal uuid; r1 jsonb; r2 jsonb; v_conv uuid; ctx jsonb; x jsonb;
begin
  select id into v_canal from public.canais where instance_id = 'INST-F7';
  r1 := public.registrar_entrada(v_canal, 'AG-1', '5541955554444', null, 'Diana', 'texto', 'Quero automatizar meu atendimento', '{}');
  v_conv := (r1 ->> 'conversa_id')::uuid;
  insert into resultado (teste, ok) values ('agente deve responder a última mensagem',
    public.agente_deve_responder(v_conv, (r1 ->> 'mensagem_id')::uuid));
  r2 := public.registrar_entrada(v_canal, 'AG-2', '5541955554444', null, 'Diana', 'audio', null, '{}', 'audio/ogg');
  insert into resultado (teste, ok) values ('mensagem mais nova faz a anterior desistir',
    not public.agente_deve_responder(v_conv, (r1 ->> 'mensagem_id')::uuid));
  x := public.registrar_transcricao((r2 ->> 'mensagem_id')::uuid, 'tenho uma clínica');
  insert into resultado (teste, ok) values ('transcrição gravada e devolve chamar_agente', (x ->> 'chamar_agente')::boolean);

  ctx := public.agente_contexto(v_conv);
  insert into resultado (teste, ok) values ('contexto traz prompt, base, etapas e mensagens com transcrição',
    ctx -> 'agente' ->> 'prompt' = 'prompt' and ctx ->> 'base_conhecimento' like '%resolve problemas%'
    and jsonb_array_length(ctx -> 'etapas') = 6 and ctx -> 'mensagens' -> 1 ->> 'texto' = 'tenho uma clínica');

  perform public.agente_atualizar_contato(v_conv, '{"nome":"Diana Souza","empresa":"Clínica D","cargo":"sócia","prompt_sistema":"lixo","conversa_id":"x"}');
  insert into resultado (teste, ok) select 'agente não grava campos desconhecidos', not (dados ? 'prompt_sistema') and not (dados ? 'conversa_id')
    from public.contatos where telefone = '5541955554444';
  insert into resultado (teste, ok) select 'agente grava nome, empresa e dados extras',
    nome = 'Diana Souza' and empresa = 'Clínica D' and dados ->> 'cargo' = 'sócia'
    from public.contatos where telefone = '5541955554444';

  x := public.agente_registrar_oportunidade(v_conv, 'Agente de atendimento para clínica', 'muitos pedidos repetidos');
  x := public.agente_mover_etapa(v_conv, 'em diagnóstico');
  insert into resultado (teste, ok) values ('agente move etapa (nome sem diferenciar maiúsculas)', (x ->> 'sucesso')::boolean);
  x := public.agente_mover_etapa(v_conv, 'Ganho');
  insert into resultado (teste, ok) values ('agente não marca ganho', not (x ->> 'sucesso')::boolean);
  insert into resultado (teste, ok) select 'histórico do funil registra o agente', count(*) = 2
    from public.oportunidade_historico h join public.oportunidades o on o.id = h.oportunidade_id
   where o.contato_id = (select contato_id from public.conversas where id = v_conv) and h.autor_tipo = 'bot';

  x := public.agente_responder(v_conv, 'Me conta como funciona hoje?', (r2 ->> 'mensagem_id')::uuid);
  insert into resultado (teste, ok) values ('agente responde e entra na fila', (x ->> 'enviado')::boolean);

  x := public.agente_chamar_humano(v_conv, 'pediu orçamento');
  insert into resultado (teste, ok) select 'chamar humano para o bot e avisa a equipe',
    c.estado = 'aguardando_humano' and (select count(*) from public.alertas where conversa_id = v_conv) = 1
    from public.conversas c where c.id = v_conv;
  x := public.agente_responder(v_conv, 'Vou chamar um especialista.', (r2 ->> 'mensagem_id')::uuid);
  insert into resultado (teste, ok) values ('despedida da passagem para a equipe sai', (x ->> 'enviado')::boolean);
  update public.conversas set estado = 'humano' where id = v_conv;
  x := public.agente_responder(v_conv, 'resposta atrasada', (r2 ->> 'mensagem_id')::uuid);
  insert into resultado (teste, ok) values ('agente não responde conversa assumida pela equipe', not (x ->> 'enviado')::boolean);

  insert into resultado (teste, ok) select 'alerta sai pela fila de alertas', count(*) = 1 from public.alertas_reivindicar(10);
end $$;

-- Trava contra robô do outro lado (migration 20261007160000)
do $$
declare v_canal uuid; r jsonb; v_conv uuid; x jsonb; i integer;
begin
  select id into v_canal from public.canais where instance_id = 'INST-F7';

  -- cliente de verdade citando protocolo uma vez: o agente continua
  r := public.registrar_entrada(v_canal, 'RB-1', '5541944443333', null, 'Robo', 'texto', 'Olá', '{}');
  v_conv := (r ->> 'conversa_id')::uuid;
  x := public.agente_responder(v_conv, 'Olá! Em que posso ajudar?', (r ->> 'mensagem_id')::uuid);
  r := public.registrar_entrada(v_canal, 'RB-2', '5541944443333', null, 'Robo', 'texto',
    '*Atendente:* Recebemos sua solicitação. *Ticket:* #106', '{}');
  insert into resultado (teste, ok) values ('uma mensagem com ticket ainda não trava',
    public.agente_deve_responder(v_conv, (r ->> 'mensagem_id')::uuid));
  x := public.agente_responder(v_conv, 'Certo, como posso ajudar?', (r ->> 'mensagem_id')::uuid);

  -- segunda resposta automática: trava, passa para a equipe com o motivo
  r := public.registrar_entrada(v_canal, 'RB-3', '5541944443333', null, 'Robo', 'texto',
    '*Atendente:* Recebemos sua solicitação. *Ticket:* #107', '{}');
  insert into resultado (teste, ok) values ('duas respostas automáticas travam o agente',
    not public.agente_deve_responder(v_conv, (r ->> 'mensagem_id')::uuid));
  insert into resultado (teste, ok) select 'conversa vai para a equipe com o motivo do robô',
    estado = 'aguardando_humano' and motivo_humano like 'Possível atendimento automático%'
    from public.conversas where id = v_conv;

  -- robô que responde na hora (sem marcadores): na 4ª mensagem, 3 respostas instantâneas travam
  for i in 1..4 loop
    r := public.registrar_entrada(v_canal, 'RV-' || i, '5541933332222', null, 'Veloz', 'texto', 'mensagem ' || i, '{}');
    v_conv := (r ->> 'conversa_id')::uuid;
    if i < 4 then
      x := public.agente_responder(v_conv, 'resposta ' || i, (r ->> 'mensagem_id')::uuid);
    end if;
  end loop;
  insert into resultado (teste, ok) values ('3 respostas instantâneas travam o agente',
    not public.agente_deve_responder(v_conv, (r ->> 'mensagem_id')::uuid));
  insert into resultado (teste, ok) select 'motivo cita a velocidade',
    motivo_humano like '%menos de 6 segundos%' from public.conversas where id = v_conv;
end $$;

-- Teto de respostas em 10 min (migration 20261010120000): venda rápida com gente de verdade não trava
do $$
declare v_canal uuid; r jsonb; v_conv uuid; v_org uuid; v_agora timestamptz; i integer;
  caso record;
begin
  select id into v_canal from public.canais where instance_id = 'INST-F7';
  for caso in select * from (values
      ('5541922220001', 8, 'Sim', false, '8 respostas com o contato respondendo curto não travam'),
      ('5541922220002', 8, repeat('Texto longo de resposta automática gerada por outra IA. ', 2), true,
       '8 respostas com o contato escrevendo textos longos travam'),
      ('5541922220003', 20, 'Ok', true, '20 respostas em 10 minutos travam mesmo com respostas curtas')
    ) as t(fone, n, resposta, trava, nome)
  loop
    r := public.registrar_entrada(v_canal, 'TT-' || caso.fone, caso.fone, null, 'Cliente', 'texto', caso.resposta, '{}');
    v_conv := (r ->> 'conversa_id')::uuid;
    select org_id into v_org from public.conversas where id = v_conv;
    v_agora := clock_timestamp();
    -- agente a cada 25 s, cliente responde 15 s depois (lento demais para a regra de velocidade)
    for i in 1..caso.n loop
      insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, texto, status_entrega, criado_em) values
        (v_org, v_conv, 'saida', 'bot', 'pergunta ' || i, 'enviada', v_agora - (caso.n - i + 1) * interval '25 seconds' - interval '10 seconds'),
        (v_org, v_conv, 'entrada', 'contato', caso.resposta, 'recebida', v_agora - (caso.n - i + 1) * interval '25 seconds' + interval '5 seconds');
    end loop;
    insert into resultado (teste, ok) values (caso.nome,
      (public.agente_suspeita_robo(v_conv) is not null) = caso.trava);
  end loop;
end $$;

-- Equipe (migration 20261007170000)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'membro vê a equipe com e-mail',
  count(*) >= 2 and bool_or(email = 'atendente@f7.teste') from public.equipe_listar(current_setting('teste.f7')::uuid);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'quem não é da organização não vê a equipe',
  count(*) = 0 from public.equipe_listar(current_setting('teste.f7')::uuid);
do $$ begin
  perform public.usuario_por_email('atendente@f7.teste');
  insert into resultado (teste, ok) values ('app não procura usuário por e-mail', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('app não procura usuário por e-mail', true);
end $$;
reset role;
do $$ begin
  update public.membros_org set papel = 'admin'
   where org_id = current_setting('teste.f7')::uuid and user_id = '00000000-0000-0000-0000-0000000000a1';
  insert into resultado (teste, ok) values ('último dono não se rebaixa', false);
exception when others then
  insert into resultado (teste, ok) values ('último dono não se rebaixa', sqlerrm like '%pelo menos um dono%');
end $$;

-- Conexão do WhatsApp e agente desligado (migration 20261007180000)
do $$
declare v_canal uuid; v_alerta uuid; r jsonb; v_conv uuid; n integer;
begin
  select id into v_canal from public.canais where instance_id = 'INST-F7';
  -- canal de alertas da plataforma: outro canal da mesma org de teste
  insert into public.canais (org_id, nome, telefone, instance_id)
  select org_id, 'Alertas', '5541911112222', 'INST-ALERTAS' from public.canais where id = v_canal
  returning id into v_alerta;
  update public.plataforma_config set canal_alertas = v_alerta where id = 1;
  update public.agentes set telefone_alerta = '5541900001111' where canal_id = v_canal;

  perform public.canal_atualizar_status(v_canal, 'WORKING', '5541999990000');
  perform public.canal_atualizar_status(v_canal, 'STARTING');
  insert into resultado (teste, ok) select 'saiu de WORKING marca a queda', caiu_em is not null and alerta_queda_em is null
    from public.canais where id = v_canal;
  update public.canais set caiu_em = now() - interval '6 minutes' where id = v_canal;
  perform public.canal_atualizar_status(v_canal, 'FAILED');
  perform public.canal_atualizar_status(v_canal, 'FAILED');
  select count(*) into n from public.alertas where canal_id = v_alerta and texto like '%desconectado%';
  insert into resultado (teste, ok) values ('queda de 5 min gera um aviso só, pelo canal de alertas', n = 1);
  perform public.canal_atualizar_status(v_canal, 'WORKING', '5541999990000');
  insert into resultado (teste, ok) select 'voltou: limpa a queda e avisa', c.caiu_em is null and c.alerta_queda_em is null
    and (select count(*) from public.alertas where canal_id = v_alerta and texto like '%conectado de novo%') = 1
    from public.canais c where c.id = v_canal;

  update public.canais set desconectado_em = now() where id = v_canal;
  perform public.canal_atualizar_status(v_canal, 'STOPPED');
  insert into resultado (teste, ok) select 'desconectar pela tela não é queda', caiu_em is null from public.canais where id = v_canal;

  -- agente desligado
  r := public.registrar_entrada(v_canal, 'OFF-1', '5541922223333', null, 'Sem Agente', 'texto', 'oi', '{}');
  v_conv := (r ->> 'conversa_id')::uuid;
  update public.agentes set ativo = false where canal_id = v_canal;
  insert into resultado (teste, ok) select 'desligar o agente passa a conversa esperando para a equipe',
    estado = 'aguardando_humano' and motivo_humano = 'Agente desligado' from public.conversas where id = v_conv;
  r := public.registrar_entrada(v_canal, 'OFF-2', '5541922224444', null, 'Novo', 'texto', 'oi', '{}');
  insert into resultado (teste, ok) values ('com agente desligado, conversa nova vai para a equipe',
    r ->> 'estado' = 'aguardando_humano' and not (r ->> 'chamar_agente')::boolean);
  update public.agentes set ativo = true where canal_id = v_canal;
end $$;

-- Números por vendedor (migration 20261007190000)
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'vendedor@f7.teste', '{"nome":"Vítor"}');
insert into public.membros_org (org_id, user_id, papel)
values (current_setting('teste.f7')::uuid, '00000000-0000-0000-0000-0000000000d1', 'atendente');
do $$
declare v_canal uuid; r jsonb;
begin
  insert into public.canais (org_id, nome, telefone, instance_id, responsavel_id)
  values (current_setting('teste.f7')::uuid, 'Vítor', '5541933334444', 'INST-VITOR', '00000000-0000-0000-0000-0000000000d1')
  returning id into v_canal;
  insert into public.agentes (org_id, canal_id, ativo, prompt) values (current_setting('teste.f7')::uuid, v_canal, true, 'outro');
  r := public.registrar_entrada(v_canal, 'VEND-1', '5541977771111', null, 'Cliente do Vítor', 'texto', 'oi Vítor', '{}');
  perform set_config('teste.conv_vendedor', r ->> 'conversa_id', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'outro atendente não vê a conversa do número do vendedor',
  not exists (select 1 from public.conversas where id = current_setting('teste.conv_vendedor')::uuid)
  and not exists (select 1 from public.mensagens where conversa_id = current_setting('teste.conv_vendedor')::uuid);
do $$ begin
  perform public.enviar_mensagem(current_setting('teste.conv_vendedor')::uuid, 'oi');
  insert into resultado (teste, ok) values ('outro atendente não responde no número do vendedor', false);
exception when others then
  insert into resultado (teste, ok) values ('outro atendente não responde no número do vendedor', true);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'vendedor vê as conversas dele e as do número da empresa',
  exists (select 1 from public.conversas where id = current_setting('teste.conv_vendedor')::uuid)
  and exists (select 1 from public.conversas where id = current_setting('teste.conversa')::uuid);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'dono vê o número do vendedor', exists (select 1 from public.conversas where id = current_setting('teste.conv_vendedor')::uuid);

reset role;
update public.agentes set prompt = 'instruções novas da empresa'
 where canal_id = (select id from public.canais where instance_id = 'INST-F7');
insert into resultado (teste, ok)
select 'instruções do agente valem para todos os números', bool_and(prompt = 'instruções novas da empresa')
  from public.agentes where org_id = current_setting('teste.f7')::uuid;
insert into resultado (teste, ok)
select 'ligar/desligar continua por número', count(distinct ativo) >= 1
  from public.agentes where org_id = current_setting('teste.f7')::uuid;

-- Carteira (migration 20261007200000). Reaproveita: Vítor (d1) com número próprio e a conversa
-- teste.conv_vendedor; Ana (b1) atendente comum; a1 dono.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare v_contato_vitor uuid; v_etapa uuid;
begin
  select contato_id into v_contato_vitor from public.conversas where id = current_setting('teste.conv_vendedor')::uuid;
  perform set_config('teste.contato_vitor', v_contato_vitor::text, true);
  select id into v_etapa from public.etapas_funil where org_id = current_setting('teste.f7')::uuid and nome = 'Novo';
  insert into public.oportunidades (org_id, contato_id, etapa_id, titulo)
  values (current_setting('teste.f7')::uuid, v_contato_vitor, v_etapa, 'Negócio do Vítor');
  -- contato cadastrado à mão, sem conversa nem responsável: é da empresa
  insert into public.contatos (org_id, telefone, nome) values (current_setting('teste.f7')::uuid, '5541911110000', 'Sem dono');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'atendente não vê o cliente nem o negócio da carteira do vendedor',
  not exists (select 1 from public.contatos where id = current_setting('teste.contato_vitor')::uuid)
  and not exists (select 1 from public.oportunidades where contato_id = current_setting('teste.contato_vitor')::uuid);
insert into resultado (teste, ok)
select 'contato sem conversa e sem responsável é de todos', exists (select 1 from public.contatos where nome = 'Sem dono');
insert into resultado (teste, ok)
select 'contato do número da empresa é de todos',
  exists (select 1 from public.contatos c join public.conversas v on v.contato_id = c.id
           where v.id = current_setting('teste.conversa')::uuid);

do $$ begin
  insert into public.contatos (org_id, telefone, nome) values (current_setting('teste.f7')::uuid, '5541922220000', 'Da Ana');
  insert into resultado (teste, ok) select 'contato criado pela tela nasce na carteira de quem criou',
    responsavel_id = '00000000-0000-0000-0000-0000000000b1' from public.contatos where telefone = '5541922220000';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'vendedor vê o cliente e o negócio dele, e não o contato criado pela Ana',
  exists (select 1 from public.contatos where id = current_setting('teste.contato_vitor')::uuid)
  and exists (select 1 from public.oportunidades where titulo = 'Negócio do Vítor')
  and not exists (select 1 from public.contatos where telefone = '5541922220000');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'dono vê a carteira de todos', count(*) = 2 from public.contatos
 where id = current_setting('teste.contato_vitor')::uuid or telefone = '5541922220000';
do $$ begin
  update public.contatos set responsavel_id = '00000000-0000-0000-0000-0000000000c1' where telefone = '5541922220000';
  insert into resultado (teste, ok) values ('responsável precisa ser da equipe', false);
exception when others then
  insert into resultado (teste, ok) values ('responsável precisa ser da equipe', sqlerrm like '%da equipe%');
end $$;

-- painel da plataforma
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare v1 uuid; v2 uuid;
begin
  v1 := public.plataforma_criar_empresa('  Padaria São João ');
  v2 := public.plataforma_criar_empresa('Padaria São João');
  insert into resultado (teste, ok) select 'empresa nova ganha endereço sem acento e sem repetir',
    (select slug from public.organizacoes where id = v1) = 'padaria-sao-joao'
    and (select slug from public.organizacoes where id = v2) = 'padaria-sao-joao-2'
    and not exists (select 1 from public.membros_org where org_id = v1)
    and (select count(*) from public.etapas_funil where org_id = v1) > 0;
  insert into resultado (teste, ok) select 'primeiros passos da empresa nova começam todos pendentes',
    not (whatsapp or instrucoes or base or equipe or agente_ligado) from public.org_primeiros_passos(v1);
  insert into resultado (teste, ok) select 'primeiros passos reconhecem o que a F7 já fez',
    instrucoes and base and equipe and agente_ligado from public.org_primeiros_passos(current_setting('teste.f7')::uuid);
  perform public.plataforma_definir_status(current_setting('teste.cli')::uuid, 'suspensa');
  insert into resultado (teste, ok) select 'painel lista as empresas com a situação',
    exists (select 1 from public.plataforma_empresas() where id = current_setting('teste.cli')::uuid and status = 'suspensa');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'equipe da empresa suspensa vê a situação', exists (
  select 1 from public.organizacoes where id = current_setting('teste.cli')::uuid and status = 'suspensa');
insert into resultado (teste, ok)
select 'equipe da empresa suspensa perde o acesso',
  not public.eh_membro(current_setting('teste.cli')::uuid) and not public.tem_papel(current_setting('teste.cli')::uuid, '{dono}');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.plataforma_empresas();
  insert into resultado (teste, ok) values ('só a equipe da plataforma vê o painel', false);
exception when others then
  insert into resultado (teste, ok) values ('só a equipe da plataforma vê o painel', sqlerrm like '%plataforma%');
end $$;
insert into resultado (teste, ok)
select 'pedidos de acesso só para a plataforma', not exists (select 1 from public.pedidos_acesso);

-- ---------- consumo de IA (uso_ia) ----------
reset role;
set local role service_role;
insert into public.uso_ia (org_id, conversa_id, tipo, modelo, chamadas, tokens_entrada, tokens_saida, origem_ref)
values (current_setting('teste.f7')::uuid, current_setting('teste.conversa')::uuid, 'resposta', 'gpt-5-mini', 2, 6000, 30, 'teste:n8n:1');
insert into public.uso_ia (org_id, conversa_id, tipo, modelo, chamadas, tokens_entrada, tokens_saida, origem_ref)
values (current_setting('teste.f7')::uuid, current_setting('teste.conversa')::uuid, 'resposta', 'gpt-5-mini', 2, 6000, 30, 'teste:n8n:1')
on conflict (origem_ref) do nothing;
insert into public.uso_ia (org_id, conversa_id, tipo, modelo, tokens_entrada, tokens_saida, segundos_audio, origem_ref)
values (current_setting('teste.f7')::uuid, current_setting('teste.conversa')::uuid, 'transcricao', 'gpt-4o-transcribe', 500, 40, 12, 'teste:audio:1');
insert into resultado (teste, ok)
select 'consumo de IA não duplica pela mesma origem', (select count(*) from public.uso_ia where origem_ref like 'teste:%') = 2;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'plataforma vê o consumo do mês com custo', exists (
  select 1 from public.uso_ia_mensal where org_id = current_setting('teste.f7')::uuid
     and respostas_agente >= 1 and conversas_com_agente >= 1 and audios_transcritos >= 1 and custo_usd > 0);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'atendente não vê o consumo de IA', not exists (select 1 from public.uso_ia where origem_ref like 'teste:%');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'outra empresa não vê o consumo da F7', not exists (
  select 1 from public.uso_ia_mensal where org_id = current_setting('teste.f7')::uuid);
do $$ begin
  insert into public.uso_ia (org_id, tipo, modelo, origem_ref) values (current_setting('teste.f7')::uuid, 'resposta', 'x', 'teste:invasor');
  insert into resultado (teste, ok) values ('usuário não grava consumo de IA', false);
exception when others then
  insert into resultado (teste, ok) values ('usuário não grava consumo de IA', true);
end $$;


-- ============ ponto de retomada do agente ============
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$
declare v_canal uuid; r jsonb; v_conv uuid; ctx jsonb; v_antes timestamptz; v_depois timestamptz;
begin
  select id into v_canal from public.canais where instance_id = 'INST-F7';
  r := public.registrar_entrada(v_canal, 'RT-1', '5541912340000', null, 'Rita', 'texto', 'pergunta antiga', '{}');
  v_conv := (r ->> 'conversa_id')::uuid;

  ctx := public.agente_contexto(v_conv);
  insert into resultado (teste, ok)
  select 'sem volta ao agente, nada é anterior',
    not exists (select 1 from jsonb_array_elements(ctx -> 'mensagens') m where (m ->> 'anterior')::boolean);

  -- a equipe assume, responde e devolve ao agente; depois o cliente escreve de novo
  update public.conversas set estado = 'humano' where id = v_conv;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, texto, status_entrega)
  values (current_setting('teste.f7')::uuid, v_conv, 'saida', 'atendente', 'resolvido pela equipe', 'pendente');
  update public.conversas set estado = 'bot' where id = v_conv;
  r := public.registrar_entrada(v_canal, 'RT-2', '5541912340000', null, 'Rita', 'texto', 'pergunta nova', '{}');

  ctx := public.agente_contexto(v_conv);
  insert into resultado (teste, ok)
  select 'devolvida ao agente: o que veio antes é anterior, a nova não',
    ctx ->> 'retomado_em' is not null
    and (select bool_and((m ->> 'anterior')::boolean) from jsonb_array_elements(ctx -> 'mensagens') m
          where m ->> 'texto' in ('pergunta antiga', 'resolvido pela equipe'))
    and (select not (m ->> 'anterior')::boolean from jsonb_array_elements(ctx -> 'mensagens') m
          where m ->> 'texto' = 'pergunta nova');

  -- religar o agente do número move o ponto para frente
  select ativado_em into v_antes from public.agentes where canal_id = v_canal;
  update public.agentes set ativo = false where canal_id = v_canal;
  update public.agentes set ativo = true where canal_id = v_canal;
  select ativado_em into v_depois from public.agentes where canal_id = v_canal;
  insert into resultado (teste, ok) values ('religar o agente marca a hora', v_depois > coalesce(v_antes, '-infinity'));
  ctx := public.agente_contexto(v_conv);
  insert into resultado (teste, ok)
  select 'depois de religar, a conversa toda vira anterior',
    (select bool_and((m ->> 'anterior')::boolean) from jsonb_array_elements(ctx -> 'mensagens') m);

  -- conversa encerrada reaberta pelo cliente
  update public.conversas set estado = 'encerrada' where id = v_conv;
  r := public.registrar_entrada(v_canal, 'RT-3', '5541912340000', null, 'Rita', 'texto', 'voltei', '{}');
  ctx := public.agente_contexto(v_conv);
  insert into resultado (teste, ok)
  select 'conversa reaberta: só a mensagem que reabriu é nova',
    (select count(*) from jsonb_array_elements(ctx -> 'mensagens') m where not (m ->> 'anterior')::boolean) = 1
    and (select m ->> 'texto' from jsonb_array_elements(ctx -> 'mensagens') m where not (m ->> 'anterior')::boolean) = 'voltei';
end $$;


-- ============ contatos que o agente não atende ============
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$
declare v_canal uuid; r jsonb; v_conv uuid; v_conv2 uuid; v_msg uuid;
begin
  select id into v_canal from public.canais where instance_id = 'INST-F7';

  -- cadastrado antes de escrever: a primeira mensagem já vai para a equipe
  insert into public.contatos (org_id, telefone, nome, sem_agente)
  values (current_setting('teste.f7')::uuid, '5541912345001', 'Fornecedor', true);
  r := public.registrar_entrada(v_canal, 'SA-1', '5541912345001', null, 'Fornecedor', 'texto', 'oi', '{}');
  v_conv := (r ->> 'conversa_id')::uuid;
  insert into resultado (teste, ok) values ('contato sem agente: conversa nova vai para a equipe',
    r ->> 'estado' = 'aguardando_humano' and not (r ->> 'chamar_agente')::boolean
    and (select motivo_humano from public.conversas where id = v_conv) = 'Contato atendido só pela equipe');

  -- devolver ao agente não pega
  update public.conversas set estado = 'bot' where id = v_conv;
  insert into resultado (teste, ok)
  select 'contato sem agente: devolver ao agente não pega', estado = 'aguardando_humano' from public.conversas where id = v_conv;

  -- encerrada e reaberta pelo cliente continua com a equipe
  update public.conversas set estado = 'encerrada' where id = v_conv;
  r := public.registrar_entrada(v_canal, 'SA-2', '5541912345001', null, 'Fornecedor', 'texto', 'voltei', '{}');
  insert into resultado (teste, ok) values ('contato sem agente: reaberta vai para a equipe',
    r ->> 'estado' = 'aguardando_humano' and not (r ->> 'chamar_agente')::boolean);

  -- marcar depois: a conversa com o agente passa para a equipe e o agente não responde mais
  r := public.registrar_entrada(v_canal, 'SA-3', '5541912345002', null, 'Cliente antigo', 'texto', 'oi', '{}');
  v_conv2 := (r ->> 'conversa_id')::uuid;
  v_msg := (r ->> 'mensagem_id')::uuid;
  insert into resultado (teste, ok) values ('contato comum continua com o agente', r ->> 'estado' = 'bot');
  update public.contatos set sem_agente = true where telefone = '5541912345002' and org_id = current_setting('teste.f7')::uuid;
  insert into resultado (teste, ok)
  select 'marcar o contato tira a conversa do agente', estado = 'aguardando_humano' from public.conversas where id = v_conv2;
  insert into resultado (teste, ok) values ('agente não responde contato marcado',
    not public.agente_deve_responder(v_conv2, v_msg));

  -- desmarcar: devolver ao agente volta a funcionar
  update public.contatos set sem_agente = false where telefone = '5541912345002' and org_id = current_setting('teste.f7')::uuid;
  update public.conversas set estado = 'bot' where id = v_conv2;
  insert into resultado (teste, ok)
  select 'desmarcado, devolver ao agente funciona', estado = 'bot' from public.conversas where id = v_conv2;
end $$;

-- atendente da empresa consegue marcar
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
update public.contatos set sem_agente = true where telefone = '5541912345002';
reset role;
insert into resultado (teste, ok)
select 'atendente marca contato sem agente', sem_agente from public.contatos where telefone = '5541912345002';


-- ============ criar contato pela tela (INSERT ... RETURNING, como o PostgREST faz) ============
reset role;
grant insert on resultado to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare v_id uuid;
begin
  insert into public.contatos (org_id, origem, nome, telefone, empresa, sem_agente)
  values (current_setting('teste.f7')::uuid, 'manual', 'Criado pela tela', '5541912345099', 'Teste', true)
  returning id into v_id;
  insert into resultado (teste, ok) values ('atendente cria contato pela tela (com RETURNING)', v_id is not null);
exception when others then
  insert into resultado (teste, ok) values ('atendente cria contato pela tela (com RETURNING): ' || sqlerrm, false);
end $$;
do $$
declare v_id uuid;
begin
  insert into public.contatos (org_id, origem, nome, telefone)
  values (current_setting('teste.f7')::uuid, 'manual', 'Repetido', '5541912345099')
  returning id into v_id;
  insert into resultado (teste, ok) values ('telefone repetido é recusado como duplicado', false);
exception when unique_violation then
  insert into resultado (teste, ok) values ('telefone repetido é recusado como duplicado', true);
when others then
  insert into resultado (teste, ok) values ('telefone repetido: ' || sqlstate || ' ' || sqlerrm, false);
end $$;


-- ============ notificações push ============
reset role;
-- a atendente (b1) ativa notificações pela tela; o dono do cliente X (c1) também, mas é de outra empresa
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select public.push_inscrever('https://push.exemplo/b1', 'chave-b1', 'auth-b1', 'teste');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select public.push_inscrever('https://push.exemplo/c1', 'chave-c1', 'auth-c1', 'teste');
insert into resultado (teste, ok)
select 'cada um vê só as próprias inscrições', count(*) = 1 from public.push_inscricoes;
reset role;
delete from public.push_fila;

do $$
declare v_canal uuid; r jsonb; v_conv uuid; v_n int;
begin
  select id into v_canal from public.canais where instance_id = 'INST-F7';

  -- contato sem agente escreve: conversa nasce aguardando → UMA notificação para a equipe, com o texto
  insert into public.contatos (org_id, telefone, nome, sem_agente)
  values (current_setting('teste.f7')::uuid, '5541912345101', 'Bia Push', true);
  r := public.registrar_entrada(v_canal, 'PUSH-1', '5541912345101', null, 'Bia Push', 'texto', 'preciso de ajuda', '{}');
  v_conv := (r ->> 'conversa_id')::uuid;
  select count(*) into v_n from public.push_fila where conversa_id = v_conv;
  insert into resultado (teste, ok)
  select 'aguardando equipe: uma notificação para quem ativou', v_n = 1
     and exists (select 1 from public.push_fila where conversa_id = v_conv and user_id = '00000000-0000-0000-0000-0000000000b1'
                 and corpo = 'preciso de ajuda' and titulo = 'Bia Push aguarda atendimento' and url = '/conversas/' || v_conv);
  insert into resultado (teste, ok)
  select 'outra empresa não é notificada', not exists (select 1 from public.push_fila where user_id = '00000000-0000-0000-0000-0000000000c1');

  -- segunda mensagem antes de enviar: atualiza a mesma notificação
  r := public.registrar_entrada(v_canal, 'PUSH-2', '5541912345101', null, 'Bia Push', 'texto', 'alguém aí?', '{}');
  insert into resultado (teste, ok)
  select 'mensagens seguidas viram uma notificação só', count(*) = 1 and max(corpo) = 'alguém aí?'
    from public.push_fila where conversa_id = v_conv and enviado_em is null;

  -- a Edge Function pega e marca como enviada
  select count(*) into v_n from public.push_reivindicar(100);
  insert into resultado (teste, ok)
  select 'push_reivindicar entrega e marca', v_n >= 1 and not exists (select 1 from public.push_fila where enviado_em is null);

  -- a atendente assume; cliente escreve → notificação só para ela
  update public.conversas set estado = 'humano', atribuida_a = '00000000-0000-0000-0000-0000000000b1' where id = v_conv;
  r := public.registrar_entrada(v_canal, 'PUSH-3', '5541912345101', null, 'Bia Push', 'texto', 'obrigada', '{}');
  insert into resultado (teste, ok)
  select 'em atendimento: notifica o atendente', count(*) = 1 and max(titulo) = 'Bia Push'
    from public.push_fila where conversa_id = v_conv and enviado_em is null and user_id = '00000000-0000-0000-0000-0000000000b1';

  -- conversa com o agente não notifica ninguém
  delete from public.push_fila;
  r := public.registrar_entrada(v_canal, 'PUSH-4', '5541912345102', null, 'Com agente', 'texto', 'oi', '{}');
  insert into resultado (teste, ok) values ('conversa com o agente não notifica', r ->> 'estado' = 'bot'
    and not exists (select 1 from public.push_fila));
end $$;

-- teste pela tela e cancelar
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
select public.push_testar();
select public.push_cancelar('https://push.exemplo/b1');
reset role;
insert into resultado (teste, ok)
select 'botão de teste enfileira e cancelar remove o aparelho',
  exists (select 1 from public.push_fila where user_id = '00000000-0000-0000-0000-0000000000b1' and conversa_id is null)
  and not exists (select 1 from public.push_inscricoes where endpoint = 'https://push.exemplo/b1');
insert into resultado (teste, ok)
select 'usuário não lê a fila nem as chaves', not has_function_privilege('authenticated', 'public.push_chaves()', 'execute')
  and not has_function_privilege('authenticated', 'public.push_reivindicar(integer)', 'execute');

-- Mensagens automáticas do celular (migration 20261010130000): saudação/ausência não tiram a conversa do agente
do $$
declare v_canal uuid; r jsonb; v_conv uuid; x jsonb; v_ctx jsonb;
begin
  select id into v_canal from public.canais where instance_id = 'INST-F7';
  update public.agentes set ativo = true,
         regras_humano = coalesce(regras_humano, '{}'::jsonb)
           || '{"mensagens_automaticas": ["Jogrampo agradece seu contato. Como podemos ajudar?"]}'
   where canal_id = v_canal;

  r := public.registrar_entrada(v_canal, 'AU-1', '5541911110001', null, 'Cliente', 'texto', 'Oi, vocês têm grampo?', '{}');
  v_conv := (r ->> 'conversa_id')::uuid;
  -- como chega do WhatsApp Business: marca de direção invisível no começo, espaço duplo
  x := public.registrar_saida_celular(v_canal, 'AU-2', '5541911110001', null, 'texto',
         E'\u200eJogrampo  agradece seu contato. Como podemos ajudar?', '{}');
  insert into resultado (teste, ok) values ('saudação automática é reconhecida', (x ->> 'automatica')::boolean);
  insert into resultado (teste, ok) select 'saudação automática não tira a conversa do agente',
    estado = 'bot' from public.conversas where id = v_conv;
  insert into resultado (teste, ok) values ('agente ainda responde depois da saudação',
    public.agente_deve_responder(v_conv, (r ->> 'mensagem_id')::uuid));
  insert into resultado (teste, ok) select 'saudação fica no histórico marcada como automática',
    count(*) = 1 from public.mensagens where conversa_id = v_conv and automatica and autor_tipo = 'atendente';
  v_ctx := public.agente_contexto(v_conv);
  insert into resultado (teste, ok) values ('agente vê a saudação como automática',
    v_ctx -> 'mensagens' @> '[{"de": "mensagem automática do celular"}]');

  x := public.registrar_saida_celular(v_canal, 'AU-3', '5541911110001', null, 'texto', 'Temos sim, qual medida?', '{}');
  insert into resultado (teste, ok) select 'mensagem digitada no celular continua assumindo a conversa',
    not (x ->> 'automatica')::boolean and estado = 'humano' from public.conversas where id = v_conv;

  insert into resultado (teste, ok) values ('texto diferente não é automático',
    not public.eh_mensagem_automatica(v_canal, 'Jogrampo agradece seu contato'));
end $$;

-- Saudação e horário do agente (migration 20261010140000)
do $$
declare v_canal uuid; r jsonb; v_conv uuid; v_ctx jsonb; h jsonb := '{"1":["08:00","18:00"],"2":["08:00","18:00"],"3":["08:00","18:00"],"4":["08:00","18:00"],"5":["08:00","18:00"],"6":["08:00","12:00"]}';
begin
  select id into v_canal from public.canais where instance_id = 'INST-F7';
  -- 10/10/2026 é sábado
  insert into resultado (teste, ok) values ('sábado 10h está no horário',
    public.agente_no_horario(h, '2026-10-10 10:00-03'));
  insert into resultado (teste, ok) values ('sábado 13h está fora do horário',
    not public.agente_no_horario(h, '2026-10-10 13:00-03'));
  insert into resultado (teste, ok) values ('domingo (sem faixa) está fora do horário',
    not public.agente_no_horario(h, '2026-10-11 10:00-03'));
  insert into resultado (teste, ok) values ('segunda 17:59 dentro, 18:00 fora (hora de Brasília)',
    public.agente_no_horario(h, '2026-10-12 20:59+00') and not public.agente_no_horario(h, '2026-10-12 21:00+00'));
  insert into resultado (teste, ok) values ('sem horário = 24 h', public.agente_no_horario(null, now()));
  insert into resultado (teste, ok) values ('horário inválido é recusado',
    not public.agente_horario_valido('{"1":["18:00","08:00"]}') and not public.agente_horario_valido('{"8":["08:00","18:00"]}')
    and not public.agente_horario_valido('{"1":["8h","18h"]}') and public.agente_horario_valido(h));

  -- a empresa F7 tem 2 números no teste? sincroniza para todos os agentes da org
  update public.agentes set saudacao = 'Olá! Aqui é a F7.', horario = h, mensagem_fora_horario = 'Voltamos segunda.'
   where canal_id = v_canal;
  insert into resultado (teste, ok) select 'saudação e horário valem para todos os números da empresa',
    bool_and(saudacao = 'Olá! Aqui é a F7.' and horario = h)
    from public.agentes where org_id = (select org_id from public.canais where id = v_canal);

  r := public.registrar_entrada(v_canal, 'SH-1', '5541911120001', null, 'Novo', 'texto', 'Oi', '{}');
  v_conv := (r ->> 'conversa_id')::uuid;
  v_ctx := public.agente_contexto(v_conv);
  insert into resultado (teste, ok) values ('contexto traz saudação, primeira resposta e horário',
    v_ctx -> 'agente' ->> 'saudacao' = 'Olá! Aqui é a F7.' and (v_ctx ->> 'primeira_resposta')::boolean
    and v_ctx -> 'dentro_do_horario' is not null);
  perform public.agente_responder(v_conv, 'Olá! Aqui é a F7. Como posso ajudar?', (r ->> 'mensagem_id')::uuid);
  insert into resultado (teste, ok) values ('depois de responder, não é mais a primeira resposta',
    not (public.agente_contexto(v_conv) ->> 'primeira_resposta')::boolean);

  begin
    update public.agentes set horario = '{"1":["18:00","08:00"]}' where canal_id = v_canal;
    insert into resultado (teste, ok) values ('banco recusa horário invertido', false);
  exception when check_violation then
    insert into resultado (teste, ok) values ('banco recusa horário invertido', true);
  end;
end $$;

-- API oficial (Cloud API): canal pelo phone_number_id, token no Vault, entrada no mesmo fluxo
reset role;
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
  v_canal uuid;
  v_vault uuid;
  r jsonb;
begin
  insert into public.canais (org_id, tipo, nome, instance_id, meta_waba_id, meta_coexistencia)
  values (v_org, 'meta', 'Oficial teste', 'PNID-TESTE-1', 'WABA-TESTE', true)
  returning id into v_canal;
  insert into public.agentes (org_id, canal_id) values (v_org, v_canal);

  insert into resultado (teste, ok) select 'meta: canal achado pelo phone_number_id',
    (select canal_id from public.canal_por_numero_meta('PNID-TESTE-1')) = v_canal
    and not exists (select 1 from public.canal_por_numero_meta('PNID-INEXISTENTE'));

  perform public.meta_guardar_token(v_canal, 'token-1', now() + interval '60 days');
  v_vault := (select vault_token_id from public.canais where id = v_canal);
  perform public.meta_guardar_token(v_canal, 'token-2', null);
  insert into resultado (teste, ok) select 'meta: token no Vault, trocado no mesmo segredo',
    public.meta_token_do_canal(v_canal) = 'token-2'
    and (select vault_token_id from public.canais where id = v_canal) = v_vault
    and (select meta_token_expira_em from public.canais where id = v_canal) is null;

  insert into resultado (teste, ok) select 'meta: usuário logado não lê token nem acha canal',
    not has_function_privilege('authenticated', 'public.meta_token_do_canal(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.meta_guardar_token(uuid, text, timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.canal_por_numero_meta(text)', 'execute');

  update public.organizacoes set status = 'suspensa' where id = v_org;
  insert into resultado (teste, ok) select 'meta: empresa suspensa não recebe pelo webhook',
    not exists (select 1 from public.canal_por_numero_meta('PNID-TESTE-1'));
  update public.organizacoes set status = 'ativa' where id = v_org;

  r := public.registrar_entrada(v_canal, 'wamid.TESTE1', '5541988887777', null, 'Cliente Oficial', 'texto', 'Oi pela API', '{}');
  insert into resultado (teste, ok) select 'meta: entrada da API oficial vira conversa no canal',
    not (r ->> 'duplicada')::boolean
    and exists (select 1 from public.conversas where id = (r ->> 'conversa_id')::uuid and canal_id = v_canal);

  perform public.meta_guardar_pin(v_canal, '123456');
  perform public.meta_guardar_pin(v_canal, '654321');
  insert into resultado (teste, ok) select 'meta: PIN do número guardado no Vault (um segredo só)',
    (select count(*) from vault.decrypted_secrets where name = 'meta_pin_' || v_canal::text and decrypted_secret = '654321') = 1;
  perform set_config('teste.conv_meta', r ->> 'conversa_id', true);
end $$;

-- Envio de modelo pela conversa (atendente da F7)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare
  v_msg uuid;
begin
  v_msg := public.enviar_modelo(current_setting('teste.conv_meta')::uuid, 'retorno_pedido', 'pt_BR',
    array['Maria', 'Ana'], 'Olá, Maria! Aqui é Ana.');
  insert into resultado (teste, ok) select 'modelo: enviado entra na fila com nome, idioma e variáveis',
    (select modelo = '{"nome":"retorno_pedido","idioma":"pt_BR","parametros":["Maria","Ana"]}'::jsonb
            and texto = 'Olá, Maria! Aqui é Ana.' and status_entrega = 'pendente'
       from public.mensagens where id = v_msg)
    and exists (select 1 from public.fila_envio where mensagem_id = v_msg);
  insert into resultado (teste, ok) select 'modelo: quem envia assume a conversa',
    (select estado = 'humano' and atribuida_a = '00000000-0000-0000-0000-0000000000b1'
       from public.conversas where id = current_setting('teste.conv_meta')::uuid);
  perform set_config('teste.msg_modelo', v_msg::text, true);

  begin
    perform public.enviar_modelo(current_setting('teste.conversa')::uuid, 'retorno_pedido', 'pt_BR', '{}', 'x');
    insert into resultado (teste, ok) values ('modelo: recusado em número do WAHA', false);
  exception when others then
    insert into resultado (teste, ok) values ('modelo: recusado em número do WAHA', sqlerrm like 'modelo só pode%');
  end;
  begin
    perform public.enviar_modelo(current_setting('teste.conv_meta')::uuid, 'retorno_pedido', 'pt_BR', array['Maria', ' '], 'x');
    insert into resultado (teste, ok) values ('modelo: variável vazia recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('modelo: variável vazia recusada', sqlerrm like 'preencha%');
  end;
  begin
    perform public.enviar_modelo(current_setting('teste.conv_meta')::uuid, 'Retorno Pedido', 'pt_BR', '{}', 'x');
    insert into resultado (teste, ok) values ('modelo: nome inválido recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('modelo: nome inválido recusado', sqlerrm = 'modelo inválido');
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  perform public.enviar_modelo(current_setting('teste.conv_meta')::uuid, 'retorno_pedido', 'pt_BR', '{}', 'invasão');
  insert into resultado (teste, ok) values ('modelo: outra empresa não envia', false);
exception when others then
  insert into resultado (teste, ok) values ('modelo: outra empresa não envia', sqlerrm = 'conversa não encontrada');
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
do $$
declare
  r record;
  v_achou boolean := false;
begin
  for r in select * from public.fila_reivindicar(50) loop
    if r.mensagem_id = current_setting('teste.msg_modelo')::uuid then
      v_achou := r.modelo ->> 'nome' = 'retorno_pedido' and r.canal_tipo = 'meta';
    end if;
  end loop;
  insert into resultado (teste, ok) values ('modelo: fila entrega o modelo para a função de envio', v_achou);
end $$;
reset role;
do $$
begin
  update public.mensagens set modelo = null where id = current_setting('teste.msg_modelo')::uuid;
  insert into resultado (teste, ok) values ('modelo: não muda depois de gravado', false);
exception when others then
  insert into resultado (teste, ok) values ('modelo: não muda depois de gravado', sqlerrm like 'o conteúdo%');
end $$;

-- Funil editável (dono da F7 de teste = admin a1)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
  v_novo uuid := (select id from public.etapas_funil where org_id = v_org and nome = 'Novo');
  v_diag uuid := (select id from public.etapas_funil where org_id = v_org and nome = 'Em diagnóstico');
  v_reuniao uuid := (select id from public.etapas_funil where org_id = v_org and nome = 'Reunião marcada');
  v_proposta uuid := (select id from public.etapas_funil where org_id = v_org and nome = 'Proposta');
  v_contato uuid := (select id from public.contatos where org_id = v_org limit 1);
  v_op uuid;
begin
  insert into public.oportunidades (org_id, contato_id, etapa_id, titulo)
  values (v_org, v_contato, v_proposta, 'Teste funil') returning id into v_op;

  begin
    perform public.funil_salvar(v_org,
      jsonb_build_array(jsonb_build_object('id', v_novo, 'nome', 'Novo')), 'Ganho', 'Perdido');
    insert into resultado (teste, ok) values ('funil: remover etapa com cartões exige destino', false);
  exception when others then
    insert into resultado (teste, ok) values ('funil: remover etapa com cartões exige destino', sqlerrm like 'escolha para onde%');
  end;
  begin
    perform public.funil_salvar(v_org, jsonb_build_array(jsonb_build_object('id', null, 'nome', 'Ganho')), 'ganho', 'Perdido');
    insert into resultado (teste, ok) values ('funil: nome repetido recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('funil: nome repetido recusado', sqlerrm = 'há etapas com o mesmo nome');
  end;

  -- troca dois nomes de lugar, reordena, cria uma, remove Proposta (cartão vai para Reunião) e renomeia Ganho
  perform public.funil_salvar(v_org, jsonb_build_array(
      jsonb_build_object('id', v_diag, 'nome', 'Novo'),
      jsonb_build_object('id', v_novo, 'nome', 'Em diagnóstico'),
      jsonb_build_object('id', null, 'nome', 'Visita técnica'),
      jsonb_build_object('id', v_reuniao, 'nome', 'Orçamento')),
    'Fechado', 'Perdido', jsonb_build_object(v_proposta::text, v_reuniao::text));

  insert into resultado (teste, ok) select 'funil: renomeia, reordena, cria e remove numa vez só',
    (select string_agg(nome || ':' || tipo, ',' order by ordem) from public.etapas_funil where org_id = v_org)
      = 'Novo:aberta,Em diagnóstico:aberta,Visita técnica:aberta,Orçamento:aberta,Fechado:ganho,Perdido:perdido';
  insert into resultado (teste, ok) select 'funil: cartão da etapa removida vai para o destino, com histórico',
    (select etapa_id = v_reuniao from public.oportunidades where id = v_op)
    and exists (select 1 from public.oportunidade_historico
                 where oportunidade_id = v_op and etapa_para = v_reuniao and autor_tipo = 'atendente');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
begin
  perform public.funil_salvar((select id from public.organizacoes where slug = 'teste-f7'),
    '[{"id": null, "nome": "X"}]', 'Ganho', 'Perdido');
  insert into resultado (teste, ok) values ('funil: atendente não muda o funil', false);
exception when others then
  insert into resultado (teste, ok) values ('funil: atendente não muda o funil', sqlerrm = 'só dono e admin mudam o funil');
end $$;

-- Agenda (atendente da F7)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
  v_contato uuid := (select contato_id from public.conversas where id = current_setting('teste.conversa')::uuid);
  v_outra_op uuid := (select id from public.oportunidades where org_id = v_org and contato_id <> v_contato limit 1);
  v_id uuid;
begin
  insert into public.compromissos (org_id, titulo, inicio, fim, responsavel_id, contato_id)
  values (v_org, 'Reunião de diagnóstico', '2026-10-20 13:00-03', '2026-10-20 14:00-03',
          '00000000-0000-0000-0000-0000000000b1', v_contato)
  returning id into v_id;
  insert into resultado (teste, ok) select 'agenda: atendente marca compromisso com cliente que vê',
    (select criado_por = '00000000-0000-0000-0000-0000000000b1' and status = 'marcado' and origem = 'equipe'
       from public.compromissos where id = v_id);
  perform set_config('teste.compromisso', v_id::text, true);

  begin
    insert into public.compromissos (org_id, titulo, inicio, fim) values (v_org, 'x', '2026-10-20 14:00-03', '2026-10-20 13:00-03');
    insert into resultado (teste, ok) values ('agenda: fim antes do início recusado', false);
  exception when check_violation then
    insert into resultado (teste, ok) values ('agenda: fim antes do início recusado', true);
  end;
  begin
    insert into public.compromissos (org_id, titulo, inicio, fim, contato_id, oportunidade_id)
    values (v_org, 'x', '2026-10-20 13:00-03', '2026-10-20 14:00-03', v_contato, v_outra_op);
    insert into resultado (teste, ok) values ('agenda: oportunidade de outro cliente recusada', v_outra_op is null);
  exception when others then
    insert into resultado (teste, ok) values ('agenda: oportunidade de outro cliente recusada', sqlerrm = 'a oportunidade é de outro cliente');
  end;
  begin
    insert into public.compromissos (org_id, titulo, inicio, fim, responsavel_id)
    values (v_org, 'x', '2026-10-20 13:00-03', '2026-10-20 14:00-03', '00000000-0000-0000-0000-0000000000c1');
    insert into resultado (teste, ok) values ('agenda: responsável de fora da equipe recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('agenda: responsável de fora da equipe recusado', sqlerrm = 'o responsável precisa ser da equipe');
  end;
  begin
    delete from public.compromissos where id = v_id;
    insert into resultado (teste, ok) select 'agenda: atendente não apaga (cancela)',
      exists (select 1 from public.compromissos where id = v_id);
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'agenda: outra empresa não vê o compromisso',
  not exists (select 1 from public.compromissos where id = current_setting('teste.compromisso')::uuid);

-- Módulos por empresa
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
begin
  insert into resultado (teste, ok) select 'módulos: padrão = agenda ligada, ERP desligado',
    (select ativo from public.org_modulos(v_org) where codigo = 'agenda')
    and not (select ativo from public.org_modulos(v_org) where codigo = 'erp');
  perform public.plataforma_definir_modulo(v_org, 'erp', true);
  perform public.plataforma_definir_modulo(v_org, 'agenda', false);
  insert into resultado (teste, ok) select 'módulos: plataforma liga o ERP e desliga a agenda, com auditoria',
    public.modulo_ativo(v_org, 'erp') and not public.modulo_ativo(v_org, 'agenda')
    and (select count(*) from public.auditoria where org_id = v_org and acao = 'definir_modulo') = 2;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
begin
  begin
    insert into public.compromissos (org_id, titulo, inicio, fim) values (v_org, 'x', '2026-10-21 10:00-03', '2026-10-21 11:00-03');
    insert into resultado (teste, ok) values ('módulos: agenda desligada não aceita compromisso', false);
  exception when insufficient_privilege then
    insert into resultado (teste, ok) values ('módulos: agenda desligada não aceita compromisso', true);
  end;
  begin
    perform public.plataforma_definir_modulo(v_org, 'agenda', true);
    insert into resultado (teste, ok) values ('módulos: membro da empresa não liga módulo', false);
  exception when others then
    insert into resultado (teste, ok) values ('módulos: membro da empresa não liga módulo', sqlerrm = 'só a equipe da plataforma');
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'módulos: outra empresa não lê os módulos da F7',
  not exists (select 1 from public.org_modulos((select id from public.organizacoes where slug = 'teste-f7')));

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
begin
  perform public.plataforma_definir_modulo(v_org, 'agenda', true);
  insert into resultado (teste, ok) select 'módulos: voltar ao padrão apaga a exceção',
    public.modulo_ativo(v_org, 'agenda')
    and not exists (select 1 from public.organizacao_modulos where org_id = v_org and modulo = 'agenda');
end $$;

-- ERP: produtos, pedidos e estoque (a1 é dono da F7 de teste e admin da plataforma)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
  v_contato uuid := (select contato_id from public.conversas where id = current_setting('teste.conversa')::uuid);
  v_a uuid; v_b uuid; v_ped uuid; v_ped2 uuid;
  saldo_a numeric;
begin
  perform public.plataforma_definir_modulo(v_org, 'erp', true);
  insert into public.produtos (org_id, codigo, nome, unidade, preco) values (v_org, 'PF15', 'Pino F15', 'cx', 12.50) returning id into v_a;
  insert into public.produtos (org_id, nome, preco, controla_estoque) values (v_org, 'Instalação', 80, false) returning id into v_b;
  perform public.estoque_lancar(v_a, 10, 'entrada');

  insert into public.pedidos (org_id, contato_id, frete) values (v_org, v_contato, 5) returning id into v_ped;
  insert into public.pedido_itens (org_id, pedido_id, produto_id, descricao, quantidade, preco_unitario)
  values (v_org, v_ped, v_a, 'Pino F15', 3, 12.50), (v_org, v_ped, v_b, 'Instalação', 1, 80);
  insert into resultado (teste, ok) select 'erp: pedido soma itens e frete',
    (select subtotal = 117.50 and total = 122.50 and status = 'rascunho' and numero = 1 from public.pedidos where id = v_ped);

  perform public.pedido_mudar_status(v_ped, 'confirmado');
  select saldo into saldo_a from public.produtos_saldo where id = v_a;
  insert into resultado (teste, ok) select 'erp: confirmar baixa o estoque só do que controla estoque',
    saldo_a = 7 and (select count(*) from public.estoque_movimentos where pedido_id = v_ped) = 1;

  begin
    update public.pedido_itens set quantidade = 9 where pedido_id = v_ped and produto_id = v_a;
    insert into resultado (teste, ok) values ('erp: item não muda depois de confirmado', false);
  exception when others then
    insert into resultado (teste, ok) values ('erp: item não muda depois de confirmado', sqlerrm like 'só dá para mudar os itens%');
  end;
  begin
    update public.pedidos set status = 'entregue' where id = v_ped;
    insert into resultado (teste, ok) values ('erp: situação só muda pela função', false);
  exception when others then
    insert into resultado (teste, ok) values ('erp: situação só muda pela função', sqlerrm like 'use pedido_mudar_status%');
  end;
  begin
    perform public.pedido_mudar_status(v_ped, 'rascunho');
    perform public.pedido_mudar_status(v_ped, 'confirmado');
    perform public.pedido_mudar_status(v_ped, 'cancelado');
    select saldo into saldo_a from public.produtos_saldo where id = v_a;
    insert into resultado (teste, ok) select 'erp: voltar ao rascunho e cancelar devolvem o estoque certo', saldo_a = 10;
  end;
  begin
    perform public.pedido_mudar_status(v_ped, 'confirmado');
    insert into resultado (teste, ok) values ('erp: cancelado não volta', false);
  exception when others then
    insert into resultado (teste, ok) values ('erp: cancelado não volta', sqlerrm like 'não dá para passar%');
  end;
  -- Pela tela nem chega a mudar (sem policy de UPDATE); a trava do gatilho é testada como dono do banco abaixo.
  update public.estoque_movimentos set quantidade = 99 where produto_id = v_a;
  insert into resultado (teste, ok) select 'erp: usuário não altera movimento de estoque',
    not exists (select 1 from public.estoque_movimentos where produto_id = v_a and quantidade = 99);
  delete from public.produtos where id = v_a;
  insert into resultado (teste, ok) select 'erp: produto com histórico não é apagado', exists (select 1 from public.produtos where id = v_a);

  insert into public.pedidos (org_id) values (v_org) returning id into v_ped2;
  insert into resultado (teste, ok) select 'erp: número segue a sequência da empresa', (select numero from public.pedidos where id = v_ped2) = 2;
  perform set_config('teste.produto_a', v_a::text, true);
end $$;

reset role;
do $$
begin
  update public.estoque_movimentos set quantidade = 99 where produto_id = current_setting('teste.produto_a')::uuid;
  insert into resultado (teste, ok) values ('erp: movimento de estoque é imutável até para o banco', false);
exception when others then
  insert into resultado (teste, ok) values ('erp: movimento de estoque é imutável até para o banco', sqlerrm like 'movimentos de estoque não mudam%');
end $$;
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
  v_ped uuid;
begin
  begin
    insert into public.produtos (org_id, nome) values (v_org, 'x');
    insert into resultado (teste, ok) values ('erp: atendente não cadastra produto', false);
  exception when insufficient_privilege then
    insert into resultado (teste, ok) values ('erp: atendente não cadastra produto', true);
  end;
  insert into public.pedidos (org_id) values (v_org) returning id into v_ped;
  insert into public.pedido_itens (org_id, pedido_id, produto_id, descricao, quantidade, preco_unitario)
  values (v_org, v_ped, current_setting('teste.produto_a')::uuid, 'Pino F15', 2, 12.50);
  perform public.pedido_mudar_status(v_ped, 'confirmado');
  insert into resultado (teste, ok) select 'erp: atendente cria e confirma pedido', (select status from public.pedidos where id = v_ped) = 'confirmado';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'erp: outra empresa não vê pedidos nem produtos',
  not exists (select 1 from public.pedidos where org_id = (select id from public.organizacoes where slug = 'teste-f7'))
  and not exists (select 1 from public.produtos where org_id = (select id from public.organizacoes where slug = 'teste-f7'));

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select public.plataforma_definir_modulo((select id from public.organizacoes where slug = 'teste-f7'), 'erp', false);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'erp: módulo desligado esconde pedidos',
  not exists (select 1 from public.pedidos where org_id = (select id from public.organizacoes where slug = 'teste-f7'));

-- Prospecção: iniciar conversa pelo Livih (atendente da F7, número da empresa)
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare
  v_canal uuid := (select canal_id from public.conversas where id = current_setting('teste.conversa')::uuid);
  v_conv uuid;
  v_conv2 uuid;
begin
  v_conv := public.iniciar_conversa(v_canal, '5541961236547', 'Prospect Novo', 'Olá! Tudo bem?');
  insert into resultado (teste, ok) select 'prospecção: contato novo entra na carteira de quem iniciou',
    (select ct.responsavel_id = '00000000-0000-0000-0000-0000000000b1' and ct.origem = 'prospeccao' and ct.nome = 'Prospect Novo'
       from public.conversas cv join public.contatos ct on ct.id = cv.contato_id where cv.id = v_conv);
  insert into resultado (teste, ok) select 'prospecção: conversa nasce em atendimento com quem iniciou e a mensagem vai para a fila',
    (select estado = 'humano' and atribuida_a = '00000000-0000-0000-0000-0000000000b1' from public.conversas where id = v_conv)
    and exists (select 1 from public.mensagens m join public.fila_envio f on f.mensagem_id = m.id
                 where m.conversa_id = v_conv and m.texto = 'Olá! Tudo bem?');
  v_conv2 := public.iniciar_conversa(v_canal, '5541961236547', 'Outro nome', null);
  insert into resultado (teste, ok) select 'prospecção: mesmo número reaproveita contato e conversa', v_conv2 = v_conv
    and (select count(*) from public.contatos where telefone = '5541961236547') = 1;
  begin
    perform public.iniciar_conversa(v_canal, '5541977771111', 'Cliente do Vítor', 'oi');
    insert into resultado (teste, ok) values ('prospecção: cliente da carteira de outro vendedor é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('prospecção: cliente da carteira de outro vendedor é recusado', sqlerrm = 'esse número é cliente de outro vendedor');
  end;
  begin
    perform public.iniciar_conversa(v_canal, '12345', null, 'oi');
    insert into resultado (teste, ok) values ('prospecção: telefone inválido recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('prospecção: telefone inválido recusado', sqlerrm = 'telefone inválido');
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  perform public.iniciar_conversa((select canal_id from public.conversas where id = current_setting('teste.conversa')::uuid), '5541955554444', null, 'oi');
  insert into resultado (teste, ok) values ('prospecção: outra empresa não usa o número da F7', false);
exception when others then
  insert into resultado (teste, ok) values ('prospecção: outra empresa não usa o número da F7', sqlerrm = 'número não encontrado');
end $$;

reset role;
select n, teste, ok from resultado order by n;
