// Esvazia a fila de envio: chamada pelo trigger da fila_envio e pelo cron (a cada minuto).
// Só aceita chamada do próprio banco (header x-livih-segredo, conferido no Vault).
// Um adaptador por provedor: WAHA, a API oficial da Meta (Cloud API) e o Instagram (Direct).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { ERROS_META } from "../_shared/errosMeta.ts";

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
  // Modelo da API oficial (fora da janela de 24 h); null = texto livre.
  modelo: { nome: string; idioma: string; parametros: string[] } | null;
  // Arquivo (bucket `midias`); null = só texto. Com arquivo, `texto` é a legenda (pode ser null).
  tipo: string;
  midia_path: string | null;
  midia_mime: string | null;
  midia_nome: string | null;
};
type Resultado = { ok: boolean; id?: string; erro?: string };

// O provedor baixa o arquivo por esta URL. 1 h basta: a fila tenta de novo com URL nova.
async function urlArquivo(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("midias").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error(`arquivo indisponível no storage: ${error?.message ?? path}`);
  return data.signedUrl;
}

// Para quem enviar. O LID é o identificador que o WhatsApp realmente usa, então tem preferência.
// Sem LID, pergunta ao WAHA o id certo do número: contas brasileiras antigas existem SEM o nono
// dígito, e o telefone guardado na Livih sempre tem o 9 (o GOWS não acha "55419…" se a conta é "5541…").
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
  if (item.midia_path) return await sendArquivoWaha(item, chatId);
  return await sendTextWaha(item.instance_id, chatId, item.texto, item.telefone);
}

// Imagem e vídeo aparecem na conversa; o resto vai como documento, com o nome original.
// O WAHA da VPS é CORE: sendFile é comprovado (Casos Info); se sendImage/sendVideo for recusado (resposta de
// erro, não timeout — aí pode ter saído), manda como arquivo para não travar o envio.
async function sendArquivoWaha(item: ItemFila, chatId: string | null): Promise<Resultado> {
  if (!chatId) return { ok: false, erro: `número sem WhatsApp: ${item.telefone}` };
  const rota = item.tipo === "imagem" ? "sendImage" : item.tipo === "video" ? "sendVideo" : "sendFile";
  const file = { mimetype: item.midia_mime, filename: item.midia_nome, url: await urlArquivo(item.midia_path!) };
  const corpo = { session: item.instance_id, chatId, file, caption: item.texto ?? undefined };
  const r = await postWaha(rota, corpo, 60000);
  if (r.ok || rota === "sendFile") return r;
  console.warn(`WAHA ${rota} recusado, indo por sendFile: ${r.erro}`);
  return await postWaha("sendFile", corpo, 60000);
}

async function sendTextWaha(sessao: string, chatId: string | null, mensagem: string, telefone: string | null): Promise<Resultado> {
  if (!chatId) return { ok: false, erro: `número sem WhatsApp: ${telefone}` };
  return await postWaha("sendText", { session: sessao, chatId, text: mensagem }, 20000);
}

async function postWaha(rota: string, corpoEnvio: unknown, prazoMs: number): Promise<Resultado> {
  const r = await fetch(`${WAHA_URL}/api/${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
    body: JSON.stringify(corpoEnvio),
    signal: AbortSignal.timeout(prazoMs),
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
// Tradução dos erros da Meta: _shared/errosMeta.ts (também usada pelo meta-webhook).

async function conteudoMeta(item: ItemFila) {
  if (item.midia_path) {
    const link = await urlArquivo(item.midia_path);
    const legenda = item.texto ? { caption: item.texto } : {};
    if (item.tipo === "imagem") return { type: "image", image: { link, ...legenda } };
    if (item.tipo === "video") return { type: "video", video: { link, ...legenda } };
    return { type: "document", document: { link, filename: item.midia_nome ?? "arquivo", ...legenda } };
  }
  if (!item.modelo) return { type: "text", text: { body: item.texto } };
  const parametros = item.modelo.parametros ?? [];
  return {
    type: "template",
    template: {
      name: item.modelo.nome,
      language: { code: item.modelo.idioma },
      ...(parametros.length
        ? { components: [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }] }
        : {}),
    },
  };
}

async function enviarMeta(item: ItemFila): Promise<Resultado> {
  if (!item.instance_id) return { ok: false, erro: "canal sem phone_number_id" };
  if (!item.telefone) return { ok: false, erro: "contato sem telefone" };
  const { data: tokenCanal } = await supabase.rpc("meta_token_do_canal", { p_canal: item.canal_id });
  const token = (tokenCanal as string | null) || TOKEN_SISTEMA;
  if (!token) return { ok: false, erro: "canal sem token da Meta" };
  const r = await fetch(`https://graph.facebook.com/v25.0/${item.instance_id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: item.telefone, ...(await conteudoMeta(item)) }),
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

// ---- Instagram (docs/instagram.md, entrega 2) ----
// Pela API do Instagram (login unificado): POST /{conta}/messages, destinatário pelo IGSID do contato. Texto até
// 1.000 bytes por mensagem: o mais longo sai em partes, cortadas em espaço (o eco de cada parte é reconhecido como
// da Livih pelo banco, registrar_saida_instagram). Arquivo sai sem legenda (o Instagram não tem): a legenda vai logo
// depois, como texto. A janela de 24 horas já foi conferida ao entrar na fila (instagram_pode_responder).
const LIMITE_INSTAGRAM = 1000;
const TIPO_ANEXO_INSTAGRAM: Record<string, string> = { imagem: "image", video: "video", audio: "audio" };

function partesInstagram(texto: string): string[] {
  const enc = new TextEncoder();
  const partes: string[] = [];
  let resto = texto.trim();
  while (enc.encode(resto).length > LIMITE_INSTAGRAM) {
    // Maior trecho que cabe, cortado no último espaço ou quebra de linha (nunca no meio de uma palavra).
    let fim = resto.length;
    while (enc.encode(resto.slice(0, fim)).length > LIMITE_INSTAGRAM) fim = Math.floor(fim * 0.9);
    const corte = Math.max(resto.lastIndexOf("\n", fim), resto.lastIndexOf(" ", fim));
    const ate = corte > fim * 0.5 ? corte : fim;
    partes.push(resto.slice(0, ate).trim());
    resto = resto.slice(ate).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

async function postInstagram(conta: string, token: string, corpo: unknown): Promise<Resultado> {
  const r = await fetch(`https://graph.facebook.com/v25.0/${conta}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(30000),
  });
  // deno-lint-ignore no-explicit-any
  const resposta: any = await r.json().catch(() => null);
  if (!r.ok) {
    const e = resposta?.error ?? {};
    // 10 / 2018278: fora da janela de 24 horas (a fila pode ter demorado).
    if (Number(e.code) === 10 || Number(e.error_subcode) === 2018278) {
      return { ok: false, erro: "Passaram 24 horas da última mensagem do cliente no Instagram: a Meta não deixa responder." };
    }
    return { ok: false, erro: `Instagram ${r.status} (${e.code ?? "?"}): ${String(e.message ?? "").slice(0, 250)}` };
  }
  return { ok: true, id: resposta?.message_id ? String(resposta.message_id) : undefined };
}

async function enviarInstagram(item: ItemFila): Promise<Resultado> {
  if (!item.instance_id) return { ok: false, erro: "canal sem a conta do Instagram" };
  const { data: tokenCanal } = await supabase.rpc("meta_token_do_canal", { p_canal: item.canal_id });
  const token = tokenCanal as string | null;
  if (!token) return { ok: false, erro: "conta do Instagram sem token: reconecte em Configurações" };
  const { data: msg } = await supabase.from("mensagens")
    .select("conversa:conversas(contato:contatos(instagram_id))").eq("id", item.mensagem_id).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const igsid = (msg as any)?.conversa?.contato?.instagram_id as string | undefined;
  if (!igsid) return { ok: false, erro: "contato sem o ID do Instagram" };
  const destino = { recipient: { id: igsid } };
  // Cada mensagem que sai tem o ID marcado na hora: o eco dela (webhook ou busca) é reconhecido como da Livih pelo ID
  // (instagram_marcar_enviada), e não vira mensagem da equipe.
  const mandar = async (corpo: unknown): Promise<Resultado> => {
    const r = await postInstagram(item.instance_id!, token, corpo);
    if (r.ok && r.id) {
      const { error } = await supabase.rpc("instagram_marcar_enviada", { p_canal: item.canal_id, p_mid: r.id, p_mensagem: item.mensagem_id });
      if (error) console.error("instagram_marcar_enviada", error.message);
    }
    return r;
  };

  let primeiro: string | undefined;
  if (item.midia_path) {
    const tipo = TIPO_ANEXO_INSTAGRAM[item.tipo] ?? "file";
    const r = await mandar({
      ...destino, message: { attachment: { type: tipo, payload: { url: await urlArquivo(item.midia_path) } } },
    });
    if (!r.ok) return r;
    primeiro = r.id;
  }
  const texto = (item.texto ?? "").trim();
  for (const parte of texto ? partesInstagram(texto) : []) {
    const r = await mandar({ ...destino, message: { text: parte } });
    // Uma parte (ou o arquivo) já saiu e a seguinte falhou: conta como enviado, senão a fila tentaria de novo e o
    // cliente receberia a primeira parte duas vezes. O erro fica no log.
    if (!r.ok) {
      if (primeiro) {
        console.error("instagram: parte da mensagem não saiu", item.mensagem_id, r.erro);
        break;
      }
      return r;
    }
    primeiro ??= r.id;
  }
  return primeiro ? { ok: true, id: primeiro } : { ok: false, erro: "mensagem vazia" };
}

const ADAPTADORES: Record<string, (item: ItemFila) => Promise<Resultado>> = {
  waha: enviarWaha,
  meta: enviarMeta,
  instagram: enviarInstagram,
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
      const { error: erroResultado } = await supabase.rpc("fila_resultado", {
        p_fila: item.fila_id,
        p_ok: resultado.ok,
        p_wa_id: resultado.id ?? null,
        p_erro: resultado.erro ?? null,
      });
      // Sem isto, um erro aqui deixava o item "enviando" para sempre sem rastro (revisão de 19/11).
      if (erroResultado) console.error("fila_resultado", item.fila_id, item.mensagem_id, erroResultado.message);
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
