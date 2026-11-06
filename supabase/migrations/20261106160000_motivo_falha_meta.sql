-- Motivo de a Meta não entregar a mensagem (caso de 06/11: campanha "Teste1" com 0% entregue por erro 131042, conta do
-- WhatsApp sem forma de pagamento; o motivo ficava só no log do meta-webhook e a tela mostrava "0 entregues" sem dizer
-- por quê).
--
-- A Meta aceita o envio e só depois avisa, pelo webhook de status, que não entregou. Agora o meta-webhook traduz o
-- código do erro e manda o texto junto (p_erro), que fica em mensagens.erro: a conversa mostra no balão e a campanha
-- mostra os motivos agrupados (campanha_motivos_erro).

drop function public.registrar_status_entrega(uuid, text, public.status_entrega);
create function public.registrar_status_entrega(p_canal uuid, p_wa_id text, p_status public.status_entrega, p_erro text default null)
returns void language sql security definer set search_path = '' as $$
  update public.mensagens m
     set status_entrega = p_status,
         erro = case when p_status = 'erro' then coalesce(left(p_erro, 500), m.erro) else m.erro end
    from public.conversas c
   where c.id = m.conversa_id and c.canal_id = p_canal and m.wa_id = p_wa_id
     and m.direcao = 'saida'
     and p_status > m.status_entrega;
$$;
revoke execute on function public.registrar_status_entrega(uuid, text, public.status_entrega, text) from public, anon, authenticated;
grant execute on function public.registrar_status_entrega(uuid, text, public.status_entrega, text) to service_role;

-- Por que as mensagens da campanha não foram entregues, agrupado (dono e admin, como o resto da campanha).
create function public.campanha_motivos_erro(p_campanha uuid)
returns table (motivo text, quantidade bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(m.erro, 'A Meta não informou o motivo.'), count(*)
    from public.campanha_destinatarios d
    join public.campanhas c on c.id = d.campanha_id
    join public.mensagens m on m.id = d.mensagem_id
   where d.campanha_id = p_campanha and m.status_entrega = 'erro'
     and public.tem_papel(c.org_id, '{dono,admin}')
   group by 1
   order by 2 desc;
$$;
revoke execute on function public.campanha_motivos_erro(uuid) from public, anon;
grant execute on function public.campanha_motivos_erro(uuid) to authenticated;
