-- Vários números por organização: o da empresa e os dos vendedores.
--
-- Decisões (07/10, usuário):
--   - canal SEM responsável = número da empresa: toda a equipe vê e responde;
--   - canal COM responsável = número de um vendedor: só ele, dono e admin veem as conversas;
--   - só dono/admin conectam números (Edge Function whatsapp-conexao);
--   - o agente é um só (instruções e base da empresa), ligado ou desligado em cada número.
-- Contatos continuam da organização inteira (CRM único); o que fica restrito são as conversas.

alter table public.canais add column responsavel_id uuid references auth.users (id) on delete set null;
comment on column public.canais.responsavel_id is 'vendedor dono do número; null = número da empresa (todos veem)';
grant update (responsavel_id) on public.canais to authenticated;

-- Quem enxerga as conversas de um canal.
create function public.pode_ver_canal(p_canal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.canais c
     where c.id = p_canal and public.eh_membro(c.org_id)
       and (c.responsavel_id is null or c.responsavel_id = auth.uid() or public.tem_papel(c.org_id, '{dono,admin}'))
  );
$$;

create function public.pode_ver_conversa(p_conversa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.pode_ver_canal((select canal_id from public.conversas where id = p_conversa));
$$;

grant execute on function public.pode_ver_canal(uuid), public.pode_ver_conversa(uuid) to authenticated;

-- ============================================================================
-- Policies: de "membro da organização" para "pode ver o canal"
-- ============================================================================

drop policy canais_ver on public.canais;
create policy canais_ver on public.canais for select to authenticated using (public.pode_ver_canal(id));

drop policy conversas_ver on public.conversas;
create policy conversas_ver on public.conversas for select to authenticated using (public.pode_ver_canal(canal_id));
drop policy conversas_editar on public.conversas;
create policy conversas_editar on public.conversas for update to authenticated
  using (public.pode_ver_canal(canal_id)) with check (public.pode_ver_canal(canal_id));

drop policy mensagens_ver on public.mensagens;
create policy mensagens_ver on public.mensagens for select to authenticated using (public.pode_ver_conversa(conversa_id));

drop policy fila_ver on public.fila_envio;
create policy fila_ver on public.fila_envio for select to authenticated using (public.pode_ver_conversa(conversa_id));

-- Nota presa a uma conversa segue a conversa; nota só do contato é da organização.
drop policy notas_ver on public.notas;
create policy notas_ver on public.notas for select to authenticated
  using (public.eh_membro(org_id) and (conversa_id is null or public.pode_ver_conversa(conversa_id)));

-- Responder pela tela: mesma regra.
create or replace function public.enviar_mensagem(p_conversa uuid, p_texto text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conversa public.conversas;
begin
  select * into v_conversa from public.conversas where id = p_conversa for update;
  if v_conversa.id is null or not public.pode_ver_canal(v_conversa.canal_id) then
    raise exception 'conversa não encontrada';
  end if;
  if v_conversa.estado <> 'humano' or v_conversa.atribuida_a is null then
    update public.conversas
       set estado = 'humano', atribuida_a = coalesce(atribuida_a, auth.uid()), nao_lidas = 0
     where id = p_conversa;
  else
    update public.conversas set nao_lidas = 0 where id = p_conversa;
  end if;
  return public.enfileirar_saida(p_conversa, p_texto, 'atendente', auth.uid());
end $$;

-- ============================================================================
-- Agente único da empresa: instruções, casos e alerta valem para todos os números
-- ============================================================================
-- Cada canal continua com sua linha em `agentes` (é o "ligado neste número"); ao mudar as instruções
-- em uma, as outras da organização acompanham.
create function public.agentes_sincronizar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if (new.prompt, new.regras_humano, new.telefone_alerta, new.modelo)
     is distinct from (old.prompt, old.regras_humano, old.telefone_alerta, old.modelo) then
    update public.agentes
       set prompt = new.prompt, regras_humano = new.regras_humano,
           telefone_alerta = new.telefone_alerta, modelo = new.modelo
     where org_id = new.org_id and id <> new.id;
  end if;
  return new;
end $$;

create trigger agentes_sincronizar after update on public.agentes
for each row execute function public.agentes_sincronizar();

revoke execute on function public.agentes_sincronizar() from public, anon, authenticated;
