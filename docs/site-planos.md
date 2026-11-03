# Preços no site (planejado em 01/11)

Levar os planos de [planos-modulos.md](planos-modulos.md) (núcleo em escada e anual de 01/11) para o site
institucional, que até agora não mostra preço nenhum.

## Antes de publicar

O preço publicado é promessa. Ainda não existem:
- a contagem de atendimentos, o aviso em 80 % e a escolha de parar ou pagar o excedente (passos 2 e 5 de
  [planos-modulos.md](planos-modulos.md#passos-para-chegar-lá));
- a cobrança mensal e anual pelo Asaas (passo 6);
- as decisões em aberto: preço dos módulos e usuários no Essencial.

O site dizia que "nossa equipe conecta os números e configura o agente com você", mas no Essencial a implantação é
feita pelo próprio cliente ou cobrada à parte. **Resolvido em 01/11:** a página inicial e as de solução falam da ajuda
da equipe "no teste" (que é no Start), e a página de planos ganhou a pergunta "Quem faz a implantação?".

## Onde entra

- **Página nova `/planos/`**, a completa (também para quem busca "preço CRM WhatsApp").
- **Seção curta na página inicial**, entre Soluções e Perguntas: os 4 planos com preço e o principal de cada um, com
  o link para a página.
- **"Planos" no menu de cima e no rodapé** de todas as páginas: inicial, as 6 de solução (pelo gerador), termos,
  privacidade e 404.

## A página `/planos/`

1. Título e a chave **Mensal / Anual** ("2 meses grátis"), começando no mensal. Sem JavaScript, os dois preços
   aparecem.
2. **4 cartões**, com o Start em destaque ("Recomendado"; "mais escolhido" seria falso sem clientes nele): preço
   (no anual, o total e quanto dá por mês), números de WhatsApp, atendimentos do agente, usuários, implantação e se
   aceita os módulos.
3. O que vem em todos os planos, e **"mais de 5 números: fale com a gente"**.
4. **Módulos**, do Start para cima: ERP, OS e os dois juntos, com as notas e o CNPJ adicional.
5. **"O que é um atendimento"** e **"e se passar da franquia"** (parar ou R$ 0,40; pacote de 100 a R$ 29,90).
6. Perguntas dos planos: troca de plano, usar sem o agente, mensagens da Meta, formas de pagamento, teste grátis.
7. Chamada para os 30 dias grátis (o formulário da página inicial).

## Técnico

- Gerador `site/gerar_planos.py`, com os preços num dicionário só, no padrão do `gerar_solucoes.py` (de onde
  reaproveita o rodapé, o WhatsApp e o Analytics). Mudou o preço: editar o dicionário e rodar
  `python site/gerar_planos.py` na raiz do repo.
- CSS novo no fim do `site.css` (cartões de plano e a chave), sem mexer no que existe.
- A chave Mensal/Anual é um script pequeno sem biblioteca, como o do formulário.
- SEO: título e descrição próprios, `AggregateOffer` (R$ 49,90 a R$ 199,90) no `SoftwareApplication`, `FAQPage` e
  `BreadcrumbList`. Entrar no `sitemap.xml` só quando a página for anunciada no menu.

## Termos de Uso

Seção nova de cobrança: plano mensal ou anual, excedente cobrado no mês, reajuste anual, suspensão por falta de
pagamento (já está) e o cancelamento do anual.

## Revisão e publicação

`revisor-textos` nos textos, conferência no celular e no computador pelo Playwright, commit dos arquivos do site.
**O site sai com o `git push`**: é do usuário, ou do Claude com aprovação.

## Decidido em 01/11

- **Publicar só depois da cobrança pronta** (passo 6 de [planos-modulos.md](planos-modulos.md)). Enquanto isso, a
  página `/planos/` não vai para o git: todo `git push` publica o site. Pode entrar no git só o gerador
  (`site/gerar_planos.py`), o CSS e este arquivo; `site/public/planos/` fica de fora até a cobrança.
- **Teste de 30 dias no plano Start**, com o ERP e as Ordens de serviço liberados para testar (na pergunta "Como
  funciona o teste grátis?").
- **Cancelamento do anual: devolução proporcional, recalculando os meses usados pelo preço mensal.** Até 7 dias
  depois do primeiro pagamento, devolução integral; depois, devolve o pago menos os meses usados a preço mensal
  (Start anual de R$ 999 cancelado no 6º mês: R$ 999 − 6 × R$ 99,90 = R$ 399,60). O desconto do anual só vale para
  quem fica o ano; do 10º mês em diante não há devolução. Escolhido no lugar de "sem devolução" porque não assusta
  quem paga o ano adiantado e uma retenção integral pode ser vista como abusiva com empresa pequena. Conferir a
  redação dos Termos com advogado ou contador.

## Em aberto (com o usuário)

1. Destacar o Start ou o Pro (a página saiu com o Start, que também é o plano do teste).

## Encontrado no caminho

- A página de solução **Orçamentos e pedidos** diz que é "pacote adicional" e que a Livih "ainda não" emite nota
  fiscal. Pelos planos de 01/11, o orçamento é do núcleo e o pedido, o estoque e a nota são do ERP. Corrigir no
  `gerar_solucoes.py` junto com o menu.

## Andamento

- 01/11: página `/planos/` feita pelo gerador, ainda sem link no menu nem no sitemap (não está anunciada).
- 03/11, no `main` (sem preço, pode publicar quando quiser): a página Orçamentos e pedidos diz que a NF-e existe e que
  pedido, estoque, financeiro e nota são do ERP; "usá-la" nos Termos.
- 03/11, no branch **`site-planos`** (entra no `main` com o passo 6, Asaas de produção):
  - preços dos módulos de 02/11 (R$ 79,90, juntos R$ 109,80; anual R$ 799 e R$ 1.098) e o financeiro nas descrições;
  - perguntas novas: plano anual, cancelamento do anual, ligar e desligar módulos; troca de plano e formas de
    pagamento pelas regras da entrega 4a e 4b;
  - seção Planos na página inicial, **gerada pelo `gerar_planos.py`** entre os comentários `planos:inicio` e
    `planos:fim` do `index.html` (os preços ficam num lugar só);
  - "Planos" no menu (visível também no celular, classe `sempre`) e no rodapé de todas as páginas, menos a 404;
  - Termos: seção 8 "Planos, pagamento e cancelamento" (as seguintes renumeradas), atualização de 3 de novembro;
  - sitemap com `/planos/` e as datas de 03/11.
- **Decidido em 03/11:** o mensal cancelado vale até o fim do mês já faturado, sem devolução; o reajuste é no máximo
  uma vez a cada 12 meses, com 30 dias de aviso (no anual, na renovação).
- 03/11: o CNPJ adicional e as notas além das 100 passaram a ser cobrados na fatura (migration
  `20261103120000_cobranca_cnpj_notas.sql`, no `main`).
- **Publicado em 03/11** por decisão do usuário, antes do Asaas de produção e da revisão do advogado (muda a decisão
  de 01/11). Falta: o advogado ou o contador revisar a seção 8 dos Termos; o Asaas de produção pronto antes do fim
  do primeiro teste de 30 dias que vier pelo site.
