# Livih — sistema de design e arquitetura do front

Referências visuais: `Kit de UI CRM livih em português.png` e `docs/telas/` (protótipo do Figma, tratado
como exploração visual e normalizado pelos tokens abaixo). Guia de processo: `SKILL Lead UIUX Product & Design`.

## 1. Produto

**Objetivo principal do usuário:** não deixar cliente sem resposta no WhatsApp. O agente atende sozinho;
a equipe entra quando ele pede ajuda (lead quente, orçamento, reclamação) ou quando decide assumir.

**Usuários:** atendentes e vendedores de pequenas empresas (uso o dia todo, várias vezes por hora,
desktop no escritório e celular na rua); dono/admin, que também configura o agente.

**Tarefas, por frequência:**
1. Ver quem precisa de atendimento humano agora e responder.
2. Ler o histórico (inclusive áudio transcrito) antes de responder.
3. Assumir uma conversa, devolver ao agente ou encerrar.
4. Consultar e anotar dados do contato e da oportunidade.
5. (fase 2) Acompanhar o funil de oportunidades; configurar agente, base de conhecimento e canal.

**Ações críticas:** responder (vai para o cliente e não volta atrás — mensagens são só acréscimo);
assumir (para o agente); devolver ao agente (o bot volta a falar sozinho); encerrar.
**Ação destrutiva:** nenhuma no MVP. Encerrar não apaga nada e a conversa reabre sozinha se o cliente
escrever; mesmo assim pede confirmação, porque tira a conversa da fila.

**Hierarquia da informação (tela de conversas):**
1. Crítica: conversas aguardando humano (e há quanto tempo), mensagem nova do cliente.
2. Importante: estado da conversa (agente / atendente / aguardando / encerrada), quem está atendendo,
   motivo de o agente ter chamado a equipe.
3. Contextual: dados do contato, oportunidade aberta, notas.
4. Secundária: status de entrega, horário exato.

**Restrições conhecidas (não inventar):** a mídia não é guardada (áudio vira transcrição; arquivo só tem
o tipo). Não há empresas, tarefas, calendário, produtos nem métricas de receita no banco — as telas do
Figma com esses dados ficam para quando o backend existir.

## 2. Arquitetura da informação

Navegação principal (barra lateral), só com o que já tem dado real:

| Item | Rota | Fase |
|---|---|---|
| Conversas (com contador de "aguardando"; filtro por número) | `/conversas` | feito |
| Contatos (lista da carteira + perfil `/contatos/:id`) | `/contatos` | feito |
| Oportunidades (kanban do funil, arrastar entre etapas) | `/oportunidades` | feito |
| Configurações (equipe, WhatsApp, agente, base) | `/configuracoes/:secao` | feito |
| Painel (números reais: conversas por estado, tempo até assumir, funil) | `/` | próximo |
| Empresas (só equipe da plataforma: criar empresa + link do dono, suspender, pedidos do site) | `/empresas` | feito |

Menu só com o que existe — não leva a tela vazia.

**Empresa nova (decisão de 07/10):** a F7 cria pelo painel Empresas (nome + e-mail do dono) e manda o link
de acesso; o dono cai em "Primeiros passos" (Conversas e Configurações) até conectar o WhatsApp, escrever as
instruções, montar a base, ligar o agente e convidar a equipe. Cadastro livre pelo site não: o formulário do
site grava em `pedidos_acesso` e a F7 aprova. Empresa suspensa: equipe vê só o aviso, agente para, nada apaga.

**Carteira (decisão de 07/10):** número de vendedor e os clientes dele só para ele, dono e admin; número da
empresa e contatos sem dono para todos. A regra está na RLS (pode_ver_canal / pode_ver_contato), não na tela.

Cabeçalho: seletor de organização (um usuário pode estar em várias), menu do usuário (sair).
Busca global fica para a fase 2 (precisa de contatos + oportunidades).

Conversas: filtros por aba — **Aguardando você** (`aguardando_humano`), **Em atendimento**
(`humano`; sub-filtro "só as minhas"), **Com o agente** (`bot`), **Encerradas**. Abre em
"Aguardando você" quando houver alguma; senão em "Em atendimento".

## 3. Fluxos

**Responder quem pediu humano:** Conversas → aba Aguardando (badge no menu) → abrir conversa (zera não
lidas) → ler histórico e motivo → escrever → Enviar → mensagem aparece como "pendente" e vira
"enviada/entregue" pelo Realtime; a conversa passa para "Em atendimento" atribuída a mim.
Erro de envio: a mensagem fica marcada "Não enviada" com o motivo (o sistema já tenta de novo).

**Assumir sem responder:** abrir conversa com o agente → Assumir → estado "Em atendimento", agente para.

**Devolver ao agente:** conversa em atendimento → Devolver ao agente → confirma → estado "Com o agente".

**Encerrar:** → Encerrar conversa → confirma → sai das abas abertas. Se o cliente escrever de novo, volta
para o agente (regra do backend).

**Sem permissão / sem organização:** usuário logado sem vínculo vê tela explicando que precisa ser
convidado por um administrador.

## 4. Tokens

Três níveis: primitivos (paleta) → semânticos (intenção) → componentes. Implementados em
`src/styles/global.css` com `@theme` do Tailwind v4.

### Primitivos
| Token | HEX | Origem |
|---|---|---|
| green-50 | #ECFDF5 | fundo de item ativo, tags |
| green-100 | #D1FAE5 | |
| green-400 | #34D399 | verde claro do kit |
| green-500 | #10B981 | verde principal do kit |
| green-700 | #0F766E | verde escuro do kit |
| green-800 | #115E59 | hover do primário |
| navy-900 | #0F172A | azul escuro do kit |
| slate-700 | #334155 | cinza escuro |
| slate-500 | #64748B | |
| slate-400 | #94A3B8 | cinza médio |
| slate-200 | #E2E8F0 | cinza claro |
| slate-100 | #F1F5F9 | |
| slate-50 | #F8FAFC | fundo |
| amber-50/700 | #FFFBEB / #B45309 | atenção |
| red-50/700 | #FEF2F2 / #B91C1C | erro |
| blue-50/700 | #EFF6FF / #1D4ED8 | informação |

### Semânticos
| Token | Valor | Uso / contraste |
|---|---|---|
| primary | green-700 #0F766E | botão primário, links, item ativo. Branco sobre ele: 5,4:1 (AA) |
| primary-hover | green-800 | |
| accent | green-500 #10B981 | marca, indicadores, foco. **Nunca texto branco sobre ele** (2,5:1, reprova AA) |
| background | slate-50 | fundo da aplicação |
| surface | #FFFFFF | painéis, cards, cabeçalho |
| border | slate-200 | divisórias e contornos |
| text | navy-900 | texto principal (17:1) |
| text-secondary | slate-700 | (10:1) |
| text-muted | slate-500 | metadados, horários (4,8:1 sobre branco — AA) |
| success / warning / error / info | green-700 / amber-700 / red-700 / blue-700 sobre fundos -50 | tags e avisos, sempre com texto ou ícone além da cor |

Decisão: o Figma usa botão verde #10B981 com texto branco; isso reprova AA. O primário passa a ser o
verde escuro #0F766E (também do kit); o #10B981 fica para marca e destaques sem texto.

### Tipografia (Inter)
| Estilo | Tamanho / altura | Peso |
|---|---|---|
| H1 (título de página) | 24 / 32 | 600 |
| H2 (título de painel) | 18 / 28 | 600 |
| H3 | 16 / 24 | 600 |
| Body | 14 / 20 | 400 |
| Body small | 13 / 18 | 400 |
| Caption / label | 12 / 16 | 500 |

Ferramenta operacional: base 14px (densidade maior que o Figma, que usa 16 em títulos de card).

### Espaçamento, raio, elevação
Escala de 4: 4, 8, 12, 16, 24, 32, 48 (classes padrão do Tailwind, sem valores arbitrários).
Raio: sm 6px (tags, inputs), md 8px (botões, cards), lg 12px (balões, modais), full (avatar, badge).
Elevação: none (padrão — bordas fazem a separação); sm só em menus e popovers; md em modais.

## 5. Responsividade

| Largura | Conversas | Navegação |
|---|---|---|
| ≥ 1280 | lista (360) + conversa + painel do contato (320) | barra lateral fixa 240 |
| 1024–1279 | lista + conversa; painel do contato abre como gaveta | barra lateral fixa |
| 768–1023 | lista + conversa | barra lateral recolhida (só ícones) |
| < 768 | lista **ou** conversa (rota própria, botão voltar) | gaveta pelo botão de menu |

## 6. Componentes (MVP)

Navegação: Sidebar, Cabecalho (seletor de organização + menu do usuário).
Ações: Botao (primario, secundario, fantasma, perigo; tamanhos sm/md; estados default, hover, focus,
disabled, carregando).
Formulário: CampoTexto (label sempre visível, erro com texto), AreaTexto (compositor).
Feedback: Aviso (info/atenção/erro), EstadoVazio, Carregando (skeleton nas listas), Toast simples.
Dados: Avatar (iniciais), Etiqueta (tag de estado), Contador, ItemConversa, BalaoMensagem.
Sobreposição: Dialogo de confirmação, Gaveta (painel do contato em telas médias).

Estados obrigatórios: lista de conversas (carregando, vazia por aba, erro, resultados); conversa
(carregando, sem mensagens, erro, enviando, falha de envio); compositor (vazio → botão desabilitado,
enviando, erro).

## 7. Microcopy

Botões pela ação: "Assumir conversa", "Devolver ao agente", "Encerrar conversa", "Enviar".
Estados: "Com o agente", "Aguardando você", "Em atendimento · Ana", "Encerrada".
Aviso no compositor quando a conversa está com o agente: "Ao enviar, você assume a conversa e o
agente para de responder."
Erro de envio: "Não enviada: <motivo>. O sistema tenta de novo automaticamente."
