# Entrada por nota fiscal

Pedido de 20/10 (JoGrampo): quando chega mercadoria, a nota do fornecedor cadastra o produto que não existe e soma a
quantidade no estoque.

Decisões do usuário (20/10):
- **Produto novo entra sem preço de venda.** O valor da nota é custo, não venda. A lista de produtos ganhou o filtro
  "Só sem preço", e o aviso depois do lançamento aponta para ele.
- **O último custo fica guardado** (`produtos_custos`), visível só para dono e admin. O agente e a equipe não veem.
- **Só dono e admin lançam**, a mesma regra do cadastro de produtos.

## Para o usuário

1. Em **Produtos → Entrada por nota**, a pessoa envia:
   - o **XML** da NF-e, lido na hora, sem IA e sem custo;
   - ou o **PDF (DANFE)** ou uma **foto** da nota, lidos pela IA (gpt-5-mini, `uso_ia` tipo "nota").
2. A revisão mostra o fornecedor, o número, a emissão e o total. Cada item vem com uma sugestão, nesta ordem:
   - **ligado numa nota anterior deste fornecedor** (vínculo salvo, com o fator);
   - **mesmo código no cadastro**;
   - **mesmo nome no cadastro**;
   - senão, **produto novo**, com nome, código (o do fornecedor, se estiver livre) e unidade editáveis, e até 3
     produtos de **nome parecido** para ligar com um clique em vez de criar outro.
3. Em cada item dá para trocar o produto, mudar para "Produto novo" ou "Não lançar", corrigir a quantidade e
   ajustar o **fator**: 1 CX da nota = 10 un do produto.
4. **Lançar** faz tudo de uma vez: cria os produtos novos, soma a entrada no estoque (motivo "NF 1234 · Fornecedor"
   no histórico do produto), guarda o vínculo e o custo.

**Nota repetida não entra:** a trava é pela chave de acesso. Sem chave (foto ilegível), é pelo CNPJ, número e série.
A tela avisa antes, e o banco recusa se passar.

**Erro de lançamento** (quantidade errada): o movimento é imutável, como todo o estoque. Corrige-se com um ajuste no
produto.

## Técnico

- Migration `20261021130000_notas_entrada.sql`:
  - tabelas `notas_entrada`, `notas_entrada_itens`, `produtos_fornecedores` (vínculo CNPJ + código do fornecedor →
    produto + fator) e `produtos_custos`;
  - coluna `estoque_movimentos.nota_entrada_id`;
  - bucket privado `notas-entrada` (o arquivo original fica guardado);
  - função `nota_entrada_lancar(p_org, p_nota, p_itens)`, numa transação só.
- Leitura do XML: `src/services/notaXml.ts`, por tags, sem biblioteca. Ignora o prefixo de namespace.
- PDF e foto: Edge Function `ler-nota`, que usa `chamarIA` de `_shared/catalogo.ts`.
- Tela: `src/components/ModalEntradaNota.tsx`. Sugestões e chamada em `src/services/notasEntrada.ts`.
- Testes: bloco "nota entrada" em `scripts/teste_fase1.sql`.

## Depois

- Histórico de notas lançadas (lista com o arquivo para baixar). Hoje fica no banco e no histórico de cada produto.
- Buscar o XML pela chave direto na SEFAZ ou pelo e-mail de NF-e. Pede certificado digital ou integração com um
  provedor; entra junto com a emissão de NF-e.
- Sugerir o preço de venda a partir do custo (margem por categoria), se o cliente pedir.
