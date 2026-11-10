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
