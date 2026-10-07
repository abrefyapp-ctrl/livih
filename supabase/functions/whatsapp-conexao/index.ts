// Conexão do WhatsApp de uma organização com o WAHA (Configurações → WhatsApp).
//
// Dois chamadores:
//   - o banco (pg_cron a cada 2 min, header x-livih-segredo): { acao: 'verificar' } — lê todas as sessões
//     do WAHA de uma vez e grava o estado de cada canal por canal_atualizar_status (que decide queda/aviso).
//   - a tela, com o login do usuário: { org_id, acao } — 'status' para qualquer membro; 'iniciar', 'qr',
//     'codigo' e 'desconectar' só para dono/admin. A chave do WAHA nunca sai daqui.
//
// 'iniciar' numa organização sem canal cria tudo: canal, agente (desligado), segredo do webhook e a
// sessão no WAHA já apontando para o waha-webhook. É o que permite um cliente novo se configurar sozinho.

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const WAHA_URL = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") ?? "";

const admin = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

class ErroUsuario extends Error {}

type Canal = {
  id: string;
  org_id: string;
  instance_id: string | null;
  status_conexao: string | null;
  numero_conectado: string | null;
  conectado_em: string | null;
  caiu_em: string | null;
  alerta_queda_em: string | null;
  desconectado_em: string | null;
};
const CAMPOS = "id, org_id, instance_id, status_conexao, numero_conectado, conectado_em, caiu_em, alerta_queda_em, desconectado_em";

function waha(caminho: string, init: RequestInit = {}, timeoutMs = 15_000) {
  return fetch(`${WAHA_URL}${caminho}`, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Api-Key": WAHA_API_KEY, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

const numeroDe = (me: { id?: string } | null | undefined) => (me?.id ? String(me.id).split("@")[0].split(":")[0] : null);

async function estadoSessao(sessao: string): Promise<{ status: string; numero: string | null }> {
  try {
    const r = await waha(`/api/sessions/${encodeURIComponent(sessao)}`);
    if (r.status === 404) return { status: "INEXISTENTE", numero: null };
    if (!r.ok) return { status: "INACESSIVEL", numero: null };
    const s = await r.json();
    return { status: String(s?.status ?? "INACESSIVEL"), numero: numeroDe(s?.me) };
  } catch {
    return { status: "INACESSIVEL", numero: null };
  }
}

async function registrar(canalId: string, status: string, numero: string | null) {
  const { error } = await admin.rpc("canal_atualizar_status", { p_canal: canalId, p_status: status, p_numero: numero });
  if (error) console.error("canal_atualizar_status", error.message);
}

// Cron: uma chamada ao WAHA para todas as sessões.
async function verificarTodos() {
  const { data: canais } = await admin.from("canais").select("id, instance_id").eq("tipo", "waha").eq("ativo", true);
  if (!canais?.length) return;
  let sessoes: Map<string, { status: string; numero: string | null }> | null = null;
  try {
    const r = await waha("/api/sessions?all=true");
    if (r.ok) {
      const lista = (await r.json()) as { name: string; status: string; me?: { id?: string } }[];
      sessoes = new Map(lista.map((s) => [s.name, { status: s.status, numero: numeroDe(s.me) }]));
    }
  } catch { /* WAHA fora: todos ficam INACESSIVEL */ }
  for (const c of canais) {
    if (!c.instance_id) continue;
    const s = sessoes ? (sessoes.get(c.instance_id) ?? { status: "INEXISTENTE", numero: null }) : { status: "INACESSIVEL", numero: null };
    await registrar(c.id, s.status, s.numero);
  }
}

async function canalDaOrg(orgId: string): Promise<Canal | null> {
  const { data } = await admin.from("canais").select(CAMPOS).eq("org_id", orgId).eq("tipo", "waha").eq("ativo", true)
    .order("criado_em").limit(1).maybeSingle();
  return data as Canal | null;
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

// Cria (ou recria) a sessão no WAHA com o webhook do canal. O segredo da URL só existe aqui e no WAHA;
// o banco guarda o hash. Recriar gera segredo novo — o antigo não é recuperável.
async function criarSessao(canal: Canal) {
  const segredo = hex(crypto.getRandomValues(new Uint8Array(24)));
  const hash = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(segredo))));
  await admin.from("canais").update({ webhook_segredo_hash: hash }).eq("id", canal.id);
  const r = await waha("/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      name: canal.instance_id,
      start: true,
      config: {
        ignore: { status: true, groups: true, channels: true },
        webhooks: [{
          url: `${URL_SUPABASE}/functions/v1/waha-webhook?canal=${canal.id}&s=${segredo}`,
          events: ["message.any", "message.ack", "session.status"],
          retries: { policy: "exponential", delaySeconds: 2, attempts: 8 },
        }],
      },
    }),
  });
  if (!r.ok) throw new Error(`WAHA recusou criar a sessão: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

async function iniciar(orgId: string): Promise<Canal> {
  let canal = await canalDaOrg(orgId);
  if (!canal) {
    // Nome da sessão no WAHA: estável e sem dado pessoal.
    const sessao = `org-${orgId.replace(/-/g, "").slice(0, 12)}`;
    const { data, error } = await admin.from("canais")
      .insert({ org_id: orgId, tipo: "waha", nome: "WhatsApp", instance_id: sessao })
      .select(CAMPOS).single();
    if (error) throw new Error(`canal: ${error.message}`);
    canal = data as Canal;
    await admin.from("agentes").insert({ org_id: orgId, canal_id: canal.id, ativo: false });
  }
  const atual = await estadoSessao(canal.instance_id!);
  if (atual.status === "INACESSIVEL") throw new ErroUsuario("O servidor do WhatsApp não respondeu. Tente de novo em instantes.");
  if (atual.status === "INEXISTENTE") await criarSessao(canal);
  else if (atual.status === "STOPPED") await waha(`/api/sessions/${canal.instance_id}/start`, { method: "POST" });
  else if (atual.status === "FAILED") await waha(`/api/sessions/${canal.instance_id}/restart`, { method: "POST" });
  return canal;
}

async function atualizar(canal: Canal): Promise<Canal> {
  const s = await estadoSessao(canal.instance_id!);
  await registrar(canal.id, s.status, s.numero);
  const { data } = await admin.from("canais").select(CAMPOS).eq("id", canal.id).single();
  return data as Canal;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  let p: { acao?: string; org_id?: string; telefone?: string };
  try {
    p = await req.json();
  } catch {
    return json(400, { erro: "corpo inválido" });
  }

  try {
    // Banco (pg_cron)
    const segredo = req.headers.get("x-livih-segredo");
    if (segredo) {
      const { data: ok } = await admin.rpc("verificar_segredo_interno", { p_segredo: segredo });
      if (ok !== true) return json(401, { erro: "não autorizado" });
      if (p.acao === "verificar") await verificarTodos();
      return json(200, { ok: true });
    }

    // Tela
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: quem } = await admin.auth.getUser(token);
    if (!quem.user) return json(401, { erro: "faça login de novo" });
    if (!p.org_id) return json(400, { erro: "org_id obrigatório" });
    const { data: membro } = await admin.from("membros_org").select("papel")
      .eq("org_id", p.org_id).eq("user_id", quem.user.id).eq("ativo", true).maybeSingle();
    if (!membro) return json(403, { erro: "sem acesso a esta organização" });
    const gerencia = membro.papel === "dono" || membro.papel === "admin";

    if (p.acao === "status") {
      const canal = await canalDaOrg(p.org_id);
      return json(200, { canal: canal ? await atualizar(canal) : null });
    }
    if (!gerencia) return json(403, { erro: "Só dono e admin conectam o WhatsApp." });

    if (p.acao === "iniciar") {
      const canal = await iniciar(p.org_id);
      return json(200, { canal: await atualizar(canal) });
    }

    const canal = await canalDaOrg(p.org_id);
    if (!canal?.instance_id) return json(404, { erro: "Esta organização ainda não tem WhatsApp." });

    if (p.acao === "qr") {
      const r = await waha(`/api/${canal.instance_id}/auth/qr?format=image`);
      if (!r.ok) return json(200, { imagem: null });
      const c = await r.json();
      return json(200, { imagem: c?.data ? `data:${c.mimetype ?? "image/png"};base64,${c.data}` : null });
    }
    if (p.acao === "codigo") {
      const d = (p.telefone ?? "").replace(/\D/g, "");
      const tel = d.length === 10 || d.length === 11 ? `55${d}` : d;
      if (tel.length < 12) throw new ErroUsuario("Informe DDD + número do celular da empresa.");
      const r = await waha(`/api/${canal.instance_id}/auth/request-code`, { method: "POST", body: JSON.stringify({ phoneNumber: tel }) });
      const c = await r.json().catch(() => null);
      if (!r.ok || !c?.code) throw new ErroUsuario("O WhatsApp não gerou o código. Tente o QR code.");
      return json(200, { codigo: String(c.code) });
    }
    if (p.acao === "desconectar") {
      // Marca antes: a saída de WORKING não pode ser lida como queda.
      await admin.from("canais").update({ desconectado_em: new Date().toISOString(), desconectado_por: quem.user.id, caiu_em: null })
        .eq("id", canal.id);
      const r = await waha(`/api/sessions/${canal.instance_id}/logout`, { method: "POST" });
      if (!r.ok && r.status !== 404) throw new Error(`WAHA logout: ${r.status}`);
      return json(200, { canal: await atualizar(canal) });
    }
    return json(400, { erro: "ação desconhecida" });
  } catch (e) {
    if (e instanceof ErroUsuario) return json(400, { erro: e.message });
    console.error("whatsapp-conexao", e);
    return json(500, { erro: "Algo deu errado. Tente de novo." });
  }
});
