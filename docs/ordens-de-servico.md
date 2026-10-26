# Ordens de serviço (módulo adicional)

Proposta de 22/10/2026, para revisão. Pacote adicional ligado por empresa, como o ERP (`modulos`, código `os`).

Para quem recebe um equipamento do cliente, conserta e devolve: manutenção de motores e bombas, assistência técnica,
conserto de ferramentas e máquinas, oficinas, calibração. O processo é sempre o mesmo (recebe, avalia, orça, o
cliente aprova, executa, finaliza, entrega, fatura, recebe); muda o nome das etapas e alguns campos. Por isso tudo o
que é de um cliente vira configuração.

**Piloto:** empresa de manutenção elétrica e de motores, que hoje controla tudo na planilha
`MOTORES ATUALIZADO 2026.xlsx` (NF, OS, cliente, item, modelo, nº de série, recebido, desmontagem/orçamento,
preparação, finalizado, entrega, boleto, valor, observação). Segunda validação: JoGrampo (~2.000 peças de
manutenção, conserto de grampeadores).

## Situação (22/10)

Construída a primeira versão: banco, telas, painel com previsão de caixa e importação. Testes: bloco "os" em
`scripts/teste_fase1.sql` (28 testes; 357/357 no total). A planilha do piloto foi importada num teste com rollback
(57 itens; os 24 sem data de recebimento ficam de fora, a maioria ferramentas acionadas).

Mudanças em relação ao plano:
- **Tabela de serviços própria** (`os_servicos`), em vez de reaproveitar Produtos: Produtos depende do ERP ligado
  (políticas, busca do agente, estoque) e misturaria serviço com o catálogo que o agente vende.
- **A equipe toda vê os valores** na v1. Faturar, registrar pagamento, apagar e o painel continuam só com dono e
  admin. Esconder valor do técnico fica para quando o piloto pedir (ver "Em aberto").
- **Desfecho sem "concluído"**: o caminho normal termina na etapa de marco Entregue; desfecho é só nao_aprovado,
  sem_conserto ou cancelado.
- **PDF da OS** (22/10): botão PDF na ficha, com prévia, download e envio pelo WhatsApp, no layout do orçamento do
  pedido (cabeçalho e rodapé compartilhados, `src/components/DocumentoOs.tsx`). Gerado no navegador, com a empresa
  emissora padrão. Sai como "Orçamento" enquanto todos os itens estão até a etapa de aprovação; depois, "Ordem de
  serviço". Vão os itens selecionados ou, sem seleção, os que não foram encerrados.
- **Fase 2 (agente), 25/10:** feita a consulta (`agente_consultar_os`, ferramenta `consultar_os`, migration
  `20261025120000_agente_os.sql`): o agente acha as OS do cliente do contato (e as do próprio contato) e responde
  etapa, desde quando, previsão (estimativa), pronto/entregue e o valor do orçamento. A aprovação por escrito vira nota
  + chamar a equipe (instrução do agente). **Ainda não feito:** o aviso de pronto (precisa do texto da mensagem e, na
  API oficial, de um modelo aprovado pela Meta).

O que o dono do piloto pediu, nas palavras dele:
- ver quantos itens estão em cada etapa (recebido, desmontagem, preparação, finalizado, faturado);
- saber quando cada item volta "em serviço e em dinheiro" nos próximos 15, 20, 30 e 60 dias;
- preço padrão por modelo (R$ 150, R$ 200), que a equipe atualiza com o tempo;
- o boleto vence 60 ou 70 dias depois de lançado.

## O que a planilha do piloto ensina

- **Uma NF do cliente traz várias OS, e uma OS traz vários itens** (a OS 370 tem 6 ferramentas). Cada item anda
  sozinho nas etapas.
- **As datas das etapas quase não são preenchidas**: a data de término vai como texto na coluna ENTREGA
  ("FINALIZADO 04/02/2026"), com erros (`07/04/206`, `29/0/2026`). Mover de etapa tem que ser um clique, com a data
  de hoje já preenchida e editável (a equipe registra depois do fato).
- **Desfechos que não são "pronto"**: "não foi aprovado orçamento", "não deu conserto", garantia, retorno em
  garantia, "aguardando compra de vedação".
- **A coluna BOLETO mistura data e "GARANTIA"**: faturar e cobrar são coisas separadas.
- O Excel transformou números de série em data. Na Livih, a identificação é sempre texto.

## Para o usuário

### Configuração (dono e admin, em Configurações → Ordens de serviço)

1. **Etapas**, editáveis como o funil: nome, ordem, cor e um **prazo padrão em dias** (usado na previsão até haver
   histórico). Cada etapa pode ter um **marco**, que diz ao sistema o que ela significa: `recebido`, `orcamento`,
   `aprovacao`, `finalizado`, `entregue`. O nome é livre ("Desmontagem / orçamento", "Na bancada"); o marco é o que o
   painel, a previsão e o agente leem.
   Padrão ao ligar o módulo: Recebido → Avaliação e orçamento → Aguardando aprovação → Em reparo → Finalizado →
   Entregue.
2. **Tipos de item** (Motor, Bomba, Ferramenta, Celular, Veículo...): nome, rótulo da identificação ("Nº de série",
   "IMEI", "Placa"), campos extras (texto, número, data ou lista; obrigatório ou não) e o serviço padrão.
3. **Tabela de serviços** (`os_servicos`): nome, código e preço padrão (ex.: "Reparo spindle SJ ZT – R$ 150").
   Escolher o serviço no item preenche o valor, que pode ser trocado caso a caso.
4. **Prazo de pagamento**: um padrão da empresa (ex.: 60 dias) e, se quiser, um prazo por cliente.

### Dia a dia

1. **Receber** (botão "Nova OS"): cliente, NF do cliente, número da OS do cliente (opcional), data de entrada e os
   itens. Cada item tem tipo, modelo, identificação, campos do tipo e quantidade. Com quantidade 6, viram 6 itens
   iguais para preencher só a identificação. O valor vem da tabela de serviços e pode ser trocado.
2. **Quadro**: colunas por etapa com os itens (não as OS). Arrastar ou "Avançar" pede só a data, com hoje já
   preenchido. Cada cartão mostra cliente, modelo, identificação, há quantos dias está na etapa e um alerta quando
   passa do tempo normal dela.
3. **Lista**: tabela com a cara da planilha, com filtros (etapa, tipo, cliente, desfecho, período, atrasados) e
   **exportação para Excel**. Ela existe para quem vem da planilha e para quem quiser abrir no Power BI.
4. **Ficha da OS**: os itens, com a linha do tempo de cada um (etapa, data, quem moveu), observações e anexos (foto
   e laudo, no bucket que já existe). As ações por item:
   - **Desfecho**: concluído, orçamento não aprovado, sem conserto ou cancelado. Item com desfecho sai do quadro.
   - **Cobrança**: cobrado, garantia ou cortesia. Garantia e cortesia não entram no faturamento.
   - **Faturar**: data do faturamento (o boleto). O vencimento é calculado pelo prazo do cliente e pode ser editado.
     Dá para faturar vários itens de uma vez (um boleto para a OS inteira, ou para a NF).
   - **Recebido**: data do pagamento.
5. **Orçamento em PDF** da OS (serviço `livih-pdf`, novo modelo ao lado do orçamento do pedido), com os itens, os
   valores e as observações.

### Painel da oficina (dono e admin; fica na tela do módulo, não no Painel de atendimento)

| Indicador | Definição |
|---|---|
| Itens por etapa | Quantidade e valor dos itens abertos em cada etapa, hoje |
| Parados | Itens há mais tempo na etapa do que o normal dela (média × 1,5 ou prazo padrão), com lista clicável |
| Entradas e saídas | Itens recebidos e finalizados por semana no período |
| Tempo por etapa | Média e mediana de dias em cada etapa, por tipo de item, e do recebimento ao finalizado |
| Aprovação | % de orçamentos aprovados e motivos de não aprovação no período |
| Faturamento | Faturado no período, a receber (vencido e a vencer), recebido |
| **Previsão de caixa** | Próximos 15, 30, 60 e 90 dias, separando **confirmado** (já faturado, pelo vencimento) e **previsto** (em andamento, pela previsão abaixo) |

**Como a previsão é feita** (sempre rotulada como estimativa):
1. Para cada item aberto: a data em que entrou na etapa atual + o tempo normal das etapas que faltam até o marco
   `finalizado`. O tempo normal é a mediana do histórico da empresa para aquele tipo de item nos últimos 180 dias,
   com pelo menos 5 itens; com menos, vale o prazo padrão da etapa.
2. Faturamento previsto = finalizado previsto + mediana de dias entre finalizar e faturar (ou 0, sem histórico).
3. Recebimento previsto = faturamento previsto + prazo de pagamento do cliente.
4. Itens antes do marco `aprovacao` aparecem à parte ("em orçamento"), fora do caixa previsto, porque ainda podem
   não ser aprovados.

Com a planilha atual quase sem datas de etapa, a previsão começa pelos prazos padrão que a empresa informa e
melhora sozinha depois de 1 a 2 meses de uso.

## Técnico

- **Migration `ordens_servico.sql`:**
  - linha no catálogo: `('os', 'Ordens de serviço', 'Equipamentos recebidos para conserto, etapas, faturamento e previsão de caixa.', false, true, 3)`;
  - tabelas, todas com `org_id` e políticas com `public.modulo_ativo(org_id, 'os')`:

| Tabela | Campos principais | Observações |
|---|---|---|
| `os_config` | org_id (pk), prazo_pagamento_dias, alerta_fator (1,5) | criada ao ligar o módulo, com as etapas padrão |
| `os_etapas` | org_id, nome, ordem, cor, marco, prazo_padrao_dias, ativo | marco único por empresa quando preenchido; etapa com itens não é apagada, só desativada |
| `os_tipos_item` | org_id, nome, rotulo_identificacao, campos jsonb, produto_padrao_id, ativo | `campos` = lista de {chave, rotulo, tipo, opcoes, obrigatorio} |
| `os_prazos_cliente` | org_id, contato_id, prazo_pagamento_dias | só quando foge do padrão |
| `ordens_servico` | org_id, numero (sequencial por empresa), contato_id, nf_cliente, numero_cliente, recebida_em, responsavel_id, observacao, criado_por | carteira não se aplica (a oficina inteira vê) |
| `os_itens` | org_id, os_id, tipo_id, modelo, identificacao, campos jsonb, produto_id, valor, etapa_id, etapa_desde, desfecho, cobranca, faturado_em, vencimento_em, pago_em, observacao | desfecho ∈ concluido, nao_aprovado, sem_conserto, cancelado (nulo = aberto); cobranca ∈ cobrado, garantia, cortesia |
| `os_item_historico` | org_id, item_id, etapa_de, etapa_para, data (informada), autor_id, criado_em | só acréscimo; `data` é a data do fato, `criado_em` a do registro |

  - funções:
    - `os_mover_item(p_item, p_etapa, p_data)` e `os_mover_itens(p_itens[], p_etapa, p_data)`: a etapa só muda por
      aqui, que grava o histórico (mesmo padrão de `pedido_mudar_status`, com trigger que protege a coluna);
    - `os_faturar(p_itens[], p_data, p_vencimento?)` e `os_registrar_pagamento(p_itens[], p_data)`: só dono e admin;
    - `os_painel(p_org, p_de, p_ate)` e `os_previsao(p_org)`: as contas ficam no banco e a tela recebe só os números,
      como `painel_resumo`;
    - `os_criar_padrao(p_org)`: etapas e configuração padrão, chamada quando a plataforma liga o módulo.
- **Quem faz o quê:** todos os membros veem (com os valores), criam OS e movem e encerram itens. Faturar,
  registrar pagamento, apagar, configurar, importar e o painel só para dono e admin.
- **Arquivos:** migration `20261022130000_ordens_servico.sql`; `src/services/os.ts` e `src/services/planilhaOs.ts`
  (leitura do CSV, sem Supabase); `src/pages/OrdensServico.tsx` (quadro, lista com exportação, painel) e
  `src/pages/OrdemServicoDetalhe.tsx`; `src/components/ModaisOs.tsx`, `PainelOficina.tsx`, `ModalImportarOs.tsx`
  e `SecaoOrdensServico.tsx` (Configurações → Ordens de serviço, só com o módulo ligado).
- **Previsão de caixa:** "confirmado" é o faturado que vence de hoje até o prazo; o vencido fica à parte (cartão A
  receber). Itens em garantia ou cortesia não entram em valor nenhum.
- **Telas:**
  - menu "Ordens de serviço" quando `modulos.has('os')`;
  - `src/pages/OrdensServico.tsx` (quadro, lista, painel em abas) e `src/pages/OrdemServicoDetalhe.tsx`;
  - `src/components/ModalNovaOS.tsx` e `src/components/SecaoOrdensServico.tsx` (configuração);
  - `src/services/os.ts`.
- **Importação:** um modelo de planilha do módulo (uma linha por item; datas das etapas em colunas) na prévia de
  importação que já existe. Para o piloto, a planilha atual é convertida para o modelo por nós: datas tiradas do
  texto da coluna ENTREGA, "GARANTIA" vira cobrança, número de série como texto. O histórico importado entra com a
  data da planilha e o autor "importação".
- **PDF:** modelo `orcamento-os` no `pdf-servico`, com a mesma emissora (logo e dados) do orçamento do pedido.
- **Testes:** bloco "os" em `scripts/teste_fase1.sql`:
  - módulo desligado: nada é visível;
  - mover de etapa grava o histórico e a coluna não muda por fora;
  - atendente não fatura nem vê valores;
  - previsão num cenário com datas conhecidas (com e sem histórico suficiente).

## Fase 2: agente no WhatsApp

- **Ferramenta `agente_consultar_os(conversa, termo?)`**: devolve os itens abertos do contato da conversa, com etapa
  e previsão de término. O agente responde "seu motor ficou pronto?" sem chamar a equipe. Mesma regra das outras
  RPCs do agente: a organização vem da conversa.
- **Aviso de pronto** (opcional por empresa): quando o item chega ao marco `finalizado`, a mensagem configurada sai
  pela `fila_envio`. Fora da janela de 24 h, só por modelo da Meta.
- **Orçamento para aprovação**: a equipe envia o PDF pela conversa. Quando o cliente aprova por escrito, o agente
  deixa uma nota e chama a equipe, que move os itens com um clique. O agente não move etapa sozinho na primeira
  versão.

## Fora desta etapa

- Peças usadas no conserto com baixa de estoque (depende do ERP ligado; entra quando um cliente pedir).
- Horas por técnico e custo do serviço.
- Emissão de nota de serviço (NFS-e) e boleto pelo Asaas; entram com a cobrança do ERP. Até lá, faturar é só
  registrar a data.
- Conexão direta do Power BI no banco (exige usuário de leitura com regra por empresa). A exportação para Excel
  atende o piloto.
- Previsão ponderada pela taxa de aprovação.

## Em aberto (perguntar ao piloto)

- Orçamento e aprovação são etapas separadas? Quanto tempo o cliente costuma levar para aprovar?
- A coluna BOLETO é a data de emissão ou a de vencimento? O prazo é 60 ou 70 dias, e muda por cliente?
- As ferramentas acionadas passam pelas mesmas etapas dos motores?
- Os técnicos podem ver os valores, ou só o dono e a pessoa do escritório?
- O número da OS é o deles ou o do cliente ("O/S CACTOS")? Precisam dos dois?
- Prazos padrão de cada etapa, por tipo de item, para a previsão começar.
- Da importação (22/10): os boletos antigos foram pagos? Sem a data de pagamento, eles entram como vencidos
  (R$ 6.000 com prazo de 60 dias). Quem é o cliente (a coluna CLIENTE está vazia; "O/S CACTOS" é o número de quem)?
  Os dois motores em garantia sem data de término (OS 299 e o SJ-VL5.5 remontado) já foram entregues? As ferramentas
  acionadas e o motor sem data de recebimento: quando chegaram?

## Ordem e esforço

0. **Validação sem código** (2–3 h): empresa do piloto na Livih com o funil configurado nas etapas acima, um card
   por item, enquanto o módulo é feito.
1. Banco, funções e testes: ~1 dia.
2. Telas (configuração, nova OS, quadro, lista, ficha, PDF): 2–3 dias.
3. Painel e previsão de caixa: 1–1,5 dia.
4. Modelo de importação e conversão da planilha do piloto: ~0,5 dia.

**Construção: 4,5 a 6 dias. Fase 2 (agente): mais 1 a 2 dias.** Ajustes com o piloto e treinamento ficam fora dessa
conta; em calendário, 3 a 4 semanas.
