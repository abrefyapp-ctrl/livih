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

reset role;
select n, teste, ok from resultado order by n;
