// Entrada por nota: lê o PDF (DANFE) ou a foto da nota do fornecedor com a IA e devolve os dados para a revisão
// (Produtos → Entrada por nota). O XML é lido no navegador, sem passar por aqui. Nada é gravado no estoque: quem
// lança é nota_entrada_lancar, depois que dono/admin confere (migration 20261021130000, docs/entrada-por-nota.md).
//
//   { org_id, path } (arquivo no bucket notas-entrada) → { nota: NotaLida }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { base64, chamarIA, MODELO_IMPORTACAO } from "../_shared/catalogo.ts";

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

const MIME_IMAGEM: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

const TEXTO_OU_NULO = { type: ["string", "null"] };
const NUMERO_OU_NULO = { type: ["number", "null"] };
const ESQUEMA_NOTA = {
  type: "object",
  additionalProperties: false,
  required: ["eh_nota", "chave", "numero", "serie", "emissao", "emitente_cnpj", "emitente_nome", "valor_total", "itens"],
  properties: {
    eh_nota: { type: "boolean" },
    chave: TEXTO_OU_NULO,
    numero: TEXTO_OU_NULO,
    serie: TEXTO_OU_NULO,
    emissao: TEXTO_OU_NULO,
    emitente_cnpj: TEXTO_OU_NULO,
    emitente_nome: TEXTO_OU_NULO,
    valor_total: NUMERO_OU_NULO,
    itens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["codigo", "descricao", "ncm", "unidade", "quantidade", "valor_unitario", "valor_total"],
        properties: {
          codigo: TEXTO_OU_NULO,
          descricao: { type: "string" },
          ncm: TEXTO_OU_NULO,
          unidade: TEXTO_OU_NULO,
          quantidade: NUMERO_OU_NULO,
          valor_unitario: NUMERO_OU_NULO,
          valor_total: NUMERO_OU_NULO,
        },
      },
    },
  },
};

const INSTRUCAO = `Você lê uma nota fiscal de compra brasileira (DANFE da NF-e, em PDF ou foto) recebida de um fornecedor.
Devolva:
- eh_nota: false se o arquivo não for uma nota fiscal (aí o resto pode ficar vazio).
- chave: a chave de acesso (44 dígitos, só números); null se não estiver legível por inteiro.
- numero e serie da nota (só os números, sem zeros à esquerda); emissao no formato AAAA-MM-DD.
- emitente_cnpj (só números) e emitente_nome: quem EMITIU a nota (o fornecedor, no topo), não o destinatário.
- valor_total: o valor total da nota.
- itens: TODOS os produtos do quadro "Dados dos produtos/serviços", na ordem, um por linha da nota:
  codigo (código do produto como escrito), descricao, ncm (8 dígitos), unidade (UN, CX, PC, KG...),
  quantidade, valor_unitario e valor_total do item, como números (1.234,56 → 1234.56).
Copie, não invente: o que estiver ilegível fica null. Não some nem converta quantidades. Se a nota tiver várias
páginas, junte os itens de todas.`;

type Item = {
  codigo: string | null; descricao: string; ncm: string | null; unidade: string | null; quantidade: number | null;
  valor_unitario: number | null; valor_total: number | null;
};

const digitos = (t: string | null) => (t ?? "").replace(/\D/g, "");
const semZeros = (t: string | null) => digitos(t).replace(/^0+(?=\d)/, "") || null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  // deno-lint-ignore no-explicit-any
  let p: any;
  try {
    p = await req.json();
  } catch {
    return json(400, { erro: "corpo inválido" });
  }
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await admin.auth.getUser(token);
  if (!quem.user) return json(401, { erro: "Faça login de novo." });
  const orgId = String(p.org_id ?? "");
  const path = String(p.path ?? "");
  if (!orgId || !path.startsWith(`${orgId}/`)) return json(400, { erro: "Arquivo inválido." });

  const [{ data: membro }, { data: plataforma }, { data: erp }] = await Promise.all([
    admin.from("membros_org").select("papel").eq("org_id", orgId).eq("user_id", quem.user.id).eq("ativo", true).maybeSingle(),
    admin.from("admins_plataforma").select("user_id").eq("user_id", quem.user.id).maybeSingle(),
    admin.rpc("modulo_ativo", { p_org: orgId, p_modulo: "erp" }),
  ]);
  if (!plataforma && membro?.papel !== "dono" && membro?.papel !== "admin") {
    return json(403, { erro: "Só o dono e os administradores lançam notas." });
  }
  if (!erp) return json(403, { erro: "Esta empresa não usa o cadastro de produtos." });

  const { data: arquivo, error } = await admin.storage.from("notas-entrada").download(path);
  if (error || !arquivo) return json(400, { erro: "Não foi possível abrir o arquivo enviado." });
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const pdf = ext === "pdf";
  const conteudo = pdf
    ? { type: "input_file", filename: "nota.pdf", file_data: `data:application/pdf;base64,${base64(bytes)}` }
    : { type: "input_image", image_url: `data:${MIME_IMAGEM[ext] ?? "image/jpeg"};base64,${base64(bytes)}` };

  let lido;
  try {
    lido = await chamarIA([{ type: "input_text", text: INSTRUCAO }, conteudo], ESQUEMA_NOTA, "nota", 32_000);
  } catch (e) {
    console.error("ler-nota", String(e).slice(0, 300));
    return json(502, { erro: "A IA não conseguiu ler a nota. Tente de novo ou use o XML." });
  }
  const { dados, uso } = lido;

  const { error: erroUso } = await admin.from("uso_ia").insert({
    org_id: orgId, tipo: "nota", modelo: MODELO_IMPORTACAO, chamadas: uso.chamadas, tokens_entrada: uso.entrada,
    tokens_saida: uso.saida, origem_ref: `nota:${crypto.randomUUID()}`,
  });
  if (erroUso) console.error("uso_ia nota", erroUso.message);

  if (!dados?.eh_nota) return json(422, { erro: "Não parece uma nota fiscal. Confira o arquivo." });
  const chave = digitos(dados.chave);
  const cnpj = digitos(dados.emitente_cnpj);
  const itens = ((dados.itens ?? []) as Item[]).filter((i) => i.descricao?.trim());
  return json(200, {
    nota: {
      origem: pdf ? "pdf" : "imagem",
      chave: chave.length === 44 ? chave : null,
      numero: semZeros(dados.numero),
      serie: semZeros(dados.serie),
      emissao: /^\d{4}-\d{2}-\d{2}$/.test(dados.emissao ?? "") ? dados.emissao : null,
      emitente_cnpj: cnpj.length === 14 || cnpj.length === 11 ? cnpj : null,
      emitente_nome: dados.emitente_nome?.trim() || null,
      valor_total: dados.valor_total,
      itens: itens.map((i) => ({
        codigo: i.codigo?.trim() || null,
        descricao: i.descricao.trim(),
        ncm: /^\d{8}$/.test(digitos(i.ncm)) ? digitos(i.ncm) : null,
        unidade: i.unidade?.trim() || null,
        quantidade: i.quantidade,
        valor_unitario: i.valor_unitario,
        valor_total: i.valor_total,
      })),
    },
  });
});
