-- Remover a conta do Instagram de verdade (docs/instagram-app-review.md, pedido de 20/11/2026).
--
-- Até aqui, "Remover conta" só desativava o canal e o agente: a assinatura do webhook na Meta e o token no Vault
-- continuavam, e o instagram-webhook descartava o que chegava. Para o App Review e para a política de privacidade
-- ("a Livih para de registrar e de responder as mensagens dessa conta"), a whatsapp-conexao passa a desativar o
-- canal, cancelar a assinatura (DELETE /{conta}/subscribed_apps) e chamar esta função, que apaga o token e encerra
-- a fila do canal. A conectarInstagram também a chama no canal antigo e desativado da mesma conta, como rede de
-- segurança para um token que tenha ficado para trás (remoção e reconexão ao mesmo tempo, revisão de 20/11).
--
-- Só canal já desativado: um canal ativo sem token pararia de enviar sem aviso. A fila: o que estava pendente ou
-- esperando nova tentativa vira erro final com o motivo (antes saía mesmo com a conta removida; sem o token, ficaria
-- 6 vezes pedindo para reconectar, e reconectar cria outro canal). O que já está "enviando" termina sozinho.
-- Serve também para o canal da API oficial do WhatsApp (mesmo token no Vault), que por ora continua como está.
-- O segredo apagado ainda fica nos backups do banco até eles vencerem.

create function public.meta_canal_removido(p_canal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_ativo boolean;
  v_motivo constant text := 'conta do Instagram removida';
begin
  select vault_token_id, ativo into v_id, v_ativo from public.canais where id = p_canal for update;
  if not found then
    raise exception 'canal não encontrado';
  end if;
  if v_ativo then
    raise exception 'o token só sai de canal desativado';
  end if;

  update public.canais set vault_token_id = null, meta_token_expira_em = null where id = p_canal;
  if v_id is not null then
    delete from vault.secrets where id = v_id;
  end if;

  with encerrados as (
    update public.fila_envio f set status = 'erro', tentativas = 6, erro = v_motivo
      from public.conversas c
     where c.id = f.conversa_id and c.canal_id = p_canal and f.status in ('pendente', 'erro') and f.tentativas < 6
    returning f.mensagem_id
  )
  update public.mensagens m set status_entrega = 'erro', erro = v_motivo
    from encerrados e where m.id = e.mensagem_id;
end $$;
revoke all on function public.meta_canal_removido(uuid) from public, anon, authenticated;
grant execute on function public.meta_canal_removido(uuid) to service_role;
