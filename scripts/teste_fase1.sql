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

-- ============================================================================
-- Envio de arquivo (bucket midias + enviar_arquivo)
-- ============================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare
  v_conv uuid := current_setting('teste.conversa')::uuid;
  v_base text := current_setting('teste.f7') || '/' || current_setting('teste.conversa') || '/';
  v_msg uuid;
  m public.mensagens;
begin
  insert into storage.objects (bucket_id, name, owner_id, metadata) values
    ('midias', v_base || 'a1-proposta.pdf', auth.uid()::text, '{"mimetype":"application/pdf","size":1000}'),
    ('midias', v_base || 'a2-foto.png', auth.uid()::text, '{"mimetype":"image/png","size":100000}'),
    ('midias', v_base || 'a3-grande.jpg', auth.uid()::text, '{"mimetype":"image/jpeg","size":6000000}');
  insert into resultado (teste, ok) values ('arquivo: atendente sobe na conversa que vê', true);

  v_msg := public.enviar_arquivo(v_conv, v_base || 'a1-proposta.pdf', 'Proposta Comercial.pdf', '  Segue a proposta ');
  select * into m from public.mensagens where id = v_msg;
  insert into resultado (teste, ok) values ('arquivo: PDF vira documento com nome e legenda',
    m.tipo = 'documento' and m.midia_nome = 'Proposta Comercial.pdf' and m.texto = 'Segue a proposta'
    and m.midia_mime = 'application/pdf' and m.status_entrega = 'pendente' and m.autor_tipo = 'atendente');
  insert into resultado (teste, ok) select 'arquivo: entra na fila e no resumo da conversa',
    exists (select 1 from public.fila_envio where mensagem_id = v_msg)
    and (select ultima_mensagem_resumo from public.conversas where id = v_conv) = '📎 Segue a proposta';

  v_msg := public.enviar_arquivo(v_conv, v_base || 'a2-foto.png', 'foto.png');
  insert into resultado (teste, ok) select 'arquivo: PNG pequeno vira imagem, sem legenda',
    tipo = 'imagem' and texto is null from public.mensagens where id = v_msg;
  v_msg := public.enviar_arquivo(v_conv, v_base || 'a3-grande.jpg', 'grande.jpg');
  insert into resultado (teste, ok) select 'arquivo: JPG acima de 5 MB vai como documento',
    tipo = 'documento' from public.mensagens where id = v_msg;

  begin
    perform public.enviar_arquivo(v_conv, v_base || 'a1-proposta.pdf', 'de novo.pdf');
    insert into resultado (teste, ok) values ('arquivo: o mesmo arquivo não vira duas mensagens', false);
  exception when others then
    insert into resultado (teste, ok) values ('arquivo: o mesmo arquivo não vira duas mensagens', sqlerrm = 'arquivo já enviado');
  end;
  begin
    perform public.enviar_arquivo(v_conv, v_base || 'nao-existe.pdf', 'x.pdf');
    insert into resultado (teste, ok) values ('arquivo: caminho sem arquivo é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('arquivo: caminho sem arquivo é recusado', sqlerrm = 'arquivo não encontrado');
  end;
  begin
    update public.mensagens set midia_nome = 'trocado.pdf' where midia_path = v_base || 'a1-proposta.pdf';
    insert into resultado (teste, ok) values ('arquivo: nome do arquivo não muda depois de gravado', false);
  exception when others then
    insert into resultado (teste, ok) values ('arquivo: nome do arquivo não muda depois de gravado', true);
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'arquivo: outra organização não vê os arquivos', count(*) = 0
  from storage.objects where bucket_id = 'midias';
do $$
begin
  insert into storage.objects (bucket_id, name, owner_id, metadata) values
    ('midias', current_setting('teste.f7') || '/' || current_setting('teste.conversa') || '/x-invasao.pdf',
     auth.uid()::text, '{"mimetype":"application/pdf","size":10}');
  insert into resultado (teste, ok) values ('arquivo: outra organização não sobe na conversa', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('arquivo: outra organização não sobe na conversa', true);
end $$;

reset role;
insert into resultado (teste, ok) select 'arquivo: fila entrega tipo, caminho e nome para o envio',
  bool_or(tipo = 'documento' and midia_nome = 'Proposta Comercial.pdf' and midia_path like '%/a1-proposta.pdf')
  from public.fila_reivindicar(100);

-- ============================================================================
-- Empresas emissoras (orçamento) e telefone do vendedor
-- ============================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare v_org uuid := current_setting('teste.f7')::uuid; v_a uuid; v_b uuid;
begin
  insert into public.emissoras (org_id, razao_social, cnpj) values (v_org, 'F7 Tech Ltda', '11222333000181') returning id into v_a;
  insert into resultado (teste, ok) select 'emissora: a primeira nasce padrão', padrao from public.emissoras where id = v_a;
  insert into public.emissoras (org_id, razao_social, cnpj, padrao) values (v_org, 'F7 Filial', '11444777000161', true) returning id into v_b;
  insert into resultado (teste, ok) select 'emissora: marcar outra como padrão desmarca a anterior',
    (select padrao from public.emissoras where id = v_b) and not (select padrao from public.emissoras where id = v_a);
  update public.emissoras set padrao = false where id = v_b;
  insert into resultado (teste, ok) select 'emissora: a única padrão não fica sem padrão', padrao from public.emissoras where id = v_b;
  delete from public.emissoras where id = v_b;
  insert into resultado (teste, ok) select 'emissora: apagar a padrão promove a que sobrou', padrao from public.emissoras where id = v_a;
  begin
    insert into public.emissoras (org_id, razao_social, cnpj) values (v_org, 'Errada', '11222333000182');
    insert into resultado (teste, ok) values ('emissora: CNPJ com dígito errado é recusado', false);
  exception when check_violation then
    insert into resultado (teste, ok) values ('emissora: CNPJ com dígito errado é recusado', true);
  end;
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('logos', v_org || '/' || v_a || '/logo.png', auth.uid()::text, '{"mimetype":"image/png","size":1000}');
  insert into resultado (teste, ok) values ('logo: dono/admin sobe a logo', true);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'emissora: atendente vê a emissora e a logo',
  (select count(*) from public.emissoras) = 1 and (select count(*) from storage.objects where bucket_id = 'logos') = 1;
do $$
begin
  insert into public.emissoras (org_id, razao_social, cnpj) values (current_setting('teste.f7')::uuid, 'Atendente', '62213016000130');
  insert into resultado (teste, ok) values ('emissora: atendente não cadastra', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('emissora: atendente não cadastra', true);
end $$;
do $$
begin
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('logos', current_setting('teste.f7') || '/x/outra.png', auth.uid()::text, '{"mimetype":"image/png","size":10}');
  insert into resultado (teste, ok) values ('logo: atendente não sobe logo', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('logo: atendente não sobe logo', true);
end $$;
update public.perfis set telefone = '5541999998888' where user_id = auth.uid();
insert into resultado (teste, ok) select 'perfil: vendedor grava o próprio telefone', telefone = '5541999998888'
  from public.perfis where user_id = auth.uid();
do $$
begin
  update public.perfis set telefone = '123' where user_id = auth.uid();
  insert into resultado (teste, ok) values ('perfil: telefone inválido recusado', false);
exception when check_violation then
  insert into resultado (teste, ok) values ('perfil: telefone inválido recusado', true);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'emissora: outra empresa não vê emissora nem logo',
  (select count(*) from public.emissoras) = 0 and (select count(*) from storage.objects where bucket_id = 'logos') = 0;

-- ============================================================================
-- Orçamento no pedido (emissora, validade, condições, prazo, responsável)
-- ============================================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_padrao uuid := (select id from public.emissoras where org_id = current_setting('teste.f7')::uuid and padrao);
  v_outra uuid;
  v_ped uuid;
  p public.pedidos;
begin
  perform public.plataforma_definir_modulo(v_org, 'erp', true);
  update public.emissoras set validade_dias = 10, condicoes_pagamento = 'Pix à vista', prazo_entrega = '5 dias úteis' where id = v_padrao;
  insert into public.emissoras (org_id, razao_social, cnpj, validade_dias, condicoes_pagamento, prazo_entrega)
  values (v_org, 'F7 Filial', '11444777000161', 30, 'Boleto 30 dias', '15 dias') returning id into v_outra;

  insert into public.pedidos (org_id) values (v_org) returning * into p;
  v_ped := p.id;
  insert into resultado (teste, ok) values ('orçamento: pedido novo vem com a emissora padrão e os padrões dela',
    p.emissora_id = v_padrao and p.validade = public.hoje_brasil() + 10
    and p.condicoes_pagamento = 'Pix à vista' and p.prazo_entrega = '5 dias úteis');
  insert into resultado (teste, ok) values ('orçamento: quem cria vira o responsável', p.responsavel_id = auth.uid());

  update public.pedidos set prazo_entrega = 'Combinado: 2 dias' where id = v_ped;
  update public.pedidos set emissora_id = v_outra where id = v_ped returning * into p;
  insert into resultado (teste, ok) values ('orçamento: trocar a emissora recarrega só o que ainda era padrão',
    p.validade = public.hoje_brasil() + 30 and p.condicoes_pagamento = 'Boleto 30 dias' and p.prazo_entrega = 'Combinado: 2 dias');

  insert into public.pedido_itens (org_id, pedido_id, descricao, quantidade, preco_unitario) values (v_org, v_ped, 'Serviço', 1, 100);
  perform public.pedido_mudar_status(v_ped, 'confirmado');
  begin
    update public.pedidos set condicoes_pagamento = 'mudou' where id = v_ped;
    insert into resultado (teste, ok) values ('orçamento: condições não mudam depois de confirmado', false);
  exception when others then
    insert into resultado (teste, ok) values ('orçamento: condições não mudam depois de confirmado', sqlerrm like 'cliente, valores e condições só mudam no rascunho%');
  end;
  update public.pedidos set responsavel_id = '00000000-0000-0000-0000-0000000000b1' where id = v_ped;
  insert into resultado (teste, ok) select 'orçamento: responsável ainda muda depois de confirmado',
    responsavel_id = '00000000-0000-0000-0000-0000000000b1' from public.pedidos where id = v_ped;

  begin
    delete from public.emissoras where id = v_outra;
    insert into resultado (teste, ok) values ('orçamento: empresa usada em pedido não é apagada', false);
  exception when foreign_key_violation then
    insert into resultado (teste, ok) values ('orçamento: empresa usada em pedido não é apagada', true);
  end;
end $$;

-- Busca de produtos do agente (só a chave de serviço chama).
reset role;
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_conv uuid := current_setting('teste.conversa')::uuid;
  r jsonb;
begin
  insert into public.produtos (org_id, codigo, nome, unidade, preco, categoria, marca, ncm, descricao, controla_estoque) values
    (v_org, '14/19', '14/19', 'cx', 102.70, 'Família 14', null, null, 'Caixinha com 9.450 unidades.', false),
    (v_org, 'Prego 2,30x35 Anelado', 'Prego 2,30x35 Anelado', 'cx', 477.20, 'Família Prego', null, null, null, false),
    (v_org, 'PACAR 2.038', 'PREGADOR PI-83', 'un', 7551.03, 'Pregadores', 'PACAR', '84671900', 'Pregador pneumático.', false),
    (v_org, 'IMECO 4.003', 'GRAMPEADOR FIXALEV 2002', 'un', 777.13, 'Grampeadores', 'IMECO', '84671900', 'Compatível com a linha 92.', false);
  r := public.agente_buscar_produtos(v_conv, '14/19');
  insert into resultado (teste, ok) values ('busca: referência exata acha o produto', r -> 'produtos' -> 0 ->> 'nome' = '14/19' and r ->> 'aviso' is null);
  r := public.agente_buscar_produtos(v_conv, 'prego');
  insert into resultado (teste, ok) values ('busca: palavra inteira no nome vem antes (prego antes de pregador)', r -> 'produtos' -> 0 ->> 'nome' = 'Prego 2,30x35 Anelado');
  r := public.agente_buscar_produtos(v_conv, 'grampeador imeço');
  insert into resultado (teste, ok) values ('busca: ignora acento e maiúscula', r -> 'produtos' -> 0 ->> 'codigo' = 'IMECO 4.003' and (r -> 'produtos' -> 0 ->> 'preco')::numeric = 777.13);
  r := public.agente_buscar_produtos(v_conv, 'parafusadeira dewalt');
  insert into resultado (teste, ok) values ('busca: sem resultado avisa para não inventar', (r ->> 'encontrados')::int = 0 and r ->> 'aviso' like 'Nenhum produto encontrado%');
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
begin
  perform public.agente_buscar_produtos(current_setting('teste.conversa')::uuid, 'prego');
  insert into resultado (teste, ok) values ('busca: usuário logado não chama a função do agente', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('busca: usuário logado não chama a função do agente', true);
end $$;

-- O agente monta o rascunho e envia o orçamento (chave de serviço; conversa com o agente).
reset role;
update public.conversas set estado = 'bot', atribuida_a = null where id = current_setting('teste.conversa')::uuid;
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_conv uuid := current_setting('teste.conversa')::uuid;
  v_contato uuid := (select contato_id from public.conversas where id = current_setting('teste.conversa')::uuid);
  r jsonb; r2 jsonb; v_num integer; v_manual uuid; v_path text;
begin
  insert into public.pedidos (org_id, contato_id) values (v_org, v_contato) returning id into v_manual;
  r := public.agente_montar_pedido(v_conv, '[{"codigo":"14/19","quantidade":10},{"codigo":"XYZ-999","quantidade":1},{"codigo":"pacar 2.038","quantidade":"2"}]');
  v_num := (r ->> 'orcamento_numero')::int;
  insert into resultado (teste, ok) values ('agente pedido: monta com preço do cadastro e separa código desconhecido',
    (r ->> 'sucesso')::boolean and jsonb_array_length(r -> 'itens') = 2 and (r ->> 'total')::numeric = 10 * 102.70 + 2 * 7551.03
    and jsonb_array_length(r -> 'nao_encontrados') = 1 and r ->> 'total_formatado' = 'R$ 16.129,06');
  insert into resultado (teste, ok) select 'agente pedido: rascunho de origem agente e aviso na conversa',
    exists (select 1 from public.pedidos where numero = v_num and org_id = v_org and origem = 'agente' and status = 'rascunho')
    and exists (select 1 from public.mensagens where conversa_id = v_conv and autor_tipo = 'sistema' and texto like 'O agente montou o orçamento #' || v_num || '%');

  r2 := public.agente_montar_pedido(v_conv, '[{"codigo":"14/19","quantidade":3}]', 'Entregar na portaria');
  insert into resultado (teste, ok) select 'agente pedido: nova lista atualiza o mesmo rascunho sem duplicar',
    (r2 ->> 'orcamento_numero')::int = v_num and jsonb_array_length(r2 -> 'itens') = 1 and (r2 ->> 'total')::numeric = 308.10
    and (select count(*) from public.pedidos where org_id = v_org and contato_id = v_contato and origem = 'agente') = 1
    and (select observacao from public.pedidos where numero = v_num and org_id = v_org) = 'Entregar na portaria';
  insert into resultado (teste, ok) select 'agente pedido: não mexe no rascunho da equipe',
    not exists (select 1 from public.pedido_itens where pedido_id = v_manual);

  r := public.agente_dados_orcamento(v_conv);
  insert into resultado (teste, ok) values ('agente pedido: dados do PDF com itens, código, empresa e cliente',
    (r ->> 'sucesso')::boolean and (r -> 'pedido' ->> 'numero')::int = v_num and r -> 'itens' -> 0 ->> 'codigo' = '14/19'
    and r -> 'emissora' ->> 'cnpj' is not null and r -> 'cliente' ->> 'nome' is not null);

  v_path := v_org || '/' || v_conv || '/orc-' || v_num || '.pdf';
  insert into storage.objects (bucket_id, name, metadata) values ('midias', v_path, '{"mimetype":"application/pdf","size":12000}');
  r := public.agente_enviar_arquivo(v_conv, v_path, 'Orcamento-' || v_num || '.pdf', 'Orçamento nº ' || v_num);
  insert into resultado (teste, ok) select 'agente pedido: PDF vai na conversa como mensagem do agente e entra na fila',
    (r ->> 'enviado')::boolean and m.autor_tipo = 'bot' and m.tipo = 'documento' and m.midia_nome = 'Orcamento-' || v_num || '.pdf'
    and exists (select 1 from public.fila_envio f where f.mensagem_id = m.id)
    from public.mensagens m where m.id = (r ->> 'mensagem_id')::uuid;

  perform public.pedido_mudar_status((select id from public.pedidos where numero = v_num and org_id = v_org), 'confirmado');
  r := public.agente_montar_pedido(v_conv, '[{"codigo":"14/19","quantidade":1}]');
  insert into resultado (teste, ok) select 'agente pedido: pedido confirmado não muda (o agente abre outro rascunho)',
    (r ->> 'orcamento_numero')::int <> v_num
    and (select count(*) from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id where p.numero = v_num and p.org_id = v_org) = 1
    and (select quantidade from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id where p.numero = v_num and p.org_id = v_org) = 3;

  update public.conversas set estado = 'humano' where id = v_conv;
  r := public.agente_montar_pedido(v_conv, '[{"codigo":"14/19","quantidade":5}]');
  insert into resultado (teste, ok) values ('agente pedido: conversa com a equipe, o agente não monta', not (r ->> 'sucesso')::boolean);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
begin
  perform public.agente_montar_pedido(current_setting('teste.conversa')::uuid, '[{"codigo":"14/19","quantidade":1}]');
  insert into resultado (teste, ok) values ('agente pedido: usuário logado não chama as funções do agente', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('agente pedido: usuário logado não chama as funções do agente', true);
end $$;

-- Mídia recebida: o arquivo é ligado à mensagem uma vez, só pela função de serviço.
reset role;
do $$
declare
  v_conv uuid := current_setting('teste.conversa')::uuid;
  v_canal uuid := (select canal_id from public.conversas where id = current_setting('teste.conversa')::uuid);
  v_org uuid := current_setting('teste.f7')::uuid;
  v_msg uuid; d jsonb; r jsonb; v_path text;
begin
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, midia_mime, wa_id, status_entrega)
  values (v_org, v_conv, 'entrada', 'contato', 'documento', 'requisicao_compra.pdf', 'application/pdf', 'wa-midia-1', 'recebida')
  returning id into v_msg;
  d := public.midia_destino(v_canal, 'wa-midia-1');
  insert into resultado (teste, ok) values ('mídia: acha a mensagem pelo número e id do WhatsApp',
    (d ->> 'mensagem_id')::uuid = v_msg and not (d ->> 'ja_tem')::boolean);

  v_path := v_org || '/' || v_conv || '/recebido-' || v_msg || '-requisicao_compra.pdf';
  insert into storage.objects (bucket_id, name, metadata) values ('midias', v_path, '{"mimetype":"application/pdf","size":3000}');
  r := public.guardar_midia(v_msg, v_path, 'requisicao_compra.pdf', 'application/pdf');
  insert into resultado (teste, ok) select 'mídia: arquivo recebido fica ligado à mensagem',
    (r ->> 'guardado')::boolean and midia_path = v_path and midia_nome = 'requisicao_compra.pdf'
    from public.mensagens where id = v_msg;

  r := public.guardar_midia(v_msg, v_path, 'outro.pdf', 'application/pdf');
  insert into resultado (teste, ok) values ('mídia: não troca o arquivo depois de guardado', not (r ->> 'guardado')::boolean);
  begin
    update public.mensagens set midia_path = v_org || '/' || v_conv || '/trocado.pdf' where id = v_msg;
    insert into resultado (teste, ok) values ('mídia: fora da função o arquivo continua imutável', false);
  exception when others then
    insert into resultado (teste, ok) values ('mídia: fora da função o arquivo continua imutável', sqlerrm like 'o conteúdo de uma mensagem%');
  end;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, midia_mime, wa_id, status_entrega)
  values (v_org, v_conv, 'entrada', 'contato', 'imagem', 'image/jpeg', 'wa-midia-2', 'recebida')
  returning id into v_msg;
  begin
    perform public.guardar_midia(v_msg, 'outra-org/x/y.pdf', 'y.pdf', 'application/pdf');
    insert into resultado (teste, ok) values ('mídia: caminho fora da conversa é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('mídia: caminho fora da conversa é recusado', true);
  end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
begin
  perform public.midia_destino(gen_random_uuid(), 'x');
  insert into resultado (teste, ok) values ('mídia: usuário logado não chama as funções de serviço', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('mídia: usuário logado não chama as funções de serviço', true);
end $$;

-- Descrição automática de imagem/PDF: gravada na mensagem, vai para o contexto do agente e diz se chama o agente.
reset role;
do $$
declare
  v_conv uuid := current_setting('teste.conversa')::uuid;
  v_org uuid := current_setting('teste.f7')::uuid;
  v_msg uuid; r jsonb; c jsonb;
begin
  update public.conversas set estado = 'bot', atribuida_a = null where id = v_conv;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, midia_mime, wa_id, status_entrega)
  values (v_org, v_conv, 'entrada', 'contato', 'imagem', 'vocês vendem esse grampo?', 'image/jpeg', 'wa-desc-1', 'recebida')
  returning id into v_msg;
  r := public.registrar_descricao(v_msg, 'Caixa de grampos 26/6 galvanizados, marca Bacchi, 5.000 unidades.');
  insert into resultado (teste, ok) select 'descrição: gravada na mensagem e no resumo da conversa',
    (select descricao from public.mensagens where id = v_msg) like 'Caixa de grampos 26/6%'
    and (select ultima_mensagem_resumo from public.conversas where id = v_conv) like '🖼️ Caixa de grampos%'
    and (r ->> 'mensagem_id')::uuid = v_msg;
  c := public.agente_contexto(v_conv);
  insert into resultado (teste, ok) select 'descrição: vai para o agente separada da legenda',
    exists (select 1 from jsonb_array_elements(c -> 'mensagens') m
             where m ->> 'descricao' like 'Caixa de grampos 26/6%' and m ->> 'texto' = 'vocês vendem esse grampo?');
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
begin
  perform public.registrar_descricao(gen_random_uuid(), 'x');
  insert into resultado (teste, ok) values ('descrição: usuário logado não grava descrição', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('descrição: usuário logado não grava descrição', true);
end $$;

-- Biblioteca de documentos: dono/admin cadastram, toda a equipe vê, o agente busca e envia (chave de serviço).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_doc uuid; v_doc2 uuid;
begin
  insert into public.documentos (org_id, titulo, tipo, descricao, palavras_chave, path, nome_arquivo, mime, tamanho)
  values (v_org, 'Vista explodida — grampeador 80/W-LS', 'Vista explodida', 'Peças numeradas com código', '80W, 80 W, PACAR 80',
          v_org || '/doc-80w/vista-80w.pdf', 'Vista explodida 80W-LS.pdf', 'application/pdf', 120000)
  returning id into v_doc;
  insert into public.documentos_produtos (documento_id, produto_id, org_id)
  values (v_doc, (select id from public.produtos where org_id = v_org and codigo = '14/19'), v_org);
  insert into public.documentos (org_id, titulo, tipo, path, nome_arquivo, mime, tamanho, ativo)
  values (v_org, 'Catálogo geral 2025', 'Catálogo', v_org || '/doc-cat/catalogo.pdf', 'Catalogo.pdf', 'application/pdf', 900000, false)
  returning id into v_doc2;
  perform set_config('teste.doc', v_doc::text, false);
  perform set_config('teste.doc_inativo', v_doc2::text, false);
  insert into resultado (teste, ok) values ('documentos: dono cadastra e liga a produto', true);
exception when others then
  insert into resultado (teste, ok) values ('documentos: dono cadastra e liga a produto: ' || sqlerrm, false);
end $$;
do $$
begin
  insert into public.documentos (org_id, titulo, path, nome_arquivo, mime, tamanho)
  values (current_setting('teste.f7')::uuid, 'Fora da pasta', current_setting('teste.cli') || '/x/y.pdf', 'y.pdf', 'application/pdf', 10);
  insert into resultado (teste, ok) values ('documentos: arquivo fora da pasta da empresa é recusado', false);
exception when others then
  insert into resultado (teste, ok) values ('documentos: arquivo fora da pasta da empresa é recusado', true);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'documentos: atendente vê a biblioteca', count(*) = 2 from public.documentos where org_id = current_setting('teste.f7')::uuid;
do $$
begin
  insert into public.documentos (org_id, titulo, path, nome_arquivo, mime, tamanho)
  values (current_setting('teste.f7')::uuid, 'Do atendente', current_setting('teste.f7') || '/x/y.pdf', 'y.pdf', 'application/pdf', 10);
  insert into resultado (teste, ok) values ('documentos: atendente não cadastra', false);
exception when others then
  insert into resultado (teste, ok) values ('documentos: atendente não cadastra', true);
end $$;
with u as (update public.documentos set titulo = 'mudado' where id = current_setting('teste.doc')::uuid returning 1)
insert into resultado (teste, ok) select 'documentos: atendente não edita', count(*) = 0 from u;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'documentos: outra empresa não vê', count(*) = 0 from public.documentos where org_id = current_setting('teste.f7')::uuid;
insert into resultado (teste, ok)
select 'documentos: outra empresa não vê os produtos ligados', count(*) = 0 from public.documentos_produtos;

reset role;
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_conv uuid := current_setting('teste.conversa')::uuid;
  v_doc uuid := current_setting('teste.doc')::uuid;
  b jsonb; p jsonb; e jsonb; p2 jsonb;
begin
  update public.conversas set estado = 'bot', atribuida_a = null where id = v_conv;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, wa_id, status_entrega)
  values (v_org, v_conv, 'entrada', 'contato', 'texto', 'me manda a vista explodida do 80W', 'wa-doc-1', 'recebida');

  b := public.agente_buscar_documentos(v_conv, 'vista explodida do 80w');
  insert into resultado (teste, ok) values ('documentos agente: busca pela palavra-chave e devolve produto ligado',
    (b ->> 'encontrados')::int = 1 and (b -> 'documentos' -> 0 ->> 'id')::uuid = v_doc and b -> 'documentos' -> 0 -> 'produtos' is not null);
  b := public.agente_buscar_documentos(v_conv, '14/19');
  insert into resultado (teste, ok) values ('documentos agente: busca pelo código do produto ligado',
    (b -> 'documentos' -> 0 ->> 'id')::uuid = v_doc);
  b := public.agente_buscar_documentos(v_conv, 'catalogo geral');
  insert into resultado (teste, ok) values ('documentos agente: inativo não aparece na busca',
    (b ->> 'encontrados')::int = 0 and b ->> 'aviso' like '%chame chamar_humano%');

  p := public.agente_preparar_documento(v_conv, current_setting('teste.doc_inativo')::uuid);
  insert into resultado (teste, ok) values ('documentos agente: inativo não é enviado', p ->> 'pronto' is null);

  p := public.agente_preparar_documento(v_conv, v_doc);
  insert into resultado (teste, ok) values ('documentos agente: prepara cópia na pasta da conversa',
    (p ->> 'pronto')::boolean and p ->> 'origem' = v_org || '/doc-80w/vista-80w.pdf'
    and p ->> 'destino' like v_org || '/' || v_conv || '/%-vista_explodida_80w-ls.pdf');
  insert into storage.objects (bucket_id, name, metadata) values ('midias', p ->> 'destino', '{"mimetype":"application/pdf","size":120000}');
  e := public.agente_enviar_documento(v_conv, v_doc, p ->> 'destino');
  insert into resultado (teste, ok) select 'documentos agente: envia como mensagem do agente, com título, e registra',
    (e ->> 'enviado')::boolean and m.autor_tipo = 'bot' and m.texto = 'Vista explodida — grampeador 80/W-LS'
    and m.midia_nome = 'Vista explodida 80W-LS.pdf'
    and exists (select 1 from public.documentos_envios d where d.mensagem_id = m.id and d.documento_id = v_doc and d.autor_tipo = 'bot')
    from public.mensagens m where m.id = (e ->> 'mensagem_id')::uuid;

  p2 := public.agente_preparar_documento(v_conv, v_doc);
  insert into resultado (teste, ok) values ('documentos agente: não reenvia em 24 h sem o cliente pedir',
    p2 ->> 'pronto' is null and p2 ->> 'ja_enviado_em' is not null);
  p2 := public.agente_preparar_documento(v_conv, v_doc, true);
  insert into resultado (teste, ok) values ('documentos agente: reenvia quando o cliente diz que não recebeu', (p2 ->> 'pronto')::boolean);

  with m as (
    insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, status_entrega)
    select v_org, v_conv, 'saida', 'bot', 'texto', 'doc ' || g, 'pendente' from generate_series(1, 2) g
    returning id)
  insert into public.documentos_envios (org_id, documento_id, conversa_id, mensagem_id, autor_tipo)
  select v_org, null, v_conv, id, 'bot' from m;
  p2 := public.agente_preparar_documento(v_conv, v_doc, true);
  insert into resultado (teste, ok) values ('documentos agente: no máximo 3 por resposta', coalesce(p2 ->> 'aviso' like 'Limite de 3%', false));

  update public.conversas set estado = 'humano' where id = v_conv;
  p2 := public.agente_preparar_documento(v_conv, v_doc, true);
  insert into resultado (teste, ok) values ('documentos agente: conversa com a equipe bloqueia', p2 ->> 'aviso' like 'A conversa está com a equipe%');
  update public.conversas set estado = 'bot' where id = v_conv;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
begin
  perform public.agente_buscar_documentos(current_setting('teste.conversa')::uuid, 'x');
  insert into resultado (teste, ok) values ('documentos agente: usuário logado não chama as funções do agente', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('documentos agente: usuário logado não chama as funções do agente', true);
end $$;
do $$
begin
  insert into public.documentos_envios (org_id, conversa_id, mensagem_id, autor_tipo)
  select org_id, conversa_id, id, 'equipe' from public.mensagens where conversa_id = current_setting('teste.conversa')::uuid limit 1;
  insert into resultado (teste, ok) values ('documentos: envio só é registrado pelas funções', false);
exception when others then
  insert into resultado (teste, ok) values ('documentos: envio só é registrado pelas funções', true);
end $$;

-- Simulador de conversa: contexto montado com as mensagens da tela, orçamento e documento sem gravar nada.
reset role;
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  c jsonb; r jsonb; d jsonb;
  v_pedidos integer := (select count(*) from public.pedidos where org_id = current_setting('teste.f7')::uuid);
  v_msgs integer := (select count(*) from public.mensagens where org_id = current_setting('teste.f7')::uuid);
begin
  c := public.agente_contexto_simulado(v_org, '[{"de":"cliente","texto":"oi, tem grampo 14/19?"}]');
  insert into resultado (teste, ok) values ('simulador: contexto com as mensagens da tela e o prompt salvo',
    c -> 'mensagens' -> 0 ->> 'de' = 'cliente' and c -> 'mensagens' -> 0 ->> 'texto' = 'oi, tem grampo 14/19?'
    and (c ->> 'primeira_resposta')::boolean and c -> 'agente' ->> 'prompt' is not null
    and c -> 'contato' ->> 'nome_whatsapp' = 'Cliente de teste');

  c := public.agente_contexto_simulado(v_org, '[{"de":"cliente","texto":"oi"},{"de":"assistente","texto":"Olá!"},{"de":"cliente","texto":"preço?"}]',
                                       'Instruções ainda não salvas', '["cliente pediu desconto"]');
  insert into resultado (teste, ok) values ('simulador: testa instruções e regras ainda não salvas',
    c -> 'agente' ->> 'prompt' = 'Instruções ainda não salvas'
    and c -> 'agente' -> 'regras_humano' -> 'casos' = '["cliente pediu desconto"]'::jsonb
    and not (c ->> 'primeira_resposta')::boolean and c -> 'mensagens' -> 1 ->> 'de' = 'assistente');

  r := public.buscar_produtos_org(v_org, '14/19');
  insert into resultado (teste, ok) values ('simulador: busca de produtos por empresa igual à do agente',
    (r ->> 'encontrados')::int >= 1 and r -> 'produtos' -> 0 ->> 'codigo' = '14/19');

  r := public.simulador_montar_pedido(v_org, '[{"codigo":"14/19","quantidade":10},{"codigo":"XYZ-999","quantidade":1}]');
  insert into resultado (teste, ok) values ('simulador: orçamento com preço do cadastro, sem gravar pedido nem mensagem',
    (r ->> 'sucesso')::boolean and (r ->> 'simulado')::boolean and r ->> 'orcamento_numero' = 'TESTE'
    and (r ->> 'total')::numeric = 10 * 102.70 and jsonb_array_length(r -> 'nao_encontrados') = 1
    and (select count(*) from public.pedidos where org_id = v_org) = v_pedidos
    and (select count(*) from public.mensagens where org_id = v_org) = v_msgs);

  d := public.simulador_documento(v_org, current_setting('teste.doc')::uuid);
  insert into resultado (teste, ok) values ('simulador: documento ativo "enviado" sem enviar',
    (d ->> 'enviado')::boolean and (d ->> 'simulado')::boolean
    and not exists (select 1 from public.documentos_envios where documento_id = current_setting('teste.doc')::uuid
                     and mensagem_id not in (select id from public.mensagens where org_id = v_org)));
  d := public.simulador_documento(v_org, current_setting('teste.doc_inativo')::uuid);
  insert into resultado (teste, ok) values ('simulador: documento inativo não sai', not (d ->> 'enviado')::boolean);
  d := public.simulador_documento(current_setting('teste.cli')::uuid, current_setting('teste.doc')::uuid);
  insert into resultado (teste, ok) values ('simulador: documento de outra empresa não sai', not (d ->> 'enviado')::boolean);

  r := public.buscar_documentos_org(v_org, 'vista explodida do 14/45');
  insert into resultado (teste, ok) values ('documentos: só o tipo em comum não vira "o mais próximo" (14/45 ≠ 80W)',
    (r ->> 'encontrados')::int = 0 and r ->> 'aviso' like 'Nenhum documento encontrado%');
  r := public.buscar_documentos_org(v_org, 'manual do 80w');
  insert into resultado (teste, ok) values ('documentos: mesmo produto com outro tipo ainda aparece como próximo',
    (r ->> 'encontrados')::int = 1 and r ->> 'aviso' like 'Nenhum documento tem todos os termos%');
  r := public.buscar_documentos_org(v_org, 'vista explodida');
  insert into resultado (teste, ok) values ('documentos: busca só pelo tipo acha os desse tipo',
    (r ->> 'encontrados')::int = 1 and r ->> 'aviso' is null);

  insert into public.simulacoes_agente (org_id) select v_org from generate_series(1, 199);
  insert into resultado (teste, ok) values ('simulador: limite de 200 respostas de teste por dia',
    public.simulador_registrar(v_org, null) and not public.simulador_registrar(v_org, null));
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
begin
  perform public.agente_contexto_simulado(current_setting('teste.f7')::uuid, '[]');
  insert into resultado (teste, ok) values ('simulador: usuário logado não chama as funções do simulador', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('simulador: usuário logado não chama as funções do simulador', true);
end $$;

-- Importador de catálogo: produto sem preço (preço 0) e acesso às importações.
reset role;
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_conv uuid := current_setting('teste.conversa')::uuid;
  r jsonb;
begin
  insert into public.produtos (org_id, codigo, nome, unidade, preco, controla_estoque)
  values (v_org, 'PAC-80W', 'Grampeador PACAR 80/W-LS', 'un', 0, false);

  r := public.buscar_produtos_org(v_org, 'PAC-80W');
  insert into resultado (teste, ok) values ('sem preço: a busca devolve preço vazio e "sob consulta", nunca R$ 0',
    r -> 'produtos' -> 0 ->> 'codigo' = 'PAC-80W' and r -> 'produtos' -> 0 -> 'preco' = 'null'::jsonb
    and r -> 'produtos' -> 0 ->> 'preco_texto' like 'sob consulta%');
  r := public.buscar_produtos_org(v_org, '14/19');
  insert into resultado (teste, ok) values ('sem preço: produto com preço continua com o valor',
    (r -> 'produtos' -> 0 ->> 'preco')::numeric = 102.70 and r -> 'produtos' -> 0 ->> 'preco_texto' is null);

  r := public.simulador_montar_pedido(v_org, '[{"codigo":"PAC-80W","quantidade":1},{"codigo":"14/19","quantidade":2}]');
  insert into resultado (teste, ok) values ('sem preço: o orçamento de teste recusa o item sem preço',
    (r ->> 'sucesso')::boolean and jsonb_array_length(r -> 'itens') = 1 and (r ->> 'total')::numeric = 205.40
    and r -> 'nao_encontrados' -> 0 ->> 'motivo' like 'sem preço cadastrado%');

  update public.conversas set estado = 'bot', atribuida_a = null where id = v_conv;
  r := public.agente_montar_pedido(v_conv, '[{"codigo":"PAC-80W","quantidade":1}]');
  insert into resultado (teste, ok) values ('sem preço: o agente não monta orçamento só com item sem preço',
    not (r ->> 'sucesso')::boolean and r -> 'nao_encontrados' -> 0 ->> 'motivo' like 'sem preço cadastrado%');

  insert into public.importacoes_catalogo (org_id, origem, nome, modo_preco, status, resultado)
  values (v_org, 'pdf', 'tabela.pdf', 'venda', 'pronto', '{"linhas":[]}');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'importação: atendente não vê as importações', count(*) = 0 from public.importacoes_catalogo;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'importação: outra empresa não vê as importações', count(*) = 0 from public.importacoes_catalogo;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'importação: dono acompanha a importação', count(*) = 1 from public.importacoes_catalogo where nome = 'tabela.pdf';
do $$
begin
  insert into public.importacoes_catalogo (org_id, origem, modo_preco) values (current_setting('teste.f7')::uuid, 'texto', 'venda');
  insert into resultado (teste, ok) values ('importação: só a função grava importações', false);
exception when others then
  insert into resultado (teste, ok) values ('importação: só a função grava importações', true);
end $$;

-- Assistente orientador: aplicar a proposta por seção, desfazer e quem pode.
reset role;
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_velho uuid; v_dup uuid; v_sessao uuid;
begin
  insert into public.base_conhecimento (org_id, titulo, conteudo, ativo) values (v_org, 'Horários e frete', 'texto antigo', true)
  returning id into v_velho;
  insert into public.base_conhecimento (org_id, titulo, conteudo, ativo) values (v_org, 'Frete (repetido)', 'texto repetido', true)
  returning id into v_dup;
  insert into public.assistente_sessoes (org_id, modo, status, proposta) values (v_org, 'revisar', 'proposta', jsonb_build_object(
    'instrucoes', jsonb_build_object('texto', 'Instruções enxutas do assistente', 'por_que', 'menor'),
    'regras', jsonb_build_object('lista', '["Cliente pede desconto acima de 5%", "Reclamação de entrega"]'::jsonb, 'por_que', 'curtas'),
    'base', jsonb_build_array(
      jsonb_build_object('acao', 'atualizar', 'id', v_velho, 'titulo', 'Frete e prazos', 'conteudo', 'texto novo', 'por_que', 'x'),
      jsonb_build_object('acao', 'desativar', 'id', v_dup, 'titulo', 'Frete (repetido)', 'conteudo', null, 'por_que', 'repete'),
      jsonb_build_object('acao', 'criar', 'id', null, 'titulo', 'Formas de pagamento', 'conteudo', 'Pix e boleto', 'por_que', 'faltava'))))
  returning id into v_sessao;
  perform set_config('teste.sessao', v_sessao::text, false);
  perform set_config('teste.base_velho', v_velho::text, false);
  perform set_config('teste.base_dup', v_dup::text, false);
  perform set_config('teste.prompt_antes', (select prompt from public.agentes where org_id = v_org order by ativo desc, atualizado_em desc limit 1), false);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'assistente: atendente não vê as sessões', count(*) = 0 from public.assistente_sessoes;
do $$
begin
  perform public.assistente_aplicar(current_setting('teste.sessao')::uuid, '{"instrucoes": true}');
  insert into resultado (teste, ok) values ('assistente: atendente não aplica proposta', false);
exception when others then
  insert into resultado (teste, ok) values ('assistente: atendente não aplica proposta', true);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'assistente: outra empresa não vê as sessões', count(*) = 0 from public.assistente_sessoes;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  r jsonb;
begin
  r := public.assistente_aplicar(current_setting('teste.sessao')::uuid, '{"instrucoes": true, "regras": true, "base": [0, 1, 2]}');
  insert into resultado (teste, ok) select 'assistente: dono aplica instruções, regras e base (criar, editar, desativar)',
    (r ->> 'aplicadas')::int = 5
    and (select bool_and(prompt = 'Instruções enxutas do assistente') from public.agentes where org_id = v_org)
    and (select regras_humano -> 'casos' from public.agentes where org_id = v_org limit 1) = '["Cliente pede desconto acima de 5%", "Reclamação de entrega"]'::jsonb
    and (select titulo = 'Frete e prazos' and conteudo = 'texto novo' from public.base_conhecimento where id = current_setting('teste.base_velho')::uuid)
    and (select not ativo from public.base_conhecimento where id = current_setting('teste.base_dup')::uuid)
    and exists (select 1 from public.base_conhecimento where org_id = v_org and titulo = 'Formas de pagamento');

  perform public.assistente_desfazer(current_setting('teste.sessao')::uuid);
  insert into resultado (teste, ok) select 'assistente: desfazer volta tudo e apaga o que foi criado',
    (select bool_and(prompt = current_setting('teste.prompt_antes')) from public.agentes where org_id = v_org)
    and (select titulo = 'Horários e frete' and conteudo = 'texto antigo' from public.base_conhecimento where id = current_setting('teste.base_velho')::uuid)
    and (select ativo from public.base_conhecimento where id = current_setting('teste.base_dup')::uuid)
    and not exists (select 1 from public.base_conhecimento where org_id = v_org and titulo = 'Formas de pagamento')
    and (select status from public.assistente_sessoes where id = current_setting('teste.sessao')::uuid) = 'desfeita';
end $$;
do $$
begin
  perform public.assistente_desfazer(current_setting('teste.sessao')::uuid);
  insert into resultado (teste, ok) values ('assistente: não desfaz duas vezes', false);
exception when others then
  insert into resultado (teste, ok) values ('assistente: não desfaz duas vezes', true);
end $$;
do $$
begin
  insert into public.assistente_sessoes (org_id, modo) values (current_setting('teste.f7')::uuid, 'montar');
  insert into resultado (teste, ok) values ('assistente: só a função grava sessões', false);
exception when others then
  insert into resultado (teste, ok) values ('assistente: só a função grava sessões', true);
end $$;

reset role;
do $$
declare c jsonb;
begin
  c := public.agente_contexto_simulado(current_setting('teste.f7')::uuid, '[{"de":"cliente","texto":"oi"}]', null, null, '## Base proposta\n\nPix e boleto');
  insert into resultado (teste, ok) values ('simulador: testa a base proposta pelo assistente',
    c ->> 'base_conhecimento' = '## Base proposta\n\nPix e boleto');
end $$;

-- Lembrete de compromisso para a equipe: celular e WhatsApp do responsável, uma vez, de novo se remarcar.
reset role;
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_a1 uuid := '00000000-0000-0000-0000-0000000000a1';
  v_a uuid; n integer; v_push integer; v_alertas integer;
begin
  update public.perfis set telefone = '5541999990001' where user_id = v_a1;
  insert into public.push_inscricoes (user_id, endpoint, p256dh, auth) values (v_a1, 'https://push.teste/a1', 'x', 'y');
  v_push := (select count(*) from public.push_fila where user_id = v_a1);
  v_alertas := (select count(*) from public.alertas where org_id = v_org);

  insert into public.compromissos (org_id, titulo, inicio, fim, responsavel_id, local)
  values (v_org, 'Visita na Wyllis', now() + interval '20 minutes', now() + interval '80 minutes', v_a1, 'Rua X, 10')
  returning id into v_a;
  insert into public.compromissos (org_id, titulo, inicio, fim, responsavel_id)
  values (v_org, 'Daqui a 2 horas', now() + interval '2 hours', now() + interval '3 hours', v_a1);
  insert into public.compromissos (org_id, titulo, inicio, fim, responsavel_id, status)
  values (v_org, 'Cancelado', now() + interval '10 minutes', now() + interval '1 hour', v_a1, 'cancelado');
  insert into public.compromissos (org_id, titulo, inicio, fim, responsavel_id, lembrete_minutos)
  values (v_org, 'Sem lembrete', now() + interval '10 minutes', now() + interval '1 hour', v_a1, null);
  insert into public.compromissos (org_id, titulo, inicio, fim, responsavel_id)
  values (v_org, 'Já passou', now() - interval '1 hour', now() - interval '30 minutes', v_a1);

  n := public.agenda_lembretes();
  insert into resultado (teste, ok) select 'lembrete: avisa só o compromisso na hora (não o futuro, cancelado, sem lembrete ou passado)',
    n = 1 and (select lembrete_enviado_em is not null from public.compromissos where id = v_a);
  insert into resultado (teste, ok) select 'lembrete: notificação no celular do responsável, abrindo a Agenda',
    (select count(*) from public.push_fila where user_id = v_a1) = v_push + 1
    and exists (select 1 from public.push_fila where user_id = v_a1 and url = '/agenda' and corpo like 'Visita na Wyllis%Rua X, 10');
  insert into resultado (teste, ok) select 'lembrete: WhatsApp do responsável por um número da empresa',
    (select count(*) from public.alertas where org_id = v_org) = v_alertas + 1
    and exists (select 1 from public.alertas where org_id = v_org and telefone = '5541999990001'
                 and texto like '%Lembrete de compromisso%Visita na Wyllis%Hoje às%Local: Rua X, 10%');

  n := public.agenda_lembretes();
  insert into resultado (teste, ok) values ('lembrete: não repete', n = 0);

  update public.compromissos set inicio = inicio + interval '5 minutes', fim = fim + interval '5 minutes' where id = v_a;
  n := public.agenda_lembretes();
  insert into resultado (teste, ok) values ('lembrete: remarcar faz avisar de novo', n = 1);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'lembrete: a equipe vê quem recebe por onde (sem telefone)',
  exists (select 1 from public.agenda_avisos_equipe(current_setting('teste.f7')::uuid)
           where user_id = '00000000-0000-0000-0000-0000000000a1' and celular and whatsapp);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'lembrete: outra empresa não vê a equipe', count(*) = 0 from public.agenda_avisos_equipe(current_setting('teste.f7')::uuid);
do $$
begin
  perform public.agenda_lembretes();
  insert into resultado (teste, ok) values ('lembrete: usuário logado não dispara a rodada', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('lembrete: usuário logado não dispara a rodada', true);
end $$;

-- Excluir produto: sem histórico de estoque sai de vez, e o item de pedido que o usava continua com o nome.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_prod uuid; v_ped uuid; v_item uuid; n integer;
begin
  insert into public.produtos (org_id, codigo, nome, preco, controla_estoque) values (v_org, 'EXC-1', 'Produto para excluir', 10, false)
  returning id into v_prod;
  insert into public.pedidos (org_id) values (v_org) returning id into v_ped;
  insert into public.pedido_itens (org_id, pedido_id, produto_id, descricao, quantidade, preco_unitario)
  values (v_org, v_ped, v_prod, 'Produto para excluir', 2, 10) returning id into v_item;
  with d as (delete from public.produtos where id = v_prod returning 1) select count(*) into n from d;
  insert into resultado (teste, ok) select 'produto: sem histórico de estoque, o dono exclui',
    n = 1 and not exists (select 1 from public.produtos where id = v_prod);
  insert into resultado (teste, ok) select 'produto: item de pedido antigo continua com o nome e o preço',
    produto_id is null and descricao = 'Produto para excluir' and preco_unitario = 10
    from public.pedido_itens where id = v_item;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare n integer;
begin
  with d as (delete from public.produtos where org_id = current_setting('teste.f7')::uuid and codigo = '14/19' returning 1)
  select count(*) into n from d;
  insert into resultado (teste, ok) values ('produto: atendente não exclui', n = 0);
end $$;

-- Estoque pela planilha: o número é o saldo final (ajuste até ele), sem duplicar ao subir de novo.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_a uuid; v_b uuid; r jsonb;
  saldo_a numeric; saldo_b numeric;
begin
  insert into public.produtos (org_id, codigo, nome, preco, controla_estoque) values (v_org, 'EST-A', 'Estoque A', 10, false)
  returning id into v_a;
  insert into public.produtos (org_id, codigo, nome, preco) values (v_org, 'EST-B', 'Estoque B', 10) returning id into v_b;
  perform public.estoque_lancar(v_b, 5, 'entrada', null);

  r := public.estoque_definir_saldos(v_org, '[{"codigo":"est-a","saldo":12},{"codigo":"EST-B","saldo":3},{"codigo":"NAO-EXISTE","saldo":1}]');
  saldo_a := (select sum(quantidade) from public.estoque_movimentos where produto_id = v_a);
  saldo_b := (select sum(quantidade) from public.estoque_movimentos where produto_id = v_b);
  insert into resultado (teste, ok) values ('estoque planilha: saldo fica igual ao da planilha (sobe e desce)',
    saldo_a = 12 and saldo_b = 3 and (r ->> 'alterados')::int = 2 and jsonb_array_length(r -> 'nao_encontrados') = 1);
  insert into resultado (teste, ok) select 'estoque planilha: ajuste com motivo e quem subiu; passa a controlar estoque',
    exists (select 1 from public.estoque_movimentos where produto_id = v_a and tipo = 'ajuste'
             and motivo = 'Estoque pela planilha' and autor_id = auth.uid())
    and (select controla_estoque from public.produtos where id = v_a);

  r := public.estoque_definir_saldos(v_org, '[{"codigo":"EST-A","saldo":12},{"codigo":"EST-B","saldo":3}]');
  insert into resultado (teste, ok) select 'estoque planilha: subir de novo não duplica',
    (r ->> 'alterados')::int = 0 and (r ->> 'iguais')::int = 2
    and (select sum(quantidade) from public.estoque_movimentos where produto_id = v_a) = 12;

  r := public.estoque_definir_saldos(v_org, '[{"codigo":null,"nome":"estoque b","saldo":7},{"codigo":"EST-A","saldo":-1}]');
  insert into resultado (teste, ok) select 'estoque planilha: sem código acha pelo nome; negativo é recusado',
    (select sum(quantidade) from public.estoque_movimentos where produto_id = v_b) = 7
    and r -> 'nao_encontrados' -> 0 ->> 'motivo' = 'quantidade inválida';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
begin
  perform public.estoque_definir_saldos(current_setting('teste.f7')::uuid, '[{"codigo":"EST-A","saldo":99}]');
  insert into resultado (teste, ok) values ('estoque planilha: atendente não altera estoque', false);
exception when others then
  insert into resultado (teste, ok) values ('estoque planilha: atendente não altera estoque', true);
end $$;

-- Entrada por nota: cria produto novo sem preço, soma no estoque com o fator, guarda vínculo e custo, não repete a nota.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_existente uuid; v_novo uuid; r jsonb; r2 jsonb;
  nota jsonb := '{"chave":"41201012345678000190550010000012341000012345","numero":"1234","serie":"1","emissao":"2026-10-20",
                  "emitente_cnpj":"12.345.678/0001-90","emitente_nome":"Pacar Ind.","valor_total":"1500.00","origem":"xml"}';
begin
  insert into public.produtos (org_id, codigo, nome, preco, controla_estoque) values (v_org, 'NF-EX', 'Grampo da nota', 30, false)
  returning id into v_existente;

  r := public.nota_entrada_lancar(v_org, nota, jsonb_build_array(
    jsonb_build_object('produto_id', v_existente, 'codigo_fornecedor', 'PC-10', 'descricao', 'GRAMPO 14/19 CX', 'unidade', 'CX',
                       'quantidade', 3, 'fator', 10, 'valor_unitario', 120, 'valor_total', 360),
    jsonb_build_object('novo', jsonb_build_object('nome', 'Pregador PI-70', 'codigo', 'NF-NOVO', 'unidade', 'UN', 'ncm', '84672999'),
                       'codigo_fornecedor', '2.037', 'descricao', 'PREGADOR PI-70', 'unidade', 'UN',
                       'quantidade', 2, 'valor_unitario', 570, 'valor_total', 1140)));
  v_novo := (select id from public.produtos where org_id = v_org and codigo = 'NF-NOVO');

  insert into resultado (teste, ok) values ('nota entrada: soma no estoque com o fator e cria o produto novo sem preço',
    (r ->> 'itens')::int = 2 and (r ->> 'criados')::int = 1
    and (select sum(quantidade) from public.estoque_movimentos where produto_id = v_existente) = 30
    and (select sum(quantidade) from public.estoque_movimentos where produto_id = v_novo) = 2
    and (select preco from public.produtos where id = v_novo) = 0
    and (select unidade from public.produtos where id = v_novo) = 'un'
    and (select controla_estoque from public.produtos where id = v_existente));
  insert into resultado (teste, ok) select 'nota entrada: movimento aponta a nota, com motivo NF e quem lançou',
    exists (select 1 from public.estoque_movimentos where produto_id = v_existente and tipo = 'entrada'
             and motivo = 'NF 1234 · Pacar Ind.' and nota_entrada_id = (r ->> 'nota_id')::uuid and autor_id = auth.uid());
  insert into resultado (teste, ok) select 'nota entrada: guarda vínculo do fornecedor (CNPJ só dígitos) e custo por unidade',
    (select fator from public.produtos_fornecedores where org_id = v_org and fornecedor_cnpj = '12345678000190'
      and lower(codigo_fornecedor) = 'pc-10' and produto_id = v_existente) = 10
    and (select custo from public.produtos_custos where produto_id = v_existente) = 12
    and (select custo from public.produtos_custos where produto_id = v_novo) = 570;

  begin
    perform public.nota_entrada_lancar(v_org, nota, jsonb_build_array(
      jsonb_build_object('produto_id', v_existente, 'descricao', 'x', 'quantidade', 1)));
    insert into resultado (teste, ok) values ('nota entrada: a mesma nota não entra duas vezes', false);
  exception when others then
    insert into resultado (teste, ok) values ('nota entrada: a mesma nota não entra duas vezes', sqlerrm like 'esta nota já foi lançada em%');
  end;

  -- Sem chave (foto): repete pelo fornecedor + número + série.
  r2 := public.nota_entrada_lancar(v_org, '{"numero":"77","serie":"1","emitente_cnpj":"12345678000190","origem":"imagem"}',
    jsonb_build_array(jsonb_build_object('produto_id', v_existente, 'codigo_fornecedor', 'pc-10', 'descricao', 'x', 'quantidade', 1, 'fator', 10)));
  begin
    perform public.nota_entrada_lancar(v_org, '{"numero":"77","serie":"1","emitente_cnpj":"12345678000190","origem":"imagem"}',
      jsonb_build_array(jsonb_build_object('produto_id', v_existente, 'descricao', 'x', 'quantidade', 1)));
    insert into resultado (teste, ok) values ('nota entrada: sem chave, repete pelo fornecedor e número', false);
  exception when others then
    insert into resultado (teste, ok) values ('nota entrada: sem chave, repete pelo fornecedor e número',
      sqlerrm like 'esta nota já foi lançada em%' and (select sum(quantidade) from public.estoque_movimentos where produto_id = v_existente) = 40);
  end;

  begin
    perform public.nota_entrada_lancar(v_org, '{"numero":"78","origem":"xml"}',
      jsonb_build_array(jsonb_build_object('produto_id', v_existente, 'descricao', 'x', 'quantidade', 0)));
    insert into resultado (teste, ok) values ('nota entrada: quantidade zero é recusada e nada fica gravado', false);
  exception when others then
    insert into resultado (teste, ok) values ('nota entrada: quantidade zero é recusada e nada fica gravado',
      not exists (select 1 from public.notas_entrada where org_id = v_org and numero = '78'));
  end;

  insert into resultado (teste, ok) select 'nota entrada: dono vê nota, itens, vínculos e custo',
    (select count(*) from public.notas_entrada where org_id = v_org) = 2
    and (select count(*) from public.notas_entrada_itens where org_id = v_org) = 3
    and (select count(*) from public.produtos_custos where org_id = v_org) = 2;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
begin
  insert into resultado (teste, ok) select 'nota entrada: atendente não vê custo, vínculos nem notas',
    not exists (select 1 from public.produtos_custos where org_id = v_org)
    and not exists (select 1 from public.produtos_fornecedores where org_id = v_org)
    and not exists (select 1 from public.notas_entrada where org_id = v_org);
  begin
    perform public.nota_entrada_lancar(v_org, '{"numero":"99","origem":"xml"}',
      jsonb_build_array(jsonb_build_object('produto_id', (select id from public.produtos where org_id = v_org and codigo = 'NF-EX'), 'descricao', 'x', 'quantidade', 1)));
    insert into resultado (teste, ok) values ('nota entrada: atendente não lança nota', false);
  exception when others then
    insert into resultado (teste, ok) values ('nota entrada: atendente não lança nota', true);
  end;
end $$;

-- Painel: indicadores num dia fixo do passado (05/01/2026), longe do que os outros testes gravam agora.
reset role;
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_canal uuid := (select canal_id from public.conversas where id = current_setting('teste.conversa')::uuid);
  v_a1 uuid := '00000000-0000-0000-0000-0000000000a1';
  v_ct uuid; v_conv uuid; t0 timestamptz := '2026-01-05 13:00:00-03';
begin
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541933330000', 'Cliente do painel') returning id into v_ct;
  insert into public.conversas (org_id, canal_id, contato_id, estado, criado_em) values (v_org, v_canal, v_ct, 'humano', t0)
  returning id into v_conv;
  perform set_config('teste.painel_conv', v_conv::text, false);
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, autor_id, tipo, texto, status_entrega, automatica, criado_em) values
    (v_org, v_conv, 'entrada', 'contato', null, 'texto', 'oi, tem grampo?', 'recebida', false, t0),                          -- pedido 1
    (v_org, v_conv, 'saida', 'bot', null, 'texto', 'Temos sim!', 'enviada', false, t0 + interval '30 seconds'),              -- agente: 30 s
    (v_org, v_conv, 'entrada', 'contato', null, 'texto', 'quero 10 caixas', 'recebida', false, t0 + interval '60 seconds'),  -- pedido 2
    (v_org, v_conv, 'entrada', 'contato', null, 'texto', 'pode ser hoje?', 'recebida', false, t0 + interval '61 seconds'),   -- mesmo turno
    (v_org, v_conv, 'saida', 'atendente', v_a1, 'texto', 'Pode sim', 'enviada', false, t0 + interval '600 seconds'),         -- equipe: 540 s
    (v_org, v_conv, 'saida', 'atendente', null, 'texto', 'Mensagem automática', 'enviada', true, t0 + interval '700 seconds'),
    (v_org, v_conv, 'entrada', 'contato', null, 'texto', 'e o frete?', 'recebida', false, t0 + interval '2 hours');          -- pedido 3, sem resposta
  insert into public.oportunidades (org_id, contato_id, etapa_id, titulo, criado_em)
  values (v_org, v_ct, (select id from public.etapas_funil where org_id = v_org and tipo = 'aberta' order by ordem limit 1),
          'Grampos do painel', t0 + interval '5 minutes');
  insert into public.auditoria (org_id, acao, entidade, entidade_id, ator_tipo, antes, depois, criado_em)
  values (v_org, 'conversa_estado', 'conversas', v_conv::text, 'bot', '{"estado":"bot"}',
          '{"estado":"aguardando_humano","motivo":"Cliente quer frete para hoje"}', t0 + interval '2 minutes');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  r jsonb := public.painel_resumo(current_setting('teste.f7')::uuid, '2026-01-05 00:00:00-03', '2026-01-06 00:00:00-03');
  a jsonb := r -> 'atual';
  v jsonb;
begin
  insert into resultado (teste, ok) values ('painel: pedidos são turnos do cliente (mensagens seguidas contam uma vez)',
    (a -> 'resposta' ->> 'pedidos')::int = 3 and (a -> 'resposta' ->> 'sem_resposta')::int = 1);
  insert into resultado (teste, ok) values ('painel: tempo até a primeira resposta do agente e da equipe (sem automática)',
    (a -> 'resposta' -> 'agente' ->> 'n')::int = 1 and (a -> 'resposta' -> 'agente' ->> 'mediana_seg')::numeric = 30
    and (a -> 'resposta' -> 'equipe' ->> 'n')::int = 1 and (a -> 'resposta' -> 'equipe' ->> 'mediana_seg')::numeric = 540
    and (a -> 'resposta' -> 'geral' ->> 'pct_5min')::int = 33);
  insert into resultado (teste, ok) values ('painel: leads novos, com oportunidade e respondidos',
    (a -> 'leads' ->> 'novos')::int = 1 and (a -> 'leads' ->> 'com_oportunidade')::int = 1 and (a -> 'leads' ->> 'respondidos')::int = 1);
  insert into resultado (teste, ok) values ('painel: funil e agente (conversas, respostas, passadas para a equipe, motivo)',
    (a -> 'funil' ->> 'criadas')::int = 1 and (a -> 'agente' ->> 'conversas')::int = 1 and (a -> 'agente' ->> 'respostas')::int = 1
    and (a -> 'agente' ->> 'passadas')::int = 1 and a -> 'agente' -> 'motivos' ->> 0 = 'Cliente quer frete para hoje');
  select x into v from jsonb_array_elements(a -> 'vendedores') x where x ->> 'user_id' = '00000000-0000-0000-0000-0000000000a1';
  insert into resultado (teste, ok) values ('painel: por vendedor (respostas e tempo de quem respondeu)',
    (v ->> 'respostas')::int = 1 and (v ->> 'mediana_seg')::numeric = 540 and (v ->> 'conversas')::int = 1);
  insert into resultado (teste, ok) values ('painel: período anterior vem junto para comparar',
    (r -> 'anterior' -> 'resposta' ->> 'pedidos')::int = 0 and (r ->> 'gerencia')::boolean);
  insert into resultado (teste, ok) select 'painel: pendências mostram o cliente sem resposta',
    exists (select 1 from jsonb_array_elements(public.painel_pendencias(current_setting('teste.f7')::uuid) -> 'sem_resposta') x
             where x ->> 'conversa_id' = current_setting('teste.painel_conv'));
  insert into resultado (teste, ok) select 'painel: relatório do piloto para o dono',
    (public.painel_relatorio(current_setting('teste.f7')::uuid)) ? 'primeira_semana';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare r jsonb := public.painel_resumo(current_setting('teste.f7')::uuid, '2026-01-05 00:00:00-03', '2026-01-06 00:00:00-03',
                                        null, '00000000-0000-0000-0000-0000000000a1');
begin
  insert into resultado (teste, ok) values ('painel: atendente vê só a carteira dele (não escolhe outro vendedor)',
    r ->> 'vendedor' = '00000000-0000-0000-0000-0000000000b1' and (r -> 'atual' -> 'resposta' ->> 'pedidos')::int = 0
    and r -> 'atual' -> 'vendedores' = 'null'::jsonb and not (r ->> 'gerencia')::boolean);
end $$;
do $$
begin
  perform public.painel_relatorio(current_setting('teste.f7')::uuid);
  insert into resultado (teste, ok) values ('painel: atendente não gera o relatório do piloto', false);
exception when others then
  insert into resultado (teste, ok) values ('painel: atendente não gera o relatório do piloto', true);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  perform public.painel_resumo(current_setting('teste.f7')::uuid, now() - interval '7 days', now());
  insert into resultado (teste, ok) values ('painel: outra empresa não vê', false);
exception when others then
  insert into resultado (teste, ok) values ('painel: outra empresa não vê', true);
end $$;

-- Modo suporte: a plataforma cria pedido numa empresa da qual não é membro (nasce sem responsável).
reset role;
insert into public.organizacoes (nome, slug) values ('Cliente Suporte', 'teste-suporte');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-suporte');
  p public.pedidos;
begin
  perform public.plataforma_definir_modulo(v_org, 'erp', true);
  insert into public.pedidos (org_id) values (v_org) returning * into p;
  insert into resultado (teste, ok) values ('suporte: plataforma cria pedido sem ser da equipe (sem responsável)',
    p.responsavel_id is null and p.criado_por = auth.uid());
exception when others then
  insert into resultado (teste, ok) values ('suporte: plataforma cria pedido sem ser da equipe (sem responsável)', false);
end $$;

-- Identificar o produto pela foto (migration 20261022120000): fila de indexação, candidatos e isolamento.
-- Vetores de teste: e1 aponta para um lado, e2 para outro; a "foto do cliente" fica perto de e1.
reset role;
select set_config('teste.e1', '[1,0.01,' || repeat('0.01,', 1533) || '0.01]', false);
select set_config('teste.e2', '[0.01,1,' || repeat('0.01,', 1533) || '0.01]', false);
select set_config('teste.perto_e1', '[0.9,0.1,' || repeat('0.01,', 1533) || '0.01]', false);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_azul uuid; v_preto uuid; v_inativo uuid;
  v_f1 uuid; v_f2 uuid; v_f3 uuid; v_pdf uuid;
  c jsonb;
begin
  insert into public.produtos (org_id, codigo, nome) values (v_org, 'GR-123', 'Grampeador azul') returning id into v_azul;
  insert into public.produtos (org_id, codigo, nome) values (v_org, 'GR-456', 'Grampeador preto') returning id into v_preto;
  insert into public.produtos (org_id, codigo, nome, ativo) values (v_org, 'GR-789', 'Grampeador antigo', false) returning id into v_inativo;
  insert into public.documentos (org_id, titulo, tipo, path, nome_arquivo, mime, tamanho)
  values (v_org, 'Foto — Grampeador azul', 'Foto do produto', v_org || '/f1/gr-123.jpg', 'GR-123.jpg', 'image/jpeg', 1000) returning id into v_f1;
  insert into public.documentos (org_id, titulo, tipo, path, nome_arquivo, mime, tamanho)
  values (v_org, 'Foto — Grampeador preto', 'Foto do produto', v_org || '/f2/gr-456.jpg', 'GR-456.jpg', 'image/jpeg', 1000) returning id into v_f2;
  insert into public.documentos (org_id, titulo, tipo, path, nome_arquivo, mime, tamanho)
  values (v_org, 'Foto — Grampeador antigo', 'Foto do produto', v_org || '/f3/gr-789.jpg', 'GR-789.jpg', 'image/jpeg', 1000) returning id into v_f3;
  insert into public.documentos (org_id, titulo, tipo, path, nome_arquivo, mime, tamanho)
  values (v_org, 'Manual do grampeador', 'Manual', v_org || '/m1/manual.pdf', 'manual.pdf', 'application/pdf', 1000) returning id into v_pdf;
  insert into public.documentos_produtos (documento_id, produto_id, org_id) values
    (v_f1, v_azul, v_org), (v_f2, v_preto, v_org), (v_f3, v_inativo, v_org), (v_pdf, v_azul, v_org);
  perform set_config('teste.foto1', v_f1::text, false);

  insert into resultado (teste, ok) select 'fotos: imagem entra na fila sozinha, PDF não',
    (select count(*) from public.fotos_indice where documento_id in (v_f1, v_f2, v_f3) and status = 'pendente') = 3
    and not exists (select 1 from public.fotos_indice where documento_id = v_pdf);

  -- Reivindica até esvaziar (o banco pode ter outras fotos pendentes do backfill).
  loop
    exit when not exists (select 1 from public.fotos_reivindicar(50));
  end loop;
  insert into resultado (teste, ok) select 'fotos: a fila entrega cada foto uma vez, como processando',
    (select count(*) from public.fotos_indice where documento_id in (v_f1, v_f2, v_f3) and status = 'processando' and tentativas = 1) = 3
    and not exists (select 1 from public.fotos_reivindicar(50));

  perform public.fotos_registrar(v_f1, v_org || '/f1/gr-123.jpg', 'grampeador azul de mesa', current_setting('teste.e1'), null);
  perform public.fotos_registrar(v_f2, v_org || '/f2/gr-456.jpg', 'grampeador preto de mesa', current_setting('teste.e2'), null);
  perform public.fotos_registrar(v_f3, v_org || '/f3/gr-789.jpg', 'grampeador antigo', current_setting('teste.e1'), null);
  perform public.fotos_registrar(v_f2, v_org || '/f2/OUTRO.jpg', null, null, 'não deve gravar');
  insert into resultado (teste, ok) select 'fotos: resultado grava; resultado de arquivo trocado é ignorado',
    (select count(*) from public.fotos_indice where documento_id in (v_f1, v_f2, v_f3) and status = 'pronto' and embedding is not null) = 3;

  c := public.fotos_candidatas(v_org, current_setting('teste.perto_e1'), 'grampeador azul de mesa', 5);
  insert into resultado (teste, ok) select 'fotos: o mais parecido vem primeiro; produto inativo e PDF não entram',
    (c -> 0 ->> 'produto_id')::uuid = v_azul and (c -> 0 ->> 'documento_id')::uuid = v_f1
    and not exists (select 1 from jsonb_array_elements(c) e where (e ->> 'produto_id')::uuid = v_inativo or (e ->> 'documento_id')::uuid = v_pdf);

  c := public.fotos_candidatas(v_org, current_setting('teste.perto_e1'), 'Etiqueta: GR-456, grampeador', 1);
  insert into resultado (teste, ok) select 'fotos: código legível na foto entra mesmo longe na semelhança',
    exists (select 1 from jsonb_array_elements(c) e where (e ->> 'produto_id')::uuid = v_preto and (e ->> 'codigo_na_foto')::boolean)
    and (c -> 0 ->> 'produto_id')::uuid = v_preto;

  insert into resultado (teste, ok) select 'fotos: outra empresa não recebe candidatos daqui',
    public.fotos_candidatas(current_setting('teste.cli')::uuid, current_setting('teste.perto_e1'), 'GR-123', 5) = '[]'::jsonb;

  update public.documentos set path = v_org || '/f1/gr-123-nova.jpg' where id = v_f1;
  insert into resultado (teste, ok) select 'fotos: trocar o arquivo volta a foto para a fila',
    exists (select 1 from public.fotos_indice where documento_id = v_f1 and status = 'pendente' and embedding is null
             and path = v_org || '/f1/gr-123-nova.jpg' and tentativas = 0);
  update public.documentos set titulo = 'Foto — Grampeador preto (frente)' where id = v_f2;
  insert into resultado (teste, ok) select 'fotos: editar o título não reindexa',
    exists (select 1 from public.fotos_indice where documento_id = v_f2 and status = 'pronto');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'fotos: a equipe vê o andamento', count(*) = 3 from public.fotos_indice
 where org_id = current_setting('teste.f7')::uuid and documento_id in (select id from public.documentos where tipo = 'Foto do produto');
do $$
begin
  update public.fotos_indice set status = 'pronto' where documento_id = current_setting('teste.foto1')::uuid;
  insert into resultado (teste, ok) values ('fotos: usuário logado não mexe no índice', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('fotos: usuário logado não mexe no índice', true);
end $$;
do $$
begin
  perform public.fotos_candidatas(current_setting('teste.f7')::uuid, current_setting('teste.e1'), 'x', 5);
  insert into resultado (teste, ok) values ('fotos: usuário logado não chama a busca de candidatos', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('fotos: usuário logado não chama a busca de candidatos', true);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok)
select 'fotos: outra empresa não vê o índice', count(*) = 0 from public.fotos_indice where org_id = current_setting('teste.f7')::uuid;

-- ============================================================================
-- Ordens de serviço (módulo 'os'; a1 é dono da F7 de teste e admin da plataforma, b1 atendente, c1 de outra empresa)
-- ============================================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
begin
  begin
    perform public.os_preparar(v_org);
    insert into resultado (teste, ok) values ('os: desligado não prepara nada', false);
  exception when others then
    insert into resultado (teste, ok) values ('os: desligado não prepara nada', sqlerrm like 'ordens de serviço não está ligado%');
  end;
  perform public.plataforma_definir_modulo(v_org, 'os', true);
  perform public.os_preparar(v_org);
  perform public.os_preparar(v_org);
  insert into resultado (teste, ok) select 'os: ligar e preparar cria 6 etapas e a configuração (uma vez só)',
    (select count(*) from public.os_etapas where org_id = v_org) = 6
    and (select prazo_pagamento_dias from public.os_config where org_id = v_org) = 30
    and (select marco from public.os_etapas where org_id = v_org and ordem = 5) = 'finalizado';
end $$;

do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
  v_os uuid; v_a uuid; v_b uuid; v_g uuid;
  v_e1 uuid := (select id from public.os_etapas where org_id = (select id from public.organizacoes where slug = 'teste-f7') and ordem = 1);
  v_e2 uuid := (select id from public.os_etapas where org_id = (select id from public.organizacoes where slug = 'teste-f7') and ordem = 2);
begin
  insert into public.ordens_servico (org_id, cliente_nome, nf_cliente, recebida_em)
  values (v_org, '  Indústria Teste  ', '182979', current_date - 10) returning id into v_os;
  insert into public.os_itens (org_id, os_id, modelo, identificacao, valor) values
    (v_org, v_os, 'SPINDLE SJ ZT', 'L14XE004', 150) returning id into v_a;
  insert into public.os_itens (org_id, os_id, modelo, identificacao, valor) values
    (v_org, v_os, 'HA33NC-TS', '1X023', 150) returning id into v_b;
  insert into public.os_itens (org_id, os_id, modelo, valor, cobranca) values
    (v_org, v_os, 'Garantia', 0, 'garantia') returning id into v_g;
  insert into resultado (teste, ok) select 'os: OS nova ganha número e o nome do cliente sem espaços',
    (select numero = 1 and cliente_nome = 'Indústria Teste' from public.ordens_servico where id = v_os);
  insert into resultado (teste, ok) select 'os: item entra na primeira etapa, desde o recebimento, com histórico',
    (select etapa_id = v_e1 and etapa_desde = current_date - 10 from public.os_itens where id = v_a)
    and (select count(*) from public.os_item_historico where item_id = v_a and etapa_de is null and data = current_date - 10) = 1;

  begin
    update public.os_itens set etapa_id = v_e2 where id = v_a;
    insert into resultado (teste, ok) values ('os: etapa só muda pela função', false);
  exception when others then
    insert into resultado (teste, ok) values ('os: etapa só muda pela função', sqlerrm like 'use as funções de ordens de serviço%');
  end;

  perform public.os_mover_itens(array[v_a, v_b], v_e2, current_date - 7);
  insert into resultado (teste, ok) select 'os: mover grava a data do fato no item e no histórico',
    (select count(*) from public.os_itens where id in (v_a, v_b) and etapa_id = v_e2 and etapa_desde = current_date - 7) = 2
    and (select count(*) from public.os_item_historico where item_id = v_a) = 2;
  begin
    perform public.os_mover_itens(array[v_a], v_e1, current_date - 8);
    insert into resultado (teste, ok) values ('os: data antes da etapa atual é recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('os: data antes da etapa atual é recusada', sqlerrm like 'a data não pode ser antes%');
  end;
  begin
    perform public.os_mover_itens(array[v_a], v_e1, current_date + 1);
    insert into resultado (teste, ok) values ('os: data no futuro é recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('os: data no futuro é recusada', sqlerrm like 'a data não pode ser no futuro%');
  end;

  perform public.os_faturar(array[v_a], current_date - 1, null);
  insert into resultado (teste, ok) select 'os: faturar calcula o vencimento pelo prazo padrão',
    (select faturado_em = current_date - 1 and vencimento_em = current_date + 29 from public.os_itens where id = v_a);
  begin
    perform public.os_faturar(array[v_g], current_date, null);
    insert into resultado (teste, ok) values ('os: garantia não é faturada', false);
  exception when others then
    insert into resultado (teste, ok) values ('os: garantia não é faturada', sqlerrm like 'item em garantia%');
  end;
  begin
    perform public.os_registrar_pagamento(array[v_b], current_date);
    insert into resultado (teste, ok) values ('os: só item faturado recebe pagamento', false);
  exception when others then
    insert into resultado (teste, ok) values ('os: só item faturado recebe pagamento', sqlerrm like 'só item faturado%');
  end;
  perform public.os_registrar_pagamento(array[v_a], current_date);
  insert into resultado (teste, ok) select 'os: pagamento registrado', (select pago_em = current_date from public.os_itens where id = v_a);
  perform public.os_faturar(array[v_a], null, null);
  insert into resultado (teste, ok) select 'os: desfazer o faturamento limpa vencimento e pagamento',
    (select faturado_em is null and vencimento_em is null and pago_em is null from public.os_itens where id = v_a);

  perform public.os_definir_desfecho(array[v_g], 'cancelado', null);
  begin
    perform public.os_mover_itens(array[v_g], v_e2, null);
    insert into resultado (teste, ok) values ('os: item encerrado não anda', false);
  exception when others then
    insert into resultado (teste, ok) values ('os: item encerrado não anda', sqlerrm like 'item encerrado%');
  end;

  perform set_config('teste.os', v_os::text, true);
  perform set_config('teste.os_a', v_a::text, true);
  perform set_config('teste.os_b', v_b::text, true);
end $$;

-- Previsão: item recebido hoje, sem histórico suficiente, usa os prazos padrão (2 + 5 + 5 + 15 até o Finalizado).
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
  v_os uuid; v_n uuid;
  p record;
begin
  insert into public.ordens_servico (org_id, cliente_nome) values (v_org, 'Cliente Previsão') returning id into v_os;
  insert into public.os_itens (org_id, os_id, valor) values (v_org, v_os, 200) returning id into v_n;
  select * into p from public.os_previsao_itens(v_org) where item_id = v_n;
  insert into resultado (teste, ok) select 'os: previsão pelos prazos padrão (termina, fatura e recebe)',
    p.finaliza_em = current_date + 27 and p.fatura_em = current_date + 27 and p.recebe_em = current_date + 57
    and p.em_orcamento and not p.parado;
  insert into resultado (teste, ok) select 'os: painel separa o caixa previsto do que ainda está em orçamento',
    (select (public.os_painel(v_org, current_date - 30, current_date) -> 'em_orcamento' ->> 'itens')::int >= 1);
end $$;

-- Etapas: remover uma com itens exige destino; a removida sai do quadro e continua no histórico.
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
  v_lista jsonb;
  v_e2 uuid := (select id from public.os_etapas where org_id = (select id from public.organizacoes where slug = 'teste-f7') and ordem = 2);
  v_e3 uuid := (select id from public.os_etapas where org_id = (select id from public.organizacoes where slug = 'teste-f7') and ordem = 3);
begin
  select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'marco', marco, 'prazo_padrao_dias', prazo_padrao_dias) order by ordem)
    into v_lista from public.os_etapas where org_id = v_org and ativo and id <> v_e2;
  begin
    perform public.os_salvar_etapas(v_org, v_lista, '{}');
    insert into resultado (teste, ok) values ('os: remover etapa com itens pede destino', false);
  exception when others then
    insert into resultado (teste, ok) values ('os: remover etapa com itens pede destino', sqlerrm like 'escolha para onde vão os itens%');
  end;
  perform public.os_salvar_etapas(v_org, v_lista, jsonb_build_object(v_e2::text, v_e3::text));
  insert into resultado (teste, ok) select 'os: itens vão para o destino e a etapa removida sai do quadro',
    (select etapa_id = v_e3 from public.os_itens where id = current_setting('teste.os_b')::uuid)
    and not (select ativo from public.os_etapas where id = v_e2)
    and (select count(*) from public.os_etapas where org_id = v_org and ativo) = 5
    and exists (select 1 from public.os_item_historico where item_id = current_setting('teste.os_b')::uuid and etapa_para = v_e2);
  begin
    perform public.os_salvar_etapas(v_org, v_lista || jsonb_build_array(jsonb_build_object('nome', 'Outra', 'marco', 'finalizado')), '{}');
    insert into resultado (teste, ok) values ('os: um marco por empresa', false);
  exception when others then
    insert into resultado (teste, ok) values ('os: um marco por empresa', sqlerrm like 'cada marco só pode%');
  end;
end $$;

-- Importação: linhas da mesma NF e recebimento viram uma OS; os passos entram em ordem de data.
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
  v_fim uuid := (select id from public.os_etapas where org_id = (select id from public.organizacoes where slug = 'teste-f7') and ativo and marco = 'finalizado');
  v_rep uuid := (select id from public.os_etapas where org_id = (select id from public.organizacoes where slug = 'teste-f7') and ativo and nome = 'Em reparo');
  r jsonb;
begin
  r := public.os_importar(v_org, jsonb_build_array(
    jsonb_build_object('cliente', 'Sadia', 'nf_cliente', '183238', 'recebida_em', '2026-03-26', 'tipo', 'Bomba', 'modelo', 'BRINKS',
                       'valor', '150', 'desfecho', 'nao_aprovado'),
    jsonb_build_object('cliente', 'Sadia', 'nf_cliente', '183238', 'recebida_em', '2026-03-26', 'tipo', 'Motor', 'modelo', 'HA33NCB',
                       'valor', '150', 'etapas', jsonb_build_array(jsonb_build_object('etapa_id', v_fim, 'data', '2026-05-25'),
                                                                   jsonb_build_object('etapa_id', v_rep, 'data', '2026-04-10')),
                       'faturado_em', '2026-07-30')));
  insert into resultado (teste, ok) select 'os: importação agrupa a OS e cria os tipos',
    (r ->> 'ordens')::int = 1 and (r ->> 'itens')::int = 2
    and (select count(*) from public.os_tipos_item where org_id = v_org and nome in ('Bomba', 'Motor')) = 2;
  insert into resultado (teste, ok) select 'os: importação grava os passos em ordem, marcados como importados',
    exists (select 1 from public.os_itens i where i.org_id = v_org and i.modelo = 'HA33NCB'
             and i.etapa_id = v_fim and i.etapa_desde = '2026-05-25' and i.vencimento_em = '2026-08-29'
             and (select count(*) from public.os_item_historico h where h.item_id = i.id and h.importado) = 3)
    and exists (select 1 from public.os_itens where org_id = v_org and modelo = 'BRINKS' and desfecho = 'nao_aprovado');
end $$;

-- Atendente: move, não fatura, não apaga, não vê o painel.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := (select id from public.organizacoes where slug = 'teste-f7');
begin
  perform public.os_mover_itens(array[current_setting('teste.os_a')::uuid],
    (select id from public.os_etapas where org_id = v_org and ativo and marco = 'finalizado'), null);
  insert into resultado (teste, ok) select 'os: atendente move item',
    (select e.marco = 'finalizado' from public.os_itens i join public.os_etapas e on e.id = i.etapa_id where i.id = current_setting('teste.os_a')::uuid);
  begin
    perform public.os_faturar(array[current_setting('teste.os_a')::uuid], current_date, null);
    insert into resultado (teste, ok) values ('os: atendente não fatura', false);
  exception when others then
    insert into resultado (teste, ok) values ('os: atendente não fatura', sqlerrm = 'item não encontrado');
  end;
  delete from public.ordens_servico where id = current_setting('teste.os')::uuid;
  insert into resultado (teste, ok) select 'os: atendente não apaga OS', exists (select 1 from public.ordens_servico where id = current_setting('teste.os')::uuid);
  begin
    perform public.os_painel(v_org, current_date - 30, current_date);
    insert into resultado (teste, ok) values ('os: atendente não vê o painel', false);
  exception when others then
    insert into resultado (teste, ok) values ('os: atendente não vê o painel', sqlerrm like 'só dono e admin%');
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  insert into resultado (teste, ok) select 'os: outra empresa não vê ordens, itens nem histórico',
    not exists (select 1 from public.ordens_servico where org_id = (select id from public.organizacoes where slug = 'teste-f7'))
    and not exists (select 1 from public.os_itens where org_id = (select id from public.organizacoes where slug = 'teste-f7'))
    and not exists (select 1 from public.os_item_historico where org_id = (select id from public.organizacoes where slug = 'teste-f7'));
  begin
    perform public.os_mover_itens(array[current_setting('teste.os_a')::uuid], gen_random_uuid(), null);
    insert into resultado (teste, ok) values ('os: outra empresa não move item daqui', false);
  exception when others then
    insert into resultado (teste, ok) values ('os: outra empresa não move item daqui', sqlerrm = 'item não encontrado');
  end;
end $$;

reset role;
do $$
begin
  update public.os_item_historico set data = current_date where item_id = current_setting('teste.os_a')::uuid;
  insert into resultado (teste, ok) values ('os: histórico das etapas é imutável até para o banco', false);
exception when others then
  insert into resultado (teste, ok) values ('os: histórico das etapas é imutável até para o banco', sqlerrm like 'o histórico das etapas%');
end $$;

-- ============ clientes (migration 20261024120000) ============
-- a1 dono; b1 atendente sem "ver todos"; d1 (Vítor) vira o balcão com "ver todos".
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_cli uuid; v_ct uuid;
begin
  insert into public.clientes (org_id, tipo, nome, razao_social, documento, cep, uf, cidade)
  values (v_org, 'pj', 'Metalúrgica Alfa', 'Alfa Indústria de Metais Ltda', '11.222.333/0001-81', '80010-000', 'pr', 'Curitiba')
  returning id into v_cli;
  perform set_config('teste.cliente', v_cli::text, false);
  insert into resultado (teste, ok) select 'clientes: dono cadastra; documento e CEP só com números, UF maiúscula, carteira de quem criou',
    documento = '11222333000181' and cep = '80010000' and uf = 'PR' and responsavel_id = auth.uid()
    from public.clientes where id = v_cli;

  -- contato da carteira do dono, ligado ao cliente, com um negócio aberto
  insert into public.contatos (org_id, telefone, nome, cliente_id) values (v_org, '5541900077001', 'Comprador Alfa', v_cli)
  returning id into v_ct;
  perform set_config('teste.contato_cliente', v_ct::text, false);
  insert into public.oportunidades (org_id, contato_id, etapa_id, titulo)
  values (v_org, v_ct, (select id from public.etapas_funil where org_id = v_org and nome = 'Novo'), 'Negócio da Alfa');

  insert into public.clientes (org_id, tipo, nome, documento) values (v_org, 'pf', 'João da Silva', '529.982.247-25');
  insert into resultado (teste, ok) values ('clientes: pessoa física com CPF válido', true);
exception when others then
  insert into resultado (teste, ok) values ('clientes: cadastro inicial: ' || sqlerrm, false);
end $$;
do $$ begin
  insert into public.clientes (org_id, tipo, nome, documento) values (current_setting('teste.f7')::uuid, 'pj', 'Errado', '11222333000182');
  insert into resultado (teste, ok) values ('clientes: CNPJ inválido é recusado', false);
exception when check_violation then
  insert into resultado (teste, ok) values ('clientes: CNPJ inválido é recusado', true);
end $$;
do $$ begin
  insert into public.clientes (org_id, tipo, nome, documento) values (current_setting('teste.f7')::uuid, 'pj', 'CPF no PJ', '52998224725');
  insert into resultado (teste, ok) values ('clientes: CPF em cliente PJ é recusado', false);
exception when check_violation then
  insert into resultado (teste, ok) values ('clientes: CPF em cliente PJ é recusado', true);
end $$;
do $$ begin
  insert into public.clientes (org_id, tipo, nome, documento) values (current_setting('teste.f7')::uuid, 'pj', 'Alfa de novo', '11222333000181');
  insert into resultado (teste, ok) values ('clientes: o mesmo CNPJ não entra duas vezes', false);
exception when unique_violation then
  insert into resultado (teste, ok) values ('clientes: o mesmo CNPJ não entra duas vezes', true);
end $$;

-- b1 sem "ver todos": o cliente é da carteira do dono e o contato também
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'clientes: atendente não vê cliente nem contato da carteira do dono',
  not exists (select 1 from public.clientes where id = current_setting('teste.cliente')::uuid)
  and not exists (select 1 from public.contatos where id = current_setting('teste.contato_cliente')::uuid);
do $$ begin
  perform public.membro_definir_ve_todos_clientes(current_setting('teste.f7')::uuid, '00000000-0000-0000-0000-0000000000b1', true);
  insert into resultado (teste, ok) values ('clientes: atendente não liga "ver todos" para si', false);
exception when others then
  insert into resultado (teste, ok) values ('clientes: atendente não liga "ver todos" para si', sqlerrm like 'só dono e admin%');
end $$;
do $$ begin
  insert into public.contatos (org_id, telefone, nome, cliente_id)
  values (current_setting('teste.f7')::uuid, '5541900077002', 'Intruso', current_setting('teste.cliente')::uuid);
  insert into resultado (teste, ok) values ('clientes: não liga contato a cliente que não vê', false);
exception when others then
  insert into resultado (teste, ok) values ('clientes: não liga contato a cliente que não vê', sqlerrm = 'cliente não encontrado');
end $$;

-- dono liga "ver todos" para o Vítor (d1)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select public.membro_definir_ve_todos_clientes(current_setting('teste.f7')::uuid, '00000000-0000-0000-0000-0000000000d1', true);
insert into resultado (teste, ok) select 'clientes: dono liga "ver todos" e fica na auditoria',
  (select ve_todos_clientes from public.membros_org where org_id = current_setting('teste.f7')::uuid
      and user_id = '00000000-0000-0000-0000-0000000000d1')
  and exists (select 1 from public.auditoria where org_id = current_setting('teste.f7')::uuid and acao = 've_todos_clientes');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'clientes: com "ver todos" vê o cliente e o contato ligado',
  exists (select 1 from public.clientes where id = current_setting('teste.cliente')::uuid)
  and exists (select 1 from public.contatos where id = current_setting('teste.contato_cliente')::uuid);
insert into resultado (teste, ok) select 'clientes: "ver todos" não abre o negócio do contato',
  not exists (select 1 from public.oportunidades where titulo = 'Negócio da Alfa')
  and not public.pode_ver_contato(current_setting('teste.contato_cliente')::uuid);
do $$
declare n integer;
begin
  update public.clientes set observacoes = 'entrega pela manhã' where id = current_setting('teste.cliente')::uuid;
  get diagnostics n = row_count;
  insert into resultado (teste, ok) values ('clientes: com "ver todos" corrige o cadastro', n = 1);
end $$;
do $$ begin
  update public.clientes set responsavel_id = '00000000-0000-0000-0000-0000000000d1' where id = current_setting('teste.cliente')::uuid;
  insert into resultado (teste, ok) values ('clientes: só dono e admin trocam o vendedor', false);
exception when others then
  insert into resultado (teste, ok) values ('clientes: só dono e admin trocam o vendedor', sqlerrm like 'só dono e admin trocam%');
end $$;
do $$
declare n integer;
begin
  delete from public.clientes where id = current_setting('teste.cliente')::uuid;
  get diagnostics n = row_count;
  insert into resultado (teste, ok) values ('clientes: só dono e admin apagam', n = 0);
end $$;
do $$
declare v_ped uuid;
begin
  insert into public.pedidos (org_id, contato_id) values (current_setting('teste.f7')::uuid, current_setting('teste.contato_cliente')::uuid)
  returning id into v_ped;
  insert into resultado (teste, ok) select 'clientes: balcão vende para o contato do cliente e o pedido leva o cliente',
    cliente_id = current_setting('teste.cliente')::uuid from public.pedidos where id = v_ped;
  perform set_config('teste.pedido_cliente', v_ped::text, false);
exception when others then
  insert into resultado (teste, ok) values ('clientes: balcão vende para o contato do cliente: ' || sqlerrm, false);
end $$;

-- b1 continua sem ver o pedido do cliente (não tem "ver todos" nem o contato)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'clientes: sem "ver todos" o pedido do cliente fica na carteira',
  not exists (select 1 from public.pedidos where id = nullif(current_setting('teste.pedido_cliente', true), '')::uuid);

-- outra empresa
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'clientes: outra empresa não vê', not exists (select 1 from public.clientes);

-- agente e OS (sem RLS): o contexto traz o cliente; a OS pega o cliente e o nome dele pelo contato
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_conv uuid; ctx jsonb; v_os public.ordens_servico;
begin
  select id into v_conv from public.conversas where id = current_setting('teste.conversa')::uuid;
  update public.contatos set cliente_id = current_setting('teste.cliente')::uuid
   where id = (select contato_id from public.conversas where id = v_conv);
  ctx := public.agente_contexto(v_conv);
  insert into resultado (teste, ok) values ('clientes: contexto do agente traz o cliente do contato',
    ctx -> 'cliente' ->> 'nome' = 'Metalúrgica Alfa' and (ctx -> 'cliente' ->> 'tem_documento')::boolean
    and ctx -> 'cliente' ->> 'uf' = 'PR');

  insert into public.ordens_servico (org_id, contato_id) values (v_org, current_setting('teste.contato_cliente')::uuid)
  returning * into v_os;
  insert into resultado (teste, ok) values ('clientes: OS pelo contato leva o cliente e o nome dele',
    v_os.cliente_id = current_setting('teste.cliente')::uuid and v_os.cliente_nome = 'Metalúrgica Alfa');

  delete from public.clientes where id = current_setting('teste.cliente')::uuid;
  insert into resultado (teste, ok) select 'clientes: apagar o cliente solta contato, pedido e OS',
    (select cliente_id from public.contatos where id = current_setting('teste.contato_cliente')::uuid) is null
    and (select cliente_id from public.ordens_servico where id = v_os.id) is null
    and exists (select 1 from public.contatos where id = current_setting('teste.contato_cliente')::uuid);
end $$;

-- Cliente no pedido e no PDF do agente (migration 20261024130000)
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_cli uuid; v_ct uuid; v_conv uuid; v_ped uuid; r jsonb;
begin
  insert into public.clientes (org_id, tipo, nome, razao_social, documento, cidade, uf)
  values (v_org, 'pj', 'Beta', 'Beta Comércio Ltda', '11444777000161', 'Joinville', 'SC') returning id into v_cli;
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900077010', 'Comprador Beta') returning id into v_ct;
  insert into public.conversas (org_id, canal_id, contato_id, estado)
  values (v_org, (select id from public.canais where instance_id = 'INST-F7'), v_ct, 'bot') returning id into v_conv;
  insert into public.pedidos (org_id, contato_id, origem) values (v_org, v_ct, 'agente') returning id into v_ped;
  insert into public.pedido_itens (org_id, pedido_id, descricao, quantidade, preco_unitario, ordem)
  values (v_org, v_ped, 'Grampo', 2, 10, 0);

  update public.contatos set cliente_id = v_cli where id = v_ct;
  insert into resultado (teste, ok) select 'clientes: ligar o contato põe o cliente no rascunho dele',
    cliente_id = v_cli from public.pedidos where id = v_ped;

  r := public.agente_dados_orcamento(v_conv);
  insert into resultado (teste, ok) values ('clientes: PDF do agente leva o cadastro do cliente',
    r -> 'fiscal' ->> 'documento' = '11444777000161' and r -> 'fiscal' ->> 'razao_social' = 'Beta Comércio Ltda'
    and r -> 'cliente' ->> 'nome' = 'Comprador Beta');

  perform set_config('livih.pedido_status', 'on', true);
  update public.pedidos set status = 'confirmado' where id = v_ped;
  perform set_config('livih.pedido_status', 'off', true);
  begin
    update public.pedidos set cliente_id = null where id = v_ped;
    insert into resultado (teste, ok) values ('clientes: pedido confirmado não troca de cliente', false);
  exception when others then
    insert into resultado (teste, ok) values ('clientes: pedido confirmado não troca de cliente', sqlerrm like 'cliente, valores e condições%');
  end;
end $$;

-- OS pelo cliente (migration 20261024140000): prazo por cliente e importação ligando ao cliente
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_gama uuid; v_beta uuid; r jsonb;
begin
  select id into v_beta from public.clientes where org_id = v_org and documento = '11444777000161';
  insert into public.clientes (org_id, tipo, nome) values (v_org, 'pj', 'Gama Usinagem') returning id into v_gama;
  insert into public.os_prazos_cliente (org_id, cliente_id, prazo_pagamento_dias) values (v_org, v_gama, 45);

  r := public.os_importar(v_org, jsonb_build_array(
    jsonb_build_object('cliente_id', v_gama, 'nf_cliente', 'G1', 'recebida_em', '2026-06-01', 'modelo', 'G-1', 'valor', '100',
                       'faturado_em', '2026-07-01'),
    jsonb_build_object('cliente', 'Nome diferente', 'documento', '11.444.777/0001-61', 'nf_cliente', 'B1', 'recebida_em', '2026-06-02',
                       'modelo', 'B-1'),
    jsonb_build_object('cliente', 'beta comércio ltda', 'nf_cliente', 'B2', 'recebida_em', '2026-06-03', 'modelo', 'B-2'),
    jsonb_build_object('cliente', 'Oficina do Zé', 'documento', '111.444.777-35', 'nf_cliente', 'Z1', 'recebida_em', '2026-06-04',
                       'modelo', 'Z-1')));

  insert into resultado (teste, ok) select 'clientes: OS faturada vence pelo prazo do cliente',
    exists (select 1 from public.os_itens where org_id = v_org and modelo = 'G-1' and vencimento_em = '2026-08-15');
  insert into resultado (teste, ok) select 'clientes: importação de OS acha o cliente pelo CNPJ e pela razão social',
    (select o.cliente_id from public.ordens_servico o where o.org_id = v_org and o.nf_cliente = 'B1') = v_beta
    and (select o.cliente_id from public.ordens_servico o where o.org_id = v_org and o.nf_cliente = 'B2') = v_beta
    and (select o.cliente_nome from public.ordens_servico o where o.org_id = v_org and o.nf_cliente = 'B1') = 'Beta';
  insert into resultado (teste, ok) select 'clientes: importação de OS cria o cliente que falta, com o CPF',
    (r ->> 'clientes_criados')::int = 1
    and exists (select 1 from public.clientes where org_id = v_org and nome = 'Oficina do Zé' and tipo = 'pf' and documento = '11144477735')
    and (select o.cliente_id is not null from public.ordens_servico o where o.org_id = v_org and o.nf_cliente = 'Z1');
end $$;

-- Importar planilha de clientes (migration 20261024150000); ainda como a1 (dono)
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  r jsonb; r2 jsonb;
begin
  r := public.clientes_importar(v_org, jsonb_build_array(
    -- já existe (Beta, pelo CNPJ): só a cidade muda, o resto fica
    jsonb_build_object('documento', '11.444.777/0001-61', 'cidade', 'Blumenau', 'razao_social', ''),
    -- novo, com celular de contato novo
    jsonb_build_object('nome', 'Delta Peças', 'documento', '04.252.011/0001-10', 'cep', '89010-000', 'uf', 'sc',
                       'celular', '(47) 99999-0001', 'contato', 'Débora'),
    -- novo, CNPJ inválido: entra sem documento
    jsonb_build_object('nome', 'Épsilon', 'documento', '11.111.111/1111-11'),
    -- sem nome nem documento: ignorada
    jsonb_build_object('cidade', 'Lugar nenhum')));
  insert into resultado (teste, ok) values ('clientes: importação cria, atualiza pelo CNPJ e avisa o que ficou de fora',
    (r ->> 'criados')::int = 2 and (r ->> 'atualizados')::int = 1 and (r ->> 'contatos_criados')::int = 1
    and jsonb_array_length(r -> 'avisos') = 2
    and (select cidade = 'Blumenau' and razao_social = 'Beta Comércio Ltda' and uf = 'SC'
           from public.clientes where org_id = v_org and documento = '11444777000161')
    and exists (select 1 from public.clientes where org_id = v_org and nome = 'Épsilon' and documento is null));
  insert into resultado (teste, ok) select 'clientes: importado é da empresa, com o contato do celular ligado',
    c.responsavel_id is null and c.cep = '89010000' and c.uf = 'SC'
    and exists (select 1 from public.contatos ct where ct.cliente_id = c.id and ct.telefone = '5547999990001'
                 and ct.nome = 'Débora' and ct.responsavel_id is null)
    from public.clientes c where c.org_id = v_org and documento = '04252011000110';

  -- mesma planilha de novo: não duplica (pelo CNPJ e, sem documento, pelo nome)
  r2 := public.clientes_importar(v_org, jsonb_build_array(
    jsonb_build_object('nome', 'Delta Peças', 'documento', '04252011000110', 'celular', '47999990001'),
    jsonb_build_object('nome', 'épsilon', 'cidade', 'Itajaí')));
  insert into resultado (teste, ok) values ('clientes: importar de novo atualiza em vez de duplicar',
    (r2 ->> 'criados')::int = 0 and (r2 ->> 'atualizados')::int = 2 and (r2 ->> 'contatos_criados')::int = 0
    and (select count(*) from public.clientes where org_id = v_org and lower(nome) in ('delta peças', 'épsilon')) = 2
    and (select cidade from public.clientes where org_id = v_org and lower(nome) = 'épsilon') = 'Itajaí');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.clientes_importar(current_setting('teste.f7')::uuid, '[{"nome":"x"}]');
  insert into resultado (teste, ok) values ('clientes: atendente não importa', false);
exception when others then
  insert into resultado (teste, ok) values ('clientes: atendente não importa', sqlerrm like 'só dono e admin%');
end $$;

reset role;
select n, teste, ok from resultado order by n;
