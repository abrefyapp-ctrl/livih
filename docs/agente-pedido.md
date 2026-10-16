# O agente monta e envia o orçamento

Item 2 dos próximos passos do [roadmap](roadmap.md). Plano combinado em 16/10.

## Decisões (16/10, usuário)

- **Depois de montar, o agente continua atendendo.** A equipe fica sabendo pelo aviso na conversa e pela lista de
  pedidos, e só é chamada pelas regras de sempre.
- **O próprio agente envia o orçamento em PDF.** Risco aceito: o orçamento chega ao cliente sem conferência humana. O
  preço vem do cadastro; o que pode sair errado é cadastro desatualizado ou quantidade errada. O aviso na conversa
  deixa a equipe corrigir e reenviar.
- **PDF no servidor com o mesmo componente da tela** (opção 1): um layout só para a equipe e para o agente.

## Fluxo

1. O cliente diz o que quer ("quero 10 caixas do 14/19 e 2 do 80/16").
2. O agente busca os produtos (`buscar_produtos`, já existe) e chama `montar_pedido` com códigos e quantidades.
3. O banco cria o rascunho do agente para o cliente, ou atualiza o que já existe, com os preços **do cadastro**.
4. O agente confirma itens e total ao cliente.
5. Quando o cliente pede o orçamento ou confirma os itens, o agente chama `enviar_orcamento`: o PDF é gerado e vai na
   conversa, com a legenda "Orçamento nº X – Empresa".
6. A conversa ganha um aviso de sistema, só para a equipe, a cada montagem ("O agente montou o orçamento #12
   (R$ 1.027,00). Confira em Pedidos."). O envio já aparece como a própria mensagem do agente com o PDF.

## Banco (uma migration)

- `agente_montar_pedido(p_conversa, p_itens jsonb, p_observacao)`: `p_itens` é a lista completa
  `[{codigo, quantidade}]`.
  - Reaproveita o rascunho de origem `agente` em aberto desse cliente; senão cria (empresa padrão, validade,
    condições e prazo vêm do gatilho de sempre). Responsável: o dono da carteira do cliente, se for da equipe.
  - Substitui os itens. Preço e descrição vêm do produto ativo do cadastro.
  - Código desconhecido ou inativo vai para `nao_encontrados`, sem falhar o resto.
  - Devolve número, itens com preço, total e avisos.
- `agente_dados_orcamento(p_conversa)`: tudo o que o PDF precisa, num JSON no formato do `DadosOrcamento` da tela:
  pedido, itens com código e unidade, emissora, cliente, vendedor e o caminho da logo.
- `agente_enviar_arquivo(p_conversa, p_path, p_nome, p_legenda)`: igual ao `enviar_arquivo` da equipe, mas com autor
  `bot` e sem `auth.uid()`; o arquivo precisa estar no bucket `midias`, no caminho da conversa.
- Aviso de sistema na conversa (mensagem `sistema`, fora da fila de envio).
- Limites:
  - o agente não altera nem envia pedido criado pela equipe nem pedido fora de rascunho;
  - não define frete nem desconto;
  - empresa sem o módulo de pedidos: devolve aviso.
- Só `service_role` executa.

## Serviço de PDF (`livih-pdf`)

- O componente `DocumentoOrcamento` empacotado (esbuild) num serviço Node mínimo: `POST /orcamento` com o JSON dos
  dados, que devolve o PDF.
- Antes do empacotamento, os formatadores que o componente usa saem de arquivos que importam o cliente do Supabase
  (`formatarCnpj` de `empresa.ts`, `quantidade` de `erp.ts`), para o componente só depender de `formato.ts` e dos
  tipos.
- Contêiner na VPS, no compose do n8n, sem porta publicada: só o n8n alcança (pela rede interna).
- A logo: o serviço recebe a URL assinada e a converte para data URL antes de desenhar.
- Teste: gerar o mesmo pedido pela tela e pelo serviço e comparar página a página (PyMuPDF, como em 15/10).

## n8n (`n8n/gerar_workflow.py`)

- `montar_pedido`: `itens` (lista de `{codigo, quantidade}`) e `observacao`. O esquema tem lista, então não serve o
  `obj()` atual, que só tem campos de texto.
- `enviar_orcamento`: busca os dados (`agente_dados_orcamento`), assina a URL da logo, chama o `livih-pdf`, sobe o PDF
  em `midias/<org>/<conversa>/` e chama `agente_enviar_arquivo`.
- Instruções no prompt:
  - montar só quando o cliente disser o produto e a quantidade, com o código exato da busca;
  - mandar a lista completa a cada mudança;
  - confirmar o total;
  - enviar o PDF quando o cliente pedir o orçamento ou confirmar;
  - dizer que o frete é calculado pela equipe.

## Testes

- **Banco** (`teste_fase1.sql`):
  - cria e atualiza sem duplicar;
  - preço vem do cadastro;
  - código desconhecido;
  - não mexe em pedido da equipe nem em confirmado;
  - empresa sem módulo;
  - o envio entra na fila;
  - usuário logado não chama as funções do agente.
- **Serviço:** PDF igual ao da tela.
- **Real:** o usuário pede produtos pelo celular, recebe o PDF, e a equipe vê o rascunho e os avisos.

## Ordem de trabalho

1. Banco: migration e testes.
2. Serviço de PDF: refatorar formatadores, empacotar, contêiner, comparação com a tela.
3. n8n: as ferramentas, as instruções e a publicação.
4. Teste real e ajustes.
