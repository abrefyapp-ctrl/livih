-- Trava contra robô: o teto de 8 respostas em 10 minutos pegava venda rápida com gente de verdade
-- (10/10: cliente respondendo "5", "Sim", "Ok" em 10–30 s, 8 respostas do agente em 3 min → equipe chamada).
-- Agora o teto de 8 só vale se o contato também escreve textos longos (cara de robô/IA do outro lado);
-- com 20 respostas em 10 minutos para sempre. Regras 2 e 3 não mudam.
create or replace function public.agente_suspeita_robo(p_conversa uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_agora timestamptz := clock_timestamp();
  v_n integer;
  v_media numeric;
begin
  -- 1. Teto: muitas respostas do agente em 10 minutos.
  select count(*) into v_n from public.mensagens
   where conversa_id = p_conversa and autor_tipo = 'bot' and criado_em > v_agora - interval '10 minutes';
  if v_n >= 20 then
    return 'o agente já mandou ' || v_n || ' mensagens em 10 minutos';
  end if;
  if v_n >= 8 then
    -- Pessoa com pressa responde curto ("5", "Sim"); robô e IA respondem com texto longo.
    -- Só texto digitado: transcrição de áudio de gente é longa e não diz nada.
    select avg(length(texto)) into v_media from public.mensagens
     where conversa_id = p_conversa and direcao = 'entrada' and tipo = 'texto'
       and criado_em > v_agora - interval '10 minutes';
    if v_media >= 60 then
      return 'o agente já mandou ' || v_n || ' mensagens em 10 minutos e o contato responde com textos longos';
    end if;
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

revoke execute on function public.agente_suspeita_robo(uuid) from public, anon, authenticated;
grant execute on function public.agente_suspeita_robo(uuid) to service_role;
