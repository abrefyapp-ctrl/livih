// Inscrição estadual pelo CNPJ (pedido da JoGrampo em 11/11): a Receita (BrasilAPI) não informa a IE, que fica no
// cadastro de cada estado (Sintegra), e o Eduardo tinha de consultar no Sintegra para cada cliente novo. A consulta é
// a "SINTEGRA / Unificada" da Infosimples (token INFOSIMPLES_TOKEN nos secrets; conta criada em 11/11), paga por
// consulta: só sai quando a pessoa clica em "Buscar dados" num cliente PJ sem IE.
//
//   { org_id, cnpj, uf } → { inscricao_estadual, situacao, inscricoes[] } | { erro }
//
// Quem pode: membro ativo da empresa (quem cadastra cliente). O token da Infosimples nunca sai daqui.

import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ",
  "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

type Inscricao = { numero: string; situacao: string | null };

/** Situação que não serve para a nota (baixada, suspensa, cancelada, não habilitada). */
const inativa = (s: string | null) => !!s && /inativ|baix|suspen|cancel|n[aã]o habil|nul|inapt/i.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  let p: { org_id?: string; cnpj?: string; uf?: string };
  try {
    p = await req.json();
  } catch {
    return json(400, { erro: "corpo inválido" });
  }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await admin.auth.getUser(token);
  if (!quem.user) return json(401, { erro: "Faça login de novo." });

  const orgId = String(p.org_id ?? "");
  const { data: membro } = await admin.from("membros_org").select("papel").eq("org_id", orgId).eq("user_id", quem.user.id)
    .eq("ativo", true).maybeSingle();
  if (!membro) return json(403, { erro: "Você não é da equipe desta empresa." });

  const cnpj = String(p.cnpj ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const uf = String(p.uf ?? "").trim().toUpperCase();
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return json(400, { erro: "Informe o CNPJ completo." });
  if (!UFS.includes(uf)) return json(400, { erro: "Informe a UF do cliente para buscar a inscrição estadual." });

  const tokenInfosimples = Deno.env.get("INFOSIMPLES_TOKEN");
  if (!tokenInfosimples) return json(503, { erro: "A busca da inscrição estadual ainda não está ligada. Preencha à mão." });

  // API v2 da Infosimples: POST com os parâmetros em formulário; a consulta ao Sintegra do estado leva alguns segundos.
  let r: Response;
  try {
    r = await fetch("https://api.infosimples.com/api/v2/consultas/sintegra/unificada", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: tokenInfosimples, cnpj, uf, timeout: "50" }),
      signal: AbortSignal.timeout(55000),
    });
  } catch (e) {
    console.error("infosimples", String(e).slice(0, 200));
    return json(502, { erro: "A consulta da inscrição estadual não respondeu. Preencha à mão ou tente de novo." });
  }
  const d = await r.json().catch(() => null);
  // code 200: achou; 612: o estado não tem cadastro para o CNPJ. O resto é falha (token, saldo, Sintegra fora do ar).
  if (d?.code === 612) return json(200, { inscricao_estadual: null, situacao: null, inscricoes: [] });
  if (!r.ok || d?.code !== 200) {
    console.error("infosimples", r.status, d?.code, String(d?.code_message ?? "").slice(0, 200), JSON.stringify(d?.errors ?? "").slice(0, 200));
    return json(502, { erro: "A consulta da inscrição estadual falhou. Preencha à mão ou tente de novo." });
  }

  const lista = (Array.isArray(d.data) ? d.data : []) as { inscricao_estadual?: string; situacao_cadastral?: string }[];
  const inscricoes: Inscricao[] = lista
    .filter((x) => x?.inscricao_estadual)
    .map((x) => ({ numero: String(x.inscricao_estadual).replace(/\D/g, ""), situacao: x.situacao_cadastral ?? null }))
    .filter((x) => x.numero);
  const ativa = inscricoes.find((x) => !inativa(x.situacao)) ?? null;
  return json(200, { inscricao_estadual: ativa?.numero ?? null, situacao: ativa?.situacao ?? null, inscricoes });
});
