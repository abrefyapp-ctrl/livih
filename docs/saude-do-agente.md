# Saúde do agente (peça 1 do Orientador do agente)

Especificação para começar a implementar. Contexto e as outras peças: [roadmap.md](roadmap.md#orientador-do-agente-proposto-em-1510).

## Objetivo

Mostrar ao dono da empresa, em Configurações → Agente, quanto o agente lê a cada resposta, quanto isso custa e o que
está pesando, com conserto de um clique quando é seguro. Sem IA: regras fixas, baratas e previsíveis.

Teria evitado o caso da JoGrampo (15/10): catálogo na base, catálogo duplicado, 154 linhas de separador no prompt.

## Quem vê e onde

- Dono e admin da empresa, e a equipe da plataforma (inclusive no modo suporte). Atendente não vê.
- Cartão no topo de **Configurações → Agente**. Na aba **Base de conhecimento**, uma linha-resumo com o total e o
  link para o cartão. Os alertas de um item específico também aparecem ao lado dele na lista da base.
- Empresa com mais de um número: o prompt e as regras são de cada agente (por número), a base é da empresa. O cartão
  mostra um bloco por número.

## O que mostra

### 1. Tamanho lido por resposta

Por número, em caracteres, com barra por parte:

| Parte | De onde vem |
|---|---|
| Instruções | `agentes.prompt` |
| Regras de chamar a equipe | `agentes.regras_humano.casos` (soma) |
| Base de conhecimento | `base_conhecimento.conteudo` dos itens ativos da empresa |
| Parte fixa do sistema | ~4 mil caracteres (bloco CRM, horário, dados do contato), constante no código |
| Histórico | média das últimas 40 mensagens das conversas recentes; se não houver, 3 mil |

### 2. Custo por resposta

- **Estimado:** `tokens por chamada = caracteres ÷ 4,5`. `custo = chamadas por resposta × tokens × preço de
  entrada × câmbio`. A saída (~50 tokens) é desprezível.
  - O fator 4,5 foi medido na JoGrampo em 15/10: 233 mil caracteres deram ~50 mil tokens por chamada, e 77 mil deram
    ~17,5 mil.
  - Chamadas por resposta: a média real da empresa nos últimos 30 dias em `uso_ia.chamadas`; sem histórico, 1,6.
  - Preço do modelo em `precos_ia`; câmbio R$ 5,50, o mesmo do painel de uso.
  - Conferência: 77 mil caracteres × 2 chamadas dá R$ 0,047; o medido foi R$ 0,048.
- **Real:** `uso_ia` dos últimos 7 dias, tipo `resposta`: número de respostas, média de tokens de entrada, custo por
  resposta e por conversa (respostas ÷ conversas distintas).
- **Projeção:** custo por conversa × conversas do mês no ritmo atual. Quando os planos tiverem a cota cadastrada,
  comparar com ela (hoje a cota só está no roadmap).

Faixas pelo custo estimado por resposta:

| Faixa | Custo | Tamanho aproximado (1,6 chamada) |
|---|---|---|
| Verde | até R$ 0,02 | até ~40 mil caracteres |
| Amarelo | R$ 0,02 a R$ 0,05 | até ~100 mil |
| Vermelho | acima de R$ 0,05 | acima de ~100 mil |

### 3. Alertas

Cada alerta tem condição, mensagem para o cliente, economia estimada (caracteres e R$ por mês no ritmo atual) e ação.

| # | Condição | Mensagem (resumo) | Ação |
|---|---|---|---|
| A1 | Item da base com 20 ou mais preços (`R$\s?\d`) ou 20 ou mais linhas no padrão "Produto:/Preço:" | "Este conteúdo parece um catálogo (N preços). Produtos cadastrados são consultados só quando o cliente pergunta." | Ir para Produtos → Importar; texto explicando o CSV. Na peça 2 vira "Importar este catálogo". Depois de importar: "Desativar este conteúdo". |
| A2 | Dois itens ativos da base em que 80% ou mais das linhas (com mais de 30 caracteres) de um estão no outro | "X repete o conteúdo de Y." | **Desativar X** (um clique, com confirmação). |
| A3 | Linhas só de decoração em prompt, regras ou base: 5 ou mais de `= - _ * ~ #` sozinhos na linha | "N caracteres de separadores: o agente lê e você paga, sem mudar nada no atendimento." | **Limpar** (um clique): remove essas linhas e junta quebras de linha triplas. Mesma regra aplicada à mão em 15/10. |
| A4 | Prompt acima de 20 mil caracteres; item de regra acima de 3 mil; item da base acima de 15 mil | "Muito longo para ler em toda resposta." | Só orientação (não há conserto automático seguro). |
| A5 | Trechos repetidos entre prompt, regras e base: sequências de 8 palavras em comum acima de 15% do menor texto | "Estes trechos aparecem em mais de um lugar" + até 3 exemplos | Só orientação. Na peça 4, o assistente propõe a versão unificada. |
| A6 | Prompt vazio, ou base vazia com o agente ligado | "O agente responde só com o conhecimento geral dele." | Link para editar. |

Ordem dos alertas: pela economia estimada, do maior para o menor.

## Regras dos consertos de um clique

- Só **Limpar separadores** (A3) e **Desativar** (A2, e A1 depois de importar). Nada mais altera texto do cliente.
- Sempre com confirmação mostrando o antes e o depois (quantos caracteres saem, e na limpeza uma amostra das linhas).
- Desativar é reversível (o item continua na lista, inativo). Na limpeza, guardar o texto anterior para
  **Desfazer** enquanto o cartão estiver aberto.
- Usam as gravações que já existem (update em `agentes` e `base_conhecimento` pela RLS de dono/admin). A plataforma no
  modo suporte também pode.

## Implementação

Sem migration: tudo o que o cartão precisa já é legível por dono/admin pela RLS (`agentes`, `base_conhecimento`,
`uso_ia`, `precos_ia`, `mensagens`).

- `src/services/saudeAgente.ts`: funções puras.
  - `medir(agente, base, historico)` devolve as partes em caracteres.
  - `estimarCusto(caracteres, chamadas, preco)`.
  - `alertas(agente, base)` devolve a lista A1 a A6 com economia estimada.
  - `limparSeparadores(texto)`.
- Carregamento: uma função `carregarSaude(orgId)` que busca agentes da empresa, base ativa, `uso_ia` dos últimos 7 e
  30 dias e o preço do modelo.
- `src/components/SecaoSaudeAgente.tsx`: cartão com barras por parte, custo estimado e real, faixa de cor, lista de
  alertas com as ações e o diálogo de confirmação.
- Encaixe em `SecaoAgente` (topo) e uma linha-resumo em `SecaoBase`.

## Como testar

- **Fixture real:** o estado da JoGrampo antes de 15/10. O prompt original está em
  `claude_code/backup_prompt_agente_jogrampo_20261015.md`; os catálogos estão desativados na base, que mantém o
  histórico. Tem que gerar:
  - A1 nos dois catálogos;
  - A2 em "Máquinas" contida no catálogo unificado;
  - A3 com 7.854 caracteres;
  - A4 no prompt (35,8 mil) e na regra (15 mil);
  - custo estimado vermelho, perto de R$ 0,14.
- **Estado de hoje:** sem A1, A2 e A3, e custo estimado perto de R$ 0,04, em amarelo.
- Rodar as funções puras com `vite-node` sobre as fixtures (como no teste do PDF), com saída comparada à esperada.
- Na tela: modo suporte na JoGrampo, conferir números e alertas. Testar o Limpar e o Desfazer num agente de teste,
  não no do cliente.

## Fora desta peça

IA de qualquer tipo, edição livre do texto, importação de catálogo (peça 2), simulador (peça 3) e o assistente
(peça 4). Também não mexe na ordem do prompt montado pelo n8n (item separado: pôr primeiro o que não muda, para
aproveitar o cache da OpenAI).

Esforço estimado: 1 dia, contando testes.
