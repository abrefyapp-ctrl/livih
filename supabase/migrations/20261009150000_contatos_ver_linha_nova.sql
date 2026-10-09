-- Corrige "Não foi possível criar o contato" na tela (quebrado desde a carteira, 20261007200000).
--
-- A tela cria o contato com INSERT ... RETURNING id. O RETURNING passa pela política de leitura (contatos_ver),
-- que chamava pode_ver_contato(id). Essa função procura o contato pelo id na tabela, mas dentro do mesmo
-- comando a linha recém-inserida ainda não aparece para ela: resultado falso, e o banco recusa o insert inteiro
-- por RLS.
--
-- A política passa a avaliar os dados da própria linha (org, responsável, id). As regras são as mesmas da
-- carteira. pode_ver_contato(uuid) continua igual para as outras tabelas (oportunidades, notas), que sempre
-- apontam para um contato já gravado.

create function public.pode_ver_contato_linha(p_org uuid, p_contato uuid, p_responsavel uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_membro(p_org)
     and (
       public.tem_papel(p_org, '{dono,admin}')
       or p_responsavel = auth.uid()
       or exists (select 1 from public.conversas v where v.contato_id = p_contato and public.pode_ver_canal(v.canal_id))
       or (p_responsavel is null and not exists (select 1 from public.conversas v where v.contato_id = p_contato))
     );
$$;
revoke execute on function public.pode_ver_contato_linha(uuid, uuid, uuid) from public, anon;
grant execute on function public.pode_ver_contato_linha(uuid, uuid, uuid) to authenticated;

drop policy contatos_ver on public.contatos;
create policy contatos_ver on public.contatos for select to authenticated
  using (public.pode_ver_contato_linha(org_id, id, responsavel_id));

drop policy contatos_editar on public.contatos;
create policy contatos_editar on public.contatos for update to authenticated
  using (public.pode_ver_contato_linha(org_id, id, responsavel_id)) with check (public.eh_membro(org_id));
