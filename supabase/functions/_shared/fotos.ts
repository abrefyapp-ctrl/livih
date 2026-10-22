// Identificar o produto pela foto do cliente (migration 20261022120000, docs/identificar-produto-foto.md).
// - descreverFotoCatalogo + embedding: a função indexar-fotos prepara cada foto da biblioteca.
// - identificarProduto: na entrada (midia.ts), acha o produto da foto do cliente entre as fotos da biblioteca.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { Entrada } from "./atendimento.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
export const MODELO_VISAO = "gpt-5-mini";
export const MODELO_EMBEDDING = "text-embedding-3-small";
const CANDIDATOS = 5;
// Soma das fotos do catálogo numa comparação: o limite da OpenAI é 50 MB por chamada (em base64, que cresce 1/3).
const LIMITE_FOTOS_COMPARACAO = 20 * 1024 * 1024;

export type Uso = { entrada: number; saida: number };

export function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const imagem = (bytes: Uint8Array, mime: string) => ({ type: "input_image", image_url: `data:${mime};base64,${base64(bytes)}` });

type Conteudo = Record<string, unknown>;

async function responder(conteudo: Conteudo[], extra: Record<string, unknown>): Promise<{ texto: string; uso: Uso }> {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO_VISAO, input: [{ role: "user", content: conteudo }], ...extra }),
    signal: AbortSignal.timeout(90000),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`openai ${r.status}: ${JSON.stringify(corpo).slice(0, 200)}`);
  const texto = (corpo?.output ?? [])
    .flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? [])
    .filter((c: { type: string }) => c.type === "output_text")
    .map((c: { text?: string }) => c.text ?? "")
    .join("\n")
    .trim();
  return { texto, uso: { entrada: Number(corpo?.usage?.input_tokens ?? 0), saida: Number(corpo?.usage?.output_tokens ?? 0) } };
}

export async function embedding(texto: string): Promise<{ vetor: number[]; tokens: number }> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO_EMBEDDING, input: texto.slice(0, 8000) }),
    signal: AbortSignal.timeout(30000),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(corpo?.data?.[0]?.embedding)) {
    throw new Error(`embedding ${r.status}: ${JSON.stringify(corpo).slice(0, 200)}`);
  }
  return { vetor: corpo.data[0].embedding, tokens: Number(corpo?.usage?.prompt_tokens ?? 0) };
}

// Mesmo vocabulário da descrição da foto do cliente (midia.ts), para os dois textos ficarem comparáveis.
const INSTRUCAO_CATALOGO = `Esta é a foto de um produto do catálogo de uma empresa. Descreva em português, de forma objetiva e factual, o produto que aparece: o que é (tipo de objeto e uso), formato, cor, material, marca, modelo, referência, medidas e todos os textos e códigos legíveis. Não descreva o fundo nem a iluminação. Não invente o que não estiver legível. Até 600 caracteres, sem comentário.`;

/** Descrição da foto do catálogo (o texto que vira embedding). */
export async function descreverFotoCatalogo(bytes: Uint8Array, mime: string, produtos: string[]) {
  const contexto = produtos.length ? `\n\nCadastrada no sistema como: ${produtos.join("; ")}.` : "";
  return await responder(
    [{ type: "input_text", text: INSTRUCAO_CATALOGO + contexto }, imagem(bytes, mime)],
    { reasoning: { effort: "minimal" }, max_output_tokens: 800 },
  );
}

type Candidato = {
  produto_id: string; codigo: string | null; nome: string; documento_id: string; path: string; codigo_na_foto: boolean;
};

const INSTRUCAO_COMPARAR = `Você ajuda o atendimento de uma empresa no WhatsApp. O cliente mandou a primeira foto. Depois vêm fotos de produtos do catálogo da empresa, numeradas. Diga qual produto do catálogo é o MESMO produto da foto do cliente (mesmo modelo, não só a mesma categoria): compare formato, cor, detalhes, marca e textos ou códigos legíveis. Fotos de ângulo, luz ou fundo diferentes podem ser o mesmo produto. Se nenhum for o mesmo produto, ou se a foto do cliente não for de um produto, responda 0.
Confiança: "alta" quando detalhes específicos batem (código, marca, formato inconfundível); "media" quando bate bem mas há modelos parecidos que a foto não separa; "baixa" quando é só a mesma categoria.`;

const FORMATO_COMPARAR = {
  type: "json_schema",
  name: "identificacao",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["produto", "confianca", "motivo"],
    properties: {
      produto: { type: "integer", description: "Número do produto do catálogo que é o mesmo da foto do cliente; 0 se nenhum" },
      confianca: { type: "string", enum: ["alta", "media", "baixa"] },
      motivo: { type: "string", description: "Em até 150 caracteres, o que bateu ou o que faltou" },
    },
  },
};

const rotulo = (c: Candidato) => `${c.nome}${c.codigo ? ` (código ${c.codigo})` : ""}`;

async function registrarUso(supabase: SupabaseClient, entrada: Entrada, ref: string, modelo: string, uso: Uso) {
  const { error } = await supabase.from("uso_ia").upsert({
    org_id: entrada.org_id, conversa_id: entrada.conversa_id, mensagem_id: entrada.mensagem_id,
    tipo: "identificacao", modelo, tokens_entrada: uso.entrada, tokens_saida: uso.saida, origem_ref: ref,
  }, { onConflict: "origem_ref", ignoreDuplicates: true });
  if (error) console.error("uso_ia identificação", error.message);
}

/**
 * Acha o produto da foto do cliente entre as fotos da biblioteca. Devolve o parágrafo que vai junto da descrição
 * (o agente e a equipe leem ali) ou null quando a empresa não tem fotos indexadas ou nada se parece.
 */
export async function identificarProduto(
  supabase: SupabaseClient, entrada: Entrada, foto: { bytes: Uint8Array; mime: string }, descricao: string,
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  // Empresa sem fotos prontas: nem gera o embedding.
  const { count } = await supabase.from("fotos_indice").select("documento_id", { count: "exact", head: true })
    .eq("org_id", entrada.org_id).eq("status", "pronto");
  if (!count) return null;

  const emb = await embedding(descricao);
  await registrarUso(supabase, entrada, `identificacao-busca:${entrada.mensagem_id}`, MODELO_EMBEDDING, { entrada: emb.tokens, saida: 0 });
  const { data, error } = await supabase.rpc("fotos_candidatas", {
    p_org: entrada.org_id, p_embedding: JSON.stringify(emb.vetor), p_texto: descricao, p_limite: CANDIDATOS,
  });
  if (error) throw new Error(`fotos_candidatas: ${error.message}`);
  const candidatos = (data ?? []) as Candidato[];
  if (!candidatos.length) return null;

  // Baixa as fotos dos candidatos, na ordem, até o limite de tamanho da chamada.
  const baixadas = await Promise.all(candidatos.map(async (c) => {
    const { data: arquivo } = await supabase.storage.from("documentos").download(c.path);
    return arquivo ? { c, bytes: new Uint8Array(await arquivo.arrayBuffer()), mime: arquivo.type || "image/jpeg" } : null;
  }));
  const fotos: { c: Candidato; bytes: Uint8Array; mime: string }[] = [];
  let soma = foto.bytes.byteLength;
  for (const b of baixadas) {
    if (!b || soma + b.bytes.byteLength > LIMITE_FOTOS_COMPARACAO) continue;
    soma += b.bytes.byteLength;
    fotos.push(b);
  }
  if (!fotos.length) return null;

  const conteudo: Conteudo[] = [
    { type: "input_text", text: `${INSTRUCAO_COMPARAR}\n\nDescrição automática da foto do cliente: ${descricao}\n\nFoto do cliente:` },
    imagem(foto.bytes, foto.mime),
  ];
  fotos.forEach((f, i) => conteudo.push({ type: "input_text", text: `Produto ${i + 1}: ${rotulo(f.c)}` }, imagem(f.bytes, f.mime)));
  const r = await responder(conteudo, { reasoning: { effort: "low" }, max_output_tokens: 2000, text: { format: FORMATO_COMPARAR } });
  await registrarUso(supabase, entrada, `identificacao:${entrada.mensagem_id}`, MODELO_VISAO, r.uso);

  let res: { produto: number; confianca: "alta" | "media" | "baixa"; motivo: string };
  try {
    res = JSON.parse(r.texto);
  } catch {
    throw new Error(`resposta fora do formato: ${r.texto.slice(0, 200)}`);
  }
  const escolhido = res.produto >= 1 && res.produto <= fotos.length ? fotos[res.produto - 1].c : null;
  const parecidos = fotos.filter((f) => f.c !== escolhido).slice(0, 3).map((f) => rotulo(f.c)).join("; ");

  if (escolhido && res.confianca !== "baixa") {
    return `Produto do catálogo identificado pela foto (confiança ${res.confianca === "alta" ? "alta" : "média"}): ${rotulo(escolhido)}. ` +
      `${res.motivo.trim()} Foto do catálogo para mostrar ao cliente: documento ${escolhido.documento_id}.`;
  }
  if (escolhido) {
    return `Comparada com as fotos do catálogo, talvez seja ${rotulo(escolhido)}, mas sem certeza (${res.motivo.trim()}). ` +
      `Outros parecidos: ${parecidos}.`;
  }
  return `Comparada com as fotos do catálogo, nenhum produto bateu com certeza. Os mais parecidos: ${parecidos}.`;
}
