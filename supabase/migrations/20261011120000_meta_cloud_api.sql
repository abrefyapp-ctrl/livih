-- API oficial do WhatsApp (Cloud API da Meta), conectada pelo Embedded Signup.
--
-- O canal guarda o tipo por registro: um número que estava no WAHA vira 'meta' mantendo o mesmo canal_id
-- (conversas, contatos e histórico continuam). No tipo 'meta', instance_id = phone_number_id da Meta e
-- vault_token_id aponta para o token da empresa devolvido pelo cadastro.

alter table public.canais
  add column meta_waba_id text,
  add column meta_coexistencia boolean not null default false,
  add column meta_token_expira_em timestamptz,
  add column meta_sync_pedido_em timestamptz;

comment on column public.canais.meta_waba_id is 'WhatsApp Business Account do número (tipo meta)';
comment on column public.canais.meta_coexistencia is 'número continua no app WhatsApp Business do celular (coexistência)';
comment on column public.canais.meta_token_expira_em is 'validade do token da empresa (null = não expira ou desconhecida)';
comment on column public.canais.meta_sync_pedido_em is 'quando contatos e histórico do app foram pedidos (só uma vez, até 24 h após conectar)';

-- Canal pelo phone_number_id que vem em todo webhook da Meta (o webhook é um só para o app inteiro).
create function public.canal_por_numero_meta(p_phone_number_id text)
returns table (canal_id uuid, org_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.id, c.org_id
    from public.canais c
    join public.organizacoes o on o.id = c.org_id and o.status = 'ativa'
   where c.tipo = 'meta' and c.instance_id = p_phone_number_id and c.ativo;
$$;

-- Token da empresa no Vault: grava (ou troca) e devolve. A tabela guarda só a referência.
create function public.meta_guardar_token(p_canal uuid, p_token text, p_expira_em timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select vault_token_id into v_id from public.canais where id = p_canal for update;
  if v_id is not null and exists (select 1 from vault.secrets where id = v_id) then
    perform vault.update_secret(v_id, p_token);
  else
    v_id := vault.create_secret(p_token, 'meta_token_' || p_canal::text, 'token da empresa (Cloud API) do canal');
  end if;
  update public.canais set vault_token_id = v_id, meta_token_expira_em = p_expira_em where id = p_canal;
end $$;

create function public.meta_token_do_canal(p_canal uuid)
returns text language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret
    from public.canais c join vault.decrypted_secrets s on s.id = c.vault_token_id
   where c.id = p_canal;
$$;

-- PIN de duas etapas do número, definido pelo Livih ao registrar um número novo (sem coexistência).
-- Sem ele não dá para registrar o número de novo depois.
create function public.meta_guardar_pin(p_canal uuid, p_pin text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'meta_pin_' || p_canal::text;
  if v_id is null then
    perform vault.create_secret(p_pin, 'meta_pin_' || p_canal::text, 'PIN de duas etapas do número (Cloud API)');
  else
    perform vault.update_secret(v_id, p_pin);
  end if;
end $$;

-- Só as Edge Functions (service_role) mexem em token.
revoke all on function public.meta_guardar_pin(uuid, text) from public, anon, authenticated;
revoke all on function public.meta_guardar_token(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.meta_token_do_canal(uuid) from public, anon, authenticated;
revoke all on function public.canal_por_numero_meta(text) from public, anon, authenticated;

-- Histórico e contatos que o app WhatsApp Business manda na coexistência. A Meta só manda UMA vez
-- (pedido até 24 h depois de conectar); guardar cru agora permite importar para as conversas depois.
create table public.meta_sincronizacao (
  id bigint generated always as identity primary key,
  canal_id uuid not null references public.canais (id) on delete cascade,
  campo text not null,                -- history | smb_app_state_sync
  payload jsonb not null,
  recebido_em timestamptz not null default now(),
  importado_em timestamptz
);
create index meta_sincronizacao_canal on public.meta_sincronizacao (canal_id, recebido_em);
alter table public.meta_sincronizacao enable row level security;
-- Sem policy: só service_role lê e grava.

