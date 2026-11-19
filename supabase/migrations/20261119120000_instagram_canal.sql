-- Instagram, entrega 1: conectar e receber (docs/instagram.md, pedido do usuário em 19/11/2026).
--
-- A pessoa responde a um Story ou manda mensagem no Direct, e a conversa entra na Livih como as do WhatsApp. O que
-- muda no banco:
--   - canal novo do tipo `instagram`, com o ID da conta profissional em `instance_id` (o unique (tipo, instance_id)
--     já impede a mesma conta em duas empresas);
--   - contato sem telefone: quem chega pelo Instagram tem só o IGSID (o ID que a Meta dá à pessoa para aquela conta).
--     `contatos_identificacao` passa a aceitar telefone, LID do WhatsApp ou Instagram. O nome do perfil vai em
--     `nome_whatsapp`, que vira "nome do perfil" (WhatsApp ou Instagram): telas, agente e campanhas já usam esse campo
--     quando falta o nome;
--   - `registrar_entrada_instagram`, irmã da `registrar_entrada`; a parte comum (conversa, mensagem, estado, agente)
--     saiu para `entrada_gravar`, usada pelas duas, para as regras não se separarem;
--   - o Instagram **não ocupa vaga de número de WhatsApp** no plano, e o que só funciona no WhatsApp (alertas para a
--     equipe, aviso de pedido, nota fiscal, conversa nova pela Livih, contagem de números) passa a escolher só canais
--     `waha` e `meta`;
--   - até a entrega 2, responder pela Livih numa conversa do Instagram é recusado com o motivo (o envio ainda não
--     existe e a mensagem ficaria parada na fila).
-- O agente no Instagram vem na entrega 2: sem agente no canal, a conversa já entra "com a equipe" (Agente desligado).
--
-- Revisão de 19/11 (revisor-banco), já aqui: a conta do Instagram só entra, volta ou muda pelo login da Meta (gatilho
-- recusa a gravação direta pela API); agente no canal do Instagram recusado até a entrega 2; o IGSID do contato não muda
-- pela tela; 'instagram' é origem provisória do contato (como 'whatsapp'); WhatsApp (entrada, eco do celular, segredo do
-- WAHA) só em canal de WhatsApp; contato sem telefone fora dos destinos da nota.

-- ---- canal ----

alter table public.canais drop constraint canais_tipo_check;
alter table public.canais add constraint canais_tipo_check check (tipo in ('waha', 'meta', 'instagram'));
comment on column public.canais.instance_id is
  'WAHA: nome da sessão; API oficial: phone_number_id; Instagram: ID da conta profissional (Instagram Business Account ID)';

-- ---- contato ----

alter table public.contatos
  add column instagram_id text check (instagram_id ~ '^[0-9]{5,30}$'),
  add column instagram_usuario text check (instagram_usuario ~ '^[A-Za-z0-9._]{1,30}$');
comment on column public.contatos.instagram_id is
  'IGSID: o ID da pessoa no Instagram, dado pela Meta para a conta da empresa (único por empresa)';
comment on column public.contatos.instagram_usuario is 'O @ da pessoa no Instagram, sem a arroba';
comment on column public.contatos.nome_whatsapp is 'Nome do perfil da pessoa no WhatsApp ou no Instagram';
alter table public.contatos add constraint contatos_org_id_instagram_id_key unique (org_id, instagram_id);

alter table public.contatos drop constraint contatos_identificacao;
alter table public.contatos add constraint contatos_identificacao
  check (telefone is not null or whatsapp_lid is not null or instagram_id is not null);

-- Conta do Instagram → canal ativo (como canal_por_numero_meta). Só as Edge Functions.
create function public.canal_por_instagram(p_conta text)
returns table (canal_id uuid, org_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.id, c.org_id
    from public.canais c
    join public.organizacoes o on o.id = c.org_id and o.status = 'ativa'
   where c.tipo = 'instagram' and c.instance_id = p_conta and c.ativo;
$$;
revoke all on function public.canal_por_instagram(text) from public, anon, authenticated;
grant execute on function public.canal_por_instagram(text) to service_role;

-- Acha ou cria o contato pelo IGSID; o @ e o nome do perfil são atualizados quando mudam.
create function public.contato_por_instagram(p_org uuid, p_igsid text, p_usuario text, p_nome text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_usuario text := nullif(ltrim(btrim(coalesce(p_usuario, '')), '@'), '');
  v_nome text := left(nullif(btrim(coalesce(p_nome, '')), ''), 120);
begin
  if coalesce(p_igsid, '') !~ '^[0-9]{5,30}$' then
    raise exception 'mensagem do Instagram sem o ID da pessoa';
  end if;
  if v_usuario !~ '^[A-Za-z0-9._]{1,30}$' then
    v_usuario := null;
  end if;
  select id into v_id from public.contatos where org_id = p_org and instagram_id = p_igsid;
  if v_id is null then
    -- Duas mensagens da mesma pessoa nova ao mesmo tempo: a segunda acha o contato que a primeira criou.
    -- Origem 'instagram' é provisória, como 'whatsapp': a regra de origem ou a do canal a troca (mensagens_origem).
    insert into public.contatos (org_id, instagram_id, instagram_usuario, nome_whatsapp, origem)
    values (p_org, p_igsid, v_usuario, v_nome, 'instagram')
    on conflict (org_id, instagram_id) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.contatos where org_id = p_org and instagram_id = p_igsid;
    end if;
  else
    update public.contatos
       set instagram_usuario = coalesce(v_usuario, instagram_usuario),
           nome_whatsapp = coalesce(v_nome, nome_whatsapp)
     where id = v_id
       and (v_usuario is distinct from instagram_usuario and v_usuario is not null
            or v_nome is distinct from nome_whatsapp and v_nome is not null);
  end if;
  return v_id;
end $$;
revoke all on function public.contato_por_instagram(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.contato_por_instagram(uuid, text, text, text) to service_role;

-- ---- entrada ----

-- A parte da entrada que não depende do canal: conversa (reabre a encerrada), mensagem, resumo, não lidas e se chama
-- o agente. Era o miolo da registrar_entrada, igual.
create function public.entrada_gravar(p_org uuid, p_canal uuid, p_evento bigint, p_contato uuid, p_wa_id text,
                                      p_tipo public.tipo_msg, p_texto text, p_midia_mime text, p_transcricao text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conversa public.conversas;
  v_msg uuid;
  v_agente_ativo boolean;
begin
  insert into public.conversas (org_id, canal_id, contato_id)
  values (p_org, p_canal, p_contato)
  on conflict (canal_id, contato_id) do nothing;

  select * into v_conversa from public.conversas
   where canal_id = p_canal and contato_id = p_contato
   for update;

  if v_conversa.estado = 'encerrada' then
    update public.conversas set estado = 'bot', atribuida_a = null, motivo_humano = null
     where id = v_conversa.id
     returning * into v_conversa;
  end if;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, transcricao,
                                midia_mime, wa_id, status_entrega)
  values (p_org, v_conversa.id, 'entrada', 'contato', p_tipo, p_texto, p_transcricao,
          p_midia_mime, p_wa_id, 'recebida')
  returning id into v_msg;

  update public.conversas
     set ultima_mensagem_em = now(),
         ultima_mensagem_resumo = left(coalesce(p_texto, p_transcricao, '[' || p_tipo::text || ']'), 140),
         nao_lidas = nao_lidas + 1
   where id = v_conversa.id;

  update public.eventos_recebidos set processado_em = now() where id = p_evento;

  select coalesce(bool_or(ativo), false) into v_agente_ativo from public.agentes where canal_id = p_canal;

  -- Sem agente ligado, ninguém responderia uma conversa "com o agente": vai direto para a equipe.
  if v_conversa.estado = 'bot' and not v_agente_ativo then
    update public.conversas set estado = 'aguardando_humano', motivo_humano = 'Agente desligado'
     where id = v_conversa.id
     returning * into v_conversa;
  end if;

  return jsonb_build_object(
    'duplicada', false,
    'org_id', p_org,
    'conversa_id', v_conversa.id,
    'mensagem_id', v_msg,
    'estado', v_conversa.estado,
    'chamar_agente', v_conversa.estado = 'bot' and v_agente_ativo
  );
end $$;
-- Só as funções de entrada (security definer) chamam; nem as Edge Functions chamam direto.
revoke all on function public.entrada_gravar(uuid, uuid, bigint, uuid, text, public.tipo_msg, text, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.registrar_entrada(p_canal uuid, p_wa_id text, p_telefone text, p_lid text,
  p_nome_whatsapp text, p_tipo public.tipo_msg, p_texto text, p_payload jsonb, p_midia_mime text default null,
  p_transcricao text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_evento bigint;
begin
  -- Só canal de WhatsApp: mensagem com telefone não entra num canal do Instagram (revisão de 19/11).
  select org_id into v_org from public.canais where id = p_canal and ativo and tipo in ('waha', 'meta');
  if v_org is null then
    raise exception 'canal inativo ou inexistente';
  end if;

  insert into public.eventos_recebidos (canal_id, wa_id, payload)
  values (p_canal, p_wa_id, p_payload)
  on conflict (canal_id, wa_id) do nothing
  returning id into v_evento;
  if v_evento is null then
    return jsonb_build_object('duplicada', true);
  end if;

  return public.entrada_gravar(v_org, p_canal, v_evento,
    public.contato_por_whatsapp(v_org, p_telefone, p_lid, p_nome_whatsapp),
    p_wa_id, p_tipo, p_texto, p_midia_mime, p_transcricao);
end $$;

-- Mensagem do Direct (p_mid = o ID da mensagem na Meta, que faz o papel do wa_id e impede gravar duas vezes).
create function public.registrar_entrada_instagram(p_canal uuid, p_mid text, p_igsid text, p_usuario text,
  p_nome text, p_tipo public.tipo_msg, p_texto text, p_payload jsonb, p_midia_mime text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_evento bigint;
begin
  select org_id into v_org from public.canais where id = p_canal and ativo and tipo = 'instagram';
  if v_org is null then
    raise exception 'canal do Instagram inativo ou inexistente';
  end if;
  if coalesce(btrim(p_mid), '') = '' then
    raise exception 'mensagem do Instagram sem ID';
  end if;

  insert into public.eventos_recebidos (canal_id, wa_id, payload)
  values (p_canal, p_mid, p_payload)
  on conflict (canal_id, wa_id) do nothing
  returning id into v_evento;
  if v_evento is null then
    return jsonb_build_object('duplicada', true);
  end if;

  return public.entrada_gravar(v_org, p_canal, v_evento,
    public.contato_por_instagram(v_org, p_igsid, p_usuario, p_nome),
    p_mid, p_tipo, p_texto, p_midia_mime, null);
end $$;
revoke all on function public.registrar_entrada_instagram(uuid, text, text, text, text, public.tipo_msg, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.registrar_entrada_instagram(uuid, text, text, text, text, public.tipo_msg, text, jsonb, text)
  to service_role;

-- ---- o que só o sistema faz (revisão de 19/11) ----

-- A conta do Instagram só entra, volta ou muda pelo login da Meta (whatsapp-conexao, service_role). Pela API, o dono
-- poderia gravar o ID da conta de outra empresa e travar a conexão dela, ou reativar uma conta removida sem login.
-- Invoker de propósito: current_user é 'authenticated' na gravação direta pela API e o dono da função dentro das
-- funções security definer.
create function public.canais_instagram_pelo_sistema()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and new.tipo = 'instagram'
     and (tg_op = 'INSERT' or old.tipo is distinct from new.tipo or old.ativo is distinct from new.ativo
          or old.instance_id is distinct from new.instance_id) then
    raise exception 'Conta do Instagram só se conecta pelo botão Conectar Instagram.';
  end if;
  return new;
end $$;
create trigger canais_instagram_pelo_sistema before insert or update on public.canais
  for each row execute function public.canais_instagram_pelo_sistema();

-- O IGSID identifica a pessoa no Direct: trocá-lo pela tela faria a próxima mensagem criar outro contato.
create function public.contatos_instagram_pelo_sistema()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated'
     and (tg_op = 'INSERT' and new.instagram_id is not null
          or tg_op = 'UPDATE' and old.instagram_id is distinct from new.instagram_id) then
    raise exception 'O Instagram do contato vem da conversa; não dá para mudar pela tela.';
  end if;
  return new;
end $$;
create trigger contatos_instagram_pelo_sistema before insert or update on public.contatos
  for each row execute function public.contatos_instagram_pelo_sistema();

-- Entrega 1: sem agente no Instagram (o envio ainda não existe; o agente responderia e nada sairia, com a conversa
-- presa "com o agente"). A entrega 2 tira este gatilho.
create function public.agentes_sem_instagram()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select tipo from public.canais where id = new.canal_id) = 'instagram' then
    raise exception 'O agente no Instagram chega na próxima etapa da Livih. Por enquanto, a equipe atende o Direct.';
  end if;
  return new;
end $$;
create trigger agentes_sem_instagram before insert or update of canal_id on public.agentes
  for each row execute function public.agentes_sem_instagram();
revoke all on function public.canais_instagram_pelo_sistema() from public, anon, authenticated;
revoke all on function public.contatos_instagram_pelo_sistema() from public, anon, authenticated;
revoke all on function public.agentes_sem_instagram() from public, anon, authenticated;

-- ---- o que só funciona no WhatsApp ----
-- Definições atuais, com o filtro `tipo in ('waha', 'meta')` (ou a recusa) acrescentado; o resto, igual.

-- canais_limite_plano: O Instagram não ocupa vaga de número de WhatsApp.
CREATE OR REPLACE FUNCTION public.canais_limite_plano()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_msg text;
begin
  if not new.ativo or new.tipo not in ('waha', 'meta') or (tg_op = 'UPDATE' and old.ativo) then
    return new;
  end if;
  -- Dois números conectados ao mesmo tempo (ou uma descida e uma conexão) não passam juntos do limite.
  perform pg_advisory_xact_lock(hashtextextended('livih-canais:' || new.org_id::text, 0));
  v_msg := public.canais_sem_vaga(new.org_id, new.id);
  if v_msg is not null then
    raise exception '%', v_msg;
  end if;
  return new;
end $function$;

-- canais_sem_vaga: Conta só os números de WhatsApp.
CREATE OR REPLACE FUNCTION public.canais_sem_vaga(p_org uuid, p_ignorar uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limite integer;
  v_plano text;
  v_eh_proximo boolean;
  v_em date;
  v_qtd integer;
begin
  select l.numeros, l.nome, l.proximo, o.plano_proximo_em into v_limite, v_plano, v_eh_proximo, v_em
    from public.organizacoes o
    join public.planos pa on pa.codigo = o.plano
    left join public.planos pp on pp.codigo = o.plano_proximo
    cross join lateral (
      select x.numeros, x.nome, x.proximo
        from (values (pa.numeros_whatsapp, pa.nome, false), (pp.numeros_whatsapp, pp.nome, true)) x(numeros, nome, proximo)
       where x.numeros is not null order by x.numeros, x.proximo limit 1
    ) l
   where o.id = p_org;
  if v_limite is null then
    return null;
  end if;
  select count(*) into v_qtd from public.canais where org_id = p_org and ativo and tipo in ('waha', 'meta') and id is distinct from p_ignorar;
  if v_qtd < v_limite then
    return null;
  end if;
  if v_eh_proximo then
    return format('O plano %s, que começa em %s, permite %s de WhatsApp, e a empresa já tem %s. Para conectar outro, '
      || 'remova um número que não usa (Configurar → Remover número; só desconectar não libera a vaga). Ou o dono desiste '
      || 'da troca em Configurações → Plano e consumo.',
      v_plano, to_char(v_em, 'DD/MM'), case when v_limite = 1 then '1 número' else v_limite || ' números' end, v_qtd);
  end if;
  return format('O plano %s permite %s de WhatsApp, e a empresa já tem %s. Para conectar outro, remova um número que não '
    || 'usa (Configurar → Remover número; só desconectar não libera a vaga). Ou o dono sobe de plano em Configurações → '
    || 'Plano e consumo.', v_plano, case when v_limite = 1 then '1 número' else v_limite || ' números' end, v_qtd);
end $function$;

-- plano_trocar: Conta só os números de WhatsApp.
CREATE OR REPLACE FUNCTION public.plano_trocar(p_org uuid, p_plano text, p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.organizacoes;
  atual public.planos;
  novo public.planos;
  c public.contratos_cobranca;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_mes date := public.mes_brasilia();
  v_prox date := (public.mes_brasilia() + interval '1 month')::date;
  v_anual boolean;
  v_renova date;
  v_fim date;
  v_dias integer;
  v_dias_mes integer;
  v_meses integer;
  v_valor numeric := 0;
  v_cheio boolean;
  v_extra integer;
  v_reducao integer := 0;
  v_limite integer;
  v_qtd integer;
  v_modulos text;
  v_avulsa uuid;
  v_anual_cobrado boolean;
begin
  if not public.eh_dono_de_fato(p_org) then
    raise exception 'Só o dono da empresa troca o plano. Se precisar trocar, fale com o dono.';
  end if;
  select * into o from public.organizacoes where id = p_org for update;
  -- A mesma trava do gatilho dos números: descer e conectar um número ao mesmo tempo não passam juntos do limite.
  perform pg_advisory_xact_lock(hashtextextended('livih-canais:' || p_org::text, 0));
  select * into novo from public.planos where codigo = p_plano and codigo <> 'interno';
  if novo.codigo is null then
    raise exception 'Escolha um dos planos da lista.';
  end if;
  select * into c from public.contratos_cobranca where org_id = p_org for update;
  if c.org_id is null or not c.ativo then
    raise exception 'Para escolher ou trocar o plano, fale com a equipe da Livih.';
  end if;
  if c.valor_fixo is not null then
    raise exception 'O plano da sua empresa tem um valor combinado. Para trocar, fale com a equipe da Livih.';
  end if;
  select * into atual from public.planos where codigo = o.plano;
  v_anual := c.ciclo = 'anual';
  v_renova := (c.anual_inicio + interval '12 months')::date;
  -- A renovação só vale como data depois que a fatura do ano saiu; antes (teste grátis, dia 1 antes do fechamento,
  -- empresa suspensa na virada), descer e desligar valem no dia 1 seguinte, e a fatura do ano já sai com a troca.
  v_anual_cobrado := v_anual and c.anual_inicio <= v_mes and not public.anual_a_cobrar(p_org, v_mes);
  v_fim := case when v_anual_cobrado then v_renova else v_prox end;

  if novo.codigo = o.plano then
    if o.plano_proximo is null then
      return jsonb_build_object('tipo', 'igual', 'plano', novo.nome);
    end if;
    if p_confirmar then
      update public.organizacoes set plano_proximo = null, plano_proximo_em = null where id = p_org;
      insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
      values (p_org, 'atendente', auth.uid(), 'cancelar_troca_plano', 'organizacoes', p_org::text,
              jsonb_build_object('plano_proximo', o.plano_proximo), jsonb_build_object('plano_proximo', null));
    end if;
    return jsonb_build_object('tipo', 'cancelar', 'plano', novo.nome);
  end if;

  -- Menos números do que a empresa tem: remove antes (decisão de 02/11).
  select count(*) into v_qtd from public.canais where org_id = p_org and ativo and tipo in ('waha', 'meta');
  if novo.numeros_whatsapp is not null and v_qtd > novo.numeros_whatsapp then
    raise exception 'O plano % permite % de WhatsApp, e a empresa tem % em Configurações → WhatsApp. Para trocar, remova % lá (botão Remover; Desconectar não libera a vaga) e tente de novo.',
      novo.nome,
      case when novo.numeros_whatsapp = 1 then '1 número' else novo.numeros_whatsapp || ' números' end,
      case when v_qtd = 1 then '1 número' else v_qtd || ' números' end, case when v_qtd - novo.numeros_whatsapp = 1 then '1 número' else (v_qtd - novo.numeros_whatsapp) || ' números' end;
  end if;

  if coalesce(novo.preco_mensal, 0) > coalesce(atual.preco_mensal, 0) then
    v_dias_mes := v_prox - v_mes;
    v_dias := v_prox - v_hoje;
    v_meses := public.meses_entre(v_mes, v_renova);
    -- A fatura que leva o plano (a do mês, ou a do começo do ano) ainda vai sair: sai com o plano novo inteiro.
    v_cheio := c.inicio <= v_mes and case when v_anual then public.anual_a_cobrar(p_org, v_mes)
      else not exists (select 1 from public.faturas where org_id = p_org and competencia = v_mes and tipo = 'mes'
                          and status <> 'cancelada') end;
    if not v_cheio then
      if c.inicio <= v_mes and (not v_anual or c.anual_inicio <= v_mes) then
        v_valor := case when v_anual
                        then round((novo.preco_anual - coalesce(atual.preco_anual, 0)) * v_meses / 12, 2)
                        else round((novo.preco_mensal - coalesce(atual.preco_mensal, 0)) * v_dias / v_dias_mes, 2) end;
      end if;
      -- Plano interno (sem limite) não tem franquia para comparar: o plano novo vem cheio.
      if atual.atendimentos is not null then
        v_extra := floor((novo.atendimentos - atual.atendimentos) * v_dias::numeric / v_dias_mes);
        v_reducao := (novo.atendimentos - atual.atendimentos) - v_extra;
      end if;
    end if;
    select f.limite into v_limite from public.franquia_do_mes(p_org) f;
    if p_confirmar then
      update public.organizacoes set plano = novo.codigo, plano_proximo = null, plano_proximo_em = null where id = p_org;
      if v_valor >= 0.01 and v_anual then
        v_avulsa := public.cobranca_criar_avulsa(p_org, jsonb_build_array(jsonb_build_object(
          'descricao', 'Diferença do plano ' || novo.nome || ' anual de ' || to_char(v_mes, 'MM/YYYY') || ' a '
                       || to_char((v_renova - interval '1 month')::date, 'MM/YYYY') || ' (' || v_meses || ' de 12 meses)',
          'quantidade', 1, 'valor', v_valor, 'anual', true)));
      elsif v_valor >= 0.01 then
        insert into public.cobranca_ajustes (org_id, mes, descricao, valor, criado_por)
        values (p_org, v_mes, 'Diferença do plano ' || novo.nome || ' de ' || to_char(v_hoje, 'DD/MM') || ' a '
                || to_char(v_prox - 1, 'DD/MM') || ' (' || v_dias || ' de ' || v_dias_mes || ' dias)', v_valor, auth.uid());
      end if;
      if v_reducao > 0 then
        insert into public.creditos_atendimentos (org_id, mes, tipo, quantidade, motivo, criado_por)
        values (p_org, v_mes, 'troca', -v_reducao, 'Troca para o plano ' || novo.nome || ' em ' || to_char(v_hoje, 'DD/MM'),
                auth.uid());
      end if;
      insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
      values (p_org, 'atendente', auth.uid(), 'trocar_plano', 'organizacoes', p_org::text,
              jsonb_build_object('plano', o.plano),
              jsonb_build_object('plano', novo.codigo, 'ajuste', v_valor, 'reducao_franquia', v_reducao,
                                 'ciclo', c.ciclo, 'fatura_avulsa', v_avulsa));
      -- O consumo do mês conta desde o dia 1: com o limite novo, o aviso de 80 % ou 100 % pode valer na hora. O aviso
      -- não pode desfazer a troca.
      begin
        perform public.avisar_franquia(p_org);
      exception when others then
        raise warning 'livih: aviso de franquia na troca de plano falhou (%): %', p_org, sqlerrm;
      end;
      perform public.cobranca_avisar_plataforma(p_org, 'subiu para o plano ' || novo.nome
        || case when v_valor >= 0.01 and v_anual then ' (cobrança avulsa de ' || public.reais(v_valor) || ')'
                when v_valor >= 0.01 then ' (ajuste de ' || public.reais(v_valor) || ' na próxima fatura)' else '' end);
      if v_avulsa is not null then
        perform public.chamar_funcao('asaas-cobranca');
      end if;
    end if;
    return jsonb_build_object('tipo', 'subir', 'plano', novo.nome, 'valor', v_valor, 'dias', v_dias,
                              'dias_mes', v_dias_mes, 'meses', v_meses, 'anual', v_anual, 'renova_em', v_renova,
                              'teste_gratis', c.inicio > v_mes,
                              'limite_mes', case when v_limite is null then null
                                                 else v_limite + (novo.atendimentos - coalesce(atual.atendimentos, 0)) - v_reducao end);
  end if;

  -- Plano sem módulos: os módulos ligados têm de desligar até a data da descida.
  if not novo.permite_modulos then
    select string_agg(m.nome, ' e ' order by m.ordem) into v_modulos
      from public.modulos m left join public.organizacao_modulos om on om.org_id = p_org and om.modulo = m.codigo
     where m.preco_mensal is not null and public.modulo_ativo(p_org, m.codigo)
       and (om.desliga_em is null or om.desliga_em > v_fim);
    if v_modulos is not null then
      raise exception 'O plano % não inclui ERP nem Ordens de serviço. Para descer, desligue antes estes módulos aqui em Plano e consumo: % (eles continuam até a troca).',
        novo.nome, v_modulos;
    end if;
  end if;

  -- O mesmo plano já agendado: nada a fazer (sem outra auditoria nem outro aviso).
  if novo.codigo = o.plano_proximo then
    return jsonb_build_object('tipo', 'descer', 'plano', novo.nome, 'vale_em', o.plano_proximo_em, 'anual', v_anual);
  end if;
  if p_confirmar then
    update public.organizacoes set plano_proximo = novo.codigo, plano_proximo_em = v_fim where id = p_org;
    insert into public.auditoria (org_id, ator_tipo, ator_id, acao, entidade, entidade_id, antes, depois)
    values (p_org, 'atendente', auth.uid(), 'agendar_troca_plano', 'organizacoes', p_org::text,
            jsonb_build_object('plano', o.plano, 'plano_proximo', o.plano_proximo),
            jsonb_build_object('plano_proximo', novo.codigo, 'vale_em', v_fim));
    perform public.cobranca_avisar_plataforma(p_org, 'vai para o plano ' || novo.nome || ' em ' || to_char(v_fim, 'DD/MM/YYYY'));
  end if;
  return jsonb_build_object('tipo', 'descer', 'plano', novo.nome, 'vale_em', v_fim, 'anual', v_anual_cobrado);
end $function$;

-- plano_troca_situacao: Conta só os números de WhatsApp.
CREATE OR REPLACE FUNCTION public.plano_troca_situacao(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.organizacoes;
  c public.contratos_cobranca;
  v_motivo text;
  v_mes date := public.mes_brasilia();
  v_renova date;
  v_fim date;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'Só o dono e os administradores da empresa veem o plano.';
  end if;
  select * into o from public.organizacoes where id = p_org;
  select * into c from public.contratos_cobranca where org_id = p_org;
  v_motivo := case
    when c.org_id is null or not c.ativo then 'Para escolher ou trocar o plano, fale com a equipe da Livih.'
    when c.valor_fixo is not null then 'O plano da sua empresa tem um valor combinado. Para trocar, fale com a equipe da Livih.'
  end;
  v_renova := (c.anual_inicio + interval '12 months')::date;
  v_fim := case when c.ciclo = 'anual' and c.anual_inicio <= v_mes and not public.anual_a_cobrar(p_org, v_mes)
                then v_renova else (v_mes + interval '1 month')::date end;
  return jsonb_build_object(
    'pode_trocar', v_motivo is null,
    'motivo', v_motivo,
    'eh_dono', public.eh_dono_de_fato(p_org),
    'plano', o.plano,
    'plano_proximo', o.plano_proximo,
    -- Quando valem as descidas e os desligamentos pedidos agora: dia 1 seguinte, ou a renovação no anual.
    'vale_em', coalesce(o.plano_proximo_em, v_fim),
    'fim_periodo', v_fim,
    'numeros_ativos', (select count(*) from public.canais where org_id = p_org and ativo and tipo in ('waha', 'meta')),
    'ciclo', coalesce(c.ciclo, 'mensal'),
    'anual_inicio', c.anual_inicio,
    'renova_em', v_renova,
    'ciclo_proximo', c.ciclo_proximo,
    'ciclo_proximo_em', c.ciclo_proximo_em,
    'anual_parcelas', coalesce(c.anual_parcelas, 1),
    'teste_gratis', c.inicio > v_mes,
    'planos', (select jsonb_agg(jsonb_build_object('codigo', p.codigo, 'nome', p.nome, 'preco_mensal', p.preco_mensal,
                                                   'preco_anual', p.preco_anual, 'permite_modulos', p.permite_modulos,
                                                   'numeros_whatsapp', p.numeros_whatsapp, 'atendimentos', p.atendimentos)
                                order by p.ordem)
                 from public.planos p where p.codigo <> 'interno'),
    'modulos', (select coalesce(jsonb_agg(jsonb_build_object('codigo', m.codigo, 'nome', m.nome, 'descricao', m.descricao,
                                                            'preco_mensal', m.preco_mensal, 'preco_anual', m.preco_anual,
                                                            'ativo', public.modulo_ativo(p_org, m.codigo),
                                                            'desliga_em', om.desliga_em)
                                         order by m.ordem), '[]')
                  from public.modulos m
                  left join public.organizacao_modulos om on om.org_id = p_org and om.modulo = m.codigo
                 where m.preco_mensal is not null),
    'juntos', jsonb_build_object('mensal', public.modulos_valor(array['erp', 'os'], false),
                                 'anual', public.modulos_valor(array['erp', 'os'], true)));
end $function$;

-- plataforma_empresas: Conta só os números de WhatsApp.
CREATE OR REPLACE FUNCTION public.plataforma_empresas()
 RETURNS TABLE(id uuid, nome text, slug text, status text, criado_em timestamp with time zone, dono_nome text, dono_email text, dono_senha_definida boolean, membros integer, numeros integer, numeros_conectados integer, conversas_30d integer, ultima_mensagem_em timestamp with time zone, motivo_suspensao text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.eh_admin_plataforma() then
    raise exception 'só a equipe da plataforma';
  end if;
  return query
  select o.id, o.nome, o.slug, o.status, o.criado_em,
         d.nome, d.email, d.senha_definida,
         (select count(*)::int from public.membros_org m where m.org_id = o.id and m.ativo),
         (select count(*)::int from public.canais c where c.org_id = o.id and c.ativo and c.tipo in ('waha', 'meta')),
         (select count(*)::int from public.canais c where c.org_id = o.id and c.ativo and c.tipo in ('waha', 'meta') and c.status_conexao = 'WORKING'),
         (select count(*)::int from public.conversas v where v.org_id = o.id and v.ultima_mensagem_em > now() - interval '30 days'),
         (select max(v.ultima_mensagem_em) from public.conversas v where v.org_id = o.id),
         o.motivo_suspensao
    from public.organizacoes o
    left join lateral (
      select p.nome, u.email::text as email,
             u.encrypted_password is not null and u.encrypted_password <> '' as senha_definida
        from public.membros_org m
        join auth.users u on u.id = m.user_id
        left join public.perfis p on p.user_id = m.user_id
       where m.org_id = o.id and m.papel = 'dono' and m.ativo
       order by m.criado_em limit 1
    ) d on true
   order by o.criado_em desc;
end $function$;

-- org_primeiros_passos: "Conectar o WhatsApp" continua sendo o WhatsApp.
CREATE OR REPLACE FUNCTION public.org_primeiros_passos(p_org uuid)
 RETURNS TABLE(whatsapp boolean, instrucoes boolean, base boolean, equipe boolean, agente_ligado boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.canais where org_id = p_org and ativo and tipo in ('waha', 'meta') and status_conexao = 'WORKING'),
         exists (select 1 from public.agentes where org_id = p_org and length(btrim(prompt)) > 0),
         exists (select 1 from public.base_conhecimento where org_id = p_org),
         (select count(*) from public.membros_org where org_id = p_org and ativo) > 1,
         exists (select 1 from public.agentes where org_id = p_org and ativo)
   where public.eh_membro(p_org);
$function$;

-- canal_para_avisar: Alerta para a equipe sai por WhatsApp.
CREATE OR REPLACE FUNCTION public.canal_para_avisar(p_org uuid, p_usuario uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select cn.id from public.canais cn
   where cn.org_id = p_org and cn.ativo and cn.tipo in ('waha', 'meta') and cn.responsavel_id is null
   order by (cn.status_conexao = 'WORKING') desc, (cn.tipo = 'waha') desc, cn.criado_em
   limit 1;
$function$;

-- agenda_lembretes: Lembrete e alerta para a equipe saem por WhatsApp.
CREATE OR REPLACE FUNCTION public.agenda_lembretes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c record;
  v_quando text;
  v_hora text;
  v_cliente text;
  v_tel text;
  v_canal uuid;
  v_total integer := 0;
begin
  for c in
    select cp.*, ct.nome as contato_nome, ct.nome_whatsapp, ct.telefone as contato_telefone
      from public.compromissos cp
      left join public.contatos ct on ct.id = cp.contato_id
     where cp.lembrete_minutos is not null and cp.lembrete_enviado_em is null and cp.responsavel_id is not null
       and cp.status in ('marcado', 'confirmado')
       and cp.inicio - make_interval(mins => cp.lembrete_minutos) <= now()
       and cp.inicio > now() - interval '5 minutes'
     order by cp.inicio
     limit 200
     for update of cp skip locked
  loop
    v_hora := to_char(c.inicio at time zone 'America/Sao_Paulo', 'HH24:MI');
    v_quando := case (c.inicio at time zone 'America/Sao_Paulo')::date - (now() at time zone 'America/Sao_Paulo')::date
                  when 0 then 'Hoje às ' || v_hora
                  when 1 then 'Amanhã às ' || v_hora
                  else to_char(c.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') end;
    v_cliente := coalesce(c.contato_nome, c.nome_whatsapp);

    -- Celular (só quem ativou as notificações em algum aparelho).
    if exists (select 1 from public.push_inscricoes i where i.user_id = c.responsavel_id) then
      insert into public.push_fila (user_id, titulo, corpo, url)
      values (c.responsavel_id, left('Compromisso: ' || v_quando, 80),
              left(c.titulo || coalesce(' · ' || v_cliente, '') || coalesce(' · ' || c.local, ''), 180), '/agenda');
    end if;

    -- WhatsApp (só quem cadastrou o número), por um número da empresa.
    select p.telefone into v_tel from public.perfis p where p.user_id = c.responsavel_id;
    if v_tel is not null then
      select cn.id into v_canal from public.canais cn
       where cn.org_id = c.org_id and cn.ativo and cn.tipo in ('waha', 'meta')
       order by (cn.responsavel_id is distinct from c.responsavel_id) desc, (cn.status_conexao = 'WORKING') desc,
                (cn.tipo = 'waha') desc, cn.criado_em
       limit 1;
      if v_canal is not null then
        insert into public.alertas (org_id, canal_id, telefone, texto)
        values (c.org_id, v_canal, v_tel,
                '📅 *Lembrete de compromisso*' || E'\n' || c.titulo || E'\n' || v_quando
                || coalesce(E'\nCliente: ' || v_cliente || coalesce(' (' || c.contato_telefone || ')', ''), '')
                || coalesce(E'\nLocal: ' || c.local, '')
                || E'\n\n_Livih · Agenda_');
      end if;
    end if;

    update public.compromissos set lembrete_enviado_em = now() where id = c.id;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $function$;

-- avisar_franquia: Lembrete e alerta para a equipe saem por WhatsApp.
CREATE OR REPLACE FUNCTION public.avisar_franquia(p_org uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  f record;
  v_nivel integer;
  v_org text;
  v_titulo text;
  v_corpo text;
  v_canal uuid;
  m record;
begin
  select * into f from public.franquia_do_mes(p_org);
  if f.limite is null or f.limite = 0 then
    return;
  end if;
  v_nivel := case when f.usados >= f.limite then 100 when f.usados * 100 >= f.limite * 80 then 80 end;
  if v_nivel is null then
    return;
  end if;
  insert into public.avisos_franquia (org_id, mes, nivel, limite) values (p_org, public.mes_brasilia(), v_nivel, f.limite)
  on conflict do nothing;
  if not found then
    return;
  end if;
  -- Chegou direto a 100 % (ex.: pacote que acabou): o de 80 % desse limite não sai mais depois.
  if v_nivel = 100 then
    insert into public.avisos_franquia (org_id, mes, nivel, limite) values (p_org, public.mes_brasilia(), 80, f.limite)
    on conflict do nothing;
  end if;

  select nome into v_org from public.organizacoes where id = p_org;
  if v_nivel = 80 then
    v_titulo := 'Atendimentos do agente: 80 % usados';
    v_corpo := 'Sua empresa usou ' || public.numero_br(f.usados) || ' de ' || public.numero_br(f.limite)
      || ' atendimentos do agente este mês. '
      || case f.escolha when 'parar' then 'Quando acabarem, as conversas novas vão para a equipe.'
                        else 'Quando acabarem, o agente continua, e cada atendimento a mais entra na próxima mensalidade.' end;
  else
    v_titulo := case f.escolha when 'parar' then 'Os atendimentos do agente acabaram'
                               else 'Atendimentos do agente: o limite do mês acabou' end;
    v_corpo := 'Sua empresa usou os ' || public.numero_br(f.limite) || ' atendimentos do agente deste mês. '
      || case f.escolha when 'parar' then 'As conversas novas vão para a equipe até o dia 1º ou até o dono comprar um pacote.'
                        else 'O agente continua, e cada atendimento a mais entra na próxima mensalidade.' end;
  end if;

  -- Dono e administradores: celular (quem ativou) e WhatsApp (quem cadastrou o número), por um número da empresa.
  for m in
    select mo.user_id, pf.telefone
      from public.membros_org mo
      left join public.perfis pf on pf.user_id = mo.user_id
     where mo.org_id = p_org and mo.ativo and mo.papel in ('dono', 'admin')
  loop
    if exists (select 1 from public.push_inscricoes i where i.user_id = m.user_id) then
      insert into public.push_fila (user_id, titulo, corpo, url)
      values (m.user_id, v_titulo, left(v_corpo, 180), '/configuracoes/uso');
    end if;
    if m.telefone is not null then
      select cn.id into v_canal from public.canais cn
       where cn.org_id = p_org and cn.ativo and cn.tipo in ('waha', 'meta')
       order by (cn.responsavel_id is distinct from m.user_id) desc, (cn.status_conexao = 'WORKING') desc,
                (cn.tipo = 'waha') desc, cn.criado_em
       limit 1;
      if v_canal is not null then
        insert into public.alertas (org_id, canal_id, telefone, texto)
        values (p_org, v_canal, m.telefone,
                '⚠️ *' || v_titulo || '*' || E'\n' || v_corpo || E'\n\n'
                || 'Veja o consumo e as opções em Configurações → Plano e consumo.' || E'\n\n_Livih · Plano_');
      end if;
    end if;
  end loop;

  -- Equipe da plataforma: só no celular, com o nome da empresa.
  insert into public.push_fila (user_id, titulo, corpo, url)
  select ap.user_id, left(v_org || ': ' || lower(v_titulo), 80),
         left(public.numero_br(f.usados) || ' de ' || public.numero_br(f.limite) || ' atendimentos · escolha: '
              || f.escolha, 180), '/empresas'
    from public.admins_plataforma ap
   where exists (select 1 from public.push_inscricoes i where i.user_id = ap.user_id);
end $function$;

-- estoque_avisar_equipe: Lembrete e alerta para a equipe saem por WhatsApp.
CREATE OR REPLACE FUNCTION public.estoque_avisar_equipe(p_org uuid, p_titulo text, p_corpo text, p_whatsapp text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m record;
  v_canal uuid;
  v_n integer := 0;
begin
  for m in
    select mo.user_id, p.telefone from public.membros_org mo left join public.perfis p on p.user_id = mo.user_id
     where mo.org_id = p_org and mo.ativo and mo.recebe_alerta_estoque
  loop
    if exists (select 1 from public.push_inscricoes i where i.user_id = m.user_id) then
      insert into public.push_fila (user_id, titulo, corpo, url)
      values (m.user_id, left(p_titulo, 80), left(p_corpo, 180), '/produtos?abaixo=1');
    end if;
    if m.telefone is not null then
      select cn.id into v_canal from public.canais cn
       where cn.org_id = p_org and cn.ativo and cn.tipo in ('waha', 'meta')
       order by (cn.responsavel_id is distinct from m.user_id) desc, (cn.status_conexao = 'WORKING') desc,
                (cn.tipo = 'waha') desc, cn.criado_em
       limit 1;
      if v_canal is not null then
        insert into public.alertas (org_id, canal_id, telefone, texto) values (p_org, v_canal, m.telefone, p_whatsapp);
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

-- tarefas_lembretes: Lembrete e alerta para a equipe saem por WhatsApp.
CREATE OR REPLACE FUNCTION public.tarefas_lembretes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  t record;
  v_quando text;
  v_hora text;
  v_cliente text;
  v_tel text;
  v_canal uuid;
  v_total integer := 0;
begin
  for t in
    select tf.*, ct.nome as contato_nome, ct.nome_whatsapp, ct.telefone as contato_telefone
      from public.tarefas tf
      left join public.contatos ct on ct.id = tf.contato_id
     where tf.status = 'aberta' and tf.executor = 'equipe' and tf.responsavel_id is not null
       and tf.lembrete_minutos is not null and tf.lembrete_enviado_em is null
       and tf.vence_em - make_interval(mins => tf.lembrete_minutos) <= now()
       and tf.vence_em > now() - interval '15 minutes'
     order by tf.vence_em
     limit 200
     for update of tf skip locked
  loop
    v_hora := to_char(t.vence_em at time zone 'America/Sao_Paulo', 'HH24:MI');
    v_quando := case (t.vence_em at time zone 'America/Sao_Paulo')::date - (now() at time zone 'America/Sao_Paulo')::date
                  when 0 then 'Hoje às ' || v_hora
                  when 1 then 'Amanhã às ' || v_hora
                  else to_char(t.vence_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') end;
    v_cliente := coalesce(t.contato_nome, t.nome_whatsapp);

    if exists (select 1 from public.push_inscricoes i where i.user_id = t.responsavel_id) then
      insert into public.push_fila (user_id, titulo, corpo, url)
      values (t.responsavel_id, left('Tarefa: ' || v_quando, 80),
              left(t.titulo || coalesce(' · ' || v_cliente, ''), 180), '/tarefas');
    end if;

    select p.telefone into v_tel from public.perfis p where p.user_id = t.responsavel_id;
    if v_tel is not null then
      select cn.id into v_canal from public.canais cn
       where cn.org_id = t.org_id and cn.ativo and cn.tipo in ('waha', 'meta')
       order by (cn.responsavel_id is distinct from t.responsavel_id) desc, (cn.status_conexao = 'WORKING') desc,
                (cn.tipo = 'waha') desc, cn.criado_em
       limit 1;
      if v_canal is not null then
        insert into public.alertas (org_id, canal_id, telefone, texto)
        values (t.org_id, v_canal, v_tel,
                '✅ *Tarefa*' || E'\n' || t.titulo || E'\n' || v_quando
                || coalesce(E'\nCliente: ' || v_cliente || coalesce(' (' || t.contato_telefone || ')', ''), '')
                || coalesce(E'\n' || left(t.observacao, 300), '')
                || E'\n\n_Livih · Tarefas_');
      end if;
    end if;

    update public.tarefas set lembrete_enviado_em = now() where id = t.id;
    v_total := v_total + 1;
  end loop;
  return v_total;
end $function$;

-- nota_whatsapp_preparar: A nota vai pelo WhatsApp: só conversa e número de WhatsApp.
CREATE OR REPLACE FUNCTION public.nota_whatsapp_preparar(p_envio uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  e public.nota_envios;
  n public.notas_fiscais;
  v_cliente uuid;
  v_ct public.contatos;
  v_conv public.conversas;
  v_canal public.canais;
  v_entrada timestamptz;
  v_motivo text;
begin
  select * into e from public.nota_envios where id = p_envio and canal = 'whatsapp' for update;
  if e.id is null then
    raise exception 'envio não encontrado';
  end if;
  select * into n from public.notas_fiscais where id = e.nota_id;
  select p.cliente_id into v_cliente from public.pedidos p where p.id = n.pedido_id;
  if (select status from public.organizacoes where id = e.org_id) <> 'ativa' then
    return jsonb_build_object('ok', false, 'motivo', 'a empresa não está ativa');
  end if;

  if e.contato_id is not null then
    select * into v_ct from public.contatos where id = e.contato_id and org_id = e.org_id;
  end if;
  if v_ct.id is null then
    select * into v_ct from public.contatos where org_id = e.org_id and telefone = e.destino;
  end if;
  if v_ct.id is null then
    insert into public.contatos (org_id, telefone, nome, origem)
    values (e.org_id, e.destino, (select left(coalesce(nullif(btrim(cl.nome), ''), cl.razao_social), 120) from public.clientes cl where cl.id = v_cliente), 'balcao')
    returning * into v_ct;
  end if;
  if v_cliente is not null then
    insert into public.contatos_clientes (org_id, contato_id, cliente_id, criado_por)
    values (e.org_id, v_ct.id, v_cliente, e.criado_por) on conflict do nothing;
  end if;
  update public.nota_envios set contato_id = v_ct.id where id = e.id;

  if v_ct.descadastrado_em is not null then
    return jsonb_build_object('ok', false, 'motivo', 'o cliente pediu para não receber mensagens neste WhatsApp');
  end if;

  select c.* into v_conv from public.conversas c join public.canais k on k.id = c.canal_id and k.ativo and k.tipo in ('waha', 'meta')
   where c.contato_id = v_ct.id order by c.ultima_mensagem_em desc nulls last limit 1;
  if v_conv.id is null then
    select * into v_canal from public.canais where org_id = e.org_id and ativo and tipo in ('waha', 'meta')
     order by (responsavel_id is null) desc, criado_em limit 1;
    if v_canal.id is null then
      return jsonb_build_object('ok', false, 'motivo', 'a empresa não tem número de WhatsApp conectado');
    end if;
    insert into public.conversas (org_id, canal_id, contato_id) values (e.org_id, v_canal.id, v_ct.id)
    on conflict (canal_id, contato_id) do update set canal_id = excluded.canal_id
    returning * into v_conv;
  end if;
  select * into v_canal from public.canais where id = v_conv.canal_id;

  if v_canal.tipo = 'waha' and v_canal.status_conexao is distinct from 'WORKING' then
    v_motivo := 'o número de WhatsApp da empresa está desconectado';
  elsif v_canal.tipo = 'meta' then
    select max(criado_em) into v_entrada from public.mensagens
     where conversa_id = v_conv.id and direcao = 'entrada' and not automatica;
    if v_entrada is null or v_entrada < now() - interval '23 hours 30 minutes' then
      v_motivo := 'na API oficial, fora das 24 horas da última mensagem do cliente, só sai com modelo aprovado: mande por e-mail';
    end if;
  end if;
  if v_motivo is not null then
    return jsonb_build_object('ok', false, 'motivo', v_motivo);
  end if;
  return jsonb_build_object('ok', true, 'conversa_id', v_conv.id, 'org_id', e.org_id);
end $function$;

-- pedido_avisar: O aviso de pedido vai pelo WhatsApp: só conversa de WhatsApp.
CREATE OR REPLACE FUNCTION public.pedido_avisar(p_pedido uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_p public.pedidos;
  v_cfg public.pedido_avisos;
  v_ct public.contatos;
  v_conv public.conversas;
  v_canal public.canais;
  v_motivo text;
  v_entrada timestamptz;
  v_nome text;
  v_texto text;
  v_modelo jsonb;
  v_params text[];
  v_msg uuid;
  v_usa_modelo boolean := false;
begin
  select * into v_p from public.pedidos where id = p_pedido;
  select * into v_cfg from public.pedido_avisos where org_id = v_p.org_id;
  if v_cfg.org_id is null or not v_cfg.ativo or not (p_status = any (v_cfg.situacoes)) then
    return;
  end if;
  -- Um aviso por pedido e situação.
  if exists (select 1 from public.pedido_avisos_envios where pedido_id = p_pedido and status = p_status and enviado) then
    return;
  end if;

  select * into v_ct from public.contatos where id = v_p.contato_id;
  if v_ct.id is not null then
    select c.* into v_conv from public.conversas c join public.canais k on k.id = c.canal_id and k.ativo and k.tipo in ('waha', 'meta')
     where c.contato_id = v_ct.id
     order by c.ultima_mensagem_em desc nulls last
     limit 1;
    select * into v_canal from public.canais where id = v_conv.canal_id;
  end if;

  v_motivo := case
    when (select status from public.organizacoes where id = v_p.org_id) <> 'ativa' then 'a empresa não está ativa'
    when v_ct.id is null then 'o pedido não tem cliente com WhatsApp'
    when v_ct.descadastrado_em is not null then 'o cliente pediu para não receber mensagens'
    when v_conv.id is null then 'o cliente não tem conversa num número ativo'
    when v_canal.tipo = 'waha' and v_canal.status_conexao is distinct from 'WORKING' then 'o número de WhatsApp está desconectado'
  end;

  if v_motivo is null and v_canal.tipo = 'meta' then
    select max(criado_em) into v_entrada from public.mensagens
     where conversa_id = v_conv.id and direcao = 'entrada' and not automatica;
    v_usa_modelo := v_entrada is null or v_entrada < now() - interval '23 hours 30 minutes';
    if v_usa_modelo and v_cfg.modelo is null then
      v_motivo := 'passaram as 24 horas do WhatsApp e não há modelo de aviso configurado';
    end if;
  end if;

  if v_motivo is not null then
    insert into public.pedido_avisos_envios (org_id, pedido_id, status, enviado, conversa_id, resultado)
    values (v_p.org_id, p_pedido, p_status, false, v_conv.id, 'Não enviado: ' || v_motivo);
    return;
  end if;

  if v_usa_modelo then
    -- 'pedido' e 'situacao' viram texto fixo; o resto preenche como nas campanhas.
    select jsonb_set(v_cfg.modelo, '{variaveis}', coalesce(jsonb_agg(
             case v ->> 'fonte'
               when 'pedido' then jsonb_build_object('fonte', 'fixo', 'valor', v_p.numero::text)
               when 'situacao' then jsonb_build_object('fonte', 'fixo', 'valor', public.pedido_situacao_texto(p_status))
               else v end order by n), '[]'))
      into v_modelo
      from jsonb_array_elements(coalesce(v_cfg.modelo -> 'variaveis', '[]')) with ordinality x(v, n);
    v_params := public.campanha_parametros(v_modelo, v_ct.id);
    v_texto := concat_ws(E'\n\n',
      nullif('*' || nullif(btrim(v_modelo ->> 'cabecalho'), '') || '*', '**'),
      regexp_replace(v_modelo ->> 'corpo', '\{\{\s*(\d+)\s*\}\}', '§\1§', 'g'),
      nullif('_' || nullif(btrim(v_modelo ->> 'rodape'), '') || '_', '__'));
    for i in 1 .. coalesce(array_length(v_params, 1), 0) loop
      v_texto := replace(v_texto, '§' || i || '§', v_params[i]);
    end loop;
    insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, status_entrega, modelo)
    values (v_p.org_id, v_conv.id, 'saida', 'bot', 'texto', v_texto, 'pendente',
            jsonb_build_object('nome', v_modelo ->> 'nome', 'idioma', v_modelo ->> 'idioma', 'parametros', to_jsonb(v_params)))
    returning id into v_msg;
  else
    -- Sem nome conhecido, "Olá, {nome}!" vira "Olá!".
    v_nome := split_part(coalesce(nullif(btrim(v_ct.nome), ''), nullif(btrim(v_ct.nome_whatsapp), ''), ''), ' ', 1);
    v_texto := coalesce(v_cfg.textos ->> p_status, '');
    v_texto := case when v_nome = '' then regexp_replace(v_texto, ',? ?\{nome\}', '', 'gi')
                    else regexp_replace(v_texto, '\{nome\}', v_nome, 'gi') end;
    v_texto := regexp_replace(v_texto, '\{numero\}', v_p.numero::text, 'gi');
    insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, status_entrega)
    values (v_p.org_id, v_conv.id, 'saida', 'bot', 'texto', v_texto, 'pendente')
    returning id into v_msg;
  end if;

  insert into public.fila_envio (org_id, conversa_id, mensagem_id) values (v_p.org_id, v_conv.id, v_msg);
  update public.conversas set ultima_mensagem_em = now(), ultima_mensagem_resumo = left(v_texto, 140) where id = v_conv.id;
  insert into public.pedido_avisos_envios (org_id, pedido_id, status, enviado, modelo, mensagem_id, conversa_id, resultado)
  values (v_p.org_id, p_pedido, p_status, true, v_usa_modelo, v_msg, v_conv.id,
          case when v_usa_modelo then 'Enviado pelo modelo (fora das 24 horas)' else 'Enviado' end);
end $function$;

-- iniciar_conversa: No Instagram, quem começa a conversa é a pessoa.
CREATE OR REPLACE FUNCTION public.iniciar_conversa(p_canal uuid, p_telefone text, p_nome text DEFAULT NULL::text, p_texto text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_canal public.canais;
  v_contato uuid;
  v_conversa uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
begin
  select * into v_canal from public.canais where id = p_canal and ativo;
  if v_canal.id is null or not public.pode_ver_canal(p_canal) then
    raise exception 'número não encontrado';
  end if;
  if v_canal.tipo not in ('waha', 'meta') then
    raise exception 'Conversa nova pela Livih só no WhatsApp: no Instagram, quem começa é o cliente.';
  end if;
  if not exists (select 1 from public.organizacoes where id = v_canal.org_id and status = 'ativa') then
    raise exception 'empresa suspensa';
  end if;
  if coalesce(p_telefone, '') !~ '^[0-9]{10,15}$' then
    raise exception 'telefone inválido';
  end if;
  if p_texto is not null and btrim(p_texto) <> '' and v_canal.tipo = 'meta' then
    raise exception 'na API oficial a conversa começa com um modelo aprovado';
  end if;

  select id into v_contato from public.contatos where org_id = v_canal.org_id and telefone = p_telefone;
  if v_contato is null then
    insert into public.contatos (org_id, telefone, nome, origem, responsavel_id)
    values (v_canal.org_id, p_telefone, left(v_nome, 120), 'prospeccao', auth.uid())
    returning id into v_contato;
  elsif not public.pode_ver_contato(v_contato) then
    raise exception 'esse número é cliente de outro vendedor';
  elsif v_nome is not null then
    update public.contatos set nome = left(v_nome, 120) where id = v_contato and nome is null;
  end if;

  select id into v_conversa from public.conversas where canal_id = p_canal and contato_id = v_contato for update;
  if v_conversa is null then
    insert into public.conversas (org_id, canal_id, contato_id, estado, atribuida_a)
    values (v_canal.org_id, p_canal, v_contato, 'humano', auth.uid())
    returning id into v_conversa;
  else
    update public.conversas
       set estado = 'humano', atribuida_a = case when estado = 'humano' and atribuida_a is not null then atribuida_a else auth.uid() end,
           nao_lidas = 0
     where id = v_conversa;
  end if;

  if p_texto is not null and btrim(p_texto) <> '' then
    perform public.enfileirar_saida(v_conversa, btrim(p_texto), 'atendente', auth.uid());
  end if;
  return v_conversa;
end $function$;

-- enfileirar_saida: Até a entrega 2, não há envio pelo Instagram.
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
  if (select tipo from public.canais where id = (select canal_id from public.conversas where id = p_conversa)) = 'instagram' then
    raise exception 'Responder pelo Instagram na Livih chega na próxima etapa. Por enquanto, responda pelo app do Instagram.';
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

-- enviar_arquivo: Até a entrega 2, não há envio pelo Instagram.
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
  if (select tipo from public.canais where id = v_conversa.canal_id) = 'instagram' then
    raise exception 'Responder pelo Instagram na Livih chega na próxima etapa. Por enquanto, responda pelo app do Instagram.';
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

-- registrar_saida_celular: Eco do celular só em canal de WhatsApp.
CREATE OR REPLACE FUNCTION public.registrar_saida_celular(p_canal uuid, p_wa_id text, p_telefone text, p_lid text, p_tipo tipo_msg, p_texto text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_evento bigint;
  v_contato uuid;
  v_conversa public.conversas;
  v_auto boolean;
begin
  select org_id into v_org from public.canais where id = p_canal and ativo and tipo in ('waha', 'meta');
  if v_org is null then
    raise exception 'canal inativo ou inexistente';
  end if;

  insert into public.eventos_recebidos (canal_id, wa_id, payload)
  values (p_canal, p_wa_id, p_payload)
  on conflict (canal_id, wa_id) do nothing
  returning id into v_evento;
  if v_evento is null then
    return jsonb_build_object('duplicada', true);
  end if;

  v_auto := public.eh_mensagem_automatica(p_canal, p_texto);
  v_contato := public.contato_por_whatsapp(v_org, p_telefone, p_lid, null);

  -- Conversa nova aberta por mensagem automática segue o caminho normal (estado padrão e triggers).
  if v_auto then
    insert into public.conversas (org_id, canal_id, contato_id)
    values (v_org, p_canal, v_contato)
    on conflict (canal_id, contato_id) do nothing;
  else
    insert into public.conversas (org_id, canal_id, contato_id, estado)
    values (v_org, p_canal, v_contato, 'humano')
    on conflict (canal_id, contato_id) do nothing;
  end if;

  select * into v_conversa from public.conversas
   where canal_id = p_canal and contato_id = v_contato for update;

  if exists (select 1 from public.mensagens where conversa_id = v_conversa.id and wa_id = p_wa_id) then
    update public.eventos_recebidos set processado_em = now() where id = v_evento;
    return jsonb_build_object('duplicada', true);
  end if;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, wa_id, status_entrega, automatica)
  values (v_org, v_conversa.id, 'saida', 'atendente', p_tipo, p_texto, p_wa_id, 'enviada', v_auto);

  if v_auto then
    update public.conversas
       set ultima_mensagem_em = now(),
           ultima_mensagem_resumo = left(p_texto, 140)
     where id = v_conversa.id;
  else
    update public.conversas
       set ultima_mensagem_em = now(),
           ultima_mensagem_resumo = left(coalesce(p_texto, '[' || p_tipo::text || ']'), 140),
           estado = case when estado in ('bot', 'aguardando_humano', 'encerrada') then 'humano' else estado end,
           motivo_humano = case when estado in ('bot', 'aguardando_humano', 'encerrada')
                                then 'respondida pelo celular' else motivo_humano end,
           nao_lidas = 0
     where id = v_conversa.id;
  end if;

  update public.eventos_recebidos set processado_em = now() where id = v_evento;
  return jsonb_build_object('duplicada', false, 'conversa_id', v_conversa.id, 'automatica', v_auto);
end $function$;

-- gerar_segredo_webhook: O segredo do webhook é do WAHA: canal do Instagram não recebe pelo waha-webhook.
CREATE OR REPLACE FUNCTION public.gerar_segredo_webhook(p_canal uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_segredo text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select org_id into v_org from public.canais where id = p_canal and tipo = 'waha';
  if v_org is null or not public.tem_papel(v_org, '{dono,admin}') then
    raise exception 'canal não encontrado';
  end if;
  update public.canais set webhook_segredo_hash = encode(extensions.digest(v_segredo, 'sha256'), 'hex')
   where id = p_canal;
  return v_segredo;
end $function$;

-- nota_destinos: A nota vai por WhatsApp: contato só do Instagram (sem telefone) não entra na lista.
CREATE OR REPLACE FUNCTION public.nota_destinos(p_cliente uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.clientes;
begin
  select * into c from public.clientes where id = p_cliente;
  if c.id is null or not (public.pode_ver_cliente(c.id) or public.eh_balcao(c.org_id)) then
    raise exception 'cliente não encontrado';
  end if;
  return jsonb_build_object(
    'email', c.email,
    'telefone', c.telefone,
    'contatos', (select coalesce(jsonb_agg(jsonb_build_object('id', ct.id, 'nome', coalesce(nullif(btrim(ct.nome), ''), ct.nome_whatsapp),
                                                              'telefone', ct.telefone, 'email', ct.email)
                                           order by ult.em desc nulls last, ct.criado_em desc), '[]')
                   from public.contatos ct
                   left join lateral (select max(v.ultima_mensagem_em) as em from public.conversas v where v.contato_id = ct.id) ult on true
                  where ct.org_id = c.org_id and ct.telefone is not null
                    and (ct.id in (select cc.contato_id from public.contatos_clientes cc where cc.cliente_id = c.id)))
  );
end $function$;

-- mensagens_origem: 'instagram' é origem provisória, como 'whatsapp': a regra de origem ou a do canal a troca.
CREATE OR REPLACE FUNCTION public.mensagens_origem()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conv public.conversas;
  v_origem text;
  v_texto text;
begin
  if new.autor_tipo = 'sistema' or new.status_entrega = 'erro' then
    return null;
  end if;
  -- Saída que não é campanha nem de pessoa (agente, automática) não abre ciclo.
  if new.direcao = 'saida' and new.modelo ->> 'campanha_id' is null
     and (new.automatica or new.autor_tipo <> 'atendente') then
    return null;
  end if;
  select * into v_conv from public.conversas where id = new.conversa_id;
  -- Na entrada, trava o contato (o webhook já o travou em contato_por_whatsapp, mesma ordem): duas mensagens do
  -- mesmo contato em dois números ao mesmo tempo não abrem dois ciclos.
  if new.direcao = 'entrada' then
    perform 1 from public.contatos where id = v_conv.contato_id for update;
  end if;
  if exists (select 1 from public.mensagens y join public.conversas c2 on c2.id = y.conversa_id
              where y.org_id = new.org_id and c2.contato_id = v_conv.contato_id and y.id <> new.id
                and y.autor_tipo <> 'sistema' and y.status_entrega <> 'erro'
                and y.criado_em > new.criado_em - interval '30 days' and y.criado_em <= new.criado_em) then
    return null;
  end if;

  if new.direcao = 'saida' then
    v_origem := case when new.modelo ->> 'campanha_id' is not null then 'Campanha' else 'Prospecção ativa' end;
  else
    v_texto := public.sem_acento(new.texto);
    select r.origem into v_origem from public.origem_regras r
     where r.org_id = new.org_id and position(public.sem_acento(btrim(r.texto)) in v_texto) > 0
     order by length(btrim(r.texto)) desc, r.criado_em
     limit 1;
    if v_origem is null then
      select cn.origem into v_origem from public.canais cn where cn.id = v_conv.canal_id;
    end if;
  end if;

  insert into public.origem_ciclos (org_id, contato_id, conversa_id, mensagem_id, origem, recebido, em)
  values (new.org_id, v_conv.contato_id, v_conv.id, new.id, v_origem, new.direcao = 'entrada', new.criado_em);

  if new.direcao = 'entrada' and v_origem is not null then
    update public.contatos set origem = v_origem
     where id = v_conv.contato_id and (origem is null or origem in ('whatsapp', 'manual', 'instagram'));
  end if;
  return null;
end $function$;

-- painel_origens: Contato do Instagram sem outra origem aparece como "Instagram", não como uma linha "instagram".
CREATE OR REPLACE FUNCTION public.painel_origens(p_org uuid, p_de timestamp with time zone, p_ate timestamp with time zone, p_canal uuid DEFAULT NULL::uuid, p_vendedor uuid DEFAULT NULL::uuid, p_equipe uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_membros uuid[] := public.painel_membros(p_org, p_vendedor, p_equipe);
  v_linhas jsonb;
begin
  if p_ate <= p_de or p_ate - p_de > interval '366 days' then
    raise exception 'período inválido';
  end if;
  with ciclo as (
    select oc.conversa_id, oc.contato_id, oc.em, oc.recebido, coalesce(oc.origem, 'Direto no WhatsApp') as origem
      from public.origem_ciclos oc
      join public.mensagens m on m.id = oc.mensagem_id
      join public.conversas c on c.id = oc.conversa_id
      join public.canais cn on cn.id = c.canal_id
     where oc.org_id = p_org and oc.em >= p_de and oc.em < p_ate and m.status_entrega <> 'erro'
       and (p_canal is null or c.canal_id = p_canal)
       and (v_membros is null or c.atribuida_a = any(v_membros) or cn.responsavel_id = any(v_membros))
  ),
  resposta as (
    select ciclo.*,
           (select min(y.criado_em) from public.mensagens y
             where y.conversa_id = ciclo.conversa_id and y.direcao = 'saida' and not y.automatica
               and y.autor_tipo in ('bot', 'atendente') and y.criado_em > ciclo.em
               and y.criado_em < ciclo.em + interval '30 days') as respondida_em
      from ciclo where ciclo.recebido
  ),
  opp as (
    select coalesce(case when o.origem in ('whatsapp', 'manual') then null when o.origem = 'instagram' then 'Instagram' else o.origem end, 'Direto no WhatsApp') as origem,
           o.criado_em, o.fechada_em, o.valor_estimado, e.tipo as tipo_etapa
      from public.oportunidades o join public.etapas_funil e on e.id = o.etapa_id
     where o.org_id = p_org
       and ((o.criado_em >= p_de and o.criado_em < p_ate) or (o.fechada_em >= p_de and o.fechada_em < p_ate))
       and (p_canal is null or o.contato_id in (select contato_id from ciclo))
       and (v_membros is null or o.responsavel_id = any(v_membros) or o.contato_id in (select contato_id from ciclo))
  ),
  origens as (
    select origem from ciclo union select origem from opp
  )
  select coalesce(jsonb_agg(x order by (x ->> 'contatos')::int desc, x ->> 'origem'), '[]') into v_linhas from (
    select jsonb_build_object(
             'origem', og.origem,
             'contatos', (select count(*) from ciclo where ciclo.origem = og.origem),
             'recebidos', (select count(*) from resposta r where r.origem = og.origem),
             'sem_resposta', (select count(*) from resposta r where r.origem = og.origem and r.respondida_em is null
                                and r.em < now() - interval '1 hour'),
             'mediana_resposta_seg', (select percentile_cont(0.5) within group (order by extract(epoch from r.respondida_em - r.em))
                                        from resposta r where r.origem = og.origem and r.respondida_em is not null),
             'oportunidades', (select count(*) from opp where opp.origem = og.origem and opp.criado_em >= p_de and opp.criado_em < p_ate),
             'ganhas', (select count(*) from opp where opp.origem = og.origem and opp.tipo_etapa = 'ganho'
                          and opp.fechada_em >= p_de and opp.fechada_em < p_ate),
             'valor_ganho', (select coalesce(sum(valor_estimado), 0) from opp where opp.origem = og.origem
                               and opp.tipo_etapa = 'ganho' and opp.fechada_em >= p_de and opp.fechada_em < p_ate)) x
      from origens og) y;
  return jsonb_build_object(
    'desde', (select min(em) from public.origem_ciclos where org_id = p_org),
    'linhas', v_linhas);
end $function$;
