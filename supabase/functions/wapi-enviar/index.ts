// Esvazia a fila de envio: chamada pelo trigger da fila_envio e pelo cron (a cada minuto).
// Só aceita chamada do próprio banco (header x-livih-segredo, conferido no Vault).

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const WAPI_BASE_URL = (Deno.env.get("WAPI_BASE_URL") ?? "https://api.w-api.app/v1").replace(/\/$/, "");

type ItemFila = {
  fila_id: number;
  mensagem_id: string;
  canal_id: string;
  canal_tipo: string;
  instance_id: string | null;
  telefone: string;
  texto: string;
  tentativas: number;
};

async function enviarWapi(item: ItemFila, token: string): Promise<{ ok: boolean; id?: string; erro?: string }> {
  const r = await fetch(
    `${WAPI_BASE_URL}/message/send-text?instanceId=${encodeURIComponent(item.instance_id ?? "")}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ phone: item.telefone, message: item.texto }),
      signal: AbortSignal.timeout(20000),
    },
  );
  const texto = await r.text();
  // deno-lint-ignore no-explicit-any
  let corpo: any = null;
  try {
    corpo = JSON.parse(texto);
  } catch { /* resposta não-JSON */ }
  if (!r.ok || corpo?.error === true) {
    return { ok: false, erro: `HTTP ${r.status}: ${texto.slice(0, 300)}` };
  }
  const id = corpo?.messageId ?? corpo?.insertedId ?? corpo?.key?.id ?? corpo?.id ?? null;
  return { ok: true, id: id ? String(id) : undefined };
}

Deno.serve(async (req) => {
  const { data: autorizado } = await supabase.rpc("verificar_segredo_interno", {
    p_segredo: req.headers.get("x-livih-segredo") ?? "",
  });
  if (autorizado !== true) return new Response("não autorizado", { status: 401 });

  const tokens = new Map<string, string | null>();
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
      if (!tokens.has(item.canal_id)) {
        const { data: token } = await supabase.rpc("canal_token", { p_canal: item.canal_id });
        tokens.set(item.canal_id, token ?? null);
      }
      const token = tokens.get(item.canal_id);
      let resultado: { ok: boolean; id?: string; erro?: string };
      if (item.canal_tipo !== "wapi") resultado = { ok: false, erro: `tipo de canal sem envio: ${item.canal_tipo}` };
      else if (!token || !item.instance_id) resultado = { ok: false, erro: "canal sem token ou instância" };
      else {
        try {
          resultado = await enviarWapi(item, token);
        } catch (e) {
          resultado = { ok: false, erro: String(e).slice(0, 300) };
        }
      }
      await supabase.rpc("fila_resultado", {
        p_fila: item.fila_id,
        p_ok: resultado.ok,
        p_wapi_id: resultado.id ?? null,
        p_erro: resultado.erro ?? null,
      });
      resultado.ok ? enviadas++ : falhas++;
    }
  }

  return new Response(JSON.stringify({ enviadas, falhas }), { headers: { "Content-Type": "application/json" } });
});
