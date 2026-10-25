-- NF-e pela Focus NFe, entrega 1: configuração fiscal por CNPJ (plano e decisões de 25/10 em docs/nfe.md).
--
-- Cada emissora (CNPJ) ganha os dados fiscais e a situação na Focus. A Livih tem uma conta de revenda: a função
-- nfe-config cadastra o CNPJ pela API de empresas, com o certificado (que vai direto para a Focus e não fica aqui),
-- e guarda os tokens que a Focus devolve para aquele CNPJ no Vault (nunca nas tabelas que o app lê).
--
-- Também: a permissão por pessoa "Emite nota fiscal" (desligada por padrão; o admin liga) e, nos produtos, CEST e
-- origem da mercadoria (a tela entra com a emissão).

-- ============================================================================
-- Emissora: dados fiscais
-- ============================================================================
alter table public.emissoras
  add column regime_tributario smallint check (regime_tributario in (1, 2, 3, 4)),
  add column nfe_ambiente text not null default 'homologacao' check (nfe_ambiente in ('homologacao', 'producao')),
  add column nfe_serie integer not null default 1 check (nfe_serie between 1 and 889),
  -- Padrões que a nota usa em cada item (o produto pode ter exceção mais adiante).
  add column cfop_estadual text check (cfop_estadual ~ '^[5]\d{3}$'),
  add column cfop_interestadual text check (cfop_interestadual ~ '^[6]\d{3}$'),
  add column icms_situacao text check (icms_situacao ~ '^\d{2,3}$'),
  add column icms_origem smallint not null default 0 check (icms_origem between 0 and 8),
  add column pis_situacao text check (pis_situacao ~ '^\d{2}$'),
  add column cofins_situacao text check (cofins_situacao ~ '^\d{2}$'),
  -- Sugestão de CNPJ pelo faturamento: o teto anual (sem ele, o do regime).
  add column limite_faturamento numeric(14, 2) check (limite_faturamento > 0),
  add column padrao_balcao boolean not null default false,
  -- Situação na Focus: só a função nfe-config grava (gatilho abaixo).
  add column nfe_status text not null default 'nao_configurada'
    check (nfe_status in ('nao_configurada', 'pendente', 'pronta', 'erro')),
  add column nfe_erro text check (length(nfe_erro) <= 2000),
  add column focus_empresa_id bigint,
  add column certificado_validade timestamptz,
  add column certificado_cnpj text,
  add column nfe_sincronizado_em timestamptz;

-- Um só CNPJ do balcão por empresa (o admin escolhe).
create unique index emissoras_um_balcao on public.emissoras (org_id) where padrao_balcao;

comment on column public.emissoras.regime_tributario is '1 Simples Nacional, 2 Simples com excesso de sublimite, 3 Regime normal, 4 MEI (códigos da Focus/SEFAZ)';
comment on column public.emissoras.nfe_status is 'situação do CNPJ na Focus NFe; gravada só pela função nfe-config';

-- O que vem da Focus não é editável pela tela: só a função (chave de serviço) grava.
create function public.emissoras_campos_focus() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.role() = 'authenticated'
     and (new.nfe_status, new.nfe_erro, new.focus_empresa_id, new.certificado_validade, new.certificado_cnpj, new.nfe_sincronizado_em)
         is distinct from
         (old.nfe_status, old.nfe_erro, old.focus_empresa_id, old.certificado_validade, old.certificado_cnpj, old.nfe_sincronizado_em) then
    raise exception 'a situação na Focus é atualizada só pela configuração da nota fiscal';
  end if;
  return new;
end $$;
create trigger emissoras_campos_focus before update on public.emissoras
for each row execute function public.emissoras_campos_focus();

-- ============================================================================
-- Tokens da Focus por CNPJ (Vault)
-- ============================================================================
-- Nomes no Vault: focus_<ambiente>_<emissora>. Gravar e ler só com a chave de serviço (funções nfe-*).
create function public.nfe_salvar_tokens(p_emissora uuid, p_producao text, p_homologacao text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_nome text;
  v_valor text;
begin
  foreach v_nome in array array['producao', 'homologacao'] loop
    v_valor := case v_nome when 'producao' then p_producao else p_homologacao end;
    continue when nullif(btrim(coalesce(v_valor, '')), '') is null;
    if exists (select 1 from vault.secrets where name = 'focus_' || v_nome || '_' || p_emissora) then
      perform vault.update_secret((select id from vault.secrets where name = 'focus_' || v_nome || '_' || p_emissora), v_valor);
    else
      perform vault.create_secret(v_valor, 'focus_' || v_nome || '_' || p_emissora, 'token da Focus NFe do CNPJ (emissora)');
    end if;
  end loop;
end $$;

create function public.nfe_token(p_emissora uuid, p_ambiente text)
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'focus_' || p_ambiente || '_' || p_emissora;
$$;

revoke execute on function public.nfe_salvar_tokens(uuid, text, text), public.nfe_token(uuid, text) from public, anon, authenticated;
grant execute on function public.nfe_salvar_tokens(uuid, text, text), public.nfe_token(uuid, text) to service_role;

-- ============================================================================
-- Permissão "Emite nota fiscal"
-- ============================================================================
alter table public.membros_org add column emite_nota_fiscal boolean not null default false;
comment on column public.membros_org.emite_nota_fiscal is 'emite NF-e dos pedidos que vê (dono e admin sempre emitem); cancelar continua só para dono e admin';

create function public.emite_nota_fiscal(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tem_papel(p_org, '{dono,admin}') or exists (
    select 1 from public.membros_org m join public.organizacoes o on o.id = m.org_id
     where m.org_id = p_org and m.user_id = auth.uid() and m.ativo and m.emite_nota_fiscal and o.status = 'ativa'
  );
$$;

create function public.membro_definir_emite_nota_fiscal(p_org uuid, p_usuario uuid, p_valor boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_antes boolean;
begin
  if not public.tem_papel(p_org, '{dono,admin}') then
    raise exception 'só dono e admin mudam esta permissão';
  end if;
  select emite_nota_fiscal into v_antes from public.membros_org where org_id = p_org and user_id = p_usuario;
  if v_antes is null then
    raise exception 'membro não encontrado';
  end if;
  update public.membros_org set emite_nota_fiscal = coalesce(p_valor, false) where org_id = p_org and user_id = p_usuario;
  if v_antes is distinct from coalesce(p_valor, false) then
    perform public.auditar(p_org, 'emite_nota_fiscal', 'membros_org', p_usuario::text,
                           jsonb_build_object('emite_nota_fiscal', v_antes),
                           jsonb_build_object('emite_nota_fiscal', coalesce(p_valor, false)));
  end if;
end $$;

revoke execute on function public.emite_nota_fiscal(uuid), public.membro_definir_emite_nota_fiscal(uuid, uuid, boolean) from public, anon;
grant execute on function public.emite_nota_fiscal(uuid), public.membro_definir_emite_nota_fiscal(uuid, uuid, boolean) to authenticated;

-- ============================================================================
-- Produto: CEST e origem (o NCM já existe)
-- ============================================================================
alter table public.produtos
  add column cest text check (cest ~ '^\d{7}$'),
  add column origem smallint check (origem between 0 and 8);
comment on column public.produtos.origem is 'origem da mercadoria (0 nacional, 1 importação direta, 2 adquirida no mercado interno...); vazio = a do CNPJ';
