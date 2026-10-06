// Esvazia a fila de envio: chamada pelo trigger da fila_envio e pelo cron (a cada minuto).
// Só aceita chamada do próprio banco (header x-livih-segredo, conferido no Vault).
// Um adaptador por provedor; hoje só o WAHA.

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const WAHA_URL = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") ?? "";

type ItemFila = {
  fila_id: number;
  mensagem_id: string;
  canal_id: string;
  canal_tipo: string;
  instance_id: string | null;
  telefone: string | null;
  whatsapp_lid: string | null;
  texto: string;
  tentativas: number;
};
type Resultado = { ok: boolean; id?: string; erro?: string };

async function enviarWaha(item: ItemFila): Promise<Resultado> {
  if (!WAHA_URL || !WAHA_API_KEY) return { ok: false, erro: "WAHA_URL/WAHA_API_KEY não configurados" };
  if (!item.instance_id) return { ok: false, erro: "canal sem sessão" };
  const chatId = item.telefone ? `${item.telefone}@c.us` : `${item.whatsapp_lid}@lid`;
  const r = await fetch(`${WAHA_URL}/api/sendText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
    body: JSON.stringify({ session: item.instance_id, chatId, text: item.texto }),
    signal: AbortSignal.timeout(20000),
  });
  const texto = await r.text();
  if (!r.ok) return { ok: false, erro: `HTTP ${r.status}: ${texto.slice(0, 300)}` };
  // deno-lint-ignore no-explicit-any
  let corpo: any = null;
  try {
    corpo = JSON.parse(texto);
  } catch { /* resposta não-JSON */ }
  const id = corpo?.id?._serialized ?? corpo?.id ?? corpo?.key?.id ?? null;
  return { ok: true, id: id ? String(id) : undefined };
}

const ADAPTADORES: Record<string, (item: ItemFila) => Promise<Resultado>> = {
  waha: enviarWaha,
};

Deno.serve(async (req) => {
  const { data: autorizado } = await supabase.rpc("verificar_segredo_interno", {
    p_segredo: req.headers.get("x-livih-segredo") ?? "",
  });
  if (autorizado !== true) return new Response("não autorizado", { status: 401 });

  let enviadas = 0, falhas = 0;

  // Lotes até a fila esvaziar (ou 5 lotes, para não estourar o tempo da função).
  for (let lote = 0; lote < 5; lote++) {
    const { data: itens, error } = await supabase.rpc("fila_reivindicar", { p_limite: 20 });
    if (error) {
      console.error("fila_reivindicar", error.message);
      break;
    }
    if (!itens?.length) break;

    for (const item of itens as ItemFila[]) {
      const adaptador = ADAPTADORES[item.canal_tipo];
      let resultado: Resultado;
      try {
        resultado = adaptador ? await adaptador(item) : { ok: false, erro: `provedor sem envio: ${item.canal_tipo}` };
      } catch (e) {
        resultado = { ok: false, erro: String(e).slice(0, 300) };
      }
      await supabase.rpc("fila_resultado", {
        p_fila: item.fila_id,
        p_ok: resultado.ok,
        p_wa_id: resultado.id ?? null,
        p_erro: resultado.erro ?? null,
      });
      resultado.ok ? enviadas++ : falhas++;
    }
  }

  return new Response(JSON.stringify({ enviadas, falhas }), { headers: { "Content-Type": "application/json" } });
});
