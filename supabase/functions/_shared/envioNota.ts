// Envio da NF-e ao cliente (docs/balcao.md, entrega 2): o que a nfe-retorno (quando a nota é autorizada) e a
// nota-enviar (pedido na tela) fazem igual. Os envios pendentes de uma nota ficam em nota_envios; aqui cada um é
// pego (pendente → enviando, para o gatilho da Focus e a tela não mandarem duas vezes) e feito:
//   - WhatsApp: o banco acha ou cria o contato e a conversa (nota_whatsapp_preparar); o DANFE é copiado de
//     notas-fiscais para midias/<org>/<conversa>/ (a fila do WhatsApp só lê de midias) e entra na fila
//     (nota_whatsapp_enfileirar). A whatsapp-enviar manda.
//   - E-mail: a Focus manda (POST /v2/nfe/{ref}/email), em segundo plano.
// Só com a nota autorizada e o DANFE guardado; antes disso o envio espera.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { BASE, basic, mensagemFocus, tokenDoCnpj, type Ambiente } from "./focus.ts";

type NotaEnvio = {
  id: string; org_id: string; emissora_id: string; ref: string; ambiente: Ambiente; status: string; modelo: string;
  numero: number | null; danfe_path: string | null;
};

async function marcar(admin: SupabaseClient, id: string, situacao: "enviado" | "erro", resultado: string) {
  await admin.from("nota_envios").update({
    situacao, resultado: resultado.slice(0, 500), ...(situacao === "enviado" ? { enviado_em: new Date().toISOString() } : {}),
  }).eq("id", id);
}

async function porWhatsapp(admin: SupabaseClient, nota: NotaEnvio, envioId: string, empresa: string) {
  const { data: prep, error } = await admin.rpc("nota_whatsapp_preparar", { p_envio: envioId });
  if (error) return marcar(admin, envioId, "erro", "Não foi possível preparar o envio pelo WhatsApp.");
  const p = prep as { ok: boolean; motivo?: string; conversa_id?: string };
  if (!p.ok || !p.conversa_id) return marcar(admin, envioId, "erro", `Não enviado: ${p.motivo ?? "sem conversa"}.`);

  const { data: arquivo, error: erroBaixar } = await admin.storage.from("notas-fiscais").download(nota.danfe_path!);
  if (erroBaixar || !arquivo) return marcar(admin, envioId, "erro", "Não foi possível ler o DANFE guardado.");
  const nome = `NF-e ${nota.numero ?? nota.ref}.pdf`;
  const path = `${nota.org_id}/${p.conversa_id}/nfe-${nota.numero ?? nota.ref}-${Date.now()}.pdf`;
  const { error: erroSubir } = await admin.storage.from("midias").upload(path, arquivo, { contentType: "application/pdf" });
  if (erroSubir) return marcar(admin, envioId, "erro", "Não foi possível preparar o arquivo para o WhatsApp.");

  const legenda = `Nota fiscal${nota.numero ? ` nº ${nota.numero}` : ""}${empresa ? ` – ${empresa}` : ""}`;
  const { error: erroFila } = await admin.rpc("nota_whatsapp_enfileirar", {
    p_envio: envioId, p_conversa: p.conversa_id, p_path: path, p_nome: nome, p_legenda: legenda,
  });
  if (erroFila) {
    console.error("nota whatsapp fila", erroFila.message);
    return marcar(admin, envioId, "erro", "Não foi possível pôr a nota na fila do WhatsApp.");
  }
}

async function porEmail(admin: SupabaseClient, nota: NotaEnvio, envioId: string, destino: string) {
  const token = await tokenDoCnpj(admin, nota.emissora_id, nota.ambiente);
  if (!token) return marcar(admin, envioId, "erro", "O CNPJ está sem o acesso da Focus.");
  const r = await fetch(`${BASE[nota.ambiente]}/v2/nfe/${encodeURIComponent(nota.ref)}/email`, {
    method: "POST",
    headers: { Authorization: basic(token), "Content-Type": "application/json" },
    body: JSON.stringify({ emails: [destino] }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  if (!r) return marcar(admin, envioId, "erro", "A Focus não respondeu. Tente reenviar.");
  const corpo = await r.json().catch(() => null);
  if (!r.ok) return marcar(admin, envioId, "erro", `A Focus recusou: ${mensagemFocus(corpo, r.status)}`);
  return marcar(admin, envioId, "enviado", "A Focus está mandando o e-mail (pode levar alguns minutos).");
}

/** Faz os envios pendentes da nota, se ela já estiver autorizada e com o DANFE guardado. */
export async function processarEnvios(admin: SupabaseClient, notaId: string) {
  const { data: nota } = await admin.from("notas_fiscais")
    .select("id, org_id, emissora_id, ref, ambiente, status, modelo, numero, danfe_path").eq("id", notaId).maybeSingle<NotaEnvio>();
  if (!nota || nota.status !== "autorizada" || !nota.danfe_path || nota.modelo !== "nfe") return;

  const { data: pendentes } = await admin.from("nota_envios").select("id, canal, destino").eq("nota_id", notaId).eq("situacao", "pendente");
  if (!pendentes?.length) return;
  const { data: emi } = await admin.from("emissoras").select("nome_fantasia, razao_social").eq("id", nota.emissora_id).maybeSingle();
  const empresa = (emi?.nome_fantasia || emi?.razao_social || "").trim();

  for (const e of pendentes as { id: string; canal: string; destino: string }[]) {
    // Pega o envio; se outra função pegou antes, segue.
    const { data: pego } = await admin.from("nota_envios").update({ situacao: "enviando" }).eq("id", e.id).eq("situacao", "pendente")
      .select("id").maybeSingle();
    if (!pego) continue;
    try {
      if (e.canal === "whatsapp") await porWhatsapp(admin, nota, e.id, empresa);
      else await porEmail(admin, nota, e.id, e.destino);
    } catch (erro) {
      console.error("envio nota", e.id, String(erro));
      await marcar(admin, e.id, "erro", "Erro inesperado no envio. Tente reenviar.");
    }
  }
}
