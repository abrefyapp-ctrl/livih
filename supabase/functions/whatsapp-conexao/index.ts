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
//       { org_id, acao: 'oficial', code, waba_id, phone_number_id?, evento, canal_id? | nome, responsavel_id? }
//         → API oficial pelo Embedded Signup: com canal_id, o número do WAHA vira 'meta' no mesmo canal
//           (o histórico fica); sem, nasce um canal novo. (dono/admin)
// A chave do WAHA e os tokens da Meta nunca saem daqui.

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const WAHA_URL = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
const WAHA_API_KEY = Deno.env.get("WAHA_API_KEY") ?? "";
const META_APP_ID = Deno.env.get("META_APP_ID") ?? "2190905941640235";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const META_SYSTEM_TOKEN = Deno.env.get("META_SYSTEM_TOKEN") ?? "";
const GRAPH = "https://graph.facebook.com/v25.0";

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
  tipo: string;
  meta_coexistencia: boolean;
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
  "id, org_id, tipo, meta_coexistencia, nome, instance_id, responsavel_id, status_conexao, numero_conectado, conectado_em, caiu_em, alerta_queda_em, desconectado_em, criado_em";

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

async function registrarCanais(canais: { id: string; tipo: string; instance_id: string | null }[]) {
  // Número da API oficial não tem sessão no WAHA: consultar o marcaria como caído.
  canais = canais.filter((c) => c.tipo === "waha");
  if (!canais.length) return;
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
async function criarCanal(
  orgId: string, nome: string, responsavelId: string | null, extra: Record<string, unknown> = {},
): Promise<Canal> {
  const id = crypto.randomUUID();
  const { data, error } = await admin.from("canais")
    .insert({ id, org_id: orgId, tipo: "waha", nome, instance_id: `c-${id.replace(/-/g, "").slice(0, 16)}`, responsavel_id: responsavelId, ...extra })
    .select(CAMPOS).single();
  if (error) throw new Error(`canal: ${error.message}`);
  const { data: modelo } = await admin.from("agentes").select("prompt, regras_humano, telefone_alerta, modelo")
    .eq("org_id", orgId).limit(1).maybeSingle();
  await admin.from("agentes").insert({ org_id: orgId, canal_id: id, ativo: false, ...(modelo ?? {}) });
  return data as Canal;
}

// ---------------------------------------------------------------------------------------------------------
// API oficial (Embedded Signup)

// deno-lint-ignore no-explicit-any
async function graph(caminho: string, token: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${GRAPH}${caminho}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Meta ${caminho.split("?")[0]}: ${r.status} ${JSON.stringify(corpo?.error ?? corpo).slice(0, 300)}`);
  return corpo;
}

type Oficial = {
  code?: string;
  waba_id?: string;
  phone_number_id?: string;
  evento?: string;
};

async function conectarOficial(orgId: string, p: Oficial & { canal_id?: string; nome?: string; responsavel_id?: string | null }): Promise<Canal> {
  if (!META_APP_SECRET) throw new Error("META_APP_SECRET não configurado");
  if (!p.code || !p.waba_id) throw new ErroUsuario("A Meta não devolveu os dados da conta. Tente conectar de novo.");

  // 1. O código vale 30 s: troca primeiro, valida o resto depois.
  const q = new URLSearchParams({ client_id: META_APP_ID, client_secret: META_APP_SECRET, code: p.code });
  const r = await fetch(`${GRAPH}/oauth/access_token?${q}`, { signal: AbortSignal.timeout(15_000) });
  const troca = await r.json().catch(() => null);
  if (!r.ok || !troca?.access_token) {
    console.error("troca do código", r.status, JSON.stringify(troca).slice(0, 300));
    throw new ErroUsuario("A Meta recusou a conexão (o código expirou?). Tente conectar de novo.");
  }
  const token = String(troca.access_token);
  const expira = troca.expires_in ? new Date(Date.now() + Number(troca.expires_in) * 1000).toISOString() : null;
  const coexistencia = p.evento === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";

  // 2. O número: na coexistência a Meta às vezes manda só a WABA.
  const numeros = await graph(`/${p.waba_id}/phone_numbers?fields=id,display_phone_number,verified_name`, token);
  const lista = (numeros?.data ?? []) as { id: string; display_phone_number?: string; verified_name?: string }[];
  const numero = lista.find((n) => n.id === p.phone_number_id) ?? (lista.length === 1 ? lista[0] : null);
  if (!numero) throw new ErroUsuario("Não achamos o número nessa conta do WhatsApp. Tente conectar de novo.");
  const telefone = (numero.display_phone_number ?? "").replace(/\D/g, "") || null;

  // 3. O mesmo número não pode estar ativo em dois canais.
  let outros = admin.from("canais").select("id, ativo").eq("tipo", "meta").eq("instance_id", numero.id);
  if (p.canal_id) outros = outros.neq("id", p.canal_id);
  const { data: outro } = await outros.maybeSingle();
  if (outro?.ativo) throw new ErroUsuario("Este número já está conectado na Livih em outro lugar.");
  if (outro) await admin.from("canais").update({ instance_id: null }).eq("id", outro.id);

  // 4. Canal: o do WAHA vira 'meta' (mesmo id, o histórico fica) ou nasce um novo.
  const campos = {
    tipo: "meta",
    instance_id: numero.id,
    meta_waba_id: p.waba_id,
    meta_coexistencia: coexistencia,
    desconectado_em: null,
    desconectado_por: null,
  };
  let canal: Canal;
  if (p.canal_id) {
    const { data, error } = await admin.from("canais").update(campos)
      .eq("id", p.canal_id).eq("org_id", orgId).eq("ativo", true).select(CAMPOS).maybeSingle();
    if (error) throw new Error(`canal: ${error.message}`);
    if (!data) throw new ErroUsuario("Número não encontrado.");
    canal = data as Canal;
  } else {
    canal = await criarCanal(orgId, (p.nome ?? "").trim() || numero.verified_name || "WhatsApp oficial", p.responsavel_id || null, campos);
  }
  const { error: erroToken } = await admin.rpc("meta_guardar_token", { p_canal: canal.id, p_token: token, p_expira_em: expira });
  if (erroToken) throw new Error(`token: ${erroToken.message}`);

  // 5. Os eventos desta WABA passam a chegar no meta-webhook.
  await graph(`/${p.waba_id}/subscribed_apps`, token, { method: "POST" });

  // 6. Número novo precisa ser registrado (com PIN de duas etapas). Na coexistência ele já está registrado:
  //    em vez disso, pede ao app do celular os contatos e o histórico — só dá uma vez, até 24 h depois.
  if (coexistencia) {
    for (const sync_type of ["smb_app_state_sync", "history"]) {
      try {
        await graph(`/${numero.id}/smb_app_data`, token, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", sync_type }) });
      } catch (e) {
        console.error("smb_app_data", sync_type, String(e));
      }
    }
    await admin.from("canais").update({ meta_sync_pedido_em: new Date().toISOString() }).eq("id", canal.id);
  } else {
    const pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await graph(`/${numero.id}/register`, token, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", pin }) });
    await admin.rpc("meta_guardar_pin", { p_canal: canal.id, p_pin: pin });
  }

  await admin.rpc("canal_atualizar_status", { p_canal: canal.id, p_status: "WORKING", p_numero: telefone });
  return canal;
}

// Número do portfólio da F7: sem cadastro, sem token próprio no canal (o envio cai no META_SYSTEM_TOKEN).
// O de teste da Meta já vem registrado na Cloud API. Um número novo, adicionado pelo Gerenciador e confirmado
// por SMS, ainda não: aqui ele é registrado com um PIN de duas etapas aleatório, guardado no Vault.
async function conectarComTokenSistema(orgId: string, p: { waba_id?: string; phone_number_id?: string; nome?: string }): Promise<Canal> {
  if (!META_SYSTEM_TOKEN) throw new ErroUsuario("Falta configurar o token de usuário do sistema da Meta (META_SYSTEM_TOKEN).");
  const waba = (p.waba_id ?? "").trim();
  const phone = (p.phone_number_id ?? "").trim();
  if (!/^\d+$/.test(waba) || !/^\d+$/.test(phone)) throw new ErroUsuario("Informe os IDs da conta (WABA) e do número, só dígitos.");

  const numeros = await graph(
    `/${waba}/phone_numbers?fields=id,display_phone_number,verified_name,platform_type,code_verification_status`,
    META_SYSTEM_TOKEN,
  );
  const numero = ((numeros?.data ?? []) as {
    id: string; display_phone_number?: string; verified_name?: string; platform_type?: string; code_verification_status?: string;
  }[]).find((n) => n.id === phone);
  if (!numero) throw new ErroUsuario("Esse número não está nessa conta do WhatsApp (ou o token não tem acesso a ela).");

  const { data: outro } = await admin.from("canais").select("id").eq("tipo", "meta").eq("instance_id", phone).eq("ativo", true).maybeSingle();
  if (outro) throw new ErroUsuario("Este número já está conectado na Livih.");

  // Registro na Cloud API antes de criar o canal: se a Meta recusar, nada fica pela metade.
  let pin: string | null = null;
  if (numero.platform_type !== "CLOUD_API") {
    if (numero.code_verification_status && numero.code_verification_status !== "VERIFIED") {
      throw new ErroUsuario("O número ainda não foi confirmado pelo código SMS no Gerenciador do WhatsApp.");
    }
    pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    try {
      await graph(`/${phone}/register`, META_SYSTEM_TOKEN, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", pin }) });
    } catch (e) {
      console.error("register", String(e));
      throw new ErroUsuario(
        "A Meta não registrou o número. Se ele já tem verificação em duas etapas com outro PIN, desative em Gerenciador do WhatsApp → Números de telefone → Configurações e tente de novo.",
      );
    }
  }

  const canal = await criarCanal(orgId, (p.nome ?? "").trim() || numero.verified_name || "WhatsApp oficial", null, {
    tipo: "meta",
    instance_id: phone,
    meta_waba_id: waba,
  });
  if (pin) await admin.rpc("meta_guardar_pin", { p_canal: canal.id, p_pin: pin });
  await graph(`/${waba}/subscribed_apps`, META_SYSTEM_TOKEN, { method: "POST" });
  const telefone = (numero.display_phone_number ?? "").replace(/\D/g, "") || null;
  await admin.rpc("canal_atualizar_status", { p_canal: canal.id, p_status: "WORKING", p_numero: telefone });
  return canal;
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

  let p: { acao?: string; org_id?: string; canal_id?: string; telefone?: string; nome?: string; responsavel_id?: string | null } & Oficial;
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
        const { data: canais } = await admin.from("canais").select("id, tipo, instance_id").eq("tipo", "waha").eq("ativo", true);
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
    // Empresa suspensa não conecta nem reconecta número (o resto do sistema já a bloqueia por eh_membro/tem_papel).
    const { data: org } = await admin.from("organizacoes").select("status").eq("id", p.org_id).maybeSingle();
    if (org?.status !== "ativa") return json(403, { erro: "Esta empresa está suspensa. Fale com a equipe da Livih." });

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

    if (p.acao === "oficial") {
      // Só a equipe da plataforma, até o fluxo estar liberado pela Meta e validado com o número da F7.
      const { data: plataforma } = await admin.from("admins_plataforma").select("user_id").eq("user_id", quem.user.id).maybeSingle();
      if (!plataforma) return json(403, { erro: "A conexão pela API oficial ainda não está liberada. Fale com a equipe da Livih." });
      if (!p.canal_id && p.responsavel_id) {
        const { data: ok } = await admin.from("membros_org").select("user_id")
          .eq("org_id", p.org_id).eq("user_id", p.responsavel_id).eq("ativo", true).maybeSingle();
        if (!ok) throw new ErroUsuario("O responsável precisa estar ativo na equipe.");
      }
      return json(200, { canal: await conectarOficial(p.org_id, p) });
    }

    if (p.acao === "oficial_sistema") {
      const { data: plataforma } = await admin.from("admins_plataforma").select("user_id").eq("user_id", quem.user.id).maybeSingle();
      if (!plataforma) return json(403, { erro: "Só a equipe da Livih conecta números do portfólio da F7." });
      return json(200, { canal: await conectarComTokenSistema(p.org_id, p) });
    }

    // Demais ações: um canal desta organização.
    const { data: achado } = await admin.from("canais").select(CAMPOS)
      .eq("id", p.canal_id ?? "").eq("org_id", p.org_id).eq("ativo", true).maybeSingle();
    const canal = achado as Canal | null;
    if (!canal?.instance_id) return json(404, { erro: "Número não encontrado." });

    if (canal.tipo === "meta") {
      // Número da API oficial: conectar é pelo Embedded Signup; aqui ele só sai da Livih.
      if (p.acao !== "remover") throw new ErroUsuario("Este número está na API oficial. Para reconectar, use “Conectar pela API oficial”.");
      await admin.from("canais").update({ ativo: false, desconectado_em: new Date().toISOString(), desconectado_por: quem.user.id })
        .eq("id", canal.id);
      await admin.from("agentes").update({ ativo: false }).eq("canal_id", canal.id);
      return json(200, { ok: true });
    }

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
