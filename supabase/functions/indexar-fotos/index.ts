// Indexa as fotos de produto da biblioteca para a identificação pela foto do cliente (migration 20261022120000,
// docs/identificar-produto-foto.md). Cada foto: a IA descreve o produto e o texto vira embedding.
//
// Chamada só pelo banco (header x-livih-segredo): o cron fotos_manutencao, a cada minuto, quando há foto na fila.
// Responde na hora e processa em segundo plano por até ~1,5 min; o que sobrar fica para o próximo minuto.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { descreverFotoCatalogo, embedding, MODELO_EMBEDDING, MODELO_VISAO } from "../_shared/fotos.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const LOTE = 8;
const EM_PARALELO = 4;
const TEMPO = 90_000; // mesma folga da importar-catalogo: o lote em andamento ainda cabe no limite da execução
// Acima disso a foto não é comparada (fotos.ts soma as fotos de uma comparação até 20 MB). O envio em massa já
// reduz as fotos; este limite pega a que entrou grande pelo cadastro de um documento só.
const LIMITE_FOTO = 10 * 1024 * 1024;

// @ts-ignore EdgeRuntime existe no runtime do Supabase
const emSegundoPlano = (tarefa: Promise<unknown>) => globalThis.EdgeRuntime?.waitUntil?.(tarefa);

type Foto = { documento_id: string; org_id: string; path: string; mime: string };

async function registrarUso(org: string, ref: string, modelo: string, entrada: number, saida: number) {
  const { error } = await admin.from("uso_ia").upsert({
    org_id: org, tipo: "foto_catalogo", modelo, tokens_entrada: entrada, tokens_saida: saida, origem_ref: ref,
  }, { onConflict: "origem_ref", ignoreDuplicates: true });
  if (error) console.error("uso_ia foto", error.message);
}

async function indexar(f: Foto) {
  const falhar = async (erro: string) => {
    const { error } = await admin.rpc("fotos_registrar", {
      p_documento: f.documento_id, p_path: f.path, p_descricao: null, p_embedding: null, p_erro: erro,
    });
    if (error) console.error("fotos_registrar", error.message);
  };
  try {
    const { data: arquivo, error } = await admin.storage.from("documentos").download(f.path);
    if (error || !arquivo) return await falhar("não foi possível abrir o arquivo");
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    if (bytes.byteLength > LIMITE_FOTO) {
      return await falhar("foto acima de 10 MB: envie uma versão menor (o envio em massa reduz sozinho)");
    }

    const { data: ligados } = await admin.from("documentos_produtos")
      .select("produtos(nome, codigo)").eq("documento_id", f.documento_id);
    const produtos = ((ligados ?? []) as unknown as { produtos: { nome: string; codigo: string | null } | null }[])
      .map((l) => l.produtos).filter((p) => !!p)
      .map((p) => `${p!.nome}${p!.codigo ? ` (código ${p!.codigo})` : ""}`);

    const d = await descreverFotoCatalogo(bytes, f.mime, produtos);
    if (!d.texto) return await falhar("a IA não descreveu a foto");
    // Ref com o path: trocar o arquivo é outra indexação, com outro consumo.
    await registrarUso(f.org_id, `foto:${f.documento_id}:${f.path}`, MODELO_VISAO, d.uso.entrada, d.uso.saida);
    const e = await embedding(d.texto);
    await registrarUso(f.org_id, `foto-emb:${f.documento_id}:${f.path}`, MODELO_EMBEDDING, e.tokens, 0);

    const { error: erroGravar } = await admin.rpc("fotos_registrar", {
      p_documento: f.documento_id, p_path: f.path, p_descricao: d.texto, p_embedding: JSON.stringify(e.vetor), p_erro: null,
    });
    if (erroGravar) console.error("fotos_registrar", erroGravar.message);
  } catch (e) {
    console.error("indexar foto", f.documento_id, String(e).slice(0, 300));
    await falhar(String(e).slice(0, 200));
  }
}

async function processar() {
  const inicio = Date.now();
  while (Date.now() - inicio < TEMPO) {
    const { data, error } = await admin.rpc("fotos_reivindicar", { p_limite: LOTE });
    if (error) return console.error("fotos_reivindicar", error.message);
    const fotos = (data ?? []) as Foto[];
    if (!fotos.length) return;
    for (let i = 0; i < fotos.length; i += EM_PARALELO) {
      await Promise.all(fotos.slice(i, i + EM_PARALELO).map(indexar));
    }
  }
}

Deno.serve(async (req) => {
  const { data: autorizado } = await admin.rpc("verificar_segredo_interno", {
    p_segredo: req.headers.get("x-livih-segredo") ?? "",
  });
  if (autorizado !== true) return new Response("não autorizado", { status: 401 });
  emSegundoPlano(processar().catch((e) => console.error("indexar-fotos", String(e))));
  return Response.json({ ok: true });
});
