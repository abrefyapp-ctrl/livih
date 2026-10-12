// Modelos de mensagem (templates) da API oficial: Configurações → Modelos.
//
// O modelo pertence à conta do WhatsApp (WABA) do número, não ao número. A Meta analisa cada modelo novo
// (minutos a horas) e só depois ele pode ser enviado. Fora da janela de 24 h, a API oficial só envia modelo.
//
// Chamada pela tela, com o login do usuário:
//   { org_id, canal_id, acao: 'listar' }                   → { modelos } (quem vê o número)
//   { org_id, canal_id, acao: 'criar', modelo: {...} }     → { id, status } (dono/admin)
//   { org_id, canal_id, acao: 'apagar', nome }             → { ok } (dono/admin; apaga todos os idiomas)
// O token da Meta nunca sai daqui.

import { createClient } from "jsr:@supabase/supabase-js@2";

const GRAPH = "https://graph.facebook.com/v25.0";
const TOKEN_SISTEMA = Deno.env.get("META_SYSTEM_TOKEN") ?? "";

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

class ErroUsuario extends Error {}

// Erros da Meta na criação que a pessoa consegue corrigir sozinha.
const ERROS_META: Record<number, string> = {
  2388023: "A Meta ainda está apagando um modelo com esse nome. Use outro nome ou espere alguns minutos.",
  2388024: "Já existe um modelo com esse nome e idioma.",
  2388040: "Algum texto passou do tamanho permitido pela Meta.",
  2388047: "O cabeçalho tem formato inválido.",
  2388072: "O texto principal tem formato inválido.",
  2388293: "Há variáveis demais para o tamanho do texto. Escreva mais texto em volta delas.",
  2388299: "O texto não pode começar nem terminar com uma variável.",
  190: "O acesso ao WhatsApp oficial expirou. Conecte o número de novo em Configurações → WhatsApp.",
};

async function graph(caminho: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`${GRAPH}${caminho}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  // deno-lint-ignore no-explicit-any
  const corpo: any = await r.json().catch(() => null);
  if (!r.ok) {
    const e = corpo?.error ?? {};
    const conhecido = ERROS_META[Number(e.error_subcode)] ?? ERROS_META[Number(e.code)];
    if (conhecido) throw new ErroUsuario(conhecido);
    // A Meta costuma explicar a recusa em português em error_user_msg (vem no idioma do app).
    if (e.error_user_msg) throw new ErroUsuario(`A Meta recusou: ${String(e.error_user_msg).slice(0, 300)}`);
    throw new Error(`Meta ${caminho.split("?")[0]}: ${r.status} ${JSON.stringify(e).slice(0, 300)}`);
  }
  return corpo;
}

type ModeloNovo = {
  nome?: string;
  categoria?: string;
  idioma?: string;
  cabecalho?: string;
  corpo?: string;
  exemplos?: string[];
  rodape?: string;
  botoes?: string[];
};

const IDIOMAS = new Set(["pt_BR", "en_US", "es"]);
const CATEGORIAS = new Set(["UTILITY", "MARKETING"]);

/** Confere aqui o que a Meta recusaria, com mensagem em português, e monta os componentes. */
function componentes(m: ModeloNovo) {
  const nome = (m.nome ?? "").trim();
  if (!/^[a-z0-9_]{1,512}$/.test(nome)) throw new ErroUsuario("O nome usa só letras minúsculas, números e _ (sem espaço nem acento).");
  if (!CATEGORIAS.has(m.categoria ?? "")) throw new ErroUsuario("Escolha a categoria do modelo.");
  if (!IDIOMAS.has(m.idioma ?? "")) throw new ErroUsuario("Escolha o idioma do modelo.");

  const corpo = (m.corpo ?? "").trim();
  if (!corpo) throw new ErroUsuario("Escreva o texto da mensagem.");
  if (corpo.length > 1024) throw new ErroUsuario("O texto da mensagem tem no máximo 1.024 caracteres.");
  const variaveis = [...corpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((v) => Number(v[1]));
  const distintas = [...new Set(variaveis)].sort((a, b) => a - b);
  if (distintas.some((n, i) => n !== i + 1)) throw new ErroUsuario("As variáveis precisam ser {{1}}, {{2}}, {{3}}… em sequência.");
  if (/^\{\{\s*\d+\s*\}\}/.test(corpo) || /\{\{\s*\d+\s*\}\}[.!?]?$/.test(corpo)) {
    throw new ErroUsuario("O texto não pode começar nem terminar com uma variável.");
  }
  const exemplos = (m.exemplos ?? []).map((e) => String(e ?? "").trim());
  if (distintas.length && (exemplos.length < distintas.length || exemplos.slice(0, distintas.length).some((e) => !e))) {
    throw new ErroUsuario("Preencha um exemplo para cada variável. A Meta usa os exemplos para aprovar o modelo.");
  }

  // deno-lint-ignore no-explicit-any
  const lista: any[] = [];
  const cabecalho = (m.cabecalho ?? "").trim();
  if (cabecalho) {
    if (cabecalho.length > 60) throw new ErroUsuario("O título tem no máximo 60 caracteres.");
    if (/\{\{/.test(cabecalho)) throw new ErroUsuario("O título não aceita variáveis.");
    lista.push({ type: "HEADER", format: "TEXT", text: cabecalho });
  }
  lista.push({
    type: "BODY",
    text: corpo,
    ...(distintas.length ? { example: { body_text: [exemplos.slice(0, distintas.length)] } } : {}),
  });
  const rodape = (m.rodape ?? "").trim();
  if (rodape) {
    if (rodape.length > 60) throw new ErroUsuario("O rodapé tem no máximo 60 caracteres.");
    lista.push({ type: "FOOTER", text: rodape });
  }
  const botoes = (m.botoes ?? []).map((b) => String(b ?? "").trim()).filter(Boolean);
  if (botoes.length > 3) throw new ErroUsuario("No máximo 3 botões de resposta.");
  if (botoes.some((b) => b.length > 25)) throw new ErroUsuario("Cada botão tem no máximo 25 caracteres.");
  if (new Set(botoes).size !== botoes.length) throw new ErroUsuario("Os botões precisam ter textos diferentes.");
  if (botoes.length) lista.push({ type: "BUTTONS", buttons: botoes.map((text) => ({ type: "QUICK_REPLY", text })) });

  return { name: nome, category: m.categoria, language: m.idioma, components: lista };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  let p: { acao?: string; org_id?: string; canal_id?: string; nome?: string; modelo?: ModeloNovo };
  try {
    p = await req.json();
  } catch {
    return json(400, { erro: "corpo inválido" });
  }

  try {
    const tokenUsuario = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: quem } = await admin.auth.getUser(tokenUsuario);
    if (!quem.user) return json(401, { erro: "faça login de novo" });
    if (!p.org_id || !p.canal_id) return json(400, { erro: "org_id e canal_id obrigatórios" });

    const { data: membro } = await admin.from("membros_org").select("papel")
      .eq("org_id", p.org_id).eq("user_id", quem.user.id).eq("ativo", true).maybeSingle();
    if (!membro) return json(403, { erro: "sem acesso a esta organização" });
    const gerencia = membro.papel === "dono" || membro.papel === "admin";
    const { data: org } = await admin.from("organizacoes").select("status").eq("id", p.org_id).maybeSingle();
    if (org?.status !== "ativa") return json(403, { erro: "Esta empresa está suspensa. Fale com a equipe da Livih." });

    const { data: canal } = await admin.from("canais").select("id, tipo, meta_waba_id, responsavel_id")
      .eq("id", p.canal_id).eq("org_id", p.org_id).eq("ativo", true).maybeSingle();
    // Mesma regra de pode_ver_canal: número de vendedor só ele, dono e admin.
    if (!canal || (!gerencia && canal.responsavel_id && canal.responsavel_id !== quem.user.id)) {
      return json(404, { erro: "Número não encontrado." });
    }
    if (canal.tipo !== "meta" || !canal.meta_waba_id) throw new ErroUsuario("Modelos só existem em número conectado pela API oficial.");

    const { data: tokenCanal } = await admin.rpc("meta_token_do_canal", { p_canal: canal.id });
    const token = (tokenCanal as string | null) || TOKEN_SISTEMA;
    if (!token) throw new Error("canal sem token da Meta");
    const waba = canal.meta_waba_id;

    if (p.acao === "listar") {
      const campos = "id,name,status,category,language,components,rejected_reason,quality_score";
      const modelos = [];
      let proxima: string | null = `/${waba}/message_templates?fields=${campos}&limit=100`;
      for (let pagina = 0; proxima && pagina < 5; pagina++) {
        const r = await graph(proxima, token);
        modelos.push(...(r?.data ?? []));
        const depois = r?.paging?.cursors?.after;
        proxima = r?.paging?.next && depois ? `/${waba}/message_templates?fields=${campos}&limit=100&after=${depois}` : null;
      }
      return json(200, { modelos });
    }

    if (!gerencia) return json(403, { erro: "Só dono e admin criam e apagam modelos." });

    if (p.acao === "criar") {
      const r = await graph(`/${waba}/message_templates`, token, { method: "POST", body: JSON.stringify(componentes(p.modelo ?? {})) });
      return json(200, { id: r?.id, status: r?.status });
    }

    if (p.acao === "apagar") {
      const nome = (p.nome ?? "").trim();
      if (!/^[a-z0-9_]{1,512}$/.test(nome)) throw new ErroUsuario("Modelo inválido.");
      await graph(`/${waba}/message_templates?name=${encodeURIComponent(nome)}`, token, { method: "DELETE" });
      return json(200, { ok: true });
    }

    return json(400, { erro: "ação desconhecida" });
  } catch (e) {
    if (e instanceof ErroUsuario) return json(400, { erro: e.message });
    console.error("whatsapp-modelos", e);
    return json(500, { erro: "Algo deu errado ao falar com a Meta. Tente de novo." });
  }
});
