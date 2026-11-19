// Webhook do Instagram (Direct), entrega 1 de docs/instagram.md: as mensagens viram conversas na Livih.
// Mesmo app "livih" da API oficial do WhatsApp: a assinatura é a mesma (X-Hub-Signature-256 com META_APP_SECRET) e a
// verificação usa o mesmo META_VERIFY_TOKEN. O canal sai do ID da conta profissional (entry.id), que a whatsapp-conexao
// grava em canais.instance_id ao conectar.
// URL no painel do app (Instagram → Webhooks): /functions/v1/instagram-webhook
//
// O que entra: texto, imagem, vídeo, áudio, arquivo, resposta a Story (a imagem do Story é guardada na hora, porque o
// link da Meta expira, e descrita pela IA como as imagens do WhatsApp), menção em Story e publicação compartilhada.
// O que fica para a entrega 2: o eco do que a equipe digita no app do Instagram (is_echo), lido, reações.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { avisarAgente, emSegundoPlano, transcreverEAvisar } from "../_shared/atendimento.ts";
import { descreve, guardarDescreverEAvisar, guardarMidiaRecebida } from "../_shared/midia.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") ?? "";
const GRAPH = "https://graph.facebook.com/v25.0";

type Tipo = "texto" | "audio" | "imagem" | "video" | "documento" | "outro";
// deno-lint-ignore no-explicit-any
type Json = any;
type Lida = { tipo: Tipo; texto: string | null; url?: string; mime?: string; nome?: string };

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

const juntar = (...partes: (string | null | undefined)[]) => partes.filter((p) => p && p.trim()).join("\n") || null;

/**
 * Uma mensagem do Direct pode trazer texto e vários anexos; na Livih cada anexo vira uma mensagem (como no WhatsApp),
 * e o texto vai na primeira. Resposta a Story vira imagem, com o texto da pessoa.
 */
function lerMensagem(m: Json): Lida[] {
  const texto: string | null = m.text?.trim() ? m.text : null;
  const story = m.reply_to?.story;
  if (story?.url) {
    return [{ tipo: "imagem", texto: juntar("Respondeu ao seu Story:", texto), url: story.url, nome: "story.jpg" }];
  }
  const anexos: Lida[] = [];
  for (const a of m.attachments ?? []) {
    const url: string | undefined = a?.payload?.url;
    switch (a?.type) {
      case "image":
        anexos.push({ tipo: "imagem", texto: null, url });
        break;
      case "video":
      case "ig_reel":
      case "reel":
        // Vídeo enviado vira vídeo; reel compartilhado vira o link (o arquivo é da Meta e pode ser grande).
        if (a.type === "video") anexos.push({ tipo: "video", texto: null, url });
        else anexos.push({ tipo: "texto", texto: juntar("Compartilhou um reel:", a.payload?.title, url) });
        break;
      case "audio":
        anexos.push({ tipo: "audio", texto: null, url });
        break;
      case "file":
        anexos.push({ tipo: "documento", texto: null, url, nome: a.payload?.name ?? undefined });
        break;
      case "story_mention":
        anexos.push({ tipo: "imagem", texto: "Mencionou a empresa no Story dele", url });
        break;
      case "share":
      case "ig_post":
        anexos.push({ tipo: "texto", texto: juntar("Compartilhou uma publicação:", a.payload?.title, url) });
        break;
      default:
        anexos.push({ tipo: "outro", texto: `[${a?.type ?? "anexo"} do Instagram]` });
    }
  }
  if (!anexos.length) return texto ? [{ tipo: "texto", texto }] : [];
  if (texto) anexos[0].texto = juntar(texto, anexos[0].texto);
  return anexos;
}

// O link do anexo é público e temporário (CDN da Meta): baixa sem token.
const baixar = (url: string) => () => fetch(url, { signal: AbortSignal.timeout(20000) });

async function tokenDoCanal(canalId: string): Promise<string | null> {
  const { data } = await supabase.rpc("meta_token_do_canal", { p_canal: canalId });
  return (data as string | null) || null;
}

// Nome e @ da pessoa: o webhook só traz o ID. Busca uma vez, quando o contato ainda não tem o @.
async function completarPerfil(canalId: string, orgId: string, igsid: string) {
  const { data: ct } = await supabase.from("contatos").select("id, instagram_usuario")
    .eq("org_id", orgId).eq("instagram_id", igsid).maybeSingle();
  if (!ct || ct.instagram_usuario) return;
  const token = await tokenDoCanal(canalId);
  if (!token) return;
  const r = await fetch(`${GRAPH}/${igsid}?fields=name,username`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
  });
  const p = await r.json().catch(() => null);
  if (!r.ok || !p) {
    console.error("perfil do Instagram", r.status, JSON.stringify(p?.error ?? p).slice(0, 200));
    return;
  }
  const usuario = typeof p.username === "string" && /^[A-Za-z0-9._]{1,30}$/.test(p.username) ? p.username : null;
  const nome = typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 120) : null;
  if (!usuario && !nome) return;
  const { error } = await supabase.from("contatos")
    .update({ ...(usuario ? { instagram_usuario: usuario } : {}), ...(nome ? { nome_whatsapp: nome } : {}) })
    .eq("id", ct.id);
  if (error) console.error("perfil do Instagram: gravar", error.message);
}

async function entrada(canalId: string, orgId: string, ev: Json) {
  const m = ev.message ?? {};
  const igsid = String(ev.sender?.id ?? "");
  if (!m.mid || !igsid) return;
  if (m.is_echo) return; // entrega 2: o que a equipe digitou no app do Instagram
  if (m.is_deleted) {
    console.log("mensagem apagada pela pessoa", m.mid);
    return;
  }
  const lidas: Lida[] = m.is_unsupported ? [{ tipo: "outro", texto: "[mensagem que o Instagram só mostra no app]" }] : lerMensagem(m);

  let primeira = true;
  for (const [i, lida] of lidas.entries()) {
    const mid = i === 0 ? String(m.mid) : `${m.mid}:${i}`;
    const { data: e, error } = await supabase.rpc("registrar_entrada_instagram", {
      p_canal: canalId,
      p_mid: mid,
      p_igsid: igsid,
      p_usuario: null,
      p_nome: null,
      p_tipo: lida.tipo,
      p_texto: lida.texto,
      p_payload: { evento: ev, anexo: i },
      p_midia_mime: lida.mime ?? null,
    });
    if (error) throw new Error(`registrar_entrada_instagram: ${error.message}`);
    if (e?.duplicada) continue;
    if (primeira) {
      primeira = false;
      emSegundoPlano(completarPerfil(canalId, orgId, igsid));
    }

    // Igual ao WhatsApp: áudio é transcrito; imagem e PDF são guardados e descritos; o agente é chamado depois.
    const ref = { canal_id: canalId, wa_id: mid, tipo: lida.tipo, mime: lida.mime, nome: lida.nome };
    if (lida.url && lida.tipo === "audio") {
      emSegundoPlano(guardarMidiaRecebida(supabase, ref, baixar(lida.url)));
      emSegundoPlano(transcreverEAvisar(supabase, baixar(lida.url), lida.mime ?? "audio/mp4", 0, e));
    } else if (lida.url && (lida.tipo === "imagem" || descreve(lida.tipo, lida.mime ?? lida.nome))) {
      emSegundoPlano(guardarDescreverEAvisar(supabase, ref, baixar(lida.url), e, lida.texto));
    } else {
      if (lida.url) emSegundoPlano(guardarMidiaRecebida(supabase, ref, baixar(lida.url)));
      if (e?.chamar_agente) emSegundoPlano(avisarAgente(supabase, e));
    }
  }
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
        if (ev.message) await entrada(canal.canal_id, canal.org_id, ev);
        else console.log("evento do Instagram não tratado", Object.keys(ev).filter((k) => !["sender", "recipient", "timestamp"].includes(k)).join(","));
      } catch (e) {
        console.error("instagram-webhook", String(e));
        falhou = true;
      }
    }
  }
  return falhou ? resposta(500, { erro: "gravar" }) : resposta(200, { ok: true });
});
