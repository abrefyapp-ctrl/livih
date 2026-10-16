// Guarda no bucket `midias` o arquivo de uma mensagem que acabou de entrar (cliente, ou equipe pelo celular).
// Usado pelos webhooks do WAHA e da Meta, sempre em segundo plano: a mensagem já foi gravada e o agente já foi
// avisado; aqui só se completa o histórico. Migration 20261016130000 (o arquivo entra uma vez e não muda mais).

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const LIMITE = 50 * 1024 * 1024; // mesmo limite do bucket

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/3gpp": "3gp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
  "application/pdf": "pdf",
};
const ROTULO: Record<string, string> = { imagem: "imagem", video: "video", audio: "audio", figurinha: "figurinha", documento: "documento" };

/** Nome que vai no caminho do storage (sem acento nem símbolo) e o nome que a equipe vê. */
function nomes(tipo: string, mime: string, nomeOriginal?: string | null) {
  const ext = EXTENSOES[mime.split(";")[0].trim()] ?? (nomeOriginal?.match(/\.(\w{1,6})$/)?.[1] ?? "bin");
  const visivel = (nomeOriginal?.trim() || `${ROTULO[tipo] ?? "arquivo"}.${ext}`).slice(0, 200);
  const chave = visivel.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80) || `arquivo.${ext}`;
  return { visivel, chave };
}

export async function guardarMidiaRecebida(
  supabase: SupabaseClient,
  ref: { canal_id: string; wa_id: string; tipo: string; mime?: string | null; nome?: string | null },
  baixar: () => Promise<Response>,
) {
  const { data: destino, error } = await supabase.rpc("midia_destino", { p_canal: ref.canal_id, p_wa_id: ref.wa_id });
  if (error || !destino?.mensagem_id || destino.ja_tem) {
    if (error) console.error("midia_destino", error.message);
    return;
  }
  const r = await baixar();
  if (!r.ok) {
    console.error("download da mídia", r.status, ref.wa_id);
    return;
  }
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.byteLength > LIMITE) {
    console.error("mídia acima de 50 MB, não guardada", ref.wa_id, bytes.byteLength);
    return;
  }
  const mime = (ref.mime || r.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
  const { visivel, chave } = nomes(ref.tipo, mime, ref.nome);
  const path = `${destino.org_id}/${destino.conversa_id}/recebido-${destino.mensagem_id}-${chave}`;
  const { error: erroUpload } = await supabase.storage.from("midias").upload(path, bytes, { contentType: mime, upsert: false });
  if (erroUpload) {
    console.error("upload da mídia", erroUpload.message, ref.wa_id);
    return;
  }
  const { error: erroGuardar } = await supabase.rpc("guardar_midia", {
    p_mensagem: destino.mensagem_id, p_path: path, p_nome: visivel, p_mime: mime,
  });
  if (erroGuardar) console.error("guardar_midia", erroGuardar.message, ref.wa_id);
}
