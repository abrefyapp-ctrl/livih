# Pendências

Lista refeita em 17/11/2026, na ordem de prioridade. Tirar cada item daqui quando resolver. O plano do produto fica
em [roadmap.md](roadmap.md).

## 1. CEFEQ (semana de 17/11)

Detalhes em [equipes-origem-prospeccao.md](equipes-origem-prospeccao.md). Proposta de R$ 1.300/mês, 27 números e
4.000 atendimentos; 30 dias de teste (2 semanas medindo com o agente desligado e 2 com ele ligado).

- **Decisão até 18/11.** A CEFEQ escolhe entre a Livih e outro fornecedor (35 usuários, "300 mil créditos de IA",
  Instagram e Facebook). Ata da reunião de 17/11 enviada ao Diego.
- **Reunião com a Flow Analytics em 18/11** (9h ou 15h30; o Diego confirma). É a ferramenta de força de vendas da
  CEFEQ, que já lê os dados do Sollus.
- **Se aceitarem, implantação:**
  - planilha de pessoas (nome, e-mail, telefone, equipe, gestor) e "Convidar várias", com o Diego como admin;
  - números conectados em lotes, os 27 até a semana 2, olhando CPU e memória da VPS depois de cada lote;
  - configuração da distribuição com as respostas do Diego de 16/11 (sem cidades, equipe de cada número, "Vê
    todos os clientes" para todos). Em aberto: a janela do "mais atendeu", o caixa de Castro (42 3219-6990) e se
    o 0800 tem WhatsApp;
  - testar o alerta do agente no WhatsApp de quem atende (telefone de "Seus dados") na semana 3.
- **Integração com o Sollus** (reunião de 17/11). O Sollus não tem API:
  - o Milson libera visões só de leitura (produtos, preços, estoque, clientes) e um usuário só com INSERT para
    gravar o orçamento, e explica as tabelas e as regras;
  - o banco fica num servidor físico da CEFEQ, com acesso pela VPN da TechJump. Falta saber se a VPN está presa ao
    IP da central e planejar como o nosso servidor entra nela;
  - regra da primeira fase: o agente grava o orçamento com o preço de lista (à vista e a prazo) quando o cliente
    não pede vendedor; com vendedor, quem altera e envia é ele, no Sollus (mão única). Balcão continua no Sollus;
  - ideia para estudar: o vendedor escreve "enviar orçamento 2432" e a Livih busca no Sollus e manda ao cliente.
- **Só o gerente move os cards no funil:** pedido da CEFEQ. Hoje o vendedor move os dele e o gestor os da equipe.
  Ficou "vamos ver na implantação"; decidir antes de ligar o agente.

## 2. Antes da primeira cobrança real (meados de dezembro)

A primeira cobrança pelo Asaas será a da CEFEQ, ao fim dos 30 dias de teste. A JoGrampo fica fora do Asaas (acordo
de 12 x R$ 139,17 desde 16/11, acertado por permuta, sem fatura na Livih).

- **Asaas em produção:** aprovação da conta (documentos), cancelar as faturas do sandbox, ligar
  `ASAAS_AMBIENTE=producao` (com aprovação) e fazer uma cobrança pequena de teste antes da CEFEQ. Roteiro em
  [cobranca-asaas.md](cobranca-asaas.md). Ainda falta testar no sandbox o anual parcelado no cartão.
- **Plano CEFEQ** visível só para ela, no lugar do "interno", com o contrato de valor combinado
  (`contratos_cobranca.valor_fixo` = R$ 1.300, ERP incluído).
- **Proteção contra senha vazada:** o Supabase já está no Pro; ligar em Authentication → Sign In / Providers →
  Email.
- **Licença do WAHA:** confirmar a versão e a licença para ~32 sessões (5 hoje e 27 da CEFEQ).
- **OpenAI:** ligar a recarga automática, subir o alerta de orçamento e criar uma chave só para o agente (hoje o
  n8n e as Edge Functions usam chaves diferentes, mas nenhuma é exclusiva).

## 3. Venda e marketing

- **Número oficial (41) 9779-9158:**
  - a Meta recusou o nome "Livih" em 17/11. Pôr `livih.com.br` e `f7tech.com.br` no perfil do número e pedir
    "Livih by F7 Tech" (ou nova análise de "Livih");
  - o endereço do portfólio na Meta (Av. João Gualberto) é diferente do rodapé do f7tech.com.br (R. Visconde do
    Rio Branco); deixar igual;
  - colocar a Página F7 Tech no portfólio (precisa de controle total da Página), passar o anúncio para esse número
    e trocar `5541999148944` por `5541997799158` em `site/gerar_solucoes.py` e `site/public/`.
- **Imobiliária IDAL:** proposta em [imobiliaria.md](imobiliaria.md) esperando aprovação do usuário.
- **Programa Fundadores:** 10 primeiras empresas, prospecção em revendas e distribuidores B2B.
- **Termos de Uso e Privacidade:** revisão do advogado ou do contador (inclusive a seção 8, de preços) e aviso às
  empresas clientes (seção 11).

## 4. Produto, quando sobrar espaço

- **Instagram na Livih:** começou em 19/11, por decisão do usuário (sem esperar a CEFEQ). Plano e decisões em
  [instagram.md](instagram.md): primeiro o Instagram (Direct, Stories, anúncios), depois o Messenger.
- **Agenda:** o agente marca sozinho, lembrete com Confirmar e Remarcar, tipos de compromisso e distribuição.
- **Google Agenda:** dar entrada já na verificação do app no Google (leva semanas).
- **Biblioteca, parte 2:** catálogo de fornecedor compartilhado e importador da PACAR
  ([biblioteca-documentos.md](biblioteca-documentos.md)).
- **Financeiro, entrega 3:** fluxo de caixa realizado e previsto, vencidos e totais por categoria. Depois, a entrega
  4 (Pix copia e cola e cobrança pelo WhatsApp). Ver [financeiro.md](financeiro.md).
- **Ordens de serviço, fase 2:** o agente na OS; o aviso de "pronto" precisa do texto da mensagem e, na API
  oficial, de um modelo aprovado ([ordens-de-servico.md](ordens-de-servico.md)).
- **Selo de data cobre a mensagem ao rolar** (desde 10/10): o separador "Hoje" é `sticky top-0` em
  [PainelConversa.tsx](../src/components/PainelConversa.tsx) e fica por cima do balão. Ideia: pílula com fundo e
  espaço reservado, ou data flutuante só durante a rolagem, como no WhatsApp.
- **Religar o limite do importador com IA:** desligado desde 21/10. Trocar `LIMITE_DIA` de `null` para `5` em
  `supabase/functions/importar-catalogo/index.ts` e publicar a função (cada importação custa ~R$ 0,80 de IA).

## 5. Testes e conferências que ficaram para trás

- **Financeiro, entrega 2:** testar com um pedido de verdade da JoGrampo (forma, parcelas, confirmar e ver no
  Financeiro) e conferir a entrada por nota com o primeiro XML que traga duplicatas.
- **JoGrampo:** ligar "Identificar o cliente antes do orçamento" e testar CNPJ existente, CNPJ novo e CPF
  ([agente-identificar-cliente.md](agente-identificar-cliente.md)); combinar com o Eduardo a passagem para a API
  oficial e testar receber, responder, agente, arquivo e modelo.
- **Campanhas:** primeiro envio real com modelo de Marketing no número oficial, filtrado por uma etiqueta só dos
  números de teste ([campanhas.md](campanhas.md)).
- **Conferir se já foi feito:** publicação das funções com textos no feminino (commit 2863bec) e os modelos de
  e-mail `docs/emails/convite.html` e `docs/emails/redefinir-senha.html` no painel do Supabase.
- **n8n:** conferir se `n8n/gerar_workflow.py` gera exatamente os JSONs atuais.

## Decisões em aberto

- Regime tributário (Anexo III ou V do Simples).
- Integração com o Bling.
- Notas recebidas (NF-e, CT-e e NFS-e Nacional): em espera até saber com a Focus quanto custam
  ([notas-recebidas.md](notas-recebidas.md)).
- Plano da Focus (perguntar se cancelamento e carta de correção contam como documento) e se a configuração de nota da
  F7 sai da Livih ([nfse.md](nfse.md)).
- Quais outros estados, além do Paraná, exigem cadastrar a Focus como sistema emissor.

## Resolvido em novembro

- Supabase no plano Pro (backup diário de 7 dias).
- VPS no plano KVM 2, e limites do WAHA (1,5 GB) e do waha-postgres (512 MB) gravados em 16/11.
- Preço da JoGrampo: 12 x R$ 139,17 desde 16/11, fora da Livih.
- Planos, cobrança (entregas 1 a 4), CNPJ alfanumérico e preços no site: publicados de 01 a 03/11.
- Dados de teste da CEFEQ (ex-Cactos) apagados em 16/11.
