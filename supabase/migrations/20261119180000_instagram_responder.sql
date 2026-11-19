-- Instagram, entrega 2: responder (docs/instagram.md, pedido do usuário em 19/11/2026).
--
-- A equipe e o agente passam a responder as conversas do Instagram pela Livih (a whatsapp-enviar ganha o envio pela
-- API do Instagram). Regras:
--   - janela da Meta: responder só até 24 horas depois da última mensagem do cliente (5 minutos de folga). Fora dela,
--     a resposta é recusada com o motivo, sem ficar parada na fila (instagram_pode_responder);
--   - eco do app do Instagram: o que a equipe digita direto no app entra na conversa e a passa para a equipe, como o
--     app do WhatsApp Business na coexistência (registrar_saida_instagram); resposta automática configurada entra sem
--     tirar a conversa do agente. A mensagem que a própria Livih mandou não é eco: cada parte é marcada pelo ID no
--     envio (instagram_marcar_enviada), e o eco que chega durante o envio também é dela;
--   - agente: sai a trava de agentes_sem_instagram; a conta já conectada ganha o agente desligado (cópia do da
--     empresa, como os números de WhatsApp). A cópia do alerta "o agente chamou a equipe" para o número da empresa sai
--     por WhatsApp; o follow-up, passadas as 24 horas no Instagram, vai para a equipe;
--   - o contexto do agente traz o canal (o n8n pede respostas curtas no Instagram).

-- ---- agente ----

drop trigger agentes_sem_instagram on public.agentes;
drop function public.agentes_sem_instagram();

-- Conta do Instagram já conectada: agente desligado, com as instruções do agente da empresa (como criarCanal).
insert into public.agentes (org_id, canal_id, ativo, prompt, regras_humano, telefone_alerta, modelo)
select k.org_id, k.id, false, m.prompt, m.regras_humano, m.telefone_alerta, m.modelo
  from public.canais k
  left join lateral (select a.prompt, a.regras_humano, a.telefone_alerta, a.modelo from public.agentes a
                      where a.org_id = k.org_id order by a.ativo desc, a.atualizado_em desc nulls last limit 1) m on true
 where k.tipo = 'instagram' and k.ativo
   and not exists (select 1 from public.agentes a where a.canal_id = k.id);

-- ---- janela de 24 horas ----

-- true = pode responder: conversa de WhatsApp (a regra da API oficial é outra, com modelo) ou do Instagram com
-- mensagem do cliente nas últimas 24 horas (menos 5 minutos de folga para a fila).
create function public.instagram_pode_responder(p_conversa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select k.tipo from public.conversas c join public.canais k on k.id = c.canal_id where c.id = p_conversa), '')
           <> 'instagram'
      or exists (select 1 from public.mensagens m
                  where m.conversa_id = p_conversa and m.direcao = 'entrada' and not m.automatica
                    and m.criado_em > now() - interval '23 hours 55 minutes');
$$;
revoke all on function public.instagram_pode_responder(uuid) from public, anon, authenticated;

-- ---- eco do app do Instagram ----

-- A whatsapp-enviar marca o ID de cada mensagem que manda ao Instagram (cada parte de um texto longo, o arquivo e a
-- legenda): o eco dela é reconhecido pelo ID, sem comparar texto nem depender de prazo (revisão de 19/11: comparar
-- texto engolia um "ok" digitado no app, e uma nova tentativa da fila depois de 10 minutos virava mensagem da equipe).
create function public.instagram_marcar_enviada(p_canal uuid, p_mid text, p_mensagem uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.eventos_recebidos (canal_id, wa_id, payload, processado_em)
  values (p_canal, p_mid, jsonb_build_object('enviada_pela_livih', p_mensagem), now())
  on conflict (canal_id, wa_id) do nothing;
$$;
revoke all on function public.instagram_marcar_enviada(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.instagram_marcar_enviada(uuid, text, uuid) to service_role;

create function public.registrar_saida_instagram(p_canal uuid, p_mid text, p_igsid text, p_tipo public.tipo_msg,
                                                 p_texto text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_evento bigint;
  v_contato uuid;
  v_conversa public.conversas;
  v_auto boolean;
begin
  select org_id into v_org from public.canais where id = p_canal and ativo and tipo = 'instagram';
  if v_org is null then
    raise exception 'canal do Instagram inativo ou inexistente';
  end if;
  if coalesce(btrim(p_mid), '') = '' then
    raise exception 'mensagem do Instagram sem ID';
  end if;
  -- Mensagem que a Livih mandou: o ID de cada parte é marcado no envio (instagram_marcar_enviada, em
  -- eventos_recebidos), e o da primeira também fica na mensagem. O insert abaixo esbarra na marca e devolve duplicada.
  if exists (select 1 from public.mensagens m join public.conversas c on c.id = m.conversa_id
              where c.canal_id = p_canal and m.direcao = 'saida' and m.wa_id = p_mid) then
    return jsonb_build_object('duplicada', true);
  end if;

  insert into public.eventos_recebidos (canal_id, wa_id, payload)
  values (p_canal, p_mid, p_payload)
  on conflict (canal_id, wa_id) do nothing
  returning id into v_evento;
  if v_evento is null then
    return jsonb_build_object('duplicada', true);
  end if;

  v_contato := public.contato_por_instagram(v_org, p_igsid, null, null);
  insert into public.conversas (org_id, canal_id, contato_id, estado)
  values (v_org, p_canal, v_contato, 'humano')
  on conflict (canal_id, contato_id) do nothing;
  select * into v_conversa from public.conversas where canal_id = p_canal and contato_id = v_contato for update;

  -- O eco chegou enquanto a Livih ainda mandava uma mensagem desta conversa (antes de marcar o ID dela): é dela.
  -- Uma mensagem digitada no app exatamente nesses segundos também cairia aqui; é raro, e o contrário (o eco da
  -- Livih virar mensagem da equipe) tiraria a conversa do agente.
  if exists (select 1 from public.fila_envio f where f.conversa_id = v_conversa.id and f.status = 'enviando') then
    update public.eventos_recebidos set processado_em = now(), erro = 'eco durante o envio da Livih' where id = v_evento;
    return jsonb_build_object('duplicada', true);
  end if;

  -- Resposta automática configurada (a mesma lista do WhatsApp, no agente do canal): entra sem tirar a conversa do
  -- agente, como em registrar_saida_celular.
  v_auto := public.eh_mensagem_automatica(p_canal, p_texto);
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, wa_id, status_entrega, automatica)
  values (v_org, v_conversa.id, 'saida', 'atendente', p_tipo, p_texto, p_mid, 'enviada', v_auto);
  if v_auto then
    update public.conversas
       set ultima_mensagem_em = now(), ultima_mensagem_resumo = left(coalesce(p_texto, '[' || p_tipo::text || ']'), 140)
     where id = v_conversa.id;
  else
    update public.conversas
       set ultima_mensagem_em = now(),
           ultima_mensagem_resumo = left(coalesce(p_texto, '[' || p_tipo::text || ']'), 140),
           estado = case when estado in ('bot', 'aguardando_humano', 'encerrada') then 'humano' else estado end,
           motivo_humano = case when estado in ('bot', 'aguardando_humano', 'encerrada')
                                then 'respondida pelo app do Instagram' else motivo_humano end,
           nao_lidas = 0
     where id = v_conversa.id;
  end if;
  update public.eventos_recebidos set processado_em = now() where id = v_evento;
  return jsonb_build_object('duplicada', false, 'conversa_id', v_conversa.id, 'automatica', v_auto);
end $$;
revoke all on function public.registrar_saida_instagram(uuid, text, text, public.tipo_msg, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.registrar_saida_instagram(uuid, text, text, public.tipo_msg, text, jsonb) to service_role;

-- ---- funções existentes ----
-- Definições atuais, com a troca indicada em cada uma; o resto, igual.

-- enfileirar_saida: No Instagram, só dentro das 24 horas (no lugar da recusa da entrega 1).
CREATE OR REPLACE FUNCTION public.enfileirar_saida(p_conversa uuid, p_texto text, p_autor autor_tipo, p_autor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_msg uuid;
begin
  if coalesce(btrim(p_texto), '') = '' then
    raise exception 'mensagem vazia';
  end if;
  select org_id into v_org from public.conversas where id = p_conversa;
  if not public.instagram_pode_responder(p_conversa) then
    raise exception 'Passaram 24 horas da última mensagem do cliente no Instagram: a Meta não deixa responder por aqui. Fale com ele pelo WhatsApp ou espere ele escrever de novo.';
  end if;
  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, autor_id, tipo, texto, status_entrega)
  values (v_org, p_conversa, 'saida', p_autor, p_autor_id, 'texto', p_texto, 'pendente')
  returning id into v_msg;
  insert into public.fila_envio (org_id, conversa_id, mensagem_id) values (v_org, p_conversa, v_msg);
  update public.conversas
     set ultima_mensagem_em = now(), ultima_mensagem_resumo = left(p_texto, 140)
   where id = p_conversa;
  return v_msg;
end $function$;

-- enviar_arquivo: No Instagram, só dentro das 24 horas (no lugar da recusa da entrega 1).
CREATE OR REPLACE FUNCTION public.enviar_arquivo(p_conversa uuid, p_path text, p_nome text, p_legenda text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conversa public.conversas;
  v_mime text;
  v_tamanho bigint;
  v_tipo public.tipo_msg;
  v_legenda text := nullif(btrim(coalesce(p_legenda, '')), '');
  v_nome text := left(btrim(coalesce(p_nome, '')), 200);
  v_msg uuid;
begin
  select * into v_conversa from public.conversas where id = p_conversa for update;
  if v_conversa.id is null or not public.pode_ver_canal(v_conversa.canal_id) then
    raise exception 'conversa não encontrada';
  end if;
  if not public.instagram_pode_responder(p_conversa) then
    raise exception 'Passaram 24 horas da última mensagem do cliente no Instagram: a Meta não deixa responder por aqui. Fale com ele pelo WhatsApp ou espere ele escrever de novo.';
  end if;
  if coalesce(p_path, '') not like v_conversa.org_id::text || '/' || p_conversa::text || '/%' then
    raise exception 'arquivo não pertence a esta conversa';
  end if;
  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint into v_mime, v_tamanho
    from storage.objects o
   where o.bucket_id = 'midias' and o.name = p_path and o.owner_id = auth.uid()::text;
  if v_tamanho is null then
    raise exception 'arquivo não encontrado';
  end if;
  if exists (select 1 from public.mensagens where midia_path = p_path) then
    raise exception 'arquivo já enviado';
  end if;
  if v_nome = '' then
    v_nome := 'arquivo';
  end if;
  v_mime := coalesce(nullif(v_mime, ''), 'application/octet-stream');

  v_tipo := case
    when v_mime in ('image/jpeg', 'image/png') and v_tamanho <= 5242880 then 'imagem'
    when v_mime in ('video/mp4', 'video/3gpp') and v_tamanho <= 16777216 then 'video'
    else 'documento'
  end;

  if v_conversa.estado <> 'humano' or v_conversa.atribuida_a is null then
    update public.conversas
       set estado = 'humano', atribuida_a = coalesce(atribuida_a, auth.uid()), nao_lidas = 0
     where id = p_conversa;
  else
    update public.conversas set nao_lidas = 0 where id = p_conversa;
  end if;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, autor_id, tipo, texto,
                                midia_path, midia_mime, midia_nome, status_entrega)
  values (v_conversa.org_id, p_conversa, 'saida', 'atendente', auth.uid(), v_tipo, v_legenda,
          p_path, v_mime, v_nome, 'pendente')
  returning id into v_msg;
  insert into public.fila_envio (org_id, conversa_id, mensagem_id) values (v_conversa.org_id, p_conversa, v_msg);
  update public.conversas
     set ultima_mensagem_em = now(), ultima_mensagem_resumo = left('📎 ' || coalesce(v_legenda, v_nome), 140)
   where id = p_conversa;
  return v_msg;
end $function$;

-- agente_enviar_arquivo: No Instagram, fora das 24 horas o arquivo do agente não sai (aviso, não erro, como a conversa com a equipe).
CREATE OR REPLACE FUNCTION public.agente_enviar_arquivo(p_conversa uuid, p_path text, p_nome text, p_legenda text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conv public.conversas;
  v_mime text;
  v_tamanho bigint;
  v_tipo public.tipo_msg;
  v_legenda text := nullif(btrim(coalesce(p_legenda, '')), '');
  v_nome text := coalesce(nullif(left(btrim(coalesce(p_nome, '')), 200), ''), 'arquivo');
  v_msg uuid;
begin
  perform public.agente_marcar();
  select * into v_conv from public.conversas where id = p_conversa;
  if v_conv.id is null then
    raise exception 'conversa não encontrada';
  end if;
  if v_conv.estado <> 'bot' then
    return jsonb_build_object('enviado', false, 'aviso', 'A conversa está com a equipe: não envie.');
  end if;
  if not public.instagram_pode_responder(p_conversa) then
    return jsonb_build_object('enviado', false, 'aviso', 'Passaram 24 horas da última mensagem do cliente no Instagram: não dá para enviar o arquivo.');
  end if;
  if coalesce(p_path, '') not like v_conv.org_id::text || '/' || p_conversa::text || '/%' then
    raise exception 'arquivo não pertence a esta conversa';
  end if;
  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint into v_mime, v_tamanho
    from storage.objects o where o.bucket_id = 'midias' and o.name = p_path;
  if v_tamanho is null then
    raise exception 'arquivo não encontrado';
  end if;
  if exists (select 1 from public.mensagens where midia_path = p_path) then
    raise exception 'arquivo já enviado';
  end if;
  v_mime := coalesce(nullif(v_mime, ''), 'application/octet-stream');
  v_tipo := case
    when v_mime in ('image/jpeg', 'image/png') and v_tamanho <= 5242880 then 'imagem'
    when v_mime in ('video/mp4', 'video/3gpp') and v_tamanho <= 16777216 then 'video'
    else 'documento'
  end;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, midia_path, midia_mime, midia_nome, status_entrega)
  values (v_conv.org_id, p_conversa, 'saida', 'bot', v_tipo, v_legenda, p_path, v_mime, v_nome, 'pendente')
  returning id into v_msg;
  insert into public.fila_envio (org_id, conversa_id, mensagem_id) values (v_conv.org_id, p_conversa, v_msg);
  update public.conversas
     set ultima_mensagem_em = now(), ultima_mensagem_resumo = left('📎 ' || coalesce(v_legenda, v_nome), 140)
   where id = p_conversa;
  return jsonb_build_object('enviado', true, 'mensagem_id', v_msg);
end $function$;

-- agente_responder: No Instagram, fora das 24 horas o agente recebe o motivo em vez de um erro (que derrubava a execução no n8n).
CREATE OR REPLACE FUNCTION public.agente_responder(p_conversa uuid, p_texto text, p_mensagem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.agente_marcar();
  if not public.instagram_pode_responder(p_conversa) then
    return jsonb_build_object('enviado', false, 'motivo', 'passaram 24 horas da última mensagem do cliente no Instagram');
  end if;
  -- Confere de novo na hora de gravar: entre pensar e responder o cliente pode ter escrito de
  -- novo ou um atendente pode ter assumido. Exceção: se foi o próprio agente que acabou de passar
  -- a conversa para a equipe nesta rodada, a mensagem de despedida ("vou chamar alguém") sai.
  if not public.agente_deve_responder(p_conversa, p_mensagem)
     and not exists (
       select 1 from public.conversas c
        where c.id = p_conversa and c.estado = 'aguardando_humano' and c.atribuida_a is null
          and p_mensagem = (select id from public.mensagens where conversa_id = p_conversa and direcao = 'entrada'
                             order by criado_em desc limit 1)
          and exists (select 1 from public.auditoria a
                       where a.entidade = 'conversas' and a.entidade_id = p_conversa::text
                         and a.acao = 'conversa_estado' and a.ator_tipo = 'bot'
                         and a.criado_em >= (select criado_em from public.mensagens where id = p_mensagem))
     ) then
    return jsonb_build_object('enviado', false, 'motivo', 'conversa mudou enquanto o agente pensava');
  end if;
  return jsonb_build_object('enviado', true, 'mensagem_id', public.enfileirar_saida(p_conversa, p_texto, 'bot', null));
end $function$;

-- agente_chamar_humano: A cópia do alerta para o número da empresa sai por WhatsApp mesmo quando a conversa é do Instagram.
CREATE OR REPLACE FUNCTION public.agente_chamar_humano(p_conversa uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conv public.conversas;
  v_agente public.agentes;
  v_contato public.contatos;
  v_vendedor uuid;
  v_destino uuid[];
  v_pessoa uuid;
  v_tel text;
  v_canal uuid;
  v_ja text[] := '{}';
  v_cliente text;
  v_link text;
  v_equipe text;
  v_avisados integer := 0;
begin
  perform public.agente_marcar();
  select * into v_conv from public.conversas where id = p_conversa for update;
  if v_conv.estado <> 'bot' then
    return jsonb_build_object('sucesso', true, 'aviso', 'a conversa já está com a equipe');
  end if;
  update public.conversas set estado = 'aguardando_humano', motivo_humano = left(p_motivo, 300) where id = p_conversa;

  select * into v_agente from public.agentes where canal_id = v_conv.canal_id;
  select * into v_contato from public.contatos where id = v_conv.contato_id;
  v_cliente := coalesce(v_contato.nome, v_contato.nome_whatsapp, 'sem nome') || coalesce(' (' || v_contato.telefone || ')', '');
  -- O app tem um endereço só; o link abre a conversa (quem não tem acesso a ela vê a lista).
  v_link := 'https://app.livih.com.br/conversas/' || p_conversa;
  -- Motivo nulo deixaria o texto nulo, o alerta falharia e a passagem para a equipe voltaria junto.
  p_motivo := coalesce(nullif(btrim(p_motivo), ''), 'não informado');

  v_vendedor := public.vendedor_da_conversa(p_conversa);
  v_destino := public.quem_atende_conversa(p_conversa);
  if v_vendedor is null and cardinality(v_destino) > 0 then
    select e.nome into v_equipe from public.membros_org m join public.equipes e on e.id = m.equipe_id
     where m.org_id = v_conv.org_id and m.user_id = v_destino[1];
  end if;

  foreach v_pessoa in array v_destino loop
    select p.telefone into v_tel from public.perfis p where p.user_id = v_pessoa;
    continue when v_tel is null or v_tel = any(v_ja);
    -- Telefone que é um número ligado à Livih (o vendedor que pôs o próprio número comercial em "Seus dados"): o
    -- alerta entraria como conversa nova e um agente poderia responder ao outro. Ele já vê a conversa no número.
    continue when exists (select 1 from public.canais cn where cn.telefone = v_tel and cn.ativo);
    v_canal := public.canal_para_avisar(v_conv.org_id, v_pessoa);
    continue when v_canal is null;
    insert into public.alertas (org_id, canal_id, telefone, texto, conversa_id)
    values (v_conv.org_id, v_canal, v_tel,
            case when v_vendedor is not null then '🔔 *Livih — cliente aguardando você*'
                 else '🔔 *Livih — cliente sem vendedor disponível*' || coalesce(E'\n' || 'Equipe: ' || v_equipe, '') end
            || E'\n\n' || 'Contato: ' || v_cliente || E'\n' || 'Motivo: ' || p_motivo || E'\n\n'
            || case when v_vendedor is null then 'Abra e passe para alguém da equipe:' || E'\n' else '' end || v_link,
            p_conversa);
    v_ja := v_ja || v_tel;
    v_avisados := v_avisados + 1;
  end loop;

  -- Cópia para o número da empresa (opcional), pelo número da própria conversa, como antes.
  v_canal := case when (select tipo from public.canais where id = v_conv.canal_id) in ('waha', 'meta') then v_conv.canal_id
                  else public.canal_para_avisar(v_conv.org_id, null) end;
  if v_canal is not null and v_agente.telefone_alerta is not null and not v_agente.telefone_alerta = any(v_ja) then
    insert into public.alertas (org_id, canal_id, telefone, texto, conversa_id)
    values (v_conv.org_id, v_canal, v_agente.telefone_alerta,
            '🔔 *Livih — cliente aguardando a equipe*' || E'\n\n' ||
            'Contato: ' || v_cliente || E'\n' ||
            coalesce('Vendedor: ' || (select coalesce(nullif(btrim(p.nome), ''), split_part(u.email::text, '@', 1))
                                   from auth.users u left join public.perfis p on p.user_id = u.id
                                  where u.id = v_vendedor) || E'\n', '') ||
            'Motivo: ' || p_motivo || E'\n\n' || v_link,
            p_conversa);
    v_avisados := v_avisados + 1;
  end if;
  return jsonb_build_object('sucesso', true, 'equipe_avisada', v_avisados > 0);
end $function$;

-- followup_rodar: Passadas as 24 horas no Instagram, a retomada vai para a equipe (lá não existe modelo aprovado).
CREATE OR REPLACE FUNCTION public.followup_rodar()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  t public.tarefas;
  v_f public.agente_followup;
  v_ct public.contatos;
  v_conv public.conversas;
  v_canal public.canais;
  v_ag public.agentes;
  v_motivo text;
  v_entrada timestamptz;
  v_total integer := 0;
begin
  perform public.followup_detectar();

  for t in
    select tf.* from public.tarefas tf
     where tf.executor = 'agente' and tf.status = 'aberta' and tf.vence_em <= now()
       and (tf.enviando_em is null or tf.enviando_em < now() - interval '10 minutes')
     order by tf.vence_em
     limit 30
     for update skip locked
  loop
    select * into v_f from public.agente_followup where org_id = t.org_id;
    select * into v_ct from public.contatos where id = t.contato_id;
    -- A conversa da tarefa, se o agente estiver ligado naquele número; senão a mais recente com o agente ligado.
    v_conv := null;
    select c.* into v_conv from public.conversas c join public.agentes a on a.canal_id = c.canal_id and a.ativo
     where c.contato_id = t.contato_id
     order by (c.id = t.conversa_id) desc, c.ultima_mensagem_em desc nulls last
     limit 1;

    v_motivo := case
      when v_f.org_id is null or not v_f.ativo then 'a retomada pelo agente está desligada'
      when (select status from public.organizacoes where id = t.org_id) <> 'ativa' then 'a empresa não está ativa'
      when v_ct.sem_agente then 'o contato está marcado para não ser atendido pelo agente'
      when v_ct.descadastrado_em is not null then 'o contato pediu para não receber mensagens'
      when v_conv.id is null then 'não há conversa num número com o agente ligado'
    end;
    if v_motivo is not null then
      update public.tarefas set status = 'cancelada', resultado = left('Não enviada: ' || v_motivo, 500), enviando_em = null
       where id = t.id;
      continue;
    end if;

    select * into v_ag from public.agentes where canal_id = v_conv.canal_id;
    select * into v_canal from public.canais where id = v_conv.canal_id;
    -- Fora do horário do agente ou número desconectado: tenta de novo mais tarde.
    if not public.agente_no_horario(v_ag.horario, now()) then
      update public.tarefas set vence_em = now() + interval '30 minutes' where id = t.id;
      continue;
    end if;
    if not v_canal.ativo or (v_canal.tipo = 'waha' and v_canal.status_conexao is distinct from 'WORKING') then
      update public.tarefas set vence_em = now() + interval '1 hour' where id = t.id;
      continue;
    end if;
    -- No máximo uma retomada enviada por contato a cada 20 h.
    if exists (select 1 from public.tarefas x where x.contato_id = t.contato_id and x.executor = 'agente'
                and x.mensagem_id is not null and x.concluida_em > now() - interval '20 hours') then
      update public.tarefas set vence_em = now() + interval '20 hours' where id = t.id;
      continue;
    end if;
    if public.agente_franquia_esgotada(v_conv.id) then
      perform public.followup_para_equipe(t.id, 'os atendimentos do agente deste mês acabaram');
      continue;
    end if;

    select max(criado_em) into v_entrada from public.mensagens
     where conversa_id = v_conv.id and direcao = 'entrada' and not automatica;
    if v_canal.tipo = 'instagram' and (v_entrada is null or v_entrada < now() - interval '23 hours 30 minutes') then
      perform public.followup_para_equipe(t.id, 'passaram as 24 horas do Instagram, e a Meta não deixa o agente escrever');
      continue;
    end if;
    if v_canal.tipo = 'meta' and (v_entrada is null or v_entrada < now() - interval '23 hours 30 minutes') then
      if v_f.modelo is null then
        perform public.followup_para_equipe(t.id, 'passaram as 24 horas do WhatsApp e não há modelo de retomada configurado');
      else
        perform public.followup_enviar_modelo(t.id, v_conv.id, v_f.modelo);
        v_total := v_total + 1;
      end if;
      continue;
    end if;

    -- O agente escreve: a Edge Function lê a conversa e chama agente_followup_concluir.
    update public.tarefas set enviando_em = now(), conversa_id = v_conv.id where id = t.id;
    perform public.chamar_funcao('agente-followup', jsonb_build_object('tarefa_id', t.id));
    v_total := v_total + 1;
  end loop;
  return v_total;
end $function$;

-- agente_contexto: O canal da conversa (o n8n pede respostas curtas no Instagram) e o @ do contato.
CREATE OR REPLACE FUNCTION public.agente_contexto(p_conversa uuid, p_limite integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'canal', (select jsonb_build_object('tipo', k.tipo, 'nome', k.nome) from public.canais k where k.id = v_conv.canal_id),
    -- A distribuição está esperando a cidade do contato: o agente pergunta e grava com atualizar_contato, e o
    -- gatilho de contatos distribui (20261113120000).
    'perguntar_cidade', v_conv.distribuir_pendente_em is not null,
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
                                          'empresa', ct.empresa, 'email', ct.email, 'dados', ct.dados,
                                          'instagram_usuario', ct.instagram_usuario)
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
end $function$;
