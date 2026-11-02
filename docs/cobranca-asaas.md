# Cobrança da Livih pelo Asaas (planejado em 01/11)

Passo 6 de [planos-modulos.md](planos-modulos.md#passos-para-chegar-lá): cobrar das empresas clientes o plano, os
módulos, os pacotes e o excedente de atendimentos. Sem isso, a página de planos do site não vai ao ar
([site-planos.md](site-planos.md)).

## Decidido em 01/11

- **Vencimento no dia 10** para todas as empresas. A fatura do mês leva o plano e os módulos do mês e o excedente e os
  pacotes do mês anterior (uma cobrança só, sem segunda taxa).
- **Dados de cobrança** (nome ou razão social, CNPJ ou CPF, e-mail de cobrança, telefone e endereço) pedidos **no
  cadastro da empresa** pela plataforma e conferidos pelo dono na tela Plano e consumo. Numa tabela própria, separada
  das emissoras (quem paga a Livih nem sempre é quem aparece no orçamento, e há empresa sem emissora); a emissora
  padrão, quando existe, sugere os dados.
- **Atraso:** aviso ao dono aos **3 dias** e suspensão da empresa aos **10 dias**. Pagou, reativa sozinho.
- **Nota fiscal da mensalidade: fora por enquanto.** A F7 continua fora da Focus ([nfse.md](nfse.md)).
- **Chaves do Asaas** nos secrets do Supabase: `ASAAS_KEY_SANDBOX` (testes) e `ASAAS_KEY` (produção). Tudo começa no
  sandbox.
- O pedido de acesso pelo site continua curto: CNPJ e endereço entram quando a empresa é criada.
- **Multa de 2 % e juros de 1 % ao mês** no atraso, o padrão do mercado.

## Empresas atuais (decidido em 01/11)

- **F7 Tech não é cobrada:** é a dona da Livih. Fica no plano interno, sem fatura.
- **JoGrampo:** vencimento no dia 10, acesso a todas as funções (ERP e OS ligados), **preço combinado a confirmar pelo
  usuário na terça (03/11)**, depois de alinhar com o Eduardo.
- **Programa Fundadores em pausa.** Quem já entrou segue com o combinado; ninguém novo entra por enquanto.

## Como funciona

- **Cliente no Asaas:** um por empresa, criado e atualizado a partir dos dados de cobrança (o id fica guardado).
- **Fatura do mês, não assinatura do Asaas:** o valor muda todo mês (excedente, pacotes, módulos), então a Livih
  fecha a conta e cria uma cobrança avulsa no Asaas com vencimento no dia 10. O cliente paga por Pix, boleto ou
  cartão no link do Asaas, que aparece na tela Plano e consumo e vai por e-mail.
- **Fechamento:** rotina no dia 1 (pg_cron) monta a fatura de cada empresa com plano pago: plano + módulos do mês,
  excedente e pacotes do mês anterior, descontos combinados. Tabela `faturas` com os itens, o valor, o id e o link do
  Asaas e a situação.
- **Pagamento:** webhook do Asaas (Edge Function, com token próprio) marca a fatura como paga, vencida ou estornada.
- **Atraso:** rotina diária avisa aos 3 dias e suspende aos 10 (o mesmo efeito do Suspender da tela Empresas, com o
  motivo "inadimplência"); o pagamento reativa só o que foi suspenso por atraso.
- **Anual:** uma cobrança no início do ciclo (Pix, boleto ou cartão parcelado); nos meses seguintes, fatura só se
  houver excedente ou pacote.
- **Teste grátis de 30 dias:** a primeira fatura sai depois do teste.
- **Preço combinado** (Programa Fundadores, JoGrampo com ERP sem custo): desconto ou valor fixo por empresa, com o
  motivo, aplicado no fechamento.

## Entregas

1. **Dados de cobrança** (sem Asaas): tabela, validação de CNPJ/CPF e e-mail, campos na criação da empresa (tela
   Empresas), edição pela plataforma (janela Plano) e pelo dono (Plano e consumo), sugestão a partir da emissora e
   aviso de dados faltando na tela Empresas.
2. **Cliente e fatura no Asaas**: Edge Function com a chave do sandbox, cliente no Asaas, tabela `faturas`, fechamento
   no dia 1, preço combinado e as faturas com o link de pagamento na tela Plano e consumo.
3. **Pagamento e atraso**: webhook, aviso aos 3 dias, suspensão aos 10 e reativação.
4. **Anual e mudanças**: escolha mensal/anual, troca de plano no meio do ciclo e cancelamento do anual com devolução
   proporcional ([site-planos.md](site-planos.md#decidido-em-0111)).
5. **Produção**: trocar para `ASAAS_KEY`, publicar a página de planos e a seção de cobrança nos Termos.

## Em aberto

- Preço dos módulos (ERP e OS a R$ 99) ainda não está fechado ([planos-modulos.md](planos-modulos.md#decisões-em-aberto)).
- Preço combinado da JoGrampo (terça, 03/11).
- **CNPJ alfanumérico** (a Receita emite para inscrições novas desde 07/2026): `cnpj_valido`, a tela e as emissoras
  só aceitam números. Corrigir em migration à parte, antes de cobrar clientes novos.
- **Mês inteiro suspenso não é cobrado** (decidido na entrega 3, a confirmar): ao reativar, só a fatura do mês corrente
  que o fechamento pulou é criada; o mês do meio, em que a empresa ficou suspensa o tempo todo, fica sem fatura (e os
  atendimentos a mais e os pacotes do mês anterior a ele não são cobrados).

## Andamento

- 01/11: plano escrito. Entrega 1 feita (migration `20261101140000_dados_cobranca`): tabela `dados_cobranca`,
  `cobranca_dados` (com a sugestão da emissora) e `cobranca_salvar_dados` (dono ou plataforma), campos no cadastro da
  empresa (opcionais, mas completos se começar), bloco na janela Plano e em Plano e consumo, e o aviso "Faltam os
  dados de cobrança" na tela Empresas.
- 01/11: entrega 2 feita (migration `20261101150000_faturas`, Edge Function `asaas-cobranca`): preço dos módulos no
  catálogo (ERP e OS a R$ 99, juntos R$ 149), contrato de cobrança por empresa (ligado, mês da primeira fatura, valor
  combinado com motivo), faturas com os itens, fechamento no dia 1 às 06:00 e reenvio diário dos erros (cron), cliente
  e cobrança no Asaas sandbox (multa 2 %, juros 1 % ao mês, o cliente escolhe Pix, boleto ou cartão), bloco Cobrança
  na janela Plano (com "Gerar a fatura deste mês agora") e Faturas em Plano e consumo. Falta: webhook de pagamento
  (entrega 3); até lá a fatura fica "Em aberto" mesmo depois de paga.
- 01/11: entrega 2 publicada e testada no sandbox com a empresa Teste (dados fictícios): plano Start, cobrança ligada,
  "Gerar a fatura deste mês agora" → cliente e cobrança criados no Asaas, fatura "Em aberto" de R$ 99,90 com vencimento
  em 10/11 e link que abre; "Cancelar fatura" apagou a cobrança no Asaas. A Teste voltou ao plano interno com a cobrança
  desligada (para não gerar fatura de sandbox no dia 1).
- 02/11: entrega 3 feita (migration `20261102120000_cobranca_pagamento_atraso`, Edge Function `asaas-webhook`):
  webhook do Asaas (token por conta: `ASAAS_WEBHOOK_TOKEN` e `ASAAS_WEBHOOK_TOKEN_SANDBOX`) marca a fatura como paga,
  vencida, estornada ou cancelada, acompanha o vencimento mudado no painel do Asaas e acha a fatura pela referência
  quando o pagamento chega antes de a cobrança ser gravada; evento repetido é ignorado (`asaas_eventos`). Rotina diária
  às 09:15 (`cobranca_atrasos`): aviso aos 3 dias e suspensão aos 10 (`motivo_suspensao = 'inadimplencia'`), pelo
  número de avisos da Livih, ao dono e aos administradores (celular e WhatsApp) e à plataforma (celular). **Só para
  fatura de produção**: no sandbox ninguém paga de verdade. Pagamento, cancelamento ou vencimento novo reativam só o que
  foi suspenso por atraso, quando não sobra outra fatura com 10 dias, e criam a fatura do mês pulado; empresa suspensa
  pela plataforma não reativa sozinha. Dono e administradores de empresa suspensa por atraso veem as faturas e os dados
  de cobrança na tela de acesso suspenso; a tela Empresas mostra "Suspensa por atraso". Revisado pelo revisor-banco e
  pelo revisor-textos; 627/627 na bateria de testes.
- 02/11: entrega 3 publicada e testada no sandbox com a empresa Teste: fatura de R$ 49,90 gerada pela janela Plano e
  paga com o cartão de teste; o `PAYMENT_CONFIRMED` chegou, a fatura virou "Paga" no mesmo segundo e a plataforma
  recebeu a notificação. Aviso aos 3 dias e suspensão aos 10 só valem em produção (conferidos na bateria de testes).
