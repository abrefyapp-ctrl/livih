-- Nota de teste não trava o pedido (pedido do usuário em 11/11): com uma NF-e ou NFS-e autorizada em homologação, o
-- pedido (ou a OS) não deixava emitir de novo, e para testar outra vez era preciso criar outro pedido. A nota de teste
-- não tem valor fiscal, então só a autorizada em produção (e a que está processando) conta como "viva".

drop index public.notas_fiscais_uma_viva;
create unique index notas_fiscais_uma_viva on public.notas_fiscais (pedido_id)
  where status = 'processando' or (status = 'autorizada' and ambiente = 'producao');

drop index public.notas_fiscais_uma_viva_os;
create unique index notas_fiscais_uma_viva_os on public.notas_fiscais (os_id)
  where status = 'processando' or (status = 'autorizada' and ambiente = 'producao');
