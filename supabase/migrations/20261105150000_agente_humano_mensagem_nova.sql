-- O agente não passa a conversa para a equipe se o cliente escreveu de novo enquanto ele pensava (caso da JoGrampo,
-- 05/11: o cliente manda uma pergunta em duas ou três mensagens seguidas, o agente responde à primeira parte e chama
-- a equipe sem precisar; ex.: comprovante às 14:40:44, "Posso pedir motoboy?" às 14:40:56, passagem às 14:41:25).
--
-- A resposta em texto já era conferida na hora de enviar (agente_responder → agente_deve_responder: só sai se a
-- mensagem que o agente atende ainda é a última do cliente). Chamar a equipe não era: a ferramenta mudava a conversa
-- na hora. Agora a ferramenta do agente passa a mensagem que ele está atendendo; se já há outra mais nova, a passagem
-- é recusada, a resposta desta rodada também não sai, e a rodada da mensagem nova decide com tudo junto.
-- Junto (no n8n): a espera antes de responder subiu de 6 para 20 segundos.
--
-- As passagens automáticas do banco (franquia esgotada, possível robô do outro lado, contato "sem agente") seguem
-- em agente_chamar_humano, sem esta conferência.

create function public.agente_pedir_humano(p_conversa uuid, p_motivo text, p_mensagem uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.agente_marcar();
  if p_mensagem is not null and p_mensagem is distinct from (
    select id from public.mensagens
     where conversa_id = p_conversa and direcao = 'entrada'
     order by criado_em desc limit 1
  ) then
    return jsonb_build_object('sucesso', false, 'mensagem_nova', true,
      'aviso', 'O cliente mandou outra mensagem enquanto você pensava. Não chame a equipe e não escreva resposta agora: a mensagem nova vai ser respondida com a conversa toda.');
  end if;
  return public.agente_chamar_humano(p_conversa, p_motivo);
end $$;

revoke execute on function public.agente_pedir_humano(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.agente_pedir_humano(uuid, text, uuid) to service_role;
