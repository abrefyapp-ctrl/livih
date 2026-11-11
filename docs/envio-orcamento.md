# Enviar orçamento sem conversa aberta, e por e-mail

Pedido de 03/11, da JoGrampo (áudio + print do Pedido #30). O vendedor recebe o pedido por ligação, WhatsApp
particular, telefone da empresa ou e-mail, monta o orçamento na Livih e não consegue mandar: se o cliente nunca falou
com a empresa pela Livih, o botão "Enviar pelo WhatsApp" pede para abrir uma conversa em Conversas → Nova conversa
antes. Eles estão cadastrando WhatsApp **e** e-mail de todos os clientes e querem escolher, na hora de enviar, WhatsApp,
e-mail ou os dois.

**Status:** parte 1 feita em 11/11 (o Eduardo pediu de novo). Partes 2 e 3: plano, falta decidir os pontos do fim.

## Como é hoje

- `PedidoDetalhe.pedirEnvio` e `OrdemServicoDetalhe.pedirEnvio` procuram a conversa do contato
  (`orcamento.conversaDoCliente`); sem conversa, mostram o aviso vermelho do print e param.
- `iniciar_conversa(canal, telefone, nome, texto)` (migration `20261013140000`) já cria contato e conversa, respeita a
  carteira e deixa a conversa "em atendimento" com quem iniciou. É o que o modal de Nova conversa usa.
- O PDF é gerado no navegador e sobe para o bucket `midias` (`enviarArquivo` → `enviar_arquivo`), que entra na fila de
  envio e no histórico da conversa.
- **E-mail:** a Livih não manda e-mail próprio. Só o Supabase Auth (convite e senha) manda, pelo servidor padrão dele.
  `contatos.email` e `clientes.email` existem; na JoGrampo hoje são 16 contatos e 3 clientes com e-mail.
- A JoGrampo tem um número ativo, `4133663942`, conectado pelo celular (WAHA), sem vendedor responsável. Não usa a API
  oficial.

## Parte 1: WhatsApp sem conversa aberta (pequena, só front)

**Feita em 11/11:** `numerosParaAbrirConversa` e `abrirConversaDoContato` em `services/orcamento.ts`, a escolha do
número em `components/NumeroDeSaida.tsx`, no pedido e na OS. Sem número que não seja da API oficial, explica e pede
para baixar o PDF.

O botão "Enviar pelo WhatsApp" passa a abrir a conversa sozinho quando ela não existe.

1. Sem conversa: a confirmação mostra **por qual número vai** (o do próprio vendedor; senão o primeiro que ele vê,
   mesma regra do modal de Nova conversa) e deixa trocar quando houver mais de um.
2. Ao confirmar: `iniciar_conversa(canal, contato.telefone, null, null)` e depois o envio do PDF de sempre. A conversa
   aparece em Conversas com o PDF, em atendimento com quem enviou (o agente não responde por cima).
3. Continua bloqueando, com a explicação:
   - contato sem telefone ("Cadastre o WhatsApp de Fulano para enviar");
   - número escolhido da **API oficial** sem conversa ou com a janela de 24 h fechada (a Meta só aceita modelo
     aprovado). Isso fica para a parte 3.
4. Mesma mudança na OS (`OrdemServicoDetalhe`), que tem o mesmo aviso.

Não precisa de migration: `iniciar_conversa` já faz tudo e confere carteira e permissão. Risco baixo; WAHA manda
para quem nunca conversou com o número como qualquer celular manda.

## Parte 2: envio por e-mail

### Como fica na tela

O botão vira **"Enviar orçamento"** e abre uma janela com:

- **WhatsApp** (marcado se o contato tem telefone): número de destino e por qual número da empresa sai.
- **E-mail** (marcado se há e-mail): para quem vai, já preenchido com o e-mail do contato e o do cliente (sem
  repetir), editável, com espaço para mais endereços (ex.: o comprador e o financeiro).
- Assunto e mensagem curtos já prontos ("Orçamento nº 30 – JoGrampo"), editáveis.
- Um botão **Enviar**. No fim, diz o que saiu e o que falhou, separado por canal.

O e-mail digitado que o contato ainda não tem pode ser salvo no contato com uma caixinha ("Salvar no cadastro de
Gisele").

### Como sai

- **Remetente** (decidido em 03/11):
  - **Empresa com domínio e e-mail próprios** sai pelo e-mail dela, ex. `JoGrampo <vendas@jogrampo.com.br>`. O
    domínio é cadastrado no Resend (ver "Domínio da empresa" abaixo); a Livih não guarda senha de e-mail.
  - **Empresa sem domínio, ou com o domínio ainda não confirmado:** sai pelo Resend com o endereço da Livih e o nome da
    empresa, ex. `JoGrampo <orcamentos@envio.livih.com.br>`, com **Responder para** o e-mail da empresa ou do
    vendedor.
- **Cópia para a empresa:** e-mail mandado por API não aparece em "Enviados" da caixa `vendas@`. Por isso vai uma
  cópia oculta (Cco) para o e-mail da empresa, que fica com o registro do que saiu. A resposta do cliente cai na caixa
  dela normalmente.
- **Corpo:** HTML simples com logo da empresa, a mensagem, o total e o PDF anexo (o mesmo do WhatsApp e do download).
- **Serviço:** um provedor de e-mail transacional por API, chamado de uma Edge Function nova `enviar-email`, com a
  chave nos secrets. Recomendação: **Resend** (API simples, 3.000 e-mails/mês grátis, depois US$ 20/mês por 50 mil).
  Alternativa: Brevo (300/dia grátis). Precisa registrar o subdomínio de envio (SPF, DKIM, DMARC) no DNS do
  livih.com.br, no Cloudflare. Sem isso o e-mail cai no spam.

### Domínio da empresa

Em Configurações → E-mail (dono e admin):

1. A pessoa informa o e-mail de envio (`vendas@jogrampo.com.br`) e o nome que aparece ("JoGrampo").
2. A Livih cadastra `jogrampo.com.br` no Resend pela API (`POST /domains`) e mostra os registros de DNS para copiar:
   DKIM (`resend._domainkey`) e o MX e o SPF do subdomínio `send.`. Ficam fora da raiz do domínio, então **não mexem
   no e-mail que a empresa já usa** (Google, Microsoft, Locaweb…). Quem cuida do site ou do e-mail da empresa coloca
   os registros onde o domínio está hospedado.
3. Botão "Verificar" (e uma checagem automática por algumas horas) consulta o Resend. Confirmado, os envios passam a
   sair pelo `vendas@`. Até lá, saem pelo endereço da Livih, e a tela diz isso.
4. Se o domínio deixar de verificar (alguém apagou o registro), a Livih volta para o endereço dela e avisa o dono.

O mesmo domínio não pode ser cadastrado por duas empresas da Livih. Nota: o Resend limita a quantidade de domínios por
plano (o grátis tem 1); com mais de uma empresa usando domínio próprio entra o plano pago. Conferir os limites ao
contratar.

### Técnico

- **Migration** `envios_documento`: tabela com empresa, pedido ou OS, contato, quem enviou, canal (`whatsapp` ou
  `email`), destinatários, situação (`enviado`, `falhou`, `entregue`, `devolvido`), id do provedor e data. RLS por
  empresa e carteira, como pedidos. Gravação só pela Edge Function (chave de serviço). Serve para:
  - mostrar no pedido "Enviado por e-mail para gisele@… em 03/11 08:50 por Vasco";
  - limite por empresa por dia (ex. 200) contra uso indevido e para não estourar a cota do provedor.
- **Migration `email_remetente`:** por empresa, o e-mail e o nome de envio, o domínio, o id do domínio no Resend, a
  situação (`pendente`, `verificado`, `falhou`), os registros de DNS a mostrar e a última checagem. Leitura por dono e
  admin, gravação só pelas funções. Domínio único entre empresas.
- **Edge Function `email-dominio`** (dono e admin): cadastra, consulta e remove o domínio no Resend.
- **Edge Function `enviar-email`** (`verify_jwt = false`, autenticação dentro): recebe `pedido_id` ou `os_id`, o path
  do PDF já enviado ao storage, destinatários, assunto e mensagem. Confere que a pessoa vê o pedido (consulta com o
  token dela, a RLS decide), valida os e-mails, aplica o limite, baixa o PDF do bucket, escolhe o remetente (o da
  empresa se verificado, senão o da Livih), chama o provedor e grava em `envios_documento`.
- **Bucket:** o PDF do e-mail sobe em `midias/<org>/envios/…` (hoje o path é por conversa; e-mail não tem conversa).
  Política de storage nova para esse prefixo.
- **Webhook do provedor (opcional, depois):** atualiza para `entregue` ou `devolvido` (e-mail inexistente), para a
  tela avisar "o e-mail de Gisele voltou, confira o endereço".
- Front: componente `ModalEnviarDocumento`, usado no pedido e na OS, no lugar da confirmação atual.
- Textos com o `revisor-textos`; migration com o `revisor-banco`.

## Parte 3 (depois): API oficial sem conversa

Para empresas com número da API oficial, mandar o PDF fora da janela exige um **modelo de Utilidade com documento no
cabeçalho** (ex.: "Olá {{1}}, segue o orçamento nº {{2}} da {{3}}."), aprovado pela Meta para cada empresa. Hoje o
envio de modelos da Livih não manda cabeçalho. Fica fora até alguma empresa da API oficial pedir. A JoGrampo não
precisa.

## Ordem sugerida

1. Parte 1 (WhatsApp sem conversa), no pedido e na OS: resolve o caso do print e sai rápido.
2. Conta no Resend e DNS do `envio.livih.com.br` no Cloudflare (usuário), em paralelo.
3. Parte 2a: envio por e-mail com o endereço da Livih e a janela única de envio.
4. Parte 2b: domínio da empresa em Configurações. A JoGrampo cadastra `vendas@jogrampo.com.br` e passa os registros
   para quem cuida do domínio dela.

## Decidido

- 03/11: e-mail sai pelo Resend. Empresa com domínio e e-mail próprios usa o dela como remetente (domínio verificado no
  Resend); sem domínio, o endereço da Livih com o nome da empresa.

- 03/11: **Responder para** é configurado pelo dono em Configurações → E-mail (o e-mail da empresa, o do vendedor que
  enviou, ou outro endereço fixo).
- 03/11: **número de saída** quando não há conversa: o do vendedor, com opção de trocar.

## A decidir

1. **Custo:** a cota grátis e o domínio grátis cobrem o começo; quando passar, entra no plano (e-mail com domínio
   próprio como item dos planos maiores?) ou a Livih absorve.
