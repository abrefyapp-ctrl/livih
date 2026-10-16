// Webhook da API oficial do WhatsApp (Cloud API). Um só para o app "livih" na Meta: o canal sai do
// phone_number_id que vem em cada evento.
// URL no painel do app (WhatsApp → Configuração): /functions/v1/meta-webhook
//   GET  → verificação (hub.verify_token = META_VERIFY_TOKEN)
//   POST → eventos, assinados com X-Hub-Signature-256 (HMAC do corpo com META_APP_SECRET)
// Campos assinados: messages, smb_message_echoes (o que foi digitado no app do celular, na coexistência),
// history e smb_app_state_sync (histórico e contatos do app, mandados uma vez ao conectar).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { avisarAgente, emSegundoPlano, normalizarTelefone, transcreverEAvisar } from "../_shared/atendimento.ts";
import { guardarMidiaRecebida } from "../_shared/midia.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") ?? "";
const TOKEN_SISTEMA = Deno.env.get("META_SYSTEM_TOKEN") ?? "";
const GRAPH = "https://graph.facebook.com/v25.0";

type Tipo = "texto" | "audio" | "imagem" | "video" | "documento" | "figurinha" | "localizacao" | "contato";
// deno-lint-ignore no-explicit-any
type Json = any;

const STATUS: Record<string, string> = { sent: "enviada", delivered: "entregue", read: "lida", failed: "erro" };

function resposta(status: number, corpo: Record<string, unknown> | string) {
  return typeof corpo === "string"
    ? new Response(corpo, { status, headers: { "Content-Type": "text/plain" } })
    : new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

async function assinaturaValida(corpo: string, cabecalho: string | null): Promise<boolean> {
  if (!APP_SECRET || !cabecalho?.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  const esperado = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const recebido = cabecalho.slice(7).toLowerCase();
  if (recebido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return dif === 0;
}

// Tipo e texto de uma mensagem (entrada ou eco do celular). null = não vira mensagem (reação, sistema…).
function lerMensagem(m: Json): { tipo: Tipo; texto: string | null; midia?: { id: string; mime?: string; nome?: string } } | null {
  switch (m.type) {
    case "text":
      return m.text?.body?.trim() ? { tipo: "texto", texto: m.text.body } : null;
    case "audio":
      return { tipo: "audio", texto: null, midia: { id: m.audio?.id, mime: m.audio?.mime_type } };
    case "image":
      return { tipo: "imagem", texto: m.image?.caption ?? null, midia: { id: m.image?.id, mime: m.image?.mime_type } };
    case "video":
      return { tipo: "video", texto: m.video?.caption ?? null, midia: { id: m.video?.id, mime: m.video?.mime_type } };
    case "document":
      return { tipo: "documento", texto: m.document?.caption ?? m.document?.filename ?? null, midia: { id: m.document?.id, mime: m.document?.mime_type, nome: m.document?.filename } };
    case "sticker":
      return { tipo: "figurinha", texto: null, midia: { id: m.sticker?.id, mime: m.sticker?.mime_type } };
    case "location":
      return { tipo: "localizacao", texto: [m.location?.name, m.location?.address].filter(Boolean).join(" — ") || null };
    case "contacts":
      return { tipo: "contato", texto: m.contacts?.[0]?.name?.formatted_name ?? null };
    // Botões e listas: o que a pessoa escolheu é texto para o atendimento.
    case "button":
      return { tipo: "texto", texto: m.button?.text ?? null };
    case "interactive": {
      const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
      return r?.title ? { tipo: "texto", texto: r.title } : null;
    }
    default:
      return null;
  }
}

async function tokenDoCanal(canalId: string): Promise<string> {
  const { data } = await supabase.rpc("meta_token_do_canal", { p_canal: canalId });
  return (data as string | null) || TOKEN_SISTEMA;
}

// Mídia da Meta: o id vira uma URL temporária, que também exige o token.
async function baixarMidia(mediaId: string, token: string): Promise<Response> {
  const info = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  const corpo = await info.json().catch(() => null);
  if (!info.ok || !corpo?.url) return new Response(null, { status: info.status || 502 });
  return await fetch(corpo.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
}

// Arquivo da mensagem (imagem, PDF, vídeo, áudio) para o bucket `midias`, depois de gravar a mensagem.
async function guardarMidia(canalId: string, m: Json, lida: NonNullable<ReturnType<typeof lerMensagem>>) {
  if (!lida.midia?.id) return;
  const token = await tokenDoCanal(canalId);
  await guardarMidiaRecebida(
    supabase,
    { canal_id: canalId, wa_id: String(m.id), tipo: lida.tipo, mime: lida.midia.mime, nome: lida.midia.nome },
    () => baixarMidia(lida.midia!.id, token),
  );
}

async function entrada(canalId: string, m: Json, nomes: Map<string, string>, valor: Json) {
  const lida = lerMensagem(m);
  const telefone = normalizarTelefone(m.from);
  if (!lida || !m.id || !telefone) return;

  const { data: e, error } = await supabase.rpc("registrar_entrada", {
    p_canal: canalId,
    p_wa_id: String(m.id),
    p_telefone: telefone,
    p_lid: null,
    p_nome_whatsapp: nomes.get(m.from) ?? null,
    p_tipo: lida.tipo,
    p_texto: lida.texto,
    p_payload: { metadata: valor.metadata, contacts: valor.contacts, message: m },
    p_midia_mime: lida.midia?.mime ?? null,
  });
  if (error) throw new Error(`registrar_entrada: ${error.message}`);
  if (e?.duplicada) return;
  emSegundoPlano(guardarMidia(canalId, m, lida));

  if (lida.tipo === "audio" && lida.midia?.id) {
    const token = await tokenDoCanal(canalId);
    emSegundoPlano(transcreverEAvisar(supabase, () => baixarMidia(lida.midia!.id, token), lida.midia.mime, 0, e));
  } else if (e?.chamar_agente) {
    emSegundoPlano(avisarAgente(supabase, e));
  }
}

// Mensagem digitada no app WhatsApp Business do celular (coexistência): a equipe assumiu a conversa.
async function ecoDoCelular(canalId: string, m: Json, valor: Json) {
  const lida = lerMensagem(m);
  const telefone = normalizarTelefone(m.to);
  if (!lida || !m.id || !telefone) return;
  const { error } = await supabase.rpc("registrar_saida_celular", {
    p_canal: canalId,
    p_wa_id: String(m.id),
    p_telefone: telefone,
    p_lid: null,
    p_tipo: lida.tipo,
    p_texto: lida.texto,
    p_payload: { metadata: valor.metadata, message: m },
  });
  if (error) throw new Error(`registrar_saida_celular: ${error.message}`);
  emSegundoPlano(guardarMidia(canalId, m, lida));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    // Espaço ou aspas nas pontas aparecem fácil ao colar o token no terminal ou no painel.
    const limpar = (t: string | null) => (t ?? "").trim().replace(/^["']|["']$/g, "");
    const esperado = limpar(VERIFY_TOKEN);
    const recebido = limpar(url.searchParams.get("hub.verify_token"));
    const ok = url.searchParams.get("hub.mode") === "subscribe" && esperado !== "" && recebido === esperado;
    // Só tamanhos no log, nunca o token.
    if (!ok) console.error("verificação recusada", { modo: url.searchParams.get("hub.mode"), esperado: esperado.length, recebido: recebido.length });
    return ok ? resposta(200, url.searchParams.get("hub.challenge") ?? "") : resposta(403, "verify token");
  }
  if (req.method !== "POST") return resposta(405, { erro: "método" });

  const bruto = await req.text();
  if (!(await assinaturaValida(bruto, req.headers.get("x-hub-signature-256")))) return resposta(401, { erro: "assinatura" });

  let body: Json;
  try {
    body = JSON.parse(bruto);
  } catch {
    return resposta(400, { erro: "json" });
  }
  if (body.object !== "whatsapp_business_account") return resposta(200, { ignorado: body.object ?? "sem object" });

  // Falha ao gravar devolve 500: a Meta reenvia, e o wa_id impede duplicar o que já entrou.
  let falhou = false;
  for (const registro of body.entry ?? []) {
    for (const mudanca of registro.changes ?? []) {
      const valor = mudanca.value ?? {};
      const phoneId = valor.metadata?.phone_number_id;
      if (!phoneId) continue;
      const { data: canais } = await supabase.rpc("canal_por_numero_meta", { p_phone_number_id: String(phoneId) });
      const canal = canais?.[0];
      if (!canal) {
        console.log("número sem canal ativo", phoneId, mudanca.field);
        continue;
      }
      try {
        if (mudanca.field === "messages") {
          const nomes = new Map<string, string>(
            (valor.contacts ?? []).map((c: Json) => [String(c.wa_id), String(c.profile?.name ?? "")] as [string, string]),
          );
          for (const m of valor.messages ?? []) await entrada(canal.canal_id, m, nomes, valor);
          for (const s of valor.statuses ?? []) {
            const status = STATUS[s.status];
            if (status && s.id) {
              await supabase.rpc("registrar_status_entrega", { p_canal: canal.canal_id, p_wa_id: String(s.id), p_status: status });
            }
            if (s.status === "failed") console.error("envio recusado pela Meta", s.id, JSON.stringify(s.errors ?? []).slice(0, 300));
          }
        } else if (mudanca.field === "smb_message_echoes") {
          for (const m of valor.message_echoes ?? []) await ecoDoCelular(canal.canal_id, m, valor);
        } else if (mudanca.field === "history" || mudanca.field === "smb_app_state_sync") {
          const { error } = await supabase.from("meta_sincronizacao").insert({ canal_id: canal.canal_id, campo: mudanca.field, payload: valor });
          if (error) throw new Error(`meta_sincronizacao: ${error.message}`);
        } else {
          console.log("campo não tratado", mudanca.field);
        }
      } catch (e) {
        console.error("meta-webhook", mudanca.field, String(e));
        falhou = true;
      }
    }
  }
  return falhou ? resposta(500, { erro: "gravar" }) : resposta(200, { ok: true });
});
