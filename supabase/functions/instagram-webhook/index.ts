// Webhook do Instagram (Direct), entrega 1 de docs/instagram.md: as mensagens viram conversas na Livih.
// Mesmo app "livih" da API oficial do WhatsApp: a assinatura é a mesma (X-Hub-Signature-256 com META_APP_SECRET) e a
// verificação usa o mesmo META_VERIFY_TOKEN. O canal sai do ID da conta profissional (entry.id), que a whatsapp-conexao
// grava em canais.instance_id ao conectar.
// URL no painel do app (Instagram → Webhooks): /functions/v1/instagram-webhook
//
// A leitura e a gravação ficam em _shared/instagram.ts, as mesmas da busca pela API (instagram-sincronizar).
// Eco (is_echo, entrega 2): o que a equipe digita no app do Instagram entra e a passa a conversa para a equipe; o que
// a própria Livih mandou é reconhecido e ignorado. Lido e reações ainda não.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { gravarEco, gravarRecebida, lerMensagemWebhook, type Json } from "../_shared/instagram.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") ?? "";

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

async function entrada(canal: { canal_id: string; org_id: string }, ev: Json) {
  const m = ev.message ?? {};
  if (!m.mid) return;
  // Eco: a conta da empresa mandou (pela Livih ou pelo app do Instagram); o cliente é o destinatário.
  if (m.is_echo) {
    const cliente = String(ev.recipient?.id ?? "");
    if (cliente) await gravarEco(supabase, canal, { mid: String(m.mid), igsid: cliente }, lerMensagemWebhook(m), { evento: ev });
    return;
  }
  const igsid = String(ev.sender?.id ?? "");
  if (!igsid) return;
  if (m.is_deleted) {
    console.log("mensagem apagada pela pessoa", m.mid);
    return;
  }
  await gravarRecebida(supabase, canal, { mid: String(m.mid), igsid }, lerMensagemWebhook(m), { evento: ev });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const limpar = (t: string | null) => (t ?? "").trim().replace(/^["']|["']$/g, "");
    const esperado = limpar(VERIFY_TOKEN);
    const recebido = limpar(url.searchParams.get("hub.verify_token"));
    const ok = url.searchParams.get("hub.mode") === "subscribe" && esperado !== "" && recebido === esperado;
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
  if (body.object !== "instagram") return resposta(200, { ignorado: body.object ?? "sem object" });

  // Falha ao gravar devolve 500: a Meta reenvia, e o mid impede duplicar o que já entrou.
  let falhou = false;
  for (const registro of body.entry ?? []) {
    const conta = String(registro.id ?? "");
    const { data: canais } = await supabase.rpc("canal_por_instagram", { p_conta: conta });
    const canal = canais?.[0];
    if (!canal) {
      console.log("conta do Instagram sem canal ativo", conta);
      continue;
    }
    for (const ev of registro.messaging ?? []) {
      try {
        if (ev.message) await entrada(canal, ev);
        else console.log("evento do Instagram não tratado", Object.keys(ev).filter((k) => !["sender", "recipient", "timestamp"].includes(k)).join(","));
      } catch (e) {
        console.error("instagram-webhook", String(e));
        falhou = true;
      }
    }
  }
  return falhou ? resposta(500, { erro: "gravar" }) : resposta(200, { ok: true });
});
