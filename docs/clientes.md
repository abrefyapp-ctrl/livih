# Cadastro de clientes (proposto em 22/10)

Hoje o "cliente" é o contato do WhatsApp: telefone, nome, um texto `empresa`, e-mail e `dados` livres. Não há CNPJ
ou CPF, inscrição estadual nem endereço. O orçamento em PDF mostra só nome, empresa (texto), telefone e e-mail, e a
NF-e (roadmap, item 5) vai precisar do cadastro fiscal.

**Cliente** é quem compra: uma empresa (CNPJ) ou uma pessoa (CPF). **Contato** é quem fala no WhatsApp (comprador,
financeiro, dono). Um cliente tem vários contatos; um contato é de no máximo um cliente.

## Decisões de 22/10

| Pergunta | Decisão |
|---|---|
| Contato em mais de um cliente? | Não: um cliente só (`contatos.cliente_id`) |
| Para quais empresas? | Todas, com ou sem o módulo de pedidos |
| Primeira entrega | Cadastro + vínculo nos dois sentidos, cliente no pedido e no orçamento, busca pelo CNPJ, importar planilha |
| Agente | Só lê o cliente do contato; não cria nem edita (mudou em 26/10: com a opção ligada, identifica pelo CNPJ/CPF, liga e cadastra; [agente-identificar-cliente.md](agente-identificar-cliente.md)) |

## Decisões de 23/10

| Pergunta | Decisão |
|---|---|
| Quem vê todos os clientes? | Uma permissão por pessoa da equipe, **"Vê todos os clientes"** (pensada para o PDV/balcão, mas genérica: serve para financeiro, faturamento). Desligada por padrão; dono e admin ligam em Configurações → Equipe |
| Até onde vai o "ver todos"? | Cadastro do cliente, nome e telefone dos contatos dele, criar pedido para qualquer cliente e corrigir o cadastro. **Não** inclui conversas, oportunidades e notas, nem trocar o vendedor responsável |
| Ordens de serviço | Entram nesta etapa: a OS ganha o cliente (o piloto atende empresas que não são contato de WhatsApp) |
| Ordem | Antes de importar a planilha do piloto das OS, para as OS já entrarem ligadas ao cliente |

## Dados (1 migration)

**Tabela `clientes`:**

| Campo | Para quê |
|---|---|
| `tipo` | `pj` ou `pf` |
| `nome` | Como a equipe chama: nome fantasia (PJ) ou nome da pessoa (PF). Obrigatório |
| `razao_social` | PJ: o nome do CNPJ, que vai no orçamento e na nota |
| `documento` | CNPJ ou CPF, só números, validado (`cnpj_valido`, que já existe, e um `cpf_valido` novo). Único por empresa quando preenchido |
| `inscricao_estadual` | PJ, ou "ISENTO" |
| `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf` | Endereço de faturamento |
| `email`, `telefone` | Contato geral da empresa (e-mail de nota, telefone fixo). Os celulares ficam nos contatos |
| `responsavel_id` | Vendedor da carteira |
| `observacoes` | Texto livre (condição combinada, horário de entrega…) |
| `ativo` | Inativar sem apagar |
| `criado_por`, `criado_em`, `atualizado_em` | Auditoria |

**Ligações:**
- `contatos.cliente_id`: o contato pertence a um cliente. FK composta com `org_id`, como no resto. Ao apagar o cliente, vira null.
- `pedidos.cliente_id`: de quem é o pedido. Ao criar o pedido, vem do cliente do contato e pode ser trocado na tela.
- O campo texto `contatos.empresa` continua existindo. Ao criar o cliente a partir de um contato, ele vira o nome
  sugerido. Na lista de contatos, com cliente ligado, aparece o nome do cliente.

- `ordens_servico.cliente_id`: de quem é a OS. Escolher o contato preenche o cliente dele; dá para escolher só o
  cliente (empresa sem WhatsApp no Livih). `cliente_nome` continua como o nome mostrado e passa a vir do cliente.
- `os_prazos_cliente` passa a ser por **cliente** (hoje é por contato): o prazo de pagamento é da empresa que paga.

**Permissão "Vê todos os clientes":** coluna `membros_org.ve_todos_clientes` (boolean, padrão false). Só dono e
admin mudam (pela função que já altera papel e status do membro, com auditoria).

**Acesso (RLS):**
- Cliente visível (`pode_ver_cliente`) para:
  - dono e admin;
  - quem tem "Vê todos os clientes";
  - o vendedor: clientes da carteira dele, os que têm algum contato que ele vê e os que não têm responsável.
- Toda a equipe cadastra e edita os clientes que vê. Trocar o `responsavel_id` (a carteira) e apagar: só dono e admin.
- **Contatos com "ver todos":** uma política a mais em `contatos` (select) libera os contatos ligados a um cliente.
  `pode_ver_contato` **não muda**: é dela que dependem conversas, oportunidades, histórico do funil e notas, que
  continuam só na carteira.
- **Pedidos com "ver todos":** `pode_ver_pedido` passa a aceitar também pedido com `cliente_id` de um cliente
  visível, para o balcão vender para qualquer cliente.
- A plataforma também acessa, no modo suporte.
- Testes no `teste_fase1.sql`: isolamento por empresa, carteira, "ver todos" (vê o cliente e o contato, **não** vê a
  conversa nem a oportunidade, não troca o responsável) e documento repetido.

## Telas

1. **Menu → Clientes** (todas as empresas, logo abaixo de Contatos):
   - Lista com busca por nome, razão social, CNPJ/CPF ou cidade.
   - Colunas: cliente, documento, cidade/UF, número de contatos, último pedido.
   - Botões **Novo cliente** e **Importar planilha**.
2. **Perfil do cliente** (`/clientes/:id`), no mesmo formato do perfil do contato:
   - **Dados cadastrais:** edição com busca pelo CNPJ.
   - **Contatos:**
     - os contatos ligados, com link para cada um;
     - **Ligar contato**, que busca entre os contatos existentes;
     - **Novo contato**, que cria o contato já ligado;
     - **Tirar** o vínculo.
   - **Pedidos e orçamentos** (com o módulo de pedidos): os pedidos do cliente.
   - **Oportunidades e conversas:** as dos contatos ligados.
3. **Perfil do contato e painel da conversa:**
   - um bloco **Cliente** com o nome, o documento, a cidade e um link para o perfil;
   - sem cliente ligado: **Ligar a cliente** (busca) ou **Criar cliente**, já com o texto de `empresa` e o e-mail do contato.
4. **Formulário do cliente** (modal, usado na lista, no perfil e a partir do contato):
   - escolha de PJ ou PF;
   - **busca pelo CNPJ:** digitou um CNPJ válido, o Livih consulta a BrasilAPI e preenche razão social, nome fantasia, endereço e CEP, que você confere antes de salvar;
   - **busca pelo CEP** (BrasilAPI) para PF, ou quando o endereço não veio.
5. **Pedido:**
   - o campo **Cliente** aparece no detalhe do pedido;
   - escolher o contato preenche o cliente dele;
   - o PDF do orçamento mostra razão social, CNPJ/CPF, inscrição estadual e endereço quando o pedido tem cliente;
   - sem cliente, continua como hoje.
6. **Configurações → Equipe:** a chave "Vê todos os clientes" em cada membro (só dono e admin veem e mudam), com a
   explicação do que ela libera e do que não libera.
7. **Ordens de serviço:**
   - a Nova OS escolhe o cliente (ou o contato, que traz o cliente dele);
   - a ficha da OS mostra o cliente com link para o perfil;
   - o PDF da OS mostra razão social, CNPJ/CPF, inscrição estadual e endereço;
   - o perfil do cliente lista as OS (com o módulo ligado);
   - os prazos de pagamento por cliente (Configurações → Ordens de serviço) passam a escolher o cliente;
   - a importação de planilha das OS liga cada linha ao cliente pelo nome ou pelo documento, e cria o que faltar.
8. **Importar planilha** (Clientes → Importar), no padrão da importação de produtos:
   - CSV ou Excel, com colunas reconhecidas por variação de nome (CNPJ, CPF, Razão social, Fantasia, Cidade, UF, CEP, E-mail, Telefone…);
   - prévia antes de gravar;
   - **atualiza pelo documento** e só mexe no que veio preenchido;
   - cria o resto;
   - se a linha trouxer celular, liga ao contato com esse telefone (ou cria o contato).

## Agente (n8n)

- `agente_contexto` passa a mandar o **cliente** do contato: nome, razão social, cidade/UF e se tem documento.
- O agente usa isso para tratar pelo nome da empresa e saber que o orçamento sai no nome dela.
- O pedido montado pelo agente (`agente_montar_pedido`) já leva o `cliente_id` do contato.
- O agente não cria nem edita clientes. Desde 26/10, com a opção "Identificar o cliente antes do orçamento", ele liga o
  contato ao cliente pelo CNPJ/CPF e cadastra o cliente novo ([agente-identificar-cliente.md](agente-identificar-cliente.md)).
- Mudança no `gerar_workflow.py` (texto do contexto) e reimportação no n8n, como na identificação pela foto.

## Busca pelo CNPJ e pelo CEP

- **Serviço:** BrasilAPI (`/api/cnpj/v1/{cnpj}` e `/api/cep/v2/{cep}`), gratuita e sem chave, chamada direto do
  navegador.
- **Se a BrasilAPI cair:** o formulário continua manual, com um aviso.
- **O que não vem da busca:** a inscrição estadual (a BrasilAPI não traz). Fica para preencher à mão.

## Entregas

1. **Banco:** migration com `clientes`, as ligações (contatos, pedidos, OS), a permissão "Vê todos os
   clientes", a RLS e o contexto do agente. Mais os testes. Depois, `npm run tipos`.
   Feita em 24/10 (`20261024120000_clientes.sql`, 20 testes "clientes"). Os prazos de pagamento por cliente
   (`os_prazos_cliente`) foram para a entrega 3, junto com as funções da OS que os usam.
2. **Clientes:**
   - lista, perfil e formulário com busca pelo CNPJ/CEP;
   - o bloco Cliente no contato e na conversa;
   - o cliente no pedido e no PDF;
   - a chave "Vê todos os clientes" na Equipe.

   Feita em 24/10, com a migration `20261024130000_clientes_pedido.sql` (cliente do pedido só muda no rascunho, ligar
   o contato preenche os rascunhos dele, `fiscal` no `agente_dados_orcamento`). O PDF do agente só mostra o cadastro
   depois de reimportar o `livih-agente.json` e reconstruir o serviço livih-pdf na VPS (junto com a entrega 5).
3. **OS:** cliente na OS, no PDF, nos prazos e na importação.
   Feita em 24/10 (`20261024140000_clientes_os.sql`): `os_prazos_cliente` por cliente (estava vazia), `os_prazo_cliente`,
   `os_faturar` e `os_previsao_itens` pelo cliente da OS, `os_importar` acha o cliente (id, CNPJ/CPF, contato, nome
   ou razão social) e cria o que falta. A planilha da OS ganhou a coluna CNPJ/CPF; a Nova OS escolhe o cliente (o
   contato vira "A/C"); o PDF da OS e o do orçamento usam o mesmo bloco de cliente (`ClientePdf`).
4. **Importação** de planilha de clientes.
   Feita em 24/10 (`20261024150000_clientes_importar.sql`, `clientes_importar`; tela em Clientes → Importar planilha,
   dono e admin). CSV com colunas reconhecidas pelo nome; acha pelo CNPJ/CPF (sem documento, pelo nome, se houver um
   só), atualiza só o que veio preenchido, cria sem vendedor responsável e liga o celular ao contato (ou cria o
   contato). Documento, CEP, UF ou celular inválidos não derrubam a linha: voltam como aviso.
5. **n8n:** texto do contexto do agente.
   Feita em 25/10: linha "Cliente (cadastro)" em "O que já sabemos deste contato" e a instrução "Empresa do cliente"
   (orçamento no nome dela, não pedir o que já está no cadastro, mudança de cadastro vai para a equipe), no agente e
   no simulador. O PDF do agente recebe `fiscal` (n8n) e o serviço livih-pdf desenha o bloco de cliente novo
   (`dist/entrada.js` reconstruído). Vai ao ar reimportando os dois workflows e reconstruindo o livih-pdf na VPS.

Esforço estimado: 2 a 3 dias, mais meio dia para a OS.

Cada entrega vai ao ar separada (migration → funções/front → n8n), com os testes em `begin … rollback` antes.

## Fora desta etapa

- Mais de um endereço por cliente (entrega/cobrança).
- Tabela de preço por cliente.
- Limite de crédito.
- O agente coletando CNPJ e endereço.
- Mesclar clientes duplicados.
- O PDV em si. Quando ele vier, provavelmente com permissões próprias (abrir caixa, desconto, cancelar venda), pode
  valer um papel "balcão" que já liga "Vê todos os clientes".
