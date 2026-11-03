# Planos por módulo (proposto em 28/10)

Ideia do usuário em 28/10: cobrar por módulo, porque o cliente pode querer só a nota fiscal, só o ERP, só o CRM ou
só o agente. Este arquivo é a proposta para decidir juntos; a tabela de planos em vigor continua no
[roadmap](roadmap.md#planos-revisto-em-2010) até a decisão.

## A proposta em uma frase

**Um núcleo obrigatório, o CRM do WhatsApp com o agente de IA, e módulos pagos por cima** (ERP e ordens de serviço,
cada um com a sua nota fiscal incluída).

**Decidido em 28/10:**
- núcleo obrigatório com módulos; "só nota fiscal" e "só ERP" ficam para depois do financeiro;
- **o agente entra no núcleo**, em todo plano: é a essência da Livih. O que muda de um plano para outro é a franquia
  de atendimentos do agente, não ter ou não o agente;
- **Agenda e Campanhas entram no núcleo**;
- **franquia do agente:** o modelo de IA não muda (segue o gpt-5-mini); as franquias e o que acontece ao passar delas
  foram revistos em 29/10 (abaixo);
- **nota fiscal não é módulo à parte:** vem incluída no ERP (NF-e) e nas OS (NFS-e). Com isso, os pacotes saíram: o
  cliente paga o núcleo mais cada módulo (depois de comparar com o Bling, seção de preços).

**Decidido em 29/10:**
- **quatro planos em escada**, cada um custando o dobro do anterior: Essencial, Start, Pro e Business (seção de
  preços). O salto de R$ 49,90 para R$ 197 era grande demais: o cliente do Essencial só ganharia com o Start depois de
  ~520 atendimentos;
- **ao passar da franquia, o cliente escolhe**, como no Bubble com as WUs: parar o agente ou continuar pagando o
  excedente; e pode comprar pacotes de atendimentos. Vale para todos os planos e substitui "o agente nunca para e só a
  Livih é avisada" de 28/10;
- **franquias menores**: as de 28/10 eram grandes para o agente nunca parar sem susto; com a escolha do cliente, isso
  deixou de ser preciso. Com R$ 0,20 por atendimento, o Start de 1.000 daria prejuízo com a franquia cheia.

**Decidido em 01/11:**
- **Pro a R$ 149,90 e Business a R$ 199,90** (eram R$ 197 e R$ 397). A escada deixa de dobrar: do Start para cima,
  cada plano custa R$ 50 a mais.
- **Franquias do Pro e do Business menores: 500 e 800 atendimentos** (eram 750 e 1.500). Com as antigas e os preços
  novos, a franquia cheia a R$ 0,20 dava prejuízo (~R$ 25 no Pro e ~R$ 133 no Business); com as novas, nenhum plano
  dá prejuízo.
- **Nenhum plano inclui ERP ou OS.** Incluir um módulo no Start foi pensado e descartado: a Focus custa ~R$ 40 por
  CNPJ, use o cliente ou não, e quem não emite nota pagaria por quem emite. Os módulos seguem à parte, do Start para
  cima, e os dois juntos no mesmo CNPJ saem com desconto (seção de preços).
- **Programa Fundadores:** deixa de ter preço próprio; fica o preço de tabela travado por 12 meses, com o ERP sem
  custo.
- **Plano anual: pague 10 meses e use 12**, no núcleo e nos módulos (seção de preços).
- **Teste grátis de 30 dias no Start**, com o ERP e as OS liberados para testar.
- **Cancelamento do anual:** devolução integral até 7 dias depois do primeiro pagamento; depois, devolve o pago menos
  os meses usados a preço mensal ([site-planos.md](site-planos.md)).
- **Preços no site só depois da cobrança pronta** (passo 6).

**Decidido em 02/11 (regras dos planos, passo 4 das pendências):**
- **Módulos mais baratos: ERP ou OS a R$ 79,90; os dois juntos no mesmo CNPJ, R$ 109,80** (R$ 79,90 + R$ 29,90). No
  anual, R$ 799 e R$ 1.098. Eram R$ 99 e R$ 149 (seção de preços).
- **O dono troca o plano sozinho** em Configurações → Plano e consumo (subir, descer, mensal ou anual); a plataforma
  continua podendo trocar pela tela Empresas.
- **Mensal: subir vale na hora** (franquia e números do plano novo já no mês), e a diferença proporcional aos dias que
  faltam entra na próxima fatura; **descer vale no dia 1 seguinte**, sem devolução.
- **Anual: subir vale na hora**, com uma cobrança da diferença anual proporcional aos meses que faltam (Start → Pro
  com 6 meses restantes: (R$ 1.499 − R$ 999) × 6/12 = R$ 250); a data de renovação não muda. Descer, só na renovação.
- **Anual em até 12x sem juros no cartão**, além de Pix e boleto à vista; a Livih absorve a taxa do parcelamento.
- **Renovação do anual automática**, pelo preço de tabela do momento, com aviso ao dono 15 dias antes (dá tempo de
  trocar para o mensal ou outro plano).
- **Usuários ilimitados também no Essencial**, como nos outros planos (decisão de 20/10 mantida).
- **Limite de números de WhatsApp:** para descer a um plano com menos números do que tem conectados, o dono remove
  antes os que sobram (botão Remover; Desconectar não libera a vaga); a tela diz quantos.

Por que o agente não é módulo:
- **É o diferencial.** Sem ele, a Livih é mais um CRM de WhatsApp contra concorrentes com anos de mercado. O
  posicionamento de 20/10 é "controle comercial", e é o agente que entrega esse controle sem a equipe trabalhar a mais
  (responde na hora, anota o contato, registra a oportunidade, monta o orçamento).
- **Os módulos dependem dele para mostrar valor:** o orçamento montado pelo agente no ERP, a consulta da OS pelo
  WhatsApp, o funil alimentado sozinho. Como módulo pago, a maioria nunca ligaria.
- **Atrai cliente:** "todo plano já vem com o agente" vende; "o agente é à parte" vira objeção.
- **O custo da IA fica sob controle pela franquia** e pelo aviso em 80 %, sem precisar cobrar o agente à parte.

Quem não quer IA desliga o agente no canal, como já é possível hoje, sem desconto: a tabela de preços fica simples.

Os módulos não são independentes, e é isso que impede vender tudo separado:

- **O agente precisa do CRM.** Quando ele chama a equipe, alguém tem que ver a conversa e responder.
- **A NF-e sai de um pedido (ERP)**, com o cliente e os produtos cadastrados; a **NFS-e** sai de um pedido de
  serviço, de uma OS ou avulsa (no cliente). Não existe NF-e avulsa.
- **O ERP e as OS usam clientes e produtos**, que também servem ao CRM e ao agente.

## Núcleo e módulos

| Parte | O que tem | Depende de | Já é módulo hoje? |
|---|---|---|---|
| **Núcleo** | Conversas no WhatsApp, contatos, clientes, produtos, funil, carteira, equipe, painel, agenda, campanhas e o **agente de IA** (atendimento, orçamento pelo agente, simulador, saúde, orientador) | — | É a base. A agenda é módulo ligado por padrão; o agente liga por canal (`agentes.ativo`) |
| **ERP** | Pedidos, estoque, entrada por nota e **NF-e**; depois financeiro e cobrança | Núcleo | Sim (`erp`) |
| **Ordens de serviço** | Equipamento para conserto, etapas, faturamento, PDF da OS e **NFS-e** | Núcleo | Sim (`os`) |

Hoje a configuração da nota fica liberada para todos; passa a exigir o ERP ou as OS ligados.

O catálogo `modulos` e a regra `modulo_ativo(org, codigo)` (13/10) já resolvem a parte técnica: módulo novo = uma
linha no catálogo, `modulo_ativo` nas políticas e no que o módulo dispara, e o item de menu condicionado.

## Como cobrar cada um

O que pesa no custo muda de parte para parte, e a cobrança deve seguir o custo:

| Parte | Custo da Livih | Cobrar por |
|---|---|---|
| Núcleo | Fixo (servidor, suporte) e **variável no agente**: IA por resposta (~R$ 0,02; ~R$ 0,11 por atendimento na JoGrampo em outubro) | Mensalidade por plano, que varia pelos números de WhatsApp e pela franquia de atendimentos do agente |
| ERP | Fixo, mais a Focus por CNPJ e por nota | Mensalidade com 1 CNPJ e 100 notas; CNPJ e nota a mais à parte |
| OS | Fixo, mais a Focus por CNPJ e por nota | Mensalidade com 1 CNPJ e 100 notas; CNPJ e nota a mais à parte |

Usuários continuam **ilimitados** em todos os planos (decisão de 20/10). Os modelos das campanhas a Meta cobra direto
da empresa cliente, por isso as campanhas cabem no núcleo sem custo para a Livih.

## Franquia do agente (28/10, revista em 29/10)

Com o agente em todo plano, a franquia é o que segura o custo. O cliente **não leva cobrança surpresa**: ao passar
dela, acontece o que ele escolheu.

- **O modelo de IA não muda:** segue o gpt-5-mini em todo plano. Trocar por um modelo mais barato ao passar da
  franquia foi pensado e deixado de lado por enquanto (um modelo menor erra mais nas ferramentas).
- **Franquias: 150, 350, 500 e 800 atendimentos por mês** (Essencial, Start, Pro e Business; 29/10, com o Pro e o
  Business revistos em 01/11). As de 28/10 (1.000, 2.000 e 3.000) foram feitas para o agente nunca parar; com a
  escolha do cliente, ficaram grandes demais.
- **O que conta: o atendimento de 24 h.** Um atendimento começa quando o agente responde numa conversa em que não
  respondia havia mais de 24 h; tudo o que ele responde nas 24 h seguintes é o mesmo atendimento. Para o cliente: "cada
  vez que alguém puxa assunto e o agente atende, conta um atendimento". Escolhido no lugar de "conversa no mês" porque
  acompanha o custo (o cliente que volta toda semana gasta IA toda semana) e é parecido com a janela de 24 h que as
  empresas já conhecem da Meta. A contagem sai de `uso_ia` (cada resposta tem a conversa e o horário).
- **Consumo real em outubro** (até 28/10), pela mesma regra:

  | Empresa | Respostas do agente | Conversas no mês | Atendimentos de 24 h | Respostas por atendimento |
  |---|---|---|---|---|
  | JoGrampo | 413 | 59 | 78 | 5,3 |
  | F7 Tech | 44 | 8 | 13 | 3,4 |

  A JoGrampo usaria ~52 % da franquia do Essencial (ou ~22 % da do Start).
- **Custo por atendimento (conferido em 29/10):** pelos tokens do `uso_ia` e a taxa de cache de 65 % do painel da
  OpenAI, ~R$ 0,11; pela cobrança real da chave do agente no n8n (US$ 3,46 em outubro, ~490 respostas), ~R$ 0,21. As
  contas de preço usam **R$ 0,20**, o conservador. O total da organização na OpenAI em outubro (US$ 5,44) bateu com a
  estimativa pelos tokens (~US$ 5,10): o raciocínio do gpt-5-mini não esconde custo.
- **Ao chegar em 80 %**, o **cliente** é avisado (notificação e WhatsApp, como os lembretes da agenda) com o consumo e
  as opções; a equipe da plataforma também.
- **Ao chegar em 100 %, acontece o que o cliente escolheu** na tela de plano:
  - **parar:** o agente para, e as conversas seguem para a equipe, como com o agente desligado;
  - **continuar:** o agente segue, e cada atendimento a mais entra na fatura seguinte a **R$ 0,40**.
- **Pacote de 100 atendimentos a R$ 29,90** (R$ 0,30 cada), comprado antes, em qualquer plano. O avulso fica mais caro
  de propósito, para levar ao pacote ou ao plano de cima. Excedente e pacote entram na mensalidade seguinte, sem
  cobrança separada (sem uma segunda taxa de cobrança).
- **Créditos de cortesia:** a plataforma ainda pode acrescentar atendimentos ao mês de uma empresa na tela Empresas.

## Preços (núcleo em escada decidido em 29/10 e revisto em 01/11; módulos sugeridos em 28/10)

### Núcleo

| Plano | Preço por mês | Números de WhatsApp | Atendimentos do agente | IA com a franquia cheia | Sobra no pior caso | Vale subir a partir de |
|---|---|---|---|---|---|---|
| **Essencial** | **R$ 49,90** | 1 | 150 | R$ 30 | ~R$ 10 | — |
| **Start** | **R$ 99,90** | 2 | 350 | R$ 70 | ~R$ 12 | ~275 atendimentos no Essencial |
| **Pro** | **R$ 149,90** | 3 | 500 | R$ 100 | ~R$ 25 | ~475 no Start |
| **Business** | **R$ 199,90** | 5 | 800 | R$ 160 | ~R$ 7 | ~625 no Pro |
| Acima disso | sob consulta | 10 ou mais | a combinar | | | |

- **Pior caso:** franquia inteira usada, R$ 0,20 por atendimento, Anexo V (15,5 %) e ~R$ 2 de taxa de cobrança. No
  uso comum (30 % da franquia) a sobra é bem maior (Essencial ~R$ 31, Start ~R$ 61, Pro ~R$ 95 e Business ~R$ 119);
  com o custo de R$ 0,11, quase dobra.
- **Do Essencial para o Start o preço dobra; do Start para cima, sobe R$ 50 por plano** (01/11). O cliente passa a
  ganhar com o de cima quando o excedente (R$ 0,40) alcança a diferença de preço.
- **Essencial:** sem ERP nem OS; implantação feita pelo próprio cliente (conectar o WhatsApp, importar o catálogo,
  orientador) ou cobrada à parte. Com ~R$ 31 de sobra por mês no uso comum, duas horas de suporte comem meses de
  margem.
- **Histórico:** 20/10 era Start, Pro e Business a R$ 149, 299 e 599 (500, 1.200 e 3.000 conversas); 28/10, a
  R$ 197, 397 e 697 (1.000, 2.000 e 3.000 atendimentos); 29/10, Pro a R$ 197 e Business a R$ 397. O plano de entrada foi pensado a R$ 39,90 com 100
  atendimentos; R$ 49,90 com 150 deixa a mesma folga no pior caso e 50 % a mais de franquia.
- **Programa Fundadores:** era R$ 149 com o que é do Pro e R$ 249 com o que é do Business; com os preços de 01/11,
  deixou de ter desconto (o Business de tabela ficou mais barato). Passa a ser o preço de tabela travado por 12 meses,
  com o ERP sem custo.

### Custos fixos (29/10)

| Item | Por mês |
|---|---|
| VPS Hostinger KVM 2 (2 vCPU, 8 GB), migrando do KVM 1 | R$ 42,99 no contrato de 24 meses (R$ 1.031,76); renova a R$ 77,99 |
| Supabase Pro | US$ 25 (~R$ 140) |
| WAHA | grátis |
| **Total** | **~R$ 183** |

Ponto de equilíbrio: **6 clientes Essencial** no uso comum (18 se todos usarem a franquia inteira). A Focus
(R$ 119,90) entra quando houver ERP ou OS além da JoGrampo. **Conferir o WAHA:** o Core grátis roda uma sessão só
("default"), e a Livih tem 3 ativas com nomes próprios; se um cliente novo exigir o Plus pago, cada número passa a
ter custo.

### Módulos

| Item | Preço ao cliente | Custo na Focus | Sobra antes do imposto |
|---|---|---|---|
| **ERP** (pedidos, estoque, entrada por nota, NF-e), com 1 CNPJ e 100 notas por mês | **R$ 79,90/mês** (02/11) | ~R$ 39,90 | ~R$ 40 |
| **Ordens de serviço** (OS, etapas, PDF, NFS-e), com 1 CNPJ e 100 notas por mês | **R$ 79,90/mês** (02/11) | ~R$ 39,90 | ~R$ 40 |
| **ERP e OS juntos** no mesmo CNPJ, com 100 notas por mês | **R$ 109,80/mês** (79,90 + 29,90; 02/11) | ~R$ 39,90 | ~R$ 70 |
| CNPJ adicional | **R$ 49/mês** | R$ 39,90 | ~R$ 9 |
| Nota além das 100 por CNPJ | **R$ 0,20** | R$ 0,11 | R$ 0,09 |

Os módulos podem ser contratados do Start para cima; o Essencial não tem ERP nem OS. Os dois juntos têm desconto
porque a Focus cobra o CNPJ uma vez só, emita ele NF-e, NFS-e ou as duas.

Exemplo: a JoGrampo (2 CNPJs) no Start com o ERP pagaria R$ 99,90 + 79,90 + 49 = R$ 228,70 (preços de 02/11). Como é do Programa Fundadores,
o ERP segue sem custo para ela.

A primeira sugestão (ERP e OS a R$ 79 com a nota incluída) foi revista ao ver o custo da Focus: um cliente com 2 CNPJs
custaria ~R$ 80 só de Focus. O CNPJ adicional só cobre a Focus, de propósito, para não espantar quem tem vários CNPJs.

### Mensal e anual (01/11)

O anual é **"pague 10 meses e use 12"** (~17 % de desconto): o formato mais comum nos sistemas por assinatura, fácil
de explicar e com valores redondos.

| Plano | Mensal | Anual | Por mês no anual | Economia no ano |
|---|---|---|---|---|
| Essencial | R$ 49,90 | **R$ 499** | R$ 41,58 | R$ 99,80 |
| Start | R$ 99,90 | **R$ 999** | R$ 83,25 | R$ 199,80 |
| Pro | R$ 149,90 | **R$ 1.499** | R$ 124,92 | R$ 299,80 |
| Business | R$ 199,90 | **R$ 1.999** | R$ 166,58 | R$ 399,80 |

| Módulo | Mensal | Anual |
|---|---|---|
| ERP ou OS | R$ 79,90 | **R$ 799** |
| ERP e OS juntos | R$ 109,80 | **R$ 1.098** |
| CNPJ adicional | R$ 49 | **R$ 490** |

- **Pior caso no anual** (franquia cheia todo mês, R$ 0,20 por atendimento, Anexo V e uma taxa de cobrança só no ano):
  sobram ~R$ 5 no Essencial, ~R$ 0 no Start e ~R$ 5 no Pro; o **Business fica ~R$ 19 negativo** por mês. Com o custo
  real de outubro (~R$ 0,11), sobram ~R$ 50 no Business. Risco aceito: um desconto menor não resolve (o Business
  mensal já sobra só ~R$ 7 no pior caso), e usar os 800 atendimentos todo mês é raro (a JoGrampo fez 78 em outubro).
- **O excedente e os pacotes seguem mensais** também no anual: o cliente que pagou o ano não espera 12 meses para
  pagar o que passou da franquia. Cobrar num Pix ou boleto à parte no mês, ou deixar o cliente anual só com pacotes
  comprados antes (em aberto).
- **Formas de pagamento (Asaas):** mensal no cartão recorrente (menos inadimplência) ou Pix/boleto todo mês; anual
  no Pix ou boleto à vista, ou no cartão parcelado. Antes de oferecer parcelado sem juros, conferir a taxa do Asaas
  para parcelamento e antecipação, que sai do desconto.
- **Troca de plano no anual:** subir pode a qualquer momento, pagando a diferença dos meses que faltam; descer, só na
  renovação.

### Custo da Focus (plano Start, que o usuário pensa em contratar, 28/10)

| Item | Custo |
|---|---|
| Mensalidade, com 3 CNPJs | R$ 119,90 |
| CNPJ adicional | R$ 39,90/mês |
| Documentos | 100 por CNPJ; R$ 0,11 cada um a mais |

- Conta como documento cada nota **emitida ou recebida** pela Focus. A entrada por nota da Livih lê o arquivo enviado
  pelo usuário, sem passar pela Focus, e não deve contar. Confirmar se cancelamento e carta de correção contam.
- Inclui NF-e, NFS-e, NFC-e, CT-e, MDF-e, NFCom e DC-e.
- **Vagas:** os 2 CNPJs da JoGrampo ocupam 2 das 3; a F7 fica fora da Focus ([nfse.md](nfse.md)). O próximo cliente
  com 1 CNPJ entra sem custo extra; daí em diante, R$ 39,90 por CNPJ. A mensalidade dividida pelos 3 dá os mesmos
  ~R$ 40 por CNPJ, por isso o preço do módulo não muda com as vagas.

### Comparação com o Bling (página de planos, 28/10)

| Plano | Preço | O que tem |
|---|---|---|
| Cobalto | R$ 60/mês | Contas a pagar e receber, estoque, vendas multicanal, notas fiscais ilimitadas, 5 usuários |
| Titânio | R$ 96/mês | Mais boleto, conciliação bancária e DRE, 50 usuários, até 3 CNPJs |
| Diamante | R$ 357,50/mês | Mais suporte premium no WhatsApp, até 5 CNPJs |

A página mostra mais de um valor para o Titânio e o Diamante (parece promoção de Black Friday). Não fala de CRM nem
de atendimento com IA.

Conclusão: **o ERP e a nota da Livih não podem custar mais que o Bling**, que tem mais recursos (financeiro, boleto,
nota ilimitada). A primeira sugestão (ERP a R$ 149 e nota a R$ 79, R$ 228 juntos) foi descartada por isso. O valor do
módulo está no pedido montado pelo agente na conversa, não em ter mais recursos. O núcleo não tem concorrente no
Bling.

### Comparação com a Omie (página de preços, 28/10)

| Plano | Preço | O que tem |
|---|---|---|
| ERP Padrão | a partir de R$ 309/mês | Financeiro completo, fluxo de caixa, boleto e link de pagamento, notas fiscais, estoque, sugestão de compra, produção, oportunidades, prestação de serviços e contratos recorrentes, usuários ilimitados |
| Omie Multivarejo | a partir de R$ 419/mês | Tudo do Padrão, mais e-commerce, marketplaces e frente de caixa |

O preço sobe pela faixa de faturamento da empresa (a página não mostra o valor de cada faixa) e não informa limite
de notas, de CNPJs nem custos extras. Cita "Omie no WhatsApp" e "Omie.IA Fiscal", sem dizer se estão nos planos; não
há agente de atendimento com IA.

Leitura: a Omie é o ERP completo e mais caro; o Bling, o barato. A Livih com ERP (Start + ERP = R$ 198,90, na escada
de 29/10) custa menos que o Padrão da Omie e entrega outra coisa: o atendimento com IA e o CRM, com um ERP mais simples. Contra "Omie mais um
agente de IA à parte" (R$ 309 + R$ 200 a 1.000), a Livih sai bem mais barata. O ponto fraco nas duas comparações é o
mesmo: **o financeiro** (contas a receber, boleto, fluxo de caixa), que Bling e Omie têm e a Livih ainda não.

### Referência de mercado dos agentes de IA no WhatsApp

Resumo de uma busca do usuário em 28/10 (números aproximados, não conferidos nas páginas de cada empresa):

| Faixa | Preço | O que costuma ter |
|---|---|---|
| Básico | R$ 100 a 200/mês | Menus, respostas a perguntas frequentes, transbordo para atendente |
| Intermediário | R$ 200 a 1.000/mês | Entende áudio, consulta base de conhecimento, lê PDF, integrações simples (status de pedido) |
| Avançado | a partir de R$ 1.400/mês | Integração com CRMs grandes, vários números, alto volume |

Exemplos citados: Chat Inteligente/Clint ~R$ 149, Wati ~R$ 369 (US$ 69), SleekFlow ~R$ 589.

O agente da Livih já faz o que a faixa intermediária promete (áudio, base, PDF, status de pedido e de OS) e vai além
(monta e envia o orçamento, identifica produto por foto, CRM e funil próprios). Na escada de 29/10, o Essencial
(R$ 49,90) e o Start (R$ 99,90) ficam abaixo da faixa básica entregando o intermediário; o Pro (R$ 149,90) e o
Business (R$ 199,90) ficam na faixa básica (01/11). Antes de anunciar, conferir nas páginas de cada concorrente o que entra no plano de
entrada (números, usuários, IA inclusa ou à parte, taxas da Meta).

## Vender uma parte sozinha

- **Só CRM com o agente:** sim, é o núcleo.
- **Só nota fiscal:** não por enquanto. Concorre com emissores baratos (Bling, a própria Focus, o emissor do Sebrae), o
  suporte é pesado (credenciamento na SEFAZ, rejeições, contador) e exigiria uma tela de NF-e avulsa (a NFS-e avulsa já existe).
- **Só ERP:** não por enquanto. Concorre com Bling, Tiny e Omie, que já têm financeiro e cobrança. Reavaliar depois do
  financeiro.

## Integrar com o Bling em vez de concorrer (em aberto)

Muitos clientes já usam o Bling e não vão trocar. A Livih pode **se integrar a ele**: o pedido que o agente monta na
conversa vai direto para o Bling, que emite a nota e cobra. A Livih vende o núcleo, onde não tem concorrente, para
quem já tem ERP; o ERP próprio fica para quem não tem nenhum (como a JoGrampo, que anotava pedidos no papel). A ideia
já estava no radar das [pendências](pendencias.md) desde 10/10.

## O que muda nos planos de 20/10

- Os planos já variam por números de WhatsApp e atendimentos do agente, e isso continua: **viram os níveis do
  núcleo**, agora com o Essencial embaixo (29/10). ERP e OS passam a ser somados por cima.
- **Programa Fundadores:** o preço travado por 12 meses e o ERP sem custo continuam valendo para quem já entrou. O
  modelo novo vale para os próximos clientes.

## Passos para chegar lá

Em ordem; cada passo é uma entrega com o seu arquivo em `docs/` quando for construído.

1. **Decidir o modelo** (sem código): fechar as decisões em aberto abaixo e os preços.
2. **Feito em 01/11 (com o passo 5), migration `20261101120000_planos_franquia`; ver "Franquia construída" abaixo.**
   **Planos e franquia no banco**: o plano de cada empresa (nível do núcleo, números de WhatsApp e franquia de
   atendimentos), a contagem de atendimentos do agente no mês, os pacotes e créditos, a escolha do cliente ao passar
   (parar ou continuar), o excedente do mês e os avisos ao cliente e à plataforma em 80 % e 100 %. Na tela Empresas, a
   plataforma escolhe o plano, vê o consumo e acrescenta créditos de cortesia. O agente só muda para parar quando o
   cliente escolheu parar.
3. **Feito em 02/11 (entrega 4a).** **Nota fiscal dentro do ERP e das OS**: políticas e Edge Functions de nota (`nfe-config`, `nfe-emitir`,
   `nfse-emitir`) exigem o ERP ou as OS ligados; o botão de nota some sem eles. Quem já emite tem os módulos ligados.
4. **Limite de números de WhatsApp** ao conectar um número (feito em 02/11, entrega 4a), e franquia de notas fiscais.
5. **Feito em 01/11 (falta pedir módulo novo pela tela).** **Tela de plano para o dono da empresa**: o que está contratado, o consumo do mês, a escolha de parar ou
   continuar ao passar da franquia, a compra de pacote e como pedir um módulo novo.
6. **Cobrança da Livih**: assinatura recorrente por empresa, mensal ou anual, somando o plano do núcleo, os módulos
   ligados, os pacotes e o excedente do mês anterior (Asaas, o mesmo que vai servir ao financeiro do ERP). No anual,
   o excedente e os pacotes saem numa cobrança mensal à parte. Cancelamento do anual com devolução proporcional
   (meses usados a preço mensal). Com a cobrança pronta, publicar a página de planos do site
   ([site-planos.md](site-planos.md)).
7. **Depois, para abrir "só ERP" e "só nota fiscal"**: financeiro no ERP (contas a receber, cobrança), NF-e avulsa e
   o núcleo enxuto para quem não usa WhatsApp. Só com cliente real pedindo.

## Franquia construída (01/11)

Migration `20261101120000_planos_franquia.sql`, testes no fim de `scripts/teste_fase1.sql`.

- **Catálogo `planos`** com os preços, números e franquias de 01/11, mais o `interno` (sem limite). A coluna
  `organizacoes.plano`, que já existia, aponta para ele; todas as empresas continuam no `interno` até a plataforma
  escolher o plano na tela Empresas.
- **Contagem na hora:** um gatilho em toda mensagem do agente (texto, arquivo, documento) grava o atendimento em
  `atendimentos_agente`. O `uso_ia` não serve para isso: chega minutos depois, pelo coletor da VPS. O simulador não
  conta.
- **Janela de 24 h a partir do início:** o atendimento começa na primeira mensagem do agente numa conversa sem
  atendimento iniciado nas últimas 24 h e conta no mês em que começou (horário de Brasília).
- **Parar:** quando a próxima resposta começaria um atendimento novo e o limite acabou, o `agente_deve_responder`
  passa a conversa para a equipe com o motivo "Os atendimentos do agente deste mês acabaram…" e o aviso de sempre.
  Atendimento já começado segue até fechar as 24 h. Nada muda no n8n.
- **Continuar:** o agente segue e o atendimento fica marcado como excedente, para a cobrança do passo 6.
- **Escolha padrão: parar** (sem cobrança surpresa). Só o **dono** muda a escolha e compra pacote; administradores
  veem o consumo. A equipe da plataforma não compra pacote em nome do cliente (para isso há a cortesia). Clique duplo
  não compra dois pacotes: a compra leva o limite que a tela mostrou e é recusada se ele já mudou.
- **O consumo do mês conta desde o dia 1, também no plano interno.** Trocar de plano no meio do mês leva em conta o
  que já foi usado, e o dono recebe o aviso na hora se o novo limite já estiver perto ou acabado. Conferir o consumo
  na tela Empresas antes de trocar.
- **A conversa que passou para a equipe fica com a equipe.** Quando o mês vira ou o dono compra pacote, o agente
  volta a atender as conversas novas; as que já estavam com a equipe voltam como hoje (devolver ao agente ou encerrar).
- **Caso aceito:** se o limite acaba enquanto o agente pensa, a resposta dele ainda sai e conta um atendimento além do
  limite, sem cobrança.
- **Pacote** (100 por R$ 29,90) vale até o fim do mês da compra; o que sobrar não passa para o mês seguinte. A
  cortesia da plataforma também vale no mês e exige motivo.
- **Avisos aos 80 % e aos 100 %**, uma vez por limite no mês (com pacote novo, valem de novo): dono e administradores
  no celular e no WhatsApp cadastrado em Seus dados; equipe da plataforma no celular.
- **Telas:** Configurações → Plano e consumo (antes "Uso da IA") para o dono; botão Plano e a linha de consumo na
  tela Empresas para a plataforma.

## Regras construídas (02/11, entrega 4a)

Migration `20261102140000_planos_troca.sql`, testes no fim de `scripts/teste_fase1.sql`.

- **Módulos:** ERP ou OS a R$ 79,90; os dois juntos, R$ 109,80 na fatura.
- **Troca pelo dono** em Configurações → Plano e consumo, com prévia antes de confirmar (`plano_trocar`); só o dono
  de fato (no modo suporte, a equipe troca pela tela Empresas):
  - **subir** vale na hora. Se a fatura do mês já saiu, a diferença dos dias que faltam, contando o dia da troca, vai
    para `cobranca_ajustes` e entra na fatura seguinte, e a **franquia a mais vem na mesma proporção** (crédito
    negativo do tipo `troca`; decisão de 02/11, para fechar a brecha de subir no último dia e descer em seguida). Se a
    fatura do mês ainda não saiu, ela sai com o plano novo inteiro: sem ajuste e com a franquia cheia;
  - **descer** fica em `organizacoes.plano_proximo` com a data em `plano_proximo_em` (dia 1 do mês seguinte, mesmo
    pedida no próprio dia 1) e vale às 00:05 desse dia (cron `livih-planos-agendados`, e de novo no fechamento das
    06:00). Escolher de novo o plano atual desfaz a descida.
- **Só com a cobrança ligada e sem valor combinado:** sem contrato, o plano não é cobrado (subir sairia de graça); com
  valor combinado, o preço não segue a tabela. Nesses casos, a tela diz para falar com a equipe, e a troca é pela tela
  Empresas (imediata, sem ajuste, e desfaz a descida agendada). No teste grátis (cobrança começa no mês seguinte), a
  troca não gera ajuste.
- **Limite de números** (`canais_limite_plano`): conta os números ativos ("Desconectar" mantém o número; "Remover"
  libera a vaga). Nenhum número novo além do plano; com descida agendada, vale o menor limite. Plano interno, sem
  limite. Trocar para um plano com menos números do que a empresa tem é recusado com quantos remover.
- **Nota fiscal** (`nota_fiscal_liberada`): configurar e emitir exigem o ERP ou as OS ligados (`nfe-config`,
  `nfe-emitir`, `nfse-emitir` e a tela). As notas já emitidas continuam visíveis.
- **Vaga conferida antes** (`canais_sem_vaga`): a `whatsapp-conexao` confere o limite antes de registrar o número na
  Meta ou trocar o código do Embedded Signup, que não se desfazem; o gatilho confere de novo ao gravar.
- **Ficou para depois** (revisão de 02/11): a plataforma cancelar um ajuste pela tela (hoje, só com SQL); ajustes de
  um mês sem fatura (empresa suspensa o mês inteiro) se perdem, como os atendimentos a mais; o preço dos dois módulos
  juntos (R$ 109,80) está escrito na `cobranca_itens`, não no catálogo.

## Regras construídas (02/11, entrega 4b)

Migration `20261102150000_planos_anual_modulos.sql`, Edge Function `asaas-cobranca`, testes no fim de
`scripts/teste_fase1.sql`.

- **Mensal ou anual pelo dono** (Plano e consumo → Como pagar, `plano_ciclo`). O anual começa no dia 1 seguinte; no
  teste grátis, já na primeira fatura. A fatura do mês em que o ano começa leva o plano e os módulos do ano inteiro
  (R$ 499 a R$ 1.999; ERP ou OS R$ 799, os dois R$ 1.098) mais o resto do mês anterior; nos outros meses, a fatura sai
  só com os atendimentos a mais, os pacotes e os ajustes (R$ 5 ou mais).
- **Pagamento do anual:** à vista (Pix, boleto ou cartão) ou no cartão em 2 a 12 parcelas sem juros, escolhido pelo
  dono (`contratos_cobranca.anual_parcelas`). No Asaas, a fatura parcelada vira um parcelamento no cartão; cancelar
  apaga o parcelamento inteiro.
- **Subir no anual** vale na hora, com uma **cobrança avulsa** (`faturas.tipo = 'avulsa'`, vence em 3 dias) da
  diferença anual pelos meses que faltam, contando o atual; a renovação não muda. Se a fatura do ano ainda não saiu,
  ela sai com o plano novo. **Descer, desligar módulo e voltar ao mensal** valem na renovação.
- **Renovação automática** no dia 1 em que o ano fecha, pelo preço de tabela, junto com as descidas e desligamentos
  marcados para ela (`planos_aplicar_agendados`, antes do fechamento). Aviso ao dono e à plataforma 15 dias antes
  (`cobranca_avisar_renovacoes`, 09:20), menos para quem já pediu o mensal.
- **Encerrar o anual** (plataforma, janela Plano): mostra a devolução (integral até 7 dias depois do pagamento da
  fatura anual; depois, o pago no ano menos os meses usados, contando o atual, a preço mensal de hoje; do 10º mês em
  diante, nada), volta ao mensal e desliga a cobrança. A devolução é feita à mão no painel do Asaas. Desligar a
  cobrança ou combinar um valor de uma empresa no anual passa antes por aqui.
- **Módulos pelo dono** (`modulo_contratar`): ligar vale na hora (mensal: a diferença dos dias que faltam vira ajuste
  na próxima fatura; anual: cobrança avulsa da diferença dos meses que faltam; ERP com OS: só os R$ 29,90 a mais).
  Desligar vale no dia 1 seguinte (anual: na renovação), sem devolução; no teste grátis, na hora. Ligar de novo antes
  da data só desfaz o desligamento. O Essencial não contrata módulo, e descer ao Essencial pede para desligar antes os
  módulos. A plataforma recebe o aviso para conferir a vaga na Focus.

## Decisões em aberto

- Fechados em 02/11 (seção "Decidido em 02/11"): preço dos módulos, usuários no Essencial e anual parcelado sem
  juros. O excedente no anual já tinha ficado em fatura mensal à parte ([cobranca-asaas.md](cobranca-asaas.md)).
- **WAHA:** confirmar a versão e a licença que rodam na VPS (seção de custos fixos).
- **Contratar o plano Start da Focus** e confirmar se cancelamento e carta de correção contam como documento.
- **Integração com o Bling**: fazer ou não, e antes ou depois do financeiro próprio.
- **Regime tributário** (Anexo III ou V), que afeta a margem de todos os preços (em aberto desde 20/10).
