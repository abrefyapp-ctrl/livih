// Descrição em texto da imagem ou do PDF do cliente, que o agente lê no lugar do arquivo (migration 20261016140000).
// Separada de midia.ts em 17/11 para o simulador (agente-simular) descrever a foto do teste com a mesma instrução e
// o mesmo modelo da entrada pelo WhatsApp, sem carregar o pdf-lib. Quem chama corta o PDF e grava o consumo.

import { base64 } from "./fotos.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
export const MODELO_DESCRICAO = "gpt-5-mini";

const INSTRUCAO = `Você ajuda o atendimento de uma empresa no WhatsApp. Descreva em português, de forma objetiva e factual, o que o cliente enviou, para o atendente responder:
- Foto de produto: o que é, marca, modelo, referência, medidas, quantidade na embalagem e textos legíveis.
- Documento de compra (pedido, requisição, orçamento, lista): cada item com produto, referência ou código, quantidade e unidade; depois os dados úteis (empresa, prazo, entrega, observações).
- Outra coisa (comprovante, foto de defeito, print): o que é e os dados principais (valores, datas, nomes).
Não invente o que não estiver legível: diga "ilegível". Até 1.200 caracteres, sem saudação nem comentário.`;

export type Descricao = { texto: string | null; tokensEntrada: number; tokensSaida: number };

/** Descreve a imagem ou o PDF (já cortado). Devolve null em `texto` se a IA falhar. */
export async function descreverArquivo(
  arquivo: { bytes: Uint8Array; mime: string; nome: string }, legenda: string | null,
): Promise<Descricao | null> {
  if (!OPENAI_API_KEY) return null;
  const pdf = /pdf/i.test(arquivo.mime);
  const conteudo = pdf
    ? { type: "input_file", filename: arquivo.nome.endsWith(".pdf") ? arquivo.nome : `${arquivo.nome}.pdf`, file_data: `data:application/pdf;base64,${base64(arquivo.bytes)}` }
    : { type: "input_image", image_url: `data:${arquivo.mime};base64,${base64(arquivo.bytes)}` };
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO_DESCRICAO,
      reasoning: { effort: "minimal" },
      max_output_tokens: 1200,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: `${INSTRUCAO}\n\nO cliente enviou ${pdf ? "um documento PDF" : "uma imagem"}${legenda ? ` com a mensagem: "${legenda}"` : ""}.` },
          conteudo,
        ],
      }],
    }),
    signal: AbortSignal.timeout(90000),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) {
    console.error("descrição", r.status, JSON.stringify(corpo).slice(0, 300));
    return null;
  }
  const texto = (corpo?.output ?? [])
    .flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? [])
    .filter((c: { type: string }) => c.type === "output_text")
    .map((c: { text?: string }) => c.text ?? "")
    .join("\n")
    .trim();
  return {
    texto: texto || null,
    tokensEntrada: Number(corpo?.usage?.input_tokens ?? 0),
    tokensSaida: Number(corpo?.usage?.output_tokens ?? 0),
  };
}
