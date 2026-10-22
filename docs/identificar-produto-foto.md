# Identificar o produto pela foto do cliente

Pedido de 22/10. O cliente manda a foto ("quero outro igual a este") e a descrição automática dizia só "grampeador
preto". Com as fotos dos produtos na biblioteca, o Livih acha qual produto do catálogo é.

Migration `20261022120000_identificar_produto_foto.sql`; código em `supabase/functions/_shared/fotos.ts`,
`supabase/functions/indexar-fotos` e `src/services/fotosProdutos.ts`.

## Como funciona

1. **Fotos do catálogo:** toda imagem da biblioteca de documentos entra na fila `fotos_indice` (trigger). O cron
   `livih-indexar-fotos` chama a função `indexar-fotos` a cada minuto quando há fila. Cada foto é descrita pela IA
   (gpt-5-mini) e o texto vira embedding (`text-embedding-3-small`, pgvector). Trocar o arquivo do documento
   reindexa a foto. Editar o título não reindexa.
2. **Foto do cliente (entrada, `_shared/midia.ts`):** depois da descrição de sempre, se a empresa tem fotos prontas:
   - a descrição vira embedding;
   - `fotos_candidatas` devolve os 5 produtos mais parecidos (uma foto por produto), mais os que têm o código
     escrito na foto;
   - a IA compara a foto do cliente com as fotos dos candidatos e diz qual é o mesmo produto, com confiança
     alta, média ou baixa.
3. **Resultado:** vai junto da descrição, que o agente e a equipe já leem. O agente não ganhou ferramenta nova:
   - **alta ou média:** "Produto do catálogo identificado pela foto…", com o código e o id da foto do catálogo
     (que o agente pode mandar com `enviar_documento`). O agente confirma com o cliente antes do orçamento.
   - **baixa ou nenhum:** "talvez seja…" ou "nenhum produto bateu…", com os parecidos. O agente pergunta.

Só contam as fotos **ativas**, ligadas a um produto **ativo**. Empresa sem fotos não tem custo nenhum: a função
para antes do embedding. Se a identificação falhar, segue só a descrição, como antes.

## Custo (uso_ia)

- `foto_catalogo`: uma vez por foto cadastrada (descrição + embedding). Frações de centavo por foto.
- `identificacao`: por foto de cliente, numa empresa com fotos (embedding + uma comparação com até 5 fotos).

## Envio em massa (Configurações → Documentos → Fotos em massa)

Só para dono e admin, com o módulo de pedidos ligado. O produto é achado pelo **código**:

| Jeito | Exemplo |
|---|---|
| Nome do arquivo = código | `GR-123.jpg` |
| Mais fotos do mesmo produto | `GR-123 (2).jpg`, `GR-123_2.jpg` |
| Pasta com o código, fotos dentro | `GR-123/frente.jpg`, `GR-123/lado.jpg` |
| Código com `/` | `80/W-LS` → `80-W-LS.jpg` |

- A tela mostra o resultado antes de enviar: pronta, código parecido (conferir), sem produto, código repetido no
  cadastro, já cadastrada, formato não aceito.
- As fotos são reduzidas no navegador (até 1600 px, JPEG) antes de subir.
- Cada foto vira um documento "Foto do produto", com o título "Foto — <nome do produto>", ligado ao produto.
- Reenviar a mesma pasta não duplica: o que já subiu aparece como "já cadastrada".
- Abaixo da lista de documentos aparece o andamento (prontas, na fila, com erro).

## Testes

Bloco "fotos" em `scripts/teste_fase1.sql`: fila, reivindicação única, arquivo trocado, candidatos (ordem,
inativos, código legível), isolamento entre empresas e permissões.
