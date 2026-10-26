-- NFS-e Nacional: código indicador da operação (cIndOp, Anexo VII da NT da NFS-e), da reforma tributária.
--
-- Teste da F7 em 25/10: o Ambiente Nacional (homologação já no leiaute da reforma) exige finNFSe, e a Focus só gera
-- o leiaute novo quando o grupo IBS/CBS vai completo (finalidade, consumidor final, destinatário, cIndOp, CST e
-- classificação). Os três códigos dependem do serviço (tabela de correlação LC 116/NBS × cIndOp × cClassTrib) e
-- vêm da contabilidade; a emissão pede os três.

alter table public.emissoras
  add column nfse_codigo_indicador_operacao text check (nfse_codigo_indicador_operacao ~ '^\d{6}$');
comment on column public.emissoras.nfse_codigo_indicador_operacao is 'cIndOp (6 dígitos, Anexo VII da NFS-e Nacional), da contabilidade';
