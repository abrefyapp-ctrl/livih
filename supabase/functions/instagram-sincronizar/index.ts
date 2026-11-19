// Busca as mensagens do Direct pela API, a cada minuto (cron livih-instagram-sincronizar, header x-livih-segredo).
// Reserva do instagram-webhook (docs/instagram.md): em 19/11 a Meta não entregava ao webhook as mensagens reais do
// livih.tech, embora a API de conversas as mostrasse. Para cada conta do Instagram ativa, pega as conversas que mudaram
// na última hora e as mensagens recebidas nelas; a que já entrou (pelo webhook ou numa busca anterior) é recusada pelo
// ID, então repetir não duplica e não é preciso guardar um "lido até". Só mensagens depois de a conta ser conectada:
// o histórico de antes não entra.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { GRAPH, gravarRecebida, lerMensagemApi, tokenDoCanal, type Json } from "../_shared/instagram.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const JANELA_MS = 60 * 60 * 1000;
// Do mais completo ao mínimo: se a Meta recusar um campo (erro 100), tenta o seguinte.
const CAMPOS_MENSAGEM = [
  "id,created_time,from,message,attachments{mime_type,name,image_data,video_data,file_url},story,shares{link,name},is_unsupported",
  "id,created_time,from,message,attachments,story",
  "id,created_time,from,message",
];

// "2026-11-19T20:12:36+0000" → Date (o fuso sem dois-pontos não é ISO).
const quando = (t: unknown) => new Date(String(t ?? "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));

async function conversas(conta: string, token: string): Promise<Json[]> {
  for (const campos of CAMPOS_MENSAGEM) {
    const q = `fields=updated_time,messages.limit(20){${campos}}&limit=25&platform=instagram`;
    const r = await fetch(`${GRAPH}/${conta}/conversations?${q}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000),
    });
    const corpo = await r.json().catch(() => null);
    if (r.ok) return corpo?.data ?? [];
    const codigo = Number(corpo?.error?.code);
    console.error("conversas do Instagram", conta, r.status, JSON.stringify(corpo?.error ?? corpo).slice(0, 300));
    if (codigo !== 100) return [];
  }
  return [];
}

async function sincronizar(c: { id: string; org_id: string; instance_id: string; criado_em: string }) {
  const token = await tokenDoCanal(supabase, c.id);
  if (!token) return { conta: c.instance_id, erro: "sem token" };
  const desde = Math.max(Date.now() - JANELA_MS, new Date(c.criado_em).getTime());
  let novas = 0, falhas = 0;
  for (const conv of await conversas(c.instance_id, token)) {
    if (quando(conv.updated_time).getTime() < desde) continue;
    // A API traz da mais nova para a mais antiga: grava na ordem em que foram mandadas.
    const recebidas = ((conv.messages?.data ?? []) as Json[])
      .filter((m) => m?.id && m.from?.id && String(m.from.id) !== c.instance_id && quando(m.created_time).getTime() >= desde)
      .reverse();
    for (const m of recebidas) {
      try {
        novas += await gravarRecebida(
          supabase,
          { canal_id: c.id, org_id: c.org_id },
          { mid: String(m.id), igsid: String(m.from.id), usuario: m.from.username ?? null },
          lerMensagemApi(m),
          { api: m },
        );
      } catch (e) {
        falhas++;
        console.error("instagram-sincronizar", m.id, String(e).slice(0, 300));
      }
    }
  }
  return { conta: c.instance_id, novas, falhas };
}

Deno.serve(async (req) => {
  const { data: autorizado } = await supabase.rpc("verificar_segredo_interno", {
    p_segredo: req.headers.get("x-livih-segredo") ?? "",
  });
  if (autorizado !== true) return new Response("não autorizado", { status: 401 });

  const { data: canais, error } = await supabase.from("canais")
    .select("id, org_id, instance_id, criado_em, organizacoes!inner(status)")
    .eq("tipo", "instagram").eq("ativo", true).eq("organizacoes.status", "ativa");
  if (error) return new Response(JSON.stringify({ erro: error.message }), { status: 500 });

  const resultado = [];
  for (const c of (canais ?? []) as { id: string; org_id: string; instance_id: string | null; criado_em: string }[]) {
    if (!c.instance_id) continue;
    resultado.push(await sincronizar({ ...c, instance_id: c.instance_id }));
  }
  const novas = resultado.reduce((t, r) => t + (r.novas ?? 0), 0);
  if (novas) console.log("instagram-sincronizar", JSON.stringify(resultado));
  return new Response(JSON.stringify({ contas: resultado.length, novas }), { headers: { "Content-Type": "application/json" } });
});
