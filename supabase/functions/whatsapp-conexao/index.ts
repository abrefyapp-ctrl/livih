// Números de WhatsApp de uma organização no WAHA (Configurações → WhatsApp).
//
// Uma organização tem o número da empresa (sem responsável, toda a equipe vê) e, se quiser, números de
// vendedores (com responsável: só ele, dono e admin veem). Só dono/admin criam, conectam e removem.
//
// Dois chamadores:
//   - o banco (pg_cron a cada 2 min, header x-livih-segredo): { acao: 'verificar' } — lê todas as sessões
//     do WAHA de uma vez e grava o estado de cada canal por canal_atualizar_status (queda e aviso).
//   - a tela, com o login do usuário:
//       { org_id, acao: 'listar' }                                  → { canais } que a pessoa pode ver
//       { org_id, acao: 'criar', nome, responsavel_id? }           → { canal } (dono/admin)
//       { org_id, canal_id, acao: 'iniciar' | 'desconectar' | 'remover' } (dono/admin)
//       { org_id, canal_id, acao: 'qr' }  /  { ..., acao: 'codigo', telefone } (dono/admin)
// A chave do WAHA nunca sai daqui.

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
  nome: string;
  instance_id: string | null;
  responsavel_id: string | null;
  status_conexao: string | null;
  numero_conectado: string | null;
  conectado_em: string | null;
  caiu_em: string | null;
  alerta_queda_em: string | null;
  desconectado_em: string | null;
  criado_em: string;
};
const CAMPOS =
  "id, org_id, nome, instance_id, responsavel_id, status_conexao, numero_conectado, conectado_em, caiu_em, alerta_queda_em, desconectado_em, criado_em";

function waha(caminho: string, init: RequestInit = {}, timeoutMs = 15_000) {
  return fetch(`${WAHA_URL}${caminho}`, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Api-Key": WAHA_API_KEY, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

const numeroDe = (me: { id?: string } | null | undefined) => (me?.id ? String(me.id).split("@")[0].split(":")[0] : null);

/** Todas as sessões do WAHA de uma vez; null se o WAHA não respondeu. */
async function sessoesWaha(): Promise<Map<string, { status: string; numero: string | null }> | null> {
  try {
    const r = await waha("/api/sessions?all=true");
    if (!r.ok) return null;
    const lista = (await r.json()) as { name: string; status: string; me?: { id?: string } }[];
    return new Map(lista.map((s) => [s.name, { status: s.status, numero: numeroDe(s.me) }]));
  } catch {
    return null;
  }
}

async function registrarCanais(canais: { id: string; instance_id: string | null }[]) {
  const sessoes = await sessoesWaha();
  for (const c of canais) {
    if (!c.instance_id) continue;
    const s = sessoes ? (sessoes.get(c.instance_id) ?? { status: "INEXISTENTE", numero: null }) : { status: "INACESSIVEL", numero: null };
    const { error } = await admin.rpc("canal_atualizar_status", { p_canal: c.id, p_status: s.status, p_numero: s.numero });
    if (error) console.error("canal_atualizar_status", error.message);
  }
}

async function estadoSessao(sessao: string): Promise<string> {
  try {
    const r = await waha(`/api/sessions/${encodeURIComponent(sessao)}`);
    if (r.status === 404) return "INEXISTENTE";
    if (!r.ok) return "INACESSIVEL";
    return String((await r.json())?.status ?? "INACESSIVEL");
  } catch {
    return "INACESSIVEL";
  }
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

async function iniciar(canal: Canal) {
  const status = await estadoSessao(canal.instance_id!);
  if (status === "INACESSIVEL") throw new ErroUsuario("O servidor do WhatsApp não respondeu. Tente de novo em instantes.");
  if (status === "INEXISTENTE") await criarSessao(canal);
  else if (status === "STOPPED") await waha(`/api/sessions/${canal.instance_id}/start`, { method: "POST" });
  else if (status === "FAILED") await waha(`/api/sessions/${canal.instance_id}/restart`, { method: "POST" });
}

// Número novo: o agente é o da empresa (mesmas instruções, casos e alerta), desligado neste número.
async function criarCanal(orgId: string, nome: string, responsavelId: string | null): Promise<Canal> {
  const id = crypto.randomUUID();
  const { data, error } = await admin.from("canais")
    .insert({ id, org_id: orgId, tipo: "waha", nome, instance_id: `c-${id.replace(/-/g, "").slice(0, 16)}`, responsavel_id: responsavelId })
    .select(CAMPOS).single();
  if (error) throw new Error(`canal: ${error.message}`);
  const { data: modelo } = await admin.from("agentes").select("prompt, regras_humano, telefone_alerta, modelo")
    .eq("org_id", orgId).limit(1).maybeSingle();
  await admin.from("agentes").insert({ org_id: orgId, canal_id: id, ativo: false, ...(modelo ?? {}) });
  return data as Canal;
}

async function listar(orgId: string, userId: string, gerencia: boolean) {
  let consulta = admin.from("canais").select(CAMPOS).eq("org_id", orgId).eq("ativo", true).order("criado_em");
  if (!gerencia) consulta = consulta.or(`responsavel_id.is.null,responsavel_id.eq.${userId}`);
  const { data } = await consulta;
  const canais = (data ?? []) as Canal[];
  await registrarCanais(canais);
  const ids = canais.map((c) => c.id);
  if (!ids.length) return [];
  const [{ data: atualizados }, { data: agentes }] = await Promise.all([
    admin.from("canais").select(CAMPOS).in("id", ids).order("criado_em"),
    admin.from("agentes").select("canal_id, ativo").in("canal_id", ids),
  ]);
  const ligado = new Map((agentes ?? []).map((a) => [a.canal_id, a.ativo]));
  return ((atualizados ?? []) as Canal[]).map((c) => ({ ...c, agente_ativo: ligado.get(c.id) ?? false }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  let p: { acao?: string; org_id?: string; canal_id?: string; telefone?: string; nome?: string; responsavel_id?: string | null };
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
      if (p.acao === "verificar") {
        const { data: canais } = await admin.from("canais").select("id, instance_id").eq("tipo", "waha").eq("ativo", true);
        await registrarCanais(canais ?? []);
      }
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

    if (p.acao === "listar") return json(200, { canais: await listar(p.org_id, quem.user.id, gerencia) });
    if (!gerencia) return json(403, { erro: "Só dono e admin mexem nos números de WhatsApp." });

    if (p.acao === "criar") {
      const nome = (p.nome ?? "").trim() || "WhatsApp";
      const responsavel = p.responsavel_id || null;
      if (responsavel) {
        const { data: ok } = await admin.from("membros_org").select("user_id")
          .eq("org_id", p.org_id).eq("user_id", responsavel).eq("ativo", true).maybeSingle();
        if (!ok) throw new ErroUsuario("O responsável precisa estar ativo na equipe.");
      }
      const canal = await criarCanal(p.org_id, nome, responsavel);
      await iniciar(canal);
      return json(200, { canal });
    }

    // Demais ações: um canal desta organização.
    const { data: achado } = await admin.from("canais").select(CAMPOS)
      .eq("id", p.canal_id ?? "").eq("org_id", p.org_id).eq("ativo", true).maybeSingle();
    const canal = achado as Canal | null;
    if (!canal?.instance_id) return json(404, { erro: "Número não encontrado." });

    if (p.acao === "iniciar") {
      await iniciar(canal);
      return json(200, { ok: true });
    }
    if (p.acao === "qr") {
      const r = await waha(`/api/${canal.instance_id}/auth/qr?format=image`);
      if (!r.ok) return json(200, { imagem: null });
      const c = await r.json();
      return json(200, { imagem: c?.data ? `data:${c.mimetype ?? "image/png"};base64,${c.data}` : null });
    }
    if (p.acao === "codigo") {
      const d = (p.telefone ?? "").replace(/\D/g, "");
      const tel = d.length === 10 || d.length === 11 ? `55${d}` : d;
      if (tel.length < 12) throw new ErroUsuario("Informe DDD + número do celular.");
      const r = await waha(`/api/${canal.instance_id}/auth/request-code`, { method: "POST", body: JSON.stringify({ phoneNumber: tel }) });
      const c = await r.json().catch(() => null);
      if (!r.ok || !c?.code) throw new ErroUsuario("O WhatsApp não gerou o código. Tente o QR code.");
      return json(200, { codigo: String(c.code) });
    }
    if (p.acao === "desconectar" || p.acao === "remover") {
      // Marca antes: a saída de WORKING não pode ser lida como queda.
      await admin.from("canais").update({ desconectado_em: new Date().toISOString(), desconectado_por: quem.user.id, caiu_em: null })
        .eq("id", canal.id);
      const r = await waha(`/api/sessions/${canal.instance_id}/logout`, { method: "POST" });
      if (!r.ok && r.status !== 404) throw new Error(`WAHA logout: ${r.status}`);
      if (p.acao === "remover") {
        // O histórico fica: o canal só deixa de existir para novas mensagens.
        await waha(`/api/sessions/${canal.instance_id}`, { method: "DELETE" });
        await admin.from("canais").update({ ativo: false }).eq("id", canal.id);
        await admin.from("agentes").update({ ativo: false }).eq("canal_id", canal.id);
      }
      return json(200, { ok: true });
    }
    return json(400, { erro: "ação desconhecida" });
  } catch (e) {
    if (e instanceof ErroUsuario) return json(400, { erro: e.message });
    console.error("whatsapp-conexao", e);
    return json(500, { erro: "Algo deu errado. Tente de novo." });
  }
});
