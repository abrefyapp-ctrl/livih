-- NFS-e Nacional pela Focus NFe, entrega 1 (plano e decisões de 25/10 em docs/nfse.md).
--
-- A nota de serviço usa a base da NF-e (docs/nfe.md): o mesmo CNPJ na Focus, a permissão "Emite nota fiscal", a
-- tabela de notas, o gatilho e a cópia dos arquivos. Aqui: a configuração da NFS-e por CNPJ e, nas notas, o modelo
-- (nfe/nfse), a OS de origem, a descrição e a competência. A nota pode sair de um pedido, de uma OS ou avulsa.

-- ============================================================================
-- Emissora: NFS-e
-- ============================================================================
alter table public.emissoras
  add column nfse_ativa boolean not null default false,
  -- Município do CNPJ (IBGE) e o padrão de NFS-e dele na Focus: a função grava ao configurar.
  add column codigo_municipio_ibge text check (codigo_municipio_ibge ~ '^\d{7}$'),
  add column nfse_provedor text check (length(nfse_provedor) <= 100),
  add column nfse_habilitada_focus boolean not null default false,
  add column inscricao_municipal text check (length(inscricao_municipal) <= 15),
  add column nfse_codigo_tributacao_nacional text check (nfse_codigo_tributacao_nacional ~ '^\d{6}$'),
  add column nfse_codigo_tributacao_municipal text check (nfse_codigo_tributacao_municipal ~ '^\d{3}$'),
  add column nfse_codigo_nbs text check (nfse_codigo_nbs ~ '^\d{9}$'),
  add column nfse_descricao_padrao text check (length(nfse_descricao_padrao) <= 1000),
  add column nfse_regime_especial smallint not null default 0 check (nfse_regime_especial in (0, 1, 2, 3, 4, 5, 6, 9)),
  -- Reforma tributária (IBS/CBS): opcionais até a prefeitura exigir.
  add column ibs_cbs_cst text check (ibs_cbs_cst ~ '^\d{3}$'),
  add column ibs_cbs_classificacao text check (ibs_cbs_classificacao ~ '^\d{6}$');

comment on column public.emissoras.nfse_codigo_tributacao_nacional is 'código de tributação nacional do ISSQN (cTribNac, 6 dígitos), da contabilidade';

-- O que vem da Focus (agora também o município e a NFS-e ligada lá) só a função grava. Igual ao de 20261025130000.
create or replace function public.emissoras_campos_focus() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.role() = 'authenticated'
     and (new.nfe_status, new.nfe_erro, new.focus_empresa_id, new.certificado_validade, new.certificado_cnpj, new.nfe_sincronizado_em,
          new.nfse_provedor, new.nfse_habilitada_focus)
         is distinct from
         (old.nfe_status, old.nfe_erro, old.focus_empresa_id, old.certificado_validade, old.certificado_cnpj, old.nfe_sincronizado_em,
          old.nfse_provedor, old.nfse_habilitada_focus) then
    raise exception 'a situação na Focus é atualizada só pela configuração da nota fiscal';
  end if;
  return new;
end $$;

-- ============================================================================
-- Notas: modelo, OS, descrição e competência
-- ============================================================================
alter table public.notas_fiscais
  add column modelo text not null default 'nfe' check (modelo in ('nfe', 'nfse')),
  add column os_id uuid,
  add column descricao text check (length(descricao) <= 2000),
  add column data_competencia date;
alter table public.notas_fiscais add constraint notas_fiscais_os_fk
  foreign key (os_id, org_id) references public.ordens_servico (id, org_id) on delete set null (os_id);
create unique index notas_fiscais_uma_viva_os on public.notas_fiscais (os_id) where status in ('processando', 'autorizada');
create index notas_fiscais_cliente_idx on public.notas_fiscais (cliente_id);

-- Quem vê a nota: a do pedido, quem vê o pedido; a da OS, a oficina; a avulsa, quem emite nota na empresa.
drop policy notas_fiscais_ver on public.notas_fiscais;
create policy notas_fiscais_ver on public.notas_fiscais for select to authenticated
  using (public.eh_membro(org_id) and (
    (pedido_id is not null and exists (select 1 from public.pedidos p where p.id = notas_fiscais.pedido_id))
    or (os_id is not null and public.os_membro(org_id))
    or (pedido_id is null and os_id is null and public.emite_nota_fiscal(org_id))
  ));

-- A chave de acesso da NFS-e Nacional tem 50 dígitos (a da NF-e, 44).
alter table public.notas_fiscais drop constraint notas_fiscais_chave_check;
alter table public.notas_fiscais add constraint notas_fiscais_chave_check check (chave ~ '^(\d{44}|\d{50})$');
