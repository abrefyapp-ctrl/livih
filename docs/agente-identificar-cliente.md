# O agente identifica o cliente antes do orçamento

Pedido do Eduardo (JoGrampo) em 26/10. A JoGrampo importou ~1.250 clientes, quase todos com CNPJ ou CPF, e só 31 têm
um WhatsApp ligado. O agente aproveita esse cadastro: antes do orçamento, identifica o cliente pelo documento, liga o
WhatsApp a ele ou cadastra o cliente novo. Assim os números vão sendo completados aos poucos e não há duplicados.

Muda a decisão de 23/10 em [clientes.md](clientes.md) ("o agente só lê o cliente do contato").

## Decisões (26/10, usuário)

- **CNPJ achado: liga sozinho**, sem esperar a equipe, mesmo se o cliente já tiver outros contatos. A equipe vê o
  aviso na conversa.
- **CNPJ novo: dados da Receita (BrasilAPI).** O agente confirma a razão social com o cliente. Se a consulta falhar,
  pede a razão social.
- **Opção por empresa**, em Configurações → Agente: "Identificar o cliente antes do orçamento". Ligada na JoGrampo.

## Fluxo

1. O cliente pede o orçamento. Contato já ligado a um cliente: segue como antes.
2. Sem cliente: `montar_pedido` recusa e devolve `identificar_cliente: true`. O agente pede o CNPJ ou o CPF.
3. `identificar_cliente(documento, nome?)`:
   - dígitos verificadores errados: pede de novo;
   - **CNPJ que existe:** liga o contato e devolve só a razão social;
   - **CPF que existe:** liga só se o nome informado bater com o do cadastro (primeiro e último nome, sem acento e sem
     "da/de/do"). Sem nome, pede o nome; nome diferente, não liga e chama a equipe. Confirmar de quem é um CPF vazaria
     dado pessoal, por isso o nome do cadastro nunca volta para o agente;
   - **não existe:** com CNPJ, o n8n consulta a Receita e devolve a razão social para o agente confirmar; com CPF, o
     agente pede o nome completo.
4. `cadastrar_cliente(documento, nome?)` cria o cliente (com CNPJ, com nome fantasia, razão social e endereço da
   Receita) e liga o contato. Se o documento já existir, segue o caminho da identificação, sem duplicar.
5. O agente monta o orçamento de novo, já no nome do cliente.

Cada ligação ou cadastro vira um aviso na conversa, só para a equipe: "O agente ligou este contato ao cliente X (CNPJ
...), pelo CNPJ. Se estiver errado, desfaça no perfil do contato." ou "O agente cadastrou o cliente Y...".

## Proteções

- A trava fica no banco (`agente_montar_pedido`), não só nas instruções: com a opção ligada, o agente não consegue
  montar orçamento para contato sem cliente.
- Contato já ligado a outro cliente que informa outro documento: o agente não troca, avisa e chama a equipe (ex.: o
  comprador que atende duas empresas).
- A carteira do cliente que já existe não muda. O cliente novo fica com quem atende a conversa (ou o responsável pelo
  contato).
- Opção desligada: as duas funções recusam e a montagem não pede identificação. O agente guarda o CNPJ no contato,
  como antes.
- Só `service_role` executa as funções.

## Técnico

- **Migration `20261026130000_agente_identificar_cliente.sql`:**
  - `agentes.identificar_cliente` (o `agentes_sincronizar` leva às outras linhas da empresa);
  - `agente_identificar_cliente`, `agente_cadastrar_cliente` e `simulador_identificar_cliente`;
  - `agente_montar_pedido` vira uma verificação na frente do corpo antigo, renomeado para `agente_montar_pedido_itens`;
  - auxiliares `nomes_conferem`, `documento_cliente` e `formatar_documento`.
- **n8n (`gerar_workflow.py`):** ferramentas `identificar_cliente` e `cadastrar_cliente`, com a consulta à BrasilAPI
  no código da ferramenta (`https://brasilapi.com.br/api/cnpj/v1/<cnpj>`, 15 s). Instruções do agente: quando pedir o
  documento, o que dizer e o que nunca dizer. No simulador, a identificação é só leitura e o cadastro é simulado.
- **Tela:** a opção em Configurações → Agente, só para empresa com pedidos (ERP).
- **Testes** (`teste_fase1.sql`, bloco "identificar"): trava no orçamento, dígito errado, ligar por CNPJ, já
  identificado, não trocar de cliente, CPF sem nome, com nome errado e com nome certo, CNPJ novo com e sem a
  Receita, sem duplicar, opção desligada e usuário logado sem acesso.

## Para ligar na JoGrampo

1. `npx supabase db push`, `npm run tipos`, publicar o site.
2. Importar `n8n/livih-agente.json` e `n8n/livih-simulador.json` no n8n (mesmo procedimento da consulta de OS).
3. Configurações → Agente da JoGrampo: marcar "Identificar o cliente antes do orçamento".
4. Teste pelo celular com um contato sem cliente: CNPJ que existe, CNPJ novo e CPF.
