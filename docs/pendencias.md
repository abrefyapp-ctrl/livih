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

## Em aberto em 27/10 (passagem de sessão)

Anotado ao fim da sessão de 25 a 27/10. Tirar cada item quando resolver.

- **NF-e no Paraná (FIXOTEC/JoGrampo, CNPJ 43.147.741/0001-02):** rejeição 974, porque a Focus ainda não está
  autorizada como sistema emissor na Receita/PR ([nfe.md](nfe.md), seção do Paraná). Falta: o contador da FIXOTEC fazer
  o registro (UPD → Autorização de Uso, CNPJ da Focus 07.504.505/0001-32), o usuário pedir o aceite à Focus e emitir de
  novo. Chamado aberto na Focus perguntando: o código do sistema no portal (o artigo da Aegro diz "ACRAS, 54078", não
  confirmado; a tela não cita), se o aceite é automático e quais outros estados exigem. Com a resposta, ajustar
  `CredenciamentoSefaz.tsx` e `FOCUS_RESPONSAVEL_TECNICO` em `services/nfe.ts`.
- **NFS-e da F7 (homologação):** a primeira nota foi autorizada (nº 1). Antes de produção, a contabilidade confirma os
  códigos usados no teste: cIndOp 100301, CST 000, cClassTrib 000001, NBS 115022000, regime de apuração do Simples 1
  e a alíquota efetiva do Simples.
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
  20261027140000 (aplicar com `db push`); o teste de catálogo no `teste_fase1.sql` acusa os próximos. Falta: no painel
  (Authentication), validade do código por e-mail abaixo de 1 h e proteção contra senha vazada; analisar os avisos de
  desempenho. Os de tabela sem política (só a chave de serviço acessa) e o `pg_net` em `public` ficam como estão.
- **Empresa de demonstração "Cactos Solutions"** (criada em 26/10 com a planilha de motores, clientes inventados): falta
  conectar um WhatsApp nela para mostrar o agente; apagar quando não servir mais.
- **Do mapeamento (Cartographer):** `waha-webhook` e `importar-catalogo` não passam no `deno check` local (dependências
  npm `pdf-lib` e `xlsx`); conferir se `n8n/gerar_workflow.py` gera exatamente os JSONs atuais.
