# Biblioteca de documentos (item 5, parte 1)

Aprovado e implementado em 16/10 (migration `20261016150000_documentos.sql`). Decisões do usuário: cadastro em
Configurações → Documentos, só dono/admin cadastram, a equipe envia pela conversa já nesta parte. Contexto e as outras partes (catálogo de fornecedor compartilhado,
importador da PACAR, tabela de peças): [roadmap.md](roadmap.md#biblioteca-de-documentos-e-catálogo-de-fornecedor-proposto-em-1610).

## Objetivo

A empresa cadastra os arquivos que costuma mandar (vista explodida, manual, catálogo, ficha técnica, tabela,
preparo de exame...). O agente e a equipe enviam esses arquivos na conversa.

O agente só envia o que está cadastrado. Fora da biblioteca, ele continua chamando a equipe. Fecha os casos Wyllis
(15/10) e Mundo Dos Compressores (16/10).

Serve para qualquer cliente: não depende do módulo de pedidos. A ligação com Produtos é opcional.

## Dados (1 migration)

**Bucket `documentos`:**
- Privado, até 50 MB por arquivo (o mesmo limite do `midias`).
- Aceita PDF, JPG, PNG, WebP e MP4.
- Caminho: `org_id/documento_id/nome`.

**Tabela `documentos`:**

| Campo | Para quê |
|---|---|
| `titulo` | O que o cliente pede: "Vista explodida — grampeador 80/W-LS" |
| `tipo` | Texto livre com sugestões dos tipos já usados na empresa (vista explodida, manual, catálogo...). É o "tipo configurável por empresa", sem tela extra |
| `descricao` | Quando usar, para o agente e a equipe acharem ("peças numeradas com código para pedir reposição") |
| `palavras_chave` | Apelidos e referências: "80W, 80 W, PACAR 80" |
| `path`, `nome_arquivo`, `mime`, `tamanho` | O arquivo |
| `ativo` | Desativar sem apagar |
| `origem` | `empresa` agora. Na parte 2, o catálogo do fornecedor entra sem mudar o que existe |
| `fonte_url` | De onde veio (ex.: site do fabricante), para conferir se está atualizado |
| `criado_por`, `criado_em`, `atualizado_em` | Auditoria |

**Tabela `documentos_produtos`:** liga o documento a um ou mais produtos (n:n). A mesma vista explodida serve ao
80/W-LS e ao 80/W-LS PACARELAS.

**Acesso (RLS):**
- Toda a equipe da empresa vê e envia.
- Dono e admin cadastram, editam e desativam.
- A plataforma também, no modo suporte.
- Isolamento por empresa, como no resto da Livih, com testes no `teste_fase1.sql`.

## Telas

1. **Configurações → Documentos** (dono e admin): lista com busca e filtro por tipo, e o formulário com o arquivo e
   os campos acima. Os produtos são escolhidos por busca, quando a empresa usa Produtos. Existe em todos os planos.
2. **Na conversa, botão de anexar → "Da biblioteca"** (toda a equipe): busca, escolhe e envia. O atendente para de
   procurar o PDF no computador.
3. **Produtos** (quando o módulo está ligado): cada produto mostra os documentos ligados, com link para a biblioteca.

## Agente

Duas ferramentas novas no n8n:
- **`buscar_documentos(busca)`:** devolve até 5 documentos (id, título, tipo, produtos ligados). Busca no título,
  tipo, descrição, palavras-chave e no nome e código dos produtos ligados, com a mesma lógica do `buscar_produtos`
  (sem acento, palavras raras pesam mais).
- **`enviar_documento(id)`:** envia um documento da lista ao cliente.
  1. Função no banco valida tudo: o documento é da empresa da conversa, está ativo e a conversa está com o agente.
  2. O n8n copia o arquivo de `documentos` para `midias/org/conversa/...`, uma cópia por envio. Isso mantém o
     histórico imutável: o que o cliente recebeu continua igual mesmo se o documento for trocado depois.
  3. Entra na fila de envio pela `agente_enviar_arquivo` que o orçamento já usa.
  4. Se o mesmo documento já foi enviado na conversa nas últimas 24 h, a função não reenvia e avisa o agente, que
     aponta a mensagem anterior. O reenvio só acontece se o cliente disser que não recebeu.
  5. Limite de 3 documentos por resposta, para o agente não despejar o catálogo inteiro.

Regras do prompt (troca a regra de hoje, "o ÚNICO arquivo que você envia é o PDF do orçamento"):
- Você envia o PDF do orçamento e os documentos da biblioteca.
- Quando o cliente pedir um arquivo, busque com `buscar_documentos`. Se vierem vários, pergunte qual. Se não vier
  nenhum, diga que a equipe envia e chame `chamar_humano`.
- Só diga que enviou quando a ferramenta devolver `enviado: true` naquela resposta (mantém a regra de hoje).

**Custo:** as duas ferramentas somam ~1,5 mil caracteres por leitura, para todas as empresas (o workflow é um só).
A parte fixa da Saúde do agente passa de 10 para ~11,5 mil.

## Fora da parte 1

- Catálogo de fornecedor compartilhado (parte 2).
- Importador da PACAR (parte 2). Até lá, a JoGrampo sobe as vistas explodidas à mão, começando pelos grampeadores
  mais pedidos.
- Tabela de peças extraída da vista explodida (parte 3).
- Ler o conteúdo do documento para responder perguntas: o agente envia, não lê.

## Como testar

- **SQL:**
  - outra empresa não vê nem envia;
  - atendente não cadastra;
  - documento inativo não sai;
  - a conversa com a equipe bloqueia o agente;
  - reenvio em 24 h é recusado;
  - a busca acha por código do produto e por palavra-chave.
- **n8n:** chamar as duas ferramentas numa conversa de teste e conferir:
  - a cópia em `midias`;
  - a mensagem na fila;
  - o arquivo chegando no WhatsApp e abrindo.
- **Conversa real de teste:** "me manda a vista explodida do 80W" → o agente busca, envia e confirma em uma frase.
  "e do 14/45?", sem cadastro → o agente chama a equipe sem prometer nada.

Esforço estimado: 2 dias, contando testes.
