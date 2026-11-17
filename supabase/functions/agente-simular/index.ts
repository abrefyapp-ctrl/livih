// Simulador de conversa: Configurações → Agente → Testar agente (docs/simulador-agente.md).
//
// A tela manda a conversa de teste inteira a cada pergunta; esta função confere quem pede (dono/admin da empresa
// ou a plataforma), aplica o limite diário e repassa ao workflow do simulador no n8n (mesmo endereço e token do
// agente, outro caminho). Nada vai para o WhatsApp nem para o histórico.
//
// Foto e áudio (17/11): a última mensagem pode trazer o arquivo em `midia`. A foto é descrita (e comparada com as
// fotos do catálogo) e o áudio é transcrito com o mesmo código da entrada pelo WhatsApp; o agente lê o texto, como
// numa conversa real. A tela guarda o resultado e o reenvia nas próximas perguntas (tipo e descricao), sem
// processar o arquivo de novo. O consumo vai para uso_ia com tipo "simulador".
//
//   { org_id, mensagens: [{ de: 'cliente'|'assistente', texto, tipo?, descricao? }], midia?, prompt?, casos?, base? }
//   midia: { tipo: 'imagem'|'audio', mime, base64, segundos? }  (arquivo da última mensagem do cliente)
//   → { saudacao, resposta, passos: [{ ferramenta, entrada, saida }], midia?: { tipo, texto, descricao } }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { AUDIO_MAX_SEGUNDOS, transcrever } from "../_shared/atendimento.ts";
import { descreverArquivo, MODELO_DESCRICAO } from "../_shared/descricao.ts";
import { identificarProduto } from "../_shared/fotos.ts";

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

type Mensagem = { de?: string; texto?: string; tipo?: string; descricao?: string | null };
type Midia = { tipo?: string; mime?: string; base64?: string; segundos?: number };
type Limpa = { de: "cliente" | "assistente"; texto: string; tipo: "texto" | "imagem" | "audio"; descricao: string | null };

// Foto chega reduzida pela tela (como o WhatsApp faz); áudio até 5 min, como na entrada pelo WhatsApp.
const MAX_BYTES = { imagem: 8 * 1024 * 1024, audio: 10 * 1024 * 1024 };
const MIME_OK = { imagem: /^image\/(jpeg|png|webp)$/, audio: /^audio\/(webm|ogg|mpeg|mp3|mp4|x-m4a|wav|x-wav)$/ };

function decodificar(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  let p: {
    org_id?: string; mensagens?: Mensagem[]; midia?: Midia | null; prompt?: string | null; casos?: string[] | null; base?: string | null;
  };
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

  // Só as últimas 40, como o agente de verdade; texto, autor, tipo e descrição limpos. Foto e áudio do cliente
  // valem sem texto (a legenda é opcional e o áudio pode não ter sido transcrito).
  const mensagens: Limpa[] = p.mensagens
    .map((m): Limpa => {
      const de = m?.de === "assistente" ? "assistente" : "cliente";
      const tipo = de === "cliente" && (m?.tipo === "imagem" || m?.tipo === "audio") ? m.tipo : "texto";
      const descricao = tipo === "imagem" && typeof m?.descricao === "string" ? m.descricao.slice(0, 4000) : null;
      return { de, tipo, texto: typeof m?.texto === "string" ? m.texto.slice(0, 4000) : "", descricao };
    })
    .filter((m) => m.texto.trim() || m.tipo !== "texto")
    .slice(-40);
  const ultima = mensagens[mensagens.length - 1];
  if (!ultima || ultima.de !== "cliente") {
    return json(400, { erro: "Escreva a mensagem do cliente." });
  }

  // Arquivo da última mensagem: confere antes de gastar o limite do dia.
  const midia = p.midia ?? null;
  let arquivo: { tipo: "imagem" | "audio"; mime: string; bytes: Uint8Array; segundos: number } | null = null;
  if (midia) {
    const tipo = midia.tipo === "imagem" || midia.tipo === "audio" ? midia.tipo : null;
    const mime = (midia.mime ?? "").split(";")[0].trim().toLowerCase();
    if (!tipo || tipo !== ultima.tipo || !MIME_OK[tipo].test(mime) || typeof midia.base64 !== "string") {
      return json(400, { erro: "Formato não aceito. Use foto JPG, PNG ou WebP, ou áudio MP3, M4A, OGG, WebM ou WAV." });
    }
    if (midia.base64.length > (MAX_BYTES[tipo] * 4) / 3 + 4) {
      return json(400, { erro: tipo === "imagem" ? "Foto grande demais. Escolha outra." : "Áudio grande demais (o limite é 10 MB). Escolha um mais curto." });
    }
    const segundos = Number(midia.segundos) || 0;
    if (tipo === "audio" && segundos > AUDIO_MAX_SEGUNDOS) {
      return json(400, { erro: "Áudio com mais de 5 minutos. No WhatsApp o agente também não transcreve áudios tão longos. Grave um mais curto." });
    }
    try {
      arquivo = { tipo, mime, bytes: decodificar(midia.base64), segundos };
    } catch {
      return json(400, { erro: "Não deu para ler o arquivo. Tente de novo." });
    }
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

  // Foto descrita ou áudio transcrito, como na entrada pelo WhatsApp. Se a IA falhar, segue como lá: o agente vê
  // que recebeu uma foto que não consegue abrir, ou um áudio que não deu para transcrever.
  let resultadoMidia: { tipo: string; texto: string; descricao: string | null } | null = null;
  if (arquivo) {
    const orgId = p.org_id;
    const chave = `simulador-${crypto.randomUUID()}`;
    const origem = { org_id: orgId, conversa_id: null, mensagem_id: null, chave, tipo: "simulador" };
    const uso = async (ref: string, modelo: string, entrada: number, saida: number, segundos_audio: number | null = null) => {
      const { error } = await admin.from("uso_ia").insert({
        org_id: orgId, tipo: "simulador", modelo, tokens_entrada: entrada, tokens_saida: saida, segundos_audio, origem_ref: ref,
      });
      if (error) console.error("uso_ia simulador", error.message);
    };
    try {
      if (arquivo.tipo === "audio") {
        const t = await transcrever(arquivo.bytes.slice().buffer, arquivo.mime);
        ultima.texto = t ? t.texto.slice(0, 4000) : "";
        if (t) await uso(`transcricao:${chave}`, "gpt-4o-transcribe", t.tokensEntrada, t.tokensSaida, arquivo.segundos || null);
      } else {
        const d = await descreverArquivo({ bytes: arquivo.bytes, mime: arquivo.mime, nome: "foto" }, ultima.texto.trim() || null);
        if (d) await uso(`descricao:${chave}`, MODELO_DESCRICAO, d.tokensEntrada, d.tokensSaida);
        let texto = d?.texto ?? null;
        if (texto) {
          const produto = await identificarProduto(admin, origem, { bytes: arquivo.bytes, mime: arquivo.mime }, texto)
            .catch((e) => (console.error("identificar produto (simulador)", String(e).slice(0, 300)), null));
          if (produto) texto = `${texto}\n\n${produto}`;
        }
        ultima.descricao = texto;
      }
    } catch (e) {
      console.error("mídia do simulador", String(e).slice(0, 300));
    }
    resultadoMidia = { tipo: ultima.tipo, texto: ultima.texto, descricao: ultima.descricao };
  }

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
    return json(200, {
      saudacao: corpo.saudacao ?? null, resposta: corpo.resposta ?? null, passos: corpo.passos ?? [], midia: resultadoMidia,
    });
  } catch (e) {
    console.error("n8n simulador", String(e));
    return json(504, { erro: "O agente demorou demais para responder. Tente de novo." });
  }
});
