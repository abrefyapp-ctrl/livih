# Instagram na Livih (plano de 19/11/2026)

A pessoa vê um Story ou um anúncio da empresa no Instagram, responde no Direct, e a Livih faz o primeiro atendimento,
como já faz no WhatsApp. Pedido do usuário em 19/11; a CEFEQ pediu na reunião de 17/11 e o concorrente dela oferece.
Decidido em 18/11: é recurso do produto, sem custo à parte, para oferecer a todos os clientes
([cefeq-ata-20261117.md](cefeq-ata-20261117.md), fora do git).

## Decisões de 19/11

| Pergunta | Decisão |
|---|---|
| Primeira entrega | **Só o Instagram**: Direct, respostas a Stories e anúncios que abrem conversa no Direct. O Messenger da Página do Facebook vem depois, na mesma base |
| Depois das 24 horas | **O agente pede o WhatsApp** no primeiro atendimento, para mandar orçamento e nota. A conversa segue por lá, e o contato é um só nos dois canais |
| Quando | **Agora**: o plano e a parte da Meta (que demora) primeiro; a construção anda junto |

## Como fica para o cliente da Livih

1. Em Configurações → WhatsApp (que passa a se chamar Canais), **Conectar Instagram**: entra com a conta da Meta,
   escolhe a conta do Instagram profissional, e pronto. Não precisa de Página do Facebook.
2. Mensagem no Direct vira conversa na Livih, com o ícone do Instagram, o @ e o nome da pessoa.
3. **Resposta a Story:** a conversa mostra o Story respondido (a imagem fica guardada na Livih, porque o link da Meta
   expira) e o agente recebe a descrição dele, para saber de qual produto a pessoa fala.
4. **Anúncio:** a conversa registra o anúncio de origem (título e imagem), e a origem do contato fica "Instagram".
5. O agente atende, e quando for mandar orçamento, PDF ou nota, **pede o WhatsApp**. Com o número, o contato do
   Instagram e o do WhatsApp viram um só.
6. A equipe responde pela Livih ou pelo app do Instagram; o que for digitado no app também aparece na conversa.

## Regras da Meta (documentação de 19/11)

Fontes: [Unified Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login),
[webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples),
[mensagens](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api),
[política](https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy).

- **Caminho escolhido: "Instagram API with Unified Login"**, o que a Meta recomenda para integrações novas (os
  recursos novos só saem nele). É feito sobre o mesmo **Facebook Login for Business** do cadastro do WhatsApp oficial
  ([cadastroMeta.ts](../src/services/cadastroMeta.ts)), com uma **configuração própria** marcada "Instagram Login
  Compatible". Token: o usuário de sistema do portfólio do cliente (continua valendo se a pessoa que conectou sair).
- **Conta:** Instagram **profissional** (empresa ou criador) no **portfólio empresarial** do cliente. Página do
  Facebook não precisa. A conta precisa de "Permitir acesso às mensagens" ligado no app do Instagram.
- **Permissões:** `instagram_basic` e `instagram_manage_messages`.
- **Webhook:** campos `messages`, `messaging_referral`, `messaging_seen`, `message_reactions`; cada conta conectada
  precisa de `POST /{ig-id}/subscribed_apps`. Resposta a Story chega em `message.reply_to.story` (`id`, `url`);
  menção em Story, como anexo `story_mention`; anúncio, no objeto `referral` (`ad_id`, `ads_context_data`).
- **Janela:** responder até **24 horas** depois da última mensagem da pessoa. Depois, só atendente humano, por 7
  dias, com o recurso "Human Agent" (pedido à parte na Meta; robô e promoção proibidos nessa janela). Por isso a
  decisão de levar a conversa para o WhatsApp.
- **Robô:** permitido, mas o Instagram exige **caminho para um humano** (a Livih já passa para a equipe) e pede
  resposta rápida. Avisar que é automático é recomendado.
- **Envio:** texto até **1.000 bytes** por mensagem (o agente manda em partes); imagem png/jpeg até 8 MB; PDF, vídeo
  e áudio até 25 MB.
- **Nome e foto:** `name`, `username` e `profile_pic` pela API, depois que a pessoa mandou mensagem. A URL da foto
  expira em dias: guardar a imagem.
- **Para atender outras empresas:** a F7 Tech com **verificação de empresa**, o app em modo Live e **Advanced Access**
  nas duas permissões, que só sai com **App Review** (vídeo mostrando o uso e ao menos uma chamada de cada permissão).
  Antes disso, só funciona com contas de pessoas que têm papel no app, e a Meta não aceita usuário de teste: precisa
  de uma conta profissional de verdade.

## Parte da Meta (com o usuário, porque o acesso é dele)

1. **Conta de teste:** um Instagram profissional da F7 Tech (ou da Livih) no portfólio F7 Tech, com "Permitir acesso
   às mensagens" ligado. A Página não é necessária aqui (o problema de acesso à Página de 03/11 não trava este passo).
2. **No app "livih"** (App Dashboard): adicionar o caso de uso "Manage messaging & content on Instagram", abrir "API
   setup with Unified login", criar a configuração do Facebook Login for Business com as duas permissões e anotar o
   `config_id` (não é segredo; vai para o front como o do WhatsApp).
3. **Webhook do Instagram:** URL `/functions/v1/instagram-webhook`, o mesmo verify token do WhatsApp, e os campos
   acima.
4. **Verificação de empresa da F7 Tech:** conferir se já está feita (o WhatsApp oficial como Tech Provider costuma
   exigir).
5. **App Review**, quando a entrega 2 estiver no ar com a nossa conta: vídeo do fluxo (conectar, receber, responder)
   e texto do uso de cada permissão. Leva dias ou semanas; até sair, só a nossa conta funciona.

## Técnico

- **Canal:** `canais.tipo` ganha `instagram`. O ID da conta profissional vai em `instance_id` (o `unique (tipo,
  instance_id)` já impede conectar a mesma conta em duas empresas); o token do usuário de sistema, no Vault, como o
  da API oficial do WhatsApp; `canais.origem` = "Instagram".
- **Contato sem telefone:** `contatos` ganha `instagram_id` (o IGSID, único por empresa) e `instagram_usuario` (o
  @), e a regra `contatos_identificacao` passa a aceitar telefone, LID do WhatsApp **ou** Instagram. Quem chega pelo
  Instagram e depois dá o WhatsApp continua sendo **um contato só**, com uma conversa em cada canal (`conversas` já é
  única por canal e contato). Se o número já for de outro contato, os dois se juntam (conversas, oportunidades e
  cliente passam para o que já existia), com auditoria.
- **Recebimento:** Edge Function `instagram-webhook`, nova, com a mesma assinatura do app (`META_APP_SECRET`). Usa
  `_shared/atendimento.ts` e `_shared/midia.ts`. Precisa de uma `registrar_entrada` que aceite o IGSID no lugar do
  telefone. Story: baixa a imagem na hora para o bucket `midias` e grava a mensagem como "Respondeu ao seu Story",
  com a imagem; a descrição da IA (já existe para imagens) vai para o agente. `is_echo` (digitado no app do
  Instagram) entra como a coexistência do WhatsApp: a equipe assumiu.
- **Envio:** a `whatsapp-enviar` já tira da `fila_envio`; ganha o ramo do Instagram (`graph.facebook.com/{ig-id}/
  messages`, destinatário IGSID), quebra o texto em partes de até 1.000 bytes e recusa, com o motivo, fora das 24
  horas (como a API oficial do WhatsApp fora da janela).
- **Agente (n8n):** recebe o canal no contexto. No Instagram: responde curto, e antes de orçamento, PDF ou nota pede
  o WhatsApp (ferramenta nova para gravar o número no contato). Simulador junto.
- **Tela:** conectar o Instagram em Configurações; ícone do canal na lista de conversas; o Story e o anúncio na
  conversa; o @ no contato; o aviso de 24 horas no campo de resposta.
- **Manual da Ajuda:** "Conectar o Instagram" no manual do WhatsApp (ou um manual de Canais).

## Entregas

1. **Conectar e receber:** migration (canal, contato com Instagram), botão de conectar, `instagram-webhook`, conversas
   aparecendo na Livih. Sem agente. Testada com a conta da F7 Tech.
2. **Responder:** envio pela tela e pelo agente, a janela de 24 horas, ecos do app, nome e foto.
3. **Story, anúncio e o WhatsApp:** imagem do Story para o agente, origem do anúncio, o agente pedindo o WhatsApp e a
   junção dos contatos.
4. **App Review e manual:** vídeo e textos para a Meta; manual da Ajuda; liberar para os clientes.

Esforço estimado: 4 a 6 dias de construção, mais a espera do App Review.

## Entrega 1 (19/11): conectar e receber

Migration `20261119120000_instagram_canal`, Edge Function `instagram-webhook` (nova) e a ação `instagram` na
`whatsapp-conexao`.

- **Banco:** canal `instagram` (ID da conta em `instance_id`); contato com `instagram_id` (IGSID) e
  `instagram_usuario`, sem telefone; o nome do perfil vai em `nome_whatsapp`, que virou "nome do perfil" e já é o que
  telas, agente e campanhas usam quando falta o nome. `registrar_entrada_instagram` grava a mensagem; a parte comum com
  o WhatsApp saiu da `registrar_entrada` para `entrada_gravar` (mesmas regras de conversa, mensagem e agente).
- **O Instagram não ocupa vaga de número** do plano, e o que só funciona no WhatsApp passou a escolher só canais
  `waha` e `meta`: limite e contagem de números (`canais_limite_plano`, `canais_sem_vaga`, `plano_trocar`,
  `plano_troca_situacao`, `plataforma_empresas`, `org_primeiros_passos`), alertas e lembretes para a equipe
  (`canal_para_avisar`, `agenda_lembretes`, `avisar_franquia`, `estoque_avisar_equipe`, `tarefas_lembretes`), nota
  fiscal e aviso de pedido (`nota_whatsapp_preparar`, `pedido_avisar`) e conversa nova pela Livih
  (`iniciar_conversa`: no Instagram, quem começa é o cliente).
- **Até a entrega 2**, responder pela Livih numa conversa do Instagram é recusado com o motivo ("responda pelo app do
  Instagram"), e a conta nasce sem agente: a conversa entra "com a equipe" (Agente desligado). Em Configurações, a
  linha da conta mostra "Atendimento pela equipe" no lugar do interruptor do agente.
- **Webhook:** texto; imagem, vídeo, áudio e arquivo (guardados no bucket `midias`; imagem descrita pela IA, áudio
  transcrito, como no WhatsApp); **resposta a Story vira imagem** com "Respondeu ao seu Story:" e o texto da pessoa (a
  imagem é baixada na hora, porque o link da Meta expira); menção em Story; publicação e reel compartilhados viram o
  link. Vários anexos numa mensagem viram uma mensagem cada (`mid`, `mid:1`…). Nome e @ da pessoa: buscados na Meta
  na primeira mensagem (`/{igsid}?fields=name,username`). Eco do app do Instagram, lido e reações: entrega 2.
- **Conectar:** botão "Conectar Instagram" em Configurações → WhatsApp (dono e admin), escondido enquanto
  `CONFIG_ID_INSTAGRAM` ([cadastroMeta.ts](../src/services/cadastroMeta.ts)) estiver vazio. Cada conta liberada no
  login vira um canal; reconectar a mesma conta renova o token. Na lista de conversas, o canal do Instagram aparece com
  o ícone de câmera.
- **Revisão do banco (19/11, já na migration):** a conta do Instagram só entra, volta ou muda pelo login da Meta (um
  gatilho recusa a gravação direta pela API, que deixaria uma empresa travar a conta de outra); agente no canal do
  Instagram recusado até a entrega 2 (`agentes_sem_instagram`, que a entrega 2 tira); o IGSID do contato não muda pela
  tela; `'instagram'` é origem provisória do contato, como `'whatsapp'` (a regra de origem ou a do canal a troca), e a
  conta nasce com a origem "Instagram"; entrada, eco do celular e segredo do WAHA só em canal de WhatsApp; contato sem
  telefone fora dos destinos da nota.
- **Meta, 19/11:** caso de uso "Gerenciar mensagens e conteúdo no Instagram" no app livih. A configuração do modelo da
  Meta (`config_id` 3888750944626294, com permissões e contas de anúncios) **obrigava a criar uma conta de anúncios** no
  login (só havia "Criar uma nova conta de anúncios"); trocada pela configuração própria **"Livih Instagram"**
  (`config_id` 1846343713160051): token do usuário do sistema sem expiração, só a conta do Instagram (obrigatória),
  `instagram_basic` e `instagram_manage_messages`. Webhook do Instagram verificado, com `messages` e
  `messaging_referral`; o `META_VERIFY_TOKEN` foi trocado em 19/11 (o do WhatsApp continua valendo, porque a Meta só
  confere o token ao salvar o webhook). Conta de teste: **livih.tech**,
  no portfólio Livih (o WhatsApp oficial fica no portfólio F7 Tech; para o Direct, não importa). "Permitir acesso às
  mensagens" precisa de quem tem a senha do Instagram (pedido em 19/11).
- **Teste de 19/11 com o livih.tech:**
  - **Funcionou:** a conexão pelo botão (a conta virou o canal "@livih.tech" na F7 Tech, com token sem expiração;
    `/me/assigned_instagram_accounts` e `subscribed_apps` funcionaram); o caminho Meta → Livih (o "Testar" do campo
    `messages` chegou ao `instagram-webhook` com 200).
  - **Não chegou:** nenhuma mensagem real do Direct (nenhum POST nos logs), nem de uma conta cadastrada e aceita como
    testador do Instagram. Isso descarta a falta do App Review e aponta para o **"Permitir acesso às mensagens"** do
    livih.tech, ainda desligado (o Business Suite mostra o alerta "as mensagens do Instagram ficarão indisponíveis
    até você confirmar…", que pede a senha do Instagram; quem tem a senha precisa ligar).
  - **Depois:** acesso às mensagens ligado (o alerta do Business Suite sumiu e as mensagens aparecem na Caixa de
    Entrada dele), livih.tech também como testador (e com a assinatura do webhook ativada no painel), app publicado,
    reconexões: **nenhum POST** do Direct. O diagnóstico (`whatsapp-conexao`, ação `instagram_diagnostico`) mostra a
    conta assinada com `messages` e `messaging_referral` (v25 e v27) e a API enxergando a conversa com o felippers85.
    Leitura: no acesso padrão a Meta não está entregando o evento; o App Review (acesso avançado) é o próximo passo.
- **Busca pela API (19/11, decidido pelo usuário):** Edge Function `instagram-sincronizar`, a cada minuto (cron
  `livih-instagram-sincronizar`, migration `20261119160000`, só quando existe conta do Instagram ativa). Para cada
  conta, pega as conversas que mudaram na última hora (`/{ig}/conversations?platform=instagram`, com as mensagens) e
  grava as recebidas depois de a conta ser conectada. A leitura e a gravação saíram do webhook para
  `_shared/instagram.ts` (`lerMensagemWebhook`, `lerMensagemApi`, `gravarRecebida`): as duas portas seguem as mesmas
  regras, e a mensagem que já entrou é recusada pelo ID (supõe o mesmo ID nas duas; conferir quando o webhook voltar).
  Limite: a API de conversas aceita cerca de 2 chamadas por segundo por conta; serve para dezenas de contas, não para
  centenas (aí o webhook precisa funcionar).
  **Funcionando em 19/11:** as mensagens do felippers85 entraram na conversa do @livih.tech (com a equipe, origem
  "Instagram", sem duplicar entre rodadas) em menos de um minuto, e o nome dele ("Felippe Soares") veio da Meta. A
  busca do perfil passou a rodar também quando o @ já vem da API, e as listas de conversas e de contatos mostram o @ de
  quem ainda não tem nome. Falta testar a resposta a Story pela busca (`story.reply_to`).
- **A confirmar no primeiro teste** com a conta da F7: a lista de contas (`/me/assigned_instagram_accounts`, sem
  exemplo de resposta na documentação), o `entry.id` do webhook (a documentação diz que é o ID da conta profissional)
  e o perfil da pessoa pelo `graph.facebook.com`.
- **Para a entrega 2:** o alerta "o agente chamou a equipe" (`agente_chamar_humano`) usa o canal da conversa e precisa
  ir pelo `canal_para_avisar` quando a conversa for do Instagram; os follow-ups (`followup_rodar`) precisam respeitar
  as 24 horas no Instagram.
- **Conferência de tipos das Edge Functions:** `npx -y deno check --node-modules-dir=none <arquivo>` resolve o
  `pdf-lib` pelo cache e passa também nas funções que importam `_shared/midia.ts`.

## Em aberto

- **Primeira mensagem no WhatsApp:** com o número em mãos, quem fala primeiro? (a) O agente responde no Direct com o
  link `wa.me` do número da empresa e a pessoa chama (sem modelo aprovado e sem risco de bloqueio no WAHA); ou (b) a
  Livih manda a primeira mensagem no WhatsApp (na API oficial, só com modelo aprovado; no WAHA, mensagem para número
  que nunca falou com a empresa aumenta o risco de bloqueio). Sugestão: (a).
- **Comentários em posts** (responder no privado quem comentou): fora da primeira entrega.
- **Messenger** (Página do Facebook): depois, com as permissões `pages_messaging` e a Página vinculada.
