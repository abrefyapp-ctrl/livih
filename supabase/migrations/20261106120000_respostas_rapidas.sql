-- Respostas rápidas na conversa (docs/levantamento-funcionalidades.md, CRM item 2; pedido de 06/11).
--
-- O atendente digita as mesmas respostas o dia todo (preço do frete, chave Pix, horário, endereço). Agora há
-- mensagens prontas com atalho: na caixa da conversa, "/" abre a lista e a escolhida entra no texto para revisar antes
-- de enviar (nada sai sozinho). Duas listas:
--   - da empresa (usuario_id nulo): toda a equipe usa; só dono e admin criam, mudam e apagam;
--   - pessoais (usuario_id = quem criou): só a própria pessoa vê e edita.
-- O "{nome}" no texto vira o primeiro nome do cliente na tela, na hora de usar; o banco guarda o texto como foi escrito.
-- Sem função SQL: a tela grava direto na tabela, e a RLS garante as duas regras acima.

create table public.respostas_rapidas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes (id) on delete cascade,
  usuario_id uuid references auth.users (id) on delete cascade,
  atalho text not null check (atalho ~ '^[a-z0-9_-]{1,30}$'),
  texto text not null check (length(btrim(texto)) between 1 and 4096),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.respostas_rapidas is
  'Mensagens prontas da conversa: da empresa (usuario_id nulo, dono e admin gerem) ou pessoais (só quem criou)';
comment on column public.respostas_rapidas.atalho is 'O que se digita depois da "/" (minúsculas, números, - e _)';
comment on column public.respostas_rapidas.texto is 'Texto da mensagem; {nome} vira o primeiro nome do cliente na tela';

-- O mesmo atalho não se repete dentro da lista da empresa nem dentro da lista de uma pessoa (entre as duas, pode).
create unique index respostas_rapidas_atalho_unico
  on public.respostas_rapidas (org_id, coalesce(usuario_id, '00000000-0000-0000-0000-000000000000'::uuid), atalho);

create trigger respostas_rapidas_atualizado before update on public.respostas_rapidas
for each row execute function public.tocar_atualizado_em();

alter table public.respostas_rapidas enable row level security;
create policy respostas_rapidas_ver on public.respostas_rapidas for select to authenticated
  using (public.eh_membro(org_id) and (usuario_id is null or usuario_id = (select auth.uid())));
create policy respostas_rapidas_gerir on public.respostas_rapidas for all to authenticated
  using (public.eh_membro(org_id)
         and ((usuario_id is null and public.tem_papel(org_id, '{dono,admin}')) or usuario_id = (select auth.uid())))
  with check (public.eh_membro(org_id)
              and ((usuario_id is null and public.tem_papel(org_id, '{dono,admin}')) or usuario_id = (select auth.uid())));
grant select, insert, update, delete on public.respostas_rapidas to authenticated;
