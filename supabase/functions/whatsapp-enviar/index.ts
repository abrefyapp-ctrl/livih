// Esvazia a fila de envio: chamada pelo trigger da fila_envio e pelo cron (a cada minuto).
// Só aceita chamada do próprio banco (header x-livih-segredo, conferido no Vault).
// Um adaptador por provedor: WAHA e a API oficial da Meta (Cloud API).

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const WAHA_URL = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") ?? "";
const TOKEN_SISTEMA = Deno.env.get("META_SYSTEM_TOKEN") ?? "";
// Alerta para a equipe sai fora da janela de 24 h, o que na API oficial exige template pago. Quando o canal de
// alertas é 'meta', o alerta sai por esta sessão do WAHA (o número da F7).
const SESSAO_ALERTAS_WAHA = Deno.env.get("ALERTAS_SESSAO_WAHA") ?? "f7";

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

// Para quem enviar. O LID é o identificador que o WhatsApp realmente usa, então tem preferência.
// Sem LID, pergunta ao WAHA o id certo do número: contas brasileiras antigas existem SEM o nono
// dígito, e o telefone guardado no Livih sempre tem o 9 (o GOWS não acha "55419…" se a conta é "5541…").
async function chatIdWaha(item: ItemFila): Promise<string | null> {
  if (item.whatsapp_lid) return `${item.whatsapp_lid}@lid`;
  if (!item.telefone) return null;
  const candidatos = [item.telefone];
  const br = item.telefone.match(/^55(\d{2})9(\d{8})$/);
  if (br) candidatos.push(`55${br[1]}${br[2]}`);
  for (const numero of candidatos) {
    const r = await fetch(
      `${WAHA_URL}/api/contacts/check-exists?session=${encodeURIComponent(item.instance_id!)}&phone=${numero}`,
      { headers: { "X-Api-Key": WAHA_API_KEY }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) continue;
    const corpo = await r.json().catch(() => null);
    if (corpo?.numberExists && corpo?.chatId) return String(corpo.chatId);
  }
  return null;
}

async function enviarWaha(item: ItemFila): Promise<Resultado> {
  if (!WAHA_URL || !WAHA_API_KEY) return { ok: false, erro: "WAHA_URL/WAHA_API_KEY não configurados" };
  if (!item.instance_id) return { ok: false, erro: "canal sem sessão" };
  const chatId = await chatIdWaha(item);
  return await sendTextWaha(item.instance_id, chatId, item.texto, item.telefone);
}

async function sendTextWaha(sessao: string, chatId: string | null, mensagem: string, telefone: string | null): Promise<Resultado> {
  if (!chatId) return { ok: false, erro: `número sem WhatsApp: ${telefone}` };
  const r = await fetch(`${WAHA_URL}/api/sendText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
    body: JSON.stringify({ session: sessao, chatId, text: mensagem }),
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

// Erros da Meta que a equipe precisa entender (o resto vai como veio).
const ERROS_META: Record<number, string> = {
  131047: "Passaram mais de 24 h desde a última mensagem do cliente. Fora dessa janela a API oficial só envia modelo aprovado.",
  131026: "O número não recebe mensagens (sem WhatsApp ou versão antiga).",
  130497: "Envio bloqueado para o país deste número.",
  190: "O acesso ao WhatsApp oficial expirou. Conecte o número de novo em Configurações → WhatsApp.",
};

async function enviarMeta(item: ItemFila): Promise<Resultado> {
  if (!item.instance_id) return { ok: false, erro: "canal sem phone_number_id" };
  if (!item.telefone) return { ok: false, erro: "contato sem telefone" };
  const { data: tokenCanal } = await supabase.rpc("meta_token_do_canal", { p_canal: item.canal_id });
  const token = (tokenCanal as string | null) || TOKEN_SISTEMA;
  if (!token) return { ok: false, erro: "canal sem token da Meta" };
  const r = await fetch(`https://graph.facebook.com/v25.0/${item.instance_id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: item.telefone, type: "text", text: { body: item.texto } }),
    signal: AbortSignal.timeout(20000),
  });
  // deno-lint-ignore no-explicit-any
  const corpo: any = await r.json().catch(() => null);
  if (!r.ok) {
    const e = corpo?.error ?? {};
    const codigo = Number(e.code);
    return { ok: false, erro: ERROS_META[codigo] ?? `Meta ${r.status} (${e.code ?? "?"}): ${String(e.message ?? "").slice(0, 250)}` };
  }
  const id = corpo?.messages?.[0]?.id;
  return { ok: true, id: id ? String(id) : undefined };
}

const ADAPTADORES: Record<string, (item: ItemFila) => Promise<Resultado>> = {
  waha: enviarWaha,
  meta: enviarMeta,
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

  // Alertas para a equipe (mesmo canal da organização, destinatário fora do CRM).
  let alertas = 0;
  const { data: pendentes } = await supabase.rpc("alertas_reivindicar", { p_limite: 10 });
  for (const a of (pendentes ?? []) as { alerta_id: number; canal_tipo: string; instance_id: string; telefone: string; texto: string }[]) {
    let resultado: Resultado;
    try {
      const sessao = a.canal_tipo === "waha" ? a.instance_id : a.canal_tipo === "meta" ? SESSAO_ALERTAS_WAHA : null;
      resultado = sessao
        ? await sendTextWaha(sessao, await chatIdWaha({ instance_id: sessao, telefone: a.telefone, whatsapp_lid: null } as ItemFila), a.texto, a.telefone)
        : { ok: false, erro: `provedor sem envio: ${a.canal_tipo}` };
    } catch (e) {
      resultado = { ok: false, erro: String(e).slice(0, 300) };
    }
    await supabase.rpc("alerta_resultado", { p_alerta: a.alerta_id, p_ok: resultado.ok, p_erro: resultado.erro ?? null });
    if (resultado.ok) alertas++;
  }

  return new Response(JSON.stringify({ enviadas, falhas, alertas }), { headers: { "Content-Type": "application/json" } });
});
