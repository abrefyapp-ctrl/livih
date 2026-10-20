# Roadmap

Planejamento do produto combinado em 12/10/2026. As pendências pequenas de tela ficam em [pendencias.md](pendencias.md).

## Ordem

1. **Base de módulos por empresa.** Liga e desliga pacotes adicionais por organização (o ERP é o primeiro).
   Pequena, e destrava o resto. **Feito em 13/10**: catálogo `modulos` (agenda ligada por padrão, ERP adicional),
   exceções em `organizacao_modulos`, regra única `modulo_ativo(org, codigo)` para usar nas políticas das tabelas
   de cada módulo, e botão Módulos na tela Empresas. Módulo novo = uma linha no catálogo + `modulo_ativo` nas
   políticas + item de menu condicionado a `modulos.has(codigo)`.
2. **Agenda própria** — em todos os planos.
3. **ERP: MVP de pedidos** — genérico para PME (decisão de 13/10: a JoGrampo valida, não trava). **Primeira entrega
   feita em 13/10**: produtos (com importação CSV), pedidos (rascunho → confirmado → separando → enviado → entregue,
   ou cancelado) e estoque como livro-razão com baixa na confirmação e devolução no cancelamento. Próximo: o agente
   montar o rascunho do pedido pela conversa; pedidos no perfil do contato; vários estoques/CNPJs se precisar.
4. **Sincronização com o Google Agenda**, quando a verificação do app no Google sair.
5. **ERP: cobrança** (Asaas) e depois **nota fiscal** (NF-e).
6. **Orientador do agente** (ver seção abaixo). Começar pela peça 1, o painel Saúde do agente: protege a margem dos
   planos e é rápida.

Se a JoGrampo estiver esperando, os itens 2 e 3 trocam de lugar.

### Próximos passos (combinado em 16/10)

Depois do orçamento em PDF, do envio de arquivos e da busca de produtos pelo agente (14 e 15/10):

1. ✅ **Centavos na tela do pedido** (16/10): a lista de itens e os totais arredondavam para reais inteiros (o PDF já
   saía certo).
2. ✅ **O agente monta e envia o orçamento** (16/10, [agente-pedido.md](agente-pedido.md)): o cliente pede, o agente
   cria o rascunho com preço do cadastro e, quando o cliente pede, envia o PDF ele mesmo (serviço `livih-pdf` na VPS,
   mesmo layout da tela). A equipe vê o aviso na conversa e o rascunho em Pedidos.
3. ✅ **Guardar a mídia recebida** (feito em 16/10): hoje o Livih não guarda os arquivos que o cliente manda (imagem,
   PDF, vídeo, áudio): só registra que chegou um documento, com o nome. A equipe não abre o arquivo no Livih (só no
   celular) e o histórico de auditoria fica incompleto, o que pesa contra a promessa do produto. Baixar a mídia na
   entrada (WAHA e API oficial) para o bucket `midias`, no mesmo caminho do que a equipe envia, e mostrar na conversa
   (imagem, vídeo, link para baixar), como já acontece com o envio. É a base do item 7.
4. ✅ **Saúde do agente** (peça 1 do Orientador, especificada em [saude-do-agente.md](saude-do-agente.md)): preventivo,
   antes do próximo cliente. Feita em 16/10 e usada na JoGrampo (separadores limpos). R$ só para a plataforma.
5. **Biblioteca de documentos e catálogo de fornecedor** (incluído em 16/10, seção abaixo): o agente envia
   vista explodida, manual e catálogo que estejam cadastrados. Parte 1 (biblioteca, envio pela equipe e pelo agente)
   ✅ feita em 16/10 e testada (o agente já enviou documento): [biblioteca-documentos.md](biblioteca-documentos.md).
   Falta a parte 2: catálogo do fornecedor compartilhado e importador da PACAR.
6. **Simulador de conversa** (peça 3): o cliente e nós testamos o agente sem mandar mensagem pelo celular.
   Implementado em 19/10: [simulador-agente.md](simulador-agente.md).
7. **O agente lê PDF e imagem, e o importador inteligente de catálogo** (incluído em 16/10; peça 2): os dois extraem
   produtos e quantidades de um arquivo.
   - ✅ No atendimento (16/10): a imagem e as 5 primeiras páginas do PDF do cliente viram uma descrição em texto
     (gpt-5-mini, `uso_ia` tipo "descricao") que o agente lê antes de responder.
     Caso real: JoGrampo, 15/10, cliente mandou `requisicao_compra.pdf` para orçar e o agente, sem ler, entrou em
     laço. Corrigido só o comportamento: ele agora diz que não abre o arquivo e pede os itens por escrito.
   - ✅ Na configuração (19/10, [importador-catalogo.md](importador-catalogo.md)): PDF, Excel, foto ou texto vira a
     prévia de importação de produtos. Teste com a base da JoGrampo: 277 de 277 produtos e 277 de 277 preços certos.
   - Cuidar do custo: imagem e PDF longo pesam em tokens; limitar páginas e tamanho, e medir em `uso_ia`.
8. **Assistente orientador** (peça 4): por último, usa as peças anteriores. Implementado em 20/10:
   [assistente-orientador.md](assistente-orientador.md).

Se um cliente novo for entrar nas próximas semanas, os itens 4 e 7 sobem: a implantação dele já sai com o custo sob
controle e sem catálogo manual.

**Entrada por nota fiscal** (pedido de 20/10): XML, PDF ou foto da nota do fornecedor cadastra o produto que falta e
soma no estoque, com vínculo por fornecedor e último custo. Feita em 20/10: [entrada-por-nota.md](entrada-por-nota.md).

**Pendente — religar o limite do importador com IA:** o limite de 5 importações por dia por empresa foi desligado
em 21/10 a pedido, enquanto a JoGrampo sobe os catálogos. Para voltar, trocar `LIMITE_DIA` de `null` para `5` em
`supabase/functions/importar-catalogo/index.ts` e publicar a função. Cada importação custa em média R$ 0,80 de IA.

Em paralelo, sem código: conferir o custo da JoGrampo depois da limpeza (uso_ia e tokens em cache no painel da
OpenAI), testar envio de arquivo pela API oficial da Meta e confirmar com a JoGrampo o código "ROCAMA 7.005" (dois
grampeadores com o mesmo código na tabela do fornecedor).

## Agenda (todos os planos)

Primeira entrega (12/10):
- Tela Agenda com a semana da equipe, filtro por pessoa e lista do dia no celular.
- Compromisso com título, horário, responsável, cliente (contato) e oportunidade, local ou link e observação.
- Situação: marcado, confirmado, realizado, não compareceu, cancelado.
- Mesma regra de carteira do resto do Livih: o vendedor vê os compromissos dele e os dos clientes que ele vê.

- ✅ **Lembrete para a equipe** (20/10): o responsável recebe notificação no celular e WhatsApp antes do
  compromisso (padrão 30 min; sem lembrete, 10 min, 1 h, 2 h ou 1 dia). Precisa ter ativado as notificações ou
  cadastrado o WhatsApp em Seus dados, e o cadastro do compromisso avisa quando não tem nenhum dos dois. Rotina
  `agenda_lembretes()` por minuto (migration 20261020130000).

Próximas etapas:
- **O agente marca sozinho**: consulta horários livres reais e oferece 2 ou 3 opções ao cliente.
- **Lembrete com confirmação**: um dia antes, modelo com os botões Confirmar e Remarcar (ex.: `confirmacao_horario`).
  Remarcar devolve a conversa para o agente oferecer novos horários. Fora da janela de 24 h o modelo é cobrado
  pela Meta da empresa cliente.
- **Funil**: marcar reunião move a oportunidade para a etapa escolhida pela empresa (o funil é editável, então a
  etapa é configuração, não nome fixo).
- **Tipos de compromisso por empresa** (reunião, visita, consulta) com duração padrão e intervalo.
- **Distribuição**: o agente marca com quem estiver livre ou com o dono da carteira do cliente.
- **Google Agenda** de cada pessoa, nos dois sentidos (ocupado no Google bloqueia o Livih; o que é marcado no Livih
  aparece no Google). O Google exige verificação do app para o escopo de calendário (algumas semanas, política de
  privacidade e vídeo): dar entrada cedo.

## ERP (pacote adicional)

Piloto: **JoGrampo**. O que sabemos (levantamento de 10–11/10):
- Pedidos chegam por WhatsApp, e-mail e telefone e são anotados em papel; estoque também no papel.
- Duas empresas (2 CNPJs), as duas com certificado digital.
- ~300 produtos e ~2.000 peças de manutenção (peças raramente com nota).
- NF emitida pelo site da "Hardness"; cobrança por boleto do banco, Pix e cartão. Topam Asaas se facilitar.

Falta perguntar:
- Pedidos por dia e quanto vem por canal.
- Qual banco emite o boleto hoje.
- Estoque único ou um por CNPJ.
- O que é o "Hardness" (tem API ou só tela).
- Um pedido anotado no papel, como exemplo dos campos reais.

MVP:
1. Catálogo importado de planilha (produtos e peças).
2. Pedido: a Liv monta o rascunho a partir da conversa; a equipe confere e confirma. Pedidos de e-mail e telefone
   entram pela mesma tela.
3. Estoque com baixa automática na confirmação e alerta de mínimo.
4. Status do pedido (separando, enviado, entregue), com aviso opcional ao cliente no WhatsApp.

Depois: cobrança pelo Asaas ligada ao pedido (reaproveitar o código do VibePark, adaptado) e NF-e por API
especializada com o certificado A1 de cada CNPJ.

## Biblioteca de documentos e catálogo de fornecedor (proposto em 16/10)

Problema: o cliente pede vista explodida, manual ou catálogo, e o agente não tem o que enviar. O único arquivo que ele
envia é o PDF do orçamento. Casos reais na JoGrampo:
- **Wyllis Ferramentas, 15/10:** o agente disse "enviei" a vista explodida do PACAR 14/45 três vezes, sem enviar
  nada, mesmo com o prompt proibindo (seções 57 e 58).
- **Mundo Dos Compressores, 16/10:** catálogos prometidos e não enviados.

A regra "nunca prometa arquivo" (16/10) tapa o sintoma; a solução é o agente ter o que enviar.

Fonte encontrada: o site da PACAR carrega um cadastro público em `pacar.com.br/api/produtos.json`.
- 3.467 itens: código, descrição, grupo, unidade e anexos. São 2.662 peças importadas, ~400 nacionais e ~35
  grampeadores.
- 126 PDFs em 77 máquinas, em geral dois por máquina: a **vista explodida**, com a tabela ITEM | CÓDIGO | DESCRIÇÃO,
  e o **certificado de garantia**.

Serve para qualquer cliente do Livih, em três camadas:

1. **Biblioteca de documentos por empresa** (todos os clientes):
   - Arquivos no bucket do Livih, com tipo configurável por empresa (vista explodida, manual, ficha, preparo de exame,
     planta...).
   - Ligação opcional a um produto, palavras-chave e a data e a fonte de cada documento.
   - Upload manual pela equipe.
   - Ferramenta do agente `enviar_documento`, que busca e envia só o que está cadastrado. Fora da biblioteca, chama
     um humano.
2. **Catálogo de fornecedor compartilhado** (nível plataforma):
   - Importado e atualizado uma vez por nós, só leitura.
   - Cada empresa liga os fornecedores que revende ("Fornecedores: PACAR ✓") e o agente dela passa a enxergar aqueles
     documentos.
   - Cada fornecedor importado vira argumento de venda para outras revendas do mesmo setor.
3. **Importadores:**
   - Automático para fornecedor com dados abertos (PACAR primeiro, com atualização semanal que marca o que sumiu).
   - Importador inteligente de PDF (item 7) para quem só tem catálogo em PDF.
   - Upload manual para o resto.

Ordem:
1. Biblioteca e `enviar_documento`, já genéricas. Nada "de ferramentas" nos campos; o documento guarda a origem
   ("da empresa" ou "do fornecedor X"), para a camada 2 entrar sem refazer.
2. Importador da PACAR, já como catálogo compartilhado.
3. Tabela de peças extraída da vista explodida (item → código → descrição): o agente responde "a peça 14 do 80W é o
   código X" e busca o preço em Produtos, se a empresa vender a peça.
4. Importador inteligente de PDF para os outros fornecedores.

Cuidados:
- **Não importar as peças do fornecedor em Produtos.** Produtos é a lista de preços da empresa, e o cadastro do
  fornecedor fica como referência separada.
- **Direito de uso:** a JoGrampo confirma com a PACAR o uso do material. Vale propor à PACAR uma parceria formal
  ("suas revendas atendem melhor").
- **Isolamento:** o catálogo compartilhado é só leitura. Os documentos próprios seguem isolados por empresa (RLS).

Perguntar à JoGrampo:
- Quais outros fornecedores eles atendem, para decidir se vale fazer outros importadores.
- Se os códigos dos produtos deles batem com os da PACAR, o que decide se a etapa 3 chega ao preço.

## Orientador do agente (proposto em 15/10)

Problema: quem escreve as instruções e a base do agente é o cliente, e o jeito natural de escrever sai caro e pior.
Caso real (JoGrampo, 15/10): catálogo de 277 produtos colado na base, um segundo catálogo duplicado, 154 linhas
"=====" no prompt e regras de chamar a equipe repetindo o prompt. O agente lia ~100 mil tokens por resposta
(R$ 0,14). Corrigido à mão: catálogo em Produtos com a ferramenta `buscar_produtos`, bases desativadas, separadores
removidos (R$ 0,048 por resposta e caindo). Ainda é ~6x a estimativa de 09/10 (R$ 0,008).

Por que importa: com 4,3 respostas por conversa (média da JoGrampo), R$ 0,048 por resposta dá ~R$ 0,21 por conversa,
ou ~R$ 100 de IA nas 500 conversas do Essencial (R$ 147). O custo do agente depende de como o cliente configura.

Quatro peças, nesta ordem:

1. **Saúde do agente** (sem IA): em Configurações → Agente, o tamanho que o agente lê por resposta, o custo
   estimado e o real dos últimos 7 dias, e alertas com conserto de um clique quando é seguro (catálogo na base,
   conteúdo duplicado, separadores, itens longos, trechos repetidos). Especificação: [saude-do-agente.md](saude-do-agente.md).
2. **Importador inteligente de catálogo**: texto colado, planilha ou PDF de tabela de preços → a IA extrai os
   produtos para a prévia de importação que já existe. Liga com o alerta "parece catálogo" da peça 1.
3. **Simulador de conversa**: tela "Testar agente" que conversa com o próprio agente sem WhatsApp (mesmo workflow do
   n8n, com marca de teste para não enviar) e mostra resposta, buscas feitas e custo daquela resposta.
4. **Assistente orientador**: conversa guiada que entrevista o dono (o que vende, horário, pagamento, frete, quando
   chamar a equipe) e escreve instruções e base enxutas; num agente existente, revisa e aponta repetições. Sempre
   como proposta com antes/depois para aprovar, nunca aplica sozinho. Edge Function chamando o modelo, consumo
   registrado em `uso_ia` (tipo "assistente") e limite por empresa.

Decidir antes da peça 4: o modelo do assistente (vale um mais forte que o gpt-5-mini: uso raro, texto que importa),
quem usa (dono/admin e a plataforma no modo suporte) e se entra em todos os planos.

## Planos (revisto em 20/10)

Substitui a tabela de 12/10. Posicionamento: vender **controle comercial** e não "mais um WhatsApp com IA". O
vendedor continua no WhatsApp dele, e a empresa passa a ver atendimentos, oportunidades e resultados.

- Cobrança **por empresa**, **usuários ilimitados** em todos os planos. A diferença entre os planos é o número de
  WhatsApps conectados e as conversas com o agente por mês.

| Plano | Preço por mês | Números de WhatsApp | Conversas com o agente por mês |
|---|---|---|---|
| Start | R$ 149 | até 3 | 500 |
| Pro | R$ 299 | até 5 | 1.200 |
| Business | R$ 599 | até 10 | 3.000 |

- **Custo de IA estimado** (JoGrampo depois da limpeza, ~R$ 0,02 por resposta e ~4 respostas por conversa): ~R$ 45,
  ~R$ 110 e ~R$ 270 por mês com a franquia cheia. Conferir com o consumo real dos primeiros clientes.
- **Modelos da Meta** (fora da janela de 24 h, só na API oficial): pagos pela empresa cliente direto à Meta, fora
  do plano.
- **ERP** (pedidos e estoque): pacote adicional, preço a definir.

**Ainda em aberto:**
- o que acontece ao passar da franquia de conversas;
- implantação fora do Programa Fundadores;
- o regime tributário (Anexo III ou V);
- o custo da transcrição de áudio, que fica fora da franquia.

### Programa Fundadores (20/10)

Para as **10 primeiras empresas**, no lugar de liberar de graça por tempo indeterminado:

- **Preço fundador travado por 12 meses:** R$ 149 com o que é do Pro, ou R$ 249 com o que é do Business.
- **ERP (pedidos e estoque) incluído sem custo** enquanto valer o preço fundador (decisão de 20/10: eles já pagam
  para testar).
- **Implantação assistida e treinamento inicial da equipe**, com tempo definido no termo.
- **Piloto de 30 dias** com escopo e franquias definidos.
- **Em troca:** feedback frequente e autorização para um estudo de caso, quando possível e com aprovação do
  cliente.
- **Sem fidelidade longa** e sem promessa de resultado.

O piloto quer comprovar três resultados: menor tempo de resposta, melhor acompanhamento dos leads e mais
visibilidade das negociações. A prova é o **Relatório de resultados** (antes "Relatório do piloto"; feito em 21/10 com o Painel: [painel-relatorio-piloto.md](painel-relatorio-piloto.md)), que compara o começo com o fim
do piloto:
- tempo até a primeira resposta;
- oportunidades sem retorno;
- percentual de leads acompanhados;
- avanço no funil;
- horas estimadas economizadas.

Com resultado bom: pedir autorização para o caso e duas indicações.

**Segmento:** variado por enquanto, mas direcionado a empresas com vários vendedores atendendo pelo WhatsApp. A
prioridade são distribuidores e revendas B2B, como a JoGrampo.

**Prospecção:**
- dois períodos por semana de visitas presenciais e prospecção digital nos outros dias;
- os prospects ficam registrados no próprio Livih, na empresa F7 Tech.
