# CRM: acompanhamento de leads e follow-up do agente (proposto em 05/11)

Do [levantamento de 05/11](levantamento-funcionalidades.md): o acompanhamento do lead hoje é só a lista "sem
retorno" do Painel, que ninguém é avisado de olhar, e o lead que para de responder morre ali. A promessa do piloto é
justamente "acompanhar os leads". Esta rodada dá à equipe tarefas com lembrete, faz o agente retomar o cliente sozinho
e distribui as conversas do número da empresa.

## Decisões de 05/11 (usuário)

| Pergunta | Decisão |
|---|---|
| Quando o agente faz follow-up | Nos 4 casos: **orçamento sem resposta**, **cliente pediu para falar depois** ("me chama semana que vem"), **oportunidade parada** e **conversa da equipe parada** (o vendedor é avisado) |
| Fora das 24 h do WhatsApp | **API oficial:** modelo aprovado escolhido pela empresa (pago por ela à Meta). **WAHA:** o agente escreve a mensagem |
| Tentativas | **2** no mesmo assunto; sem resposta, vira tarefa para o vendedor decidir |
| Também nesta rodada | Tarefas com lembrete, distribuição automática, importar/exportar contatos e motivo de perda em lista |
| Fica para depois | Respostas rápidas |

## Entregas

Em ordem; cada uma com migration, testes no `teste_fase1.sql` e telas, e vai ao ar separada.

### 1. Tarefas com lembrete (base)

- Tabela `tarefas`: título, observação, quando (data e hora), responsável, ligada a um contato e, se houver, à
  oportunidade e à conversa; situação aberta, feita ou cancelada; lembrete com antecedência (como a agenda).
- **Quem executa:** uma pessoa da equipe ou **o agente**. As retomadas do agente (entrega 2) são tarefas do agente,
  na mesma lista: a equipe vê o que o agente vai fazer e pode cancelar ou adiar.
- **Telas:**
  - menu **Tarefas**: atrasadas, hoje, próximas e feitas, filtro por pessoa (dono e admin veem todos) e "Só as do
    agente";
  - **próximo passo** no cartão do funil (data e atraso em vermelho) e no detalhe da oportunidade;
  - tarefas no perfil do contato e no painel da conversa, com "Nova tarefa";
  - oportunidade aberta **sem próximo passo** ganha um alerta no cartão, e o funil tem o filtro "Sem próximo passo".
- **Lembrete:** a mesma rotina da agenda (celular e WhatsApp da pessoa), na hora da tarefa ou antes.
- **Quem vê:** a mesma carteira do contato (`pode_ver_contato`); a tarefa sem contato, só o responsável, quem criou,
  dono e admin.

**Construída em 05/11:** migration `20261105130000_tarefas.sql` (tabela `tarefas`, `tarefas_preparar`,
`pode_ver_tarefa`, `tarefas_lembretes` no cron `livih-tarefas-lembretes` a cada minuto) e 16 testes. No Painel, a
oportunidade com tarefa aberta no prazo sai da lista "sem retorno" (já tem próximo passo). Telas: menu Tarefas
([Tarefas.tsx](../src/pages/Tarefas.tsx): A fazer em atrasadas, hoje, próximos 7 dias e depois; Concluídas dos últimos
30 dias; filtro "Minhas", "Toda a equipe", "Retomadas do agente" ou uma pessoa), janela da tarefa com sugestões de
quando (hoje à tarde, amanhã, em 3 dias, segunda que vem) ([ModalTarefa.tsx](../src/components/ModalTarefa.tsx)), bloco
"Tarefas" no perfil do contato e no painel da conversa e "Próximo passo" no detalhe da oportunidade
([TarefasDoContato.tsx](../src/components/TarefasDoContato.tsx)), próximo passo e "Sem próximo passo" no cartão do
funil.

### 2. Follow-up do agente

**Configuração** (Configurações → Agente, "Retomar o cliente que parou de responder"), por empresa, desligada por
padrão:
- casos ligados (os 4), com o tempo de cada um: orçamento sem resposta (padrão 24 h), conversa parada (24 h),
  oportunidade parada (3 dias);
- intervalo da 2ª tentativa (padrão 2 dias depois da 1ª);
- só no horário de atendimento do agente;
- para o número da API oficial: o modelo aprovado usado fora das 24 h.

**Como funciona:**
1. Uma rotina a cada 5 minutos procura os casos e cria a tarefa do agente, uma por contato e assunto (não empilha):
   - **orçamento sem resposta:** o PDF do orçamento foi enviado (pelo agente ou pela equipe), o pedido ainda é
     rascunho e o cliente não escreveu depois;
   - **conversa parada:** a última mensagem é nossa (agente ou equipe), sem resposta do cliente. Na conversa com a
     equipe, o vendedor é avisado quando o agente retoma;
   - **oportunidade parada:** oportunidade aberta sem nenhuma mensagem há X dias;
   - **cliente pediu para depois:** ferramenta nova do agente, `agendar_retorno(data, assunto)`, quando o cliente
     diz "me chama semana que vem". A equipe também pode criar a tarefa "o agente retoma" à mão.
2. Na hora da tarefa (dentro do horário), uma **Edge Function** (`agente-followup`) lê a conversa, o assunto e as
   instruções da empresa e escreve **uma** mensagem curta de retomada, no tom do agente. Se não fizer sentido (o
   cliente encerrou, já comprou, pediu para não ser incomodado), responde que não vai mandar e a tarefa fecha como
   "não precisou". Não usa as ferramentas do atendimento: só escreve. O consumo entra em `uso_ia` (tipo "followup").
3. Fora das 24 h no número da API oficial: vai o modelo configurado, sem IA.
4. O cliente respondeu: as retomadas abertas daquele contato fecham ("respondeu") e a conversa segue normal (com o
   agente ou com a equipe, como estava).
5. Sem resposta à 1ª: a 2ª sai no intervalo configurado. Sem resposta à 2ª: a tarefa vai para o vendedor (responsável
   do contato ou da oportunidade), com aviso.

**Proteções:** não retoma contato descadastrado ("SAIR" das campanhas) nem marcado "sem agente"; no máximo uma
retomada por contato por dia; conversa com o agente pausado pela empresa não recebe; número desconectado adia. A
mensagem fica na conversa marcada como retomada do agente, para a equipe e o relatório saberem.

### 3. Distribuição automática

Vale para o **número da empresa** (sem vendedor responsável), onde hoje a conversa nova fica sem dono. Os números dos
vendedores já são de quem os tem.
- Opção por número: **sem distribuição** (como hoje), **rodízio** entre as pessoas marcadas ou **carteira primeiro**
  (contato com vendedor responsável vai para ele; sem, rodízio).
- Em Configurações → Equipe, a caixa "Recebe conversas" por pessoa.
- A conversa nova é atribuída na chegada (o agente continua atendendo, se estiver ligado). O contato sem carteira
  passa a ser da pessoa. Ela é avisada no celular; quando o agente chama a equipe, o aviso vai para ela.

### 4. Importar/exportar contatos e motivo de perda

- **Importar contatos** (dono e admin): CSV com nome, telefone, e-mail, empresa, etiquetas e o e-mail do vendedor
  responsável; atualiza pelo telefone, sem duplicar, com prévia e avisos (no padrão da importação de clientes).
- **Exportar** a lista de contatos (com os filtros da tela) e a das oportunidades para CSV que abre no Excel.
- **Motivo de perda em lista**, editável pela empresa (padrão: preço, prazo, escolheu outro fornecedor, sem
  resposta, desistiu da compra, outro), com o texto livre como detalhe; o Painel mostra as perdas por motivo.

## Esforço estimado

Entrega 1: 1,5 a 2 dias. Entrega 2: 2 a 3 dias. Entrega 3: 1 dia. Entrega 4: 1 dia.

## Em aberto

- Texto do aviso ao vendedor quando o agente retoma a conversa dele (proposta na entrega 2).
- O modelo de retomada da API oficial: a empresa precisa criar e aprovar na Meta (categoria Marketing ou Utilidade).
  Sugerir um texto pronto na tela de modelos.
- Retomada conta na franquia de atendimentos do plano? Proposta: conta como as outras respostas do agente (abre um
  atendimento de 24 h se não houver um aberto).
