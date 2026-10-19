# Assistente orientador (item 8, peça 4 do Orientador do agente)

Aprovado em 20/10. Contexto e as outras peças: [roadmap.md](roadmap.md).

Decisões do usuário (20/10):
- **Modelo:** gpt-5. Uso raro, e o texto que ele escreve vai para toda resposta do agente.
- **Quem usa:** dono, admin e a plataforma (modo suporte).
- **Planos:** todos.
- **Modos:** os dois juntos.

## Para quê

Quem escreve as instruções e a base do agente é o cliente, e o jeito natural de escrever sai caro e funciona pior.
Caso real, JoGrampo em 15/10: catálogo colado na base, conteúdo duplicado, separadores e uma regra de chamar a
equipe com 15 mil caracteres. O assistente escreve, ou reescreve, de forma enxuta, e o dono aprova.

## Para o usuário

Fica em Configurações → Agente → **Assistente**.

1. **Montar do zero** (empresa nova): uma entrevista, uma pergunta por vez. Os temas são o que vende e para quem,
   tom de voz, horário, pagamento, frete e prazos, o que o agente não pode prometer, quando chamar a equipe e as
   perguntas frequentes.
2. **Revisar o atual:** o assistente lê as instruções, as regras, a base e os alertas da Saúde do agente. Ele
   explica o que encontrou e propõe a versão enxuta. Dá para conversar e pedir ajustes.

**A proposta** vem por seção, com antes e depois e o porquê de cada uma:
- instruções;
- regras de chamar a equipe;
- cada conteúdo da base: criar, editar ou desativar;
- observações com caminho para resolver: "importe o catálogo X em Produtos → Importar com IA", "cadastre o
  manual em Documentos".

**Aplicar:**
- Antes de aplicar, dá para **testar a proposta no simulador**: instruções, regras e base propostas.
- O dono marca as seções que quer e aplica.
- Logo depois, dá para **desfazer**: a versão anterior fica guardada na sessão.
- **Nada é aplicado sem o dono mandar.**

## Por dentro

**Tabela `assistente_sessoes`:**
- empresa, quem abriu, modo;
- a conversa, a proposta atual, a foto do que havia antes de aplicar (para desfazer) e a situação (conversando,
  pensando, proposta, aplicada, desfeita).
- Só dono/admin leem. Quem grava a conversa é a Edge Function.

**Edge Function `agente-assistente`:**
- Recebe a mensagem do dono, guarda e responde em segundo plano. A tela acompanha a situação "pensando".
- Monta o contexto com as instruções, as regras, a base ativa e inativa (com id), os alertas da Saúde (calculados
  na tela), o nome da empresa e se ela usa Produtos e Documentos.
- O modelo devolve um formato fixo: a mensagem para o dono e, quando houver, a proposta.
- Consumo em `uso_ia` (tipo `assistente`), limitado a 60 respostas por dia por empresa.

**Aplicar e desfazer (`assistente_aplicar`, `assistente_desfazer`):**
- São funções do banco, chamadas com o login do dono/admin.
- Aplicam tudo de uma vez e guardam a foto do antes.
- Desfazer devolve instruções, regras e conteúdos editados, e apaga os criados.

**Simulador:** passa a aceitar também a base proposta (`p_base` no contexto simulado).

**Instruções do assistente** (o que já aprendemos):
- **Tamanhos-alvo:** instruções até ~8 mil caracteres, cada regra de chamar a equipe em uma frase, cada conteúdo da
  base até ~5 mil.
- **Nada de catálogo ou preços na base:** isso vai para Produtos, pelo importador.
- **Arquivos:** vão para a biblioteca de Documentos.
- **Não repetir o que o Livih já põe sozinho:** ferramentas, regra de envio de arquivo, horário, saudação e dados
  do contato.
- **Manter o jeito de falar da empresa** e não inventar política: o que não souber, pergunta ao dono.

## Teste com a JoGrampo (20/10)

Modo revisar, com o agente da JoGrampo como está hoje. A proposta foi só gerada, não aplicada, e as conversas de
teste foram apagadas.

- **Instruções:** de 17,6 mil para 3,9 mil caracteres.
- **Regras de chamar a equipe:** de 15 mil caracteres para 14 situações de uma linha.
- **Base:** um conteúdo novo, "Política de descontos".
- **Informação preservada:** os 28 números e condições do original (descontos 1,5% e 3,7%, prazos, valores)
  aparecem na proposta.
- **Primeira rodada:** a política de descontos ficou nas instruções e na base, e o "nunca aplicar 5,2%" virou só
  implícito. As regras "uma informação num lugar só" e "proibição fica explícita" entraram nas instruções do
  assistente, e a segunda rodada saiu certa.
- **Tempo e custo:** ~33 s e ~73 mil tokens de entrada e ~3 mil de saída no gpt-5, cerca de R$ 0,70 por resposta.

## Fora desta etapa

Aplicar sem aprovação, editar saudação e horário (já têm campos próprios) e assistente em outros pontos do app.
