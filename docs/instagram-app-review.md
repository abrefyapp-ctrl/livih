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
| Verificação de empresa da F7 Tech (obrigatória para Advanced Access) | **Feita** em 12/10/2026 (portfólio F7 Tech, ID 1587552546442374, CNPJ 62.213.016/0001-30). O endereço do portfólio (Av. João Gualberto, 1342) é outro que o da política (Rua Visconde do Rio Branco, 1488); já era assim na aprovação do WhatsApp, então fica como está |
| Chamada com sucesso de cada permissão nos últimos 30 dias (o botão de pedir fica cinza até a Meta registrar; leva até 2 dias) | Feita em 19 e 20/11 (conexão, busca, envio). Enviar até 19/12, ou repetir um envio antes |
| Dependências: o painel pode pedir junto `pages_show_list` e `pages_read_user_content` (dependências de `instagram_basic` na referência) | **Conferir** a lista em App Review → Permissões e recursos; pedir só o que o painel exigir |
| Ícone, categoria ("Negócio e Páginas"), e-mail, URL da política de privacidade, URL de exclusão de dados (`/privacidade/#direitos`), Verificação de Uso de Dados | **Prontos** em Configurações → Básico (20/11), com a URL dos Termos de Serviço (`https://livih.com.br/termos/`) preenchida no mesmo dia |
| Política de privacidade cobrindo o Instagram | **Publicada** em 20/11 |
| Acesso do revisor: login na Livih e o botão "Conectar Instagram" visível | **Falta** (seção abaixo) |
| Finalidade do app: "Clientes" (Tech Provider, serve várias empresas) | Marcar no formulário |
| Human Agent (responder até 7 dias, só humano) | **Não pedir agora**: a decisão é levar a conversa para o WhatsApp, e a Meta recusa pedido "para uso futuro" |

Requisitos no painel (20/11), nas duas permissões: verificação da empresa ✅, chamada de teste ✅ (657 e 653
chamadas), nenhuma permissão de Página como dependência. Faltam a **Análise do app** (vídeo e textos) e as
**Perguntas sobre tratamento de dados**.

## Perguntas sobre tratamento de dados

**Já respondidas** no envio do WhatsApp aprovado em 26/10/2026 (conferido em 20/11): Sim; F7 Tech, CNPJ
62.213.016/0001-30, BR; zero pedidos; as quatro políticas. A lista de operadores aparece vazia na tela de detalhes:
se o envio do Instagram pedir para confirmar, preencher com os da tabela. Seguem a
[política de privacidade](../site/public/privacidade/index.html).

| Pergunta (resumo) | Resposta |
|---|---|
| Há operadores ou prestadores de serviço com acesso aos dados da plataforma? | **Sim**: Supabase (banco, São Paulo), Hostinger (servidor do agente, Brasil), OpenAI (respostas do agente, descrição de imagens e transcrição de áudios, EUA) |
| Quem é o responsável pelos dados? | Felippe Ribeiro Soares Desenvolvimento de Software Ltda. (F7 Tech), **Brasil** |
| Entregou dados pessoais de usuários da Meta a autoridades públicas, por segurança nacional, nos últimos 12 meses? | **Felippe responde** (esperado: não) |
| Que políticas existem para pedidos de autoridades? | Marcar as quatro: análise da legalidade, contestação de pedidos ilegais, minimização de dados, registro dos pedidos (a política, seção 6, diz as quatro) |

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

No formato do envio do WhatsApp aprovado em 26/10/2026 (o que é, "How we use" com os endpoints, "Value for the
user", "Why it is necessary", "In the video"). Vídeo também no mesmo formato: o Instagram do cliente de um lado e a
Livih do outro.

**instagram_basic**

> Livih is a shared inbox and CRM for small and medium sales teams in Brazil. Besides WhatsApp, each business can
> connect its own Instagram professional account to Livih through Facebook Login for Business, so its team answers
> Instagram Direct messages from the same place. How we use instagram_basic: right after the login, we read the
> Instagram accounts the business selected (GET /me/assigned_instagram_accounts?fields=id,username,name), create one
> channel per account showing its @username, and subscribe our app to that account's webhooks
> (POST /{ig-id}/subscribed_apps). The account ID is also used to send replies from the correct account, and the
> @username labels every conversation that arrives through it. We do not read or display posts, media, followers or
> insights. Value for the user: the business sees in Settings which Instagram account is connected
> ("@username – Connected to Instagram") and the team knows which account received each message. Why it is
> necessary: without this permission Livih cannot identify the account the business chose during login, so it cannot
> connect it as a channel. In the video, a logged-in owner opens Settings, clicks "Conectar Instagram" (Connect
> Instagram), completes Facebook Login for Business selecting the account, and the account appears in Livih with its
> @username.

**instagram_manage_messages**

> Livih is a shared inbox and CRM for small and medium sales teams in Brazil, where a business answers its customers'
> WhatsApp and Instagram Direct messages with its whole team. How we use instagram_manage_messages: we receive the
> account's incoming Direct messages, including replies to its Stories, through our webhook and, as a fallback, the
> conversations endpoint (GET /{ig-id}/conversations?platform=instagram), and store them in the conversation history;
> we read the sender's name and username (GET /{igsid}?fields=name,username) to show who wrote; and we send replies
> written by the business's agents, including images and documents, with POST /{ig-id}/messages. The business can
> also turn on an AI assistant per account, which replies within the same rules and hands the conversation over to a
> human agent when needed. Replies are only sent within the 24-hour window after the customer's last message; after
> that, Livih blocks the reply box and tells the agent why. No bulk or promotional messages are sent on Instagram.
> Messages typed directly in the Instagram app also appear in Livih, so the history stays complete. Value for the
> user: the whole team sees and answers Instagram and WhatsApp conversations in one inbox, nothing is lost when an
> employee leaves, and managers can follow every conversation. Why it is necessary: receiving and replying to Direct
> messages on behalf of the business is the core of this feature; without this permission Livih cannot deliver the
> business's replies. In the video, a customer sends a Direct message from Instagram (left), it appears in the Livih
> inbox with the customer's name and @username (right), an agent replies from Livih with text and an image, and the
> reply is delivered to the customer's Instagram inbox.

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
