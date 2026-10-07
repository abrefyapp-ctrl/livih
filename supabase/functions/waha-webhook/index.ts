// Recebe os webhooks de uma sessão do WAHA e grava no banco.
// URL configurada na sessão: /functions/v1/waha-webhook?canal=<uuid>&s=<segredo>
// Eventos assinados: message.any (entrada e o que foi digitado no celular), message.ack, session.status.

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const WAHA_URL = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const AUDIO_MAX_SEGUNDOS = 5 * 60;

type Tipo = "texto" | "audio" | "imagem" | "video" | "documento" | "figurinha" | "localizacao" | "contato";
// deno-lint-ignore no-explicit-any
type Json = any;

const ACK: Record<number, string> = { 1: "enviada", 2: "entregue", 3: "lida", 4: "lida" };

function resposta(status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

// "5541999990000@c.us" → telefone; "123456@lid" → lid. Celular brasileiro sem o 9 ganha o 9.
function lerJid(jid: unknown): { telefone?: string; lid?: string } {
  if (typeof jid !== "string") return {};
  const m = jid.match(/^(\d+)(?::\d+)?@(c\.us|s\.whatsapp\.net|lid)$/);
  if (!m) return {};
  if (m[2] === "lid") return { lid: m[1] };
  const br = m[1].match(/^55(\d{2})(\d{8})$/);
  const tel = br && /^[6-9]/.test(br[2]) ? `55${br[1]}9${br[2]}` : m[1];
  return /^\d{10,15}$/.test(tel) ? { telefone: tel } : {};
}

// O WhatsApp às vezes manda só o LID no campo principal; o telefone pode estar em campos
// "Alt" dentro de _data (varia por motor: remoteJidAlt no NOWEB, SenderAlt/RecipientAlt no GOWS).
// Varre esses campos ignorando o próprio número da sessão.
function identificar(chat: string, data: Json, meDigitos: string): { telefone?: string; lid?: string } {
  const achado = lerJid(chat);
  const campos = /^(remoteJid|remoteJidAlt|participant|participantAlt|Chat|ChatAlt|Sender|SenderAlt|RecipientAlt)$/;
  const visitar = (o: Json, prof: number) => {
    if (!o || typeof o !== "object" || prof > 4 || (achado.telefone && achado.lid)) return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && campos.test(k)) {
        const j = lerJid(v);
        if (j.telefone && j.telefone !== meDigitos && !achado.telefone) achado.telefone = j.telefone;
        if (j.lid && !achado.lid) achado.lid = j.lid;
      } else if (typeof v === "object") visitar(v, prof + 1);
    }
  };
  visitar(data, 0);
  return achado;
}

async function telefoneDoLid(sessao: string, lid: string): Promise<string | undefined> {
  if (!WAHA_URL) return undefined;
  try {
    const r = await fetch(`${WAHA_URL}/api/${encodeURIComponent(sessao)}/lids/${encodeURIComponent(lid + "@lid")}`, {
      headers: { "X-Api-Key": WAHA_API_KEY },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return undefined;
    const corpo = await r.json();
    return lerJid(corpo?.pn ?? corpo?.phoneNumber).telefone;
  } catch {
    return undefined;
  }
}

function tipoDaMensagem(p: Json): Tipo | null {
  if (p.hasMedia || p.media) {
    const mime = String(p.media?.mimetype ?? "");
    if (mime === "image/webp") return "figurinha";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("image/")) return "imagem";
    if (mime.startsWith("video/")) return "video";
    return "documento";
  }
  if (p.location) return "localizacao";
  if (p.vCards?.length) return "contato";
  if (typeof p.body === "string" && p.body.trim()) return "texto";
  return null;
}

// Miniaturas em base64 só ocupam espaço no log de 30 dias.
function enxugar(o: Json, prof = 0): Json {
  if (!o || typeof o !== "object" || prof > 8) return o;
  if (Array.isArray(o)) return o.map((x) => enxugar(x, prof + 1));
  const saida: Json = {};
  for (const [k, v] of Object.entries(o)) {
    if (/^(JPEGThumbnail|jpegThumbnail|thumbnail|scansSidecar|streamingSidecar)$/.test(k)) continue;
    saida[k] = enxugar(v, prof + 1);
  }
  return saida;
}

function emSegundoPlano(p: Promise<unknown>) {
  const tarefa = p.catch((e) => console.error("segundo plano", String(e)));
  // @ts-ignore EdgeRuntime existe no runtime do Supabase
  globalThis.EdgeRuntime?.waitUntil?.(tarefa);
}

// Conversa com o bot → avisa o agente no n8n. Só a referência vai; o n8n lê o resto do banco.
async function avisarAgente(ref: { org_id: string; conversa_id: string; mensagem_id: string }) {
  const agenteUrl = Deno.env.get("N8N_AGENTE_URL");
  if (!agenteUrl) return;
  const r = await fetch(agenteUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-livih-token": Deno.env.get("N8N_AGENTE_TOKEN") ?? "" },
    body: JSON.stringify({ org_id: ref.org_id, conversa_id: ref.conversa_id, mensagem_id: ref.mensagem_id }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) console.error("n8n", r.status, (await r.text()).slice(0, 200));
}

// Baixa o áudio do WAHA (o arquivo não é guardado), transcreve e grava. Áudio longo demais não
// é transcrito: o agente vê "[audio]" e pede um áudio mais curto ou texto.
async function transcreverEAvisar(
  mensagemId: string, mediaUrl: string, mime: string | undefined, segundos: number,
  entrada: { org_id: string; conversa_id: string; mensagem_id: string; chamar_agente: boolean },
) {
  let chamar = entrada.chamar_agente;
  if (!segundos || segundos <= AUDIO_MAX_SEGUNDOS) {
    const audio = await fetch(mediaUrl, { headers: { "X-Api-Key": WAHA_API_KEY }, signal: AbortSignal.timeout(20000) });
    if (audio.ok) {
      const form = new FormData();
      const ext = (mime ?? "").includes("mpeg") ? "mp3" : (mime ?? "").includes("mp4") ? "m4a" : "ogg";
      form.append("file", new Blob([await audio.arrayBuffer()], { type: mime ?? "audio/ogg" }), `audio.${ext}`);
      form.append("model", "gpt-4o-transcribe");
      form.append("language", "pt");
      const t = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(60000),
      });
      const corpo = await t.json().catch(() => null);
      if (t.ok && corpo?.text) {
        const { data } = await supabase.rpc("registrar_transcricao", { p_mensagem: mensagemId, p_transcricao: corpo.text });
        chamar = data?.chamar_agente ?? chamar;
      } else console.error("transcrição", t.status, JSON.stringify(corpo).slice(0, 200));
    } else console.error("download do áudio", audio.status);
  }
  if (chamar) await avisarAgente(entrada);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resposta(405, { erro: "método" });

  const url = new URL(req.url);
  const canalId = url.searchParams.get("canal") ?? "";
  const { data: canais, error: erroCanal } = await supabase.rpc("canal_por_webhook", {
    p_canal: canalId,
    p_segredo: url.searchParams.get("s") ?? "",
  });
  if (erroCanal || !canais?.length) return resposta(401, { erro: "canal" });
  const canal = canais[0];

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return resposta(400, { erro: "json" });
  }
  if (canal.instance_id && body.session !== canal.instance_id) return resposta(200, { ignorado: "outra sessão" });

  const p = body.payload ?? {};

  if (body.event === "session.status") {
    await supabase.rpc("registrar_status_canal", { p_canal: canalId, p_status: String(p.status ?? "") });
    return resposta(200, { ok: true });
  }

  if (body.event === "message.ack") {
    const status = ACK[Number(p.ack)];
    if (status && p.id) {
      await supabase.rpc("registrar_status_entrega", { p_canal: canalId, p_wa_id: String(p.id), p_status: status });
    }
    return resposta(200, { ok: true });
  }

  if (body.event !== "message.any") return resposta(200, { ignorado: body.event ?? "sem evento" });

  const chat: string = p.fromMe ? p.to : p.from;
  if (!chat || chat.endsWith("@g.us") || chat.endsWith("@broadcast") || chat.endsWith("@newsletter")) {
    return resposta(200, { ignorado: "grupo/status/canal" });
  }
  if (p.fromMe && p.source === "api") return resposta(200, { ignorado: "enviada pelo Livih" });

  const tipo = tipoDaMensagem(p);
  if (!tipo || !p.id) return resposta(200, { ignorado: "sem conteúdo" });

  const meDigitos = String(body.me?.id ?? "").split("@")[0].split(":")[0];
  const quem = identificar(chat, p._data, meDigitos);
  if (!quem.telefone && quem.lid) quem.telefone = await telefoneDoLid(body.session, quem.lid);
  if (!quem.telefone && !quem.lid) return resposta(200, { ignorado: "sem telefone nem LID" });

  const texto = typeof p.body === "string" && p.body.trim() ? p.body : (p.media?.filename ?? null);
  const comum = {
    p_canal: canalId,
    p_wa_id: String(p.id),
    p_telefone: quem.telefone ?? null,
    p_lid: quem.lid ?? null,
    p_tipo: tipo,
    p_texto: texto,
    p_payload: enxugar(body),
  };

  if (p.fromMe) {
    const { error } = await supabase.rpc("registrar_saida_celular", comum);
    if (error) {
      console.error("registrar_saida_celular", error.message);
      return resposta(500, { erro: "gravar" });
    }
    return resposta(200, { ok: true });
  }

  const { data: entrada, error } = await supabase.rpc("registrar_entrada", {
    ...comum,
    p_nome_whatsapp: p._data?.pushName ?? p._data?.Info?.PushName ?? p._data?.notifyName ?? null,
    p_midia_mime: p.media?.mimetype ?? null,
  });
  if (error) {
    console.error("registrar_entrada", error.message);
    return resposta(500, { erro: "gravar" });
  }

  if (entrada?.duplicada) return resposta(200, { ok: true, duplicada: true });

  // Áudio: transcreve depois de responder ao WAHA e só então acorda o agente, que já recebe o texto.
  const segundos = Number(p._data?.Message?.audioMessage?.seconds ?? p._data?.message?.audioMessage?.seconds ?? 0);
  if (tipo === "audio" && p.media?.url && OPENAI_API_KEY) {
    emSegundoPlano(transcreverEAvisar(entrada.mensagem_id, p.media.url, p.media.mimetype, segundos, entrada));
  } else if (entrada?.chamar_agente) {
    emSegundoPlano(avisarAgente(entrada));
  }

  return resposta(200, { ok: true, duplicada: entrada?.duplicada ?? false });
});
