// Importador de catálogo com IA: Produtos → Importar → PDF, Excel, foto ou texto (docs/importador-catalogo.md).
//
// A tela sobe o arquivo no bucket `importacoes` (ou manda o texto) e chama esta função, que cria a importação e
// processa em segundo plano; a tela acompanha pela tabela importacoes_catalogo e, no fim, mostra a prévia.
//
//   { org_id, origem: 'pdf'|'imagem'|'planilha'|'texto', path?, texto?, nome?, modo_preco: 'venda'|'sem_preco' } → { id }
//
// Catálogo grande passa do tempo de uma execução: perto de 90 s a função guarda onde parou e chama a si mesma com
// { continuar: id } (só com a chave de serviço), até terminar.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  type Bloco, blocosPdf, blocosTexto, extrairBloco, extrairPlanilha, type ItemBruto, LIMITE_PAGINAS, limpar,
  MODELO_IMPORTACAO, type Origem, PAGINAS_POR_BLOCO, type Uso,
} from "../_shared/catalogo.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false } });
const LIMITE_DIA = 5;
const TEMPO_POR_EXECUCAO = 90_000;
const EM_PARALELO = 4;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Estado = { itens: ItemBruto[]; proximo: number; uso: Uso; falhas: string[]; avisos: string[] };
type Importacao = {
  id: string; org_id: string; origem: Origem; path: string; nome: string | null; modo_preco: "venda" | "sem_preco";
  status: string; resultado: Estado | null;
};

// Segundo plano no runtime do Supabase (mesmo jeito do _shared/atendimento.ts).
// @ts-ignore EdgeRuntime existe no runtime do Supabase
const emSegundoPlano = (tarefa: Promise<unknown>) => globalThis.EdgeRuntime?.waitUntil?.(tarefa);

const MIME_IMAGEM: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

async function atualizar(id: string, campos: Record<string, unknown>) {
  const { error } = await admin.from("importacoes_catalogo").update(campos).eq("id", id);
  if (error) console.error("importacao update", error.message);
}

async function concluir(imp: Importacao, estado: Estado) {
  const { linhas, paginas } = limpar(estado.itens, imp.modo_preco);
  await atualizar(imp.id, {
    status: "pronto",
    resultado: { linhas, paginas, falhas: estado.falhas, avisos: estado.avisos },
  });
  if (estado.uso.chamadas) {
    const { error } = await admin.from("uso_ia").upsert({
      org_id: imp.org_id, tipo: "importacao", modelo: MODELO_IMPORTACAO, chamadas: estado.uso.chamadas,
      tokens_entrada: estado.uso.entrada, tokens_saida: estado.uso.saida, origem_ref: `importacao:${imp.id}`,
    }, { onConflict: "origem_ref", ignoreDuplicates: true });
    if (error) console.error("uso_ia importacao", error.message);
  }
}

async function processar(id: string) {
  const inicio = Date.now();
  const { data: imp } = await admin.from("importacoes_catalogo").select("*").eq("id", id).maybeSingle<Importacao>();
  if (!imp || imp.status === "pronto" || imp.status === "erro") return;
  try {
    const { data: arquivo, error } = await admin.storage.from("importacoes").download(imp.path);
    if (error || !arquivo) throw new Error("não foi possível abrir o arquivo enviado");
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const estado: Estado = imp.resultado ?? { itens: [], proximo: 0, uso: { chamadas: 0, entrada: 0, saida: 0 }, falhas: [], avisos: [] };

    if (imp.origem === "planilha") {
      await atualizar(id, { status: "lendo", total: 1 });
      const r = await extrairPlanilha(bytes);
      if (!r.abas) throw new Error("não encontrei produtos na planilha (nenhuma aba com coluna de nome ou descrição)");
      await concluir(imp, { ...estado, itens: r.itens, uso: r.uso, proximo: 1 });
      return;
    }

    let blocos: Bloco[];
    if (imp.origem === "pdf") {
      const r = await blocosPdf(bytes);
      blocos = r.blocos;
      if (r.paginas > LIMITE_PAGINAS && !estado.avisos.length) {
        estado.avisos.push(`O arquivo tem ${r.paginas} páginas: só as primeiras ${LIMITE_PAGINAS} foram lidas.`);
      }
    } else if (imp.origem === "imagem") {
      const ext = imp.path.split(".").pop()?.toLowerCase() ?? "";
      blocos = [{ tipo: "imagem", mime: MIME_IMAGEM[ext] ?? arquivo.type ?? "image/jpeg", dados: bytes }];
    } else {
      blocos = blocosTexto(new TextDecoder().decode(bytes));
    }
    if (!blocos.length) throw new Error("o arquivo está vazio");
    await atualizar(id, { status: "lendo", total: blocos.length, progresso: estado.proximo });

    while (estado.proximo < blocos.length) {
      const lote = blocos.slice(estado.proximo, estado.proximo + EM_PARALELO);
      const res = await Promise.allSettled(lote.map(extrairBloco));
      res.forEach((r, k) => {
        if (r.status === "fulfilled") {
          estado.itens.push(...r.value.itens);
          estado.uso.chamadas += r.value.uso.chamadas;
          estado.uso.entrada += r.value.uso.entrada;
          estado.uso.saida += r.value.uso.saida;
        } else {
          const b = lote[k];
          console.error("bloco", estado.proximo + k, String(r.reason).slice(0, 300));
          estado.falhas.push(b.tipo === "pdf"
            ? `Páginas ${b.paginaInicial} a ${b.paginaInicial + PAGINAS_POR_BLOCO - 1} não foram lidas.`
            : `O trecho ${estado.proximo + k + 1} não foi lido.`);
        }
      });
      estado.proximo += lote.length;
      await atualizar(id, { progresso: estado.proximo, resultado: estado });

      if (estado.proximo < blocos.length && Date.now() - inicio > TEMPO_POR_EXECUCAO) {
        // Continua numa execução nova (responde na hora; o trabalho segue em segundo plano lá).
        const r = await fetch(`${URL_SUPABASE}/functions/v1/importar-catalogo`, {
          method: "POST",
          headers: { Authorization: `Bearer ${CHAVE_SERVICO}`, "Content-Type": "application/json" },
          body: JSON.stringify({ continuar: id }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!r.ok) throw new Error(`não foi possível continuar a leitura (${r.status})`);
        return;
      }
    }
    if (!estado.itens.length && estado.falhas.length) throw new Error("a IA não conseguiu ler o arquivo. Tente de novo.");
    await concluir(imp, estado);
  } catch (e) {
    console.error("importacao", id, String(e).slice(0, 300));
    await atualizar(id, { status: "erro", erro: String((e as Error).message ?? e).slice(0, 300) });
  }
}

/**
 * Chave de serviço em qualquer formato (JWT antiga ou sb_secret_): a variável do runtime pode estar num formato e
 * quem chama no outro. Confirma tentando algo que só a chave de serviço faz.
 */
async function ehChaveServico(token: string): Promise<boolean> {
  if (!token) return false;
  if (token === CHAVE_SERVICO) return true;
  if (token.split(".").length !== 3 && !token.startsWith("sb_secret_")) return false;
  const teste = createClient(URL_SUPABASE, token, { auth: { persistSession: false } });
  const { error } = await teste.auth.admin.listUsers({ page: 1, perPage: 1 });
  return !error;
}

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
  const servico = await ehChaveServico(token);

  if (p.continuar) {
    if (!servico) return json(403, { erro: "sem acesso" });
    emSegundoPlano(processar(String(p.continuar)));
    return json(202, { ok: true });
  }

  let userId: string | null = null;
  if (!servico) {
    const { data: quem } = await admin.auth.getUser(token);
    if (!quem.user) return json(401, { erro: "Faça login de novo." });
    userId = quem.user.id;
  }
  const origem = p.origem as Origem;
  if (!p.org_id || !["pdf", "imagem", "planilha", "texto"].includes(origem) || !["venda", "sem_preco"].includes(p.modo_preco)) {
    return json(400, { erro: "pedido inválido" });
  }

  if (userId) {
    const [{ data: membro }, { data: plataforma }] = await Promise.all([
      admin.from("membros_org").select("papel").eq("org_id", p.org_id).eq("user_id", userId).eq("ativo", true).maybeSingle(),
      admin.from("admins_plataforma").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);
    if (!plataforma && membro?.papel !== "dono" && membro?.papel !== "admin") {
      return json(403, { erro: "Só o dono e os administradores importam produtos." });
    }
    const { count } = await admin.from("importacoes_catalogo").select("id", { count: "exact", head: true })
      .eq("org_id", p.org_id).gte("criado_em", new Date(Date.now() - 864e5).toISOString());
    if ((count ?? 0) >= LIMITE_DIA) return json(429, { erro: `Limite de ${LIMITE_DIA} importações por dia atingido. Tente amanhã.` });
  }
  const { data: erp } = await admin.rpc("modulo_ativo", { p_org: p.org_id, p_modulo: "erp" });
  if (!erp) return json(403, { erro: "Esta empresa não usa o cadastro de produtos." });

  // Texto colado vira arquivo também: a continuação relê sempre do mesmo lugar.
  let path: string = p.path ?? "";
  if (origem === "texto") {
    const texto = String(p.texto ?? "").trim();
    if (!texto) return json(400, { erro: "Cole o texto do catálogo." });
    path = `${p.org_id}/${crypto.randomUUID()}-texto.txt`;
    const { error } = await admin.storage.from("importacoes").upload(path, new Blob([texto], { type: "text/plain" }));
    if (error) return json(500, { erro: "Não foi possível guardar o texto. Tente de novo." });
  } else if (!path.startsWith(`${p.org_id}/`)) {
    return json(400, { erro: "Arquivo inválido." });
  }

  const { data: imp, error } = await admin.from("importacoes_catalogo").insert({
    org_id: p.org_id, criado_por: userId, origem, path, nome: String(p.nome ?? "").slice(0, 200) || null,
    modo_preco: p.modo_preco, status: "na_fila",
  }).select("id").single();
  if (error || !imp) {
    console.error("importacao insert", error?.message);
    return json(500, { erro: "Não foi possível começar a importação. Tente de novo." });
  }
  emSegundoPlano(processar(imp.id));
  return json(200, { id: imp.id });
});
