// Focus NFe (docs/nfe.md): o que as funções nfe-* fazem igual. Autenticação HTTP Basic com o token do CNPJ (Vault)
// como usuário; homologação e produção mudam o servidor e o token.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type Ambiente = "homologacao" | "producao";
export const BASE: Record<Ambiente, string> = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};
export const basic = (token: string) => `Basic ${btoa(`${token}:`)}`;

export type Modelo = "nfe" | "nfse";
export type Nota = {
  id: string; org_id: string; emissora_id: string; ref: string; ambiente: Ambiente; status: string; consultas: number; modelo: Modelo;
};
/** Caminho da API por modelo: NF-e em /v2/nfe, NFS-e Nacional em /v2/nfsen. */
export const ROTA: Record<Modelo, string> = { nfe: "nfe", nfse: "nfsen" };

/**
 * Um erro da Focus em texto, com tudo o que vier nele: além de código e mensagem, o Ambiente Nacional da NFS-e manda
 * o detalhe em outros campos (ex.: "complemento", com o elemento rejeitado no E1235), que antes ficavam de fora.
 */
export function textoErro(e: Record<string, unknown>): string {
  const partes = [e.codigo, e.mensagem, ...Object.entries(e).filter(([k]) => k !== "codigo" && k !== "mensagem").map(([, v]) => v)]
    .filter((v) => typeof v === "string" && v.trim()) as string[];
  return partes.join(" — ");
}

/** Mensagens de erro da Focus em texto (vêm em erros[] com campo e mensagem, ou em mensagem/mensagem_sefaz). */
export function mensagemFocus(corpo: unknown, status: number): string {
  const c = corpo as { mensagem?: string; mensagem_sefaz?: string; erros?: { mensagem?: string }[] } | null;
  const lista = ((c?.erros ?? []) as Record<string, unknown>[]).map(textoErro).filter(Boolean);
  if (lista.length) return lista.join(" · ");
  return c?.mensagem_sefaz || c?.mensagem || (status === 401 ? "A Focus recusou o acesso (token do CNPJ)." : `A Focus respondeu ${status}.`);
}

export async function tokenDoCnpj(admin: SupabaseClient, emissoraId: string, ambiente: Ambiente): Promise<string | null> {
  const { data } = await admin.rpc("nfe_token", { p_emissora: emissoraId, p_ambiente: ambiente });
  return (data as string | null) || null;
}

async function baixar(url: string, token: string): Promise<Uint8Array | null> {
  const r = await fetch(url, { headers: { Authorization: basic(token) }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) {
    console.error("focus arquivo", r.status, url.slice(-80));
    return null;
  }
  return new Uint8Array(await r.arrayBuffer());
}

/** Copia um arquivo da Focus para o bucket notas-fiscais. Devolve o caminho ou null. */
async function guardar(admin: SupabaseClient, nota: Nota, token: string, caminho: string | undefined, nome: string, mime: string) {
  if (!caminho) return null;
  const bytes = await baixar(caminho.startsWith("http") ? caminho : BASE[nota.ambiente] + caminho, token);
  if (!bytes) return null;
  const mes = new Date().toISOString().slice(0, 7);
  const path = `${nota.org_id}/${nota.emissora_id}/${mes}/${nome}`;
  const { error } = await admin.storage.from("notas-fiscais").upload(path, bytes, { contentType: mime, upsert: true });
  if (error) {
    console.error("guardar nota", error.message, path);
    return null;
  }
  return path;
}

type Retorno = {
  status?: string; numero?: string | number; serie?: string | number; chave_nfe?: string; mensagem_sefaz?: string;
  status_sefaz?: string; caminho_xml_nota_fiscal?: string; caminho_danfe?: string; caminho_xml_cancelamento?: string;
  // NFS-e Nacional: o PDF vem como URL completa e a chave (50 dígitos) dentro da URL de consulta pública.
  url_danfse?: string; url?: string; codigo_verificacao?: string; erros?: Record<string, unknown>[];
};

const chaveDe = (r: Retorno) => (r.chave_nfe ?? "").replace(/\D/g, "") || (r.url?.match(/chave=(\d{44,50})/)?.[1] ?? null);

/**
 * Aplica o retorno da Focus (do gatilho ou da consulta) à nota: autorizada guarda XML e DANFE; rejeitada guarda o
 * motivo da SEFAZ; cancelada guarda o XML do cancelamento. Processando só conta a consulta.
 */
export async function aplicarRetorno(admin: SupabaseClient, nota: Nota, r: Retorno) {
  const token = await tokenDoCnpj(admin, nota.emissora_id, nota.ambiente);
  if (!token) return console.error("sem token do CNPJ", nota.emissora_id, nota.ambiente);
  const agora = new Date().toISOString();

  if (r.status === "autorizado" && nota.status !== "autorizada" && nota.status !== "cancelada") {
    const chave = chaveDe(r);
    const base = chave ?? nota.ref;
    const [xml, danfe] = await Promise.all([
      guardar(admin, nota, token, r.caminho_xml_nota_fiscal, `${base}-${nota.modelo}.xml`, "application/xml"),
      guardar(admin, nota, token, r.caminho_danfe ?? r.url_danfse, `${base}.pdf`, "application/pdf"),
    ]);
    const { error } = await admin.from("notas_fiscais").update({
      status: "autorizada", numero: r.numero ? Number(r.numero) : null, serie: r.serie ? Number(r.serie) : null, chave,
      xml_path: xml, danfe_path: danfe, autorizada_em: agora, mensagem: xml && danfe ? null : "Autorizada; o XML ou o DANFE ainda não foi copiado para o Livih.",
    }).eq("id", nota.id);
    if (error) console.error("nota autorizada", error.message);
    return;
  }
  if ((r.status === "erro_autorizacao" || r.status === "denegado") && nota.status === "processando") {
    await admin.from("notas_fiscais").update({
      status: "rejeitada",
      mensagem: [r.status === "denegado" ? "Uso denegado pela SEFAZ." : null, r.status_sefaz ? `${r.status_sefaz}:` : null, r.mensagem_sefaz,
                 ...(r.erros ?? []).map(textoErro)]
        .filter(Boolean).join(" ").slice(0, 4000) || (nota.modelo === "nfse" ? "A prefeitura não autorizou a nota." : "A SEFAZ não autorizou a nota."),
    }).eq("id", nota.id);
    return;
  }
  if (r.status === "cancelado" && nota.status !== "cancelada") {
    const xml = await guardar(admin, nota, token, r.caminho_xml_cancelamento, `${nota.ref}-cancelamento.xml`, "application/xml");
    await admin.from("notas_fiscais").update({ status: "cancelada", cancelada_em: agora, xml_cancelamento_path: xml }).eq("id", nota.id);
    return;
  }
  if (nota.status === "processando") {
    await admin.from("notas_fiscais").update({ consultas: nota.consultas + 1 }).eq("id", nota.id);
  }
}

/** Consulta a nota na Focus e aplica o retorno. */
export async function consultarNota(admin: SupabaseClient, nota: Nota) {
  const token = await tokenDoCnpj(admin, nota.emissora_id, nota.ambiente);
  if (!token) return;
  const r = await fetch(`${BASE[nota.ambiente]}/v2/${ROTA[nota.modelo]}/${encodeURIComponent(nota.ref)}`, {
    headers: { Authorization: basic(token) }, signal: AbortSignal.timeout(30000),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) {
    console.error("consultar nota", r.status, nota.ref, mensagemFocus(corpo, r.status).slice(0, 200));
    await admin.from("notas_fiscais").update({ consultas: nota.consultas + 1 }).eq("id", nota.id);
    return;
  }
  await aplicarRetorno(admin, nota, corpo as Retorno);
}

/**
 * Cadastra na Focus o gatilho de NF-e do CNPJ (homologação e produção), apontando para a função nfe-retorno com o
 * segredo no cabeçalho X-Livih-Focus. Não duplica: confere os que já existem.
 */
export async function registrarGatilhos(admin: SupabaseClient, emissoraId: string, cnpj: string) {
  const { data: segredo } = await admin.rpc("nfe_segredo_webhook");
  if (!segredo) return console.error("sem segredo do webhook");
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/nfe-retorno`;
  for (const ambiente of ["homologacao", "producao"] as Ambiente[]) {
    const token = await tokenDoCnpj(admin, emissoraId, ambiente);
    if (!token) continue;
    try {
      const lista = await fetch(`${BASE[ambiente]}/v2/hooks`, { headers: { Authorization: basic(token) }, signal: AbortSignal.timeout(20000) });
      const existentes = ((await lista.json().catch(() => [])) ?? []) as { url?: string; event?: string; cnpj?: string }[];
      // Um gatilho por evento: NF-e e NFS-e Nacional.
      for (const evento of ["nfe", "nfsen"]) {
        if (Array.isArray(existentes) && existentes.some((h) => h.url === url && h.event === evento && (h.cnpj ?? cnpj) === cnpj)) continue;
        const r = await fetch(`${BASE[ambiente]}/v2/hooks`, {
          method: "POST",
          headers: { Authorization: basic(token), "Content-Type": "application/json" },
          body: JSON.stringify({ cnpj, event: evento, url, authorization: segredo, authorization_header: "X-Livih-Focus" }),
          signal: AbortSignal.timeout(20000),
        });
        if (!r.ok) console.error("criar gatilho", ambiente, evento, r.status, mensagemFocus(await r.json().catch(() => null), r.status).slice(0, 200));
      }
    } catch (e) {
      console.error("gatilho", ambiente, String(e).slice(0, 200));
    }
  }
}
