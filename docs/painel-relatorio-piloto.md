# Painel e Relatório de resultados

Renomeado em 21/10: "Relatório do piloto" virou **Relatório de resultados** (no PDF, "Resultados com a Livih"),
para servir também depois do piloto (renovação, revisão periódica).

Plano aprovado em 20/10. Prova do Programa Fundadores ([roadmap.md](roadmap.md#programa-fundadores-2010)): os três
resultados do piloto são menor tempo de resposta, melhor acompanhamento dos leads e mais visibilidade das
negociações. Também responde ao "BI" dos concorrentes (DataCrazy, 20/10), na medida de uma empresa pequena.

Decisões do usuário (20/10):
- **Vendedor:** vê o Painel só da carteira dele; dono e admin veem todos.
- **Relatório do piloto:** em **PDF gerado pela Livih**, pelo serviço `livih-pdf` da VPS, como o orçamento.
- **Horas economizadas:** 2 minutos por resposta do agente, ajustável pelo dono, sempre rotulado como estimativa.

## O que já dá para medir (teste com a JoGrampo, últimos 14 dias, 20/10)

| Quem respondeu | Pedidos do cliente | Mediana até a primeira resposta | Respondidos em até 5 min |
|---|---|---|---|
| Agente | 210 | 0,3 min | 97% |
| Equipe | 102 | 3,9 min | 55% |
| Ninguém | 17 | — | — |

Os dados já estão no banco: mensagens, conversas, oportunidades, histórico do funil, agente, pedidos e agenda.
Falta juntar.

## Duas telas

1. **Painel** (menu principal, novo item "Painel"): os números da operação no período escolhido (7 dias, 30 dias
   ou personalizado), comparados com o período anterior. Filtro por número e por vendedor.
2. **Relatório do piloto** (botão no Painel): um PDF que compara a **primeira semana** com a **última** do piloto. Inclui o "antes" que o cliente contou no diagnóstico, se
   preenchido. É o que se mostra na reunião do dia 30 e o que vira estudo de caso.

## Indicadores e como cada um é calculado

| Indicador | Definição | Por que importa |
|---|---|---|
| Tempo até a primeira resposta | **Pedido** = mensagem do cliente que abre um turno (a primeira depois de uma nossa, ou a primeira da conversa). **Resposta** = a primeira mensagem da equipe ou do agente depois dela (não conta mensagem automática do celular nem aviso do sistema). Mostra a mediana e o % em até 5 min, separado por agente e equipe, dentro e fora do horário. | Resultado 1 do piloto |
| Pedidos sem resposta | Pedido sem resposta há mais de 1 hora, com lista para abrir a conversa. | Cliente esquecido |
| Leads novos e acompanhados | Contatos novos no período, e quantos ganharam oportunidade (o agente registra sozinho) e tiveram resposta. | Resultado 2 |
| Oportunidades sem retorno | Oportunidade aberta sem mensagem nossa há mais de 3 dias, com lista. | Resultado 2 |
| Avanço no funil | Oportunidades que mudaram de etapa, ganhas e perdidas no período, valor estimado e funil por etapa (histórico do funil). | Resultado 3 |
| Agente | Conversas atendidas pelo agente, % resolvidas sem passar para a equipe, motivos mais comuns de chamar a equipe. | Valor da IA |
| Horas economizadas | Respostas do agente × 2 min (ajustável), **rotulado como estimativa**. | Argumento de venda |
| Por vendedor | Conversas atendidas, tempo de resposta e oportunidades por pessoa. | Visibilidade da gestão |
| Pedidos (se o módulo estiver ligado) | Orçamentos enviados (pela equipe e pelo agente), pedidos confirmados, valor. | ERP dos fundadores |

**Sobre o "antes":** a Livih só registra a partir da conexão do número, então não há dado de antes do piloto. O
relatório compara a semana 1 com a última. Há um campo opcional "como era antes", com o tempo de resposta estimado
pelo cliente no diagnóstico, que aparece ao lado e marcado como informado pelo cliente.

## Por dentro

- **Funções no banco**, que fazem as contas onde estão os dados (só a soma volta para a tela):
  - `painel_resumo(org, de, até, número?, vendedor?)`: os indicadores do período e do anterior;
  - `painel_pendencias(org)`: as listas de pedidos sem resposta e oportunidades sem retorno.
- **Quem vê:** a mesma regra do resto do app. Dono e admin veem tudo; o vendedor vê só os números e os clientes que
  já enxerga, e o painel dele mostra só a carteira dele.
- **Índices** para as consultas por período, conferidos com o volume da JoGrampo.
- **Testes:**
  - cada indicador num cenário montado com horários conhecidos (pedido, resposta, mensagem automática, fora do
    horário);
  - a regra de quem vê o quê.
- **Tela:**
  - cartões com o número e a variação contra o período anterior;
  - um gráfico por dia do tempo de resposta (agente e equipe);
  - funil por etapa;
  - as duas listas de pendências, clicáveis.
- **Relatório:** PDF com a logo da empresa, gerado pelo serviço `livih-pdf` (novo modelo ao lado do orçamento). Ele
  é mostrado na tela antes de baixar, como o PDF do orçamento.

## Fora desta etapa

Metas por vendedor, alertas automáticos ("cliente sem resposta há 1 hora"), envio do relatório por e-mail, LTV/CAC
e origem do lead (não temos origem confiável ainda).

Esforço estimado: 3 dias, contando testes e o PDF.
