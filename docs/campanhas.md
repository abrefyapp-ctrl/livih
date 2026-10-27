# Campanhas de divulgação

Pedido de 26/10, depois da aprovação da Livih pela Meta (API oficial liberada para todas as empresas). Dono e admin
mandam um modelo de Marketing aprovado para uma parte dos contatos. As respostas caem nas conversas, e o agente atende.

## Decisões

- **Só número da API oficial.** Disparo em massa por número conectado pelo celular (QR code) é o que mais leva a
  banimento. A tela só oferece números da API oficial, e o banco recusa os outros.
- **Só modelo de Marketing aprovado**, sem imagem, vídeo ou documento no cabeçalho e sem variável no cabeçalho (o envio
  da Livih manda só as variáveis do corpo). A Meta cobra da empresa cada mensagem entregue, na conta do WhatsApp dela.
- **Consentimento:** a pessoa confirma, a cada campanha, que os contatos autorizaram receber mensagens. A Livih não
  guarda um opt-in por contato; guarda o contrário, o **descadastro** (`contatos.descadastrado_em`).
- **Descadastro:** quem responde só "SAIR" (ou "parar", "pare", "stop", "cancelar", "descadastrar", "remover", "não
  quero receber") até 30 dias depois de uma campanha sai de todas as campanhas da empresa, e a equipe vê um aviso na
  conversa. A equipe também marca ou desmarca "Não receber campanhas" no contato.
- **Quem:** dono e admin criam, pausam, retomam e cancelam. O atendente não vê a área.

## Como funciona

1. **Público** (filtros sobre os contatos, todos opcionais): etiquetas (qualquer uma), oportunidade aberta em certas
   etapas do funil, carteira de certos vendedores, ligado ou não a um cliente do cadastro, sem conversa há N dias. Ficam
   de fora contatos sem telefone válido e os descadastrados. A tela mostra quantos e alguns nomes.
2. **Mensagem:** o modelo e, para cada variável do corpo, de onde vem o valor: nome do contato, empresa do contato
   (cliente do cadastro, ou o campo empresa) ou texto fixo. Prévia com um contato de exemplo.
3. **Envio:** agora ou agendado, com limite por dia no número (padrão 250). Ao criar, a lista de destinatários é tirada
   na hora e não muda depois.
4. **O cron** (`campanhas_liberar`, a cada minuto) libera até 20 por minuto por campanha, respeitando o limite do dia
   do número (somando as campanhas dele, no fuso de Brasília). Cada mensagem entra na conversa do contato naquele número
   (criada se não existir, com o agente) e vai pela fila de envio de sempre. Número desligado ou fora da API oficial:
   a campanha pausa.
5. **Resultado** por campanha: enviadas, entregues, lidas, respostas (mensagem do contato até 7 dias depois), orçamentos
   (pedido do contato até 7 dias depois) e quantos não foram entregues. A lista se atualiza sozinha enquanto envia.

## Técnico

- **Migration `20261027120000_campanhas.sql`:**
  - `contatos.descadastrado_em`;
  - tabelas `campanhas` e `campanha_destinatarios`, que só dono e admin leem; a gravação é só pelas funções;
  - funções `campanha_elegiveis`, `campanha_publico`, `campanha_etiquetas`, `campanha_criar`, `campanha_acao`,
    `campanha_parametros`, `campanhas_liberar` e `campanhas_resumo`;
  - gatilho `campanha_mensagem_recebida` (resposta e descadastro) e o cron `livih-campanhas`.
- A mensagem guarda em `modelo` o nome, o idioma, os parâmetros e o `campanha_id`. O texto no histórico é o que o
  cliente leu, com as variáveis preenchidas.
- **Tela:** menu Vendas → Campanhas (`src/pages/Campanhas.tsx`, `ModalNovaCampanha.tsx`, `services/campanhas.ts`), e a
  opção "Não receber campanhas" no contato.
- **Testes** (`teste_fase1.sql`, bloco "campanhas"): público, consentimento, só API oficial, variáveis, destinatários,
  atendente sem acesso, envio até o limite do dia, texto e variáveis, SAIR, conclusão, resumo, pausar e cancelar.

## Depois

- O agente saber que a conversa veio de uma campanha (hoje ele vê a mensagem da campanha no histórico).
- Responder "SAIR" com uma confirmação automática.
- Campanha para os clientes do cadastro sem WhatsApp ligado (precisa de celular no cadastro do cliente).
- Modelo com imagem no cabeçalho.
- Custo estimado em reais antes de enviar (tabela da Meta por país e categoria).
