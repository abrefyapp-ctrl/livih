-- Limpa os dados de teste e de demonstração da CEFEQ antes da implantação (pedido do usuário em 16/11).
-- A empresa nasceu em 26/10 como demonstração: conversas de teste (Jhean, Felippe e 2 sem nome), contatos,
-- oportunidade e orçamento da demonstração, 8 clientes fictícios, 67 OS de 26/10, 57 lançamentos e 2 contas do
-- Financeiro de 29/10, 40 produtos e 40 documentos de exemplo. Ficam: a empresa, os números, a configuração do
-- agente, as equipes, as etapas do funil, as categorias do Financeiro e o histórico de consumo do agente.
-- Mensagens são imutáveis: o modo LGPD (livih.lgpd) vale só dentro desta transação, e a exclusão fica na auditoria.
-- Os arquivos (8 mídias das conversas e 40 documentos) ficam no Storage: apagar pelo painel do Supabase.
-- v_simular = true: faz tudo e desfaz no fim (mostra o que apagaria).
do $$
declare
  v_org constant uuid := 'a80dc2a2-815d-473b-a6cb-cb419509de1d';
  v_simular constant boolean := false;
  v_antes jsonb;
  v_depois jsonb;
begin
  if (select nome from public.organizacoes where id = v_org) <> 'CEFEQ' then
    raise exception 'empresa errada';
  end if;
  perform set_config('livih.lgpd', 'on', true);

  select jsonb_build_object(
    'conversas', (select count(*) from public.conversas where org_id = v_org),
    'mensagens', (select count(*) from public.mensagens where org_id = v_org),
    'contatos', (select count(*) from public.contatos where org_id = v_org),
    'clientes', (select count(*) from public.clientes where org_id = v_org),
    'oportunidades', (select count(*) from public.oportunidades where org_id = v_org),
    'pedidos', (select count(*) from public.pedidos where org_id = v_org),
    'ordens_servico', (select count(*) from public.ordens_servico where org_id = v_org),
    'fin_lancamentos', (select count(*) from public.fin_lancamentos where org_id = v_org),
    'fin_contas', (select count(*) from public.fin_contas where org_id = v_org),
    'produtos', (select count(*) from public.produtos where org_id = v_org),
    'documentos', (select count(*) from public.documentos where org_id = v_org)) into v_antes;

  insert into public.auditoria (org_id, ator_tipo, acao, entidade, entidade_id, antes, depois)
  values (v_org, 'sistema', 'limpar_dados_teste', 'organizacoes', v_org::text,
          v_antes || jsonb_build_object('motivo', 'dados de teste e demonstração antes da implantação (16/11)'), null);

  -- Conversas
  delete from public.fila_envio where org_id = v_org;
  delete from public.documentos_envios where org_id = v_org;
  delete from public.alertas where org_id = v_org;
  delete from public.tarefas where org_id = v_org;
  delete from public.notas where org_id = v_org;
  delete from public.origem_ciclos where org_id = v_org;
  delete from public.mensagens where org_id = v_org;
  delete from public.conversas where org_id = v_org;
  -- Funil e vendas
  delete from public.pedidos where org_id = v_org;
  delete from public.oportunidades where org_id = v_org;
  delete from public.contatos_clientes where org_id = v_org;
  delete from public.contatos where org_id = v_org;
  delete from public.ordens_servico where org_id = v_org;
  -- Financeiro
  delete from public.fin_baixas where org_id = v_org;
  delete from public.fin_transferencias where org_id = v_org;
  delete from public.fin_lancamentos where org_id = v_org;
  delete from public.fin_contas where org_id = v_org;
  -- Catálogo e clientes
  delete from public.documentos where org_id = v_org;
  delete from public.produtos where org_id = v_org;
  delete from public.clientes where org_id = v_org;

  select jsonb_build_object(
    'conversas', (select count(*) from public.conversas where org_id = v_org),
    'mensagens', (select count(*) from public.mensagens where org_id = v_org),
    'contatos', (select count(*) from public.contatos where org_id = v_org),
    'clientes', (select count(*) from public.clientes where org_id = v_org),
    'oportunidades', (select count(*) from public.oportunidades where org_id = v_org),
    'pedidos', (select count(*) from public.pedidos where org_id = v_org),
    'ordens_servico', (select count(*) from public.ordens_servico where org_id = v_org),
    'fin_lancamentos', (select count(*) from public.fin_lancamentos where org_id = v_org),
    'fin_contas', (select count(*) from public.fin_contas where org_id = v_org),
    'produtos', (select count(*) from public.produtos where org_id = v_org),
    'documentos', (select count(*) from public.documentos where org_id = v_org)) into v_depois;

  if v_simular then
    raise exception 'SIMULACAO (nada gravado). Antes: % | Depois: %', v_antes, v_depois;
  end if;
end $$;

select (select count(*) from public.conversas where org_id = 'a80dc2a2-815d-473b-a6cb-cb419509de1d') as conversas,
       (select count(*) from public.clientes where org_id = 'a80dc2a2-815d-473b-a6cb-cb419509de1d') as clientes,
       (select count(*) from public.produtos where org_id = 'a80dc2a2-815d-473b-a6cb-cb419509de1d') as produtos,
       (select count(*) from public.canais where org_id = 'a80dc2a2-815d-473b-a6cb-cb419509de1d') as numeros_mantidos;
