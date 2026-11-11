// Inscrição estadual pelo CNPJ (pedido da JoGrampo em 11/11): a Receita (BrasilAPI) não informa a IE, que fica no
// cadastro de cada estado (Sintegra), e o Eduardo tinha de consultar no Sintegra para cada cliente novo. A consulta é
// da NFe.io (chave NFEIO_API_KEY nos secrets), paga por consulta: só sai quando a pessoa clica em "Buscar dados" num
// cliente PJ sem IE.
//
//   { org_id, cnpj, uf } → { inscricao_estadual, situacao, inscricoes[] } | { erro }
//
// Quem pode: membro ativo da empresa (quem cadastra cliente). A chave da NFe.io nunca sai daqui.

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

// A NFe.io pede o código IBGE do estado, não a sigla.
const IBGE: Record<string, number> = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27,
  SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53,
};

type Inscricao = { numero: string; situacao: string | null };

/** Situação que não serve para a nota (baixada, suspensa, cancelada, não habilitada). */
const inativa = (s: string | null) => !!s && /unabl|inativ|baix|suspen|cancel|n[aã]o habil|nul/i.test(s);

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
  if (!IBGE[uf]) return json(400, { erro: "Informe a UF do cliente para buscar a inscrição estadual." });

  const chave = Deno.env.get("NFEIO_API_KEY");
  if (!chave) return json(503, { erro: "A busca da inscrição estadual ainda não está ligada. Preencha à mão." });

  let r: Response;
  try {
    r = await fetch(`https://legalentity.api.nfe.io/v3/legalentities/stateTaxInfo/${IBGE[uf]}/${cnpj}`, {
      headers: { Authorization: chave, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    console.error("nfeio", String(e).slice(0, 200));
    return json(502, { erro: "A consulta da inscrição estadual não respondeu. Preencha à mão ou tente de novo." });
  }
  if (r.status === 404) return json(200, { inscricao_estadual: null, situacao: null, inscricoes: [] });
  const d = await r.json().catch(() => null);
  if (!r.ok) {
    console.error("nfeio", r.status, JSON.stringify(d).slice(0, 300));
    return json(502, { erro: "A consulta da inscrição estadual falhou. Preencha à mão ou tente de novo." });
  }

  // Resposta: { legalEntity: { stateTaxes: [{ taxNumber, status, ... }] } } (formato da v2; a v3 é igual no que usamos).
  const lista = (d?.legalEntity?.stateTaxes ?? d?.stateTaxes ?? []) as { taxNumber?: string; status?: string }[];
  const inscricoes: Inscricao[] = lista
    .filter((x) => x?.taxNumber)
    .map((x) => ({ numero: String(x.taxNumber).replace(/\D/g, ""), situacao: x.status ?? null }))
    .filter((x) => x.numero);
  const ativa = inscricoes.find((x) => !inativa(x.situacao)) ?? null;
  return json(200, { inscricao_estadual: ativa?.numero ?? null, situacao: ativa?.situacao ?? null, inscricoes });
});
