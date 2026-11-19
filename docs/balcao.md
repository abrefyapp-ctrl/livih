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
| Número ou e-mail corrigido na hora | Aparece **"Salvar no cadastro do cliente"** (desmarcado desde 19/11) só quando o valor mudou. Trocar entre contatos da lista não conta como mudança. O número vai para o contato escolhido; sem contato, para o telefone do cliente. No consumidor final não aparece |

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
- PDF: coluna "Desconto" só quando algum item tem. O PDF que o agente manda mostra a coluna desde 19/11, quando o
  serviço `livih-pdf` da VPS foi reconstruído (cópia do pacote anterior em `dist/entrada.js.bak-20261119`).

## Entrega 1 (18/11): a tela e o módulo

Pedido do usuário em 18/11: construir a tela e deixar o balcão como um módulo (migration `20261118140000_balcao`).

- **Módulo "Balcão"** no catálogo de módulos (`modulos.codigo = 'balcao'`), ligado pela plataforma em Empresas →
  Módulos, como o ERP e as OS. Precisa do ERP ligado. **Preço (decidido em 19/11): vem junto com o ERP, sem
  cobrança à parte**, porque não tem custo de servidor e as notas do balcão contam nas 100 do ERP (passou disso, a
  nota extra já é cobrada). Por isso `preco_mensal` fica nulo: não entra na fatura nem na tela do plano do dono. A
  plataforma continua ligando por empresa, para o menu não aparecer em quem só vende pelo WhatsApp.
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

## Entrega 2 (18/11): mandar a nota ao cliente

Migration `20261118220000_nota_envios`, Edge Function `nota-enviar` e `_shared/envioNota.ts` (usado também pela
`nfe-retorno`).

- **No Balcão**, com a NF-e marcada, o bloco "Quando a nota for autorizada" traz o WhatsApp e o e-mail do cliente
  (`nota_destinos`: os contatos ligados ao cliente, o que conversou por último primeiro; sem contato, o telefone do
  cliente se for celular; e-mail do cliente ou de um contato). Ao fechar, a Livih emite e pede o envio; ele fica
  pendente em `nota_envios` e sai quando a nota é autorizada e o DANFE está guardado (`nfe-retorno` →
  `processarEnvios`). O quadro da última venda mostra cada envio e o resultado.
- **Depois**, no bloco da nota do pedido: "Enviar ao cliente" (mesmos campos) e a lista do que já saiu.
- **WhatsApp:** pelo número da empresa, na conversa mais recente do contato num número ativo; sem conversa, abre uma
  no número compartilhado (o primeiro sem vendedor). Não mexe no estado da conversa (o agente continua). Número
  sem contato vira contato (origem `balcao`) ligado ao cliente. O DANFE é copiado de `notas-fiscais` para
  `midias/<org>/<conversa>/` (a fila do WhatsApp só lê de lá). Não sai, com o motivo registrado: contato
  descadastrado, número desconectado, API oficial fora das 24 horas (só com modelo; mandar por e-mail).
- **E-mail:** pela Focus (`POST /v2/nfe/{ref}/email`, até 10 e-mails, em segundo plano). **A confirmar no primeiro
  envio real:** a documentação não diz se vão o DANFE e o XML.
- **Salvar no cadastro:** o e-mail corrigido vai para o cliente se a pessoa marcar (desmarcado por padrão desde 19/11;
  antes vinha marcado). O WhatsApp corrigido **não**
  troca o telefone de um contato (o telefone é a identidade dele no WhatsApp e nas conversas): vira um contato
  ligado ao cliente. Mudança da decisão de 27/10, que dizia "o número vai para o contato escolhido".
- **Manual da Ajuda:** `src/ajuda/ManualBalcao.tsx`, com três imagens desde 19/11 (`public/ajuda/balcao/`: a venda,
  o bloco da nota e o "Enviar ao cliente"). Os dados são fictícios: na captura, as respostas do banco (produtos,
  cliente, contatos) foram trocadas só no navegador, sem gravar nada.

**Teste de 19/11/2026** (NF-e nº 3 da JoGrampo, homologação, pelo "Enviar ao cliente" do pedido, para o WhatsApp e o
e-mail do Felippe):

- **WhatsApp: funcionou.** Saiu da fila na primeira tentativa, com o PDF "NF-e 3.pdf" e a legenda "Nota fiscal nº 3 –
  FIXOTEC", e chegou como lida. O número já era contato da JoGrampo (testes antigos): o envio usou a conversa dele e o
  ligou ao cliente da nota. A ligação foi apagada depois do teste.
- **E-mail: não chegou.** A Focus aceitou (200 = "agendado") e o envio ficou "enviado", mas nada chegou ao Gmail. A
  documentação da Focus não diz se a homologação manda e-mail nem o que vai nele, e não há consulta de entrega
  (só a de e-mails bloqueados). Falta confirmar com o suporte da Focus ou na primeira nota de produção.
- **Visto no teste:** com o e-mail trocado no diálogo, "Salvar no cadastro do cliente" vem marcado; quem só quer
  mandar para outro endereço troca o cadastro sem perceber. Passou a vir desmarcado. E no pedido de outra empresa (administrador da
  plataforma), "Empresa (CNPJ)" e a lista de vendedores mostraram as da F7 Tech, a empresa em que se estava.

**Falta:** confirmar o e-mail da Focus e testar a impressão do DANFE com uma nota de verdade (a F7 Tech não emite
NF-e: 554, IE "ISENTO").

## Ajustes de 19/11 (teste na JoGrampo)

Caso real: a venda de balcão nº 51 da JoGrampo, para o Affonso Ditzel, fechou e a NF-e não saiu, porque faltava o
endereço do cliente. O WhatsApp digitado não ficou em lugar nenhum, porque só era ligado ao cliente quando a nota era
enviada. Pedido do usuário: as duas melhorias abaixo.

- **Aviso antes de fechar:** com "Emitir a NF-e" marcado, o Balcão lê o cadastro completo do cliente e confere o que a
  `nfe-emitir` recusaria por causa dele ou dos produtos: CNPJ/CPF, endereço (CEP, rua, número, bairro, cidade, UF) e o
  NCM de cada produto (`faltaParaNfe` em [nfe.ts](../src/services/nfe.ts), com as mesmas regras e textos da função).
  Faltando algo, a lista aparece embaixo da opção, com **Completar o cadastro do cliente** (a janela de cadastro de
  sempre), e **Fechar venda** fica apagado até acertar ou desmarcar a NF-e. A conferência da `nfe-emitir` continua:
  é ela que vale (ex.: o CNPJ do balcão deixar de estar pronto).
- **WhatsApp ligado ao fechar:** se o WhatsApp marcado ainda não é de um contato do cliente, o Balcão chama
  `cliente_ligar_whatsapp` logo depois de fechar e antes de emitir a nota (migration
  `20261119140000_cliente_ligar_whatsapp`). Mesmas regras do envio da nota: número novo vira contato ligado ao cliente
  (origem `balcao`, sem vendedor responsável), número que já é de um contato liga esse contato, e o telefone de ninguém
  muda. Quem pode: quem vê o cliente e o usuário do balcão. Se falhar, a venda continua fechada e o quadro da última
  venda avisa.

## Fora desta etapa

- Caixa: abrir e fechar, sangria, reforço, fechamento do dia (e as permissões de desconto e cancelamento).
- Parcelamento no crédito, mais de uma forma de pagamento na mesma venda.
- NFC-e e impressora térmica.
- Imprimir sem a janela do navegador.
