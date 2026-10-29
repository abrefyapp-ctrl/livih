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
- **franquia do agente:** o modelo de IA não muda (segue o gpt-5-mini); as franquias dos planos aumentam para não
  faltar, e em 80 % **a Livih é avisada** e acrescenta créditos se for preciso (seção própria abaixo);
- **nota fiscal não é módulo à parte:** vem incluída no ERP (NF-e) e nas OS (NFS-e). Com isso, os pacotes saíram: o
  cliente paga o núcleo mais cada módulo (depois de comparar com o Bling, seção de preços).

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

## Franquia do agente (decidido em 28/10)

Com o agente em todo plano, a franquia é o que segura o custo. No começo a prioridade é atrair clientes, então o
agente **não para** e o cliente **não leva cobrança surpresa**.

- **O modelo de IA não muda:** segue o gpt-5-mini em todo plano. Trocar por um modelo mais barato ao passar da
  franquia foi pensado e deixado de lado por enquanto (um modelo menor erra mais nas ferramentas).
- **Franquias: 1.000, 2.000 e 3.000 atendimentos por mês** (Start, Pro e Business), acima das de 20/10 (500, 1.200
  e 3.000), para a maioria dos clientes nunca chegar perto do limite.
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

  A JoGrampo usaria ~8 % da franquia do Start. Com ~R$ 0,02 por resposta, o atendimento sai por ~R$ 0,11, e as
  franquias cheias custariam ~R$ 110, ~R$ 220 e ~R$ 330 de IA por mês. Conferir o custo por resposta em `uso_ia`
  antes de fechar os preços.
- **Aviso para a Livih em 80 %:** quando uma empresa usa 80 % da franquia do mês, a equipe da plataforma recebe um
  aviso (notificação e WhatsApp, como os lembretes da agenda) com a empresa, o consumo e o custo do mês. O dono da
  empresa não recebe esse aviso.
- **Créditos extras:** a plataforma acrescenta atendimentos ao mês daquela empresa, na tela Empresas, se for preciso.
  Cobrar ou não pelos créditos é decisão comercial de cada caso (oferecer subir de plano, dar de cortesia).
- **Ao passar de 100 %** sem crédito novo, o agente **continua atendendo**; a plataforma recebe um segundo aviso. Parar
  o agente fica fora, porque o cliente ficaria sem atendimento.

## Preços sugeridos (28/10, a decidir)

### Núcleo

| Plano | Preço por mês | Números de WhatsApp | Atendimentos do agente | IA com a franquia cheia |
|---|---|---|---|---|
| Start | **R$ 197** | até 3 | 1.000 | ~R$ 110 |
| Pro | **R$ 397** | até 5 | 2.000 | ~R$ 220 |
| Business | **R$ 697** | até 10 | 3.000 | ~R$ 330 |

Sobe em relação a 20/10 (R$ 149, 299 e 599) porque a franquia mais que dobrou: a R$ 149, um Start com a franquia
cheia não deixaria margem depois da IA e do imposto. O pior caso ainda deixa margem, e o uso comum (10 % a 30 % da
franquia) deixa bastante. Para atrair os primeiros, o desconto fica no Programa Fundadores (R$ 149 e R$ 249 travados).

### Módulos

| Item | Preço ao cliente | Custo na Focus | Sobra antes do imposto |
|---|---|---|---|
| **ERP** (pedidos, estoque, entrada por nota, NF-e), com 1 CNPJ e 100 notas por mês | **R$ 99/mês** | ~R$ 39,90 | ~R$ 59 |
| **Ordens de serviço** (OS, etapas, PDF, NFS-e), com 1 CNPJ e 100 notas por mês | **R$ 99/mês** | ~R$ 39,90 | ~R$ 59 |
| CNPJ adicional | **R$ 49/mês** | R$ 39,90 | ~R$ 9 |
| Nota além das 100 por CNPJ | **R$ 0,20** | R$ 0,11 | R$ 0,09 |

Exemplo: a JoGrampo (2 CNPJs) no Start com o ERP pagaria R$ 197 + 99 + 49 = R$ 345. Como é do Programa Fundadores,
o ERP segue sem custo para ela.

A primeira sugestão (ERP e OS a R$ 79 com a nota incluída) foi revista ao ver o custo da Focus: um cliente com 2 CNPJs
custaria ~R$ 80 só de Focus. O CNPJ adicional só cobre a Focus, de propósito, para não espantar quem tem vários CNPJs.

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

### Referência de mercado dos agentes de IA no WhatsApp

Resumo de uma busca do usuário em 28/10 (números aproximados, não conferidos nas páginas de cada empresa):

| Faixa | Preço | O que costuma ter |
|---|---|---|
| Básico | R$ 100 a 200/mês | Menus, respostas a perguntas frequentes, transbordo para atendente |
| Intermediário | R$ 200 a 1.000/mês | Entende áudio, consulta base de conhecimento, lê PDF, integrações simples (status de pedido) |
| Avançado | a partir de R$ 1.400/mês | Integração com CRMs grandes, vários números, alto volume |

Exemplos citados: Chat Inteligente/Clint ~R$ 149, Wati ~R$ 369 (US$ 69), SleekFlow ~R$ 589.

O agente da Livih já faz o que a faixa intermediária promete (áudio, base, PDF, status de pedido e de OS) e vai além
(monta e envia o orçamento, identifica produto por foto, CRM e funil próprios). Os preços sugeridos do núcleo ficam
no começo dessa faixa: o Start a R$ 197 compete com o básico entregando o intermediário, e o Business a R$ 697 ainda
fica abaixo do meio da faixa. Antes de anunciar, conferir nas páginas de cada concorrente o que entra no plano de
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

- Os planos Start, Pro e Business já variam por números de WhatsApp e atendimentos do agente, e isso continua: **viram
  os níveis do núcleo**. ERP e OS passam a ser somados por cima.
- **Programa Fundadores:** o preço travado por 12 meses e o ERP sem custo continuam valendo para quem já entrou. O
  modelo novo vale para os próximos clientes.

## Passos para chegar lá

Em ordem; cada passo é uma entrega com o seu arquivo em `docs/` quando for construído.

1. **Decidir o modelo** (sem código): fechar as decisões em aberto abaixo e os preços.
2. **Planos e franquia no banco**: o plano de cada empresa (nível do núcleo, números de WhatsApp e franquia de
   atendimentos), a contagem de atendimentos do agente no mês, os créditos extras e o aviso para a plataforma em 80 %
   e 100 %. Na tela Empresas, a plataforma escolhe o plano, vê o consumo e acrescenta créditos. O agente não muda.
3. **Nota fiscal dentro do ERP e das OS**: políticas e Edge Functions de nota (`nfe-config`, `nfe-emitir`,
   `nfse-emitir`) exigem o ERP ou as OS ligados; o botão de nota some sem eles. Quem já emite tem os módulos ligados.
4. **Limite de números de WhatsApp** ao conectar um número, e franquia de notas fiscais.
5. **Tela de plano para o dono da empresa**: o que está contratado, o consumo do mês e como pedir um módulo novo.
6. **Cobrança da Livih**: assinatura recorrente por empresa, somando o plano do núcleo e os módulos ligados (Asaas, o
   mesmo que vai servir ao financeiro do ERP).
7. **Depois, para abrir "só ERP" e "só nota fiscal"**: financeiro no ERP (contas a receber, cobrança), NF-e avulsa e
   o núcleo enxuto para quem não usa WhatsApp. Só com cliente real pedindo.

## Decisões em aberto

- **Fechar os preços sugeridos** do núcleo e dos módulos.
- **Contratar o plano Start da Focus** e confirmar se cancelamento e carta de correção contam como documento.
- **Integração com o Bling**: fazer ou não, e antes ou depois do financeiro próprio.
- **Teste grátis**: por módulo, por plano ou nenhum (o Programa Fundadores já tem o piloto de 30 dias).
- **Regime tributário** (Anexo III ou V), que afeta a margem de todos os preços (em aberto desde 20/10).
