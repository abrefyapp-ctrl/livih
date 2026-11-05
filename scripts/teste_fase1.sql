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
  insert into resultado (teste, ok) values ('eco do que a Livih enviou é ignorado', (r ->> 'duplicada')::boolean);
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
    insert into resultado (teste, ok) values ('módulos: membro da empresa não liga módulo', sqlerrm like 'Só a equipe da plataforma%');
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

-- Prospecção: iniciar conversa pela Livih (atendente da F7, número da empresa)
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
                 and texto like '%Lembrete de compromisso%Visita na Wyllis%'
                   -- O compromisso é daqui a 20 min: depois das 23h40 (Brasília) ele cai no dia seguinte e o
                   -- lembrete diz "Amanhã às", corretamente. O teste espera o que vale para a hora em que roda.
                   || case when ((now() + interval '20 minutes') at time zone 'America/Sao_Paulo')::date
                                = (now() at time zone 'America/Sao_Paulo')::date
                           then 'Hoje às' else 'Amanhã às' end
                   || '%Local: Rua X, 10%');

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

-- Agente consulta a OS (migration 20261025120000): o cliente Beta tem as OS B1 e B2 (importação acima), sem contato
-- na OS; o "Comprador Beta" está ligado ao cliente e tem conversa.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_conv uuid; v_outra uuid; r jsonb;
begin
  select v.id into v_conv from public.conversas v join public.contatos c on c.id = v.contato_id
   where c.org_id = v_org and c.telefone = '5541900077010';
  select v.id into v_outra from public.conversas v join public.contatos c on c.id = v.contato_id
   where c.org_id = v_org and c.cliente_id is null limit 1;

  r := public.agente_consultar_os(v_conv);
  insert into resultado (teste, ok) values ('os agente: acha as OS do cliente do contato, com etapa e previsão',
    (r ->> 'encontrados')::int = 2
    and exists (select 1 from jsonb_array_elements(r -> 'itens') x
                 where x ->> 'item' like '%B-1%' and x ->> 'situacao' is not null and x ->> 'desde' is not null
                   and not (x ->> 'pronto')::boolean));
  r := public.agente_consultar_os(v_conv, 'b-2');
  insert into resultado (teste, ok) values ('os agente: filtra pelo modelo',
    (r ->> 'encontrados')::int = 1 and r -> 'itens' -> 0 ->> 'item' like '%B-2%');
  r := public.agente_consultar_os(v_conv, 'xyz-inexistente');
  insert into resultado (teste, ok) values ('os agente: sem resultado orienta a perguntar o nº da OS',
    (r ->> 'encontrados')::int = 0 and r ->> 'aviso' like 'Nada com esse termo%');
  r := public.agente_consultar_os(v_outra);
  insert into resultado (teste, ok) values ('os agente: outro cliente não vê as OS do Beta',
    not exists (select 1 from jsonb_array_elements(r -> 'itens') x where x ->> 'item' like '%B-%'));
  r := public.simulador_consultar_os(v_org, null);
  insert into resultado (teste, ok) values ('os agente: simulador mostra exemplos da empresa', (r ->> 'simulado')::boolean);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$ begin
  perform public.os_previsao_itens(current_setting('teste.f7')::uuid);
  insert into resultado (teste, ok) values ('os agente: previsão continua fechada para quem não é da oficina', false);
exception when others then
  insert into resultado (teste, ok) values ('os agente: previsão continua fechada para quem não é da oficina', true);
end $$;
do $$ begin
  perform public.agente_consultar_os((select id from public.conversas limit 1));
  insert into resultado (teste, ok) values ('os agente: usuário logado não chama a consulta do agente', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('os agente: usuário logado não chama a consulta do agente', true);
end $$;

-- NF-e, configuração (migration 20261025130000). a1 dono, b1 atendente; emissoras da F7 dos testes de orçamento.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_emi uuid := (select id from public.emissoras where org_id = current_setting('teste.f7')::uuid and cnpj = '11222333000181');
  v_outra uuid := (select id from public.emissoras where org_id = current_setting('teste.f7')::uuid and cnpj = '11444777000161');
  n integer;
begin
  update public.emissoras set regime_tributario = 1, cfop_estadual = '5102', cfop_interestadual = '6102', icms_situacao = '102',
                              pis_situacao = '49', cofins_situacao = '49', padrao_balcao = true where id = v_emi;
  get diagnostics n = row_count;
  insert into resultado (teste, ok) values ('nfe: dono grava regime e padrões fiscais do CNPJ',
    n = 1 and (select nfe_status = 'nao_configurada' and nfe_ambiente = 'homologacao' from public.emissoras where id = v_emi));
  begin
    update public.emissoras set padrao_balcao = true where id = v_outra;
    insert into resultado (teste, ok) values ('nfe: só um CNPJ do balcão por empresa', false);
  exception when unique_violation then
    insert into resultado (teste, ok) values ('nfe: só um CNPJ do balcão por empresa', true);
  end;
  begin
    update public.emissoras set nfe_status = 'pronta' where id = v_emi;
    insert into resultado (teste, ok) values ('nfe: a tela não marca o CNPJ como pronto na Focus', false);
  exception when others then
    insert into resultado (teste, ok) values ('nfe: a tela não marca o CNPJ como pronto na Focus', sqlerrm like 'a situação na Focus%');
  end;
  begin
    update public.emissoras set cfop_estadual = '6102' where id = v_emi;
    insert into resultado (teste, ok) values ('nfe: CFOP estadual começa com 5', false);
  exception when check_violation then
    insert into resultado (teste, ok) values ('nfe: CFOP estadual começa com 5', true);
  end;
  perform public.membro_definir_emite_nota_fiscal(v_org, '00000000-0000-0000-0000-0000000000b1', true);
  insert into resultado (teste, ok) select 'nfe: "Emite nota fiscal" nasce desligada e o dono liga',
    (select emite_nota_fiscal from public.membros_org where org_id = v_org and user_id = '00000000-0000-0000-0000-0000000000b1')
    and not (select emite_nota_fiscal from public.membros_org where org_id = v_org and user_id = '00000000-0000-0000-0000-0000000000d1');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'nfe: atendente com a permissão emite; sem ela, não',
  public.emite_nota_fiscal(current_setting('teste.f7')::uuid);
do $$ begin
  perform public.membro_definir_emite_nota_fiscal(current_setting('teste.f7')::uuid, '00000000-0000-0000-0000-0000000000d1', true);
  insert into resultado (teste, ok) values ('nfe: atendente não dá a permissão', false);
exception when others then
  insert into resultado (teste, ok) values ('nfe: atendente não dá a permissão', sqlerrm like 'só dono e admin%');
end $$;
do $$ begin
  perform public.nfe_token((select id from public.emissoras limit 1), 'producao');
  insert into resultado (teste, ok) values ('nfe: usuário logado não lê o token da Focus', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('nfe: usuário logado não lê o token da Focus', true);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'nfe: sem a permissão, o atendente não emite', not public.emite_nota_fiscal(current_setting('teste.f7')::uuid);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_emi uuid := (select id from public.emissoras where org_id = current_setting('teste.f7')::uuid and cnpj = '11222333000181');
begin
  perform public.nfe_salvar_tokens(v_emi, 'tok-prod-1', 'tok-hom-1');
  perform public.nfe_salvar_tokens(v_emi, 'tok-prod-2', null);
  update public.emissoras set nfe_status = 'pronta', focus_empresa_id = 123 where id = v_emi;
  insert into resultado (teste, ok) values ('nfe: tokens no Vault (atualiza sem duplicar) e a função grava a situação',
    public.nfe_token(v_emi, 'producao') = 'tok-prod-2' and public.nfe_token(v_emi, 'homologacao') = 'tok-hom-1'
    and (select count(*) from vault.secrets where name like 'focus_%_' || v_emi) = 2
    and (select nfe_status from public.emissoras where id = v_emi) = 'pronta');
end $$;

-- NF-e, emissão (migration 20261025140000). Ainda como serviço (as funções nfe-* gravam).
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_emi uuid := (select id from public.emissoras where org_id = current_setting('teste.f7')::uuid and cnpj = '11222333000181');
  v_ped uuid := (select id from public.pedidos where org_id = current_setting('teste.f7')::uuid and cliente_id is not null order by criado_em limit 1);
  v_nota uuid;
begin
  perform set_config('teste.pedido_nf', v_ped::text, false);
  insert into public.notas_fiscais (org_id, emissora_id, pedido_id, ref, ambiente, valor)
  values (v_org, v_emi, v_ped, 'lvhteste1', 'homologacao', 20) returning id into v_nota;
  perform set_config('teste.nota', v_nota::text, false);
  begin
    insert into public.notas_fiscais (org_id, emissora_id, pedido_id, ref, ambiente) values (v_org, v_emi, v_ped, 'lvhteste2', 'homologacao');
    insert into resultado (teste, ok) values ('nfe emissão: um pedido tem uma nota viva só', false);
  exception when unique_violation then
    insert into resultado (teste, ok) values ('nfe emissão: um pedido tem uma nota viva só', true);
  end;
  update public.notas_fiscais set status = 'autorizada', numero = 1, serie = 1, chave = repeat('1', 44), autorizada_em = now() where id = v_nota;
  update public.notas_fiscais set xml_path = v_org || '/' || v_emi || '/2026-10/x-nfe.xml' where id = v_nota;
  insert into resultado (teste, ok) values ('nfe emissão: autorizada recebe o XML depois (cópia atrasada)',
    (select xml_path is not null from public.notas_fiscais where id = v_nota));
  begin
    update public.notas_fiscais set valor = 999 where id = v_nota;
    insert into resultado (teste, ok) values ('nfe emissão: nota autorizada não muda', false);
  exception when others then
    insert into resultado (teste, ok) values ('nfe emissão: nota autorizada não muda', sqlerrm like 'nota fiscal autorizada não muda%');
  end;
  begin
    update public.notas_fiscais set xml_path = 'outro.xml' where id = v_nota;
    insert into resultado (teste, ok) values ('nfe emissão: o XML guardado não é trocado', false);
  exception when others then
    insert into resultado (teste, ok) values ('nfe emissão: o XML guardado não é trocado', sqlerrm like 'nota fiscal autorizada não muda%');
  end;
  begin
    delete from public.notas_fiscais where id = v_nota;
    insert into resultado (teste, ok) values ('nfe emissão: nota autorizada não é apagada', false);
  exception when others then
    insert into resultado (teste, ok) values ('nfe emissão: nota autorizada não é apagada', sqlerrm like 'nota fiscal autorizada não é apagada%');
  end;
  insert into resultado (teste, ok) values ('nfe emissão: segredo do gatilho da Focus no Vault', length(public.nfe_segredo_webhook()) = 64);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'nfe emissão: quem vê o pedido vê a nota',
  exists (select 1 from public.notas_fiscais where id = current_setting('teste.nota')::uuid);
do $$ begin
  insert into public.notas_fiscais (org_id, emissora_id, ref, ambiente)
  values (current_setting('teste.f7')::uuid, (select id from public.emissoras limit 1), 'lvhinvasor', 'homologacao');
  insert into resultado (teste, ok) values ('nfe emissão: usuário logado não grava nota', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('nfe emissão: usuário logado não grava nota', true);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'nfe emissão: outra empresa não vê a nota',
  not exists (select 1 from public.notas_fiscais where id = current_setting('teste.nota')::uuid);

-- NFS-e (migration 20261025150000)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_emi uuid := (select id from public.emissoras where org_id = current_setting('teste.f7')::uuid and cnpj = '11222333000181');
  n integer;
begin
  update public.emissoras set nfse_ativa = true, nfse_codigo_tributacao_nacional = '010101', inscricao_municipal = '123456',
                              nfse_regime_especial = 0 where id = v_emi;
  get diagnostics n = row_count;
  insert into resultado (teste, ok) values ('nfse: dono configura a nota de serviço do CNPJ', n = 1);
  begin
    update public.emissoras set nfse_habilitada_focus = true where id = v_emi;
    insert into resultado (teste, ok) values ('nfse: a tela não liga a NFS-e na Focus sozinha', false);
  exception when others then
    insert into resultado (teste, ok) values ('nfse: a tela não liga a NFS-e na Focus sozinha', sqlerrm like 'a situação na Focus%');
  end;
  begin
    update public.emissoras set nfse_codigo_tributacao_nacional = '01.01.01' where id = v_emi;
    insert into resultado (teste, ok) values ('nfse: código de tributação nacional tem 6 números', false);
  exception when check_violation then
    insert into resultado (teste, ok) values ('nfse: código de tributação nacional tem 6 números', true);
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_emi uuid := (select id from public.emissoras where org_id = current_setting('teste.f7')::uuid and cnpj = '11222333000181');
  v_os uuid := (select id from public.ordens_servico where org_id = current_setting('teste.f7')::uuid order by numero limit 1);
  v_cli uuid := (select id from public.clientes where org_id = current_setting('teste.f7')::uuid and documento = '11444777000161');
begin
  insert into public.notas_fiscais (org_id, emissora_id, os_id, cliente_id, ref, ambiente, modelo, valor, descricao)
  values (v_org, v_emi, v_os, v_cli, 'lvsteste1', 'homologacao', 'nfse', 150, 'Conserto');
  begin
    insert into public.notas_fiscais (org_id, emissora_id, os_id, ref, ambiente, modelo) values (v_org, v_emi, v_os, 'lvsteste2', 'homologacao', 'nfse');
    insert into resultado (teste, ok) values ('nfse: uma OS tem uma nota viva só', false);
  exception when unique_violation then
    insert into resultado (teste, ok) values ('nfse: uma OS tem uma nota viva só', true);
  end;
  insert into public.notas_fiscais (org_id, emissora_id, cliente_id, ref, ambiente, modelo, valor, descricao, status, chave)
  values (v_org, v_emi, v_cli, 'lvsteste3', 'homologacao', 'nfse', 80, 'Consultoria', 'processando', null);
  update public.notas_fiscais set status = 'autorizada', chave = repeat('4', 50), numero = 7 where ref = 'lvsteste3';
  insert into resultado (teste, ok) values ('nfse: aceita a chave de 50 dígitos da NFS-e Nacional',
    (select chave from public.notas_fiscais where ref = 'lvsteste3') = repeat('4', 50));
end $$;
set local role authenticated;
-- b1 tem "Emite nota fiscal" (teste da configuração); d1 não, mas é da oficina (módulo os).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'nfse: quem emite vê a nota avulsa',
  exists (select 1 from public.notas_fiscais where ref = 'lvsteste3');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'nfse: a oficina vê a nota da OS; sem a permissão, não vê a avulsa',
  exists (select 1 from public.notas_fiscais where ref = 'lvsteste1')
  and not exists (select 1 from public.notas_fiscais where ref = 'lvsteste3');

-- O agente identifica o cliente pelo CNPJ/CPF antes do orçamento (migration 20261026130000).
-- Clientes que já existem: Beta (CNPJ 11444777000161), Delta Peças (04252011000110) e João da Silva (CPF 52998224725).
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_canal uuid := (select id from public.canais where instance_id = 'INST-F7');
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; r jsonb; v_ct uuid; n_cli int;
begin
  update public.agentes set identificar_cliente = true where canal_id = v_canal;
  insert into resultado (teste, ok) values ('identificar: a opção vale para todos os agentes da empresa',
    not exists (select 1 from public.agentes where org_id = v_org and not identificar_cliente));
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900088001', 'Comprador Delta') returning id into v_ct;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_ct, 'bot') returning id into v_c1;
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900088002', 'João') returning id into v_ct;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_ct, 'bot') returning id into v_c2;
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900088003', 'Empresa nova') returning id into v_ct;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_ct, 'bot') returning id into v_c3;
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900088004', 'Outro da empresa nova') returning id into v_ct;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_ct, 'bot') returning id into v_c4;

  r := public.agente_montar_pedido(v_c1, '[{"codigo":"X","quantidade":1}]');
  insert into resultado (teste, ok) values ('identificar: sem cliente, o orçamento pede a identificação antes',
    (r ->> 'identificar_cliente')::boolean and not (r ->> 'sucesso')::boolean);
  r := public.agente_identificar_cliente(v_c1, '04.252.011/0001-11');
  insert into resultado (teste, ok) values ('identificar: CNPJ com dígito errado é recusado',
    not (r ->> 'sucesso')::boolean and r ->> 'aviso' like 'CNPJ ou CPF inválido%');

  r := public.agente_identificar_cliente(v_c1, '04.252.011/0001-10');
  insert into resultado (teste, ok) values ('identificar: CNPJ que já existe liga o contato e avisa a equipe',
    (r ->> 'sucesso')::boolean and (r ->> 'encontrado')::boolean
    and (select cl.documento from public.contatos ct join public.clientes cl on cl.id = ct.cliente_id
          where ct.id = (select contato_id from public.conversas where id = v_c1)) = '04252011000110'
    and (select count(*) from public.mensagens where conversa_id = v_c1 and autor_tipo = 'sistema'
           and texto like 'O agente ligou este contato ao cliente%') = 1);
  r := public.agente_identificar_cliente(v_c1, '04252011000110');
  insert into resultado (teste, ok) values ('identificar: de novo, já identificado', (r ->> 'ja_identificado')::boolean);
  -- Desde 20261105120000: outro CNPJ liga mais uma empresa, e a principal continua a primeira.
  r := public.agente_identificar_cliente(v_c1, '11444777000161');
  insert into resultado (teste, ok) values ('identificar: contato de outro cliente ganha mais esta empresa, sem trocar a principal',
    (r ->> 'sucesso')::boolean and r ->> 'aviso' is null
    and (select count(*) from public.contatos_clientes where contato_id = (select contato_id from public.conversas where id = v_c1)) = 2
    and (select cl.documento from public.contatos ct join public.clientes cl on cl.id = ct.cliente_id
          where ct.id = (select contato_id from public.conversas where id = v_c1)) = '04252011000110'
    and exists (select 1 from public.mensagens where conversa_id = v_c1 and texto like 'O agente ligou este contato também ao cliente%'));
  r := public.agente_montar_pedido(v_c1, '[{"codigo":"X","quantidade":1}]', null, 'Delta Peças');
  insert into resultado (teste, ok) values ('identificar: identificado, o orçamento segue', r -> 'identificar_cliente' is null);

  -- CPF: só liga se o nome conferir, e não revela o nome do cadastro.
  r := public.agente_identificar_cliente(v_c2, '529.982.247-25');
  insert into resultado (teste, ok) values ('identificar: CPF que existe pede o nome antes de ligar',
    not (r ->> 'sucesso')::boolean and r ->> 'aviso' like '%nome completo%' and r::text not like '%Silva%'
    and (select cliente_id from public.contatos where id = (select contato_id from public.conversas where id = v_c2)) is null);
  r := public.agente_identificar_cliente(v_c2, '52998224725', 'Pedro Silva');
  insert into resultado (teste, ok) values ('identificar: CPF com nome que não confere não liga',
    not (r ->> 'sucesso')::boolean and r::text not like '%João%'
    and (select cliente_id from public.contatos where id = (select contato_id from public.conversas where id = v_c2)) is null);
  r := public.agente_identificar_cliente(v_c2, '52998224725', 'joao silva');
  insert into resultado (teste, ok) values ('identificar: CPF com o nome certo (sem acento, sem "da") liga',
    (r ->> 'sucesso')::boolean
    and (select cliente_id from public.contatos where id = (select contato_id from public.conversas where id = v_c2)) is not null);

  -- Cliente novo: CNPJ que não existe.
  r := public.agente_identificar_cliente(v_c3, '11222333000181');
  insert into resultado (teste, ok) values ('identificar: CNPJ novo pede o cadastro',
    (r ->> 'sucesso')::boolean and not (r ->> 'encontrado')::boolean and r ->> 'tipo' = 'pj');
  r := public.agente_cadastrar_cliente(v_c3, '11222333000181', null);
  insert into resultado (teste, ok) values ('identificar: sem a razão social (Receita fora), pede a razão social',
    not (r ->> 'sucesso')::boolean and r ->> 'aviso' like '%razão social%');
  select count(*) into n_cli from public.clientes where org_id = v_org;
  r := public.agente_cadastrar_cliente(v_c3, '11222333000181', null,
    '{"razao_social":"EMPRESA NOVA COMERCIO LTDA","nome":"Empresa Nova","cep":"89201-000","cidade":"Joinville","uf":"sc","logradouro":"Rua A"}');
  insert into resultado (teste, ok) values ('identificar: cadastra com os dados da Receita e liga o contato',
    (r ->> 'cadastrado')::boolean
    and exists (select 1 from public.clientes c join public.contatos ct on ct.cliente_id = c.id
                 where ct.id = (select contato_id from public.conversas where id = v_c3)
                   and c.razao_social = 'EMPRESA NOVA COMERCIO LTDA' and c.nome = 'Empresa Nova' and c.uf = 'SC'
                   and c.cep = '89201000' and c.tipo = 'pj')
    and exists (select 1 from public.mensagens where conversa_id = v_c3 and texto like 'O agente cadastrou o cliente%'));
  r := public.agente_cadastrar_cliente(v_c4, '11222333000181', 'Outra razão');
  insert into resultado (teste, ok) values ('identificar: o mesmo CNPJ por outro contato liga ao cadastro, sem duplicar',
    (r ->> 'sucesso')::boolean and (r ->> 'encontrado')::boolean
    and (select count(*) from public.clientes where org_id = v_org) = n_cli + 1);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.agente_identificar_cliente(current_setting('teste.conversa')::uuid, '04252011000110');
  insert into resultado (teste, ok) values ('identificar: usuário logado não chama as funções do agente', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('identificar: usuário logado não chama as funções do agente', true);
end $$;
-- Opção desligada: o agente não liga nem cadastra, e o orçamento não pede identificação (como antes).
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_canal uuid := (select id from public.canais where instance_id = 'INST-F7');
  v_conv uuid; v_ct uuid; r jsonb;
begin
  update public.agentes set identificar_cliente = false where canal_id = v_canal;
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900088005', 'Sem a opção') returning id into v_ct;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_ct, 'bot') returning id into v_conv;
  r := public.agente_identificar_cliente(v_conv, '04252011000110');
  insert into resultado (teste, ok) values ('identificar: com a opção desligada, não liga',
    not (r ->> 'sucesso')::boolean and (select cliente_id from public.contatos where id = v_ct) is null);
  r := public.agente_montar_pedido(v_conv, '[{"codigo":"X","quantidade":1}]');
  insert into resultado (teste, ok) values ('identificar: com a opção desligada, o orçamento não pede identificação',
    r -> 'identificar_cliente' is null);
end $$;
-- Campanhas (migration 20261027120000): público, criação, envio aos poucos, descadastro e resposta.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
begin
  update public.canais set ativo = true where instance_id = 'PNID-TESTE-1';
  insert into public.contatos (org_id, telefone, nome, tags) values
    (v_org, '5541911100001', 'Ana Campanha', '{promo}'),
    (v_org, '5541911100002', 'Bruno Campanha', '{promo}'),
    (v_org, '5541911100003', null, '{promo}'),
    (v_org, '5541911100004', 'Carla Descadastrada', '{promo}');
  update public.contatos set descadastrado_em = now() where org_id = v_org and telefone = '5541911100004';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_meta uuid := (select id from public.canais where instance_id = 'PNID-TESTE-1');
  v_waha uuid := (select id from public.canais where instance_id = 'INST-F7');
  r jsonb; v_id uuid;
  v_dados jsonb;
begin
  r := public.campanha_publico(v_org, '{"tags":["promo"]}');
  insert into resultado (teste, ok) values ('campanhas: público pela etiqueta, sem os descadastrados',
    (r ->> 'total')::int = 3 and jsonb_array_length(r -> 'amostra') = 3);
  insert into resultado (teste, ok) values ('campanhas: etiquetas em uso para o filtro',
    'promo' = any (public.campanha_etiquetas(v_org)));

  v_dados := jsonb_build_object('nome', 'Promo outubro', 'canal_id', v_meta, 'filtros', '{"tags":["promo"]}'::jsonb,
    'modelo', '{"nome":"promo_outubro","idioma":"pt_BR","categoria":"MARKETING","cabecalho":"Novidade","corpo":"Oi {{1}}, temos {{2}} para você.","rodape":"Responda SAIR para não receber","variaveis":[{"fonte":"nome"},{"fonte":"fixo","valor":"grampos em promoção"}]}'::jsonb);
  begin
    perform public.campanha_criar(v_org, v_dados);
    insert into resultado (teste, ok) values ('campanhas: exige a confirmação do consentimento', false);
  exception when others then
    insert into resultado (teste, ok) values ('campanhas: exige a confirmação do consentimento', sqlerrm like 'confirme%');
  end;
  begin
    perform public.campanha_criar(v_org, v_dados || jsonb_build_object('consentimento', true, 'canal_id', v_waha));
    insert into resultado (teste, ok) values ('campanhas: número do celular (QR code) não dispara', false);
  exception when others then
    insert into resultado (teste, ok) values ('campanhas: número do celular (QR code) não dispara', sqlerrm like '%API oficial%');
  end;
  begin
    perform public.campanha_criar(v_org, v_dados || jsonb_build_object('consentimento', true,
      'modelo', (v_dados -> 'modelo') || '{"variaveis":[{"fonte":"nome"}]}'::jsonb));
    insert into resultado (teste, ok) values ('campanhas: toda variável do modelo precisa de valor', false);
  exception when others then
    insert into resultado (teste, ok) values ('campanhas: toda variável do modelo precisa de valor', sqlerrm like 'preencha%');
  end;

  v_id := public.campanha_criar(v_org, v_dados || jsonb_build_object('consentimento', true, 'limite_dia', 2));
  perform set_config('teste.campanha', v_id::text, false);
  insert into resultado (teste, ok) values ('campanhas: cria com a lista de destinatários do momento',
    (select count(*) from public.campanha_destinatarios where campanha_id = v_id) = 3
    and (select status from public.campanhas where id = v_id) = 'agendada');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.campanha_publico(current_setting('teste.f7')::uuid, '{}');
  insert into resultado (teste, ok) values ('campanhas: atendente não faz campanha', false);
exception when others then
  insert into resultado (teste, ok) values ('campanhas: atendente não faz campanha', sqlerrm like 'só dono%');
end $$;
insert into resultado (teste, ok) select 'campanhas: atendente não vê as campanhas',
  not exists (select 1 from public.campanhas where id = current_setting('teste.campanha')::uuid);

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_id uuid := current_setting('teste.campanha')::uuid;
  v_ana uuid := (select id from public.contatos where telefone = '5541911100001');
  v_conv uuid;
  m public.mensagens;
begin
  perform public.campanhas_liberar();
  insert into resultado (teste, ok) values ('campanhas: envia aos poucos, até o limite do dia do número',
    (select count(*) from public.campanha_destinatarios where campanha_id = v_id and status = 'enviado') = 2
    and (select status from public.campanhas where id = v_id) = 'enviando'
    and (select count(*) from public.fila_envio f join public.campanha_destinatarios d on d.mensagem_id = f.mensagem_id
          where d.campanha_id = v_id) = 2);
  select * into m from public.mensagens where id = (select mensagem_id from public.campanha_destinatarios
                                                     where campanha_id = v_id and contato_id = v_ana);
  insert into resultado (teste, ok) values ('campanhas: modelo com as variáveis do contato, na conversa do número',
    m.modelo -> 'parametros' = '["Ana Campanha", "grampos em promoção"]'::jsonb and m.modelo ->> 'nome' = 'promo_outubro'
    and m.texto = E'*Novidade*\n\nOi Ana Campanha, temos grampos em promoção para você.\n\n_Responda SAIR para não receber_'
    and (select canal_id from public.conversas where id = m.conversa_id) = (select id from public.canais where instance_id = 'PNID-TESTE-1'));

  -- A Ana responde "Sair.": conta como resposta e sai das campanhas.
  v_conv := m.conversa_id;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, status_entrega)
  values (m.org_id, v_conv, 'entrada', 'contato', 'texto', 'Sair.', 'recebida');
  insert into resultado (teste, ok) values ('campanhas: "SAIR" depois da campanha descadastra e conta como resposta',
    (select descadastrado_em from public.contatos where id = v_ana) is not null
    and (select respondido_em from public.campanha_destinatarios where campanha_id = v_id and contato_id = v_ana) is not null
    and exists (select 1 from public.mensagens where conversa_id = v_conv and autor_tipo = 'sistema' and texto like 'O contato pediu%'));

  -- No dia seguinte (limite zerado): sai o último e a campanha termina.
  update public.campanha_destinatarios set enviado_em = enviado_em - interval '1 day' where campanha_id = v_id and status = 'enviado';
  perform public.campanhas_liberar();
  insert into resultado (teste, ok) values ('campanhas: termina quando não sobra ninguém',
    (select status from public.campanhas where id = v_id) = 'concluida'
    and not exists (select 1 from public.campanha_destinatarios where campanha_id = v_id and status = 'pendente'));
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  r record; v_id uuid;
begin
  select * into r from public.campanhas_resumo(v_org) where campanha_id = current_setting('teste.campanha')::uuid;
  insert into resultado (teste, ok) values ('campanhas: resumo com enviadas e respostas',
    r.total = 3 and r.enviadas = 3 and r.respostas = 1 and r.pendentes = 0);
  -- Pausar e cancelar (a Ana saiu, então a nova campanha tem 2).
  v_id := public.campanha_criar(v_org, jsonb_build_object('nome', 'Outra', 'consentimento', true, 'filtros', '{"tags":["promo"]}'::jsonb,
    'canal_id', (select id from public.canais where instance_id = 'PNID-TESTE-1'),
    'modelo', '{"nome":"promo","idioma":"pt_BR","corpo":"Oi","variaveis":[]}'::jsonb, 'agendada_para', now() + interval '1 day'));
  perform public.campanha_acao(v_id, 'pausar');
  perform public.campanha_acao(v_id, 'cancelar');
  insert into resultado (teste, ok) values ('campanhas: pausa e cancela sem enviar',
    (select status from public.campanhas where id = v_id) = 'cancelada'
    and (select count(*) from public.campanha_destinatarios where campanha_id = v_id and status = 'pulado') = 2);
end $$;
-- Campanhas: texto "se faltar" (migration 20261027130000).
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_sem uuid; v_com uuid;
  v_modelo jsonb := '{"variaveis":[{"fonte":"nome","padrao":"amigo"},{"fonte":"empresa","padrao":"sua loja"}]}';
begin
  insert into public.contatos (org_id, telefone) values (v_org, '5541911100009') returning id into v_sem;
  insert into public.contatos (org_id, telefone, nome, empresa) values (v_org, '5541911100010', 'Davi', 'Davi Peças') returning id into v_com;
  insert into resultado (teste, ok) values ('campanhas: sem nome e sem empresa, entra o texto "se faltar" (não o nome da pessoa)',
    public.campanha_parametros(v_modelo, v_sem) = '{amigo,"sua loja"}'
    and public.campanha_parametros(v_modelo, v_com) = '{Davi,"Davi Peças"}'
    and public.campanha_parametros('{"variaveis":[{"fonte":"nome"}]}', v_sem) = '{cliente}');
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'campanhas: a prévia conta quem está sem nome e sem empresa',
  (r ->> 'sem_nome')::int >= 1 and (r ->> 'sem_empresa')::int >= 1
  from (select public.campanha_publico(current_setting('teste.f7')::uuid, '{}') r) x;
-- Funções fechadas para o anon e para a tela (migration 20261027140000).
reset role;
insert into resultado (teste, ok) select 'segurança: nenhuma função security definer de public executável pelo anon',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute'));
insert into resultado (teste, ok) select 'segurança: nenhuma função de gatilho de public executável pela tela',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
                and (has_function_privilege('anon', p.oid, 'execute')
                     or has_function_privilege('authenticated', p.oid, 'execute')));
insert into resultado (teste, ok) select 'segurança: pode_ver_canal/contato/conversa seguem com a tela (as políticas usam)',
  has_function_privilege('authenticated', 'public.pode_ver_canal(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.pode_ver_contato(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.pode_ver_conversa(uuid)', 'execute');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  perform public.pedido_recalcular();
  insert into resultado (teste, ok) values ('segurança: a tela não chama função de gatilho pela API', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('segurança: a tela não chama função de gatilho pela API', true);
-- Com EXECUTE, o erro seria outro (0A000, só roda como gatilho): grava false em vez de parar a bateria.
when others then
  insert into resultado (teste, ok) values ('segurança: a tela não chama função de gatilho pela API', false);
end $$;
insert into resultado (teste, ok) select 'segurança: o dono ainda vê a conversa (pode_ver_conversa pela RLS)',
  public.pode_ver_conversa(current_setting('teste.conversa')::uuid)
  and exists (select 1 from public.conversas where id = current_setting('teste.conversa')::uuid);
do $$ begin
  insert into public.contatos (org_id, telefone, nome) values (current_setting('teste.f7')::uuid, '5541911100011', 'Gatilho fechado');
  insert into resultado (teste, ok) select 'segurança: gatilho fechado continua rodando (contato nasce na carteira do dono)',
    responsavel_id = '00000000-0000-0000-0000-0000000000a1' from public.contatos where telefone = '5541911100011';
end $$;
-- Desempenho: auth.uid() uma vez por consulta nas políticas e índices das notas fiscais (migration 20261027150000).
reset role;
insert into resultado (teste, ok) select 'desempenho: nenhuma política de public com auth.*() fora de (select ...)',
  not exists (select 1 from pg_policies
               where schemaname = 'public'
                 and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                                    'SELECT auth\.\w+\(\)', '', 'g') ~ 'auth\.\w+\(');
insert into resultado (teste, ok) select 'desempenho: notas fiscais com índice por pedido e por OS',
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'notas_fiscais'
                                      and indexname = 'notas_fiscais_pedido_idx')
  and exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'notas_fiscais'
                                          and indexname = 'notas_fiscais_os_idx');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$ begin
  insert into public.notas (org_id, conversa_id, autor_tipo, autor_id, texto)
  values (current_setting('teste.f7')::uuid, current_setting('teste.conversa')::uuid, 'atendente',
          '00000000-0000-0000-0000-0000000000a1', 'Nota do dono (desempenho)');
  insert into public.push_inscricoes (user_id, endpoint, p256dh, auth)
  values ('00000000-0000-0000-0000-0000000000a1', 'https://push.teste/desempenho', 'p', 'a');
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'desempenho: atendente vê o perfil da equipe e não o de outra empresa',
  exists (select 1 from public.perfis where user_id = '00000000-0000-0000-0000-0000000000a1')
  and not exists (select 1 from public.perfis where user_id = '00000000-0000-0000-0000-0000000000c1');
delete from public.notas where texto = 'Nota do dono (desempenho)';
insert into resultado (teste, ok) select 'desempenho: atendente não apaga a nota do dono nem vê a inscrição de push dele',
  exists (select 1 from public.notas where texto = 'Nota do dono (desempenho)')
  and not exists (select 1 from public.push_inscricoes where endpoint = 'https://push.teste/desempenho');
do $$ begin
  insert into public.notas (org_id, conversa_id, autor_tipo, autor_id, texto)
  values (current_setting('teste.f7')::uuid, current_setting('teste.conversa')::uuid, 'atendente',
          '00000000-0000-0000-0000-0000000000a1', 'Nota em nome do dono');
  insert into resultado (teste, ok) values ('desempenho: atendente não cria nota em nome do dono', false);
exception when insufficient_privilege then
  insert into resultado (teste, ok) values ('desempenho: atendente não cria nota em nome do dono', true);
end $$;
update public.perfis set nome = 'Trocado pela atendente' where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into resultado (teste, ok) select 'desempenho: atendente não vê a outra empresa nem os membros dela',
  not exists (select 1 from public.organizacoes where id = current_setting('teste.cli')::uuid)
  and not exists (select 1 from public.membros_org where org_id = current_setting('teste.cli')::uuid);
reset role;
insert into resultado (teste, ok) select 'desempenho: atendente não altera o perfil do dono',
  not exists (select 1 from public.perfis where nome = 'Trocado pela atendente');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'desempenho: o dono vê a própria inscrição de push',
  exists (select 1 from public.push_inscricoes where endpoint = 'https://push.teste/desempenho');
delete from public.notas where texto = 'Nota do dono (desempenho)';
insert into resultado (teste, ok) select 'desempenho: o autor apaga a própria nota',
  not exists (select 1 from public.notas where texto = 'Nota do dono (desempenho)');
-- Data de Brasília, a mesma das funções do financeiro: depois das 21 h o dia do servidor (UTC) já é o seguinte.
reset role;
create function public.fin_hoje_teste() returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
grant execute on function public.fin_hoje_teste() to authenticated;
-- Financeiro, entrega 1 (migration 20261028120000; a1 é dono da F7 de teste e admin da plataforma, b1 atendente,
-- c1 dono de outra empresa).
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
begin
  perform public.plataforma_definir_modulo(v_org, 'erp', false);
  perform public.plataforma_definir_modulo(v_org, 'os', false);
  begin
    perform public.fin_preparar(v_org);
    insert into resultado (teste, ok) values ('financeiro: sem ERP e sem OS não liga', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro: sem ERP e sem OS não liga', sqlerrm like 'o financeiro não está ligado%');
  end;
  perform public.plataforma_definir_modulo(v_org, 'os', true);
  insert into resultado (teste, ok) values ('financeiro: liga com as OS', public.fin_ligado(v_org));
  perform public.plataforma_definir_modulo(v_org, 'os', false);
  perform public.plataforma_definir_modulo(v_org, 'erp', true);
  perform public.fin_preparar(v_org);
  perform public.fin_preparar(v_org);
  insert into resultado (teste, ok) select 'financeiro: preparar cria 7 categorias e o caixa (uma vez só)',
    (select count(*) from public.fin_categorias where org_id = v_org) = 7
    and (select count(*) from public.fin_contas where org_id = v_org) = 1
    and exists (select 1 from public.fin_contas where org_id = v_org and nome = 'Caixa' and tipo = 'caixa');
end $$;

do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_caixa uuid := (select id from public.fin_contas where org_id = current_setting('teste.f7')::uuid and nome = 'Caixa');
  v_banco uuid;
  v_vendas uuid := (select id from public.fin_categorias where org_id = current_setting('teste.f7')::uuid and nome = 'Vendas');
  v_aluguel uuid := (select id from public.fin_categorias where org_id = current_setting('teste.f7')::uuid and nome = 'Aluguel');
  v_grupo uuid;
  v_p1 uuid; v_p2 uuid;
  v_b1 uuid; v_b2 uuid;
  v_pagar uuid;
begin
  v_banco := public.fin_salvar_conta(v_org, null, 'Banco Teste', 'banco', null, 1000, public.fin_hoje_teste() - 30, true);
  begin
    perform public.fin_salvar_conta(v_org, null, ' banco teste ', 'banco', null, 0, null, true);
    insert into resultado (teste, ok) values ('financeiro: nome de conta repetido é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro: nome de conta repetido é recusado', sqlerrm like 'já existe uma conta%');
  end;

  v_grupo := public.fin_criar_lancamento(v_org, 'receber', 'Venda parcelada', v_vendas, null, null, null, null,
    jsonb_build_array(jsonb_build_object('vencimento', public.fin_hoje_teste() - 5, 'valor', 100),
                      jsonb_build_object('vencimento', public.fin_hoje_teste() + 25, 'valor', 200.004)), null);
  select id into v_p1 from public.fin_lancamentos where grupo_id = v_grupo and parcela = 1;
  select id into v_p2 from public.fin_lancamentos where grupo_id = v_grupo and parcela = 2;
  insert into resultado (teste, ok) select 'financeiro: lançamento em 2 parcelas no mesmo grupo, valor em centavos',
    (select count(*) from public.fin_lancamentos where grupo_id = v_grupo and parcelas = 2) = 2
    and (select valor from public.fin_lancamentos where id = v_p2) = 200.00;
  insert into resultado (teste, ok) select 'financeiro: parcela passada aparece vencida e a futura em aberto',
    (select situacao from public.fin_lancamentos_situacao where id = v_p1) = 'vencido'
    and (select situacao from public.fin_lancamentos_situacao where id = v_p2) = 'aberto';

  begin
    perform public.fin_criar_lancamento(v_org, 'receber', 'Errado', v_aluguel, null, null, null, null,
      jsonb_build_array(jsonb_build_object('vencimento', public.fin_hoje_teste(), 'valor', 10)), null);
    insert into resultado (teste, ok) values ('financeiro: categoria de despesa no a receber é recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro: categoria de despesa no a receber é recusada', sqlerrm like 'a categoria não é desta empresa%');
  end;
  begin
    perform public.fin_criar_lancamento(v_org, 'pagar', 'Zero', null, null, null, null, null,
      jsonb_build_array(jsonb_build_object('vencimento', public.fin_hoje_teste(), 'valor', 0)), null);
    insert into resultado (teste, ok) values ('financeiro: parcela de valor zero é recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro: parcela de valor zero é recusada', sqlerrm like 'parcela 1: informe o vencimento%');
  end;

  v_b1 := public.fin_baixar(v_p2, v_caixa, public.fin_hoje_teste(), 40, 'pix', null);
  insert into resultado (teste, ok) select 'financeiro: baixa em parte deixa a parcela parcial com o que falta',
    (select situacao = 'parcial' and restante = 160 and pago_em is null from public.fin_lancamentos_situacao where id = v_p2);
  begin
    perform public.fin_baixar(v_p2, v_caixa, public.fin_hoje_teste(), 160.01, 'pix', null);
    insert into resultado (teste, ok) values ('financeiro: baixa acima do que falta é recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro: baixa acima do que falta é recusada', sqlerrm like 'o valor passa do que falta%');
  end;
  begin
    perform public.fin_baixar(v_p2, v_caixa, public.fin_hoje_teste() + 1, 10, 'pix', null);
    insert into resultado (teste, ok) values ('financeiro: baixa com data no futuro é recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro: baixa com data no futuro é recusada', sqlerrm like 'a data do pagamento não pode ser no futuro%');
  end;
  v_b2 := public.fin_baixar(v_p2, v_caixa, public.fin_hoje_teste() - 1, 160, 'dinheiro', null);
  insert into resultado (teste, ok) select 'financeiro: a segunda baixa quita a parcela com a data da última',
    (select situacao = 'pago' and restante = 0 and pago_em = public.fin_hoje_teste() from public.fin_lancamentos_situacao where id = v_p2);

  perform public.fin_desfazer_baixa(v_b2, 'lançado errado');
  insert into resultado (teste, ok) select 'financeiro: desfazer a baixa volta a parcial e mantém o registro',
    (select situacao = 'parcial' and valor_pago = 40 and pago_em is null from public.fin_lancamentos_situacao where id = v_p2)
    and (select desfeita_em is not null and motivo_desfazer = 'lançado errado' from public.fin_baixas where id = v_b2)
    and exists (select 1 from public.auditoria where entidade = 'fin_baixas' and entidade_id = v_b2::text and acao = 'desfazer_baixa');
  begin
    perform public.fin_desfazer_baixa(v_b2, null);
    insert into resultado (teste, ok) values ('financeiro: baixa desfeita não se desfaz de novo', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro: baixa desfeita não se desfaz de novo', sqlerrm like 'a baixa já foi desfeita%');
  end;
  begin
    perform public.fin_editar_lancamento(v_p2, null, v_vendas, null, 30, null);
    insert into resultado (teste, ok) values ('financeiro: valor menor que o já pago é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro: valor menor que o já pago é recusado', sqlerrm like 'o valor não pode ser menor que o já pago%');
  end;
  begin
    perform public.fin_cancelar_lancamento(v_p2, null);
    insert into resultado (teste, ok) values ('financeiro: lançamento com baixa não é cancelado', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro: lançamento com baixa não é cancelado', sqlerrm like 'desfaça as baixas%');
  end;
  perform public.fin_editar_lancamento(v_p1, 'Venda parcelada (1ª)', v_vendas, public.fin_hoje_teste() + 3, 120, 'combinado');
  insert into resultado (teste, ok) select 'financeiro: editar muda valor e vencimento da parcela',
    (select valor = 120 and vencimento = public.fin_hoje_teste() + 3 and situacao = 'aberto' from public.fin_lancamentos_situacao where id = v_p1);
  perform public.fin_cancelar_lancamento(v_p1, 'cliente desistiu');
  insert into resultado (teste, ok) select 'financeiro: cancelar sem baixa marca cancelado',
    (select situacao from public.fin_lancamentos_situacao where id = v_p1) = 'cancelado';
  begin
    perform public.fin_baixar(v_p1, v_caixa, public.fin_hoje_teste(), 10, 'pix', null);
    insert into resultado (teste, ok) values ('financeiro: lançamento cancelado não recebe baixa', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro: lançamento cancelado não recebe baixa', sqlerrm like 'lançamento cancelado%');
  end;

  v_grupo := public.fin_criar_lancamento(v_org, 'pagar', 'Aluguel de outubro', v_aluguel, null, null,
    '12.345.678/0001-95', 'Imobiliária Teste', jsonb_build_array(jsonb_build_object('vencimento', public.fin_hoje_teste(), 'valor', 300)), null);
  select id into v_pagar from public.fin_lancamentos where grupo_id = v_grupo;
  insert into resultado (teste, ok) select 'financeiro: a pagar guarda o fornecedor só com números',
    (select fornecedor_cnpj = '12345678000195' and fornecedor_nome = 'Imobiliária Teste' from public.fin_lancamentos where id = v_pagar);
  perform public.fin_baixar(v_pagar, v_banco, public.fin_hoje_teste(), 300, 'boleto', null);
  perform public.fin_transferir(v_org, v_caixa, v_banco, public.fin_hoje_teste(), 50, 'depósito');
  begin
    perform public.fin_transferir(v_org, v_banco, v_banco, public.fin_hoje_teste(), 10, null);
    insert into resultado (teste, ok) values ('financeiro: transferência para a mesma conta é recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro: transferência para a mesma conta é recusada', sqlerrm like 'escolha duas contas diferentes%');
  end;
  -- Caixa: 40 recebidos − 50 transferidos = −10. Banco: 1000 − 300 pagos + 50 recebidos da transferência = 750.
  insert into resultado (teste, ok) select 'financeiro: saldo soma baixas e transferências (desfeitas ficam fora)',
    (select saldo from public.fin_saldos(v_org) where conta_id = v_caixa) = -10
    and (select saldo from public.fin_saldos(v_org) where conta_id = v_banco) = 750;

  begin
    insert into public.fin_lancamentos (org_id, tipo, descricao, grupo_id, vencimento, valor)
    values (v_org, 'receber', 'direto', gen_random_uuid(), public.fin_hoje_teste(), 10);
    insert into resultado (teste, ok) values ('financeiro: a tela não grava lançamento direto na tabela', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro: a tela não grava lançamento direto na tabela', true);
  end;
  perform set_config('teste.fin_p2', v_p2::text, true);
  perform set_config('teste.fin_caixa', v_caixa::text, true);
end $$;

-- Atendente sem a permissão Financeiro: não vê nem dá baixa.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'financeiro: atendente sem a permissão não vê os lançamentos',
  count(*) = 0 from public.fin_lancamentos;
do $$ begin
  perform public.fin_baixar(current_setting('teste.fin_p2')::uuid, current_setting('teste.fin_caixa')::uuid, public.fin_hoje_teste(), 1, 'pix', null);
  insert into resultado (teste, ok) values ('financeiro: atendente sem a permissão não dá baixa', false);
exception when others then
  insert into resultado (teste, ok) values ('financeiro: atendente sem a permissão não dá baixa', sqlerrm like 'você não tem acesso ao financeiro%');
end $$;
do $$ begin
  perform public.membro_definir_financeiro(current_setting('teste.f7')::uuid, '00000000-0000-0000-0000-0000000000b1', true);
  insert into resultado (teste, ok) values ('financeiro: atendente não dá a permissão a si mesmo', false);
exception when others then
  insert into resultado (teste, ok) values ('financeiro: atendente não dá a permissão a si mesmo', sqlerrm like 'só dono e admin mudam%');
end $$;

-- O dono dá a permissão: o atendente passa a ver e dar baixa, mas não configura contas.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select public.membro_definir_financeiro(current_setting('teste.f7')::uuid, '00000000-0000-0000-0000-0000000000b1', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.fin_baixar(current_setting('teste.fin_p2')::uuid, current_setting('teste.fin_caixa')::uuid, public.fin_hoje_teste(), 10, 'pix', null);
  insert into resultado (teste, ok) select 'financeiro: com a permissão, o atendente vê e dá baixa',
    (select count(*) from public.fin_lancamentos) > 0
    and (select valor_pago from public.fin_lancamentos where id = current_setting('teste.fin_p2')::uuid) = 50;
end $$;
do $$ begin
  perform public.fin_salvar_conta(current_setting('teste.f7')::uuid, null, 'Conta do atendente', 'banco', null, 0, null, true);
  insert into resultado (teste, ok) values ('financeiro: atendente com a permissão não cria conta', false);
exception when others then
  insert into resultado (teste, ok) values ('financeiro: atendente com a permissão não cria conta', sqlerrm like 'só dono e admin configuram%');
end $$;

-- Outra empresa: não vê nem mexe.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'financeiro: outra empresa não vê os lançamentos nem as contas',
  (select count(*) from public.fin_lancamentos) = 0 and (select count(*) from public.fin_contas) = 0;
do $$ begin
  perform public.fin_baixar(current_setting('teste.fin_p2')::uuid, current_setting('teste.fin_caixa')::uuid, public.fin_hoje_teste(), 1, 'pix', null);
  insert into resultado (teste, ok) values ('financeiro: outra empresa não dá baixa', false);
exception when others then
  insert into resultado (teste, ok) values ('financeiro: outra empresa não dá baixa', sqlerrm like 'o financeiro não está ligado%' or sqlerrm like 'você não tem acesso%');
end $$;
-- Financeiro, entrega 2: pedido, OS e nota de entrada geram os lançamentos (migration 20261029120000).
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_hoje date := public.fin_hoje_teste();
  v_prod uuid;
  v_ped uuid;
  v_l uuid;
  v_b uuid;
begin
  perform public.plataforma_definir_modulo(v_org, 'erp', true);
  insert into public.produtos (org_id, nome, preco, controla_estoque) values (v_org, 'Serviço fin', 100.01, false) returning id into v_prod;
  insert into public.pedidos (org_id, pagamento_forma, pagamento_prazos) values (v_org, 'boleto', '{30,60}') returning id into v_ped;
  insert into public.pedido_itens (org_id, pedido_id, produto_id, descricao, quantidade, preco_unitario)
  values (v_org, v_ped, v_prod, 'Serviço fin', 1, 100.01);
  insert into resultado (teste, ok) select 'financeiro pedido: rascunho não gera lançamento',
    not exists (select 1 from public.fin_lancamentos where pedido_id = v_ped);

  perform public.pedido_mudar_status(v_ped, 'confirmado');
  insert into resultado (teste, ok) select 'financeiro pedido: confirmar gera as parcelas pelos prazos, centavos na última',
    (select count(*) from public.fin_lancamentos where pedido_id = v_ped and cancelado_em is null and origem = 'pedido'
       and tipo = 'receber' and parcelas = 2) = 2
    and (select valor = 50.00 and vencimento = v_hoje + 30 from public.fin_lancamentos where pedido_id = v_ped and parcela = 1)
    and (select valor = 50.01 and vencimento = v_hoje + 60 from public.fin_lancamentos where pedido_id = v_ped and parcela = 2)
    and (select count(*) from public.pedido_parcelas(v_ped)) = 2;

  perform public.pedido_mudar_status(v_ped, 'separando');
  insert into resultado (teste, ok) select 'financeiro pedido: avançar a entrega não refaz as parcelas',
    (select count(*) from public.fin_lancamentos where pedido_id = v_ped) = 2;

  update public.pedidos set pagamento_prazos = '{0}' where id = v_ped;
  insert into resultado (teste, ok) select 'financeiro pedido: mudar os prazos refaz as parcelas e cancela as antigas',
    (select count(*) from public.fin_lancamentos where pedido_id = v_ped and cancelado_em is null) = 1
    and (select count(*) from public.fin_lancamentos where pedido_id = v_ped and motivo_cancelamento = 'pedido mudou: parcelas refeitas') = 2
    and (select valor = 100.01 and vencimento = v_hoje from public.fin_lancamentos where pedido_id = v_ped and cancelado_em is null);

  select id into v_l from public.fin_lancamentos where pedido_id = v_ped and cancelado_em is null;
  v_b := public.fin_baixar(v_l, (select id from public.fin_contas where org_id = v_org and nome = 'Caixa'), v_hoje, 10, 'pix', null);
  begin
    perform public.pedido_mudar_status(v_ped, 'cancelado');
    insert into resultado (teste, ok) values ('financeiro pedido: com pagamento, o pedido não é cancelado', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro pedido: com pagamento, o pedido não é cancelado',
      sqlerrm like 'o pedido já tem pagamento registrado%' and (select status from public.pedidos where id = v_ped) = 'separando');
  end;
  begin
    perform public.fin_cancelar_lancamento(v_l, null);
    insert into resultado (teste, ok) values ('financeiro pedido: a parcela do pedido não se cancela no financeiro', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro pedido: a parcela do pedido não se cancela no financeiro', sqlerrm like 'este lançamento vem do pedido%');
  end;
  perform public.fin_desfazer_baixa(v_b, null);
  perform public.pedido_mudar_status(v_ped, 'cancelado');
  insert into resultado (teste, ok) select 'financeiro pedido: cancelar o pedido cancela as parcelas',
    not exists (select 1 from public.fin_lancamentos where pedido_id = v_ped and cancelado_em is null)
    and (select motivo_cancelamento from public.fin_lancamentos where id = v_l) = 'pedido cancelado';
end $$;

do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_hoje date := public.fin_hoje_teste();
  v_os uuid;
  v_item uuid;
  v_l uuid;
begin
  perform public.plataforma_definir_modulo(v_org, 'os', true);
  perform public.os_preparar(v_org);
  insert into public.ordens_servico (org_id, cliente_nome, recebida_em) values (v_org, 'Cliente fin', v_hoje - 5) returning id into v_os;
  insert into public.os_itens (org_id, os_id, modelo, identificacao, valor) values (v_org, v_os, 'MOTOR FIN', 'X1', 150)
  returning id into v_item;
  insert into resultado (teste, ok) select 'financeiro OS: item não faturado não gera lançamento',
    not exists (select 1 from public.fin_lancamentos where os_item_id = v_item);

  perform public.os_faturar(array[v_item], v_hoje - 1, v_hoje + 29);
  select id into v_l from public.fin_lancamentos where os_item_id = v_item and cancelado_em is null;
  insert into resultado (teste, ok) select 'financeiro OS: faturar gera o a receber com o vencimento e o valor do item',
    (select origem = 'os' and tipo = 'receber' and valor = 150 and vencimento = v_hoje + 29
            and descricao like 'OS nº % · MOTOR FIN X1' from public.fin_lancamentos where id = v_l);

  perform public.os_registrar_pagamento(array[v_item], v_hoje);
  insert into resultado (teste, ok) select 'financeiro OS: pagamento na OS vira baixa no caixa',
    (select valor_pago = 150 and pago_em = v_hoje from public.fin_lancamentos where id = v_l)
    and exists (select 1 from public.fin_baixas b join public.fin_contas c on c.id = b.conta_id
                 where b.lancamento_id = v_l and b.desfeita_em is null and c.nome = 'Caixa' and b.observacao = 'registrado na OS');

  perform public.fin_desfazer_baixa((select id from public.fin_baixas where lancamento_id = v_l and desfeita_em is null), 'errado');
  insert into resultado (teste, ok) select 'financeiro OS: desfazer no financeiro tira o pago da OS',
    (select pago_em is null from public.os_itens where id = v_item);
  perform public.fin_baixar(v_l, (select id from public.fin_contas where org_id = v_org and nome = 'Caixa'), v_hoje - 1, 150, 'boleto', null);
  insert into resultado (teste, ok) select 'financeiro OS: receber no financeiro marca a OS como paga',
    (select pago_em = v_hoje - 1 from public.os_itens where id = v_item);

  perform public.os_faturar(array[v_item], null, null);
  insert into resultado (teste, ok) select 'financeiro OS: desfazer o faturamento cancela o lançamento e desfaz a baixa',
    (select cancelado_em is not null and valor_pago = 0 from public.fin_lancamentos where id = v_l)
    and (select pago_em is null and faturado_em is null from public.os_itens where id = v_item);
  perform public.os_faturar(array[v_item], v_hoje, null);
  insert into resultado (teste, ok) select 'financeiro OS: faturar de novo cria outro lançamento (um ativo por item)',
    (select count(*) from public.fin_lancamentos where os_item_id = v_item and cancelado_em is null) = 1
    and (select count(*) from public.fin_lancamentos where os_item_id = v_item) = 2;
  begin
    perform public.fin_cancelar_lancamento((select id from public.fin_lancamentos where os_item_id = v_item and cancelado_em is null), null);
    insert into resultado (teste, ok) values ('financeiro OS: o lançamento da OS não se cancela no financeiro', false);
  exception when others then
    insert into resultado (teste, ok) values ('financeiro OS: o lançamento da OS não se cancela no financeiro', sqlerrm like 'este lançamento vem da OS%');
  end;
end $$;

do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  r jsonb;
  r2 jsonb;
begin
  r := public.nota_entrada_lancar(v_org,
    '{"chave":"41201099888777000166550010000099991000099999","numero":"9999","serie":"1","emissao":"2026-10-01",
      "emitente_cnpj":"99.888.777/0001-66","emitente_nome":"Fornecedor Fin","valor_total":"300.00","origem":"xml",
      "duplicatas":[{"numero":"002","vencimento":"2026-12-01","valor":"150.00"},
                    {"numero":"001","vencimento":"2026-11-01","valor":"150.00"},
                    {"numero":"003","vencimento":"2026-13-45","valor":"10"}]}',
    jsonb_build_array(jsonb_build_object('novo', jsonb_build_object('nome', 'Produto fin', 'codigo', 'FIN-NF'),
                      'descricao', 'PRODUTO FIN', 'quantidade', 1, 'valor_unitario', 300, 'valor_total', 300)));
  insert into resultado (teste, ok) select 'financeiro nota: as duplicatas válidas viram o a pagar do fornecedor, em ordem',
    (select count(*) from public.fin_lancamentos where nota_entrada_id = (r ->> 'nota_id')::uuid) = 2
    and (select vencimento = '2026-11-01' and parcela = 1 and parcelas = 2 and fornecedor_cnpj = '99888777000166'
                and origem = 'nota_entrada' and tipo = 'pagar' and descricao = 'NF 9999 · Fornecedor Fin'
           from public.fin_lancamentos where nota_entrada_id = (r ->> 'nota_id')::uuid and parcela = 1);

  r2 := public.nota_entrada_lancar(v_org,
    '{"numero":"555","serie":"1","emissao":"2026-10-15","emitente_cnpj":"99888777000166","emitente_nome":"Fornecedor Fin",
      "valor_total":"80.00","origem":"imagem"}',
    jsonb_build_array(jsonb_build_object('novo', jsonb_build_object('nome', 'Produto fin 2', 'codigo', 'FIN-NF2'),
                      'descricao', 'PRODUTO FIN 2', 'quantidade', 1)));
  insert into resultado (teste, ok) select 'financeiro nota: sem duplicatas, uma parcela com o valor da nota para conferir',
    (select count(*) = 1 and min(valor) = 80 and min(vencimento) = '2026-10-15' and bool_and(observacao like 'A nota não trouxe as parcelas%')
       from public.fin_lancamentos where nota_entrada_id = (r2 ->> 'nota_id')::uuid);
end $$;

-- Planos e franquia de atendimentos do agente (migration 20261101120000).
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_a1 uuid := '00000000-0000-0000-0000-0000000000a1';
  v_canal uuid;
  r jsonb;
  v_conv1 uuid;
  v_msg uuid;
  v_alertas integer;
  v_ok boolean;
begin
  insert into resultado (teste, ok) select 'franquia: empresa existente fica no plano interno, sem limite',
    (select limite is null and plano = 'interno' from public.franquia_do_mes(current_setting('teste.cli')::uuid));

  -- Canal e agente próprios, para não depender do estado deixado pelos blocos anteriores.
  insert into public.canais (org_id, nome, telefone, instance_id) values (v_org, 'WhatsApp franquia', '5541999997777', 'INST-FRANQUIA')
  returning id into v_canal;
  insert into public.agentes (org_id, canal_id, ativo, prompt) values (v_org, v_canal, true, 'prompt');
  update public.perfis set telefone = '5541999990001' where user_id = v_a1;
  update public.organizacoes set plano = 'essencial', ao_passar_franquia = 'parar' where id = v_org;
  delete from public.atendimentos_agente where org_id = v_org;
  delete from public.creditos_atendimentos where org_id = v_org;
  insert into public.atendimentos_agente (org_id, mes) select v_org, public.mes_brasilia() from generate_series(1, 119);

  -- Primeira resposta numa conversa: um atendimento; a segunda, na mesma conversa, não conta de novo.
  r := public.registrar_entrada(v_canal, 'FRANQ-1', '5541977770001', null, 'Cliente Franquia 1', 'texto', 'Oi', '{}');
  v_conv1 := (r ->> 'conversa_id')::uuid;
  v_msg := (r ->> 'mensagem_id')::uuid;
  select count(*) into v_alertas from public.alertas where org_id = v_org;
  insert into resultado (teste, ok) select 'franquia: abaixo do limite o agente responde', public.agente_deve_responder(v_conv1, v_msg);
  perform public.agente_responder(v_conv1, 'Olá!', v_msg);
  perform public.agente_responder(v_conv1, 'Em que posso ajudar?', v_msg);
  insert into resultado (teste, ok) select 'franquia: duas mensagens do agente na mesma conversa contam 1 atendimento',
    (select usados = 120 and limite = 150 from public.franquia_do_mes(v_org))
    and (select count(*) = 1 from public.atendimentos_agente where conversa_id = v_conv1);
  insert into resultado (teste, ok) select 'franquia: aos 80 % o dono é avisado no WhatsApp, uma vez só',
    (select count(*) = 1 from public.avisos_franquia where org_id = v_org and nivel = 80 and limite = 150)
    and (select count(*) from public.alertas where org_id = v_org) > v_alertas
    and exists (select 1 from public.alertas where org_id = v_org and texto like '%80 \% usados%' and texto like '%120 de 150%');

  -- Chega a 100 %: aviso e, na conversa seguinte, o agente passa para a equipe.
  insert into public.atendimentos_agente (org_id, mes) select v_org, public.mes_brasilia() from generate_series(1, 29);
  r := public.registrar_entrada(v_canal, 'FRANQ-2', '5541977770002', null, 'Cliente Franquia 2', 'texto', 'Oi', '{}');
  perform public.agente_responder((r ->> 'conversa_id')::uuid, 'Olá!', (r ->> 'mensagem_id')::uuid);
  insert into resultado (teste, ok) select 'franquia: aos 100 % sai o aviso de que acabaram',
    (select usados = 150 from public.franquia_do_mes(v_org))
    and exists (select 1 from public.alertas where org_id = v_org and texto like '%acabaram%' and texto like '%conversas novas vão para a equipe%');

  r := public.registrar_entrada(v_canal, 'FRANQ-3', '5541977770003', null, 'Cliente Franquia 3', 'texto', 'Oi', '{}');
  v_ok := not public.agente_deve_responder((r ->> 'conversa_id')::uuid, (r ->> 'mensagem_id')::uuid);
  insert into resultado (teste, ok) select 'franquia: no limite com "parar", conversa nova vai para a equipe com o motivo',
    v_ok
    and exists (select 1 from public.conversas where id = (r ->> 'conversa_id')::uuid
                  and estado = 'aguardando_humano' and motivo_humano like 'Os atendimentos do agente deste mês acabaram%')
    and (select usados = 150 from public.franquia_do_mes(v_org));

  r := public.registrar_entrada(v_canal, 'FRANQ-1B', '5541977770001', null, 'Cliente Franquia 1', 'texto', 'E o preço?', '{}');
  insert into resultado (teste, ok) select 'franquia: atendimento já começado segue nas 24 h, mesmo no limite',
    public.agente_deve_responder(v_conv1, (r ->> 'mensagem_id')::uuid);

  -- Atendimento de mais de 24 h atrás: a próxima resposta é um atendimento novo.
  update public.atendimentos_agente set iniciado_em = now() - interval '25 hours' where conversa_id = v_conv1;
  insert into resultado (teste, ok) select 'franquia: depois de 24 h a mesma conversa começa outro atendimento',
    not public.agente_deve_responder(v_conv1, (r ->> 'mensagem_id')::uuid);

  -- "Continuar": o agente segue e o atendimento entra como excedente.
  update public.organizacoes set ao_passar_franquia = 'continuar' where id = v_org;
  r := public.registrar_entrada(v_canal, 'FRANQ-4', '5541977770004', null, 'Cliente Franquia 4', 'texto', 'Oi', '{}');
  insert into resultado (teste, ok) select 'franquia: com "continuar" o agente segue no limite',
    public.agente_deve_responder((r ->> 'conversa_id')::uuid, (r ->> 'mensagem_id')::uuid);
  perform public.agente_responder((r ->> 'conversa_id')::uuid, 'Olá!', (r ->> 'mensagem_id')::uuid);
  insert into resultado (teste, ok) select 'franquia: atendimento além do limite com "continuar" é excedente',
    (select usados = 151 and excedentes = 1 from public.franquia_do_mes(v_org));

  r := public.registrar_entrada(v_canal, 'FRANQ-5', '5541977770005', null, 'Cliente Franquia 5', 'texto', 'Oi', '{}');
  perform public.enfileirar_saida((r ->> 'conversa_id')::uuid, 'Resposta da equipe', 'atendente', '00000000-0000-0000-0000-0000000000b1');
  insert into resultado (teste, ok) select 'franquia: mensagem da equipe não conta atendimento',
    not exists (select 1 from public.atendimentos_agente where conversa_id = (r ->> 'conversa_id')::uuid);

  -- Troca de plano no meio do mês com o consumo já acima do limite: o aviso de 100 % sai na troca.
  delete from public.atendimentos_agente where org_id = v_org;
  delete from public.avisos_franquia where org_id = v_org;
  update public.organizacoes set plano = 'interno', ao_passar_franquia = 'parar' where id = v_org;
  insert into public.atendimentos_agente (org_id, mes) select v_org, public.mes_brasilia() from generate_series(1, 160);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  perform public.plataforma_definir_plano(v_org, 'essencial');
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into resultado (teste, ok) select 'franquia: trocar para um plano já estourado avisa o dono na hora',
    exists (select 1 from public.avisos_franquia where org_id = v_org and nivel = 100 and limite = 150)
    and exists (select 1 from public.alertas where org_id = v_org and texto like '%Sua empresa usou os 150 atendimentos%');

  -- Administrador que não é dono (d1): vê o plano, não escolhe nem compra.
  insert into auth.users (id, email, raw_user_meta_data)
  values ('00000000-0000-0000-0000-00000000f9a1', 'admin-plano@f7.teste', '{"nome":"Dora"}');
  insert into public.membros_org (org_id, user_id, papel) values (v_org, '00000000-0000-0000-0000-00000000f9a1', 'admin');

  insert into resultado (teste, ok) select 'franquia: números dos avisos com ponto de milhar',
    public.numero_br(1500) = '1.500' and public.numero_br(150) = '150' and public.numero_br(0) = '0';

  insert into resultado (teste, ok) select 'franquia: usuário logado não chama as funções internas',
    not has_function_privilege('authenticated', 'public.franquia_do_mes(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.agente_franquia_esgotada(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.avisar_franquia(uuid)', 'execute');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.plano_consumo(current_setting('teste.f7')::uuid);
  insert into resultado (teste, ok) values ('franquia: atendente não vê o plano', false);
exception when others then
  insert into resultado (teste, ok) values ('franquia: atendente não vê o plano', sqlerrm like 'Só o dono e os administradores%');
end $$;
do $$ begin
  perform public.plano_definir_escolha(current_setting('teste.f7')::uuid, 'continuar');
  insert into resultado (teste, ok) values ('franquia: atendente não escolhe parar ou continuar', false);
exception when others then
  insert into resultado (teste, ok) values ('franquia: atendente não escolhe parar ou continuar', sqlerrm like 'Só o dono%');
end $$;
insert into resultado (teste, ok) select 'franquia: atendente não lê atendimentos nem créditos',
  not exists (select 1 from public.atendimentos_agente) and not exists (select 1 from public.creditos_atendimentos);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'franquia: outra empresa não lê atendimentos nem créditos da F7',
  not exists (select 1 from public.atendimentos_agente where org_id = current_setting('teste.f7')::uuid)
  and not exists (select 1 from public.creditos_atendimentos where org_id = current_setting('teste.f7')::uuid);
do $$ begin
  perform public.plataforma_planos_consumo();
  insert into resultado (teste, ok) values ('franquia: cliente não vê o consumo das empresas', false);
exception when others then
  insert into resultado (teste, ok) values ('franquia: cliente não vê o consumo das empresas', sqlerrm like 'só a equipe da plataforma%');
end $$;
do $$ begin
  perform public.plataforma_dar_cortesia(current_setting('teste.cli')::uuid, 100, 'para mim');
  insert into resultado (teste, ok) values ('franquia: cliente não dá cortesia a si mesmo', false);
exception when others then
  insert into resultado (teste, ok) values ('franquia: cliente não dá cortesia a si mesmo', sqlerrm like 'só a equipe da plataforma%');
end $$;
do $$ begin
  perform public.plano_comprar_pacote(current_setting('teste.f7')::uuid, 150);
  insert into resultado (teste, ok) values ('franquia: dono de outra empresa não compra pacote', false);
exception when others then
  insert into resultado (teste, ok) values ('franquia: dono de outra empresa não compra pacote', sqlerrm like 'Só o dono%');
end $$;
do $$ begin
  perform public.plataforma_definir_plano(current_setting('teste.f7')::uuid, 'business');
  insert into resultado (teste, ok) values ('franquia: só a plataforma define o plano', false);
exception when others then
  insert into resultado (teste, ok) values ('franquia: só a plataforma define o plano', sqlerrm like 'só a equipe da plataforma%');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f9a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
begin
  insert into resultado (teste, ok) select 'franquia: administrador vê o plano',
    (select limite = 150 from public.plano_consumo(v_org));
  begin
    perform public.plano_definir_escolha(v_org, 'continuar');
    insert into resultado (teste, ok) values ('franquia: administrador não muda a escolha', false);
  exception when others then
    insert into resultado (teste, ok) values ('franquia: administrador não muda a escolha', sqlerrm like 'Só o dono%');
  end;
  begin
    perform public.plano_comprar_pacote(v_org, 150);
    insert into resultado (teste, ok) values ('franquia: administrador não compra pacote', false);
  exception when others then
    insert into resultado (teste, ok) values ('franquia: administrador não compra pacote', sqlerrm like 'Só o dono%');
  end;
end $$;

-- Dono da F7 de teste (a1, também da plataforma).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_limite integer;
  c record;
begin
  perform public.plano_definir_escolha(v_org, 'continuar');
  select * into c from public.plano_consumo(v_org);
  insert into resultado (teste, ok) select 'franquia: dono vê o plano e muda a escolha',
    c.plano_nome = 'Essencial' and c.limite = 150 and c.usados = 160 and c.escolha = 'continuar' and c.pacote_preco = 29.90
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'definir_escolha_franquia');

  v_limite := public.plano_comprar_pacote(v_org, 150);
  insert into resultado (teste, ok) select 'franquia: pacote soma 100 ao limite do mês e entra para cobrar',
    v_limite = 250
    and (select pacotes_mes = 1 and valor_pacotes_mes = 29.90 from public.plano_consumo(v_org));
  begin
    perform public.plano_comprar_pacote(v_org, 150);
    insert into resultado (teste, ok) values ('franquia: clique duplo não compra o segundo pacote', false);
  exception when others then
    insert into resultado (teste, ok) values ('franquia: clique duplo não compra o segundo pacote', sqlerrm like 'O limite do mês mudou%');
  end;
  begin
    perform public.plano_definir_escolha(v_org, 'talvez');
    insert into resultado (teste, ok) values ('franquia: escolha inválida é recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('franquia: escolha inválida é recusada', sqlerrm like 'Escolha parar ou continuar%');
  end;
  begin
    perform public.plataforma_definir_plano(v_org, 'diamante');
    insert into resultado (teste, ok) values ('franquia: plano inexistente é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('franquia: plano inexistente é recusado', sqlerrm like 'plano inexistente%');
  end;

  perform public.plataforma_dar_cortesia(v_org, 50, 'Teste de cortesia');
  insert into resultado (teste, ok) select 'franquia: cortesia da plataforma soma no limite e aparece na lista',
    (select limite = 300 and creditos = 150 and plano = 'essencial' from public.plataforma_planos_consumo() where org_id = v_org);

  -- Empresa nova (a1 dono), ainda no plano interno.
  perform set_config('teste.semplano', public.criar_organizacao('Sem Plano', 'teste-sem-plano')::text, true);
  begin
    perform public.plano_comprar_pacote(current_setting('teste.semplano')::uuid, null);
    insert into resultado (teste, ok) values ('franquia: sem plano com franquia não há pacote', false);
  exception when others then
    insert into resultado (teste, ok) values ('franquia: sem plano com franquia não há pacote', sqlerrm like 'A sua empresa ainda não tem um plano%');
  end;

  begin
    perform public.plataforma_dar_cortesia(v_org, 10, '  ');
    insert into resultado (teste, ok) values ('franquia: cortesia sem motivo é recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('franquia: cortesia sem motivo é recusada', sqlerrm like 'Informe o motivo%');
  end;

  perform public.plataforma_definir_plano(v_org, 'start');
  insert into resultado (teste, ok) select 'franquia: plataforma troca o plano e fica registrado',
    (select limite = 500 from public.plano_consumo(v_org))
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'definir_plano');
end $$;

-- Dados de cobrança (migration 20261101140000).
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_cli uuid := current_setting('teste.cli')::uuid;
  d record;
  e record;
begin
  -- Sem dados salvos: a emissora padrão (se houver) vem como sugestão.
  select * into e from public.emissoras where org_id = v_org order by padrao desc, criado_em limit 1;
  select * into d from public.cobranca_dados(v_org);
  insert into resultado (teste, ok) select 'cobrança: sem dados, a emissora padrão vira sugestão',
    case when e.id is null then d.nome is null else d.sugerido and d.documento = e.cnpj and d.nome = e.razao_social end;

  perform public.cobranca_salvar_dados(v_org, '{"nome":"F7 Teste Ltda","documento":"11.222.333/0001-81",
    "email":" Financeiro@F7.teste ","telefone":"(41) 99999-0000","cep":"80420-210","logradouro":"Rua Visconde do Rio Branco",
    "numero":"1488","complemento":"","bairro":"Centro","cidade":"Curitiba","uf":"pr"}');
  select * into d from public.cobranca_dados(v_org);
  insert into resultado (teste, ok) select 'cobrança: dono salva e os dados voltam limpos (só dígitos, e-mail e UF)',
    not d.sugerido and d.documento = '11222333000181' and d.email = 'financeiro@f7.teste' and d.telefone = '41999990000'
    and d.cep = '80420210' and d.uf = 'PR' and d.complemento is null
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'salvar_dados_cobranca');

  perform public.cobranca_salvar_dados(v_org, '{"nome":"Fulano de Tal","documento":"529.982.247-25","email":"fulano@teste.com",
    "cep":"80420210","logradouro":"Rua A","numero":"1","bairro":"Centro","cidade":"Curitiba","uf":"PR"}');
  insert into resultado (teste, ok) select 'cobrança: aceita CPF e atualiza o que já existia',
    (select documento = '52998224725' and telefone is null from public.dados_cobranca where org_id = v_org);

  begin
    perform public.cobranca_salvar_dados(v_org, '{"nome":"X Ltda","documento":"11222333000182","email":"a@b.com",
      "cep":"80420210","logradouro":"Rua A","numero":"1","bairro":"Centro","cidade":"Curitiba","uf":"PR"}');
    insert into resultado (teste, ok) values ('cobrança: documento inválido é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('cobrança: documento inválido é recusado', sqlerrm like 'CNPJ ou CPF inválido%');
  end;
  begin
    perform public.cobranca_salvar_dados(v_org, '{"nome":"X Ltda","documento":"11222333000181","email":"sem-arroba",
      "cep":"80420210","logradouro":"Rua A","numero":"1","bairro":"Centro","cidade":"Curitiba","uf":"PR"}');
    insert into resultado (teste, ok) values ('cobrança: e-mail inválido é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('cobrança: e-mail inválido é recusado', sqlerrm like 'Informe um e-mail%');
  end;
  begin
    perform public.cobranca_salvar_dados(v_org, '{"nome":"X Ltda","documento":"11222333000181","email":"a@b.com",
      "cep":"80420210","logradouro":"Rua A","numero":"","bairro":"Centro","cidade":"Curitiba","uf":"PR"}');
    insert into resultado (teste, ok) values ('cobrança: endereço incompleto é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('cobrança: endereço incompleto é recusado', sqlerrm like 'Preencha o endereço%');
  end;

  -- A plataforma preenche no cadastro de uma empresa de que não é dona.
  perform public.cobranca_salvar_dados(v_cli, '{"nome":"Cliente X Ltda","documento":"11222333000181","email":"x@cliente.teste",
    "cep":"80420210","logradouro":"Rua B","numero":"2","bairro":"Centro","cidade":"Curitiba","uf":"PR"}');
  insert into resultado (teste, ok) select 'cobrança: a plataforma preenche os dados de outra empresa',
    exists (select 1 from public.dados_cobranca where org_id = v_cli);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.cobranca_dados(current_setting('teste.f7')::uuid);
  insert into resultado (teste, ok) values ('cobrança: atendente não vê os dados', false);
exception when others then
  insert into resultado (teste, ok) values ('cobrança: atendente não vê os dados', sqlerrm like 'Só o dono e os administradores%');
end $$;
insert into resultado (teste, ok) select 'cobrança: atendente não lê a tabela', not exists (select 1 from public.dados_cobranca);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f9a1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'cobrança: administrador vê os dados',
  (select documento = '52998224725' from public.cobranca_dados(current_setting('teste.f7')::uuid));
do $$ begin
  perform public.cobranca_salvar_dados(current_setting('teste.f7')::uuid, '{"nome":"Outro"}');
  insert into resultado (teste, ok) values ('cobrança: administrador não muda os dados', false);
exception when others then
  insert into resultado (teste, ok) values ('cobrança: administrador não muda os dados', sqlerrm like 'Só o dono da empresa muda%');
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'cobrança: outra empresa não lê os dados da F7',
  not exists (select 1 from public.dados_cobranca where org_id = current_setting('teste.f7')::uuid);
do $$ begin
  perform public.cobranca_salvar_dados(current_setting('teste.f7')::uuid, '{"nome":"Invasor"}');
  insert into resultado (teste, ok) values ('cobrança: outra empresa não muda os dados da F7', false);
exception when others then
  insert into resultado (teste, ok) values ('cobrança: outra empresa não muda os dados da F7', sqlerrm like 'Só o dono%');
end $$;

-- Dados de cobrança: dono comum (não é da plataforma), empresa suspensa e limites (revisão de 01/11).
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare v_org uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values ('00000000-0000-0000-0000-00000000f9b1', 'dono@cobranca.teste', '{"nome":"Dono Comum"}');
  insert into public.organizacoes (nome, slug) values ('Empresa Cobrança', 'teste-cobranca') returning id into v_org;
  insert into public.membros_org (org_id, user_id, papel) values (v_org, '00000000-0000-0000-0000-00000000f9b1', 'dono');
  perform set_config('teste.cobranca', v_org::text, true);
  insert into resultado (teste, ok) select 'cobrança: visitante sem login não chama as funções',
    not has_function_privilege('anon', 'public.cobranca_dados(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.cobranca_salvar_dados(uuid, jsonb)', 'execute');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f9b1","role":"authenticated"}', true);
do $$
declare v_org uuid := current_setting('teste.cobranca')::uuid;
begin
  perform public.cobranca_salvar_dados(v_org, '{"nome":"Empresa Cobrança Ltda","documento":"11222333000181","email":"pagar@cobranca.teste",
    "telefone":"+55 (41) 98888-7777","cep":"80420210","logradouro":"Rua C","numero":"3","bairro":"Centro","cidade":"Curitiba","uf":"PR"}');
  insert into resultado (teste, ok) select 'cobrança: dono comum salva e lê os dados da própria empresa, telefone sem o 55',
    (select telefone = '41988887777' and not sugerido from public.cobranca_dados(v_org))
    and (select depois -> 'campos' ? 'documento' and not (depois::text like '%11222333000181%')
           from public.auditoria where org_id = v_org and acao = 'salvar_dados_cobranca' order by criado_em desc limit 1);
end $$;
do $$ begin
  perform public.cobranca_dados(current_setting('teste.f7')::uuid);
  insert into resultado (teste, ok) values ('cobrança: dono de outra empresa ativa não lê os dados da F7 pela função', false);
exception when others then
  insert into resultado (teste, ok) values ('cobrança: dono de outra empresa ativa não lê os dados da F7 pela função', sqlerrm like 'Só o dono e os administradores%');
end $$;
insert into resultado (teste, ok) select 'cobrança: dono de outra empresa ativa não lê a tabela da F7',
  not exists (select 1 from public.dados_cobranca where org_id = current_setting('teste.f7')::uuid);
do $$ begin
  perform public.cobranca_salvar_dados(current_setting('teste.f7')::uuid, '{"nome":"Invasor Ltda"}');
  insert into resultado (teste, ok) values ('cobrança: dono de outra empresa ativa não muda os dados da F7', false);
exception when others then
  insert into resultado (teste, ok) values ('cobrança: dono de outra empresa ativa não muda os dados da F7', sqlerrm like 'Só o dono%');
end $$;
do $$ begin
  perform public.cobranca_salvar_dados(current_setting('teste.cobranca')::uuid, '{"nome":"Empresa Cobrança Ltda","documento":"11222333000181",
    "email":"pagar@cobranca.teste","cep":"80420210","logradouro":"Rua C","numero":"S/N, bloco B, apto 1203","bairro":"Centro",
    "cidade":"Curitiba","uf":"PR"}');
  insert into resultado (teste, ok) values ('cobrança: campo acima do limite tem mensagem própria', false);
exception when others then
  insert into resultado (teste, ok) values ('cobrança: campo acima do limite tem mensagem própria', sqlerrm like 'O número tem até 20%');
end $$;
do $$ begin
  perform public.cobranca_salvar_dados(current_setting('teste.cobranca')::uuid, '{"nome":"Empresa Cobrança Ltda","documento":"11222333000181",
    "email":"pagar@cobranca.teste","cep":"80420210","logradouro":"Rua C","numero":"3","bairro":"Centro","cidade":"Curitiba","uf":"XX"}');
  insert into resultado (teste, ok) values ('cobrança: UF que não existe é recusada', false);
exception when others then
  insert into resultado (teste, ok) values ('cobrança: UF que não existe é recusada', sqlerrm like 'Informe a UF%');
end $$;

-- Empresa suspensa (atraso, na entrega 3): o dono continua vendo e corrigindo para poder pagar.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.organizacoes set status = 'suspensa' where id = current_setting('teste.cobranca')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f9b1","role":"authenticated"}', true);
do $$
declare v_org uuid := current_setting('teste.cobranca')::uuid;
begin
  perform public.cobranca_salvar_dados(v_org, '{"nome":"Empresa Cobrança Ltda","documento":"11222333000181","email":"novo@cobranca.teste",
    "cep":"80420210","logradouro":"Rua C","numero":"3","bairro":"Centro","cidade":"Curitiba","uf":"PR"}');
  insert into resultado (teste, ok) select 'cobrança: dono de empresa suspensa vê e corrige os dados',
    (select email = 'novo@cobranca.teste' from public.cobranca_dados(v_org))
    and exists (select 1 from public.dados_cobranca where org_id = v_org);
end $$;

-- Faturas (migration 20261101150000).
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.cobranca')::uuid;
  v_ant date := (date_trunc('month', now() at time zone 'America/Sao_Paulo')::date - interval '1 month')::date;
begin
  update public.organizacoes set plano = 'start', status = 'ativa' where id = v_org;
  insert into public.organizacao_modulos (org_id, modulo, ativo) values (v_org, 'erp', true);
  insert into public.atendimentos_agente (org_id, mes, excedente) select v_org, v_ant, true from generate_series(1, 3);
  insert into public.atendimentos_agente (org_id, mes, excedente) select v_org, v_ant, false from generate_series(1, 10);
  insert into public.creditos_atendimentos (org_id, mes, tipo, quantidade, valor) values (v_org, v_ant, 'pacote', 100, 29.90);

  insert into public.organizacao_modulos (org_id, modulo, ativo) values (v_org, 'os', true);
  insert into resultado (teste, ok) select 'faturas: ERP e OS juntos saem por R$ 109,80 (preço de 02/11)',
    (select count(*) = 1 and min((i ->> 'valor')::numeric) = 109.80
       from jsonb_array_elements(public.cobranca_itens(v_org, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date)) i where i ->> 'descricao' like 'Módulo%');
  delete from public.organizacao_modulos where org_id = v_org and modulo = 'os';
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.cobranca')::uuid;
  v_fat uuid;
  f public.faturas;
begin
  begin
    perform public.plataforma_definir_contrato(current_setting('teste.semplano')::uuid, true, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date, null, null);
    insert into resultado (teste, ok) values ('faturas: sem dados de cobrança não liga a cobrança', false);
  exception when others then
    insert into resultado (teste, ok) values ('faturas: sem dados de cobrança não liga a cobrança', sqlerrm like 'Salve os dados de cobrança%');
  end;
  begin
    perform public.plataforma_definir_contrato(v_org, true, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date, 50, ' ');
    insert into resultado (teste, ok) values ('faturas: valor combinado exige o motivo', false);
  exception when others then
    insert into resultado (teste, ok) values ('faturas: valor combinado exige o motivo', sqlerrm like 'Informe o valor combinado%');
  end;

  perform public.plataforma_definir_contrato(v_org, true, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date + 14, null, null);
  v_fat := public.plataforma_gerar_fatura(v_org);
  select * into f from public.faturas where id = v_fat;
  insert into resultado (teste, ok) select 'faturas: plano, módulo, excedente e pacote do mês anterior numa fatura só',
    f.valor = 99.90 + 79.90 + 1.20 + 29.90 and f.status = 'a_enviar' and jsonb_array_length(f.itens) = 4
    and f.vencimento >= f.competencia + 9 and f.competencia = date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
    and (select inicio = date_trunc('month', now() at time zone 'America/Sao_Paulo')::date from public.contratos_cobranca where org_id = v_org);

  begin
    perform public.plataforma_gerar_fatura(v_org);
    insert into resultado (teste, ok) values ('faturas: uma fatura por mês', false);
  exception when others then
    insert into resultado (teste, ok) values ('faturas: uma fatura por mês', sqlerrm like 'A fatura deste mês já existe%');
  end;

  -- Valor combinado no lugar de plano e módulos (conferido no bloco seguinte); excedente e pacote continuam.
  perform public.plataforma_definir_contrato(v_org, true, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date, 50, 'Programa Fundadores');
end $$;

-- Fechamento do mês (cron): F7, sem contrato, nunca é cobrada; quem já tem a fatura do mês não ganha outra;
-- contrato sem dados de cobrança gera a fatura em erro, para a plataforma ver.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare v_total integer;
begin
  insert into resultado (teste, ok) select 'faturas: valor combinado substitui plano e módulos',
    (select sum((i ->> 'valor')::numeric) = 50 + 1.20 + 29.90
            and bool_or(i ->> 'descricao' = 'Plano e módulos (valor combinado)')
            and not bool_or(i ->> 'descricao' = 'Plano Start')
       from jsonb_array_elements(public.cobranca_itens(current_setting('teste.cobranca')::uuid, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date)) i)
    and exists (select 1 from public.auditoria where org_id = current_setting('teste.cobranca')::uuid
                  and acao = 'definir_contrato_cobranca');
  insert into public.contratos_cobranca (org_id, ativo, inicio) values (current_setting('teste.semplano')::uuid, true, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date);
  update public.organizacoes set plano = 'essencial' where id = current_setting('teste.semplano')::uuid;
  v_total := public.cobranca_fechar_mes();
  insert into resultado (teste, ok) select 'faturas: fechamento cobra só contrato ativo, uma vez por mês',
    v_total = 1
    and not exists (select 1 from public.faturas where org_id = current_setting('teste.f7')::uuid)
    and (select count(*) = 1 from public.faturas where org_id = current_setting('teste.cobranca')::uuid);
  insert into resultado (teste, ok) select 'faturas: sem dados de cobrança a fatura fica em erro com o motivo',
    (select status = 'erro' and erro like 'Faltam os dados de cobrança%' from public.faturas
      where org_id = current_setting('teste.semplano')::uuid);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f9b1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'faturas: dono vê as faturas e o contrato da própria empresa',
  exists (select 1 from public.faturas where org_id = current_setting('teste.cobranca')::uuid)
  and exists (select 1 from public.contratos_cobranca where org_id = current_setting('teste.cobranca')::uuid)
  and not exists (select 1 from public.faturas where org_id <> current_setting('teste.cobranca')::uuid);
do $$ begin
  perform public.plataforma_gerar_fatura(current_setting('teste.cobranca')::uuid);
  insert into resultado (teste, ok) values ('faturas: cliente não gera fatura', false);
exception when others then
  insert into resultado (teste, ok) values ('faturas: cliente não gera fatura', sqlerrm like 'Só a equipe da plataforma%');
end $$;
do $$ begin
  perform public.plataforma_definir_contrato(current_setting('teste.cobranca')::uuid, false, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date, 0, 'de graça');
  insert into resultado (teste, ok) values ('faturas: cliente não muda o contrato', false);
exception when others then
  insert into resultado (teste, ok) values ('faturas: cliente não muda o contrato', sqlerrm like 'Só a equipe da plataforma%');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'faturas: atendente não vê faturas', not exists (select 1 from public.faturas);
reset role;
insert into resultado (teste, ok) select 'faturas: funções internas fechadas para o login',
  not has_function_privilege('authenticated', 'public.cobranca_fechar_mes()', 'execute')
  and not has_function_privilege('authenticated', 'public.cobranca_itens(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.cobranca_criar_fatura(uuid, date)', 'execute');

-- Faturas: cancelar, tentar de novo, reenvio diário, mínimo, início futuro e virada de ano (revisão de 01/11).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.cobranca')::uuid;
  v_fat uuid := (select id from public.faturas where org_id = current_setting('teste.cobranca')::uuid and status <> 'cancelada');
begin
  perform public.plataforma_cancelar_fatura(v_fat);
  insert into resultado (teste, ok) select 'faturas: cancelar libera o mês para uma fatura nova',
    (select status = 'cancelada' from public.faturas where id = v_fat)
    and public.plataforma_gerar_fatura(v_org) is not null
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'cancelar_fatura');
  begin
    perform public.plataforma_cancelar_fatura(v_fat);
    insert into resultado (teste, ok) values ('faturas: fatura já cancelada não se cancela de novo', false);
  exception when others then
    insert into resultado (teste, ok) values ('faturas: fatura já cancelada não se cancela de novo', sqlerrm like 'Esta fatura não pode ser cancelada%');
  end;
  begin
    perform public.plataforma_reenviar_fatura((select id from public.faturas where org_id = v_org and status = 'a_enviar'));
    insert into resultado (teste, ok) values ('faturas: só tenta de novo a fatura sem link', false);
  exception when others then
    insert into resultado (teste, ok) values ('faturas: só tenta de novo a fatura sem link', sqlerrm like 'Só dá para tentar de novo%');
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_sem uuid := current_setting('teste.semplano')::uuid;
  v_cob uuid := current_setting('teste.cobranca')::uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fat uuid;
begin
  -- Tentar de novo pela plataforma: vencimento acertado e tentativas zeradas.
  select id into v_fat from public.faturas where org_id = v_sem and status = 'erro';
  update public.faturas set vencimento = v_hoje - 5, tentativas = 5 where id = v_fat;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  perform public.plataforma_reenviar_fatura(v_fat);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into resultado (teste, ok) select 'faturas: tentar de novo acerta o vencimento e zera as tentativas',
    (select status = 'a_enviar' and tentativas = 0 and vencimento >= v_hoje + 3 from public.faturas where id = v_fat);

  -- Reenvio diário: presa em "enviando" volta; erro com contrato desligado ou 5 tentativas fica.
  update public.faturas set status = 'enviando', atualizado_em = now() - interval '2 hours' where id = v_fat;
  update public.faturas set status = 'erro', tentativas = 1, vencimento = v_hoje - 1
   where org_id = v_cob and status = 'a_enviar';
  update public.contratos_cobranca set ativo = false where org_id = v_cob;
  perform public.cobranca_reenviar();
  insert into resultado (teste, ok) select 'faturas: reenvio diário solta a presa em "enviando" e respeita o contrato desligado',
    (select status = 'a_enviar' from public.faturas where id = v_fat)
    and (select status = 'erro' from public.faturas where org_id = v_cob and status <> 'cancelada');
  update public.contratos_cobranca set ativo = true where org_id = v_cob;
  perform public.cobranca_reenviar();
  insert into resultado (teste, ok) select 'faturas: reenvio diário manda de novo com o vencimento no futuro',
    (select status = 'a_enviar' and vencimento >= v_hoje + 3 from public.faturas where org_id = v_cob and status <> 'cancelada');
  update public.faturas set status = 'erro', tentativas = 5 where org_id = v_cob and status = 'a_enviar';
  perform public.cobranca_reenviar();
  insert into resultado (teste, ok) select 'faturas: depois de 5 tentativas o reenvio diário para',
    (select status = 'erro' from public.faturas where org_id = v_cob and status <> 'cancelada');

  -- Virada de ano: a fatura de janeiro leva os atendimentos a mais de dezembro.
  insert into public.atendimentos_agente (org_id, mes, excedente) values (v_cob, '2026-12-01', true);
  insert into resultado (teste, ok) select 'faturas: janeiro cobra os atendimentos a mais de dezembro',
    exists (select 1 from jsonb_array_elements(public.cobranca_itens(v_cob, '2027-01-01')) i
             where i ->> 'descricao' = 'Atendimentos a mais do agente em 12/2026');

  -- Mínimo do Asaas: valor combinado zero e nada a mais não gera fatura.
  update public.contratos_cobranca set valor_fixo = 0, motivo_valor = 'cortesia total' where org_id = v_cob;
  insert into resultado (teste, ok) select 'faturas: valor combinado zero sem extras fica abaixo do mínimo',
    public.cobranca_criar_fatura(v_cob, '2031-06-01') is null;

  -- Início no mês seguinte: a geração manual recusa.
  update public.contratos_cobranca set inicio = (date_trunc('month', v_hoje) + interval '1 month')::date where org_id = v_sem;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  begin
    perform public.plataforma_gerar_fatura(v_sem);
    insert into resultado (teste, ok) values ('faturas: não gera fatura antes do mês de início', false);
  exception when others then
    insert into resultado (teste, ok) values ('faturas: não gera fatura antes do mês de início', sqlerrm like 'A primeira fatura desta empresa%');
  end;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Empresa suspensa não entra no fechamento.
  update public.organizacoes set status = 'suspensa' where id = v_cob;
  update public.faturas set status = 'cancelada' where org_id = v_cob;
  update public.contratos_cobranca set valor_fixo = null, motivo_valor = null where org_id = v_cob;
  perform public.cobranca_fechar_mes();
  insert into resultado (teste, ok) select 'faturas: empresa suspensa não recebe fatura nova',
    not exists (select 1 from public.faturas where org_id = v_cob and status <> 'cancelada');
end $$;

-- Dono de empresa suspensa continua vendo as faturas (para conferir e pagar).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f9b1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'faturas: dono de empresa suspensa vê as faturas',
  exists (select 1 from public.faturas where org_id = current_setting('teste.cobranca')::uuid);
reset role;
insert into resultado (teste, ok) select 'faturas: reenvio e vencimento fechados para o login',
  not has_function_privilege('authenticated', 'public.cobranca_reenviar()', 'execute')
  and not has_function_privilege('authenticated', 'public.cobranca_vencimento(date)', 'execute');

-- Pagamento e atraso: webhook do Asaas, aviso aos 3 dias, suspensão aos 10 e reativação (migration 20261102120000).
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.cobranca')::uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_comp date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_fat uuid;
  v_sb uuid;
  v_res text;
begin
  -- Avisos pelo número de teste da F7 (nada sai: tudo é desfeito no rollback).
  update public.plataforma_config set canal_alertas = (select id from public.canais where instance_id = 'INST-F7') where id = 1;
  update public.perfis set telefone = '5541999998888' where user_id = '00000000-0000-0000-0000-00000000f9b1';
  update public.organizacoes set status = 'ativa', motivo_suspensao = null where id = v_org;
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, asaas_id, ambiente, link)
  values (v_org, '2030-01-01', v_hoje - 3, '[]', 99.90, 'aberta', 'pay_teste_1', 'producao', 'https://asaas.teste/i/1')
  returning id into v_fat;
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, asaas_id, ambiente, link)
  values (v_org, '2030-02-01', v_hoje - 15, '[]', 99.90, 'aberta', 'pay_teste_sb', 'sandbox', 'https://asaas.teste/i/sb')
  returning id into v_sb;

  perform public.cobranca_atrasos();
  insert into resultado (teste, ok) select 'atraso: aos 3 dias a fatura vence e o dono recebe o aviso com o link pelo número da Livih',
    (select status = 'vencida' and aviso_atraso_em is not null and suspensao_em is null from public.faturas where id = v_fat)
    and (select count(*) = 1 from public.alertas a
          where a.telefone = '5541999998888' and a.texto like '%Fatura da Livih em atraso%'
            and a.texto like '%https://asaas.teste/i/1%'
            and a.canal_id = (select canal_alertas from public.plataforma_config where id = 1))
    and (select status = 'ativa' from public.organizacoes where id = v_org);
  perform public.cobranca_atrasos();
  insert into resultado (teste, ok) select 'atraso: o aviso de 3 dias sai uma vez só',
    (select count(*) = 1 from public.alertas a where a.telefone = '5541999998888' and a.texto like '%Fatura da Livih em atraso%');
  insert into resultado (teste, ok) select 'atraso: fatura do sandbox não avisa nem suspende',
    (select status = 'aberta' and aviso_atraso_em is null and suspensao_em is null from public.faturas where id = v_sb);

  update public.faturas set vencimento = v_hoje - 10 where id = v_fat;
  perform public.cobranca_atrasos();
  insert into resultado (teste, ok) select 'atraso: aos 10 dias a empresa é suspensa por inadimplência, com auditoria e aviso',
    (select status = 'suspensa' and motivo_suspensao = 'inadimplencia' from public.organizacoes where id = v_org)
    and (select suspensao_em is not null from public.faturas where id = v_fat)
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'suspender_por_atraso')
    and exists (select 1 from public.alertas where telefone = '5541999998888' and texto like '%Acesso à Livih suspenso%');

  v_res := public.cobranca_evento_asaas('evt_t1', 'PAYMENT_RECEIVED', '{"id":"pay_teste_1"}', 'producao');
  insert into resultado (teste, ok) select 'webhook: pagamento marca a fatura como paga e reativa a empresa suspensa por atraso',
    v_res = 'paga'
    and (select status = 'paga' and paga_em is not null from public.faturas where id = v_fat)
    and (select status = 'ativa' and motivo_suspensao is null from public.organizacoes where id = v_org)
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'reativar_apos_pagamento')
    and exists (select 1 from public.alertas where telefone = '5541999998888' and texto like '%Acesso à Livih liberado%');
  insert into resultado (teste, ok) select 'webhook: a reativação não recria a fatura do mês que foi cancelada',
    not exists (select 1 from public.faturas where org_id = v_org and competencia = v_comp and status <> 'cancelada');
  insert into resultado (teste, ok) select 'webhook: evento repetido não faz nada',
    public.cobranca_evento_asaas('evt_t1', 'PAYMENT_RECEIVED', '{"id":"pay_teste_1"}', 'producao') = 'repetido';
  -- Em comando separado: a consulta que chama a função não enxerga o que ela gravou.
  v_res := public.cobranca_evento_asaas('evt_t2', 'PAYMENT_RECEIVED', '{"id":"pay_outro"}', 'producao');
  insert into resultado (teste, ok) select 'webhook: pagamento que não é de fatura da Livih só é registrado',
    v_res = 'desconhecido'
    and exists (select 1 from public.asaas_eventos where id = 'producao:evt_t2' and fatura_id is null);
  insert into resultado (teste, ok) select 'webhook: aviso de vencida atrasado não desfaz a fatura paga',
    public.cobranca_evento_asaas('evt_t3', 'PAYMENT_OVERDUE', '{"id":"pay_teste_1"}', 'producao') = 'sem mudança'
    and (select status = 'paga' from public.faturas where id = v_fat);
  insert into resultado (teste, ok) select 'webhook: estorno marca a fatura como estornada',
    public.cobranca_evento_asaas('evt_t4', 'PAYMENT_REFUNDED', '{"id":"pay_teste_1"}', 'producao') = 'estornada';
  insert into resultado (teste, ok) select 'webhook: vale também no sandbox',
    public.cobranca_evento_asaas('evt_t5', 'PAYMENT_OVERDUE', '{"id":"pay_teste_sb"}', 'sandbox') = 'vencida';

  -- Suspensa no dia 1, o fechamento pulou o mês: o vencimento novo dado no Asaas reativa e cria a fatura do mês.
  delete from public.faturas where org_id = v_org and competencia = v_comp;
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, asaas_id, ambiente, link)
  values (v_org, '2030-03-01', v_hoje - 12, '[]', 99.90, 'aberta', 'pay_teste_3', 'producao', 'https://asaas.teste/i/3')
  returning id into v_fat;
  perform public.cobranca_atrasos();
  insert into resultado (teste, ok) select 'atraso: com o cron atrasado, a fatura passada dos 10 dias suspende direto',
    (select status = 'suspensa' from public.organizacoes where id = v_org)
    and (select aviso_atraso_em is not null and suspensao_em is not null from public.faturas where id = v_fat);
  v_res := public.cobranca_evento_asaas('evt_t6', 'PAYMENT_UPDATED',
    jsonb_build_object('id', 'pay_teste_3', 'dueDate', to_char(v_hoje + 5, 'YYYY-MM-DD')), 'producao');
  insert into resultado (teste, ok) select 'webhook: vencimento novo no Asaas zera o atraso, reativa e cria a fatura do mês pulado',
    (select status = 'aberta' and vencimento = v_hoje + 5 and aviso_atraso_em is null and suspensao_em is null
       from public.faturas where id = v_fat)
    and (select status = 'ativa' from public.organizacoes where id = v_org)
    and exists (select 1 from public.faturas where org_id = v_org and competencia = v_comp and status = 'a_enviar');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare v_org uuid := current_setting('teste.cobranca')::uuid;
begin
  perform public.plataforma_definir_status(v_org, 'suspensa');
  insert into resultado (teste, ok) select 'plataforma: suspensão pela tela fica com o motivo e aparece na lista',
    (select status = 'suspensa' and motivo_suspensao = 'plataforma' from public.plataforma_empresas() where id = v_org);
  begin
    perform public.plataforma_cancelar_fatura((select id from public.faturas where asaas_id = 'pay_teste_1'));
    insert into resultado (teste, ok) values ('faturas: fatura estornada não se cancela', false);
  exception when others then
    insert into resultado (teste, ok) values ('faturas: fatura estornada não se cancela', sqlerrm like 'Esta fatura não pode ser cancelada%');
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.cobranca')::uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into resultado (teste, ok) select 'webhook: pagamento não reativa o que a plataforma suspendeu',
    public.cobranca_evento_asaas('evt_t7', 'PAYMENT_RECEIVED', '{"id":"pay_teste_3"}', 'producao') = 'paga'
    and (select status = 'suspensa' and motivo_suspensao = 'plataforma' from public.organizacoes where id = v_org);

  -- Suspensa por atraso e reativada à mão pela plataforma: a mesma fatura não suspende de novo.
  update public.organizacoes set status = 'ativa', motivo_suspensao = null where id = v_org;
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, asaas_id, ambiente, link)
  values (v_org, '2030-04-01', v_hoje - 11, '[]', 99.90, 'vencida', 'pay_teste_4', 'producao', 'https://asaas.teste/i/4');
  perform public.cobranca_atrasos();
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  perform public.plataforma_definir_status(v_org, 'ativa');
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.cobranca_atrasos();
  insert into resultado (teste, ok) select 'atraso: reativada pela plataforma, a mesma fatura não suspende de novo',
    (select status = 'ativa' and motivo_suspensao is null from public.organizacoes where id = v_org)
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'suspender_por_atraso'
                  and depois ->> 'fatura' = (select id::text from public.faturas where asaas_id = 'pay_teste_4'));
end $$;

-- Revisão de 02/11: pagamento antes de a cobrança ser gravada, ambiente, suspensão pela plataforma, eventos menos
-- comuns e destinatários dos avisos.
do $$
declare
  v_org uuid := current_setting('teste.cobranca')::uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fat uuid;
  v_res text;
begin
  -- A fatura em atraso do bloco anterior (reativada à mão) sai do caminho: senão ela segura a suspensão.
  update public.faturas set status = 'cancelada' where asaas_id = 'pay_teste_4';
  update public.organizacoes set status = 'ativa', motivo_suspensao = null where id = v_org;

  -- Pago antes de a asaas-cobranca gravar o id da cobrança: acha a fatura pela referência.
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status)
  values (v_org, '2030-05-01', v_hoje + 5, '[]', 99.90, 'enviando') returning id into v_fat;
  v_res := public.cobranca_evento_asaas('evt_t8', 'PAYMENT_CONFIRMED',
    jsonb_build_object('id', 'pay_teste_5', 'externalReference', v_fat::text), 'producao');
  insert into resultado (teste, ok) select 'webhook: pago antes de a Livih gravar a cobrança, acha a fatura pela referência',
    v_res = 'paga'
    and (select status = 'paga' and asaas_id = 'pay_teste_5' and ambiente = 'producao' from public.faturas where id = v_fat);
  insert into resultado (teste, ok) select 'webhook: cartão confirmado e depois recebido conta uma vez só',
    public.cobranca_evento_asaas('evt_t9', 'PAYMENT_RECEIVED', '{"id":"pay_teste_5"}', 'producao') = 'sem mudança';
  v_res := public.cobranca_evento_asaas('evt_t10', 'PAYMENT_REFUNDED', '{"id":"pay_teste_5"}', 'sandbox');
  insert into resultado (teste, ok) select 'webhook: evento do sandbox não mexe em fatura de produção',
    v_res = 'desconhecido' and (select status = 'paga' from public.faturas where id = v_fat);
  insert into resultado (teste, ok) select 'webhook: referência que não é de fatura (outra cobrança da F7) só é registrada',
    public.cobranca_evento_asaas('evt_t11', 'PAYMENT_RECEIVED', '{"id":"pay_x","externalReference":"pedido-123"}', 'producao') = 'desconhecido';
  update public.faturas set status = 'cancelada' where id = v_fat;
  insert into resultado (teste, ok) select 'webhook: pagamento de fatura cancelada não muda a fatura e avisa a plataforma',
    public.cobranca_evento_asaas('evt_t12', 'PAYMENT_RECEIVED', '{"id":"pay_teste_5"}', 'producao') = 'pagamento de fatura cancelada';

  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, asaas_id, ambiente, link)
  values (v_org, '2030-06-01', v_hoje + 5, '[]', 99.90, 'a_cancelar', 'pay_teste_6', 'producao', 'https://asaas.teste/i/6');
  insert into resultado (teste, ok) select 'webhook: pago antes de a cobrança ser apagada fica paga',
    public.cobranca_evento_asaas('evt_t13', 'PAYMENT_RECEIVED', '{"id":"pay_teste_6"}', 'producao') = 'paga';

  -- Suspensa pela plataforma quando a fatura chega a 10 dias: fica sem a marca; reativada à mão, suspende por atraso.
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, asaas_id, ambiente, link)
  values (v_org, '2030-07-01', v_hoje - 10, '[]', 99.90, 'vencida', 'pay_teste_7', 'producao', 'https://asaas.teste/i/7')
  returning id into v_fat;
  update public.organizacoes set status = 'suspensa', motivo_suspensao = 'plataforma' where id = v_org;
  perform public.cobranca_atrasos();
  insert into resultado (teste, ok) select 'atraso: empresa suspensa pela plataforma não marca a fatura',
    (select suspensao_em is null from public.faturas where id = v_fat)
    and (select motivo_suspensao = 'plataforma' from public.organizacoes where id = v_org);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  perform public.plataforma_definir_status(v_org, 'ativa');
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.cobranca_atrasos();
  insert into resultado (teste, ok) select 'atraso: reativada à mão, a fatura em atraso suspende por inadimplência',
    (select status = 'suspensa' and motivo_suspensao = 'inadimplencia' from public.organizacoes where id = v_org)
    and (select suspensao_em is not null from public.faturas where id = v_fat);

  -- Duas faturas com 10 dias: pagar uma não reativa; apagar a outra no Asaas reativa.
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, asaas_id, ambiente, link)
  values (v_org, '2030-08-01', v_hoje - 10, '[]', 99.90, 'vencida', 'pay_teste_8', 'producao', 'https://asaas.teste/i/8');
  perform public.cobranca_atrasos();
  v_res := public.cobranca_evento_asaas('evt_t14', 'PAYMENT_RECEIVED', '{"id":"pay_teste_7"}', 'producao');
  insert into resultado (teste, ok) select 'webhook: com duas faturas em atraso, pagar uma não reativa',
    v_res = 'paga' and (select status = 'suspensa' from public.organizacoes where id = v_org);
  v_res := public.cobranca_evento_asaas('evt_t15', 'PAYMENT_DELETED', '{"id":"pay_teste_8"}', 'producao');
  insert into resultado (teste, ok) select 'webhook: cobrança apagada no Asaas cancela a fatura e reativa a empresa',
    v_res = 'cancelada' and (select status = 'ativa' from public.organizacoes where id = v_org);

  -- Pagamento desfeito no Asaas: volta a dever e o atraso conta de novo.
  v_res := public.cobranca_evento_asaas('evt_t16', 'PAYMENT_RECEIVED_IN_CASH_UNDONE', '{"id":"pay_teste_7"}', 'producao');
  insert into resultado (teste, ok) select 'webhook: pagamento desfeito volta a dever e zera o atraso',
    v_res = 'pagamento desfeito'
    and (select status = 'vencida' and paga_em is null and aviso_atraso_em is null and suspensao_em is null
           from public.faturas where id = v_fat);

  -- Restaurar a cobrança apagada com outra fatura no mês: não restaura e avisa a plataforma.
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, asaas_id, ambiente, link)
  values (v_org, '2030-08-01', v_hoje + 5, '[]', 99.90, 'aberta', 'pay_teste_9', 'producao', 'https://asaas.teste/i/9');
  insert into resultado (teste, ok) select 'webhook: cobrança restaurada com outra fatura no mês não volta',
    public.cobranca_evento_asaas('evt_t17', 'PAYMENT_RESTORED', '{"id":"pay_teste_8"}', 'producao')
      = 'não restaurada: o mês já tem outra fatura';

  -- Destinatários: o atendente da empresa não recebe o aviso; o alerta fica na empresa cobrada, não na F7.
  insert into public.membros_org (org_id, user_id, papel) values (v_org, '00000000-0000-0000-0000-0000000000b1', 'atendente')
  on conflict do nothing;
  update public.perfis set telefone = '5541977776666' where user_id = '00000000-0000-0000-0000-0000000000b1';
  perform public.cobranca_atrasos();
  insert into resultado (teste, ok) select 'atraso: aviso só ao dono e aos administradores, gravado na empresa cobrada',
    (select status = 'suspensa' from public.organizacoes where id = v_org)
    and not exists (select 1 from public.alertas where telefone = '5541977776666')
    and not exists (select 1 from public.alertas where texto like '%Livih · Cobrança%' and org_id <> v_org);
end $$;

insert into resultado (teste, ok) select 'pagamento e atraso: funções internas e eventos fechados para o login',
  not has_function_privilege('authenticated', 'public.cobranca_evento_asaas(text, text, jsonb, text)', 'execute')
  and not has_function_privilege('anon', 'public.cobranca_evento_asaas(text, text, jsonb, text)', 'execute')
  and has_function_privilege('service_role', 'public.cobranca_evento_asaas(text, text, jsonb, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.cobranca_atrasos()', 'execute')
  and not has_function_privilege('authenticated', 'public.cobranca_reativar(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.cobranca_fatura_mes_pulado(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.cobranca_avisar(uuid, text, text, text, text, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.cobranca_avisar_plataforma(uuid, text)', 'execute')
  and not has_table_privilege('authenticated', 'public.asaas_eventos', 'select')
  and not has_column_privilege('authenticated', 'public.organizacoes', 'motivo_suspensao', 'update');

-- CNPJ alfanumérico (migration 20261102130000). Exemplo oficial da Receita: 12.ABC.345/01DE-35.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.cobranca')::uuid;
  v_cli uuid;
  r record;
begin
  insert into resultado (teste, ok) select 'cnpj alfanumérico: o exemplo da Receita é válido e o numérico continua valendo',
    public.cnpj_valido('12ABC34501DE35') and public.cnpj_valido('11222333000181');
  insert into resultado (teste, ok) select 'cnpj alfanumérico: dígito errado, minúscula e repetido são recusados',
    not public.cnpj_valido('12ABC34501DE36') and not public.cnpj_valido('12abc34501de35')
    and not public.cnpj_valido('AAAAAAAAAAAA00') and not public.cnpj_valido('00000000000000')
    and not public.cnpj_valido('12ABC34501DEX5');
  insert into resultado (teste, ok) select 'cnpj alfanumérico: a limpeza tira a pontuação e põe em maiúsculas',
    public.limpar_documento(' 12.abc.345/01de-35 ') = '12ABC34501DE35' and public.limpar_documento('  ') is null
    and public.limpar_documento('123.456.789-09') = '12345678909';

  insert into public.clientes (org_id, tipo, nome, documento)
  values (v_org, 'pj', 'Cliente Alfanumérico', '12.abc.345/01de-35') returning id into v_cli;
  insert into resultado (teste, ok) select 'cnpj alfanumérico: cliente salva com letras, sem pontuação',
    (select documento = '12ABC34501DE35' from public.clientes where id = v_cli);

  select * into r from public.documento_cliente('12.ABC.345/01DE-35');
  insert into resultado (teste, ok) select 'cnpj alfanumérico: o agente reconhece o CNPJ com letras',
    r.tipo = 'pj' and r.documento = '12ABC34501DE35';
  select * into r from public.documento_cliente('meu CNPJ é 11.222.333/0001-81');
  insert into resultado (teste, ok) select 'cnpj alfanumérico: frase com o CNPJ numérico continua funcionando no agente',
    r.tipo = 'pj' and r.documento = '11222333000181';

  begin
    insert into public.notas_entrada (org_id, origem, chave, emitente_cnpj)
    -- UF, ano e mês, CNPJ do emitente, modelo, série, número, tipo de emissão, código e dígito: 44 caracteres.
    values (v_org, 'xml', '41' || '2611' || '12ABC34501DE35' || '55' || '001' || '000000001' || '1' || '00000001' || '0',
            '12ABC34501DE35');
    insert into resultado (teste, ok) values ('cnpj alfanumérico: nota de entrada aceita chave e emitente com letras', true);
  exception when others then
    insert into resultado (teste, ok) values ('cnpj alfanumérico: nota de entrada aceita chave e emitente com letras: ' || sqlerrm, false);
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000f9b1","role":"authenticated"}', true);
do $$
declare v_org uuid := current_setting('teste.cobranca')::uuid;
begin
  perform public.cobranca_salvar_dados(v_org, '{"nome":"Empresa Alfa Ltda","documento":"12.abc.345/01de-35","email":"alfa@cobranca.teste",
    "cep":"80420210","logradouro":"Rua A","numero":"1","bairro":"Centro","cidade":"Curitiba","uf":"PR"}');
  insert into resultado (teste, ok) select 'cnpj alfanumérico: dados de cobrança salvam com letras',
    (select documento = '12ABC34501DE35' from public.dados_cobranca where org_id = v_org);
  begin
    perform public.cobranca_salvar_dados(v_org, '{"nome":"Empresa Alfa Ltda","documento":"12.ABC.345/01DE-36","email":"alfa@cobranca.teste",
      "cep":"80420210","logradouro":"Rua A","numero":"1","bairro":"Centro","cidade":"Curitiba","uf":"PR"}');
    insert into resultado (teste, ok) values ('cnpj alfanumérico: dígito errado nos dados de cobrança é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('cnpj alfanumérico: dígito errado nos dados de cobrança é recusado', sqlerrm like 'CNPJ ou CPF inválido%');
  end;
end $$;
-- Importação de clientes (pela equipe da plataforma, que passa no tem_papel): acha e grava com letras.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare v_res jsonb;
begin
  v_res := public.clientes_importar(current_setting('teste.cli')::uuid,
    '[{"documento":"12.abc.345/01de-35","nome":"Cliente Alfanumérico"},{"documento":"12.ABC.345/01DE-35","nome":"Mesmo cliente"}]'::jsonb);
  insert into resultado (teste, ok) select 'cnpj alfanumérico: importação de clientes grava com letras e acha o mesmo cliente',
    (select count(*) = 1 from public.clientes where org_id = current_setting('teste.cli')::uuid and documento = '12ABC34501DE35');
end $$;
reset role;
insert into resultado (teste, ok) select 'cnpj alfanumérico: limpeza fechada para o anon',
  not has_function_privilege('anon', 'public.limpar_documento(text)', 'execute');

-- Troca de plano pelo dono, descida agendada, ajuste na fatura e limite de números (migration 20261102140000).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare v_org uuid;
begin
  v_org := public.criar_organizacao('Plano Teste', 'teste-plano');
  perform set_config('teste.plano', v_org::text, true);
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare v_org uuid := current_setting('teste.plano')::uuid;
begin
  insert into public.membros_org (org_id, user_id, papel) values (v_org, '00000000-0000-0000-0000-0000000000b1', 'atendente')
  on conflict do nothing;
  update public.organizacoes set plano = 'start' where id = v_org;
  insert into public.organizacao_modulos (org_id, modulo, ativo) values (v_org, 'erp', true);
  insert into resultado (teste, ok) select 'planos: ERP sozinho sai por R$ 79,90',
    exists (select 1 from jsonb_array_elements(public.cobranca_itens(v_org, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date)) i
             where i ->> 'descricao' like 'Módulo%' and (i ->> 'valor')::numeric = 79.90);
  delete from public.organizacao_modulos where org_id = v_org;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  perform public.plano_trocar(current_setting('teste.plano')::uuid, 'pro', true);
  insert into resultado (teste, ok) values ('planos: sem cobrança ligada o dono não troca o plano', false);
exception when others then
  insert into resultado (teste, ok) values ('planos: sem cobrança ligada o dono não troca o plano', sqlerrm like 'Para escolher ou trocar o plano%');
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.contratos_cobranca (org_id, ativo, inicio) values (current_setting('teste.plano')::uuid, true, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date);

-- Sem a fatura do mês (ela ainda vai sair, já com o plano novo): sem ajuste e com a franquia cheia.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into resultado (teste, ok) select 'planos: sem a fatura do mês, subir não gera ajuste e dá a franquia cheia',
  (r ->> 'valor')::numeric = 0 and (r ->> 'limite_mes')::int = 500
  from (select public.plano_trocar(current_setting('teste.plano')::uuid, 'pro') r) x;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, ambiente)
values (current_setting('teste.plano')::uuid, date_trunc('month', now() at time zone 'America/Sao_Paulo')::date,
        date_trunc('month', now() at time zone 'America/Sao_Paulo')::date + 9, '[]', 99.90, 'aberta', 'sandbox');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.plano')::uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_prox date := (date_trunc('month', now() at time zone 'America/Sao_Paulo')::date + interval '1 month')::date;
  v_esperado numeric := round(50 * (v_prox - v_hoje)::numeric / (v_prox - date_trunc('month', now() at time zone 'America/Sao_Paulo')::date), 2);
  -- Start (350) → Pro (500): os 150 a mais na proporção dos dias que faltam.
  v_extra integer := floor(150 * (v_prox - v_hoje)::numeric / (v_prox - date_trunc('month', now() at time zone 'America/Sao_Paulo')::date));
  r jsonb;
begin
  r := public.plano_trocar(v_org, 'pro');
  insert into resultado (teste, ok) select 'planos: prévia de subir mostra o ajuste proporcional e não troca nada',
    r ->> 'tipo' = 'subir' and (r ->> 'valor')::numeric = v_esperado and (r ->> 'limite_mes')::int = 350 + v_extra
    and (select plano = 'start' from public.organizacoes where id = v_org)
    and not exists (select 1 from public.cobranca_ajustes where org_id = v_org);
  r := public.plano_trocar(v_org, 'pro', true);
  insert into resultado (teste, ok) select 'planos: subir vale na hora e o ajuste entra na fatura do mês seguinte',
    (select plano = 'pro' from public.organizacoes where id = v_org)
    and (select count(*) = 1 and sum(valor) = v_esperado from public.cobranca_ajustes where org_id = v_org)
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'trocar_plano');
  insert into resultado (teste, ok) select 'planos: subir no meio do mês dá a franquia a mais proporcional aos dias',
    (select limite = 350 + v_extra and reducao_troca = 150 - v_extra from public.plano_consumo(v_org));
  insert into resultado (teste, ok) select 'planos: clique duplo não cobra o ajuste duas vezes',
    public.plano_trocar(v_org, 'pro', true) ->> 'tipo' = 'igual'
    and (select count(*) = 1 from public.cobranca_ajustes where org_id = v_org);
end $$;

-- Números: com 2 conectados, descer ao Essencial (1) é recusado; removido um, a descida fica para o dia 1.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into resultado (teste, ok) select 'planos: o ajuste aparece nos itens da fatura do mês seguinte',
  exists (select 1 from jsonb_array_elements(public.cobranca_itens(current_setting('teste.plano')::uuid,
            (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')::date)) i
           where i ->> 'descricao' like 'Diferença do plano Pro de%'
             and (i ->> 'valor')::numeric = (select sum(valor) from public.cobranca_ajustes where org_id = current_setting('teste.plano')::uuid));
insert into public.canais (org_id, nome, telefone, instance_id) values
  (current_setting('teste.plano')::uuid, 'Número 1', '5541999990101', 'INST-PLANO-1'),
  (current_setting('teste.plano')::uuid, 'Número 2', '5541999990102', 'INST-PLANO-2');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.plano')::uuid;
  r jsonb;
begin
  begin
    perform public.plano_trocar(v_org, 'essencial', true);
    insert into resultado (teste, ok) values ('planos: descer com números demais é recusado com quantos remover', false);
  exception when others then
    insert into resultado (teste, ok) values ('planos: descer com números demais é recusado com quantos remover',
      sqlerrm like 'O plano Essencial permite 1 número de WhatsApp, e a empresa tem 2 números em Configurações → WhatsApp. Para trocar, remova 1 número lá%');
  end;
  r := public.plano_trocar(v_org, 'start', true);
  insert into resultado (teste, ok) select 'planos: descer fica agendado para o dia 1, sem ajuste',
    r ->> 'tipo' = 'descer' and (r ->> 'vale_em')::date = (date_trunc('month', now() at time zone 'America/Sao_Paulo')::date + interval '1 month')::date
    and (select plano = 'pro' and plano_proximo = 'start' from public.organizacoes where id = v_org)
    and (select count(*) = 1 from public.cobranca_ajustes where org_id = v_org);
end $$;

-- Com a descida agendada para o Start (2), o terceiro número já é recusado, embora o Pro permita 3.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare v_org uuid := current_setting('teste.plano')::uuid;
begin
  begin
    insert into public.canais (org_id, nome, telefone, instance_id) values (v_org, 'Número 3', '5541999990103', 'INST-PLANO-3');
    insert into resultado (teste, ok) values ('planos: limite de números vale o menor com a descida agendada', false);
  exception when others then
    insert into resultado (teste, ok) values ('planos: limite de números vale o menor com a descida agendada',
      sqlerrm like 'O plano Start, que começa em %, permite 2 números de WhatsApp, e a empresa já tem 2.%');
  end;
  -- No mesmo mês (ex.: pedida no dia 1 antes do cron das 00:05), a descida não vale: só no mês marcado.
  perform public.planos_aplicar_agendados();
  insert into resultado (teste, ok) select 'planos: descida pedida no mês não vale antes do mês marcado',
    (select plano = 'pro' and plano_proximo = 'start' from public.organizacoes where id = v_org);
  update public.organizacoes set plano_proximo_em = date_trunc('month', now() at time zone 'America/Sao_Paulo')::date where id = v_org;
  perform set_config('teste.aplicados', public.planos_aplicar_agendados()::text, true);
  insert into resultado (teste, ok) select 'planos: descida agendada vale no dia 1',
    current_setting('teste.aplicados')::int >= 1
    and (select plano = 'start' and plano_proximo is null from public.organizacoes where id = v_org)
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'aplicar_troca_plano');
  -- Removido um número, dá para descer ao Essencial; escolher de novo o plano atual desfaz a troca.
  update public.canais set ativo = false where instance_id = 'INST-PLANO-2';
  update public.organizacoes set plano = 'essencial' where id = v_org;
  update public.canais set nome = 'Número 1 (oficial)' where instance_id = 'INST-PLANO-1';
  insert into resultado (teste, ok) select 'planos: no limite, mudar outros dados do número continua funcionando',
    exists (select 1 from public.canais where instance_id = 'INST-PLANO-1' and nome = 'Número 1 (oficial)')
    and public.canais_sem_vaga(v_org) like 'O plano Essencial permite 1 número de WhatsApp, e a empresa já tem 1.%';
  begin
    update public.canais set ativo = true where instance_id = 'INST-PLANO-2';
    insert into resultado (teste, ok) values ('planos: religar um número acima do limite é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('planos: religar um número acima do limite é recusado', sqlerrm like 'O plano Essencial permite%');
  end;
  update public.organizacoes set plano = 'start' where id = v_org;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare v_org uuid := current_setting('teste.plano')::uuid;
begin
  perform public.plano_trocar(v_org, 'essencial', true);
  perform set_config('teste.troca', public.plano_trocar(v_org, 'start', true) ->> 'tipo', true);
  insert into resultado (teste, ok) select 'planos: escolher o plano atual desfaz a descida agendada',
    current_setting('teste.troca') = 'cancelar'
    and (select plano = 'start' and plano_proximo is null from public.organizacoes where id = v_org);
  perform public.plano_trocar(v_org, 'essencial', true);
  perform public.plataforma_definir_plano(v_org, 'business');
  insert into resultado (teste, ok) select 'planos: a troca pela plataforma desfaz a descida agendada',
    (select plano = 'business' and plano_proximo is null from public.organizacoes where id = v_org);
  insert into resultado (teste, ok) select 'planos: situação lista os planos sem o interno',
    (select jsonb_array_length(public.plano_troca_situacao(v_org) -> 'planos') = 4)
    and (public.plano_troca_situacao(v_org) ->> 'pode_trocar')::boolean;
end $$;

-- Teste grátis (cobrança começa no mês seguinte): sobe sem ajuste. Valor combinado: só a equipe troca.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.contratos_cobranca set inicio = (date_trunc('month', now() at time zone 'America/Sao_Paulo')::date + interval '1 month')::date
 where org_id = current_setting('teste.plano')::uuid;
update public.organizacoes set plano = 'essencial' where id = current_setting('teste.plano')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare v_org uuid := current_setting('teste.plano')::uuid;
begin
  insert into resultado (teste, ok) select 'planos: no teste grátis subir não gera ajuste',
    (public.plano_trocar(v_org, 'pro', true) ->> 'valor')::numeric = 0
    and (select count(*) = 1 from public.cobranca_ajustes where org_id = v_org);
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.contratos_cobranca set valor_fixo = 50, motivo_valor = 'acordo' where org_id = current_setting('teste.plano')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  perform public.plano_trocar(current_setting('teste.plano')::uuid, 'business', true);
  insert into resultado (teste, ok) values ('planos: com valor combinado só a equipe troca', false);
exception when others then
  insert into resultado (teste, ok) values ('planos: com valor combinado só a equipe troca', sqlerrm like 'O plano da sua empresa tem um valor combinado%');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.plano_trocar(current_setting('teste.plano')::uuid, 'business', true);
  insert into resultado (teste, ok) values ('planos: atendente não troca o plano', false);
exception when others then
  insert into resultado (teste, ok) values ('planos: atendente não troca o plano', sqlerrm like 'Só o dono%');
end $$;
insert into resultado (teste, ok) select 'planos: atendente não vê os ajustes', not exists (select 1 from public.cobranca_ajustes);
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a2', 'suporte@teste.livih');
insert into public.admins_plataforma (user_id) values ('00000000-0000-0000-0000-0000000000a2');
update public.contratos_cobranca set valor_fixo = null, motivo_valor = null where org_id = current_setting('teste.plano')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$ begin
  insert into resultado (teste, ok) select 'planos: no modo suporte a equipe vê a situação, mas não como dona',
    not (public.plano_troca_situacao(current_setting('teste.plano')::uuid) ->> 'eh_dono')::boolean;
  perform public.plano_trocar(current_setting('teste.plano')::uuid, 'business', true);
  insert into resultado (teste, ok) values ('planos: no modo suporte a equipe não troca pela tela do cliente', false);
exception when others then
  insert into resultado (teste, ok) values ('planos: no modo suporte a equipe não troca pela tela do cliente', sqlerrm like 'Só o dono%');
end $$;
reset role;
insert into resultado (teste, ok) select 'planos: nota fiscal só com ERP ou OS ligados',
  not public.nota_fiscal_liberada(current_setting('teste.plano')::uuid)
  and public.nota_fiscal_liberada((select id from public.organizacoes where slug = 'teste-f7'))
  = (public.modulo_ativo((select id from public.organizacoes where slug = 'teste-f7'), 'erp')
     or public.modulo_ativo((select id from public.organizacoes where slug = 'teste-f7'), 'os'));
insert into public.organizacao_modulos (org_id, modulo, ativo) values (current_setting('teste.plano')::uuid, 'os', true);
insert into resultado (teste, ok) select 'planos: com as OS ligadas a nota fiscal é liberada',
  public.nota_fiscal_liberada(current_setting('teste.plano')::uuid);
insert into resultado (teste, ok) select 'planos: aplicação das descidas fechada para o login',
  not has_function_privilege('authenticated', 'public.planos_aplicar_agendados()', 'execute')
  and not has_function_privilege('authenticated', 'public.canais_sem_vaga(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.plano_trocar(uuid, text, boolean)', 'execute');
-- Plano anual e módulos pelo dono (migration 20261102150000).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare v_org uuid;
begin
  v_org := public.criar_organizacao('Anual Teste', 'teste-anual');
  perform set_config('teste.anual', v_org::text, true);
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.anual')::uuid;
  v_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
begin
  update public.organizacoes set plano = 'start' where id = v_org;
  insert into public.contratos_cobranca (org_id, ativo, inicio) values (v_org, true, v_mes);
  -- A fatura deste mês já saiu: ligar um módulo gera a diferença dos dias que faltam.
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, ambiente)
  values (v_org, v_mes, v_mes + 9, '[]', 99.90, 'aberta', 'sandbox');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.anual')::uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_prox date := (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')::date;
  r jsonb;
begin
  r := public.modulo_contratar(v_org, 'erp', true);
  insert into resultado (teste, ok) select 'módulos: prévia de ligar o ERP mostra a diferença dos dias e não liga nada',
    r ->> 'tipo' = 'ligar' and (r ->> 'diferenca')::numeric = 79.90
    and (r ->> 'valor')::numeric = round(79.90 * (v_prox - v_hoje) / (v_prox - v_mes), 2)
    and not public.modulo_ativo(v_org, 'erp');
  r := public.modulo_contratar(v_org, 'erp', true, true);
  insert into resultado (teste, ok) select 'módulos: o dono liga o ERP na hora e a diferença vai para a próxima fatura',
    public.modulo_ativo(v_org, 'erp')
    and (select count(*) = 1 and sum(valor) = (r ->> 'valor')::numeric from public.cobranca_ajustes where org_id = v_org)
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'contratar_modulo');
  r := public.modulo_contratar(v_org, 'os', true);
  insert into resultado (teste, ok) select 'módulos: com o ERP ligado, as OS custam só R$ 29,90 a mais',
    (r ->> 'diferenca')::numeric = 29.90 and (r ->> 'total_modulos')::numeric = 109.80;
  perform public.modulo_contratar(v_org, 'os', true, true);
  begin
    perform public.plano_trocar(v_org, 'essencial', true);
    insert into resultado (teste, ok) values ('módulos: descer ao Essencial com módulos ligados é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('módulos: descer ao Essencial com módulos ligados é recusado',
      sqlerrm like 'O plano Essencial não inclui ERP nem Ordens de serviço. Para descer, desligue antes estes módulos aqui em Plano e consumo: Pedidos e estoque (ERP) e Ordens de serviço%');
  end;
  r := public.modulo_contratar(v_org, 'os', false, true);
  insert into resultado (teste, ok) select 'módulos: desligar fica para o dia 1 seguinte e o módulo continua até lá',
    r ->> 'tipo' = 'desligar' and (r ->> 'vale_em')::date = v_prox and not (r ->> 'sem_nota')::boolean
    and public.modulo_ativo(v_org, 'os')
    and exists (select 1 from jsonb_array_elements(public.plano_troca_situacao(v_org) -> 'modulos') m
                 where m ->> 'codigo' = 'os' and (m ->> 'desliga_em')::date = v_prox);
  r := public.modulo_contratar(v_org, 'os', true, true);
  insert into resultado (teste, ok) select 'módulos: ligar de novo desfaz o desligamento sem cobrar outra vez',
    r ->> 'tipo' = 'manter'
    and exists (select 1 from jsonb_array_elements(public.plano_troca_situacao(v_org) -> 'modulos') m
                 where m ->> 'codigo' = 'os' and m ->> 'desliga_em' is null)
    and (select count(*) = 2 from public.cobranca_ajustes where org_id = v_org);
  perform public.modulo_contratar(v_org, 'erp', false, true);
  r := public.modulo_contratar(v_org, 'os', false, true);
  insert into resultado (teste, ok) select 'módulos: desligar o último módulo de nota avisa que a nota fiscal some',
    (r ->> 'sem_nota')::boolean;
  r := public.plano_trocar(v_org, 'essencial', true);
  insert into resultado (teste, ok) select 'módulos: com os módulos desligando no dia 1, dá para descer ao Essencial',
    r ->> 'tipo' = 'descer' and (r ->> 'vale_em')::date = v_prox;
  insert into resultado (teste, ok) select 'módulos: situação lista os módulos pagos com o desligamento agendado',
    jsonb_array_length(public.plano_troca_situacao(v_org) -> 'modulos') = 2
    and (public.plano_troca_situacao(v_org) -> 'juntos' ->> 'anual')::numeric = 1098
    and exists (select 1 from jsonb_array_elements(public.plano_troca_situacao(v_org) -> 'modulos') m
                 where m ->> 'codigo' = 'os' and (m ->> 'desliga_em')::date = v_prox);
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.anual')::uuid;
  v_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into resultado (teste, ok) select 'módulos: ERP e OS juntos saem por R$ 109,80 na fatura seguinte',
    exists (select 1 from jsonb_array_elements(public.cobranca_itens(v_org, (v_mes + interval '1 month')::date)) i
             where i ->> 'descricao' = 'Módulos Pedidos e estoque (ERP) e Ordens de serviço' and (i ->> 'valor')::numeric = 109.80);
  update public.organizacao_modulos set desliga_em = v_mes where org_id = v_org;
  update public.organizacoes set plano_proximo_em = v_mes where id = v_org;
  perform public.planos_aplicar_agendados();
  insert into resultado (teste, ok) select 'módulos: no dia marcado os módulos desligam antes da descida ao Essencial',
    not public.modulo_ativo(v_org, 'erp') and not public.modulo_ativo(v_org, 'os')
    and (select plano = 'essencial' from public.organizacoes where id = v_org)
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'aplicar_desligar_modulo');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  perform public.modulo_contratar(current_setting('teste.anual')::uuid, 'erp', true, true);
  insert into resultado (teste, ok) values ('módulos: o Essencial não contrata módulo', false);
exception when others then
  insert into resultado (teste, ok) values ('módulos: o Essencial não contrata módulo', sqlerrm like 'O plano Essencial não inclui ERP nem Ordens de serviço. Para contratar, suba para o Start%');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
do $$ begin
  perform public.modulo_contratar(current_setting('teste.anual')::uuid, 'erp', true, true);
  insert into resultado (teste, ok) values ('módulos: no modo suporte a equipe não contrata pela tela do cliente', false);
exception when others then
  insert into resultado (teste, ok) values ('módulos: no modo suporte a equipe não contrata pela tela do cliente', sqlerrm like 'Só o dono%');
end $$;

-- Anual: escolha, começo no dia 1, fatura do ano em 12x, subir com cobrança avulsa, descer e voltar ao mensal na renovação.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.organizacoes set plano = 'start' where id = current_setting('teste.anual')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.anual')::uuid;
  v_prox date := (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')::date;
  r jsonb;
begin
  r := public.plano_ciclo(v_org, 'anual', 12);
  insert into resultado (teste, ok) select 'anual: prévia mostra o valor do ano e o começo no dia 1 seguinte',
    r ->> 'tipo' = 'anual' and (r ->> 'valor')::numeric = 999 and (r ->> 'vale_em')::date = v_prox
    and (select ciclo = 'mensal' and ciclo_proximo is null from public.contratos_cobranca where org_id = v_org);
  perform public.plano_ciclo(v_org, 'anual', 12, true);
  insert into resultado (teste, ok) select 'anual: escolher o anual fica agendado com as parcelas',
    (select ciclo = 'mensal' and ciclo_proximo = 'anual' and ciclo_proximo_em = v_prox and anual_parcelas = 12
       from public.contratos_cobranca where org_id = v_org);
  r := public.plano_ciclo(v_org, 'mensal', 1, true);
  insert into resultado (teste, ok) select 'anual: escolher de novo o mensal desfaz o anual agendado',
    r ->> 'tipo' = 'cancelar'
    and (select ciclo_proximo is null from public.contratos_cobranca where org_id = v_org);
  perform public.plano_ciclo(v_org, 'anual', 12, true);
  begin
    perform public.plano_ciclo(v_org, 'anual', 13);
    insert into resultado (teste, ok) values ('anual: mais de 12 parcelas é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('anual: mais de 12 parcelas é recusado', sqlerrm like 'Escolha de 1 a 12%');
  end;
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.anual')::uuid;
  v_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_id uuid;
begin
  update public.contratos_cobranca set ciclo_proximo_em = v_mes where org_id = v_org;
  perform public.planos_aplicar_agendados();
  insert into resultado (teste, ok) select 'anual: começa no dia marcado',
    (select ciclo = 'anual' and anual_inicio = v_mes and ciclo_proximo is null from public.contratos_cobranca where org_id = v_org)
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'comecar_anual');
  insert into resultado (teste, ok) select 'anual: a fatura do começo leva o ano inteiro',
    exists (select 1 from jsonb_array_elements(public.cobranca_itens(v_org, v_mes)) i
             where i ->> 'descricao' like 'Plano Start anual (%' and (i ->> 'valor')::numeric = 999 and (i ->> 'anual')::boolean);
  update public.faturas set status = 'cancelada' where org_id = v_org and tipo = 'mes';
  v_id := public.cobranca_criar_fatura(v_org, v_mes);
  insert into resultado (teste, ok) select 'anual: a fatura anual sai nas parcelas escolhidas',
    (select parcelas = 12 and valor >= 999 and tipo = 'mes' from public.faturas where id = v_id);
  insert into resultado (teste, ok) select 'anual: depois da fatura do ano, as dos meses seguintes não levam o plano',
    not exists (select 1 from jsonb_array_elements(public.cobranca_itens(v_org, (v_mes + interval '1 month')::date)) i
                 where i ->> 'descricao' like 'Plano%');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.anual')::uuid;
  v_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  r jsonb;
begin
  r := public.plano_trocar(v_org, 'pro', true);
  insert into resultado (teste, ok) select 'anual: subir vale na hora com cobrança avulsa da diferença dos meses que faltam',
    r ->> 'tipo' = 'subir' and (r ->> 'anual')::boolean and (r ->> 'meses')::int = 12 and (r ->> 'valor')::numeric = 500
    and (select plano = 'pro' from public.organizacoes where id = v_org)
    and (select count(*) = 1 and sum(valor) = 500 from public.faturas where org_id = v_org and tipo = 'avulsa')
    and not exists (select 1 from public.cobranca_ajustes where org_id = v_org and descricao like 'Diferença do plano Pro%');
  r := public.modulo_contratar(v_org, 'erp', true, true);
  insert into resultado (teste, ok) select 'anual: ligar módulo no anual gera cobrança avulsa da diferença anual',
    (r ->> 'valor')::numeric = 799
    and (select count(*) = 2 from public.faturas where org_id = v_org and tipo = 'avulsa' and competencia = v_mes);
  r := public.plano_trocar(v_org, 'start');
  insert into resultado (teste, ok) select 'anual: descer fica para a renovação',
    r ->> 'tipo' = 'descer' and (r ->> 'vale_em')::date = (v_mes + interval '12 months')::date;
  r := public.modulo_contratar(v_org, 'erp', false);
  insert into resultado (teste, ok) select 'anual: desligar módulo fica para a renovação',
    (r ->> 'vale_em')::date = (v_mes + interval '12 months')::date;
  r := public.plano_ciclo(v_org, 'mensal', 1, true);
  insert into resultado (teste, ok) select 'anual: voltar ao mensal fica para a renovação depois da fatura anual',
    r ->> 'tipo' = 'mensal' and not (r ->> 'agora')::boolean
    and (select ciclo = 'anual' and ciclo_proximo = 'mensal' and ciclo_proximo_em = (v_mes + interval '12 months')::date
           from public.contratos_cobranca where org_id = v_org);
  insert into resultado (teste, ok) select 'anual: situação mostra o ciclo e a renovação',
    public.plano_troca_situacao(v_org) ->> 'ciclo' = 'anual'
    and (public.plano_troca_situacao(v_org) ->> 'renova_em')::date = (v_mes + interval '12 months')::date
    and (public.plano_troca_situacao(v_org) ->> 'fim_periodo')::date = (v_mes + interval '12 months')::date;
  begin
    perform public.plataforma_definir_contrato(v_org, false, v_mes, null, null);
    insert into resultado (teste, ok) values ('anual: desligar a cobrança do anual passa por "Encerrar o anual"', false);
  exception when others then
    insert into resultado (teste, ok) values ('anual: desligar a cobrança do anual passa por "Encerrar o anual"',
      sqlerrm like 'Esta empresa está no plano anual%');
  end;
end $$;

-- Aviso 15 dias antes (só quando a renovação está nessa janela), renovação e volta ao mensal no dia 1.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.anual')::uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_prox date := (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')::date;
begin
  update public.contratos_cobranca set anual_inicio = (v_prox - interval '12 months')::date, ciclo_proximo = null,
         ciclo_proximo_em = null where org_id = v_org;
  perform public.cobranca_avisar_renovacoes();
  insert into resultado (teste, ok) select 'anual: aviso de renovação só nos 15 dias antes',
    (select (aviso_renovacao_em is not distinct from v_prox) = (v_prox - v_hoje <= 15)
       from public.contratos_cobranca where org_id = v_org);

  update public.contratos_cobranca set anual_inicio = (v_mes - interval '12 months')::date where org_id = v_org;
  update public.organizacoes set plano_proximo = 'start', plano_proximo_em = v_mes where id = v_org;
  perform public.planos_aplicar_agendados();
  insert into resultado (teste, ok) select 'anual: renova sozinho e a descida pedida vale na renovação',
    (select anual_inicio = v_mes and ciclo = 'anual' from public.contratos_cobranca where org_id = v_org)
    and (select plano = 'start' from public.organizacoes where id = v_org)
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'renovar_anual');

  update public.contratos_cobranca set anual_inicio = (v_mes - interval '12 months')::date, ciclo_proximo = 'mensal',
         ciclo_proximo_em = v_mes where org_id = v_org;
  perform public.planos_aplicar_agendados();
  insert into resultado (teste, ok) select 'anual: volta ao mensal na renovação pedida',
    (select ciclo = 'mensal' and anual_inicio is null and ciclo_proximo is null from public.contratos_cobranca where org_id = v_org);

  -- Encerrar no 6º mês: R$ 999 pagos menos 6 × R$ 99,90 = R$ 399,60 (exemplo de site-planos.md).
  delete from public.organizacao_modulos where org_id = v_org;
  update public.contratos_cobranca set ciclo = 'anual', anual_inicio = (v_mes - interval '5 months')::date where org_id = v_org;
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, ambiente, paga_em)
  values (v_org, (v_mes - interval '5 months')::date, (v_mes - interval '5 months')::date + 9,
          '[{"descricao": "Plano Start anual", "quantidade": 1, "valor": 999, "anual": true}]', 999, 'paga', 'sandbox',
          now() - interval '150 days');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.anual')::uuid;
  r jsonb;
begin
  r := public.plataforma_encerrar_anual(v_org);
  insert into resultado (teste, ok) select 'anual: encerrar no 6º mês devolve o pago menos os meses a preço mensal',
    (r ->> 'meses_usados')::int = 6 and (r ->> 'pago')::numeric = 999 and (r ->> 'devolver')::numeric = 399.60
    and not (r ->> 'integral')::boolean
    and (select ciclo = 'anual' from public.contratos_cobranca where org_id = v_org);
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.faturas set paga_em = now() - interval '2 days'
 where org_id = current_setting('teste.anual')::uuid and status = 'paga';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.anual')::uuid;
  r jsonb;
begin
  r := public.plataforma_encerrar_anual(v_org);
  insert into resultado (teste, ok) select 'anual: até 7 dias depois do pagamento a devolução é integral',
    (r ->> 'integral')::boolean and (r ->> 'devolver')::numeric = 999;
  r := public.plataforma_encerrar_anual(v_org, true);
  insert into resultado (teste, ok) select 'anual: encerrar volta ao mensal e desliga a cobrança',
    (select ciclo = 'mensal' and not ativo from public.contratos_cobranca where org_id = v_org)
    and exists (select 1 from public.auditoria where org_id = v_org and acao = 'encerrar_anual');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.plataforma_encerrar_anual(current_setting('teste.anual')::uuid);
  insert into resultado (teste, ok) values ('anual: só a plataforma encerra o anual', false);
exception when others then
  insert into resultado (teste, ok) values ('anual: só a plataforma encerra o anual', sqlerrm like 'Só a equipe%');
end $$;
reset role;
insert into resultado (teste, ok) select 'anual: funções internas fechadas para o login',
  not has_function_privilege('authenticated', 'public.cobranca_avisar_renovacoes()', 'execute')
  and not has_function_privilege('authenticated', 'public.cobranca_criar_avulsa(uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.modulos_pagos(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.plano_ciclo(uuid, text, integer, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.modulo_contratar(uuid, text, boolean, boolean)', 'execute');
-- Correções do anual (migration 20261102160000).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare v_org uuid;
begin
  v_org := public.criar_organizacao('Anual Correções', 'teste-anual-2');
  perform set_config('teste.anual2', v_org::text, true);
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.anual2')::uuid;
  v_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_id uuid;
begin
  update public.organizacoes set plano = 'start' where id = v_org;
  insert into public.membros_org (org_id, user_id, papel) values (v_org, '00000000-0000-0000-0000-0000000000b1', 'atendente')
  on conflict do nothing;
  -- O ano devia ter começado no mês passado, mas a fatura não saiu (empresa suspensa na virada).
  insert into public.contratos_cobranca (org_id, ativo, inicio, ciclo, anual_inicio, anual_parcelas)
  values (v_org, true, (v_mes - interval '1 month')::date, 'anual', (v_mes - interval '1 month')::date, 3);
  insert into resultado (teste, ok) select 'anual: fatura do ano que não saiu no mês certo sai no mês seguinte',
    exists (select 1 from jsonb_array_elements(public.cobranca_itens(v_org, v_mes)) i
             where i ->> 'descricao' like 'Plano Start anual (%' and (i ->> 'valor')::numeric = 999);
  v_id := public.cobranca_criar_fatura(v_org, v_mes);
  insert into resultado (teste, ok) select 'anual: o ano passa a contar do mês da fatura, nas parcelas escolhidas',
    (select parcelas = 3 from public.faturas where id = v_id)
    and (select anual_inicio = v_mes from public.contratos_cobranca where org_id = v_org)
    and not public.anual_a_cobrar(v_org, v_mes);
  -- Cancelada a fatura do ano, a próxima fatura do mês leva o ano de novo.
  update public.faturas set status = 'cancelada' where id = v_id;
  insert into resultado (teste, ok) select 'anual: fatura do ano cancelada volta a ser cobrada',
    public.anual_a_cobrar(v_org, v_mes) and public.anual_a_cobrar(v_org, (v_mes + interval '1 month')::date);
  -- Fatura do ano em aberto e uma diferença avulsa, para o encerramento.
  v_id := public.cobranca_criar_fatura(v_org, v_mes);
  update public.faturas set status = 'aberta', asaas_id = 'pay_anual_corr', asaas_parcelamento = 'ins_anual_corr',
         ambiente = 'sandbox'
   where id = v_id;
  perform set_config('teste.anual2_fatura', v_id::text, true);
end $$;

-- Webhook: a parcela 5 do cartão não muda a fatura; a contestação avisa a plataforma.
do $$
declare
  v_res text;
  v_f uuid := current_setting('teste.anual2_fatura')::uuid;
begin
  v_res := public.cobranca_evento_asaas('evt_parc5_conf', 'PAYMENT_CONFIRMED',
    jsonb_build_object('id', 'pay_parc5', 'installment', 'ins_anual_corr', 'installmentNumber', 5,
                       'externalReference', v_f::text), 'sandbox');
  insert into resultado (teste, ok) select 'anual: evento da parcela 5 do cartão não muda a fatura',
    v_res like 'parcela 5:%' and (select status = 'aberta' and asaas_id = 'pay_anual_corr' from public.faturas where id = v_f);
  v_res := public.cobranca_evento_asaas('evt_parc5_cb', 'PAYMENT_CHARGEBACK_REQUESTED',
    jsonb_build_object('id', 'pay_parc5', 'installment', 'ins_anual_corr', 'installmentNumber', 5), 'sandbox');
  insert into resultado (teste, ok) select 'anual: contestação de uma parcela fica registrada para a plataforma',
    v_res = 'parcela 5: PAYMENT_CHARGEBACK_REQUESTED'
    and exists (select 1 from public.asaas_eventos where id = 'sandbox:evt_parc5_cb' and fatura_id = v_f);
  v_res := public.cobranca_evento_asaas('evt_parc1_conf', 'PAYMENT_CONFIRMED',
    jsonb_build_object('id', 'pay_anual_corr', 'installment', 'ins_anual_corr', 'installmentNumber', 1), 'sandbox');
  insert into resultado (teste, ok) select 'anual: a primeira parcela confirmada marca a fatura como paga',
    v_res = 'paga';
  update public.faturas set status = 'aberta', paga_em = null where id = v_f;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.anual2')::uuid;
  v_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  r jsonb;
begin
  perform public.plano_trocar(v_org, 'pro', true);
  perform public.plano_trocar(v_org, 'start', true);
  r := public.plataforma_encerrar_anual(v_org);
  insert into resultado (teste, ok) select 'anual: a prévia do encerramento mostra as faturas do ano em aberto',
    (r ->> 'faturas_abertas')::int = 2 and (r ->> 'devolver')::numeric = 0;
  r := public.plataforma_encerrar_anual(v_org, true);
  insert into resultado (teste, ok) select 'anual: encerrar cancela as faturas do ano em aberto e traz a descida para o dia 1',
    not exists (select 1 from public.faturas where org_id = v_org and status in ('aberta', 'a_enviar', 'erro'))
    and (select status = 'a_cancelar' from public.faturas where id = current_setting('teste.anual2_fatura')::uuid)
    and exists (select 1 from public.faturas where org_id = v_org and tipo = 'avulsa' and status = 'cancelada')
    and (select plano_proximo_em = (v_mes + interval '1 month')::date from public.organizacoes where id = v_org);
end $$;

-- Teste grátis anual: descer antes da primeira fatura vale no dia 1 seguinte, não daqui a um ano.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.contratos_cobranca
   set ativo = true, inicio = (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')::date,
       ciclo = 'anual', anual_inicio = (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')::date
 where org_id = current_setting('teste.anual2')::uuid;
update public.organizacoes set plano = 'business', plano_proximo = null, plano_proximo_em = null
 where id = current_setting('teste.anual2')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.anual2')::uuid;
  v_prox date := (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')::date;
  r jsonb;
begin
  r := public.plano_trocar(v_org, 'start', true);
  insert into resultado (teste, ok) select 'anual: no teste grátis, descer vale no dia 1 seguinte',
    (r ->> 'vale_em')::date = v_prox and not (r ->> 'anual')::boolean
    and (public.plano_troca_situacao(v_org) ->> 'fim_periodo')::date = v_prox;
end $$;

-- Quem não é dono não escolhe o ciclo nem contrata módulo.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.plano_ciclo(current_setting('teste.anual2')::uuid, 'mensal', 1, true);
  insert into resultado (teste, ok) values ('anual: atendente não troca mensal ou anual', false);
exception when others then
  insert into resultado (teste, ok) values ('anual: atendente não troca mensal ou anual', sqlerrm like 'Só o dono%');
end $$;
do $$ begin
  perform public.modulo_contratar(current_setting('teste.anual2')::uuid, 'erp', true, true);
  insert into resultado (teste, ok) values ('anual: atendente não contrata módulo', false);
exception when others then
  insert into resultado (teste, ok) values ('anual: atendente não contrata módulo', sqlerrm like 'Só o dono%');
end $$;
reset role;
insert into resultado (teste, ok) select 'anual: funções novas fechadas para o login',
  not has_function_privilege('authenticated', 'public.anual_a_cobrar(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.planos_aplicar_da_empresa(uuid, date)', 'execute');

-- CNPJ adicional e notas além das 100 na fatura (migration 20261103120000).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare v_org uuid;
begin
  v_org := public.criar_organizacao('CNPJ Teste', 'teste-cnpj');
  perform set_config('teste.cnpj', v_org::text, true);
end $$;

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.cnpj')::uuid;
  v_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  v_ant date := (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')::date;
  v_e1 uuid; v_e2 uuid; v_e4 uuid;
  v_itens jsonb;
begin
  update public.organizacoes set plano = 'start' where id = v_org;
  insert into public.contratos_cobranca (org_id, ativo, inicio) values (v_org, true, v_mes);
  insert into public.organizacao_modulos (org_id, modulo, ativo) values (v_org, 'erp', true);
  -- 3 CNPJs na Focus em produção, 1 em homologação e 1 fora da Focus: contam 3, pagam-se 2.
  insert into public.emissoras (org_id, razao_social, cnpj, focus_empresa_id, nfe_ambiente)
  values (v_org, 'Matriz', '12345678000195', 9001, 'producao') returning id into v_e1;
  insert into public.emissoras (org_id, razao_social, cnpj, focus_empresa_id, nfe_ambiente)
  values (v_org, 'Filial 1', '98765432000198', 9002, 'producao') returning id into v_e2;
  insert into public.emissoras (org_id, razao_social, cnpj, focus_empresa_id, nfe_ambiente)
  values (v_org, 'Filial 2', '45678912000155', 9003, 'producao');
  insert into public.emissoras (org_id, razao_social, cnpj, focus_empresa_id, nfe_ambiente)
  values (v_org, 'Teste', '32165498000139', 9004, 'homologacao') returning id into v_e4;
  insert into public.emissoras (org_id, razao_social, cnpj, nfe_ambiente)
  values (v_org, 'Sem Focus', '74185296000107', 'producao');
  -- Mês anterior: 105 notas na matriz (uma cancelada depois), 100 na filial 1, 150 em homologação; uma deste mês.
  insert into public.notas_fiscais (org_id, emissora_id, ref, ambiente, status, autorizada_em)
  select v_org, v_e1, 'lvhcnpj1-' || g, 'producao', case when g = 1 then 'cancelada' else 'autorizada' end,
         (v_ant::timestamp at time zone 'America/Sao_Paulo') + interval '2 days'
    from generate_series(1, 105) g;
  insert into public.notas_fiscais (org_id, emissora_id, ref, ambiente, status, autorizada_em)
  select v_org, v_e2, 'lvhcnpj2-' || g, 'producao', 'autorizada', (v_ant::timestamp at time zone 'America/Sao_Paulo') + interval '3 days'
    from generate_series(1, 100) g;
  insert into public.notas_fiscais (org_id, emissora_id, ref, ambiente, status, autorizada_em)
  select v_org, v_e4, 'lvhcnpj4-' || g, 'homologacao', 'autorizada', (v_ant::timestamp at time zone 'America/Sao_Paulo') + interval '3 days'
    from generate_series(1, 150) g;
  insert into public.notas_fiscais (org_id, emissora_id, ref, ambiente, status, autorizada_em)
  values (v_org, v_e1, 'lvhcnpj1-mes', 'producao', 'autorizada', now());

  insert into resultado (teste, ok) select 'cnpj: contam só os CNPJs na Focus em produção',
    public.cnpjs_cobrados(v_org, v_mes) = 3 and public.cnpjs_adicionais(v_org, v_mes) = 2;
  insert into resultado (teste, ok) select 'cnpj: notas além das 100 por CNPJ, em produção, do mês, contando a cancelada',
    public.notas_excedentes(v_org, v_ant) = 5 and public.notas_excedentes(v_org, v_mes) = 0;
  v_itens := public.cobranca_itens(v_org, v_mes);
  insert into resultado (teste, ok) select 'cnpj: no mensal, R$ 49 por CNPJ a mais na fatura do mês',
    exists (select 1 from jsonb_array_elements(v_itens) i
             where (i ->> 'cnpj_adicional')::boolean and (i ->> 'quantidade')::int = 2 and (i ->> 'valor')::numeric = 98
               and i ->> 'anual' is null);
  insert into resultado (teste, ok) select 'cnpj: notas a mais do mês anterior a R$ 0,20',
    exists (select 1 from jsonb_array_elements(v_itens) i
             where i ->> 'descricao' like 'Notas fiscais além das 100 por CNPJ em %'
               and (i ->> 'quantidade')::int = 5 and (i ->> 'valor')::numeric = 1.00);

  -- Valor combinado cobre o CNPJ, mas não as notas a mais.
  update public.contratos_cobranca set valor_fixo = 300, motivo_valor = 'Teste' where org_id = v_org;
  v_itens := public.cobranca_itens(v_org, v_mes);
  insert into resultado (teste, ok) select 'cnpj: valor combinado cobre o CNPJ adicional e cobra as notas a mais',
    not exists (select 1 from jsonb_array_elements(v_itens) i where (i ->> 'cnpj_adicional')::boolean)
    and exists (select 1 from jsonb_array_elements(v_itens) i where i ->> 'descricao' like 'Notas fiscais além%');
  update public.contratos_cobranca set valor_fixo = null, motivo_valor = null where org_id = v_org;

  -- Sem módulo pago, nenhum CNPJ é cobrado.
  update public.organizacao_modulos set ativo = false where org_id = v_org and modulo = 'erp';
  insert into resultado (teste, ok) select 'cnpj: sem ERP nem OS pagos não há CNPJ adicional',
    public.cnpjs_adicionais(v_org, v_mes) = 0
    and not exists (select 1 from jsonb_array_elements(public.cobranca_itens(v_org, v_mes)) i
                     where (i ->> 'cnpj_adicional')::boolean);
  update public.organizacao_modulos set ativo = true where org_id = v_org and modulo = 'erp';

  -- Anual: R$ 490 por CNPJ a mais na fatura do ano; o que entra depois paga R$ 49 por mês até a renovação.
  update public.contratos_cobranca set ciclo = 'anual', anual_inicio = v_mes where org_id = v_org;
  v_itens := public.cobranca_itens(v_org, v_mes);
  insert into resultado (teste, ok) select 'cnpj: no anual, R$ 490 por CNPJ a mais na fatura do ano',
    exists (select 1 from jsonb_array_elements(v_itens) i
             where (i ->> 'cnpj_adicional')::boolean and (i ->> 'anual')::boolean
               and (i ->> 'quantidade')::int = 2 and (i ->> 'valor')::numeric = 980
               and i ->> 'descricao' like 'CNPJ adicional para nota fiscal anual (%');
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, ambiente)
  values (v_org, v_mes, v_mes + 9, v_itens, 2778, 'aberta', 'sandbox');
  insert into resultado (teste, ok) select 'cnpj: depois da fatura do ano, o mês seguinte não cobra os CNPJs de novo',
    public.cnpjs_no_anual(v_org, v_mes) = 2
    and not exists (select 1 from jsonb_array_elements(public.cobranca_itens(v_org, (v_mes + interval '1 month')::date)) i
                     where (i ->> 'cnpj_adicional')::boolean);
  update public.emissoras set nfe_ambiente = 'producao' where id = v_e4;
  insert into resultado (teste, ok) select 'cnpj: CNPJ que entra no meio do anual paga R$ 49 por mês',
    exists (select 1 from jsonb_array_elements(public.cobranca_itens(v_org, (v_mes + interval '1 month')::date)) i
             where (i ->> 'cnpj_adicional')::boolean and i ->> 'anual' is null
               and (i ->> 'quantidade')::int = 1 and (i ->> 'valor')::numeric = 49);
  update public.emissoras set nfe_ambiente = 'homologacao' where id = v_e4;
  update public.emissoras set nfe_ambiente = 'homologacao' where org_id = v_org and razao_social in ('Filial 1', 'Filial 2');
  insert into resultado (teste, ok) select 'cnpj: CNPJ que sai de produção no meio do anual não gera item nem devolução',
    not exists (select 1 from jsonb_array_elements(public.cobranca_itens(v_org, (v_mes + interval '2 months')::date)) i
                 where (i ->> 'cnpj_adicional')::boolean);
  update public.emissoras set nfe_ambiente = 'producao' where org_id = v_org and razao_social in ('Filial 1', 'Filial 2');

  -- Brecha: passar a filial para homologação na véspera do fechamento não tira a cobrança, porque ela emitiu em
  -- produção no mês anterior; no mês seguinte, sem nota em produção, ela deixa de contar.
  update public.emissoras set nfe_ambiente = 'homologacao' where id = v_e2;
  insert into resultado (teste, ok) select 'cnpj: em homologação no fechamento, mas com nota em produção no mês anterior, conta',
    public.cnpjs_cobrados(v_org, v_mes) = 3 and public.cnpjs_cobrados(v_org, (v_mes + interval '1 month')::date) = 2;
  update public.emissoras set nfe_ambiente = 'producao' where id = v_e2;

  -- Virada do mês no horário de Brasília: 23:30 do último dia é do mês anterior; 00:30 do dia 1, do mês novo.
  insert into public.notas_fiscais (org_id, emissora_id, ref, ambiente, status, autorizada_em)
  select v_org, (select id from public.emissoras where org_id = v_org and razao_social = 'Filial 2'), 'lvhcnpj3a-' || g,
         'producao', 'autorizada', (v_mes::timestamp at time zone 'America/Sao_Paulo') - interval '30 minutes'
    from generate_series(1, 101) g;
  insert into public.notas_fiscais (org_id, emissora_id, ref, ambiente, status, autorizada_em)
  select v_org, (select id from public.emissoras where org_id = v_org and razao_social = 'Filial 2'), 'lvhcnpj3b-' || g,
         'producao', 'autorizada', (v_mes::timestamp at time zone 'America/Sao_Paulo') + interval '30 minutes'
    from generate_series(1, 101) g;
  insert into resultado (teste, ok) select 'cnpj: notas contadas pelo mês de Brasília, na virada do dia 1',
    public.notas_excedentes(v_org, v_ant) = 6 and public.notas_excedentes(v_org, v_mes) = 1;
  insert into resultado (teste, ok) select 'cnpj: notas e CNPJs de outra empresa não entram na conta',
    public.notas_excedentes(current_setting('teste.f7')::uuid, v_ant) = 0
    and public.cnpjs_cobrados(current_setting('teste.f7')::uuid, v_mes) = 0;

  -- Para o encerrar: o ano começou há 5 meses e a fatura dele foi paga (plano, ERP e 2 CNPJs).
  update public.faturas set status = 'cancelada' where org_id = v_org;
  update public.contratos_cobranca set anual_inicio = (v_mes - interval '5 months')::date where org_id = v_org;
  insert into public.faturas (org_id, competencia, vencimento, itens, valor, status, ambiente, paga_em)
  values (v_org, (v_mes - interval '5 months')::date, (v_mes - interval '5 months')::date + 9,
          '[{"descricao": "Plano Start anual", "quantidade": 1, "valor": 999, "anual": true},
            {"descricao": "Módulo ERP anual", "quantidade": 1, "valor": 799, "anual": true},
            {"descricao": "CNPJ adicional anual", "quantidade": 2, "valor": 980, "anual": true, "cnpj_adicional": true}]',
          2778, 'paga', 'sandbox', now() - interval '150 days');
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := public.plataforma_encerrar_anual(current_setting('teste.cnpj')::uuid);
  -- Mensal de hoje: 99,90 + 79,90 + 2 × 49 = 277,80; 6 meses usados: 2.778 − 1.666,80 = 1.111,20.
  insert into resultado (teste, ok) select 'cnpj: encerrar o anual desconta os CNPJs a preço mensal',
    (r ->> 'mensal')::numeric = 277.80 and (r ->> 'pago')::numeric = 2778 and (r ->> 'devolver')::numeric = 1111.20;
end $$;
reset role;
insert into resultado (teste, ok) select 'cnpj: funções novas fechadas para o login',
  not has_function_privilege('authenticated', 'public.cnpjs_cobrados(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.cnpjs_adicionais(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.cnpjs_no_anual(uuid, date, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.notas_excedentes(uuid, date)', 'execute')
  and not has_function_privilege('anon', 'public.notas_excedentes(uuid, date)', 'execute');

-- Contato ligado a mais de um cliente (migration 20261105120000). Clientes do teste: Beta (11444777000161), Delta
-- Peças (04252011000110) e Empresa Nova (11222333000181).
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_canal uuid := (select id from public.canais where instance_id = 'INST-F7');
  v_beta uuid := (select id from public.clientes where org_id = current_setting('teste.f7')::uuid and documento = '11444777000161');
  v_delta uuid := (select id from public.clientes where org_id = current_setting('teste.f7')::uuid and documento = '04252011000110');
  v_nova uuid := (select id from public.clientes where org_id = current_setting('teste.f7')::uuid and documento = '11222333000181');
  v_ct uuid; v_conv uuid; v_ped public.pedidos; r jsonb;
begin
  insert into public.contatos (org_id, telefone, nome, cliente_id) values (v_org, '5541900099001', 'Compradora do grupo', v_delta)
  returning id into v_ct;
  perform set_config('teste.ct_grupo', v_ct::text, true);
  insert into resultado (teste, ok) values ('varios clientes: gravar o cliente do contato cria a ligação',
    exists (select 1 from public.contatos_clientes where contato_id = v_ct and cliente_id = v_delta and org_id = v_org));
  insert into public.contatos_clientes (org_id, contato_id, cliente_id) values (v_org, v_ct, v_beta);
  insert into resultado (teste, ok) values ('varios clientes: a segunda empresa não muda a principal',
    (select cliente_id from public.contatos where id = v_ct) = v_delta
    and (select count(*) from public.contatos_clientes where contato_id = v_ct) = 2);
  delete from public.contatos_clientes where contato_id = v_ct and cliente_id = v_delta;
  insert into resultado (teste, ok) values ('varios clientes: tirar a principal promove a que sobrou',
    (select cliente_id from public.contatos where id = v_ct) = v_beta);
  update public.contatos set cliente_id = null where id = v_ct;
  insert into resultado (teste, ok) values ('varios clientes: apagar a última deixa o contato sem cliente',
    (select cliente_id from public.contatos where id = v_ct) is null
    and not exists (select 1 from public.contatos_clientes where contato_id = v_ct));
  insert into public.contatos_clientes (org_id, contato_id, cliente_id) values (v_org, v_ct, v_delta);
  insert into public.contatos_clientes (org_id, contato_id, cliente_id) values (v_org, v_ct, v_beta);
  insert into resultado (teste, ok) values ('varios clientes: a primeira ligação vira a principal',
    (select cliente_id from public.contatos where id = v_ct) = v_delta);
  update public.contatos set cliente_id = v_beta where id = v_ct;
  insert into resultado (teste, ok) values ('varios clientes: trocar a principal mantém a outra empresa',
    (select cliente_id from public.contatos where id = v_ct) = v_beta
    and (select count(*) from public.contatos_clientes where contato_id = v_ct) = 2);
  update public.contatos set cliente_id = null where id = v_ct;
  insert into resultado (teste, ok) values ('varios clientes: apagar a principal solta só ela e promove a outra',
    (select cliente_id from public.contatos where id = v_ct) = v_delta
    and not exists (select 1 from public.contatos_clientes where contato_id = v_ct and cliente_id = v_beta));
  insert into public.contatos_clientes (org_id, contato_id, cliente_id) values (v_org, v_ct, v_beta);
  begin
    insert into public.contatos_clientes (org_id, contato_id, cliente_id)
    values (current_setting('teste.cli')::uuid, v_ct, v_nova);
    insert into resultado (teste, ok) values ('varios clientes: não liga a cliente de outra empresa', false);
  exception when foreign_key_violation then
    insert into resultado (teste, ok) values ('varios clientes: não liga a cliente de outra empresa', true);
  end;

  -- Agente: com duas empresas, pergunta para qual é o orçamento.
  update public.agentes set identificar_cliente = true where canal_id = v_canal;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_ct, 'bot') returning id into v_conv;
  perform set_config('teste.conv_grupo', v_conv::text, true);
  r := public.agente_contexto(v_conv);
  insert into resultado (teste, ok) values ('varios clientes: o contexto do agente traz as duas empresas, a principal primeiro',
    jsonb_array_length(r -> 'clientes') = 2 and (r -> 'clientes' -> 0 ->> 'principal')::boolean
    and r -> 'clientes' -> 0 ->> 'nome' = 'Delta Peças' and r -> 'clientes' -> 1 ->> 'cnpj' = '11.444.777/0001-61'
    and r -> 'cliente' ->> 'nome' = 'Delta Peças');
  r := public.agente_montar_pedido(v_conv, '[{"codigo":"14/19","quantidade":2}]');
  insert into resultado (teste, ok) values ('varios clientes: sem dizer a empresa, o agente pergunta antes do orçamento',
    not (r ->> 'sucesso')::boolean and (r ->> 'escolher_empresa')::boolean and jsonb_array_length(r -> 'empresas') = 2
    and (public.agente_rascunho_atual(v_conv)).id is null);
  r := public.agente_montar_pedido(v_conv, '[{"codigo":"14/19","quantidade":2}]', null, 'Empresa que não é dele');
  insert into resultado (teste, ok) values ('varios clientes: empresa que não é do contato é recusada',
    not (r ->> 'sucesso')::boolean and r ->> 'aviso' like 'Essa empresa não está entre as deste WhatsApp%');
  r := public.agente_montar_pedido(v_conv, '[{"codigo":"14/19","quantidade":2}]', null, '11.444.777/0001-61');
  v_ped := public.agente_rascunho_atual(v_conv);
  insert into resultado (teste, ok) values ('varios clientes: com o CNPJ escolhido, o orçamento sai nessa empresa',
    (r ->> 'sucesso')::boolean and v_ped.cliente_id = v_beta and r ->> 'empresa' = 'Beta Comércio Ltda'
    and r ? 'aviso_empresa');
  r := public.agente_montar_pedido(v_conv, '[{"codigo":"14/19","quantidade":3}]');
  insert into resultado (teste, ok) values ('varios clientes: atualizar o orçamento em aberto não pergunta de novo',
    (r ->> 'sucesso')::boolean and (public.agente_rascunho_atual(v_conv)).cliente_id = v_beta);
  r := public.agente_identificar_cliente(v_conv, '04.252.011/0001-10');
  insert into resultado (teste, ok) values ('varios clientes: o CNPJ de uma empresa dele muda o orçamento em aberto',
    (r ->> 'ja_identificado')::boolean and (public.agente_rascunho_atual(v_conv)).cliente_id = v_delta);
  r := public.agente_identificar_cliente(v_conv, '11222333000181');
  insert into resultado (teste, ok) values ('varios clientes: CNPJ de outra empresa do cadastro liga mais uma e o orçamento vai para ela',
    (r ->> 'sucesso')::boolean and (r ->> 'encontrado')::boolean
    and (select count(*) from public.contatos_clientes where contato_id = v_ct) = 3
    and (select cliente_id from public.contatos where id = v_ct) = v_delta
    and (public.agente_rascunho_atual(v_conv)).cliente_id = v_nova
    and exists (select 1 from public.mensagens where conversa_id = v_conv and texto like 'O agente ligou este contato também ao cliente%'));
  r := public.agente_cadastrar_cliente(v_conv, '12.345.678/0001-95', 'GRUPO FILIAL SUL LTDA');
  insert into resultado (teste, ok) values ('varios clientes: CNPJ novo é cadastrado e ligado como mais uma empresa',
    (r ->> 'cadastrado')::boolean
    and (select count(*) from public.contatos_clientes where contato_id = v_ct) = 4
    and (select cl.documento from public.pedidos p join public.clientes cl on cl.id = p.cliente_id
          where p.id = (public.agente_rascunho_atual(v_conv)).id) = '12345678000195'
    and exists (select 1 from public.mensagens where conversa_id = v_conv and texto like 'O agente cadastrou o cliente%também a ele.%'));

  -- Apagar o cliente principal: a ligação some e outra empresa vira a principal (no teste todas têm o mesmo
  -- criado_em, então qualquer uma das que sobraram serve).
  update public.contatos set cliente_id = (select id from public.clientes where org_id = v_org and documento = '12345678000195')
   where id = v_ct;
  delete from public.clientes where org_id = v_org and documento = '12345678000195';
  insert into resultado (teste, ok) values ('varios clientes: apagar o cliente principal promove outra empresa',
    (select count(*) from public.contatos_clientes where contato_id = v_ct) = 3
    and exists (select 1 from public.contatos ct join public.contatos_clientes cc on cc.contato_id = ct.id and cc.cliente_id = ct.cliente_id
                 where ct.id = v_ct));
  -- Daqui em diante, Beta é a principal.
  update public.contatos set cliente_id = v_beta where id = v_ct;
end $$;

-- Tela: quem vê o contato liga e solta; a importação liga mais uma empresa.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_ct uuid := current_setting('teste.ct_grupo')::uuid;
  r jsonb;
begin
  delete from public.contatos_clientes where contato_id = v_ct
     and cliente_id = (select id from public.clientes where org_id = v_org and documento = '11222333000181');
  insert into resultado (teste, ok) values ('varios clientes: o dono solta uma empresa do contato',
    (select count(*) from public.contatos_clientes where contato_id = v_ct) = 2);
  r := public.clientes_importar(v_org, jsonb_build_array(
    jsonb_build_object('nome', 'Grupo Filial Norte', 'documento', '98.765.432/0001-98', 'celular', '(41) 90009-9001')));
  insert into resultado (teste, ok) values ('varios clientes: importar o celular de um contato com cliente liga mais uma empresa',
    (r ->> 'contatos_ligados')::int = 1 and jsonb_array_length(r -> 'avisos') = 0
    and exists (select 1 from public.contatos_clientes cc join public.clientes cl on cl.id = cc.cliente_id
                 where cc.contato_id = v_ct and cl.documento = '98765432000198')
    and (select cl.documento from public.contatos ct join public.clientes cl on cl.id = ct.cliente_id where ct.id = v_ct) = '11444777000161');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$ begin
  insert into resultado (teste, ok) values ('varios clientes: outra empresa não vê as ligações',
    not exists (select 1 from public.contatos_clientes where contato_id = current_setting('teste.ct_grupo')::uuid));
  delete from public.contatos_clientes where contato_id = current_setting('teste.ct_grupo')::uuid;
end $$;
reset role;
insert into resultado (teste, ok) values ('varios clientes: outra empresa não solta as ligações',
  (select count(*) from public.contatos_clientes where contato_id = current_setting('teste.ct_grupo')::uuid) = 3);
insert into resultado (teste, ok) select 'varios clientes: funções do agente fechadas para o login',
  not has_function_privilege('authenticated', 'public.agente_montar_pedido(uuid, jsonb, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.agente_montar_pedido(uuid, jsonb, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.contatos_cliente_principal()', 'execute');

-- Tarefas com lembrete (migration 20261105130000). Contato do número da empresa (INST-F7, todos veem) e contato só
-- do número do vendedor d1 (o atendente b1 não vê).
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_canal uuid := (select id from public.canais where instance_id = 'INST-F7');
  v_etapa uuid := (select id from public.etapas_funil where org_id = current_setting('teste.f7')::uuid and tipo = 'aberta' order by ordem limit 1);
  v_ct uuid; v_ct2 uuid; v_op uuid; v_op2 uuid;
begin
  update public.canais set responsavel_id = null where id = v_canal;
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900066101', 'Cliente da tarefa') returning id into v_ct;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_ct, 'humano');
  insert into public.oportunidades (org_id, contato_id, etapa_id, titulo, responsavel_id)
  values (v_org, v_ct, v_etapa, 'Proposta da tarefa', '00000000-0000-0000-0000-0000000000d1')
  returning id into v_op;
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900066102', 'Outro cliente') returning id into v_ct2;
  insert into public.oportunidades (org_id, contato_id, etapa_id, titulo, responsavel_id)
  values (v_org, v_ct2, v_etapa, 'Outra proposta', '00000000-0000-0000-0000-0000000000d1')
  returning id into v_op2;
  perform set_config('teste.tf_ct', v_ct::text, true);
  perform set_config('teste.tf_op', v_op::text, true);
  perform set_config('teste.tf_op2', v_op2::text, true);
  perform set_config('teste.tf_ct_vend', (select contato_id from public.conversas where id = current_setting('teste.conv_vendedor')::uuid)::text, true);
  insert into public.tarefas (org_id, titulo, vence_em, responsavel_id, contato_id, criado_por)
  values (v_org, 'Tarefa do contato do vendedor', now() + interval '1 day', '00000000-0000-0000-0000-0000000000a1',
          current_setting('teste.tf_ct_vend')::uuid, '00000000-0000-0000-0000-0000000000a1');
  begin
    insert into public.tarefas (org_id, titulo, vence_em, executor) values (v_org, 'Retomar', now(), 'agente');
    insert into resultado (teste, ok) values ('tarefas: retomada do agente sem contato é recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('tarefas: retomada do agente sem contato é recusada', sqlerrm like 'a retomada do agente precisa%');
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_t public.tarefas;
begin
  insert into public.tarefas (org_id, titulo, vence_em, oportunidade_id)
  values (v_org, '  Ligar para confirmar a proposta ', now() + interval '2 days', current_setting('teste.tf_op')::uuid)
  returning * into v_t;
  perform set_config('teste.tf_b1', v_t.id::text, true);
  insert into resultado (teste, ok) values ('tarefas: sem responsável fica com quem criou, e o contato vem da oportunidade',
    v_t.responsavel_id = '00000000-0000-0000-0000-0000000000b1' and v_t.criado_por = '00000000-0000-0000-0000-0000000000b1'
    and v_t.contato_id = current_setting('teste.tf_ct')::uuid and v_t.titulo = 'Ligar para confirmar a proposta'
    and v_t.executor = 'equipe' and v_t.status = 'aberta');
  begin
    insert into public.tarefas (org_id, titulo, vence_em, contato_id, oportunidade_id)
    values (v_org, 'x', now(), current_setting('teste.tf_ct')::uuid, current_setting('teste.tf_op2')::uuid);
    insert into resultado (teste, ok) values ('tarefas: oportunidade de outro contato é recusada', false);
  exception when others then
    insert into resultado (teste, ok) values ('tarefas: oportunidade de outro contato é recusada', sqlerrm = 'a oportunidade é de outro contato');
  end;
  begin
    insert into public.tarefas (org_id, titulo, vence_em, contato_id, responsavel_id)
    values (v_org, 'x', now(), current_setting('teste.tf_ct')::uuid, '00000000-0000-0000-0000-0000000000c1');
    insert into resultado (teste, ok) values ('tarefas: responsável de fora da equipe é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('tarefas: responsável de fora da equipe é recusado', sqlerrm = 'o responsável precisa ser da equipe');
  end;
  begin
    insert into public.tarefas (org_id, titulo, vence_em, contato_id)
    values (v_org, 'x', now(), current_setting('teste.tf_ct_vend')::uuid);
    insert into resultado (teste, ok) values ('tarefas: atendente não cria tarefa de contato que não vê', false);
  exception when insufficient_privilege then
    insert into resultado (teste, ok) values ('tarefas: atendente não cria tarefa de contato que não vê', true);
  end;
  insert into resultado (teste, ok) values ('tarefas: atendente não vê a tarefa do contato do vendedor',
    not exists (select 1 from public.tarefas where titulo = 'Tarefa do contato do vendedor'));

  update public.tarefas set status = 'feita', resultado = 'Cliente confirmou' where id = v_t.id returning * into v_t;
  insert into resultado (teste, ok) values ('tarefas: concluir guarda quando e quem',
    v_t.concluida_em is not null and v_t.concluida_por = '00000000-0000-0000-0000-0000000000b1');
  update public.tarefas set status = 'aberta' where id = v_t.id returning * into v_t;
  insert into resultado (teste, ok) values ('tarefas: reabrir limpa a conclusão',
    v_t.concluida_em is null and v_t.concluida_por is null and v_t.resultado is null);
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  r jsonb;
begin
  insert into resultado (teste, ok) values ('tarefas: o dono vê todas, inclusive a do contato do vendedor',
    exists (select 1 from public.tarefas where titulo = 'Tarefa do contato do vendedor')
    and exists (select 1 from public.tarefas where id = current_setting('teste.tf_b1')::uuid));
  -- Filtra pelo vendedor d1, dono só destas duas oportunidades (a lista tem limite de 30).
  r := public.painel_pendencias(v_org, null, '00000000-0000-0000-0000-0000000000d1');
  insert into resultado (teste, ok) values ('tarefas: oportunidade com próximo passo no prazo sai do "sem retorno"',
    not (r -> 'sem_retorno' @> jsonb_build_array(jsonb_build_object('oportunidade_id', current_setting('teste.tf_op')::uuid)))
    and r -> 'sem_retorno' @> jsonb_build_array(jsonb_build_object('oportunidade_id', current_setting('teste.tf_op2')::uuid)));
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  delete from public.tarefas where titulo = 'Tarefa do contato do vendedor';
  delete from public.tarefas where id = current_setting('teste.tf_b1')::uuid;
  insert into resultado (teste, ok) values ('tarefas: quem criou apaga a própria tarefa',
    not exists (select 1 from public.tarefas where id = current_setting('teste.tf_b1')::uuid));
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$ begin
  insert into resultado (teste, ok) values ('tarefas: outra empresa não vê nada',
    not exists (select 1 from public.tarefas where org_id = current_setting('teste.f7')::uuid));
end $$;

-- Lembrete: a que vence em 5 min com 10 de antecedência avisa; a de daqui a 2 h e a vencida há 1 h, não.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_agora uuid; v_depois uuid; v_velha uuid; n int;
  v_push int := (select count(*) from public.push_fila);
  v_alert int := (select count(*) from public.alertas);
begin
  update public.perfis set telefone = '5541988887777' where user_id = '00000000-0000-0000-0000-0000000000a1';
  insert into public.tarefas (org_id, titulo, vence_em, responsavel_id, contato_id, lembrete_minutos)
  values (v_org, 'Lembrar agora', now() + interval '5 minutes', '00000000-0000-0000-0000-0000000000a1', current_setting('teste.tf_ct')::uuid, 10)
  returning id into v_agora;
  insert into public.tarefas (org_id, titulo, vence_em, responsavel_id, lembrete_minutos)
  values (v_org, 'Lembrar depois', now() + interval '2 hours', '00000000-0000-0000-0000-0000000000a1', 0) returning id into v_depois;
  insert into public.tarefas (org_id, titulo, vence_em, responsavel_id, lembrete_minutos)
  values (v_org, 'Já passou', now() - interval '1 hour', '00000000-0000-0000-0000-0000000000a1', 0) returning id into v_velha;
  n := public.tarefas_lembretes();
  insert into resultado (teste, ok) values ('tarefas: lembrete só da que chegou na hora',
    (select lembrete_enviado_em is not null from public.tarefas where id = v_agora)
    and (select lembrete_enviado_em is null from public.tarefas where id = v_depois)
    and (select lembrete_enviado_em is null from public.tarefas where id = v_velha));
  insert into resultado (teste, ok) values ('tarefas: o lembrete vai pelo WhatsApp da pessoa',
    (select count(*) from public.alertas) = v_alert + 1
    and exists (select 1 from public.alertas where telefone = '5541988887777' and texto like '✅ *Tarefa*%Lembrar agora%Cliente da tarefa%'));
  update public.tarefas set vence_em = vence_em + interval '1 minute' where id = v_agora;
  insert into resultado (teste, ok) values ('tarefas: remarcar faz o lembrete valer de novo',
    (select lembrete_enviado_em is null from public.tarefas where id = v_agora));
end $$;
insert into resultado (teste, ok) select 'tarefas: rotina do lembrete fechada para o login',
  not has_function_privilege('authenticated', 'public.tarefas_lembretes()', 'execute')
  and exists (select 1 from cron.job where jobname = 'livih-tarefas-lembretes');

-- Follow-up do agente (migration 20261105140000). Número INST-F7 (WAHA, conectado, agente ligado 24 h); retomada
-- ligada há 3 dias. Mensagens com criado_em no passado simulam as conversas paradas.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_canal uuid := (select id from public.canais where instance_id = 'INST-F7');
  v_a uuid; v_b uuid; v_c uuid; v_e uuid; v_g uuid;
  v_ca uuid; v_cb uuid; v_cc uuid; v_ce uuid; v_cg uuid;
  n int; r jsonb; v_t public.tarefas;
begin
  update public.canais set ativo = true, status_conexao = 'WORKING', tipo = 'waha' where id = v_canal;
  update public.agentes set ativo = true, horario = null where canal_id = v_canal;
  insert into public.agente_followup (org_id, ativo, ativado_em) values (v_org, true, now() - interval '3 days');

  -- A: conversa parada (o agente falou por último há 26 h).
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900055101', 'Ana Parada') returning id into v_a;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_a, 'bot') returning id into v_ca;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, criado_em, status_entrega)
  values (v_org, v_ca, 'entrada', 'contato', 'texto', 'Quanto custa o grampo?', now() - interval '30 hours', 'recebida'),
         (v_org, v_ca, 'saida', 'bot', 'texto', 'Custa R$ 10. Quer que eu monte o orçamento?', now() - interval '26 hours', 'enviada');
  -- B: orçamento sem resposta (PDF depois da última mensagem do cliente e pedido em rascunho).
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900055102', 'Bruno Orçamento') returning id into v_b;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_b, 'bot') returning id into v_cb;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, midia_nome, criado_em, status_entrega)
  values (v_org, v_cb, 'entrada', 'contato', 'texto', 'Me manda o orçamento', null, now() - interval '30 hours', 'recebida'),
         (v_org, v_cb, 'saida', 'bot', 'documento', 'Orcamento-90.pdf', 'Orcamento-90-Bruno.pdf', now() - interval '26 hours', 'enviada');
  insert into public.pedidos (org_id, contato_id, numero) values (v_org, v_b, 0);
  -- C: parou antes de a retomada ser ligada (5 dias): não entra.
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900055103', 'Carla Antiga') returning id into v_c;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_c, 'bot') returning id into v_cc;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, criado_em, status_entrega)
  values (v_org, v_cc, 'entrada', 'contato', 'texto', 'oi', now() - interval '6 days', 'recebida'),
         (v_org, v_cc, 'saida', 'bot', 'texto', 'Olá!', now() - interval '5 days', 'enviada');
  -- E: parada, mas a equipe já marcou o próximo passo: não entra.
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900055105', 'Edu Com Tarefa') returning id into v_e;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_e, 'bot') returning id into v_ce;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, criado_em, status_entrega)
  values (v_org, v_ce, 'entrada', 'contato', 'texto', 'Vou ver', now() - interval '30 hours', 'recebida'),
         (v_org, v_ce, 'saida', 'bot', 'texto', 'Combinado!', now() - interval '26 hours', 'enviada');
  insert into public.tarefas (org_id, titulo, vence_em, contato_id, responsavel_id)
  values (v_org, 'Ligar para o Edu', now() + interval '1 day', v_e, '00000000-0000-0000-0000-0000000000a1');

  n := public.followup_detectar();
  insert into resultado (teste, ok) values ('follow-up: conversa parada vira retomada do agente',
    exists (select 1 from public.tarefas where contato_id = v_a and executor = 'agente' and status = 'aberta'
             and followup_motivo = 'conversa' and tentativa = 1 and conversa_id = v_ca));
  insert into resultado (teste, ok) values ('follow-up: orçamento enviado sem resposta é reconhecido',
    exists (select 1 from public.tarefas where contato_id = v_b and executor = 'agente' and followup_motivo = 'orcamento'));
  insert into resultado (teste, ok) values ('follow-up: o que parou antes de ligar a retomada não entra',
    not exists (select 1 from public.tarefas where contato_id = v_c));
  insert into resultado (teste, ok) values ('follow-up: contato com próximo passo da equipe não é retomado',
    not exists (select 1 from public.tarefas where contato_id = v_e and executor = 'agente'));
  perform public.followup_detectar();
  insert into resultado (teste, ok) values ('follow-up: rodar de novo não repete a retomada',
    (select count(*) from public.tarefas where contato_id in (v_a, v_b) and executor = 'agente') = 2);

  -- Rodada: o agente vai escrever (a Edge Function é chamada; aqui só a marcação, o pg_net sai depois do commit).
  n := public.followup_rodar();
  insert into resultado (teste, ok) values ('follow-up: a rodada manda as retomadas para o agente escrever',
    (select count(*) from public.tarefas where contato_id in (v_a, v_b) and executor = 'agente' and enviando_em is not null) = 2);
  r := public.agente_followup_dados((select id from public.tarefas where contato_id = v_a and executor = 'agente'));
  insert into resultado (teste, ok) values ('follow-up: a Edge Function recebe o contexto, o motivo e a tentativa',
    (r ->> 'valido')::boolean and r ->> 'motivo' = 'conversa' and (r ->> 'tentativa')::int = 1
    and jsonb_array_length(r -> 'contexto' -> 'mensagens') = 2);

  -- A: o agente escreveu.
  select * into v_t from public.tarefas where contato_id = v_a and executor = 'agente' and status = 'aberta';
  r := public.agente_followup_concluir(v_t.id, 'Oi, Ana! Conseguiu pensar no grampo? Monto o orçamento para você.');
  insert into resultado (teste, ok) values ('follow-up: a retomada sai como mensagem do agente e fica registrada',
    (r ->> 'enviado')::boolean
    and exists (select 1 from public.mensagens m where m.id = (r ->> 'mensagem_id')::uuid and m.autor_tipo = 'bot'
                 and m.direcao = 'saida' and m.texto like 'Oi, Ana!%')
    and exists (select 1 from public.fila_envio where mensagem_id = (r ->> 'mensagem_id')::uuid)
    and (select status = 'feita' and mensagem_id = (r ->> 'mensagem_id')::uuid from public.tarefas where id = v_t.id)
    and exists (select 1 from public.mensagens where conversa_id = v_ca and autor_tipo = 'sistema' and texto like 'Retomada do agente (1 de 2)%'));
  insert into resultado (teste, ok) values ('follow-up: a 2ª tentativa fica marcada para depois do intervalo',
    exists (select 1 from public.tarefas where contato_id = v_a and executor = 'agente' and status = 'aberta' and tentativa = 2
             and vence_em between now() + interval '47 hours' and now() + interval '49 hours'));
  -- O cliente respondeu: a 2ª tentativa fecha.
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, status_entrega)
  values (v_org, v_ca, 'entrada', 'contato', 'texto', 'Pode montar sim', 'recebida');
  insert into resultado (teste, ok) values ('follow-up: o cliente respondeu, as retomadas abertas fecham',
    not exists (select 1 from public.tarefas where contato_id = v_a and status = 'aberta')
    and exists (select 1 from public.tarefas where contato_id = v_a and tentativa = 2 and resultado = 'O cliente respondeu'));

  -- B: o agente avaliou que não era hora (sem texto): fecha sem 2ª tentativa.
  select * into v_t from public.tarefas where contato_id = v_b and executor = 'agente' and status = 'aberta';
  r := public.agente_followup_concluir(v_t.id, null);
  insert into resultado (teste, ok) values ('follow-up: sem texto, a retomada fecha sem mandar e sem 2ª tentativa',
    not (r ->> 'enviado')::boolean
    and (select status = 'feita' and mensagem_id is null from public.tarefas where id = v_t.id)
    and not exists (select 1 from public.tarefas where contato_id = v_b and status = 'aberta'));

  -- G: 2ª tentativa sem resposta vira tarefa do vendedor; o modelo (fora das 24 h) sai com o nome do contato.
  insert into public.contatos (org_id, telefone, nome, responsavel_id)
  values (v_org, '5541900055107', 'Gabi Sumida', '00000000-0000-0000-0000-0000000000a1') returning id into v_g;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_g, 'bot') returning id into v_cg;
  insert into public.tarefas (org_id, titulo, vence_em, executor, contato_id, conversa_id, followup_motivo, tentativa, followup_ref)
  values (v_org, 'Retomar a conversa parada', now(), 'agente', v_g, v_cg, 'conversa', 2, 'msg:teste') returning * into v_t;
  perform public.followup_enviar_modelo(v_t.id, v_cg,
    '{"nome":"retomada","idioma":"pt_BR","corpo":"Olá, {{1}}! Ainda posso ajudar?","variaveis":[{"fonte":"nome"}]}');
  insert into resultado (teste, ok) values ('follow-up: fora das 24 h vai o modelo, com as variáveis preenchidas',
    exists (select 1 from public.mensagens where conversa_id = v_cg and autor_tipo = 'bot' and texto = 'Olá, Gabi Sumida! Ainda posso ajudar?'
             and modelo ->> 'nome' = 'retomada' and modelo -> 'parametros' ->> 0 = 'Gabi Sumida'));
  insert into resultado (teste, ok) values ('follow-up: depois da 2ª sem resposta, a tarefa vai para o vendedor',
    exists (select 1 from public.tarefas where contato_id = v_g and executor = 'equipe' and status = 'aberta'
             and followup_motivo = 'sem_resposta' and responsavel_id = '00000000-0000-0000-0000-0000000000a1'));

  -- Retorno combinado pelo agente.
  r := public.agente_agendar_retorno(v_ce, to_char((now() at time zone 'America/Sao_Paulo')::date + 7, 'YYYY-MM-DD'), 'nova tabela de preços');
  insert into resultado (teste, ok) values ('follow-up: o agente combina a data e a retomada fica marcada às 9 h',
    (r ->> 'sucesso')::boolean
    and exists (select 1 from public.tarefas where contato_id = v_e and executor = 'agente' and status = 'aberta'
                 and followup_motivo = 'pedido_cliente' and titulo = 'Retomar: nova tabela de preços'
                 and to_char(vence_em at time zone 'America/Sao_Paulo', 'HH24:MI') = '09:00'));
  r := public.agente_agendar_retorno(v_ce, '2020-01-01', 'x');
  insert into resultado (teste, ok) values ('follow-up: data no passado é recusada',
    not (r ->> 'sucesso')::boolean and r ->> 'aviso' like 'Data inválida%');
  -- A equipe escreveu ao cliente: a retomada do agente perde o sentido.
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, autor_id, tipo, texto, status_entrega)
  values (v_org, v_ce, 'saida', 'atendente', '00000000-0000-0000-0000-0000000000a1', 'texto', 'Edu, segue a tabela', 'enviada');
  insert into resultado (teste, ok) values ('follow-up: a equipe escreveu, a retomada do agente é cancelada',
    not exists (select 1 from public.tarefas where contato_id = v_e and executor = 'agente' and status = 'aberta')
    and exists (select 1 from public.tarefas where contato_id = v_e and titulo = 'Ligar para o Edu' and status = 'aberta'));
  begin
    insert into public.tarefas (org_id, titulo, vence_em, executor, contato_id) values (v_org, 'a', now(), 'agente', v_g);
    insert into public.tarefas (org_id, titulo, vence_em, executor, contato_id) values (v_org, 'b', now(), 'agente', v_g);
    insert into resultado (teste, ok) values ('follow-up: uma retomada aberta por contato', false);
  exception when unique_violation then
    insert into resultado (teste, ok) values ('follow-up: uma retomada aberta por contato', true);
  end;
  perform set_config('teste.fu_a', v_a::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.followup_salvar(current_setting('teste.f7')::uuid, '{"ativo":false}');
  insert into resultado (teste, ok) values ('follow-up: atendente não muda a configuração', false);
exception when others then
  insert into resultado (teste, ok) values ('follow-up: atendente não muda a configuração', sqlerrm like 'só dono e admin%');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_g uuid := (select id from public.contatos where org_id = current_setting('teste.f7')::uuid and telefone = '5541900055107');
begin
  begin
    perform public.followup_salvar(v_org, '{"ativo":true,"modelo":{"nome":"retomada","idioma":"pt_BR","corpo":"Olá, {{1}}!","variaveis":[]}}');
    insert into resultado (teste, ok) values ('follow-up: modelo sem as variáveis é recusado', false);
  exception when others then
    insert into resultado (teste, ok) values ('follow-up: modelo sem as variáveis é recusado', sqlerrm = 'preencha todas as variáveis do modelo');
  end;
  insert into public.tarefas (org_id, titulo, vence_em, executor, contato_id) values (v_org, 'O agente retoma', now() + interval '1 day', 'agente', v_g);
  insert into resultado (teste, ok) values ('follow-up: a equipe pede ao agente para retomar',
    exists (select 1 from public.tarefas where contato_id = v_g and executor = 'agente' and status = 'aberta'
             and followup_motivo = 'manual' and tentativa = 1 and responsavel_id is null));
  perform public.followup_salvar(v_org, '{"ativo":false,"orcamento_horas":24,"conversa_horas":24,"oportunidade_dias":3}');
  insert into resultado (teste, ok) values ('follow-up: desligar cancela as retomadas que o agente faria',
    not exists (select 1 from public.tarefas where org_id = v_org and executor = 'agente' and status = 'aberta')
    and (select not ativo and ativado_em is null from public.agente_followup where org_id = v_org));
end $$;
reset role;
insert into resultado (teste, ok) select 'follow-up: funções da rodada fechadas para o login',
  not has_function_privilege('authenticated', 'public.followup_rodar()', 'execute')
  and not has_function_privilege('authenticated', 'public.agente_followup_concluir(uuid, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.agente_agendar_retorno(uuid, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.agente_agendar_retorno(uuid, text, text)', 'execute')
  and exists (select 1 from cron.job where jobname = 'livih-followup');

-- O agente não chama a equipe se o cliente escreveu de novo enquanto ele pensava (migration 20261105150000).
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_canal uuid := (select id from public.canais where instance_id = 'INST-F7');
  v_ct uuid; v_conv uuid; v_m1 uuid; v_m2 uuid; r jsonb;
begin
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900044101', 'Cliente em partes') returning id into v_ct;
  insert into public.conversas (org_id, canal_id, contato_id, estado) values (v_org, v_canal, v_ct, 'bot') returning id into v_conv;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, status_entrega, criado_em)
  values (v_org, v_conv, 'entrada', 'contato', 'texto', 'Segue comprovante', 'recebida', now() - interval '20 seconds')
  returning id into v_m1;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, status_entrega)
  values (v_org, v_conv, 'entrada', 'contato', 'texto', 'Posso pedir motoboy?', 'recebida') returning id into v_m2;

  r := public.agente_pedir_humano(v_conv, 'Comprovante recebido', v_m1);
  insert into resultado (teste, ok) values ('mensagem nova: o agente não chama a equipe atendendo uma mensagem velha',
    not (r ->> 'sucesso')::boolean and (r ->> 'mensagem_nova')::boolean
    and (select estado = 'bot' from public.conversas where id = v_conv));
  r := public.agente_pedir_humano(v_conv, 'Comprovante e pedido de motoboy', v_m2);
  insert into resultado (teste, ok) values ('mensagem nova: atendendo a última, a conversa passa para a equipe',
    (r ->> 'sucesso')::boolean
    and (select estado = 'aguardando_humano' and motivo_humano = 'Comprovante e pedido de motoboy' from public.conversas where id = v_conv));
end $$;
insert into resultado (teste, ok) select 'mensagem nova: a função é só do agente',
  not has_function_privilege('authenticated', 'public.agente_pedir_humano(uuid, text, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.agente_pedir_humano(uuid, text, uuid)', 'execute');

-- Distribuição dos contatos novos do número da empresa (migration 20261105160000). Rodízio entre a1 e b1.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.canal_definir_distribuicao((select id from public.canais where instance_id = 'INST-F7'), true);
  insert into resultado (teste, ok) values ('distribuição: atendente não liga a distribuição', false);
exception when others then
  insert into resultado (teste, ok) values ('distribuição: atendente não liga a distribuição', sqlerrm like 'só dono e admin%');
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
begin
  update public.canais set responsavel_id = null where instance_id = 'INST-F7';
  perform public.canal_definir_distribuicao((select id from public.canais where instance_id = 'INST-F7'), true);
  perform public.membro_definir_recebe_contatos(v_org, '00000000-0000-0000-0000-0000000000a1', true);
  perform public.membro_definir_recebe_contatos(v_org, '00000000-0000-0000-0000-0000000000b1', true);
  insert into resultado (teste, ok) values ('distribuição: dono liga no número da empresa e escolhe quem recebe',
    (select distribuir from public.canais where instance_id = 'INST-F7')
    and (select count(*) from public.membros_org where org_id = v_org and recebe_contatos) = 2);
  begin
    perform public.canal_definir_distribuicao((select id from public.canais where instance_id = 'INST-VITOR'), true);
    insert into resultado (teste, ok) values ('distribuição: número de vendedor não distribui', false);
  exception when others then
    insert into resultado (teste, ok) values ('distribuição: número de vendedor não distribui', sqlerrm like 'número de vendedor%');
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
  v_canal uuid := (select id from public.canais where instance_id = 'INST-F7');
  v_ct uuid[] := '{}'; v_id uuid; v_conv uuid; i int; v_resp uuid[] := '{}';
begin
  update public.membros_org set ultima_distribuicao_em = null where org_id = v_org;
  for i in 1..3 loop
    insert into public.contatos (org_id, telefone, nome) values (v_org, '554190003310' || i, 'Lead ' || i) returning id into v_id;
    insert into public.conversas (org_id, canal_id, contato_id) values (v_org, v_canal, v_id) returning id into v_conv;
    v_ct := v_ct || v_id;
    v_resp := v_resp || (select responsavel_id from public.contatos where id = v_id);
    if i = 1 then perform set_config('teste.dist_conv', v_conv::text, true); end if;
  end loop;
  insert into resultado (teste, ok) values ('distribuição: contatos novos entram na carteira em rodízio',
    v_resp[1] is not null and v_resp[2] is not null and v_resp[1] <> v_resp[2] and v_resp[3] = v_resp[1]
    and v_resp[1] in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1'));
  insert into resultado (teste, ok) values ('distribuição: a conversa mostra para quem foi e a pessoa é avisada',
    exists (select 1 from public.mensagens where conversa_id = current_setting('teste.dist_conv')::uuid
             and autor_tipo = 'sistema' and texto like 'Contato novo distribuído para%')
    and (public.agente_contexto(current_setting('teste.dist_conv')::uuid) is not null));
  insert into resultado (teste, ok) values ('distribuição: o aviso de "aguardando" vai só para o vendedor do contato',
    public.push_destino_conversa(current_setting('teste.dist_conv')::uuid) = array[v_resp[1]]);

  -- Contato que já tem vendedor fica com ele; conversa começada pela equipe não distribui.
  insert into public.contatos (org_id, telefone, nome, responsavel_id)
  values (v_org, '5541900033201', 'Cliente antigo', '00000000-0000-0000-0000-0000000000d1') returning id into v_id;
  insert into public.conversas (org_id, canal_id, contato_id) values (v_org, v_canal, v_id);
  insert into resultado (teste, ok) values ('distribuição: contato que já tem vendedor continua com ele',
    (select responsavel_id from public.contatos where id = v_id) = '00000000-0000-0000-0000-0000000000d1');
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900033202', 'Prospecção') returning id into v_id;
  insert into public.conversas (org_id, canal_id, contato_id, estado, atribuida_a)
  values (v_org, v_canal, v_id, 'humano', '00000000-0000-0000-0000-0000000000a1');
  insert into resultado (teste, ok) values ('distribuição: conversa que a equipe começa não entra no rodízio',
    (select responsavel_id from public.contatos where id = v_id) is null);

  -- Desligada: nada muda, e o aviso volta para todos que veem o número.
  update public.canais set distribuir = false where id = v_canal;
  insert into public.contatos (org_id, telefone, nome) values (v_org, '5541900033203', 'Lead sem rodízio') returning id into v_id;
  insert into public.conversas (org_id, canal_id, contato_id) values (v_org, v_canal, v_id) returning id into v_conv;
  insert into resultado (teste, ok) values ('distribuição: desligada, o contato novo fica sem vendedor e o aviso vai para a equipe',
    (select responsavel_id from public.contatos where id = v_id) is null
    and cardinality(public.push_destino_conversa(v_conv)) >= 2);
  -- Número que ganha vendedor deixa de distribuir.
  update public.canais set distribuir = true where id = v_canal;
  update public.canais set responsavel_id = '00000000-0000-0000-0000-0000000000a1' where id = v_canal;
  insert into resultado (teste, ok) values ('distribuição: número que passa a ser de um vendedor para de distribuir',
    not (select distribuir from public.canais where id = v_canal));
  update public.canais set responsavel_id = null where id = v_canal;
end $$;
insert into resultado (teste, ok) select 'distribuição: rodízio fechado para o login',
  not has_function_privilege('authenticated', 'public.distribuir_contato(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.canal_definir_distribuicao(uuid, boolean)', 'execute');
reset role;
select n, teste, ok from resultado order by n;
