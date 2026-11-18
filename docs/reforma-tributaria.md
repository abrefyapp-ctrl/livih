# Reforma tributária: IBS e CBS nas notas da Livih (plano de 18/11)

Em 16/11/2026 a Receita Federal publicou no GitHub, com licença MIT, o código da Calculadora de Tributos da
Reforma Tributária do Consumo (Portaria Cotec nº 342, de 12/11/2026). Pedido do usuário em 18/11: planejar como
levar isso para a Livih. **Prioridade ainda não definida**: decidir depois da entrega 2 do balcão.

## O que foi publicado

| Repositório | O que é | Tecnologia |
|---|---|---|
| [calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular) | Calcula CBS, IBS e Imposto Seletivo por item (LC 214/2025), gera e valida o grupo de tributos do XML (NF-e e NFS-e) e expõe as tabelas oficiais: CST, cClassTrib, NCM, NBS, alíquotas da União, UF e município | Java 21, Spring Boot, banco SQLite próprio; serviço HTTP (`POST /api/calculadora/regime-geral`, `/base-calculo/...`, `/xml/generate`, `/xml/validate`, `/dados-abertos/...`) |
| [calculadora-rtc-simples-nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional) | O mesmo cálculo para empresas do Simples Nacional, com as atividades por anexo | Java 21, serviço HTTP (`POST /calculadora/observabilidade/simples-nacional`) |
| [calculadora-rtc-gerador-danfse](https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse) | Gera o PDF da NFS-e (DANFSe) a partir do XML | Go, com Docker; `POST /api/danfse` |

São serviços para rodar no nosso servidor, não uma API da Receita na internet. Só o gerador de DANFSe tem
Dockerfile pronto. Notícia: [gov.br](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/novembro/receita-federal-publica-primeiro-codigo-fonte-aberto-no-github-e-amplia-transparencia-da-reforma-tributaria).

## Onde a Livih está

- **NFS-e** ([nfse-emitir](../supabase/functions/nfse-emitir/index.ts)): já manda o grupo IBS/CBS (o Ambiente
  Nacional exige o leiaute novo). CST e classificação tributária são digitados à mão na configuração do CNPJ
  (`emissoras.ibs_cbs_cst`, `ibs_cbs_classificacao`), "a contabilidade sabe".
- **NF-e** ([nfe-emitir](../supabase/functions/nfe-emitir/index.ts)): não manda nada da reforma. A Focus já aceita
  os campos de IBS/CBS na NF-e ([guia da Focus](https://focusnfe.com.br/guides/reforma-tributaria/)).
- **Clientes:** a JoGrampo é do Simples Nacional. A CEFEQ emite a nota pelo Sollus, não pela Livih.

## Prazo (a confirmar no Portal da NF-e)

- Segundo a NT 2025.002 v1.51 (Ato Técnico Conjunto RFB/CGIBS nº 1/2026), o Simples Nacional passa a ter o grupo
  IBS/CBS obrigatório na NF-e em **1º/01/2027** ([Foco Tributário](https://focotributario.com.br/nf-e-campos-de-ibs-e-cbs-sao-obrigatorios-mesmo-sem-rejeicao-1115/)).
- A rejeição 1115 (grupo IBS/CBS ausente) foi adiada sem data, mas a obrigação continua na LC 214/2025
  ([Inventti](https://inventti.com.br/nt-2025-002-v1-51-nf-e-nfc-e-altera-regras-de-validacao-adia-rejeicao-por-ausencia-do-ibs-cbs-e-muda-prazo-do-referenciamento-em-devolucoes/)).
- Fonte oficial da data para o Simples **não encontrada** na pesquisa de 18/11: conferir antes de decidir.

## Plano

1. **Levantamento (1 a 2 dias).** Confirmar o prazo no Portal da NF-e (Simples e regime normal). Ler os campos de
   IBS/CBS da Focus na NF-e e ver se ela calcula ou exige base, alíquota e valor. Rodar a calculadora localmente e
   registrar o JSON de entrada e saída. Confirmar o regime de cada cliente que emite pela Livih.
2. **Tabelas oficiais no cadastro.** Trocar o CST e a classificação digitados por uma lista com busca, vinda das
   tabelas da calculadora (`/dados-abertos/...`): padrão no CNPJ, exceção por produto (NCM) quando precisar. Vale
   para NF-e e NFS-e e reduz recusa por código errado.
3. **Calculadora no nosso servidor.** Regime regular e Simples na VPS, como o `livih-pdf`, mas alcançável pelas
   Edge Functions (endereço próprio com segredo). `nfe-emitir` e `nfse-emitir` pedem o cálculo antes de mandar a
   nota. Se a Focus calcular sozinha, esta etapa encolhe e talvez só as tabelas bastem.
4. **IBS/CBS na NF-e.** Grupo por item na `nfe-emitir`, testado em homologação. Falta um CNPJ que emita NF-e em
   teste: a F7 Tech é recusada (554, IE "ISENTO"), e trocar a JoGrampo para homologação atrapalha a emissão real.
5. **Opcionais:** tributos aproximados no orçamento e no pedido (memória de cálculo da calculadora); o gerador de
   DANFSe só se a Focus deixar de devolver o PDF.

## Riscos

- Java na VPS: cerca de 300 a 500 MB a mais, junto com WAHA, n8n e `livih-pdf` (VPS KVM 2 desde 17/11).
- Tabelas e alíquotas mudam: alguém precisa atualizar a calculadora quando a Receita publicar versão nova
  (acompanhar o CHANGELOG dos repositórios).
- Prazo curto: cerca de 6 semanas até 1º/01/2027.
