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
2. **Itens:** quantidade com + e −, remover.
3. **Cliente, pagamento, desconto (R$) e total.**
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

## Em aberto

- **Onde guardar a forma de pagamento:** o pedido só tem `condicoes_pagamento` (texto). Para relatório por forma de
  pagamento e para o "A receber", falta um campo próprio.
- **A prazo:** o protótipo usa 30 dias fixos. Prazo por cliente ou escolhido na hora?
- **Quem abre a tela de balcão:** qualquer membro, só quem tem "Vê todos os clientes", ou um papel "balcão"
  ([clientes.md](clientes.md), "Fora desta etapa")?
- **Estoque:** a venda baixa o estoque na hora de fechar (como o pedido confirmado)? Vender sem saldo continua livre?

## Fora desta etapa

- Caixa: abrir e fechar, sangria, reforço, fechamento do dia (e as permissões de desconto e cancelamento).
- Parcelamento no crédito, mais de uma forma de pagamento na mesma venda.
- NFC-e e impressora térmica.
- Imprimir sem a janela do navegador.
