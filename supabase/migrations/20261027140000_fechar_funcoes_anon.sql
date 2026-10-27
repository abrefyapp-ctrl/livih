-- Fecha funções que o visitante sem login (anon) e a tela não deveriam chamar (avisos 0028 e 0029 do Supabase, 27/10).
--
-- Causa: o padrão do schema public dá EXECUTE a anon e authenticated (e o Postgres, a PUBLIC) em toda função nova.
-- O revoke geral de 07/10 (20261007120100) só valeu para as funções que existiam; as criadas depois sem revoke
-- próprio nasceram abertas. Não mudamos o padrão global: ele vale também para o schema extensions, e só por schema
-- não dá para tirar o PUBLIC. O teste de catálogo em teste_fase1.sql passa a acusar qualquer função nova que fique
-- aberta ao anon.
--
-- Funções de gatilho: ninguém chama pela API (o Postgres não confere EXECUTE quando o gatilho dispara), então fecham
-- para public, anon e authenticated, como agentes_sincronizar e fila_disparar já estavam.
-- pode_ver_canal/contato/conversa: as políticas de RLS de authenticated usam; saem só public e anon.

revoke execute on function public.auditoria_imutavel() from public, anon, authenticated;
revoke execute on function public.campanha_mensagem_recebida() from public, anon, authenticated;
revoke execute on function public.clientes_preparar() from public, anon, authenticated;
revoke execute on function public.compromisso_lembrete_remarcado() from public, anon, authenticated;
revoke execute on function public.config_auditar() from public, anon, authenticated;
revoke execute on function public.contato_responsavel_padrao() from public, anon, authenticated;
revoke execute on function public.contatos_cliente_nos_rascunhos() from public, anon, authenticated;
revoke execute on function public.contatos_conferir_cliente() from public, anon, authenticated;
revoke execute on function public.conversas_auditar() from public, anon, authenticated;
revoke execute on function public.criar_perfil_no_cadastro() from public, anon, authenticated;
revoke execute on function public.emissoras_campos_focus() from public, anon, authenticated;
revoke execute on function public.emissoras_padrao() from public, anon, authenticated;
revoke execute on function public.estoque_imutavel() from public, anon, authenticated;
revoke execute on function public.membros_org_um_dono() from public, anon, authenticated;
revoke execute on function public.mensagens_imutavel() from public, anon, authenticated;
revoke execute on function public.notas_fiscais_imutavel() from public, anon, authenticated;
revoke execute on function public.oportunidade_criada() from public, anon, authenticated;
revoke execute on function public.oportunidade_fechamento_no_insert() from public, anon, authenticated;
revoke execute on function public.oportunidade_mudou_etapa() from public, anon, authenticated;
revoke execute on function public.organizacao_etapas_padrao() from public, anon, authenticated;
revoke execute on function public.os_historico_imutavel() from public, anon, authenticated;
revoke execute on function public.os_item_protegido() from public, anon, authenticated;
revoke execute on function public.os_item_registrar_entrada() from public, anon, authenticated;
revoke execute on function public.os_preparar_item() from public, anon, authenticated;
revoke execute on function public.os_preparar_ordem() from public, anon, authenticated;
revoke execute on function public.pedido_item_guardar() from public, anon, authenticated;
revoke execute on function public.pedido_padroes_orcamento() from public, anon, authenticated;
revoke execute on function public.pedido_preparar() from public, anon, authenticated;
revoke execute on function public.pedido_recalcular() from public, anon, authenticated;
revoke execute on function public.pedido_status_protegido() from public, anon, authenticated;
revoke execute on function public.pedidos_cliente_do_contato() from public, anon, authenticated;
revoke execute on function public.responsavel_da_equipe() from public, anon, authenticated;
revoke execute on function public.tocar_atualizado_em() from public, anon, authenticated;

revoke execute on function public.pode_ver_canal(uuid) from public, anon;
revoke execute on function public.pode_ver_contato(uuid) from public, anon;
revoke execute on function public.pode_ver_conversa(uuid) from public, anon;
grant execute on function public.pode_ver_canal(uuid) to authenticated, service_role;
grant execute on function public.pode_ver_contato(uuid) to authenticated, service_role;
grant execute on function public.pode_ver_conversa(uuid) to authenticated, service_role;
