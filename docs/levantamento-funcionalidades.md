# Levantamento: o que falta na Livih (05/11)

Revisão do sistema como está hoje (telas, banco, agente) para listar o que falta no CRM, no ERP e no resto. Não
repete o que já está planejado em detalhe em outro documento: nesses casos, só aponta para o plano.

Critério da prioridade: o público da Livih (distribuidores e revendas B2B com vários vendedores no WhatsApp, como a
JoGrampo) e a promessa do piloto (responder mais rápido, acompanhar os leads e ver as negociações).

- **Alta:** pesa no dia a dia de todo cliente ou na promessa do piloto, e o esforço é pequeno ou médio.
- **Média:** pedido comum em CRM/ERP, mas dá para vender sem.
- **Sob demanda:** depende do segmento; fazer quando um cliente pedir.

## O que já existe (resumo)

- **Atendimento:** conversas com WhatsApp (WAHA e API oficial), atribuição a um atendente, notas internas, mídia
  guardada, transcrição de áudio, leitura de imagem e PDF, notificação no celular, campanhas com modelos da Meta.
- **CRM:** contatos com etiquetas e carteira por vendedor, clientes (CNPJ/CPF, vários contatos, contato de mais de uma
  empresa), funil em kanban editável (um por empresa) com valor, responsável e motivo de perda, histórico de etapas,
  agenda com lembrete, painel com tempo de resposta, pendências ("sem resposta" e "sem retorno") e relatório do piloto.
- **Agente:** responde, registra oportunidade, move etapa, busca produto, monta e envia orçamento, envia documento,
  identifica e cadastra o cliente, consulta OS, chama a equipe; saúde do agente, simulador e assistente orientador.
- **ERP:** produtos (importação com IA, fotos), pedidos com status, estoque por movimento, entrada por nota do
  fornecedor (com custo e código do fornecedor), NF-e e NFS-e pela Focus, ordens de serviço com etapas e previsão,
  financeiro (a receber, a pagar, contas, baixas, transferências, calendário) ligado a pedido, OS e nota de entrada.

## CRM e atendimento

| # | O que falta | Por quê | Prioridade | Esforço |
|---|---|---|---|---|
| 1 | **Tarefas e próximo passo** na oportunidade e no contato ("ligar quinta", "mandar proposta"), com data, responsável e lembrete; oportunidade aberta sem próximo passo aparece como alerta | Hoje o acompanhamento é só a lista "sem retorno" no Painel, que ninguém é avisado de olhar. É o centro da promessa "acompanhar os leads" | Alta | Médio |
| 2 | **Respostas rápidas** na conversa (mensagens prontas com atalho, por empresa e por pessoa). **Feito em 06/11**: "/" ou o raio na caixa da conversa, {nome} do cliente, cadastro em Configurações → Respostas rápidas | Uso diário de todo atendente | Alta | Pequeno |
| 3 | **Distribuição automática** de conversas novas (rodízio entre vendedores, por carteira, por horário) | Público-alvo tem vários vendedores; hoje a conversa fica sem dono até alguém pegar | Alta | Médio |
| 4 | **Importar e exportar contatos** (CSV/Excel), com etiquetas e responsável | Implantação: o cliente chega com a lista dele. Hoje só clientes e produtos importam; nada exporta | Alta | Pequeno |
| 5 | **Retomada automática do lead parado**: oportunidade sem resposta há X dias → o agente (dentro das 24 h) ou um modelo aprovado retoma, uma ou duas vezes | Converte o que hoje morre no "sem retorno"; diferencial claro sobre CRM comum | Alta | Médio |
| 6 | **Previsão de fechamento e itens na oportunidade** (data prevista; produtos ou o orçamento ligado), com o valor ponderado do funil | Sem data, o funil não vira previsão de vendas | Média | Médio |
| 7 | **Motivo de perda em lista** (configurável) e relatório de conversão por etapa, origem, vendedor e motivo | O texto livre de hoje não soma em relatório | Média | Pequeno |
| 8 | **Metas por vendedor** (valor ou quantidade no mês) e ranking no Painel | Gestor de equipe de vendas pede logo | Média | Pequeno |
| 9 | **Vários funis** (ex.: vendas, pós-venda, revenda nova), cada um com as suas etapas | Hoje há um funil por empresa | Média | Médio |
| 10 | **Papel "gerente"**: vê a equipe toda e os relatórios sem ser admin (não mexe em configuração e cobrança) | Hoje só há dono, admin e atendente | Média | Pequeno |
| 11 | **Mesclar contatos duplicados** (mesmo cliente em dois números, contato criado à mão e pelo WhatsApp) | Base suja com o tempo; afeta histórico e campanha | Média | Médio |
| 12 | **Campos personalizados** no contato e na oportunidade (definidos pela empresa) | `contatos.dados` existe, mas a tela não deixa a empresa definir campos | Média | Médio |
| 13 | **Mensagem agendada** na conversa ("mandar amanhã às 9 h") | Pedido comum de vendedor | Média | Pequeno |
| 14 | **Avaliação do atendimento** (nota de 1 a 5 ao encerrar) | Mede a equipe e o agente; entra no relatório do piloto | Sob demanda | Pequeno |
| 15 | **Captura de leads de fora do WhatsApp**: formulário do site e Meta Lead Ads viram contato + oportunidade; depois Instagram Direct como canal | Hoje todo lead nasce de mensagem no WhatsApp | Sob demanda | Médio a grande |

Já planejado em outros documentos: o agente marcar horário sozinho, lembrete com Confirmar/Remarcar, tipos de
compromisso e Google Agenda ([roadmap.md](roadmap.md), seção Agenda); os próximos passos das campanhas
([campanhas.md](campanhas.md), "Depois").

## ERP

| # | O que falta | Por quê | Prioridade | Esforço |
|---|---|---|---|---|
| 1 | **Venda de balcão** (tela rápida com NF-e e impressão) | Já decidido em 27/10 e não construído ([balcao.md](balcao.md)) | Alta | Médio |
| 2 | **Financeiro, entregas 3 e 4**: fluxo de caixa realizado e previsto, vencidos, totais por categoria; Pix copia e cola e cobrança pelo WhatsApp com lembrete | Planejado ([financeiro.md](financeiro.md)); a cobrança pelo WhatsApp é o diferencial contra o Bling | Alta | 3 a 4 dias |
| 3 | **Aviso de status do pedido ao cliente** no WhatsApp (confirmado, separando, enviado, entregue), opcional por empresa | Estava no MVP do ERP ([roadmap.md](roadmap.md)) e não foi feito | Alta | Pequeno |
| 4 | **Alerta de estoque mínimo** (notificação para quem compra e resumo diário) | Hoje é só um filtro na tela Produtos | Alta | Pequeno |
| 5 | **Tabela de preço e desconto por cliente** (ou por grupo: revenda, consumidor final), que o agente e o pedido usam | Distribuidor B2B quase sempre tem preço por cliente | Alta | Médio |
| 6 | **Relatórios de venda**: por produto (curva ABC), cliente, vendedor e período, com **margem** (o custo já vem da nota de entrada) | Os dados existem; falta a tela. Gestor pergunta "o que vende e quanto sobra" | Alta | Pequeno a médio |
| 7 | **Comissão de vendedor** (percentual por vendedor ou produto, sobre o pedido confirmado ou pago) | Equipe de vendas é o público-alvo | Média | Médio |
| 8 | **Fornecedores e compras**: cadastro de fornecedor, pedido de compra, sugestão de compra pelo estoque mínimo e pelo giro, e a nota de entrada fechando o pedido | Hoje o fornecedor é só o CNPJ da nota | Média | Médio |
| 9 | **Estoque disponível e reservado** (orçamento aprovado reserva) e **estoque por CNPJ/depósito** | A JoGrampo tem 2 CNPJs (pergunta em aberto no roadmap) | Média | Médio |
| 10 | **Devolução e troca** do pedido (volta ao estoque, estorno no financeiro, nota de devolução) | Hoje só existe cancelar | Média | Médio |
| 11 | **Frete e entrega**: transportadora, código de rastreio enviado ao cliente | Pedido "enviado" sem rastreio gera pergunta no WhatsApp | Média | Pequeno |
| 12 | **Fiscal além da NF-e básica**: carta de correção, NFC-e, ST e DIFAL | Listados como "fora desta etapa" em [nfe.md](nfe.md) | Sob demanda | Médio a grande |
| 13 | **Produto com variação** (cor, tamanho), **kit** e **lote/validade** | Depende do segmento | Sob demanda | Médio |
| 14 | **OS: peças usadas com baixa de estoque** e o agente da fase 2 | Planejado em [ordens-de-servico.md](ordens-de-servico.md) | Sob demanda | Médio |
| 15 | **Conciliação por extrato OFX** e **DRE** para o contador | Planejado em [financeiro.md](financeiro.md) (entrega 5 e "Em aberto") | Média | 2 dias + |

## Transversal

| # | O que falta | Por quê | Prioridade |
|---|---|---|---|
| 1 | **Exportar para Excel** as listas (contatos, clientes, pedidos, financeiro, oportunidades) | Pedido de todo cliente e saída para o contador | Alta |
| 2 | **Integração com o Bling** (ou outro ERP que o cliente já usa) | Decisão em aberto ([pendencias.md](pendencias.md)); define se a Livih entra em quem já tem ERP | Decidir |
| 3 | **API e webhooks** para o cliente ligar outros sistemas (site, e-commerce, BI) | Pedido comum de empresa maior | Sob demanda |
| 4 | **Histórico de alterações visível** (quem mudou o quê): a tabela `auditoria` existe, a tela não | Confiança do dono na equipe | Média |
| 5 | **LGPD na tela**: exportar e apagar os dados de um contato a pedido dele | Exigência legal; hoje só por pedido à F7 | Média |

## Sugestão de ordem

Pensando no piloto da JoGrampo e nos próximos clientes que vêm pelo site:

1. **Ganhos rápidos (1 semana):** respostas rápidas, aviso de status do pedido, alerta de estoque mínimo,
   importar/exportar contatos e exportar listas para Excel, motivo de perda em lista.
2. **Acompanhamento de leads (1 semana):** tarefas e próximo passo com lembrete, retomada automática do lead parado e
   distribuição automática de conversas. É o que sustenta a promessa do piloto.
3. **Venda e margem (1 a 2 semanas):** tabela de preço por cliente, relatórios de venda com margem, venda de balcão.
4. **Financeiro entregas 3 e 4**, já planejadas.
5. Depois, pelo que os clientes pedirem: comissão, compras, metas, vários funis, devolução, fiscal avançado.

Antes do item 3, perguntar à JoGrampo: se têm preço diferente por cliente, se pagam comissão e como, e se o estoque
é um só para os dois CNPJs.
