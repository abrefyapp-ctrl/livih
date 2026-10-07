-- Trava contra robô do outro lado.
--
-- Se o contato é um atendimento automático (menu, "Ticket #106", "mensagem automática"), o agente e o
-- outro robô respondem um ao outro sem fim: gasta modelo, polui o histórico e o cliente real (se houver)
-- não é atendido. Visto em 07/10 com o sistema de tickets da Abrefy.
--
-- agente_deve_responder (consultada pelo n8n antes de cada resposta) passa a checar três sinais; qualquer
-- um basta para o agente parar e chamar a equipe, que decide (pode devolver ao agente se for engano).

create function public.agente_suspeita_robo(p_conversa uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_agora timestamptz := clock_timestamp();
  v_n integer;
begin
  -- 1. Teto: nenhuma conversa humana precisa de 8 respostas do agente em 10 minutos.
  select count(*) into v_n from public.mensagens
   where conversa_id = p_conversa and autor_tipo = 'bot' and criado_em > v_agora - interval '10 minutes';
  if v_n >= 8 then
    return 'o agente já mandou ' || v_n || ' mensagens em 10 minutos';
  end if;

  -- 2. Cara de resposta automática em 2 das últimas 5 mensagens do contato (últimos 30 min).
  select count(*) into v_n from (
    select coalesce(texto, transcricao, '') as t from public.mensagens
     where conversa_id = p_conversa and direcao = 'entrada' and criado_em > v_agora - interval '30 minutes'
     order by criado_em desc limit 5
  ) m
  -- \W{0,6}: aceita "Ticket: #106", "*Ticket:* #106" (negrito do WhatsApp), "Protocolo nº 123".
  where m.t ~* '(ticket|protocolo|chamado)\W{0,6}(n[º°o.]?)?\W{0,4}\d{2,}'
     or m.t ~* '(mensagem|resposta|atendimento) autom[aá]tic[ao]'
     or m.t ~* '(digite|responda com) (o )?(n[uú]mero|\d)'
     or m.t ~* '(escolha|selecione) uma (das )?op[cç]'
     or m.t ~* 'menu principal|este n[uú]mero n[aã]o (recebe|[eé] monitorado)';
  if v_n >= 2 then
    return 'mensagens do contato com cara de resposta automática (ticket, protocolo, menu)';
  end if;

  -- 3. Respostas instantâneas: as 3 últimas mensagens do agente (nos últimos 10 min) foram respondidas
  --    em menos de 6 s cada, contando de quando saíram de fato (fila_envio), não de quando foram escritas.
  return (
    select case when count(*) = 3 and bool_and(resposta - enviada <= interval '6 seconds')
                then 'respostas em menos de 6 segundos às 3 últimas mensagens do agente' end
      from (
        select coalesce(f.enviado_em, b.criado_em) as enviada,
               (select min(e.criado_em) from public.mensagens e
                 where e.conversa_id = p_conversa and e.direcao = 'entrada'
                   and e.criado_em > coalesce(f.enviado_em, b.criado_em)) as resposta
          from public.mensagens b
          left join public.fila_envio f on f.mensagem_id = b.id
         where b.conversa_id = p_conversa and b.autor_tipo = 'bot' and b.criado_em > v_agora - interval '10 minutes'
         order by b.criado_em desc limit 3
      ) r
     where r.resposta is not null
  );
end $$;

-- Mesma regra de antes (conversa com o agente ativo e esta ainda é a última mensagem do contato) +
-- a trava. Deixa de ser "stable": ao detectar robô, passa a conversa para a equipe.
create or replace function public.agente_deve_responder(p_conversa uuid, p_mensagem uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_motivo text;
begin
  if not exists (
    select 1 from public.conversas c
      join public.agentes a on a.canal_id = c.canal_id and a.ativo
     where c.id = p_conversa and c.estado = 'bot'
  ) then
    return false;
  end if;
  if p_mensagem is distinct from (
    select id from public.mensagens
     where conversa_id = p_conversa and direcao = 'entrada'
     order by criado_em desc limit 1
  ) then
    return false;
  end if;

  v_motivo := public.agente_suspeita_robo(p_conversa);
  if v_motivo is not null then
    perform public.agente_chamar_humano(
      p_conversa,
      'Possível atendimento automático do outro lado (' || v_motivo || '). O agente parou para não conversar com outro robô.'
    );
    return false;
  end if;
  return true;
end $$;

revoke execute on function public.agente_suspeita_robo(uuid) from public, anon, authenticated;
grant execute on function public.agente_suspeita_robo(uuid) to service_role;
