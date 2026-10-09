// Recebe o formulário "Solicite acesso" do site (livih.com.br) e grava em pedidos_acesso. É a única porta de
// gravação: anon e authenticated não têm INSERT na tabela. A equipe da F7 vê o pedido na tela Empresas.
//
// Sem login (verify_jwt = false). Proteções:
//   - Cloudflare Turnstile (secret TURNSTILE_SECRET): sem token válido, recusa.
//   - Campo isca (`site`) invisível para pessoas: preenchido = robô, finge sucesso e não grava.
//   - Limite: no máximo 3 pedidos por e-mail em 24 h.
//   - Tamanho máximo em todos os campos; só aceita chamada vinda do próprio site (CORS).
// Aviso opcional por WhatsApp para a equipe (secret PEDIDOS_AVISO_TELEFONE, enviado pela sessão `f7` do WAHA).
//
// POST { empresa, nome, email, telefone?, mensagem?, turnstile, site? } → { ok: true }

import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") ?? "";
const WAHA_URL = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") ?? "";
const AVISO_TELEFONE = (Deno.env.get("PEDIDOS_AVISO_TELEFONE") ?? "").replace(/\D/g, "");
const SESSAO_AVISO = "f7";

const ORIGENS = new Set(["https://livih.com.br", "https://www.livih.com.br", "http://localhost:8765"]);

function cors(req: Request) {
  const origem = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.has(origem) ? origem : "https://livih.com.br",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const textoLongo = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function turnstileValido(token: string, ip: string | null) {
  if (!TURNSTILE_SECRET || !token) return false;
  const corpo = new FormData();
  corpo.append("secret", TURNSTILE_SECRET);
  corpo.append("response", token);
  if (ip) corpo.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: corpo, signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    return j?.success === true;
  } catch {
    return false;
  }
}

// Aviso à equipe: falha não impede o pedido (ele já está gravado e aparece na tela Empresas).
async function avisarEquipe(p: { empresa: string; nome: string; email: string; telefone: string }) {
  if (!AVISO_TELEFONE || !WAHA_URL || !WAHA_API_KEY) return;
  const h = { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY };
  try {
    const existe = await fetch(`${WAHA_URL}/api/contacts/check-exists?session=${SESSAO_AVISO}&phone=${AVISO_TELEFONE}`, {
      headers: h, signal: AbortSignal.timeout(8000),
    }).then((r) => r.json());
    if (!existe?.numberExists) return;
    const msg = `🆕 *Pedido de acesso ao Livih pelo site*\nEmpresa: ${p.empresa}\nContato: ${p.nome}\nE-mail: ${p.email}` +
      (p.telefone ? `\nTelefone: ${p.telefone}` : "") + `\n\nVeja em app.livih.com.br/empresas`;
    await fetch(`${WAHA_URL}/api/sendText`, {
      method: "POST", headers: h, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ session: SESSAO_AVISO, chatId: existe.chatId, text: msg }),
    });
  } catch (e) {
    console.error("aviso do pedido", String(e));
  }
}

Deno.serve(async (req) => {
  const c = cors(req);
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...c, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: c });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  let p: Record<string, unknown>;
  try {
    p = await req.json();
  } catch {
    return json(400, { erro: "Não foi possível ler o formulário." });
  }

  // Robô preencheu o campo invisível: responde como se tivesse dado certo e não grava nada.
  if (texto(p.site, 200)) return json(200, { ok: true });

  const empresa = texto(p.empresa, 120);
  const nome = texto(p.nome, 120);
  const email = texto(p.email, 160).toLowerCase();
  const telefone = texto(p.telefone, 30);
  const mensagem = textoLongo(p.mensagem, 1500);

  if (empresa.length < 2) return json(400, { erro: "Informe o nome da empresa." });
  if (nome.length < 2) return json(400, { erro: "Informe o seu nome." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(400, { erro: "Informe um e-mail válido." });
  if (telefone && telefone.replace(/\D/g, "").length < 10) return json(400, { erro: "Confira o telefone, com DDD." });

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!(await turnstileValido(texto(p.turnstile, 2048), ip))) {
    return json(400, { erro: "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo." });
  }

  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from("pedidos_acesso").select("id", { count: "exact", head: true })
    .eq("email", email).gte("criado_em", desde);
  if ((count ?? 0) >= 3) {
    return json(429, { erro: "Já recebemos seus pedidos. Nossa equipe vai entrar em contato em breve." });
  }

  const { error } = await admin.from("pedidos_acesso").insert({
    empresa, nome, email, telefone: telefone || null, mensagem: mensagem || null,
  });
  if (error) {
    console.error("pedido-acesso insert", error.message);
    return json(500, { erro: "Não foi possível enviar agora. Tente de novo em alguns minutos." });
  }

  await avisarEquipe({ empresa, nome, email, telefone });
  return json(200, { ok: true });
});
