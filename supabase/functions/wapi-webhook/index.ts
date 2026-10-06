// Recebe o webhook da w-api de um canal e grava no banco.
// URL configurada na instância: /functions/v1/wapi-webhook?canal=<uuid>&s=<segredo>
// O segredo é gerado por gerar_segredo_webhook (o banco guarda só o hash).

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type Tipo =
  | "texto" | "audio" | "imagem" | "video" | "documento"
  | "figurinha" | "localizacao" | "contato";

// Chave do msgContent → tipo da mensagem. O que não estiver aqui (reação, mensagem apagada,
// editada, eventos de sistema) é ignorado.
const TIPOS: Record<string, Tipo> = {
  conversation: "texto",
  extendedTextMessage: "texto",
  audioMessage: "audio",
  imageMessage: "imagem",
  videoMessage: "video",
  documentMessage: "documento",
  documentWithCaptionMessage: "documento",
  stickerMessage: "figurinha",
  locationMessage: "localizacao",
  contactMessage: "contato",
  contactsArrayMessage: "contato",
};

// deno-lint-ignore no-explicit-any
type Json = any;

function lerConteudo(mc: Json): { tipo: Tipo; texto: string | null; mime: string | null } | null {
  const chave = Object.keys(TIPOS).find((k) => mc?.[k] != null);
  if (!chave) return null;
  const tipo = TIPOS[chave];
  if (chave === "conversation") return { tipo, texto: String(mc.conversation), mime: null };
  if (chave === "extendedTextMessage") return { tipo, texto: mc.extendedTextMessage?.text ?? null, mime: null };
  const m = chave === "documentWithCaptionMessage"
    ? mc.documentWithCaptionMessage?.message?.documentMessage ?? {}
    : mc[chave];
  const texto = m?.caption ?? (tipo === "documento" ? m?.fileName ?? null : null);
  return { tipo, texto: texto ? String(texto) : null, mime: m?.mimetype ?? null };
}

// Telefone em dígitos, com o 9 dos celulares brasileiros (a w-api às vezes manda sem).
function normalizarTelefone(id: string | undefined): string | null {
  if (!id || id.includes("@lid") || id.includes("@g.us")) return null;
  const d = id.split("@")[0].replace(/\D/g, "");
  const br = d.match(/^55(\d{2})(\d{8})$/);
  const num = br && /^[6-9]/.test(br[2]) ? `55${br[1]}9${br[2]}` : d;
  return /^\d{10,15}$/.test(num) ? num : null;
}

// O payload bruto fica 30 dias para depuração; miniaturas e sidecars só ocupam espaço.
function enxugar(body: Json): Json {
  const copia = structuredClone(body);
  for (const m of Object.values(copia?.msgContent ?? {}) as Json[]) {
    if (m && typeof m === "object") {
      delete m.JPEGThumbnail;
      delete m.scansSidecar;
      delete m.streamingSidecar;
    }
  }
  return copia;
}

function resposta(status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resposta(405, { erro: "método" });

  const url = new URL(req.url);
  const canalId = url.searchParams.get("canal") ?? "";
  const segredo = url.searchParams.get("s") ?? "";
  const { data: canais, error: erroCanal } = await supabase.rpc("canal_por_webhook", {
    p_canal: canalId,
    p_segredo: segredo,
  });
  if (erroCanal || !canais?.length) return resposta(401, { erro: "canal" });

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return resposta(400, { erro: "json" });
  }

  if (body?.event !== "webhookReceived") return resposta(200, { ignorado: body?.event ?? "sem evento" });
  if (body.isGroup || body.chat?.id === "status") return resposta(200, { ignorado: "grupo/status" });
  if (body.fromMe && body.fromApi) return resposta(200, { ignorado: "enviada pelo Livih" });

  const conteudo = lerConteudo(body.msgContent);
  if (!conteudo) return resposta(200, { ignorado: "sem conteúdo" });

  const telefone = normalizarTelefone(body.chat?.id ?? body.sender?.id);
  if (!telefone || !body.messageId) return resposta(200, { ignorado: "sem telefone ou id" });

  if (body.fromMe) {
    const { error } = await supabase.rpc("registrar_saida_celular", {
      p_canal: canalId,
      p_wapi_id: body.messageId,
      p_telefone: telefone,
      p_tipo: conteudo.tipo,
      p_texto: conteudo.texto,
      p_payload: enxugar(body),
    });
    if (error) {
      console.error("registrar_saida_celular", error.message);
      return resposta(500, { erro: "gravar" });
    }
    return resposta(200, { ok: true });
  }

  const { data: entrada, error } = await supabase.rpc("registrar_entrada", {
    p_canal: canalId,
    p_wapi_id: body.messageId,
    p_telefone: telefone,
    p_nome_whatsapp: body.sender?.pushName ?? null,
    p_tipo: conteudo.tipo,
    p_texto: conteudo.texto,
    p_payload: enxugar(body),
    p_midia_mime: conteudo.mime,
  });
  if (error) {
    console.error("registrar_entrada", error.message);
    return resposta(500, { erro: "gravar" });
  }

  // Fase 2: conversa com o bot → avisa o agente no n8n. Só a referência vai; o n8n lê o resto do banco.
  const agenteUrl = Deno.env.get("N8N_AGENTE_URL");
  if (entrada?.chamar_agente && agenteUrl) {
    const aviso = fetch(agenteUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-livih-token": Deno.env.get("N8N_AGENTE_TOKEN") ?? "",
      },
      body: JSON.stringify({
        org_id: entrada.org_id,
        conversa_id: entrada.conversa_id,
        mensagem_id: entrada.mensagem_id,
      }),
    }).catch((e) => console.error("n8n", String(e)));
    // @ts-ignore EdgeRuntime existe no runtime do Supabase
    globalThis.EdgeRuntime?.waitUntil?.(aviso);
  }

  return resposta(200, { ok: true, duplicada: entrada?.duplicada ?? false });
});
