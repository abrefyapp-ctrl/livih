// Mensagens do Instagram (Direct), docs/instagram.md: o que o instagram-webhook (eventos da Meta) e o
// instagram-sincronizar (busca pela API, a cada minuto) fazem igual. Cada porta lê a mensagem no formato dela e
// entrega aqui a lista do que gravar; a gravação, a mídia e o perfil da pessoa são os mesmos.
// A busca existe porque, em 19/11, a Meta não entregava ao webhook as mensagens reais do livih.tech (só o teste do
// painel), embora a API enxergasse as conversas. O ID da mensagem é o mesmo nas duas portas: a que chegar depois é
// recusada como duplicada (eventos_recebidos).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { avisarAgente, emSegundoPlano, transcreverEAvisar } from "./atendimento.ts";
import { descreve, guardarDescreverEAvisar, guardarMidiaRecebida } from "./midia.ts";

export const GRAPH = "https://graph.facebook.com/v25.0";

export type Tipo = "texto" | "audio" | "imagem" | "video" | "documento" | "outro";
// deno-lint-ignore no-explicit-any
export type Json = any;
export type Lida = { tipo: Tipo; texto: string | null; url?: string; mime?: string; nome?: string };

export const juntar = (...partes: (string | null | undefined)[]) => partes.filter((p) => p && p.trim()).join("\n") || null;

/**
 * Mensagem do webhook (formato do evento). Uma mensagem pode trazer texto e vários anexos; na Livih cada anexo vira
 * uma mensagem (como no WhatsApp), e o texto vai na primeira. Resposta a Story vira imagem, com o texto da pessoa.
 */
export function lerMensagemWebhook(m: Json): Lida[] {
  if (m.is_unsupported) return [{ tipo: "outro", texto: "[mensagem que o Instagram só mostra no app]" }];
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
        anexos.push({ tipo: "video", texto: null, url });
        break;
      case "ig_reel":
      case "reel":
        // Reel compartilhado vira o link (o arquivo é da Meta e pode ser grande).
        anexos.push({ tipo: "texto", texto: juntar("Compartilhou um reel:", a.payload?.title, url) });
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

/**
 * Mensagem da API de conversas (GET /{conversa}/messages): os campos têm outros nomes. Story respondido vem em
 * story.reply_to, menção em story.mention; anexos com image_data, video_data ou file_url.
 */
export function lerMensagemApi(m: Json): Lida[] {
  if (m.is_unsupported) return [{ tipo: "outro", texto: "[mensagem que o Instagram só mostra no app]" }];
  const texto: string | null = typeof m.message === "string" && m.message.trim() ? m.message : null;
  const resposta = m.story?.reply_to;
  if (resposta?.link) {
    return [{ tipo: "imagem", texto: juntar("Respondeu ao seu Story:", texto), url: resposta.link, nome: "story.jpg" }];
  }
  if (m.story?.mention?.link) {
    return [{ tipo: "imagem", texto: juntar("Mencionou a empresa no Story dele", texto), url: m.story.mention.link }];
  }
  const anexos: Lida[] = [];
  for (const a of m.attachments?.data ?? []) {
    const mime: string | undefined = a?.mime_type ?? undefined;
    if (a?.image_data?.url) anexos.push({ tipo: "imagem", texto: null, url: a.image_data.url, mime });
    else if (a?.video_data?.url) anexos.push({ tipo: mime?.startsWith("audio/") ? "audio" : "video", texto: null, url: a.video_data.url, mime });
    else if (a?.file_url) {
      const tipo: Tipo = mime?.startsWith("audio/") ? "audio" : mime?.startsWith("image/") ? "imagem" : "documento";
      anexos.push({ tipo, texto: null, url: a.file_url, mime, nome: a.name ?? undefined });
    } else anexos.push({ tipo: "outro", texto: "[anexo do Instagram]" });
  }
  for (const s of m.shares?.data ?? []) {
    anexos.push({ tipo: "texto", texto: juntar("Compartilhou uma publicação:", s?.name, s?.link) });
  }
  if (!anexos.length) return texto ? [{ tipo: "texto", texto }] : [];
  if (texto) anexos[0].texto = juntar(texto, anexos[0].texto);
  return anexos;
}

// O link do anexo é público e temporário (CDN da Meta): baixa sem token.
const baixar = (url: string) => () => fetch(url, { signal: AbortSignal.timeout(20000) });

export async function tokenDoCanal(supabase: SupabaseClient, canalId: string): Promise<string | null> {
  const { data } = await supabase.rpc("meta_token_do_canal", { p_canal: canalId });
  return (data as string | null) || null;
}

// Nome e @ da pessoa: o webhook só traz o ID, e a busca pela API traz o @ sem o nome. Busca enquanto faltar um dos dois
// (19/11: o contato do felippers85 entrou pela busca com o @ e sem nome).
async function completarPerfil(supabase: SupabaseClient, canalId: string, orgId: string, igsid: string) {
  const { data: ct } = await supabase.from("contatos").select("id, instagram_usuario, nome_whatsapp")
    .eq("org_id", orgId).eq("instagram_id", igsid).maybeSingle();
  if (!ct || (ct.instagram_usuario && ct.nome_whatsapp)) return;
  const token = await tokenDoCanal(supabase, canalId);
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

/**
 * Eco (entrega 2): mensagem que a conta da empresa mandou ao cliente. Se foi a Livih (equipe ou agente), o banco
 * reconhece e ignora; se foi alguém pelo app do Instagram, entra na conversa e a equipe assume
 * (registrar_saida_instagram). O arquivo do eco não é baixado: o balão mostra o tipo ("[imagem]").
 */
export async function gravarEco(
  supabase: SupabaseClient,
  canal: { canal_id: string },
  base: { mid: string; igsid: string },
  lidas: Lida[],
  payload: Json,
): Promise<number> {
  let novas = 0;
  for (const [i, lida] of lidas.entries()) {
    const { data, error } = await supabase.rpc("registrar_saida_instagram", {
      p_canal: canal.canal_id,
      p_mid: i === 0 ? base.mid : `${base.mid}:${i}`,
      p_igsid: base.igsid,
      p_tipo: lida.tipo,
      p_texto: lida.texto,
      p_payload: { ...payload, anexo: i },
    });
    if (error) throw new Error(`registrar_saida_instagram: ${error.message}`);
    if (!data?.duplicada) novas++;
  }
  return novas;
}

/**
 * Grava as partes de uma mensagem recebida (mid, mid:1…) e cuida da mídia como no WhatsApp: áudio é transcrito;
 * imagem e PDF são guardados e descritos; o agente é chamado depois. Devolve quantas partes entraram (0 = já estava).
 */
export async function gravarRecebida(
  supabase: SupabaseClient,
  canal: { canal_id: string; org_id: string },
  base: { mid: string; igsid: string; usuario?: string | null },
  lidas: Lida[],
  payload: Json,
): Promise<number> {
  let novas = 0;
  for (const [i, lida] of lidas.entries()) {
    const mid = i === 0 ? base.mid : `${base.mid}:${i}`;
    const { data: e, error } = await supabase.rpc("registrar_entrada_instagram", {
      p_canal: canal.canal_id,
      p_mid: mid,
      p_igsid: base.igsid,
      p_usuario: base.usuario ?? null,
      p_nome: null,
      p_tipo: lida.tipo,
      p_texto: lida.texto,
      p_payload: { ...payload, anexo: i },
      p_midia_mime: lida.mime ?? null,
    });
    if (error) throw new Error(`registrar_entrada_instagram: ${error.message}`);
    if (e?.duplicada) continue;
    if (!novas) emSegundoPlano(completarPerfil(supabase, canal.canal_id, canal.org_id, base.igsid));
    novas++;

    const ref = { canal_id: canal.canal_id, wa_id: mid, tipo: lida.tipo, mime: lida.mime, nome: lida.nome };
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
  return novas;
}
