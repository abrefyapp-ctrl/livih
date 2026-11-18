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

## Entrega 1 (18/11): a tela e o módulo

Pedido do usuário em 18/11: construir a tela e deixar o balcão como um módulo (migration `20261118140000_balcao`).

- **Módulo "Balcão"** no catálogo de módulos (`modulos.codigo = 'balcao'`), ligado pela plataforma em Empresas →
  Módulos, como o ERP e as OS. Precisa do ERP ligado. Sem preço por enquanto (`preco_mensal` nulo): não entra na
  fatura nem na tela do plano do dono. **Falta decidir o preço** (ou se vem junto com o ERP).
- **Menu:** Operação → Balcão, para dono, admin e quem tem "Vê todos os clientes" (`balcao_pode`).
- **Tela** ([Balcao.tsx](../src/pages/Balcao.tsx)): busca por código ou nome (Enter adiciona o código exato, senão o
  primeiro da lista; é o que o leitor de código de barras faz), mais vendidos dos últimos 90 dias antes de buscar,
  itens com − e +, desconto do item (R$ ou %), cliente opcional (consumidor final por padrão), as cinco formas,
  valor recebido e troco no dinheiro, prazos 30, 30/60, 30/60/90 ou digitados no a prazo, desconto no total,
  observação e o andamento da última venda (o vendedor já atende o próximo).
- **Fechar** (`balcao_fechar`, tudo ou nada): cria o pedido com origem `balcao` e o CNPJ do balcão, os itens com o
  preço do cadastro, confirma (baixa o estoque e gera as parcelas), marca entregue e, no dinheiro, Pix e débito, dá a
  baixa na conta do caixa. Crédito: a receber em 30 dias. A prazo: boleto, exige cliente. A venda de balcão não manda
  o aviso de situação do pedido pelo WhatsApp.
- **Conta do caixa:** dono e admin escolhem na própria tela (`balcao_definir_conta`); sem escolha, a primeira conta
  do tipo caixa.
- **NF-e:** marcada quando há cliente, o CNPJ do balcão está pronto e quem vende tem "Emite nota fiscal". Sai pela
  `nfe-emitir` (presencial, sem frete; crédito vai como à vista para a SEFAZ). Quando a nota é autorizada e o DANFE
  está guardado, a Livih baixa o PDF e abre a impressão (opção lembrada por computador). Se faltar algo no cadastro
  do cliente, a tela lista o que falta e a venda continua gravada.
- **Consumidor final não recebe NF-e:** a NF-e (modelo 55) exige destinatário. Para vender sem cadastro com nota,
  só com a NFC-e, que segue fora desta etapa.

**Cancelar venda (18/11, migration `20261118160000_balcao_cancelar`):** a venda de balcão nasce entregue, e pedido
entregue não cancela pela `pedido_mudar_status` (no teste da F7 Tech as vendas só saíram pelo banco). No pedido da
venda de balcão, dono e admin têm **Cancelar venda**, com motivo: desfaz o pagamento, devolve o estoque e cancela as
parcelas; o motivo fica na auditoria, no estorno e nas baixas desfeitas. Com NF-e autorizada ou ainda na SEFAZ,
recusa: cancela-se a nota antes (prazo da SEFAZ de 24 horas).

**Usuário do balcão (18/11, migration `20261118180000_balcao_usuarios`):** para abrir o balcão, o atendente
precisava de "Vê todos os clientes", e um atendente vê bem mais do que o balcão usa (na JoGrampo, o número é
compartilhado: veria todas as conversas). Decidido pelo usuário: um usuário só para a área do balcão.

- **Não é da equipe:** fica em `balcao_usuarios`, não em `membros_org`. Tudo o que depende de ser da equipe
  (conversas, contatos, oportunidades, tarefas, agenda, painel, campanhas, OS, financeiro, distribuição de contatos,
  alertas, equipes) continua fechado para ele sem mexer nessas regras. Só o que o balcão usa ganhou uma política a
  mais com `eh_balcao`: empresa e módulos, produtos e estoque, CNPJs, clientes, vendas de balcão (`origem =
  'balcao'`, da loja inteira, para reimprimir a nota de um colega) e as notas delas.
- **Clientes:** busca todos, cadastra (sem vendedor responsável) e corrige o cadastro fiscal; não arquiva, não apaga
  e não troca o vendedor.
- **Cadastro:** dono ou admin, em Configurações → Equipe → Usuários do balcão (`convidar-membro` com papel
  `balcao`), com link para criar a senha, "Emite nota fiscal", link de senha nova e tirar ou devolver o acesso. Quem
  é da equipe não vira usuário do balcão (e o contrário): use outro e-mail.
- **No app:** entra direto no Balcão; o menu tem só Balcão, Vendas do balcão, Produtos e Clientes, e qualquer outra
  tela volta para o Balcão. Não cancela venda (só dono e admin).
- "Vê todos os clientes" continua para quem é da equipe e cuida do faturamento, e também abre o balcão.
- **Iniciar venda pelo cliente (18/11):** no cadastro do cliente, quem abre o balcão tem **Iniciar venda**, que
  abre o Balcão com o cliente já escolhido (`/balcao?cliente=<id>`).
- **Nota de serviço é da equipe:** o usuário do balcão não emite NFS-e (nem a avulsa), mesmo com "Emite nota
  fiscal"; a `nfse-emitir` confere que quem emite é da equipe.

**Falta (entrega 2):** mandar a nota por WhatsApp e e-mail ao fechar (e o "Salvar no cadastro do cliente"), testar
a impressão no Chrome e no Edge com nota de verdade, e o manual da Ajuda.

## Fora desta etapa

- Caixa: abrir e fechar, sangria, reforço, fechamento do dia (e as permissões de desconto e cancelamento).
- Parcelamento no crédito, mais de uma forma de pagamento na mesma venda.
- NFC-e e impressora térmica.
- Imprimir sem a janela do navegador.
