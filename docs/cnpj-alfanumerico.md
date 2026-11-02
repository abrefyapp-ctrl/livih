# CNPJ alfanumérico (feito em 02/11)

Passo 3 das [pendências de 01/11](pendencias.md#próximos-passos-de-0111-planos-cobrança-e-preços-no-site): antes de
cadastrar cliente novo. Desde julho de 2026 a Receita dá às inscrições novas um CNPJ com letras (IN RFB 2.229/2024): os
12 primeiros caracteres são letras maiúsculas ou números e os 2 últimos, os dígitos verificadores, continuam números.
Exemplo oficial: **12.ABC.345/01DE-35**. Os CNPJs antigos, só de números, não mudam.

## O que mudou

- **Conta do dígito:** cada caractere vale o código ASCII menos 48 (0–9 = 0–9, A = 17 … Z = 42), com os mesmos pesos e
  o mesmo módulo 11 de antes. A mesma conta no banco (`cnpj_valido`) e na tela (`cnpjValido` em `src/services/formato.ts`,
  usada no cadastro de clientes, na tela Empresa e nos dados de cobrança).
- **Limpeza:** o banco e a tela tiravam tudo o que não fosse número antes de validar, e o CNPJ com letras virava outro.
  Agora só a pontuação sai e as letras vão para maiúsculas (`limpar_documento` no banco, `limparDocumento` na tela), em:
  cliente (tela, importação de clientes e de OS), dados de cobrança, fornecedor do financeiro, nota de entrada (XML,
  PDF ou foto lida pela IA) e o agente (identificar e cadastrar cliente). CEP e telefone seguem só com números.
- **Chave de acesso:** a da NF-e (44) e a da NFS-e nacional (50) levam o CNPJ do emitente, então também podem ter letras.
- **Agente:** o banco tenta o documento com as letras e, se não fechar, só com os números, como antes (o agente pode
  mandar a frase inteira do cliente: "meu CNPJ é 11.222.333/0001-81"). A consulta à Receita no n8n faz o mesmo.
- **Teclado no celular:** os campos de CNPJ deixam de abrir o teclado só de números (não daria para digitar as letras).
- **Busca de cliente** por trecho do documento aceita letras ("12.abc" acha 12ABC…).
- **BrasilAPI** (razão social e endereço pela Receita) aceita o CNPJ com letras (conferido em 02/11 com o exemplo
  oficial: respondeu "não encontrado", não "formato inválido").

Migration `20261102130000_cnpj_alfanumerico`; 11 testes no `teste_fase1.sql`.

## Fica para depois

- **PDF do orçamento** (`livih-pdf` na VPS): até a próxima reconstrução do serviço, o CNPJ com letras sai sem pontuação
  no PDF (`12ABC34501DE35`), legível. Vai junto com a próxima publicação do serviço.
- **Focus NFe e SEFAZ:** a Livih já aceita a emissora com CNPJ de letras; se a SEFAZ do estado ainda não aceitar o
  layout novo, a recusa aparece na nota como qualquer outra rejeição.
- **Asaas:** o CNPJ com letras vai como veio nos dados de cobrança; se o Asaas recusar, a fatura fica "Sem link de
  pagamento" com a mensagem dele.
