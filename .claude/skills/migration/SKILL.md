---
name: migration
description: Cria uma mudança no banco da Livih do jeito do projeto — migration nova, testes no teste_fase1.sql, bateria com rollback e os comandos para aplicar, gerar os tipos e salvar. Use para qualquer mudança em tabela, coluna, função SQL, gatilho, política RLS ou cron (ex. /migration desconto por cliente).
argument-hint: <o que muda no banco>
---

# Mudança no banco da Livih

Objetivo: $ARGUMENTS

Siga os passos na ordem. Não pule o teste e não aplique nada no banco sem o usuário aprovar.

## 1. Entender antes de escrever

- Leia as migrations que já tratam do assunto (`grep -ln "<tabela ou função>" supabase/migrations/*.sql`) e use a
  **definição mais recente** de cada função que for mudar (as antigas foram substituídas por `create or replace`).
- Se a mudança afeta a tela, veja também o serviço em `src/services/` que chama a função ou a tabela.
- Se houver decisão de produto em aberto (quem pode, o que acontece em caso de erro), pergunte antes de escrever.

## 2. A migration

Arquivo novo: `supabase/migrations/<AAAAMMDDHHMMSS>_<assunto_em_snake_case>.sql`, com o horário depois da última
migration existente. **Nunca edite uma migration que já está no `origin/main`**: ela já foi aplicada; faça outra.

Comece com um comentário dizendo o porquê (pedido, data, caso real, decisão). Depois, o padrão do projeto:

```sql
-- <Assunto> (docs/<doc>.md, pedido de DD/MM).
--
-- <Por que muda e o que a regra garante. Decisões tomadas e o que fica para depois.>

alter table public.<tabela> add column <coluna> <tipo> <check>;
comment on column public.<tabela>.<coluna> is '<o que é, em português>';

create or replace function public.<nome>(p_org uuid, ...)
returns <tipo> language plpgsql security definer set search_path = '' as $$
declare
  ...
begin
  if not public.tem_papel(p_org, '{dono,admin}') then   -- ou eh_membro / os_gerente / pode_ver_*
    raise exception '<mensagem para a pessoa, em português>';
  end if;
  ...
end $$;

revoke execute on function public.<nome>(uuid, ...) from public, anon;          -- + authenticated nas do agente
grant execute on function public.<nome>(uuid, ...) to authenticated;            -- ou service_role
```

Regras:
- `security definer` sempre com `set search_path = ''` e nomes com `public.` (e `auth.`, `vault.`, `cron.`).
- A função confere o papel e a empresa por dentro: a tela não protege nada.
- Tabela nova: `org_id` com FK, `enable row level security`, política de `select` e `grant` explícito; gravação, de
  preferência, só pelas funções.
- Funções `agente_*` e `simulador_*`: só `service_role`.
- Mudou uma função usada pela tela: confira se a assinatura (parâmetros e retorno) continua igual; se mudar, ajuste o
  serviço em `src/services/`.
- Cron: `select cron.schedule('livih-<nome>', '<expressão>', 'select public.<funcao>()');`.

## 3. Os testes

Acrescente um bloco no fim de `scripts/teste_fase1.sql`, **antes** de `reset role;` + `select n, teste, ok from
resultado order by n;`, no padrão dos blocos existentes:

```sql

-- <Assunto> (migration <AAAAMMDDHHMMSS>).
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare
  v_org uuid := current_setting('teste.f7')::uuid;
begin
  -- prepara os dados
  insert into resultado (teste, ok) values ('<assunto>: <o que deve acontecer>', <condição>);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$ begin
  perform public.<funcao>(...);
  insert into resultado (teste, ok) values ('<assunto>: atendente não pode', false);
exception when others then
  insert into resultado (teste, ok) values ('<assunto>: atendente não pode', sqlerrm like '<início da mensagem>%');
end $$;
```

Usuários de teste: `a1` é dono e `b1` é atendente da empresa `teste.f7`; `c1` é de outra empresa (`teste.cli`).
Teste pelo menos: o caminho certo, quem não pode, outra empresa e os casos de borda do pedido.

## 4. Rodar

```
PYTHONIOENCODING=utf-8 python scripts/testar_migrations.py
```

Aplica as migrations pendentes e todos os testes dentro de `begin … rollback`: nada fica gravado. Precisa dar
**todos OK** (não só os novos). Se falhar, corrija e rode de novo.

## 5. Tela (se houver)

Mudanças em `src/` que usam a coluna ou a função nova vão dar erro de tipo até a migration ser aplicada e os tipos
gerados: é esperado. Rode `npx eslint <arquivos>` e deixe o `tsc` para depois do passo 6.

## 6. Entregar

Salve no git só os arquivos da mudança (`git add <arquivos>`, nunca `-A`) e passe ao usuário, prontos para copiar:

```
npx supabase db push
npm run tipos
git add src/services/tiposBanco.ts
git commit -m "Tipos: <assunto>"
```

e, se mudou tela ou Edge Function, `npm run publicar` e `npx supabase functions deploy <funções>`. Depois que ele
aplicar, confira com `npx tsc -b --noEmit` e diga o resultado.

Se a mudança muda uma regra de negócio, atualize o `docs/<tema>.md` correspondente.
