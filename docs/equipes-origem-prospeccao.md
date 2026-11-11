# Equipes, origem do lead, status e prospecção (proposto em 10/11)

Da reunião com a CEFEQ em 10/11 (loja de ferramentas, Ponta Grossa e Castro): 25 vendedores, cada um com aparelho e
WhatsApp comercial da empresa, todos com o agente; 6 canais de venda (loja de Castro, matriz/balcão, loja Zerão,
vendas externas, televendas e e-commerce), 6 gestores, mais o número do site (marketing) e o do Google Ads. Uns 27
números numa empresa só.

O que a Livih já faz e foi mostrado: rodízio no número da empresa, histórico salvo mesmo se o vendedor apagar,
dono/admin ligando o agente, alerta ao chamar a equipe, campanhas pela API oficial. O que eles pediram e **não existe**
está abaixo. Fica de fora desta rodada o que depende do Sollus (ERP deles): orçamento e estoque no ERP e "o vendedor
que mais vendeu ao cliente" pelas notas. A Tray (e-commerce) também fica para depois.

## Entregas

Em ordem; cada uma com migration, testes no `teste_fase1.sql` e telas, e vai ao ar separada.

### 0. Antes de tudo: 27 números numa empresa

- **Capacidade:** conferir na VPS a licença do WAHA (o Core grátis roda uma sessão; a Livih já usa 3) e se o KVM 2
  (2 vCPU, 8 GB) aguenta ~30 sessões GOWS. Só com aprovação (VPS é produção).
- **Configuração do agente igual em todos os números:** ~~"Copiar para outros números"~~ não é preciso: a configuração
  já é uma só por empresa (o gatilho `agentes_sincronizar` copia cada alteração para as outras linhas). Mas o número
  novo nascia incompleto: o `whatsapp-conexao` copiava só instruções, regras, telefone de alerta e modelo, e a
  saudação, o horário, o aviso fora do horário e "identificar o cliente" ficavam vazios. Caso real: o número "João",
  criado na demonstração da CEFEQ. E a tela abre uma linha qualquer da empresa: salvar a partir da linha incompleta
  espalhava os campos vazios para todos.
  **Feito em 10/11:** migration `20261110200000_agente_numero_novo_herda.sql`, com o gatilho `agentes_herdar_empresa`
  (antes de inserir, copia a configuração completa de um agente da empresa, para qualquer caminho que crie o número) e
  o acerto das linhas já diferentes (só a CEFEQ; vale a mais completa). 5 testes. Não precisa publicar a Edge Function.
- **Plano sob medida:** acima de 5 números é "sob consulta", mas o limite de números e a franquia vêm da tabela
  `planos`, que aparece para todas as empresas. Falta um jeito de dar à CEFEQ 27 números e uma franquia própria sem
  criar um plano visível para os outros (decidir junto com a proposta).

### 1. Equipes e o papel gestor

Pedido: "o gerente ver só a equipe dele". Já estava no [levantamento](levantamento-funcionalidades.md) (item 10).

- Tabela `equipes` (nome: "Loja Castro", "Televendas"…) e `membros_org.equipe_id` (uma equipe por pessoa).
- Papel novo **gestor** no `papel_org`: vê e responde as conversas, contatos, funil, tarefas e pedidos **da equipe
  dele** (números e carteiras dos vendedores da equipe), vê o Painel da equipe e liga/desliga o agente dos números da
  equipe. Não mexe em configuração da empresa, cobrança, nem equipes.
- Onde muda a regra de ver: `pode_ver_canal` (número de vendedor da minha equipe) e `pode_ver_contato_linha` (contato
  na carteira de alguém da minha equipe); as funções de pedido, cliente, tarefa e agenda passam a usar a mesma regra.
  O Painel ganha o filtro por equipe (dono/admin) e o gestor já abre na dele.
- Tela: Configurações → Equipe, com as equipes, quem é de qual e o gestor de cada uma.
- Tamanho: médio (mexe na RLS de várias tabelas; muito teste de "quem vê o quê").

**Construída em 10/11** (com o Painel por equipe, decisão do usuário): migration `20261110210000_equipes_gestor.sql`.
- Gestor é **marcação no membro** (`membros_org.gestor`, com `equipe_id`), não papel novo: para a tela ele continua
  atendente, então não mexe em configuração nem cobrança sem precisar mudar as ~50 conferências de papel do front.
  (Valor novo no enum `papel_org` também não pode ser usado na mesma transação em que é criado, o que quebraria a
  bateria de testes.)
- Regra única `gestor_ve(org, pessoa)` nas 7 funções de "quem vê" e nas policies do funil. O vendedor desativado
  continua na equipe: o gestor segue vendo o histórico de quem saiu. Gestor desativado deixa de ver.
- `agente_ligar(canal, ativo)`: dono, admin ou o gestor da equipe do vendedor dono do número (o número da empresa,
  só dono e admin). A tela de WhatsApp usa esta função para todos.
- Painel: `painel_membros(org, vendedor, equipe)` devolve o conjunto de pessoas (nulo = empresa toda) e substitui o
  `painel_filtro_vendedor`; `painel_resumo`, `painel_pendencias` e `painel_perdas` ganharam `p_equipe`. O gestor abre
  já na equipe dele (`equipe_gestor` no resumo) e só filtra vendedores dela.
- Telas: Configurações → Equipe ([EquipesDeVenda.tsx](../src/components/EquipesDeVenda.tsx): criar, renomear e remover
  equipes; em cada pessoa, a equipe e "Gestor da equipe"), WhatsApp (o gestor liga/desliga o agente dos números da
  equipe; o texto do número diz que o gestor vê) e Painel (filtro "Equipe" para dono e admin; "Vendedor" para o
  gestor, só com a equipe dele).
- 32 testes (equipes, recusas, gestor vê/não vê, responde, liga o agente, painel, vendedor que saiu, gestor
  desativado, remover a equipe e os pontos da revisão do `revisor-banco`: o gestor só "enxerga" os atendentes da
  equipe, para dono e admin poderem estar numa equipe sem ficar sob o gestor; `agente_ligar` exige empresa ativa;
  tarefa criada por alguém da equipe; a lista "sem resposta" do Painel só traz conversa que a pessoa consegue abrir).
- Desempenho a medir com a CEFEQ ligada: `gestor_ve` roda por linha nas listas de contatos e do funil do atendente.
  Se pesar, trocar por uma lista calculada uma vez por consulta.
- Fica para depois: aviso no celular para o gestor quando uma conversa da equipe espera atendimento; filtros "Minhas /
  Toda a equipe" das telas de Tarefas e Conversas pensados para o gestor (hoje ele já vê as linhas da equipe, pela
  regra do banco).

### 2. Direcionar por equipe e por cidade

Pedido: "cliente de Castro ou Piraí vai para a loja de Castro"; os contatos do site vão para o televendas.

- **Rodízio por equipe:** o número da empresa que distribui (`canais.distribuir`) passa a ter a equipe que recebe
  (ex.: número do site → Televendas). Sem equipe, segue o rodízio de hoje entre todos.
- **Por cidade:** em Configurações → Equipe, as cidades de cada equipe (Castro, Piraí do Sul → Loja Castro). No número
  da empresa, com contato novo, o agente pergunta a cidade quando precisar e a distribuição usa a equipe da cidade;
  cidade sem equipe vai para a equipe padrão do número.
- Depende da entrega 1. Tamanho: médio.

### 3. Origem do lead e resultado

Pedido: saber de onde veio o contato (site, Google Ads, campanha, status) e se virou venda.

- `contatos.origem` e `oportunidades.origem` já existem (texto livre, quase nunca preenchidos). Passam a ser
  preenchidos sozinhos, e a conversa ganha `conversas.origem` (o mesmo contato pode voltar por outro caminho), gravada
  ao abrir a conversa:
  - pelo **número** (o número do Google Ads tem origem "Google Ads");
  - pela **mensagem pronta** do botão (regra "a primeira mensagem contém… → origem Site");
  - pela **campanha** (já sabemos quando o contato responde a uma);
  - **resposta a status** (entrega 4).
- Painel, bloco "Origem": por origem, contatos novos, tempo da primeira resposta, oportunidades, ganhas e valor, e
  "sem retorno". **"Venda" aqui é a oportunidade ganha** (ou o pedido confirmado na Livih); a venda real no Sollus fica
  para a integração.
- Tamanho: pequeno a médio.

**Construída em 11/11:** migration `20261111140000_origem_do_lead.sql`.
- **Ciclo:** a origem é gravada na primeira mensagem com o contato depois de 30 dias sem nenhuma, em qualquer número
  (a mesma régua dos contatos ativos). Cada ciclo é uma linha em `origem_ciclos`, que só recebe acréscimos: quem volta
  meses depois por outro caminho ganha um ciclo novo, e o Painel de um mês fechado não muda. O ciclo guarda a mensagem
  que o abriu; se ela deu erro de envio (a saída nasce "pendente" e vira "erro" depois), o Painel e a oportunidade a
  ignoram, e ela não segura o ciclo de quem chega depois.
- **De onde vem a origem**, nesta ordem: mensagem de campanha → "Campanha"; mensagem que a equipe mandou primeiro →
  "Prospecção ativa"; mensagem do contato com o texto de uma regra (a mensagem pronta do site ou do anúncio) → a origem
  da regra; a origem do número (`canais.origem`, ex.: o número do Google Ads); senão, "Direto no WhatsApp". Mensagem
  do agente ou automática não abre ciclo. Resposta a status fica para a entrega 4.
- **Contato e oportunidade:** o contato recebe a origem só quando ele escreveu primeiro (número ou regra) e não tinha
  uma de verdade (`'whatsapp'` e `'manual'` só diziam como foi criado). "Campanha" e "Prospecção ativa" ficam só no
  ciclo: dizem como a conversa começou, e nos primeiros 30 dias de um número marcariam a carteira antiga do vendedor.
  A oportunidade criada em até 30 dias do ciclo nasce com a origem dele.
- Nomes que a Livih usa ("Campanha", "Prospecção ativa", "Direto no WhatsApp", "whatsapp", "manual", "importacao")
  são recusados como origem configurada.
- Sem dados de antes: o Painel mostra "Medido desde DD/MM" (o primeiro ciclo da empresa).
- Revisão do `revisor-banco` (11/11) aplicada: tabela só de acréscimo no lugar de sobrescrever a conversa, mensagem
  com erro, contato só com origem de entrada, nomes reservados, índice do período e trava do contato na entrada (dois
  números ao mesmo tempo não abrem dois ciclos).
- **Configuração** (dono e admin), em Configurações → WhatsApp: "Origem dos contatos deste número" em cada número e
  "Origem pela mensagem pronta" (regras de texto, sem acento e sem diferenciar maiúsculas; o texto mais longo vence).
- **Painel**, bloco "De onde vêm os contatos": por origem, contatos que começaram no período, sem resposta e tempo de
  resposta (só dos que escreveram primeiro), oportunidades criadas, ganhas e valor ganho. Mesmos filtros do Painel.
- Para a CEFEQ: marcar a origem do número do site e do Google Ads **antes** de conectar os números; o que chegar
  antes fica sem origem.
- Para depois: o anúncio de clique para o WhatsApp da Meta manda a referência do anúncio no webhook (`referral`); dá
  para gravar a campanha do anúncio como origem sem regra de texto.
- 33 testes.

### 4. Status do WhatsApp

Pedidos: quantos contatos reagiram aos status de cada vendedor; o marketing postar o status de todos de uma vez.

- **Resposta ao status:** quem responde um status escrevendo chega hoje como uma conversa comum. O WAHA manda junto a
  referência ao status respondido (`contextInfo` com `status@broadcast`): gravar na mensagem "respondeu ao status" e
  qual, e a conversa ganha a origem "Status" (entrega 3).
- **Reação (emoji) ao status:** hoje o webhook só assina `message.any`, `message.ack` e `session.status`. Assinar
  `message.reaction` e **testar se a reação a status chega** pelo aparelho conectado; se não chegar, o relatório fica
  só com as respostas.
- **Relatório:** por vendedor e por dia, respostas (e reações, se chegarem) aos status, quantas viraram oportunidade.
- **Postar o status pela Livih (investigar):** o WAHA tem rotas de status (texto, imagem, vídeo). Se funcionar no GOWS,
  o marketing sobe a arte uma vez e a Livih posta nos números escolhidos. Risco de bloqueio a medir com poucos números
  antes; na reunião foi dito que não dá, então só oferecer depois do teste.
- Tamanho: pequeno para a resposta; o resto depende do teste.

### 5. Prospecção ativa no Painel

Pedido: quantos contatos cada vendedor fez no dia (ativo, não receptivo).

- **Contato ativo** = conversa que **começa com mensagem nossa** (pelo celular ou pela tela) para quem não falou com
  a empresa nos últimos 30 dias. Já está nos dados: a mensagem enviada pelo celular é gravada
  (`registrar_saida_celular`).
- Painel, por vendedor e por dia: contatos ativos, quantos responderam, quantos viraram oportunidade. Campanha conta à
  parte (já tem relatório próprio).
- Tamanho: pequeno.

**Construída em 11/11:** migration `20261111100000_painel_prospeccao.sql`, função `painel_prospeccao` (mesmos filtros
do Painel: número, equipe e vendedor, pelo `painel_membros`).
- Ativo = mensagem escrita por uma pessoa (não o agente, não automática, não de campanha, não com erro de envio) para
  um contato sem nenhuma mensagem com a empresa, em qualquer número, nos 30 dias anteriores (nota interna não conta).
  Rajada conta uma vez. Vendedor = autor da mensagem (tela) ou responsável pelo número (celular).
- Respondeu = o contato escreveu em até 7 dias; virou oportunidade = oportunidade criada em até 30 dias (com folga de
  1 hora antes, para quem abre o negócio e manda a mensagem logo depois).
- Painel, seção "Contatos ativos": no período, hoje, por dia, % que respondeu e % que virou oportunidade, comparado ao
  período anterior; tabela por vendedor (quem tem número, inclusive em zero; no filtro de número, só o dono dele; quem
  saiu aparece com o que fez); campanhas à parte (só para quem vê a empresa); aviso quando há mensagem de número sem
  responsável.
- Revisão do `revisor-banco` (11/11) aplicada: filtro de número na lista, quem saiu, erro de envio, campanha pelo
  `modelo.campanha_id` (sem ler a tabela de destinatários inteira), limites absolutos nas subconsultas, e o
  `painel_membros` deixando dono e admin fora da equipe do gestor (vale para o Painel todo, como o `gestor_ve`).
- Limites conhecidos:
  - nos primeiros 30 dias de um número na Livih não há o histórico de antes, então mensagem para cliente que já
    falava com o vendedor pelo celular conta como ativa (a tela avisa);
  - mensagem pelo celular vale para o responsável pelo número **hoje**: se o número passar para outro vendedor, o
    histórico do anterior vai junto (resolver gravando o responsável na mensagem, se incomodar);
  - "respondeu" conta qualquer resposta, inclusive a saudação automática do WhatsApp Business do cliente.
- 19 testes.

## Decisões de 10/11 (usuário)

| Pergunta | Decisão |
|---|---|
| Ordem | **0, depois 1** (copiar a configuração do agente; depois equipes e gestor) |
| Gestor mexe no agente da equipe? | **Só liga e desliga.** Instruções, horário e regras ficam com dono e admin, para os números não ficarem diferentes |
| Carteira | **A CEFEQ não trabalha com carteira.** O que eles querem é o agente encaminhar o cliente para o vendedor que **mais vendeu** para ele ou que **mais o atendeu**. Sem o Sollus, "mais atendeu" sai das conversas na Livih (últimos 90 dias) e "mais vendeu" das oportunidades ganhas e pedidos na Livih; com o Sollus, das notas. Entra na entrega 2 |
| Teste do status no WAHA | Depois; o agente do número "Teste CEFEQ" foi desligado pelo usuário em 10/11. **Avisar antes de testar**, para ele ligar |

## Perguntas em aberto (usuário)

| Pergunta | Opções |
|---|---|
| Uma pessoa em mais de uma equipe? | Uma só (mais simples) ou várias |
| Gestor liga/desliga o agente e mexe nas instruções dos números da equipe? | Só liga/desliga, ou também as instruções |
| Contato que escreve no número de um vendedor entra na carteira dele? | Hoje não: fica sem responsável, e o vendedor vê porque a conversa é no número dele. Com gestor por equipe e "quem mais atendeu", vale gravar o vendedor na carteira na primeira conversa |
| Cliente que fala com 2 vendedores: de quem é a carteira? | Quem falou primeiro, quem falou por último, ou o dono escolhe |
| "Vendedor que mais atendeu em 90 dias" com os dados da Livih, sem esperar o Sollus? | Sim, pela quantidade de conversas e pedidos na Livih; ou esperar o Sollus |
| Testar postar status pelo WAHA? | Sim, com o número de teste; ou deixar de fora |
| Ordem | Sugestão: 0 → 1 → 3 → 5 → 2 → 4 |
