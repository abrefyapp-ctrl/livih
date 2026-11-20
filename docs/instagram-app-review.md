# Instagram: App Review na Meta (entrega 4, preparada em 20/11/2026)

Para atender empresas que não têm papel no app "livih", a Meta exige **Advanced Access** em `instagram_basic` e
`instagram_manage_messages`, que só sai pelo App Review. Depois dele, o webhook deve passar a entregar as mensagens
reais (hoje mudo, ver [instagram.md](instagram.md)) e a busca a cada minuto pode virar reserva (15 a 30 minutos).

Regras conferidas na documentação da Meta em 20/11 ([App Review do Instagram](https://developers.facebook.com/docs/instagram-platform/app-review),
[guia de envio](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide),
[permissões](https://developers.facebook.com/docs/permissions/)). As páginas não têm data; o painel do app manda no
que valer diferente.

## Antes de enviar

| Item | Situação |
|---|---|
| Verificação de empresa da F7 Tech (obrigatória para Advanced Access) | **Conferir** no Gerenciador de Negócios → Central de segurança |
| Chamada com sucesso de cada permissão nos últimos 30 dias (o botão de pedir fica cinza até a Meta registrar; leva até 2 dias) | Feita em 19 e 20/11 (conexão, busca, envio). Enviar até 19/12, ou repetir um envio antes |
| Dependências: o painel pode pedir junto `pages_show_list` e `pages_read_user_content` (dependências de `instagram_basic` na referência) | **Conferir** a lista em App Review → Permissões e recursos; pedir só o que o painel exigir |
| Ícone 1024×1024, categoria, e-mail da empresa, URL da política de privacidade, URL de exclusão de dados | **Conferir** em Configurações → Básico (o WhatsApp oficial já deve ter deixado prontos) |
| Política de privacidade cobrindo o Instagram | **Falta** (seção abaixo) |
| Acesso do revisor: login na Livih e o botão "Conectar Instagram" visível | **Falta** (seção abaixo) |
| Finalidade do app: "Clientes" (Tech Provider, serve várias empresas) | Marcar no formulário |
| Human Agent (responder até 7 dias, só humano) | **Não pedir agora**: a decisão é levar a conversa para o WhatsApp, e a Meta recusa pedido "para uso futuro" |

## Pendências na Livih

1. **Política de privacidade** ([privacidade](../site/public/privacidade/index.html), sai com o `git push`):
   incluir as conversas do Instagram Direct (IGSID, @, nome do perfil, mensagens, imagem do Story respondido), a Meta
   como plataforma do Instagram e corrigir o trecho de mídia: desde 16/10 os arquivos ficam guardados (bucket
   `midias`), não são apagados em minutos. A Meta confere a política no envio.
2. **Acesso do revisor:** decidido em 20/11 que o botão "Conectar Instagram" continua **só para a F7** até a
   aprovação (hoje aparece para quem administra a plataforma: [SecaoWhatsapp.tsx](../src/components/SecaoWhatsapp.tsx),
   `portfolioF7`). Falta definir como o revisor entra: a Meta testa com contas de teste dela e pede as credenciais
   "se necessário"; não pode ser o login pessoal do Felippe nem conta falsa (recusa o envio inteiro), e um login na
   F7 Tech mostraria conversas reais. Caminho sem mexer no botão: o vídeo mostra o fluxo inteiro, e a instrução diz
   que a conexão é liberada pela equipe da Livih para cada empresa durante o onboarding.
3. **Remover a conta de verdade** (sugestão do revisor de textos, 20/11; migration `20261120120000`): antes,
   "Remover conta" só desativava o canal e o agente, e a assinatura do webhook e o token no Vault ficavam. Agora a
   `whatsapp-conexao` desativa o canal, cancela a assinatura (`DELETE /{ig-id}/subscribed_apps`; se a Meta recusar,
   a conta sai do mesmo jeito) e chama `meta_canal_removido`, que apaga o token do Vault e encerra a fila do canal
   (pendentes viram erro "conta do Instagram removida"). Na reconexão, o canal antigo da mesma conta passa pela mesma
   limpeza, e a renovação de token não religa uma conta removida no meio do caminho (revisão do banco). Conferir uma
   vez em produção, com uma conta de teste, que o `DELETE` responde `success: true` (log da `whatsapp-conexao`).

## Vídeo (um por permissão, ou o mesmo vídeo nas duas)

Regras da Meta: resolução 1080 ou maior, tela de até 1440 de largura, sem áudio, cursor grande, só a janela do
navegador, começando **deslogado** (sair da Livih e da Meta antes de gravar). A tela é em português: **legendas em
inglês** em cada passo, explicando os botões. Mostrar o uso de verdade, sem pular telas.

| Cena | Tela | Legenda (inglês) |
|---|---|---|
| 1 | app.livih.com.br, tela de login; entrar | "Livih is a CRM where Brazilian businesses answer customer messages from WhatsApp and Instagram in one shared team inbox. The business owner logs in." |
| 2 | Configurações → seção dos números → **Conectar Instagram** | "In Settings, the owner clicks 'Conectar Instagram' (Connect Instagram) to add the business's Instagram professional account." |
| 3 | Janela do Facebook Login for Business: entrar, ver as permissões, escolher a conta **@livih.tech**, confirmar | "Facebook Login for Business: the owner grants instagram_basic and instagram_manage_messages and selects the Instagram professional account." |
| 4 | Volta para a Livih: a conta aparece "Conectado ao Instagram", com o @ | "instagram_basic: Livih reads the account ID and username and shows the account as a connected channel." |
| 5 | Celular ou navegador do cliente (felippers85): mandar "Hi, do you have this in stock?" no Direct do @livih.tech | "A customer sends a Direct message to the business on Instagram." |
| 6 | Livih → Conversas: a conversa nova com o ícone do Instagram, o nome e o @ (cortar a espera) | "instagram_manage_messages: the message arrives in the Livih inbox with the customer's name and username." |
| 7 | Abrir a conversa, digitar a resposta e enviar; mandar também uma imagem | "A team member replies from Livih, including a file." |
| 8 | Direct do cliente (felippers85) mostrando a resposta e a imagem recebidas | "The customer receives the reply in the Instagram inbox." |
| 9 | Aviso das 24 horas numa conversa antiga (campo bloqueado) | "Livih only replies within Meta's 24-hour messaging window." |
| 10 (se o formulário pedir) | App Dashboard → Instagram → API Integration Helper, gerar o cURL de envio | "Sample API call generated in the API Integration Helper." |

O agente de IA pode aparecer numa cena extra (ligar o agente na conta, o cliente pergunta, o agente responde, a
equipe assume com "Devolver ao agente"/"Assumir"), com a legenda "The business can turn on an AI assistant that
replies and hands the conversation to a human team member." É opcional; se entrar, a descrição abaixo já cobre.

## Textos do formulário (em inglês, um por permissão, sem copiar um no outro)

**instagram_basic**

> Livih is a CRM used by small and medium businesses in Brazil to answer their customers' WhatsApp and Instagram
> messages in a shared team inbox. When a business owner clicks "Conectar Instagram" (Connect Instagram) in Settings
> and completes Facebook Login for Business, Livih uses instagram_basic to read the ID and username of the Instagram
> professional account they selected. The account then appears in Settings as a connected channel
> ("@username – Connected to Instagram"), and every conversation that arrives through it is labeled with that
> account, so the team knows which account received each message. We also use the account ID to subscribe the
> account to our webhook and to send replies from the correct account. Livih does not read or display the
> account's posts, media, followers or insights.

**instagram_manage_messages**

> Businesses that connect their Instagram professional account to Livih receive their Instagram Direct messages,
> including replies to their Stories, in the Livih inbox next to their WhatsApp conversations, and answer them from
> Livih. We use instagram_manage_messages to: (1) receive new messages through the webhook and the conversations
> endpoint; (2) get the sender's name and username to show in the conversation; (3) send replies written by the
> business's team members, including images and documents, only within the 24-hour messaging window; and (4) send
> replies written by the business's AI assistant, which each business can turn on or off per account and which hands
> the conversation over to a human team member when needed. Messages the business types directly in the Instagram app
> are also shown in Livih, so the conversation history stays complete. Livih does not send messages outside the
> 24-hour window, does not send bulk or promotional messages on Instagram, and does not use message content for
> advertising.

**Instruções para o revisor** (campo de acesso ao app)

> 1. Open https://app.livih.com.br and log in with the test credentials below (a demo business with no real customer
>    data). The interface is in Portuguese; the screencast has English captions.
> 2. Go to "Configurações" (Settings) and, in the channels section, click "Conectar Instagram" (Connect Instagram).
>    Complete Facebook Login for Business with your test user and select an Instagram professional account.
> 3. From another Instagram account, send a Direct message to the connected account. It appears under "Conversas"
>    (Conversations) within one minute.
> 4. Open the conversation, type a reply in the text box at the bottom and click send. The reply is delivered to the
>    Instagram inbox of the account that wrote.
>
> Test credentials: [e-mail e senha da empresa de demonstração]

## Depois da aprovação

- Abrir o botão "Conectar Instagram" para dono e admin de todas as empresas (troca de `portfolioF7` por `oficial`).
- Conferir se o webhook passa a entregar e se o ID da mensagem é o mesmo da busca (a recusa de duplicada depende
  disso); então espaçar a busca para 15 a 30 minutos.
- Manual da Ajuda: "Conectar o Instagram".
