# Logo na nota fiscal e notas recebidas (pedido de 03/11)

Dois pedidos do usuário em 03/11: a logo da empresa no DANFE e uma área com as NF-e, NFS-e Nacional e CT-e emitidas
contra os CNPJs da empresa.

## Parte 1: logo na nota (feita em 03/11)

Não precisou de campo novo: a logo já é enviada em Configurações → Empresa, por CNPJ, e saía só no orçamento e no
pedido em PDF. Agora ela vai também para a Focus, que a imprime no DANFE.

- `nfe-config` lê a logo do bucket `logos`, reduz para caber em 200×200 (o limite da Focus) mantendo a proporção,
  converte para PNG e manda em `arquivo_logo_base64`. Sem logo no cadastro, manda `delete_logo`. Se a imagem não der
  para ler, a nota segue sem logo e o erro fica no log (`logo danfe`), sem travar o cadastro.
- A tela Empresa, ao trocar ou tirar a logo de um CNPJ que já está na Focus, chama o `nfe-config` na hora. Se falhar,
  mostra o aviso para salvar de novo em Nota fiscal.
- A legenda do campo diz que a logo sai também na nota fiscal.
- Na NFS-e, a Focus avisa que algumas prefeituras não aceitam logo; na NFS-e Nacional, conferir na primeira emitida.

Publicar: `npx supabase functions deploy nfe-config` e `npm run publicar`. Para valer num CNPJ já cadastrado, basta
salvar a Nota fiscal dele uma vez (ou trocar a logo).

## Parte 2: notas recebidas (em espera desde 03/11)

**Parada por decisão do usuário (03/11):** primeiro ver com a Focus quanto custam as notas recebidas; depois decidir
se e como entra. O plano abaixo fica como referência.

### O que a Focus oferece (documentação de 03/11)

| Documento | Ligar na empresa (`/v2/empresas`) | Consultar | Gatilho |
|---|---|---|---|
| NF-e | `habilita_manifestacao`, `data_inicio_recebimento_nfe` | `GET /v2/nfes_recebidas?cnpj=&versao=` | `nfe_recebida` |
| CT-e | `habilita_manifestacao_cte`, `data_inicio_recebimento_cte` | `GET /v2/ctes_recebidas?cnpj=&versao=` | `cte_recebida` |
| NFS-e Nacional | `habilita_nfsen_recebidas_producao`, `data_inicio_recebimento_nfsen` | `GET /v2/nfsens_recebidas?cnpj=&versao=&completa=1` | `nfsen_recebida` |

- Cada consulta devolve até 100 documentos; o cabeçalho `X-Max-Version` é o ponto de partida da próxima.
- NF-e: XML, DANFE, XML de cancelamento e de carta de correção por chave. O XML completo só vem depois da
  manifestação (`nfe_completa`); antes, só o resumo (emitente, valor, data, situação).
- Manifestação: `POST /v2/nfes_recebidas/{chave}/manifesto` com `ciencia`, `confirmacao`, `desconhecimento` ou
  `nao_realizada` (justificativa de 15 a 255 caracteres). A conclusiva tem prazo de 180 dias.
- CT-e: XML, DACTE e "informar desacordo".
- NFS-e: só do padrão Nacional (a municipal não tem notas recebidas pela Focus). XML, PDF da DANFSe.
- A data de início não muda depois de definida, e o que vier antes dela não é buscado nem cobrado.
- `habilita_filtro_mde_destinatario_empresa`: não guarda notas em que a empresa não é a destinatária (ex.: só
  transportadora citada).

### Como fica na Livih

- **Ligar:** na janela Nota fiscal de cada CNPJ, a opção "Receber as notas emitidas contra este CNPJ" (NF-e, CT-e e
  NFS-e Nacional). Pede o certificado A1 do próprio CNPJ, que já é o da emissão. Só com ERP ou OS ligados
  (`nota_fiscal_liberada`).
- **Chegada:** os gatilhos da Focus chamam uma Edge Function nova (`notas-recebidas`), que grava a nota e baixa o
  XML e o PDF para um bucket privado. Um cron diário consulta pela `versao` guardada por CNPJ e tipo, para não perder
  nota se um gatilho falhar.
- **Tabela `notas_recebidas`:** empresa, CNPJ (emissora), tipo (nfe, cte, nfse), chave, número, série, emitente
  (nome e CNPJ/CPF), valor, emissão, situação (autorizada, cancelada, denegada), manifestação, se está completa,
  caminhos do XML e do PDF, versão e a ligação com a entrada por nota (`notas_entrada`) e com a conta a pagar.
- **Tela "Notas recebidas"** (no menu do ERP e das OS):
  - abas NF-e, CT-e e NFS-e, com busca por emitente, número ou chave, período e situação;
  - em cada nota: baixar XML e PDF, manifestar (NF-e) ou informar desacordo (CT-e);
  - **"Dar entrada no estoque"** (NF-e): abre a Entrada por nota com o XML já carregado
    ([entrada-por-nota.md](entrada-por-nota.md)), sem a pessoa baixar e subir o arquivo;
  - **"Lançar no contas a pagar"**: cria as parcelas pelas duplicatas do XML (`cobr > dup`) ou pelo valor e vencimento
    que a pessoa informar ([financeiro.md](financeiro.md));
  - selo "Já lançada" quando a nota já entrou no estoque ou no financeiro.
- **Aviso:** notificação para dono e admin quando chega nota nova, e o selo de pendentes no menu.

### Entregas

1. Banco (tabela, bucket, RLS, funções) e a opção de ligar na janela Nota fiscal, mandando os campos para a Focus.
2. Edge Function `notas-recebidas` (gatilhos e cron) e a manifestação automática, se decidida.
3. Tela Notas recebidas com download, manifestação e desacordo.
4. "Dar entrada no estoque" e "Lançar no contas a pagar" a partir da nota recebida.

### A decidir (com o usuário)

1. **Ciência automática** quando a NF-e chega, para o XML completo vir sozinho. A ciência só registra que a empresa
   viu a nota; não confirma a operação.
2. **Data de início:** a partir do dia em que a empresa liga (sem passado) ou buscando o passado que a SEFAZ ainda
   guarda (cerca de 90 dias). A data não muda depois.
3. **Quem vê:** só dono e admin (como a entrada por nota) ou também quem tem acesso ao financeiro.
4. **Custo:** a Focus não publica o preço das notas recebidas. Perguntar à Focus antes de ligar, e decidir se entram
   na franquia de 100 notas por CNPJ ou ficam fora da cobrança.
