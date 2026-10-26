-- NFS-e Nacional: alíquota efetiva do Simples Nacional do CNPJ (pTotTribSN).
--
-- Teste da F7 em 26/10: para ME/EPP o Ambiente Nacional não aceita o indicador de total de tributos (E0712); o
-- total aproximado vai como o percentual dos tributos da alíquota do Simples, que é a alíquota efetiva do DAS
-- (muda com o faturamento dos últimos 12 meses; a contabilidade informa).

alter table public.emissoras
  add column aliquota_simples numeric(4, 2) check (aliquota_simples >= 0 and aliquota_simples < 100);
comment on column public.emissoras.aliquota_simples is 'Alíquota efetiva do Simples Nacional (%), da contabilidade; vai na NFS-e como pTotTribSN';
