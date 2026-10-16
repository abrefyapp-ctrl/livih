// Mídia que chega pelos webhooks (WAHA e Meta), sempre em segundo plano: a mensagem já foi gravada.
// 1. Guarda o arquivo no bucket `midias` (cliente, ou equipe pelo celular). Migration 20261016130000.
// 2. Imagem e PDF do cliente: a IA descreve em texto e só então o agente é chamado, já lendo a descrição (mesmo
//    modelo da transcrição de áudio). Migration 20261016140000.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { avisarAgente, type Entrada } from "./atendimento.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const LIMITE = 50 * 1024 * 1024; // mesmo limite do bucket
const PDF_PAGINAS = 5; // só as primeiras páginas vão para a IA: catálogo de 80 páginas não vira custo
const MODELO_DESCRICAO = "gpt-5-mini";

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/3gpp": "3gp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
  "application/pdf": "pdf",
};
const ROTULO: Record<string, string> = { imagem: "imagem", video: "video", audio: "audio", figurinha: "figurinha", documento: "documento" };

type Ref = { canal_id: string; wa_id: string; tipo: string; mime?: string | null; nome?: string | null };
type Guardada = { bytes: Uint8Array; mime: string; nome: string };

/** Nome que vai no caminho do storage (sem acento nem símbolo) e o nome que a equipe vê. */
function nomes(tipo: string, mime: string, nomeOriginal?: string | null) {
  const ext = EXTENSOES[mime.split(";")[0].trim()] ?? (nomeOriginal?.match(/\.(\w{1,6})$/)?.[1] ?? "bin");
  const visivel = (nomeOriginal?.trim() || `${ROTULO[tipo] ?? "arquivo"}.${ext}`).slice(0, 200);
  const chave = visivel.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80) || `arquivo.${ext}`;
  return { visivel, chave };
}

/** Baixa e guarda o arquivo. Devolve os bytes (para a descrição não baixar de novo) ou null. */
export async function guardarMidiaRecebida(
  supabase: SupabaseClient, ref: Ref, baixar: () => Promise<Response>,
): Promise<Guardada | null> {
  const { data: destino, error } = await supabase.rpc("midia_destino", { p_canal: ref.canal_id, p_wa_id: ref.wa_id });
  if (error || !destino?.mensagem_id || destino.ja_tem) {
    if (error) console.error("midia_destino", error.message);
    return null;
  }
  const r = await baixar();
  if (!r.ok) {
    console.error("download da mídia", r.status, ref.wa_id);
    return null;
  }
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.byteLength > LIMITE) {
    console.error("mídia acima de 50 MB, não guardada", ref.wa_id, bytes.byteLength);
    return null;
  }
  const mime = (ref.mime || r.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
  const { visivel, chave } = nomes(ref.tipo, mime, ref.nome);
  const path = `${destino.org_id}/${destino.conversa_id}/recebido-${destino.mensagem_id}-${chave}`;
  const { error: erroUpload } = await supabase.storage.from("midias").upload(path, bytes, { contentType: mime, upsert: false });
  if (erroUpload) {
    console.error("upload da mídia", erroUpload.message, ref.wa_id);
    return { bytes, mime, nome: visivel };
  }
  const { error: erroGuardar } = await supabase.rpc("guardar_midia", {
    p_mensagem: destino.mensagem_id, p_path: path, p_nome: visivel, p_mime: mime,
  });
  if (erroGuardar) console.error("guardar_midia", erroGuardar.message, ref.wa_id);
  return { bytes, mime, nome: visivel };
}

/** Imagem e PDF do cliente são descritos pela IA; o resto não. */
export function descreve(tipo: string, mime?: string | null) {
  return tipo === "imagem" || (tipo === "documento" && /pdf/i.test(mime ?? ""));
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function primeirasPaginas(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    if (doc.getPageCount() <= PDF_PAGINAS) return bytes;
    const novo = await PDFDocument.create();
    const paginas = await novo.copyPages(doc, Array.from({ length: PDF_PAGINAS }, (_, i) => i));
    paginas.forEach((p) => novo.addPage(p));
    return new Uint8Array(await novo.save());
  } catch (e) {
    console.error("pdf: não deu para cortar páginas, vai inteiro", String(e).slice(0, 200));
    return bytes;
  }
}

const INSTRUCAO = `Você ajuda o atendimento de uma empresa no WhatsApp. Descreva em português, de forma objetiva e factual, o que o cliente enviou, para o atendente responder:
- Foto de produto: o que é, marca, modelo, referência, medidas, quantidade na embalagem e textos legíveis.
- Documento de compra (pedido, requisição, orçamento, lista): cada item com produto, referência ou código, quantidade e unidade; depois os dados úteis (empresa, prazo, entrega, observações).
- Outra coisa (comprovante, foto de defeito, print): o que é e os dados principais (valores, datas, nomes).
Não invente o que não estiver legível: diga "ilegível". Até 1.200 caracteres, sem saudação nem comentário.`;

/** Descrição em texto da imagem ou do PDF (null se falhar). Registra o consumo em uso_ia. */
async function descrever(supabase: SupabaseClient, g: Guardada, legenda: string | null, entrada: Entrada): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  const pdf = /pdf/i.test(g.mime);
  const arquivo = pdf
    ? { type: "input_file", filename: g.nome.endsWith(".pdf") ? g.nome : `${g.nome}.pdf`, file_data: `data:application/pdf;base64,${base64(await primeirasPaginas(g.bytes))}` }
    : { type: "input_image", image_url: `data:${g.mime};base64,${base64(g.bytes)}` };
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
          arquivo,
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
  const { error: erroUso } = await supabase.from("uso_ia").upsert({
    org_id: entrada.org_id, conversa_id: entrada.conversa_id, mensagem_id: entrada.mensagem_id,
    tipo: "descricao", modelo: MODELO_DESCRICAO,
    tokens_entrada: Number(corpo?.usage?.input_tokens ?? 0), tokens_saida: Number(corpo?.usage?.output_tokens ?? 0),
    origem_ref: `descricao:${entrada.mensagem_id}`,
  }, { onConflict: "origem_ref", ignoreDuplicates: true });
  if (erroUso) console.error("uso_ia descrição", erroUso.message);
  return texto || null;
}

/**
 * Imagem ou PDF do cliente: guarda, descreve e só então chama o agente (que já lê a descrição). Se algo falhar, o
 * agente é chamado do mesmo jeito: ele avisa que não conseguiu abrir e pede os itens por escrito.
 */
export async function guardarDescreverEAvisar(
  supabase: SupabaseClient, ref: Ref, baixar: () => Promise<Response>, entrada: Entrada, legenda: string | null,
) {
  let chamar = entrada.chamar_agente;
  try {
    const g = await guardarMidiaRecebida(supabase, ref, baixar);
    if (g) {
      const texto = await descrever(supabase, g, legenda, entrada);
      if (texto) {
        const { data, error } = await supabase.rpc("registrar_descricao", { p_mensagem: entrada.mensagem_id, p_descricao: texto });
        if (error) console.error("registrar_descricao", error.message);
        else chamar = data?.chamar_agente ?? chamar;
      }
    }
  } catch (e) {
    console.error("guardar/descrever", String(e).slice(0, 300));
  }
  if (chamar) await avisarAgente(supabase, entrada);
}
