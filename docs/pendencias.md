# Pendências

Coisas anotadas para corrigir depois. Tirar daqui quando entrar no commit.

## Front

- **Selo de data cobre a mensagem ao rolar** (anotado em 10/10). O separador "Hoje" da conversa é
  `sticky top-0` ([PainelConversa.tsx](../src/components/PainelConversa.tsx), no `<li>` do separador de dia) e,
  ao rolar, fica por cima do texto do balão logo abaixo. Visto no print da conversa da Fer (canal 4133663942).
  Ideia: separador fixo só como pílula com fundo/sombra e espaço reservado, ou deixar de ser sticky e mostrar
  a data flutuante só durante a rolagem (como o WhatsApp).

## Radar de produto

- **ERP como pacote adicional, ligado ao CRM** (anotado em 10/10). Módulo contratado à parte, por
  empresa, que nasce dos dados que o CRM já tem (contatos, oportunidades ganhas, pedidos anotados pelo
  agente). A definir: escopo do MVP (pedidos, estoque, financeiro, nota fiscal?), cobrança como add-on
  no plano, liberação por organização (feature flag) e integração com ERPs que o cliente já usa (ex.: Bling).
  **Piloto: JoGrampo** (decidido em 10/10) — a Liv já anota pedidos lá (ex.: 5 caixinhas do pino F15).

## Em aberto em 28/10 (passagem de sessão)

Anotado ao fim da sessão de 28/10, para continuar no dia seguinte. Tirar cada item quando resolver.

- **Financeiro, entrega 2** ([financeiro.md](financeiro.md)): banco aplicado (migration 20261029120000) e telas
  publicadas em 28/10 (commit 2feae0b). Falta testar com um pedido de verdade da JoGrampo (escolher forma e parcelas, confirmar, ver as parcelas no pedido e no Financeiro) e
  conferir a entrada por nota com o primeiro XML de verdade que traga duplicatas (a leitura de `cobr > dup` no
  navegador não tem teste automático).
- **Financeiro, próximo passo: entrega 3** (fluxo de caixa realizado e previsto, vencidos, totais por categoria, e o
  painel e a previsão das OS lendo os lançamentos). Depois: entrega 4 (Pix copia e cola com a chave da empresa e
  cobrança pelo WhatsApp). Em aberto no fim do [financeiro.md](financeiro.md): categorias padrão, juros e multa,
  lembrete de vencimento, taxa do cartão.
- **Dados de teste em produção:** na Cactos (demonstração) ficaram a conta "Banco Teste (demonstração)", as 3 parcelas
  de "Conserto de motores (teste)", baixas e uma transferência; somem quando a Cactos for apagada. Na F7 Tech, abrir o
  Financeiro criou as 7 categorias padrão e a conta Caixa (sem lançamentos).
- **Planos** ([planos-modulos.md](planos-modulos.md)): preços sugeridos (núcleo R$ 197/397/697 com 1.000/2.000/3.000
  atendimentos de 24 h; ERP e OS a R$ 99 com 1 CNPJ e 100 notas). Falta: aprovar os preços, contratar o plano Start da
  Focus (perguntar se cancelamento e carta de correção contam como documento), decidir a integração com o Bling e o
  anexo do Simples. Depois, construir os planos no banco (contagem de atendimentos e aviso à Livih em 80 %).
- **F7 fora da Focus:** decidir se desliga a configuração de nota da F7 na Livih ([nfse.md](nfse.md)); o usuário vai
  verificar.

## Em aberto em 27/10 (passagem de sessão)

Anotado ao fim da sessão de 25 a 27/10. Tirar cada item quando resolver.

- **NF-e no Paraná (FIXOTEC/JoGrampo, CNPJ 43.147.741/0001-02):** rejeição 974, porque a Focus ainda não está
  autorizada como sistema emissor na Receita/PR ([nfe.md](nfe.md), seção do Paraná). Falta: o contador da FIXOTEC fazer
  o registro (UPD → Autorização de Uso, CNPJ da Focus 07.504.505/0001-32, sistema 54078 AC-NFE), o usuário pedir o
  aceite à Focus e emitir de novo. Em 28/10: o procedimento do Paraná confirmou o código 54078 e que o aceite da Focus
  continua necessário; a tela (`CredenciamentoSefaz.tsx`) já segue esse procedimento. Ainda em aberto: quais outros
  estados exigem o mesmo cadastro.
- **Termos de Uso e Privacidade (site):** atualizados em 27/10 (API oficial, campanhas, consentimento). Falta a revisão
  do advogado e o aviso às empresas clientes (seção 11 dos termos).
- **Publicar as funções com textos no feminino** (commit 2863bec), se ainda não foi feito:
  `npx supabase functions deploy convidar-membro pedido-acesso nfe-config nfe-emitir nfe-retorno nfse-emitir
  whatsapp-conexao whatsapp-enviar waha-webhook meta-webhook`. E colar `docs/emails/convite.html` e
  `docs/emails/redefinir-senha.html` no painel do Supabase (Authentication → Email Templates).
- **JoGrampo:**
  - ligar "Identificar o cliente antes do orçamento" (Configurações → Agente) e testar pelo celular: CNPJ que existe,
    CNPJ novo e CPF ([agente-identificar-cliente.md](agente-identificar-cliente.md));
  - passar o número para a API oficial (Configurações → WhatsApp → Passar para a API oficial, com o portfólio da
    JoGrampo) e testar: receber, responder, agente, arquivo e modelo. Combinar antes com o Eduardo o que muda
    (modelos pagos fora das 24 h, WhatsApp Web desconecta e pode ser reconectado depois).
- **Campanhas:** primeiro envio real: modelo de Marketing aprovado no número "F7 Tech (oficial)", campanha filtrada por
  uma etiqueta só dos números de teste, conferir entregue/lida/resposta e o "SAIR" ([campanhas.md](campanhas.md)).
- **Ordens de serviço:** o aviso de "pronto" pelo WhatsApp precisa do texto da mensagem (o usuário define) e, na API
  oficial, de um modelo aprovado.
- **Avisos do Supabase (segurança e desempenho):** os de função aberta ao anon foram corrigidos na migration
  20261027140000 (aplicada em 27/10) e a validade do código por e-mail baixou para 1 h; o teste de catálogo no
  `teste_fase1.sql` acusa os próximos. Desempenho: migration 20261027150000 (10 políticas com
  `(select auth.uid())` e índices das notas fiscais por pedido/OS). Falta: ligar a proteção contra senha vazada
  (painel, Authentication; plano Pro). Ficam como estão, de propósito: as FKs já cobertas pela primeira coluna e as de
  autoria, as 14 políticas `*_gerir` + `*_ver`, os 3 índices "nunca usados" e `produtos_fornecedores` sem chave primária. Os de tabela sem política (só a chave de serviço acessa) e o `pg_net` em `public` ficam como estão.
- **Empresa de demonstração "Cactos Solutions"** (criada em 26/10 com a planilha de motores, clientes inventados): falta
  conectar um WhatsApp nela para mostrar o agente; apagar quando não servir mais.
- **Do mapeamento (Cartographer):** `waha-webhook` e `importar-catalogo` não passam no `deno check` local (dependências
  npm `pdf-lib` e `xlsx`); conferir se `n8n/gerar_workflow.py` gera exatamente os JSONs atuais.
