-- Busca do Direct pela API a cada minuto (docs/instagram.md, pedido do usuário em 19/11/2026).
--
-- Em 19/11 a Meta não entregava ao instagram-webhook as mensagens reais do livih.tech (nem de testadores, com o app
-- publicado e a conta assinada), embora a API de conversas as mostrasse. A Edge Function instagram-sincronizar busca as
-- conversas que mudaram na última hora e grava as mensagens recebidas pelas mesmas regras do webhook; a que já entrou é
-- recusada pelo ID (eventos_recebidos). Só chama a função quando existe conta do Instagram ativa: sem nenhuma, o cron
-- não gasta chamada.

select cron.schedule('livih-instagram-sincronizar', '* * * * *',
  $$select public.chamar_funcao('instagram-sincronizar')
     where exists (select 1 from public.canais where tipo = 'instagram' and ativo)$$);
