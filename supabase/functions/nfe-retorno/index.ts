// NF-e pela Focus NFe (docs/nfe.md): o resultado da nota.
//
// Duas entradas:
//   - gatilho da Focus (POST com o corpo da nota e o segredo no cabeçalho X-Livih-Focus), cadastrado pela nfe-config;
//   - conferência de reserva do banco ({ conferir: true } com x-livih-segredo), para nota processando há mais de
//     2 minutos (gatilho perdido), e para nota autorizada sem o XML ou o DANFE (cópia que falhou). A Focus tenta o
//     gatilho por até 48 h; a conferência cobre o resto.
// Responde rápido e processa em segundo plano (recomendação da Focus).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { aplicarRetorno, consultarNota, type Nota } from "../_shared/focus.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
// @ts-ignore EdgeRuntime existe no runtime do Supabase
const emSegundoPlano = (tarefa: Promise<unknown>) => globalThis.EdgeRuntime?.waitUntil?.(tarefa);

async function conferir() {
  const { data } = await admin.from("notas_fiscais").select("id, org_id, emissora_id, ref, ambiente, status, consultas, modelo")
    .eq("status", "processando").lt("atualizado_em", new Date(Date.now() - 120_000).toISOString()).lt("consultas", 60)
    .order("atualizado_em").limit(20);
  for (const nota of (data ?? []) as Nota[]) await consultarNota(admin, nota);
  const { data: semArquivo } = await admin.from("notas_fiscais").select("id, org_id, emissora_id, ref, ambiente, status, consultas, modelo")
    .eq("status", "autorizada").or("xml_path.is.null,danfe_path.is.null")
    .lt("atualizado_em", new Date(Date.now() - 120_000).toISOString()).lt("consultas", 60)
    .order("atualizado_em").limit(20);
  for (const nota of (semArquivo ?? []) as Nota[]) await consultarNota(admin, nota);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("use POST", { status: 405 });
  const corpo = await req.json().catch(() => null) as { conferir?: boolean; ref?: string } | null;

  // Banco (cron): segredo interno.
  const interno = req.headers.get("x-livih-segredo");
  if (interno) {
    const { data: ok } = await admin.rpc("verificar_segredo_interno", { p_segredo: interno });
    if (ok !== true) return new Response("não autorizado", { status: 401 });
    emSegundoPlano(conferir().catch((e) => console.error("conferir notas", String(e))));
    return Response.json({ ok: true });
  }

  // Focus: segredo do gatilho.
  const { data: segredo } = await admin.rpc("nfe_segredo_webhook");
  if (!segredo || req.headers.get("x-livih-focus") !== segredo) return new Response("não autorizado", { status: 401 });
  if (!corpo?.ref) return Response.json({ ok: true, ignorado: "sem ref" });

  const { data: nota } = await admin.from("notas_fiscais").select("id, org_id, emissora_id, ref, ambiente, status, consultas, modelo")
    .eq("ref", corpo.ref).maybeSingle<Nota>();
  // Nota que não é da Livih (outro sistema no mesmo CNPJ): só confirma o recebimento.
  if (!nota) return Response.json({ ok: true, ignorado: "ref desconhecida" });
  emSegundoPlano(aplicarRetorno(admin, nota, corpo as Parameters<typeof aplicarRetorno>[2])
    .catch((e) => console.error("retorno nota", nota.ref, String(e))));
  return Response.json({ ok: true });
});
