// Simulador de conversa: Configurações → Agente → Testar agente (docs/simulador-agente.md).
//
// A tela manda a conversa de teste inteira a cada pergunta; esta função confere quem pede (dono/admin da empresa
// ou a plataforma), aplica o limite diário e repassa ao workflow do simulador no n8n (mesmo endereço e token do
// agente, outro caminho). Nada vai para o WhatsApp nem para o histórico.
//
//   { org_id, mensagens: [{ de: 'cliente'|'assistente', texto }], prompt?, casos?, base? }
//   → { saudacao, resposta, passos: [{ ferramenta, entrada, saida }] }

import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const AGENTE_URL = Deno.env.get("N8N_AGENTE_URL") ?? "";
const TOKEN = Deno.env.get("N8N_AGENTE_TOKEN") ?? "";
// .../webhook/livih-agente → .../webhook/livih-agente-simulador
const SIMULADOR_URL = AGENTE_URL.replace(/\/livih-agente\/?$/, "/livih-agente-simulador");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Mensagem = { de?: string; texto?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  let p: { org_id?: string; mensagens?: Mensagem[]; prompt?: string | null; casos?: string[] | null; base?: string | null };
  try {
    p = await req.json();
  } catch {
    return json(400, { erro: "corpo inválido" });
  }

  const tokenUsuario = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await admin.auth.getUser(tokenUsuario);
  if (!quem.user) return json(401, { erro: "Faça login de novo." });
  if (!p.org_id || !Array.isArray(p.mensagens)) return json(400, { erro: "org_id e mensagens obrigatórios" });

  // Dono/admin da empresa, ou a equipe da plataforma (modo suporte).
  const [{ data: membro }, { data: plataforma }] = await Promise.all([
    admin.from("membros_org").select("papel").eq("org_id", p.org_id).eq("user_id", quem.user.id).eq("ativo", true).maybeSingle(),
    admin.from("admins_plataforma").select("user_id").eq("user_id", quem.user.id).maybeSingle(),
  ]);
  if (!plataforma && membro?.papel !== "dono" && membro?.papel !== "admin") {
    return json(403, { erro: "Só o dono e os administradores testam o agente." });
  }

  // Só as últimas 40, como o agente de verdade; texto e autor limpos.
  const mensagens = p.mensagens
    .filter((m) => typeof m?.texto === "string" && m.texto.trim())
    .slice(-40)
    .map((m) => ({ de: m.de === "assistente" ? "assistente" : "cliente", texto: m.texto!.slice(0, 4000) }));
  if (!mensagens.length || mensagens[mensagens.length - 1].de !== "cliente") {
    return json(400, { erro: "Escreva a mensagem do cliente." });
  }
  const casos = Array.isArray(p.casos) ? p.casos.filter((c) => typeof c === "string").slice(0, 50) : null;
  const prompt = typeof p.prompt === "string" ? p.prompt.slice(0, 100_000) : null;
  // Base proposta pelo assistente (texto já montado como o agente lê).
  const base = typeof p.base === "string" ? p.base.slice(0, 200_000) : null;

  const { data: pode, error: erroLimite } = await admin.rpc("simulador_registrar", { p_org: p.org_id, p_user: quem.user.id });
  if (erroLimite) {
    console.error("simulador_registrar", erroLimite.message);
    return json(500, { erro: "Não foi possível testar agora. Tente de novo." });
  }
  if (!pode) return json(429, { erro: "Limite de 200 respostas de teste por dia atingido. Volte amanhã." });

  if (!AGENTE_URL || !TOKEN) return json(500, { erro: "Simulador indisponível (configuração do servidor)." });
  try {
    const r = await fetch(SIMULADOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-livih-token": TOKEN },
      body: JSON.stringify({ org_id: p.org_id, mensagens, prompt, casos, base }),
      signal: AbortSignal.timeout(110_000),
    });
    const corpo = await r.json().catch(() => null);
    if (!r.ok || !corpo) {
      console.error("n8n simulador", r.status, JSON.stringify(corpo).slice(0, 300));
      return json(502, { erro: "O agente não respondeu. Tente de novo em instantes." });
    }
    return json(200, { saudacao: corpo.saudacao ?? null, resposta: corpo.resposta ?? null, passos: corpo.passos ?? [] });
  } catch (e) {
    console.error("n8n simulador", String(e));
    return json(504, { erro: "O agente demorou demais para responder. Tente de novo." });
  }
});
