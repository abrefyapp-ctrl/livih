# Planos por módulo (proposto em 28/10)

Ideia do usuário em 28/10: cobrar por módulo, porque o cliente pode querer só a nota fiscal, só o ERP, só o CRM ou
só o agente. Este arquivo é a proposta para decidir juntos; a tabela de planos em vigor continua no
[roadmap](roadmap.md#planos-revisto-em-2010) até a decisão.

## A proposta em uma frase

**Um núcleo obrigatório, o CRM do WhatsApp com o agente de IA, e módulos pagos por cima** (ERP, ordens de serviço,
nota fiscal), com pacotes prontos para quem não quer montar sozinho.

**Decidido em 28/10:**
- o formato acima, com os pacotes; "só nota fiscal" e "só ERP" ficam para depois do financeiro;
- **o agente entra no núcleo**, em todo plano: é a essência da Livih. O que muda de um plano para outro é a franquia
  de atendimentos do agente, não ter ou não o agente;
- **Agenda e Campanhas entram no núcleo**;
- **franquia do agente (28/10):** o modelo de IA não muda (segue o gpt-5-mini); as franquias dos planos aumentam para
  não faltar, e em 80 % **a Livih é avisada** e acrescenta créditos se for preciso (seção própria abaixo).

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
- **A nota fiscal sai de um pedido (ERP) ou de uma OS**, com o cliente e os produtos cadastrados. Ainda não existe
  nota avulsa.
- **O ERP e as OS usam clientes e produtos**, que também servem ao CRM e ao agente.

## Núcleo e módulos

| Parte | O que tem | Depende de | Já é módulo hoje? |
|---|---|---|---|
| **Núcleo** | Conversas no WhatsApp, contatos, clientes, produtos, funil, carteira, equipe, painel, agenda, campanhas e o **agente de IA** (atendimento, orçamento pelo agente, simulador, saúde, orientador) | — | É a base. A agenda é módulo ligado por padrão; o agente liga por canal (`agentes.ativo`) |
| **ERP** | Pedidos, estoque, entrada por nota; depois financeiro e cobrança | Núcleo | Sim (`erp`) |
| **Ordens de serviço** | Equipamento para conserto, etapas, faturamento, PDF da OS | Núcleo | Sim (`os`) |
| **Nota fiscal** | NF-e e NFS-e pela Focus | ERP ou OS | Não: a configuração fica liberada para todos |

O catálogo `modulos` e a regra `modulo_ativo(org, codigo)` (13/10) já resolvem a parte técnica: módulo novo = uma
linha no catálogo, `modulo_ativo` nas políticas e no que o módulo dispara, e o item de menu condicionado.

## Como cobrar cada um

O que pesa no custo muda de parte para parte, e a cobrança deve seguir o custo:

| Parte | Custo da Livih | Cobrar por |
|---|---|---|
| Núcleo | Fixo (servidor, suporte) e **variável no agente**: IA por resposta (~R$ 0,02; ~R$ 0,11 por atendimento na JoGrampo em outubro) | Mensalidade por plano, que varia pelos números de WhatsApp e pela franquia de atendimentos do agente |
| ERP | Fixo | Mensalidade |
| OS | Fixo | Mensalidade |
| Nota fiscal | **Variável**: a Focus cobra por CNPJ e por volume de notas | Por CNPJ, com franquia de notas |

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

## Pacotes prontos (exemplo para discutir)

| Pacote | Inclui | Para quem |
|---|---|---|
| **Comercial** | Núcleo + ERP + Nota fiscal | Revenda e distribuidora (perfil JoGrampo) |
| **Serviços** | Núcleo + OS + Nota fiscal | Assistência técnica e manutenção (perfil do piloto de motores) |

Só o núcleo já é o plano de quem vende pelo WhatsApp e quer responder rápido. Os módulos soltos continuam à venda; o
pacote sai com desconto e vende a ideia de "tudo a partir da conversa".

## Vender uma parte sozinha

- **Só CRM com o agente:** sim, é o núcleo.
- **Só nota fiscal:** não por enquanto. Concorre com emissores baratos (Bling, a própria Focus, o emissor do Sebrae), o
  suporte é pesado (credenciamento na SEFAZ, rejeições, contador) e exigiria uma tela de nota avulsa. Pode virar porta
  de entrada depois, com preço que cubra a Focus e o suporte.
- **Só ERP:** não por enquanto. Concorre com Bling, Tiny e Omie, que já têm financeiro e cobrança. Reavaliar depois do
  financeiro.

## O que muda nos planos de 20/10

- Os planos Start, Pro e Business já variam por números de WhatsApp e atendimentos do agente, e isso continua: **viram os
  níveis do núcleo**. ERP, OS e nota fiscal passam a ser somados por cima.
- **Programa Fundadores:** o preço travado por 12 meses e o ERP sem custo continuam valendo para quem já entrou. O
  modelo novo vale para os próximos clientes.

## Passos para chegar lá

Em ordem; cada passo é uma entrega com o seu arquivo em `docs/` quando for construído.

1. **Decidir o modelo** (sem código): fechar as decisões em aberto abaixo e os preços.
2. **Planos e franquia no banco**: o plano de cada empresa (nível do núcleo, números de WhatsApp e franquia de
   atendimentos), a contagem de atendimentos do agente no mês, os créditos extras e o aviso para a plataforma em 80 % e 100 %.
   Na tela Empresas, a plataforma escolhe o plano, vê o consumo e acrescenta créditos. O agente não muda.
3. **Nota fiscal vira módulo** (`nfe`): políticas e Edge Functions de nota (`nfe-config`, `nfe-emitir`,
   `nfse-emitir`) exigem o módulo; o botão de nota some sem ele. Ligar para quem já emite.
4. **Limite de números de WhatsApp** ao conectar um número, e franquia de notas fiscais.
5. **Tela de plano para o dono da empresa**: o que está contratado, o consumo do mês e como pedir um módulo novo.
6. **Cobrança da Livih**: assinatura recorrente por empresa, somando o plano do núcleo e os módulos ligados (Asaas, o
   mesmo que vai servir ao financeiro do ERP).
7. **Depois, para abrir "só ERP" e "só nota fiscal"**: financeiro no ERP (contas a receber, cobrança), nota avulsa e
   o núcleo enxuto para quem não usa WhatsApp. Só com cliente real pedindo.

## Decisões em aberto

- **Preço de cada nível do núcleo, de cada módulo e de cada pacote.**
- **Custo da Focus** por CNPJ e por nota, para precificar a nota fiscal (conferir no contrato de revenda).
- **Teste grátis**: por módulo, por pacote ou nenhum (o Programa Fundadores já tem o piloto de 30 dias).
- **Regime tributário** (Anexo III ou V), que afeta a margem de todos os preços (em aberto desde 20/10).
