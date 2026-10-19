# Importador de catálogo com IA (item 7, peça 2 do Orientador)

Aprovado em 19/10. Contexto: [roadmap.md](roadmap.md). A leitura de imagem e PDF no atendimento já existe
(16/10); esta parte é a da configuração: catálogo vira produtos.

Decisões do usuário (19/10):
- **Catálogo de fornecedor entra sem preço.** O preço do fornecedor é custo, não venda.
- **Excel (.xlsx/.xls) entra já.**

## Para o usuário

1. Em **Produtos → Importar**, há duas opções: **Planilha (CSV)**, como antes, e **PDF, Excel, foto ou texto (IA)**.
2. A pessoa envia o arquivo, que pode ser:
   - PDF de tabela ou catálogo (até 100 páginas);
   - planilha Excel com quaisquer colunas;
   - foto da tabela;
   - texto colado.
3. Escolhe o que os preços significam:
   - **"Preço de venda da empresa"**: os preços entram no cadastro.
   - **"Catálogo do fornecedor"**: os produtos entram sem preço. Os que já existem mantêm o preço que têm.
4. Acompanha o progresso. Pode fechar a tela, porque o trabalho continua no servidor.
5. Revisa a mesma prévia da planilha, com três acréscimos: a página de origem de cada linha, avisos por linha e uma
   caixa para tirar a linha da importação.
6. Importa: o código igual atualiza o produto, e o código novo cria.

**Saúde do agente:** o alerta "Parece catálogo" ganha o botão **"Importar este catálogo"**, que abre o importador
com o texto daquele conteúdo da base.

## Produto sem preço

Produto com preço 0 é tratado como **sem preço**:
- **Agente:** `buscar_produtos` devolve `preco: null` e "sob consulta". A regra do prompt manda dizer que a equipe
  confirma o valor.
- **Orçamento:** `montar_pedido` recusa o item sem preço, com o aviso "sem preço cadastrado: chame a equipe".
- **Tela de Produtos:** mostra "sem preço" em vez de R$ 0,00.

## Por dentro

- **Tabela `importacoes_catalogo`:** situação (na fila, lendo, pronto, erro), progresso, resultado (linhas), erros
  e consumo. Só dono/admin leem; quem grava é a Edge Function.
- **Arquivo:** vai para o bucket privado `importacoes` (org/arquivo), só para dono/admin.
- **Edge Function `importar-catalogo`:** cria a importação e processa em segundo plano (`EdgeRuntime.waitUntil`).
  A tela consulta a situação a cada 3 s.
  - **PDF:** blocos de 5 páginas (pdf-lib), até 3 ao mesmo tempo, enviados ao gpt-5-mini com saída em formato
    fixo: código, nome, unidade, preço, detalhes, categoria, marca, NCM e página.
  - **Foto:** um bloco.
  - **Texto:** blocos de ~15 mil caracteres, cortados em fim de linha.
  - **Excel:** a IA só identifica as colunas (cabeçalho e 20 linhas de amostra de cada aba). A conversão das linhas
    é feita por código comum, exata e barata para planilhas grandes.
- **Instruções da extração:** copiar exatamente; não calcular nem inventar; o que estiver ilegível fica vazio.
- **Limpeza** (sem IA):
  - preço em formato brasileiro;
  - unidade padronizada;
  - itens duplicados entre blocos juntados pelo código.
- **Avisos** (na tela, contra o cadastro atual): sem preço, código repetido, preço que muda mais de 50% e nome
  parecido com um produto existente.
- **Consumo:** `uso_ia` tipo `importacao`. Limites: 100 páginas e 5 importações por dia por empresa.

## Qualidade

Gabarito: o CSV de 277 produtos montado à mão a partir da base da JoGrampo
(`claude_code/jogrampo_produtos_importacao.csv`). O importador roda sobre o mesmo texto, e o resultado é comparado
por código e preço. A meta é ≥ 98% dos preços certos. Abaixo disso, testar um modelo mais forte só para a
importação.

## Resultado do teste (19/10)

Base da JoGrampo (156 mil caracteres, os dois catálogos desativados) contra o gabarito de 277 produtos:

| Rodada | Produtos | Preços certos | O que mudou depois |
|---|---|---|---|
| 1 | 84% | 100% | Blocos de 15 mil caracteres: a IA resumia as seções densas (famílias 14, 80, 90 e 92) |
| 2 | 98% | 97% | Blocos de 6 mil caracteres. Um produto cortado entre blocos ficava sem preço, ou com o preço do vizinho |
| 3 | 98% | 100% | Corte entre produtos (linha em branco). Código da tabela repetido entre fornecedores era descartado como duplicado |
| 4 | **100%** | **100%** | Junção por código e nome. Código repetido com marcas diferentes ganha a marca ("IMECO 4.003") |

- **Custo:** ~73 mil tokens de entrada e ~65 mil de saída, uns R$ 0,80 para o catálogo inteiro (27 blocos, ~3,5 min).
- **Código ainda repetido:** o ROCAMA 7.005 (dois produtos com o mesmo código no fornecedor) fica com aviso na
  prévia, e só o primeiro vem marcado.
- **Chave de serviço:** a função aceita a chave de serviço em qualquer formato (JWT ou `sb_secret_`). Ela é usada
  para continuar a leitura e para testes.

## Fora desta etapa

Fotos de produto, estoque e catálogo de fornecedor compartilhado (item 5, parte 2).
