# Financeiro (proposto em 28/10)

Por quê: ao comparar os planos com o Bling e a Omie ([planos-modulos.md](planos-modulos.md)), o ponto fraco do ERP da
Livih é o mesmo nas duas: não há contas a receber, contas a pagar nem fluxo de caixa. É a primeira pergunta de quem
compara.

## Decisões de 28/10

| Tema | Decisão |
|---|---|
| Primeira versão | **Contas a receber, contas a pagar e caixa** (contas bancárias, saldo, fluxo realizado e previsto) |
| Nos planos | **Incluído no ERP e nas OS**, sem preço à parte, como no Bling e na Omie |
| OS | **Unificar:** faturar a OS gera a conta a receber; o pagamento fica num lugar só e o caixa junta pedidos e OS |
| Boleto e Pix | **Sem amarrar a um provedor.** Nem todo cliente vai usar o Asaas; pode querer o próprio banco (seção "Cobrança") |

## O que já existe

- **OS:** faturar com vencimento pelo prazo do cliente (`os_faturar`), registrar o pagamento
  (`os_registrar_pagamento`), painel com faturado, a receber e recebido, e previsão de caixa de 15 a 90 dias
  (`os_previsao`). Os campos ficam em cada item da OS (`faturado_em`, `vencimento_em`, `pago_em`). Só dono e admin.
- **Pedido:** só `condicoes_pagamento` em texto livre ([balcao.md](balcao.md#em-aberto) já apontava que falta um campo
  próprio).
- **NF-e:** a emissão já manda à SEFAZ a forma de pagamento e se é à vista ou a prazo, mas isso não fica guardado.
- **Entrada por nota:** lê o XML do fornecedor ([notaXml.ts](../src/services/notaXml.ts)), mas ainda não lê o grupo de
  cobrança (`cobr > dup`: número, vencimento e valor de cada parcela), que é a origem natural do "a pagar".
- **Permissões por membro:** já existem "Emite nota fiscal" e "Vê todos os clientes"; o financeiro segue o mesmo
  padrão.

## Como funciona

### Lançamentos

Tudo é um **lançamento**: uma parcela a receber ou a pagar, com vencimento e valor.

- **Origem:** pedido, OS, nota de entrada ou manual. Lançamento com origem fica ligado a ela (abrir o pedido a partir
  do lançamento e o contrário).
- **Quem:** o cliente (a receber) ou o fornecedor (a pagar), e o **CNPJ da empresa** (emissora), para quem tem mais de
  um, como a JoGrampo.
- **Situação:** em aberto, vencido (calculado pela data), pago, pago em parte ou cancelado.
- **Baixa:** cada pagamento recebido ou feito é uma baixa, com data, valor, conta e forma (Pix, boleto, dinheiro,
  cartão, transferência). Uma parcela aceita mais de uma baixa (pagamento em parte). Desfazer a baixa é possível e fica
  registrado.
- **Categoria:** plano de contas simples, editável pela empresa, com um padrão pronto (vendas, serviços, fornecedores,
  impostos, folha, aluguel, despesas gerais).
- **Repetir:** a pagar mensal (aluguel, internet) com "repetir por N meses".

### De onde vêm os lançamentos

| Origem | Quando | O que gera |
|---|---|---|
| **Pedido** | Ao confirmar | A receber, pelas parcelas da condição de pagamento. Cancelar o pedido cancela as parcelas em aberto |
| **OS** | Ao faturar | A receber, com o vencimento pelo prazo do cliente (a regra que já existe) |
| **Nota de entrada** | Ao lançar a nota | A pagar, pelas duplicatas do XML; sem duplicata, uma parcela à vista para conferir |
| **Manual** | A qualquer hora | A receber ou a pagar avulso |

**Condição de pagamento do pedido** passa a ser estruturada: forma (Pix, boleto, cartão, dinheiro...) e parcelas
(à vista, 30 dias, 30/60/90, ou parcelas editadas à mão). O texto livre continua como observação. A NF-e passa a usar
essa forma, sem perguntar de novo.

### Contas e caixa

- **Contas financeiras** da empresa: cada banco, o caixa da loja, a conta do Asaas, com saldo inicial.
- **Saldo** de cada conta = saldo inicial + baixas recebidas − baixas pagas − transferências.
- **Transferência entre contas** (ex.: depósito do caixa no banco).
- **Fluxo de caixa:**
  - **realizado:** entradas e saídas por dia, semana ou mês;
  - **previsto:** a receber e a pagar pelo vencimento, mais o previsto das OS em andamento, que `os_previsao` já
    calcula (sempre rotulado como estimativa);
  - **vencidos** à parte, a receber e a pagar.

### Quem vê

- **Dono e admin:** tudo.
- **Permissão nova por membro, "Financeiro":** vê e baixa lançamentos (para quem cuida do caixa ou da cobrança).
- **Vendedor sem a permissão:** no pedido e na OS, vê só se está pago, em aberto ou vencido, sem valores do caixa.
- Tudo pela RLS e pelas funções no banco, com `tem_papel` e a permissão nova; a tela não protege nada.

## Cobrança: sem depender de um provedor

O cliente pode usar o Asaas, o próprio banco ou nenhum dos dois. Por isso a cobrança entra em camadas, e cada
lançamento guarda **qual provedor** gerou a cobrança, para entrar provedor novo sem refazer nada:

1. **Sem integração (entra primeiro):**
   - **Pix copia e cola e QR Code com valor**, gerados pela própria Livih a partir da chave Pix da empresa (padrão
     do Banco Central, funciona com qualquer banco, sem contrato e sem custo);
   - **mensagem de cobrança pelo WhatsApp** com o valor, o vencimento e o Pix, enviada pela equipe ou no lembrete de
     vencimento (fora da janela de 24 h, na API oficial, precisa de modelo aprovado e é cobrado pela Meta);
   - a baixa é manual (ou pela conciliação, item 2).
2. **Conciliação por extrato (qualquer banco):** a empresa sobe o extrato em OFX, que todo banco exporta, e a Livih
   sugere a baixa de cada entrada que bate com um lançamento (valor e data). A empresa confirma.
3. **Integrações, conforme o cliente pedir:**
   - **Asaas:** boleto e Pix com baixa automática pelo aviso do Asaas. A empresa usa a própria conta e cola a chave
     na Livih (guardada no Vault); o dinheiro cai direto nela;
   - **Pix pela API do banco:** a API Pix do Banco Central é padrão entre os bancos (Inter, Sicoob, Itaú, BB...),
     então uma integração serve para vários, com o certificado de cada banco. Baixa automática;
   - **Boleto do próprio banco:** cada banco tem API própria; o caminho universal é o arquivo de remessa e retorno
     (CNAB). Só com cliente pedindo, porque cada banco exige convênio e homologação.

A Livih nunca guarda nem movimenta o dinheiro do cliente: gera a cobrança, mostra e dá baixa.

## Entregas

Em ordem. Cada uma com migration, testes no `teste_fase1.sql` e telas.

1. **Base** (2 a 3 dias): contas financeiras, categorias com o padrão, lançamentos, baixas, transferências, permissão
   "Financeiro". Telas: menu Financeiro com **A receber**, **A pagar** e **Contas** (saldo e extrato), lançamento
   manual, baixa e desfazer. Liga com os módulos `erp` e `os` (`modulo_ativo`).
2. **Ligações** (2 a 3 dias):
   - condição de pagamento estruturada no pedido, parcelas geradas ao confirmar e canceladas ao cancelar; a NF-e usa a
     forma do pedido;
   - OS: `os_faturar` passa a gerar o lançamento e `os_registrar_pagamento` vira baixa; **migrar** o que já foi
     faturado e pago (`faturado_em`, `vencimento_em`, `pago_em`) para lançamentos e baixas;
   - nota de entrada: ler `cobr > dup` no XML e gerar o a pagar do fornecedor.
3. **Fluxo de caixa e painel** (1 a 2 dias): realizado, previsto (com o previsto das OS), vencidos, totais por
   categoria; o painel das OS passa a ler os lançamentos.
4. **Cobrança sem integração** (1 a 2 dias): chave Pix da empresa, Pix copia e cola e QR Code por lançamento,
   mensagem de cobrança pelo WhatsApp e lembrete de vencimento.
5. **Conciliação por extrato OFX** (2 dias).
6. **Integrações** (Asaas, Pix pela API do banco, CNAB): uma por vez, quando um cliente pedir.
7. **Agente:** "quanto eu devo?", "me manda o Pix do boleto que vence sexta" (consulta os lançamentos do contato e
   envia o Pix), com a mesma regra de carteira do resto.

**Entrega 1 construída em 28/10:** migration `20261028120000_financeiro.sql` (tabelas `fin_*`, a visão
`fin_lancamentos_situacao`, funções `fin_*` e a permissão `membros_org.financeiro`), 30 testes no `teste_fase1.sql`,
serviço [financeiro.ts](../src/services/financeiro.ts), tela Financeiro (`/financeiro`, abas A receber, A pagar e
Contas, com extrato, transferência e categorias) e a caixa "Financeiro" em Configurações → Equipe. O menu mostra o
Financeiro para dono e admin e para o atendente com a permissão. Abrir a tela pela primeira vez cria as categorias
padrão e a conta Caixa.

**Entregas 1 a 4: 6 a 10 dias.** É o que fecha a comparação com o Bling Cobalto (contas a pagar e receber) com uma
vantagem: a cobrança sai pelo WhatsApp, onde o cliente já conversa.

## Em aberto

- **Categorias padrão:** a lista acima serve, ou a empresa prefere começar do plano de contas do contador?
- **Juros e multa por atraso:** calcular na baixa ou só registrar o valor pago a mais?
- **Lembrete de vencimento:** quantos dias antes, e se vai também depois de vencido.
- **Cartão de crédito:** registrar a taxa da maquininha e o prazo de recebimento (D+30), ou só o valor bruto na v1?
- **Migração das OS:** conferir com o piloto de motores os itens já faturados antes de migrar.
- **DRE e relatório para o contador:** fora da v1; avaliar depois das categorias em uso.
