# Livih

CRM de atendimento e vendas pelo WhatsApp, multiempresa, com agente de IA. Produto da F7 Tech. Sempre **a Livih**
(feminino): "a Livih", "da Livih", "na Livih", em texto de tela, mensagem, documentação e commit.

## Arquitetura

- **Front** (`src/`): React 19 + Vite + TypeScript + Tailwind 4, em app.livih.com.br (Cloudflare). Fala com o Supabase
  pelo supabase-js, com o login do usuário: a segurança é a RLS do banco, não a tela.
- **Banco** (`supabase/migrations/`): Postgres do Supabase. A regra de negócio mora aqui: funções SQL, gatilhos, RLS
  por empresa e por carteira, cron (`cron.schedule`) e Vault. Funções `agente_*` e `simulador_*` só com a chave de
  serviço.
- **Edge Functions** (`supabase/functions/`, Deno): WhatsApp (WAHA e Meta), notas fiscais (Focus NFe), IA, convites,
  push. Código comum em `_shared/` (`focus.ts` serve as 4 funções de nota; `atendimento.ts` e `midia.ts` servem os dois
  webhooks de WhatsApp).
- **n8n na VPS**: o agente e o simulador. Os workflows são gerados por `n8n/gerar_workflow.py`
  (`n8n/livih-agente.json` e `n8n/livih-simulador.json`) e chamam funções SQL de volta.
- **livih-pdf** (`pdf-servico/`): serviço Node na VPS que gera o PDF do orçamento e da OS com o mesmo componente React
  da tela.
- **Site institucional** (`site/public/`, HTML estático): livih.com.br. As páginas de solução saem de
  `site/gerar_solucoes.py`; mudou o texto, mude também o gerador.
- **Docs** (`docs/`): um arquivo por entrega (plano, decisões, técnico). `docs/roadmap.md` é do usuário.

## Comandos

| Para | Comando |
|---|---|
| Rodar o app | `npm run dev` |
| Checar tipos e lint | `npx tsc -b --noEmit` e `npx eslint <arquivos>` (ou `npm run lint`) |
| Checar uma Edge Function | `npx -y deno check supabase/functions/<nome>/index.ts` |
| Testar migrations | `PYTHONIOENCODING=utf-8 python scripts/testar_migrations.py`: aplica as migrations pendentes e `scripts/teste_fase1.sql` dentro de `begin … rollback` no banco linkado; nada fica gravado |
| Consultar o banco | Supabase MCP (`.mcp.json`, só leitura: SQL, logs das funções, avisos de segurança) ou `npx supabase db query --linked -o json "<sql>"` |
| Gerar os tipos do banco | `npm run tipos` (gera `src/services/tiposBanco.ts`) |
| Publicar o app | `npm run publicar` |
| Conferir o app publicado | `npm run verificar` |

`waha-webhook` e `importar-catalogo` não passam no `deno check` local (dependências npm `pdf-lib` e `xlsx`); o erro
é antigo e não indica problema na mudança.

## Automações do Claude Code (`.claude/`)

- **`/migration <o que muda>`**: o roteiro abaixo, com os modelos de migration e de teste.
- **Hooks**: antes de editar, recusam `tiposBanco.ts`, `.env`, `docs/roadmap.md` e migrations que já estão no
  `origin/main`; depois de editar um `.ts`/`.tsx` em `src/`, rodam o ESLint no arquivo e devolvem o erro na hora.

## Mudança no banco (sempre nesta ordem)

1. Migration nova em `supabase/migrations/AAAAMMDDHHMMSS_<assunto>.sql`, com um comentário no topo dizendo o porquê.
   Nunca editar migration já aplicada: fazer outra.
2. Bloco de testes no fim de `scripts/teste_fase1.sql` (antes do `reset role; select … from resultado`), no padrão
   dos blocos existentes.
3. `python scripts/testar_migrations.py`: todos OK antes de seguir.
4. Aplicar (`npx supabase db push`), gerar os tipos (`npm run tipos`) e **salvar `tiposBanco.ts` no git**. Enquanto
   a migration não está aplicada, `tsc` acusa erro nas colunas novas: é esperado.

## Publicação

- **Quem publica é o usuário**, ou o Claude com aprovação explícita a cada comando: `db push`, `functions deploy`,
  `npm run publicar`, `git push`, importação no n8n. Na dúvida, entregue os comandos prontos.
- **`npm run publicar` não faz nada se houver mudança pendente** em `src`, `public` ou `index.html` (para em silêncio).
  Salve tudo antes.
- **Edge Functions**: publicar todas as que importam um `_shared` que mudou
  (`npx supabase functions deploy <f1> <f2> …`).
- **n8n**: depois de mudar o gerador e os JSONs, na VPS (`ssh -i ~/.ssh/livih_vps_claude root@179.197.229.162`): backup
  dos dois workflows (`n8n export:workflow` → `/docker/n8n/backups-workflows/`), `docker cp` dos JSONs para o
  contêiner `n8n-n8n-1`, `n8n import:workflow`, `n8n publish:workflow --id=LvhAgenteLivih01` (e `LvhSimuladorAg01`) e
  `docker restart n8n-n8n-1 n8n-n8n-worker-1` (o agente fica ~40 s fora). A VPS é produção: só com aprovação.
- **Site institucional**: sai com o `git push`.

## Convenções de código

- **Sem formatador automático**: não rodar Prettier (reescreve o arquivo inteiro com outro estilo). Front com aspas
  simples e sem ponto e vírgula; Edge Functions com aspas duplas e ponto e vírgula. Siga o arquivo que está editando.
- **Nomes e comentários em português**, comentário explicando o porquê (decisão, data, caso real), não o quê.
- **Funções SQL**: `security definer set search_path = ''`, nomes sempre com `public.`, `revoke execute … from public,
  anon` (e `authenticated`, nas do agente) e `grant` explícito. Conferir o papel dentro da função (`tem_papel`,
  `eh_membro`, `os_gerente`…); a tela não protege nada.
- **Edge Functions**: `verify_jwt = false` no `config.toml` e autenticação dentro da função; token e segredo nunca
  saem dela.
- **Textos de tela**: português claro, frases curtas, dizer o que fazer quando algo falha. Componentes prontos em
  `src/components/` (`Aviso`, `Botao`, `Modal`, `CampoTexto`, `DialogoConfirmacao`, `EstadoVazio`).
- Edição em lote por script: nos arquivos com CRLF, trocar `\n` pelo fim de linha do arquivo antes de procurar o
  trecho.

## Git

- Commit em português, uma frase dizendo o que mudou e por quê.
- **Nunca salvar no git**: `docs/roadmap.md` (edições do usuário), `Noto_Sans_Sora_Sompeng.zip` (apagado de
  propósito), `MOTORES ATUALIZADO 2026.xlsx` e outros arquivos soltos na raiz. Use `git add <arquivos>`, nunca
  `git add -A`.

## Segurança

- Tokens e senhas nunca no chat nem no código: ficam nos secrets do Supabase ou no Vault. Os tokens da Focus por CNPJ
  estão no Vault (`nfe_token`); `FOCUS_TOKEN_PRODUCAO` é o token da **conta** (revenda).
- Teste com dados reais de produção só dentro de `begin … rollback`. Inserção em `fila_envio` dispara envio pelo
  pg_net apenas depois do commit.
