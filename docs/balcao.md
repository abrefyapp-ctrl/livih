# Venda de balcão (proposto em 27/10)

Hoje a venda de balcão é um pedido comum: o vendedor cria em Pedidos, marca "Sem cliente (venda de balcão)" e emite
a NF-e no detalhe do pedido. Funciona, mas são várias telas para uma venda de um minuto. O [nfe.md](nfe.md) já previa
"a tela de vendas" depois da NF-e, e o [clientes.md](clientes.md) deixou o PDV para depois.

Já existe e esta tela usa: a permissão **"Vê todos os clientes"** (quem atende no balcão vende para qualquer cliente),
a permissão **"Emite nota fiscal"**, o **CNPJ do balcão** (`emissoras.padrao_balcao`, escolhido pelo admin) e o pedido
sem cliente.

Protótipo clicável, com dados de exemplo: <https://claude.ai/artifact/2VPDrbe4BfXWvixUMCVvTm> (privado; compartilhar
pelo menu Share).

## Decisões de 27/10

| Pergunta | Decisão |
|---|---|
| Primeira versão | **Venda rápida**: buscar produto, itens, cliente opcional, pagamento, desconto, total, fechar e emitir a NF-e. Sem caixa |
| Cliente | Opcional: "Consumidor final" por padrão; "Escolher cliente" busca em todos (quem atende no balcão tem "Vê todos os clientes") |
| Pagamento | Dinheiro (com valor recebido e troco), Pix, Débito, Crédito, A prazo. A prazo exige cliente |
| Nota | NF-e (A4), marcada por padrão, pelo CNPJ do balcão. Sem NFC-e ([nfe.md](nfe.md)) |
| Impressão | **A Livih abre a janela de impressão sozinha** quando a nota é autorizada; o vendedor só aperta Enter. Nada instalado no computador. Opção "Abrir a impressão da DANFE", marcada por padrão e lembrada por computador |
| Impressão sem janela | **Descartada**: o atalho do Chrome com `--kiosk-printing` e os programas de impressão (QZ Tray, PrintNode) ficam de fora |
| Enviar a nota | WhatsApp e/ou e-mail, marcados antes de fechar e enviados sozinhos quando a nota é autorizada. Depois de fechar, botões para reimprimir e reenviar |
| De onde vem o WhatsApp | O contato ligado ao cliente que conversou por último. Vários contatos: lista para escolher, o mais recente selecionado. Sem contato: o `telefone` do cliente, só se for celular; fixo deixa o campo vazio com o aviso "Pergunte o WhatsApp ao cliente" |
| De onde vem o e-mail | O `email` do cliente (financeiro/fiscal); sem ele, o do contato |
| Número ou e-mail corrigido na hora | Aparece **"Salvar no cadastro do cliente"** (marcado) só quando o valor mudou. Trocar entre contatos da lista não conta como mudança. O número vai para o contato escolhido; sem contato, para o telefone do cliente. No consumidor final não aparece |

## Como funciona (protótipo)

1. **Produto:** busca por código ou nome; Enter adiciona o primeiro resultado, então o leitor de código de barras
   funciona sem configuração. Sem busca, os mais vendidos. Produto sem estoque aparece em laranja e pode ser vendido.
2. **Itens:** quantidade com + e −, desconto do item (R$ ou %, decidido em 18/11; o protótipo não tem), remover.
3. **Cliente, pagamento, desconto no total (R$) e total.**
4. **NF-e e "Quando a nota for autorizada":** abrir a impressão, WhatsApp, e-mail.
5. **Fechar venda** fica bloqueado, com o motivo escrito, quando: não há itens; é a prazo sem cliente; o dinheiro
   recebido é menor que o total; o WhatsApp ou o e-mail marcado está vazio ou inválido.
6. **Venda fechada:** o andamento de cada passo (SEFAZ, autorizada, impressão aberta, enviada pelo WhatsApp, por
   e-mail, cadastro atualizado). O vendedor pode ir para a próxima venda sem esperar.

## Técnico (para quando for construir)

- **Andamento da nota:** como no pedido hoje, a tela consulta a cada 4 s enquanto a nota está "processando"
  ([NotaFiscal.tsx](../src/components/NotaFiscal.tsx)); o `nfe-retorno` copia o XML e o PDF para o storage.
- **Abrir a impressão:** o PDF fica no storage do Supabase (outro endereço), e o navegador não deixa a página mandar
  imprimir um PDF de outro endereço. A Livih baixa o PDF e abre a impressão a partir da cópia local (blob). Testar no
  Chrome e no Edge antes de dar por pronto.
- **WhatsApp:** sai pelo número conectado da empresa e fica na conversa. Na API oficial, fora da janela de 24 h, só
  com modelo aprovado (o mesmo caso do aviso de "pronto" da OS); pelo celular (QR code), sem essa regra.
- **E-mail:** a Livih não manda e-mail próprio hoje (só os de login do Supabase). A Focus deve enviar a DANFE e o XML
  por e-mail; **confirmar na documentação da Focus** antes de construir.

## Decisões de 18/11

Estes pontos estavam em aberto desde 27/10. O usuário decidiu em 18/11, com a JoGrampo em mente.

| Pergunta | Decisão |
|---|---|
| Forma de pagamento | Nos campos que o Financeiro já criou: `pedidos.pagamento_forma` e `pagamento_prazos` ([financeiro.md](financeiro.md)). Dinheiro, Pix e Débito fecham com a parcela **já paga**, numa conta escolhida pelo admin (ex.: "Caixa da loja"), para ninguém precisar dar baixa depois. Crédito fica a receber até cair o dinheiro da maquininha |
| A prazo | Escolhido na hora: botões **30**, **30/60** e **30/60/90**, e um campo para digitar outro. Padrão 30. Prazo por cliente fica para depois (hoje só a OS tem, em `os_prazos_cliente`) |
| Quem abre a tela | Quem tem **"Vê todos os clientes"**, sem papel novo. A NF-e só aparece marcada para quem também tem **"Emite nota fiscal"**; sem ela, a venda fecha e a nota é emitida depois por quem pode |
| Estoque | A venda **baixa o estoque ao fechar**, como o pedido confirmado, e já fica entregue. Vender sem saldo continua livre, com o produto em laranja: no balcão o cliente está com o produto na mão, e travar por estoque desatualizado perde a venda |
| Desconto por produto | Cada item ganha um desconto que aceita **R$ ou %**, guardado em R$. O desconto no total continua, e o total do pedido soma os dois. Vale para o balcão, o pedido e o orçamento. Limite de desconto por vendedor fica para o caixa |

**Ordem de construção:** o desconto por produto sai antes da tela de balcão, porque já serve ao pedido e ao orçamento
que a JoGrampo usa hoje. Na NF-e, o desconto do item vai direto no item; só o desconto do total continua rateado entre
os itens ([nfe-emitir](../supabase/functions/nfe-emitir/index.ts), função `ratear`). O PDF do orçamento e o do pedido
mostram o desconto de cada item.

**Feito em 18/11** (migration `20261118120000_desconto_item`):

- `pedido_itens` ganhou `desconto` (R$, o que vale para as contas), `desconto_percentual` (só quando foi digitado
  em %; o R$ é recalculado quando muda a quantidade ou o preço) e `total` (quantidade × preço − desconto). O
  `subtotal` do item continua sendo quantidade × preço.
- O subtotal do pedido soma o `total` dos itens; o total do pedido segue subtotal − desconto no total + frete, então
  financeiro e parcelas não mudaram de regra.
- O desconto não passa do valor do item (recusa com a mensagem e o valor); só muda no rascunho, como os itens.
- Tela do pedido: coluna "Desconto" em cada item (digita `5,00` ou `10%`; vazio zera) e "Desconto no total" nos
  totais. O agente não dá desconto.
- NF-e: o desconto do item vai no item, e o desconto no total é rateado pelo valor que sobrou em cada item; a sobra
  do arredondamento fica no item de maior valor (não pode cair num item zerado).
- PDF: coluna "Desconto" só quando algum item tem. O serviço `livih-pdf` da VPS precisa ser reconstruído para o PDF
  que o agente manda mostrar a coluna.

## Fora desta etapa

- Caixa: abrir e fechar, sangria, reforço, fechamento do dia (e as permissões de desconto e cancelamento).
- Parcelamento no crédito, mais de uma forma de pagamento na mesma venda.
- NFC-e e impressora térmica.
- Imprimir sem a janela do navegador.
