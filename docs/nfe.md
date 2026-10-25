# Nota fiscal eletrônica (NF-e) pela Focus NFe (proposto em 25/10)

Roadmap, item 5 ("ERP: cobrança e nota fiscal"). O pedido confirmado vira NF-e emitida pelo Livih, com o CNPJ escolhido
entre as emissoras da empresa. A emissão é pela **Focus NFe**. O cadastro de clientes ([clientes.md](clientes.md)) já
deixou pronto o que a nota precisa do comprador: razão social, CNPJ/CPF, IE e endereço.

## Decisões de 25/10

| Pergunta | Decisão |
|---|---|
| Emissor | Focus NFe, integrada ao Livih |
| Conta na Focus | **Uma conta da Livih** (revenda): cada CNPJ do cliente é cadastrado pela API; o cliente não abre conta na Focus. A Livih paga a Focus e repassa no plano |
| Vários CNPJs | Na emissão, a pessoa escolhe o CNPJ (vem o do pedido). O Livih **sugere ao admin**, pelo faturamento, qual CNPJ usar; o admin define o **CNPJ do balcão** |
| Balcão | **Só NF-e** (sem NFC-e), inclusive para consumidor final |
| De onde sai a nota | De **qualquer pedido**: do balcão, do vendedor online, do montado pelo agente ou criado pelo admin. O balcão só muda o CNPJ que vem escolhido (o "CNPJ do balcão") |
| Quem emite | Dono, admin e quem tiver a permissão **"Emite nota fiscal"** (o admin liga para os vendedores, online ou de balcão, e para o faturamento). O vendedor emite a nota dos pedidos que ele vê (a carteira dele, ou todos com "Vê todos os clientes"). Cancelar: só dono e admin |
| Certificado | Obrigatório (A1, arquivo .pfx), enviado pela tela do Livih |
| Regime tributário e padrões fiscais | Painel de configuração por CNPJ, em **Configurações → Empresa** |
| NFS-e (serviço, para as OS) | Depois, numa etapa própria (cada prefeitura tem regras) |

## Como funciona

1. **Configuração (por CNPJ):** em Configurações → Empresa, cada emissora ganha a seção **Nota fiscal**. O dono ou o
   admin informa regime, certificado e os padrões fiscais. O Livih cadastra o CNPJ na Focus e mostra a situação
   ("pronta para emitir em teste", "em produção", "certificado vence em 12 dias").
2. **Emissão:** em qualquer pedido confirmado (balcão, vendedor online, agente ou admin), **Emitir NF-e**. Vem o CNPJ
   do pedido; dá para trocar. Antes de enviar, o Livih
   confere o que falta (cliente sem CNPJ/CPF ou endereço, produto sem NCM, CNPJ sem certificado) e diz onde arrumar.
3. **Retorno:** a Focus autoriza na SEFAZ em segundos a minutos. O Livih recebe o resultado (gatilho da Focus, com
   uma conferência periódica de reserva), guarda o PDF (DANFE) e o XML e mostra no pedido.
4. **Depois:** baixar o DANFE e o XML, **enviar o DANFE pelo WhatsApp** na conversa do cliente (como o orçamento),
   e **cancelar** em até 24 horas, com justificativa (dono e admin).

### Sugestão de CNPJ pelo faturamento

O Livih soma as notas autorizadas dos últimos 12 meses por CNPJ e compara com o **limite** de cada um:
- informado na configuração;
- ou o padrão do regime: Simples Nacional R$ 4,8 milhões por ano, MEI R$ 81 mil.

Na configuração, o admin vê, por exemplo, "CNPJ A: 82% do limite nos últimos 12 meses · CNPJ B: 35%" e a sugestão
"use o B no balcão". Ele marca o **CNPJ do balcão**, que passa a vir escolhido nas vendas do balcão (a tela de vendas
vem depois desta etapa). Os outros pedidos seguem com o CNPJ que já têm (o padrão da empresa, ou o escolhido no
orçamento). A sugestão aparece também na emissão de qualquer pedido, mas nunca troca o CNPJ sozinha: quem emite
escolhe, e o padrão do balcão é o admin que define.

## Dados (migration)

**Emissora: dados fiscais** (colunas novas em `emissoras`):

| Campo | Para quê |
|---|---|
| `regime_tributario` | Simples Nacional, Simples (excesso de sublimite), MEI ou Regime normal (Presumido/Real) |
| `nfe_ambiente` | `homologacao` (teste, sem valor fiscal) ou `producao` |
| `nfe_serie` | Série da NF-e (padrão 1) |
| `nfe_status` | `nao_configurada`, `pendente`, `pronta`, `erro`, com a mensagem da Focus |
| `certificado_validade` | Data de vencimento do certificado (aviso antes de vencer) |
| `limite_faturamento` | Opcional: o teto anual para a sugestão de CNPJ |
| `padrao_balcao` | O CNPJ do balcão (um por empresa) |
| Padrões fiscais | CFOP dentro e fora do estado, situação do ICMS (CSOSN no Simples, CST no regime normal), origem da mercadoria, PIS e COFINS |

O certificado e a senha vão direto para a Focus e não ficam no Livih. O token que a Focus devolve para cada CNPJ fica
no Vault do Supabase, fora das tabelas que o app lê.

**Produto:** além do NCM, que já existe, entram CEST (quando houver) e origem. CFOP e ICMS vêm dos padrões do CNPJ,
com a opção de exceção por produto mais adiante.

**Tabela `notas_fiscais`:**
- empresa, emissora (CNPJ), pedido e cliente;
- referência única na Focus;
- situação: `processando`, `autorizada`, `rejeitada`, `cancelada`;
- número, série, chave de acesso, valor, data;
- caminhos do DANFE e do XML no Storage;
- mensagens de erro da SEFAZ e histórico dos eventos.

Uma nota por pedido; a rejeitada pode ser corrigida e reenviada. A nota autorizada fica imutável, e o cancelamento
vira um evento.

**Permissão:** `membros_org.emite_nota_fiscal`, com o mesmo esquema do "Vê todos os clientes": **desligada por padrão**
(decisão de 25/10; a nota tem efeito fiscal). O admin liga, pessoa por pessoa.

**Tokens da conta da Livih na Focus:** segredos das Edge Functions no Supabase, `FOCUS_TOKEN_PRODUCAO` e
`FOCUS_TOKEN_HOMOLOGACAO`. Nunca no código, no git ou nas tabelas.

**Acesso:** a tabela `notas_fiscais` segue a visibilidade do pedido. A configuração fiscal fica só para dono e admin.

## Funções (Edge Functions)

- `nfe-config`: cadastra ou atualiza o CNPJ na Focus (API de empresas) com o certificado e os dados fiscais, e devolve
  a situação. Dono e admin.
- `nfe-emitir`: monta o JSON da NF-e a partir do pedido, do cliente, do CNPJ e dos produtos, envia à Focus e grava
  `processando`.
- `nfe-retorno`: recebe o gatilho da Focus (autorizada, rejeitada, cancelada), baixa o DANFE e o XML para o Storage e
  atualiza a nota.
- `nfe-cancelar`: cancela com justificativa (mínimo de 15 caracteres, exigência da SEFAZ). Dono e admin.
- Cron: confere as notas em `processando` há mais de 5 minutos, caso o gatilho não chegue.

## Telas

1. **Configurações → Empresa → (CNPJ) → Nota fiscal:**
   - regime;
   - envio do certificado (.pfx + senha);
   - ambiente: teste ou produção;
   - série;
   - padrões fiscais (com sugestões pelo regime);
   - limite de faturamento;
   - "CNPJ do balcão";
   - a situação na Focus.
   No topo da tela: o faturamento dos últimos 12 meses por CNPJ e a sugestão.
2. **Pedido:**
   - botão **Emitir NF-e** (pedido confirmado), com a escolha do CNPJ e a lista do que falta;
   - depois de emitida: número, situação, **Baixar DANFE**, **Baixar XML**, **Enviar pelo WhatsApp** e **Cancelar**.
3. **Pedidos:** coluna e filtro "Nota" (sem nota / emitida / cancelada).
4. **Configurações → Equipe:** a permissão **"Emite nota fiscal"**.
5. **Perfil do cliente:** as notas dele.

## Começo seguro

- Todo CNPJ começa em **homologação** (teste na SEFAZ, sem valor fiscal). O admin só passa para produção depois de
  emitir uma nota de teste certa.
- O primeiro alvo é o **Simples Nacional**, a maioria das PMEs. No regime normal, entra o ICMS próprio (CST 00, 20 e
  40); substituição tributária e DIFAL entram quando um cliente precisar.
- **Antes de construir, conferir na documentação e na conta da Focus:**
  - os campos exatos da API de empresas e da NF-e;
  - o formato do gatilho;
  - o custo por nota e por CNPJ.

## Entregas

1. **Conta e configuração:**
   - conta de revenda da Livih na Focus (sem código: com você);
   - migration;
   - `nfe-config`;
   - tela Nota fiscal por CNPJ.
   Teste: um CNPJ "pronto para emitir em teste".
   **Feita em 25/10** (`20261025130000_nfe_config.sql`, função `nfe-config`, Configurações → Empresa → Nota fiscal e a
   permissão na Equipe). Falta o teste com o certificado A1 de um CNPJ piloto.
2. **Emissão em homologação:**
   - `nfe-emitir`, `nfe-retorno` e o cron;
   - botão no pedido, DANFE e XML.
   Teste: notas de teste autorizadas na SEFAZ.
3. **Cancelar e enviar:** cancelamento, envio do DANFE pelo WhatsApp, coluna "Nota" em Pedidos e as notas no perfil
   do cliente.
4. **Faturamento por CNPJ:** sugestão, "CNPJ do balcão" e aviso de certificado vencendo.
5. **Produção:** passar o primeiro cliente (JoGrampo) para produção, acompanhando as primeiras notas reais.

Esforço estimado: 4 a 6 dias de construção, sem contar o tempo da conta na Focus e dos testes com a contabilidade do
cliente.

## Fora desta etapa

- NFS-e (serviço), para as OS.
- NFC-e (cupom do consumidor).
- Substituição tributária, DIFAL e outras regras especiais de ICMS.
- Carta de correção.
- Nota de devolução e de entrada.
- Boleto e cobrança (Asaas), que é a outra metade do item 5 do roadmap.
- Exceções fiscais por produto, além de NCM, CEST e origem.

## Precisa de você antes de começar

1. **Abrir a conta da Livih na Focus NFe**, no modelo de revenda/parceiro, que dá acesso à API de empresas, e me
   passar os tokens de homologação e de produção. Eles vão para os segredos do Supabase, não para o código.
2. **A JoGrampo (ou outro piloto):**
   - o certificado A1 (.pfx) com a senha, enviado pela tela quando ela estiver pronta;
   - o regime tributário;
   - o CFOP e a situação de ICMS que a contabilidade usa hoje, para virar o padrão do CNPJ.
