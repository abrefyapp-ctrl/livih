-- Conexão do WhatsApp pela tela (Configurações → WhatsApp) e aviso de queda; agente desligado
-- passa as conversas para a equipe.
--
-- Quem conecta é dono/admin, pela Edge Function whatsapp-conexao (a chave do WAHA fica nela). O estado
-- vem de dois lugares — o webhook session.status do WAHA e uma verificação a cada 2 min (que também
-- percebe o WAHA inteiro fora) — e os dois passam por canal_atualizar_status, que decide se caiu.

-- ============================================================================
-- Estado da conexão
-- ============================================================================

alter table public.canais
  add column numero_conectado text,
  add column conectado_em timestamptz,
  add column caiu_em timestamptz,          -- saiu de WORKING sem ninguém clicar em "Desconectar"
  add column alerta_queda_em timestamptz,  -- aviso de queda já enfileirado (só um por queda)
  add column desconectado_em timestamptz,  -- desconectado pela tela: não é queda
  add column desconectado_por uuid references auth.users (id) on delete set null;

-- Configuração da plataforma (uma linha): por qual canal saem os avisos de queda. Tem que ser outro
-- número — o que caiu não avisa. Sem policy: só o sistema lê.
create table public.plataforma_config (
  id smallint primary key default 1 check (id = 1),
  canal_alertas uuid references public.canais (id) on delete set null
);
alter table public.plataforma_config enable row level security;
revoke all on public.plataforma_config from anon, authenticated;
insert into public.plataforma_config (id, canal_alertas)
select 1, (select id from public.canais where id = '241e53b4-d020-413c-92cd-3e5ad1ecba7f')
on conflict (id) do nothing;

-- Fora do ar por menos de 5 min (restart do WAHA, troca de rede) não avisa ninguém.
create function public.canal_atualizar_status(p_canal uuid, p_status text, p_numero text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.canais;
  v_agora timestamptz := now();
  v_alerta_canal uuid;
  v_telefone text;
  v_texto text;
begin
  select * into v from public.canais where id = p_canal for update;
  if v.id is null then return; end if;

  if p_status = 'WORKING' then
    update public.canais
       set status_conexao = p_status, status_atualizado_em = v_agora,
           numero_conectado = coalesce(p_numero, numero_conectado),
           conectado_em = case when status_conexao is distinct from 'WORKING' then v_agora else conectado_em end,
           caiu_em = null, alerta_queda_em = null, desconectado_em = null, desconectado_por = null
     where id = p_canal;
    v_texto := case when v.alerta_queda_em is not null then
      '✅ *Livih — WhatsApp conectado de novo*' || E'\n\n' || 'O número de ' ||
      (select nome from public.organizacoes where id = v.org_id) || ' voltou a funcionar.' end;
  else
    update public.canais
       set status_conexao = p_status, status_atualizado_em = v_agora,
           caiu_em = case when v.status_conexao = 'WORKING' and v.caiu_em is null and v.desconectado_em is null
                          then v_agora else caiu_em end
     where id = p_canal
    returning * into v;
    if v.caiu_em is not null and v.alerta_queda_em is null and v.caiu_em <= v_agora - interval '5 minutes' then
      update public.canais set alerta_queda_em = v_agora where id = p_canal;
      v_texto := '⚠️ *Livih — WhatsApp desconectado*' || E'\n\n' || 'O número de ' ||
        (select nome from public.organizacoes where id = v.org_id) ||
        ' está fora do ar desde ' || to_char(v.caiu_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') ||
        '. Enquanto isso, o agente não responde e as mensagens não chegam.' || E'\n\n' ||
        'Para reconectar: Configurações → WhatsApp, com o celular da empresa em mãos.';
    end if;
  end if;

  if v_texto is null then return; end if;
  select canal_alertas into v_alerta_canal from public.plataforma_config where id = 1;
  select telefone_alerta into v_telefone from public.agentes where canal_id = p_canal;
  -- Sem canal de alertas, sem telefone, ou o canal que caiu é o próprio de alertas: só a faixa no app.
  if v_alerta_canal is null or v_alerta_canal = p_canal or v_telefone is null then return; end if;
  insert into public.alertas (org_id, canal_id, telefone, texto)
  select c.org_id, c.id, v_telefone, v_texto from public.canais c where c.id = v_alerta_canal;
end $$;

-- O webhook session.status passa pela mesma regra.
create or replace function public.registrar_status_canal(p_canal uuid, p_status text)
returns void language sql security definer set search_path = '' as $$
  select public.canal_atualizar_status(p_canal, p_status, null);
$$;

-- Verificação periódica (a Edge Function consulta o WAHA e grava cada canal).
select cron.schedule('livih-whatsapp-verificar', '*/2 * * * *',
  $$select public.chamar_funcao('whatsapp-conexao', '{"acao":"verificar"}'::jsonb)$$);

-- ============================================================================
-- Agente desligado: conversa vai para a equipe
-- ============================================================================

create or replace function public.registrar_entrada(
  p_canal uuid,
  p_wa_id text,
  p_telefone text,
  p_lid text,
  p_nome_whatsapp text,
  p_tipo public.tipo_msg,
  p_texto text,
  p_payload jsonb,
  p_midia_mime text default null,
  p_transcricao text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_evento bigint;
  v_contato uuid;
  v_conversa public.conversas;
  v_msg uuid;
  v_agente_ativo boolean;
begin
  select org_id into v_org from public.canais where id = p_canal and ativo;
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

  v_contato := public.contato_por_whatsapp(v_org, p_telefone, p_lid, p_nome_whatsapp);

  insert into public.conversas (org_id, canal_id, contato_id)
  values (v_org, p_canal, v_contato)
  on conflict (canal_id, contato_id) do nothing;

  select * into v_conversa from public.conversas
   where canal_id = p_canal and contato_id = v_contato
   for update;

  if v_conversa.estado = 'encerrada' then
    update public.conversas set estado = 'bot', atribuida_a = null, motivo_humano = null
     where id = v_conversa.id
     returning * into v_conversa;
  end if;

  insert into public.mensagens (org_id, conversa_id, direcao, autor_tipo, tipo, texto, transcricao,
                                midia_mime, wa_id, status_entrega)
  values (v_org, v_conversa.id, 'entrada', 'contato', p_tipo, p_texto, p_transcricao,
          p_midia_mime, p_wa_id, 'recebida')
  returning id into v_msg;

  update public.conversas
     set ultima_mensagem_em = now(),
         ultima_mensagem_resumo = left(coalesce(p_texto, p_transcricao, '[' || p_tipo::text || ']'), 140),
         nao_lidas = nao_lidas + 1
   where id = v_conversa.id;

  update public.eventos_recebidos set processado_em = now() where id = v_evento;

  select coalesce(bool_or(ativo), false) into v_agente_ativo from public.agentes where canal_id = p_canal;

  -- Sem agente ligado, ninguém responderia uma conversa "com o agente": vai direto para a equipe.
  if v_conversa.estado = 'bot' and not v_agente_ativo then
    update public.conversas set estado = 'aguardando_humano', motivo_humano = 'Agente desligado'
     where id = v_conversa.id
     returning * into v_conversa;
  end if;

  return jsonb_build_object(
    'duplicada', false,
    'org_id', v_org,
    'conversa_id', v_conversa.id,
    'mensagem_id', v_msg,
    'estado', v_conversa.estado,
    'chamar_agente', v_conversa.estado = 'bot' and v_agente_ativo
  );
end $$;

-- Ao desligar o agente, as conversas que esperavam resposta dele (última mensagem é do cliente)
-- passam para a equipe; as que ele já respondeu ficam como estão até o cliente escrever.
create function public.agente_desligado_passa_conversas() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.ativo and not new.ativo then
    update public.conversas c
       set estado = 'aguardando_humano', motivo_humano = 'Agente desligado'
     where c.canal_id = new.canal_id and c.estado = 'bot'
       and (select m.direcao from public.mensagens m
             where m.conversa_id = c.id order by m.criado_em desc limit 1) = 'entrada';
  end if;
  return new;
end $$;

create trigger agentes_desligado_passa_conversas after update of ativo on public.agentes
for each row execute function public.agente_desligado_passa_conversas();

-- ============================================================================
-- Permissões
-- ============================================================================

revoke execute on function public.canal_atualizar_status(uuid, text, text), public.agente_desligado_passa_conversas()
  from public, anon, authenticated;
grant execute on function public.canal_atualizar_status(uuid, text, text) to service_role;
