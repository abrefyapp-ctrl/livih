-- Contatos que o agente não atende.
--
-- A empresa marca no contato (contatos.sem_agente) quem deve falar só com a equipe: cliente antigo, fornecedor,
-- parceiro, alguém da família. Pode marcar antes mesmo de a pessoa escrever, cadastrando o contato com o telefone.
--
-- Regra: conversa de contato marcado nunca fica com o agente. Uma trava no próprio banco (trigger em conversas)
-- troca 'bot' por 'aguardando_humano' em qualquer caminho:
--   - conversa nova, que nasce como 'bot';
--   - conversa encerrada que o cliente reabre;
--   - "Devolver ao agente" clicado por engano;
--   - mensagem que chega numa conversa que estava com o agente quando o contato foi marcado.
-- E agente_deve_responder recusa, caso o n8n já tenha sido chamado.

alter table public.contatos add column sem_agente boolean not null default false;

create function public.conversa_contato_sem_agente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'bot'
     and exists (select 1 from public.contatos ct where ct.id = new.contato_id and ct.sem_agente) then
    new.estado := 'aguardando_humano';
    new.motivo_humano := 'Contato atendido só pela equipe';
  end if;
  return new;
end $$;

create trigger conversas_contato_sem_agente before insert or update on public.conversas
for each row execute function public.conversa_contato_sem_agente();

-- Ao marcar um contato, as conversas dele que estavam com o agente passam para a equipe.
create function public.contato_marcado_sem_agente() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sem_agente and not old.sem_agente then
    update public.conversas set estado = 'aguardando_humano', motivo_humano = 'Contato atendido só pela equipe'
     where contato_id = new.id and estado = 'bot';
  end if;
  return new;
end $$;

create trigger contatos_marcado_sem_agente after update of sem_agente on public.contatos
for each row execute function public.contato_marcado_sem_agente();

revoke execute on function public.conversa_contato_sem_agente(), public.contato_marcado_sem_agente()
  from public, anon, authenticated;

-- Igual à versão de 20261007220000, mais a checagem do contato.
create or replace function public.agente_deve_responder(p_conversa uuid, p_mensagem uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_motivo text;
begin
  if not exists (
    select 1 from public.conversas c
      join public.agentes a on a.canal_id = c.canal_id and a.ativo
      join public.organizacoes o on o.id = c.org_id and o.status = 'ativa'
      join public.contatos ct on ct.id = c.contato_id and not ct.sem_agente
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
