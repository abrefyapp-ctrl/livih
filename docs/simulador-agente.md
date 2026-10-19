# Simulador de conversa (item 6, peça 3 do Orientador)

Feito em 19/10. Contexto: [roadmap.md](roadmap.md).

## Para quê

Testar o agente sem mandar mensagem pelo celular. Antes, toda mudança de instruções, como a regra de envio de
arquivo de 16/10, era testada direto com cliente real. É também a base do assistente orientador (peça 4), que vai
precisar testar o agente antes de sugerir mudanças.

## Como funciona

- **Onde:** Configurações → Agente → **Testar agente**. Só dono, admin e a plataforma (modo suporte).
- **Conversa só na tela:** a conversa de teste fica só no navegador e vai inteira a cada pergunta. Nada vai para o
  WhatsApp nem para o histórico.
- **Antes de salvar:** com o formulário alterado, dá para testar as instruções e as regras antes de salvar (caixa
  "Testar com as alterações ainda não salvas").
- **Leituras reais:** prompt, base, horário, saudação, produtos e documentos são os de verdade.
- **Gravações simuladas:** contato, oportunidade, etapa, nota, orçamento (preço calculado do cadastro, sem gravar),
  envio de PDF e documento, e chamar a equipe só aparecem como "faria", embaixo da resposta.
- **Limite:** 200 respostas de teste por empresa em 24 h (`simulador_registrar`). Cada teste custa IA de verdade.
- **Consumo:** o coletor da VPS grava em `uso_ia` com tipo `simulador`, fora da contagem de respostas ao cliente.

## Peças

- **Workflow `LvhSimuladorAg01`** (`n8n/livih-simulador.json`): gerado pelo mesmo `n8n/gerar_workflow.py` do
  agente.
  - O nó Contexto é o do agente com 3 trocas: contexto montado das mensagens da tela, saudação devolvida em vez de
    enviada, e retorno.
  - As ferramentas têm o mesmo nome, descrição e esquema das do agente.
  - Se o Contexto do agente mudar ou surgir uma ferramenta nova sem versão no simulador, o gerador falha de
    propósito.
  - O webhook é síncrono e não tem a espera de 6 s.
- **Edge Function `agente-simular`:**
  - Confere o login e o papel, aplica o limite e limpa as mensagens (últimas 40, a última do cliente).
  - Chama o webhook com o mesmo token do agente.
- **Migration `20261019120000_simulador_agente.sql`:**
  - `buscar_produtos_org` e `buscar_documentos_org` recebem o corpo das buscas, e as do agente passam a chamá-las.
  - Funções novas: `agente_contexto_simulado`, `simulador_montar_pedido`, `simulador_documento`.
  - Limite de uso e tipo `simulador` em `uso_ia`.
- **Tela:** `ModalSimulador` e `services/simulador.ts`. A tela traduz as ferramentas em frases ("Buscou produtos:
  “14/19” → 3 encontrados") e mostra o que elas devolveram, para conferir.

## Fora desta peça

Custo de cada resposta na tela: o n8n não devolve os tokens na resposta do webhook. O total aparece no consumo,
pelo coletor. Também ficam fora testar com áudio, imagem ou PDF do cliente e salvar conversas de teste.
