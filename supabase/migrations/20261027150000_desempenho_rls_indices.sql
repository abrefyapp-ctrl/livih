-- Desempenho: políticas que recalculavam auth.uid() a cada linha e nota fiscal sem índice (avisos do Supabase, 27/10).
--
-- Políticas (aviso 0003): `(select auth.uid())` é calculado uma vez por consulta; `auth.uid()` solto, uma vez por
-- linha. A regra de cada política fica idêntica; alter policy mantém papel e comando. As chamadas a eh_membro,
-- pode_ver_contato etc. continuam por linha: dependem da coluna.
--
-- Índices (aviso 0001): dos 88, quase todos os caminhos quentes já têm índice pela primeira coluna (mensagens por
-- conversa, itens por pedido/OS...); o aviso é pela FK composta com org_id. As de autoria (criado_por, autor_id) só
-- pesam ao apagar usuário. Ficam só as notas fiscais por pedido e por OS: a tela busca a mais recente (notaDoPedido,
-- notas da OS) e os índices existentes são parciais (processando/autorizada), então rejeitada e cancelada liam a
-- tabela toda.

alter policy admins_ver on public.admins_plataforma using (user_id = (select auth.uid()));

alter policy membros_ver on public.membros_org using (public.eh_membro(org_id) or user_id = (select auth.uid()));

alter policy notas_apagar on public.notas using (autor_id = (select auth.uid()));
alter policy notas_criar on public.notas
  with check (public.eh_membro(org_id) and autor_id = (select auth.uid()) and autor_tipo = 'atendente'::public.autor_tipo);

alter policy oport_ver on public.oportunidades
  using (public.eh_membro(org_id) and (responsavel_id = (select auth.uid()) or public.pode_ver_contato(contato_id)));
alter policy oport_editar on public.oportunidades
  using (public.eh_membro(org_id) and (responsavel_id = (select auth.uid()) or public.pode_ver_contato(contato_id)))
  with check (public.eh_membro(org_id));

alter policy org_ver on public.organizacoes
  using (public.eh_membro(id) or exists (
    select 1 from public.membros_org m
     where m.org_id = organizacoes.id and m.user_id = (select auth.uid()) and m.ativo));

alter policy perfis_ver on public.perfis
  using (user_id = (select auth.uid()) or public.eh_admin_plataforma() or exists (
    select 1 from public.membros_org a join public.membros_org b on a.org_id = b.org_id
     where a.user_id = (select auth.uid()) and a.ativo and b.user_id = perfis.user_id));
alter policy perfis_editar on public.perfis
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter policy push_inscricoes_ver on public.push_inscricoes using (user_id = (select auth.uid()));

create index notas_fiscais_pedido_idx on public.notas_fiscais (pedido_id, criado_em desc);
create index notas_fiscais_os_idx on public.notas_fiscais (os_id, criado_em desc);
