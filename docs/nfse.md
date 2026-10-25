# Nota fiscal de serviço (NFS-e Nacional) pela Focus NFe (proposto em 25/10)

Vem antes da entrega 3 da NF-e (decisão de 25/10): a F7 presta serviço, não tem inscrição estadual e não emite NF-e
de mercadoria (rejeição 554 no teste). A NFS-e aproveita a base da NF-e ([nfe.md](nfe.md)): conta de revenda na
Focus, CNPJ configurado em Configurações → Empresa, permissão "Emite nota fiscal", tabela de notas, gatilho da Focus
com conferência de reserva e cópia do PDF e do XML no Livih.

## Decisões de 25/10

| Pergunta | Decisão |
|---|---|
| Padrão | **NFS-e Nacional** (Focus `/v2/nfsen`). Curitiba: provedor "Nacional", com homologação e cancelamento pela API (consulta à API de municípios da Focus, 25/10) |
| De onde sai a nota | Da **ordem de serviço**, de um **pedido de serviço** e de uma **nota avulsa** |
| Município que não for do padrão nacional | Fora desta etapa: o Livih consulta o município do CNPJ na Focus e avisa se não for "Nacional" |

## Configuração (por CNPJ, na mesma tela Nota fiscal)

Uma seção **Nota de serviço (NFS-e)**:

| Campo | Para quê |
|---|---|
| Ativar NFS-e | Liga `habilita_nfsen_homologacao` e `habilita_nfsen_producao` na Focus |
| Código IBGE do município | Vem da cidade do CNPJ (consulta à Focus); dá para corrigir |
| Inscrição municipal | Opcional no padrão nacional; vai na nota quando houver |
| Código de tributação nacional do ISS | 6 números (ex.: 01.01.01, desenvolvimento de programas). O principal código da nota; vem da contabilidade |
| Código de tributação municipal | Opcional (3 números) |
| Código NBS | Opcional (9 números) |
| Descrição padrão do serviço | Sugestão para a nota (a pessoa ajusta na emissão) |
| Regime especial de tributação | Nenhum (padrão), microempresa municipal, sociedade de profissionais... |
| IBS/CBS (reforma tributária) | CST e classificação tributária, opcionais: a contabilidade preenche quando a prefeitura passar a exigir |

A opção pelo Simples (não optante, MEI ou ME/EPP) sai do regime tributário que o CNPJ já tem. A alíquota do ISS
não é pedida: no padrão nacional, ela vem parametrizada pela prefeitura.

## Emissão

1. **Ordem de serviço:** "Emitir NFS-e" na OS. A descrição vem dos itens (tipo, modelo, serviço, identificação) e o
   valor é a soma dos itens cobrados (garantia e cortesia ficam de fora). O tomador é o cliente da OS.
2. **Pedido de serviço:** no pedido confirmado, a escolha entre **NF-e (mercadoria)** e **NFS-e (serviço)**. Na
   NFS-e, a descrição vem dos itens do pedido e o valor é o total.
3. **Nota avulsa:** em Clientes → cliente → **Emitir nota de serviço** (e em Notas fiscais), com descrição e valor
   digitados.

Na janela de emissão: CNPJ, descrição do serviço (editável), valor, data de competência (padrão hoje), ISS retido pelo
tomador ou não, e informações complementares. Antes de enviar, o Livih confere o que falta: o tomador precisa de
CNPJ ou CPF e, com endereço, o município; e o CNPJ, da NFS-e ativa e do código de tributação nacional.

O retorno segue a NF-e: gatilho da Focus (evento de NFS-e Nacional) e a conferência de reserva; autorizada, o Livih
guarda o XML e o PDF (DANFSe) no bucket `notas-fiscais`. Uma nota viva por pedido e por OS.

## Dados (migration)

- `emissoras`: colunas da NFS-e (ativa, município IBGE, inscrição municipal, códigos de tributação, NBS, descrição
  padrão, regime especial, IBS/CBS).
- `notas_fiscais`: coluna `modelo` (`nfe` ou `nfse`), `os_id` (nota da OS), `descricao` e `data_competencia`. A
  regra "uma nota viva" passa a valer por pedido e por OS.

## Entregas

1. **Configuração:** migration, a seção NFS-e na tela Nota fiscal e a `nfe-config` ligando a NFS-e na Focus (com o
   município). Teste: F7 com NFS-e ativa em homologação.
2. **Emissão:** a função de emissão (pedido de serviço, OS e avulsa), o retorno (`nfe-retorno` reconhece a NFS-e) e
   as telas. Teste: NFS-e de teste da F7 autorizada pela prefeitura de Curitiba.
3. **Cancelar e enviar:** junto com a entrega 3 da NF-e (cancelamento, envio pelo WhatsApp, XMLs do mês).

**Entregas 1 e 2 construídas em 25/10:** migration `20261025150000_nfse.sql`, função `nfse-emitir` (pedido, OS e
avulsa), `nfe-config` ligando `habilita_nfsen_*` e achando o município (IBGE e provedor) pela API de municípios,
`_shared/focus.ts` e `nfe-retorno` tratando os dois modelos (rota `/v2/nfsen`, PDF em `url_danfse`, chave de 50
dígitos, erros em `erros[]`; gatilhos `nfe` e `nfsen`), seção NFS-e na tela Nota fiscal e o componente `NotaFiscal`
(pedido com escolha NF-e/NFS-e, OS e notas do cliente com a avulsa). A numeração da DPS fica com a Focus (não vai
`numero_dps`): conferir na primeira nota.

## Precisa de você

- **Código de tributação nacional do ISS** da F7 (com a contabilidade): é o que identifica o serviço na nota.
- Confirmar com a contabilidade se a F7 é ME/EPP no Simples (sai do regime configurado) e se tem regime especial.
