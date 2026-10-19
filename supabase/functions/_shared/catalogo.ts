// Importador de catálogo (docs/importador-catalogo.md): monta os blocos do arquivo, pede à IA os produtos de cada
// bloco e limpa o resultado no formato da importação de planilha da tela (DadosProduto).
//
// A IA só lê e copia; preço, unidade e duplicados são tratados aqui, sem IA. Excel não passa linha a linha pela IA:
// ela só diz quais colunas são o quê, e a conversão é feita aqui (exata e barata em planilha grande).

import { PDFDocument } from "npm:pdf-lib@1.17.1";
import * as XLSX from "npm:xlsx@0.18.5";

export const MODELO_IMPORTACAO = "gpt-5-mini";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
// Blocos pequenos: com 15 mil caracteres (~50-70 itens), a IA devolvia só parte dos itens de seções densas, sem
// erro (teste com a base da JoGrampo, 19/10: famílias 14, 80, 90 e 92 sumiram). ~25 itens por chamada.
export const PAGINAS_POR_BLOCO = 2;
export const LIMITE_PAGINAS = 100;
const CARACTERES_POR_BLOCO = 6_000;

export type Origem = "pdf" | "imagem" | "texto" | "planilha";
export type Bloco =
  | { tipo: "pdf"; paginaInicial: number; dados: Uint8Array }
  | { tipo: "imagem"; mime: string; dados: Uint8Array }
  | { tipo: "texto"; texto: string; paginaInicial: null };
export type ItemBruto = {
  codigo: string | null; nome: string; unidade: string | null; preco: string | null; detalhes: string | null;
  categoria: string | null; marca: string | null; ncm: string | null; pagina: number | null;
};
export type Linha = {
  codigo: string | null; nome: string; unidade: string; preco?: number; descricao: string | null;
  categoria: string | null; marca: string | null; ncm: string | null;
};
export type Uso = { chamadas: number; entrada: number; saida: number };

// ---------------------------------------------------------------- blocos

export async function blocosPdf(bytes: Uint8Array): Promise<{ blocos: Bloco[]; paginas: number }> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const paginas = doc.getPageCount();
  const blocos: Bloco[] = [];
  for (let i = 0; i < Math.min(paginas, LIMITE_PAGINAS); i += PAGINAS_POR_BLOCO) {
    const novo = await PDFDocument.create();
    const idx = Array.from({ length: Math.min(PAGINAS_POR_BLOCO, paginas - i) }, (_, k) => i + k);
    (await novo.copyPages(doc, idx)).forEach((p) => novo.addPage(p));
    blocos.push({ tipo: "pdf", paginaInicial: i + 1, dados: new Uint8Array(await novo.save()) });
  }
  return { blocos, paginas };
}

/**
 * Texto em blocos de ~6 mil caracteres, cortando ENTRE produtos (linha em branco): um produto ocupa várias linhas
 * (nome, unidade, preço) e o corte no meio deixava o nome num bloco e o preço no outro, e o preço solto ia para o
 * produto errado (teste de 19/10). Parágrafo maior que o bloco é cortado em fim de linha.
 */
export function blocosTexto(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  let atual = "";
  const fechar = () => {
    if (atual.trim()) blocos.push({ tipo: "texto", texto: atual, paginaInicial: null });
    atual = "";
  };
  for (const paragrafo of texto.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    if (atual.length + paragrafo.length + 2 > CARACTERES_POR_BLOCO) fechar();
    if (paragrafo.length + 2 <= CARACTERES_POR_BLOCO) {
      atual += paragrafo + "\n\n";
      continue;
    }
    for (const linha of paragrafo.split("\n")) {
      if (atual.length + linha.length + 1 > CARACTERES_POR_BLOCO) fechar();
      atual += linha.slice(0, CARACTERES_POR_BLOCO) + "\n";
    }
  }
  fechar();
  return blocos;
}

// ---------------------------------------------------------------- IA

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const TEXTO_OU_NULO = { type: ["string", "null"] };
const ESQUEMA_PRODUTOS = {
  type: "object",
  additionalProperties: false,
  required: ["produtos"],
  properties: {
    produtos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["codigo", "nome", "unidade", "preco", "detalhes", "categoria", "marca", "ncm", "pagina"],
        properties: {
          codigo: TEXTO_OU_NULO, nome: { type: "string" }, unidade: TEXTO_OU_NULO, preco: TEXTO_OU_NULO,
          detalhes: TEXTO_OU_NULO, categoria: TEXTO_OU_NULO, marca: TEXTO_OU_NULO, ncm: TEXTO_OU_NULO,
          pagina: { type: ["integer", "null"] },
        },
      },
    },
  },
};

const INSTRUCAO = `Você extrai produtos de um catálogo ou tabela de preços de uma empresa brasileira, para cadastro.
Para CADA produto (ou cada variação com código ou preço próprio), devolva:
- codigo: o código/referência exatamente como escrito; null se não houver.
- nome: o nome do produto como aparece, com modelo e medida (ex.: "Grampo 14/19 galvanizado"). Se o item só tem a medida e o nome está no título da seção, junte os dois.
- unidade: a unidade de venda se estiver indicada (cx, un, pç, kg, m, rolo, pct); null se não estiver.
- preco: o preço unitário EXATAMENTE como escrito (ex.: "R$ 1.027,00"); null se não houver. Não calcule nem converta. Se houver preços por faixa de quantidade, use o da menor quantidade e ponha os outros em detalhes.
- detalhes: embalagem, quantidade por caixa e especificações curtas que ajudem a vender; null se não houver.
- categoria: o título da seção ou família onde o produto está; null se não houver.
- marca: o fabricante, se indicado; null se não.
- ncm: o NCM (8 dígitos), se houver; null se não.
- pagina: o número da página DENTRO deste trecho (1 = primeira página enviada); null se for texto.
Extraia TODOS os produtos do trecho, um por um, do primeiro ao último, mesmo que sejam muitos e parecidos (ex.: as medidas 14/19, 14/22, 14/25... são produtos separados). Não resuma, não agrupe e não pule nenhum.
Regras: copie, não invente; o que estiver ilegível fica null. Ignore cabeçalhos, rodapés, contatos, condições comerciais e textos de propaganda. Não repita o mesmo produto.`;

async function chamarIA(conteudo: unknown[], esquema: unknown, nome: string, maxSaida: number) {
  if (!OPENAI_API_KEY) throw new Error("IA indisponível (configuração do servidor)");
  let ultimoErro = "";
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO_IMPORTACAO,
        reasoning: { effort: "low" },
        max_output_tokens: maxSaida,
        input: [{ role: "user", content: conteudo }],
        text: { format: { type: "json_schema", name: nome, schema: esquema, strict: true } },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
      ultimoErro = `IA ${r.status}: ${JSON.stringify(corpo?.error ?? corpo).slice(0, 200)}`;
      continue;
    }
    const texto = (corpo?.output ?? [])
      .flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? [])
      .filter((c: { type: string }) => c.type === "output_text")
      .map((c: { text?: string }) => c.text ?? "")
      .join("");
    try {
      return {
        dados: JSON.parse(texto),
        uso: { chamadas: 1, entrada: Number(corpo?.usage?.input_tokens ?? 0), saida: Number(corpo?.usage?.output_tokens ?? 0) },
      };
    } catch {
      ultimoErro = `resposta da IA incompleta (status ${corpo?.status ?? "?"})`;
    }
  }
  throw new Error(ultimoErro);
}

/** Produtos de um bloco, com a página já convertida para a do arquivo inteiro. */
export async function extrairBloco(b: Bloco): Promise<{ itens: ItemBruto[]; uso: Uso }> {
  const arquivo = b.tipo === "pdf"
    ? { type: "input_file", filename: "catalogo.pdf", file_data: `data:application/pdf;base64,${base64(b.dados)}` }
    : b.tipo === "imagem"
    ? { type: "input_image", image_url: `data:${b.mime};base64,${base64(b.dados)}` }
    : { type: "input_text", text: `TRECHO DO CATÁLOGO:\n\n${b.texto}` };
  const { dados, uso } = await chamarIA([{ type: "input_text", text: INSTRUCAO }, arquivo], ESQUEMA_PRODUTOS, "produtos", 32_000);
  const itens: ItemBruto[] = (dados?.produtos ?? []).map((p: ItemBruto) => ({
    ...p,
    pagina: b.tipo === "pdf" && p.pagina ? b.paginaInicial + p.pagina - 1 : b.tipo === "imagem" ? 1 : null,
  }));
  return { itens, uso };
}

// ---------------------------------------------------------------- planilha

const ESQUEMA_COLUNAS = {
  type: "object",
  additionalProperties: false,
  required: ["linha_cabecalho", "codigo", "nome", "unidade", "preco", "detalhes", "categoria", "marca", "ncm"],
  properties: Object.fromEntries([
    ["linha_cabecalho", { type: "integer" }],
    ...["codigo", "nome", "unidade", "preco", "detalhes", "categoria", "marca", "ncm"].map((k) => [k, { type: ["integer", "null"] }]),
  ]),
};

const INSTRUCAO_COLUNAS = `Esta é uma amostra de uma aba de planilha de produtos de uma empresa brasileira. As linhas estão numeradas a partir de 0 e as colunas também (A=0, B=1...).
Diga em que linha está o cabeçalho (a linha com os nomes das colunas; 0 se for a primeira; -1 se não houver cabeçalho) e o número da coluna de cada campo, ou null se não existir:
codigo (código/referência/SKU), nome (descrição/produto), unidade (un, cx...), preco (preço de VENDA unitário; se houver custo e venda, escolha venda), detalhes (embalagem, especificação, observação), categoria (família/grupo/linha), marca (fabricante/fornecedor), ncm.
Se a aba não tiver produtos, devolva nome = null.`;

/** Cada aba: a IA mapeia as colunas pela amostra; as linhas são convertidas aqui. */
export async function extrairPlanilha(bytes: Uint8Array): Promise<{ itens: ItemBruto[]; uso: Uso; abas: number }> {
  const livro = XLSX.read(bytes, { type: "array" });
  const itens: ItemBruto[] = [];
  const uso: Uso = { chamadas: 0, entrada: 0, saida: 0 };
  let abas = 0;
  for (const nomeAba of livro.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(livro.Sheets[nomeAba], { header: 1, raw: false, defval: "" })
      .map((l) => (l as unknown[]).map((c) => String(c ?? "").trim()));
    if (!linhas.some((l) => l.some(Boolean))) continue;
    const amostra = linhas.slice(0, 25).map((l, i) => `${i}: ${l.map((c) => c.slice(0, 60)).join(" | ")}`).join("\n");
    const { dados: m, uso: u } = await chamarIA(
      [{ type: "input_text", text: `${INSTRUCAO_COLUNAS}\n\nAba "${nomeAba}":\n${amostra}` }], ESQUEMA_COLUNAS, "colunas", 4_000,
    );
    uso.chamadas += u.chamadas;
    uso.entrada += u.entrada;
    uso.saida += u.saida;
    if (m?.nome == null) continue;
    abas++;
    const col = (l: string[], k: string) => (m[k] == null ? null : (l[m[k]] ?? "").trim() || null);
    for (const l of linhas.slice(Math.max(0, Number(m.linha_cabecalho) + 1))) {
      const nome = col(l, "nome");
      if (!nome) continue;
      itens.push({
        codigo: col(l, "codigo"), nome, unidade: col(l, "unidade"), preco: col(l, "preco"), detalhes: col(l, "detalhes"),
        categoria: col(l, "categoria"), marca: col(l, "marca"), ncm: col(l, "ncm"), pagina: null,
      });
    }
  }
  return { itens, uso, abas };
}

// ---------------------------------------------------------------- limpeza

/** "R$ 1.027,00" → 1027; "1,027.50" → 1027.5; "102,7" → 102.7. Nulo se não for número. */
export function lerPreco(t: string | null): number | null {
  if (!t) return null;
  let s = t.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  const virgula = s.lastIndexOf(",");
  const ponto = s.lastIndexOf(".");
  if (virgula > -1 && ponto > -1) {
    s = virgula > ponto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (virgula > -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (ponto > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // 1.027 = mil e vinte e sete
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

const UNIDADES: Record<string, string> = {
  un: "un", und: "un", unid: "un", unidade: "un", u: "un", unidades: "un",
  cx: "cx", caixa: "cx", caixinha: "cx", caixas: "cx",
  pc: "pç", pç: "pç", peca: "pç", peça: "pç", pecas: "pç", peças: "pç",
  kg: "kg", quilo: "kg", m: "m", mt: "m", metro: "m", metros: "m",
  rolo: "rolo", rl: "rolo", pct: "pct", pacote: "pct", par: "par", jg: "jogo", jogo: "jogo", cj: "cj", conjunto: "cj",
};
export function lerUnidade(t: string | null): string {
  const s = (t ?? "").trim().toLowerCase().replace(/\.$/, "");
  return UNIDADES[s] ?? (s ? s.slice(0, 10) : "un");
}

/** Junta os blocos: limpa, corta nos tamanhos do cadastro e une duplicados (o primeiro vence; vazios se completam). */
export function limpar(itens: ItemBruto[], modoPreco: "venda" | "sem_preco"): { linhas: Linha[]; paginas: (number | null)[] } {
  const porChave = new Map<string, { linha: Linha; pagina: number | null }>();
  const ordem: string[] = [];
  for (const i of itens) {
    const nome = (i.nome ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    // A IA às vezes preenche com "(sem nome legível)" em vez de deixar de fora.
    if (!nome || /^\(?\s*(sem nome|ileg[ií]vel|n[ãa]o identificado)/i.test(nome)) continue;
    const codigo = (i.codigo ?? "").trim().slice(0, 60) || null;
    const preco = lerPreco(i.preco);
    const ncm = (i.ncm ?? "").replace(/\D/g, "");
    const linha: Linha = {
      codigo, nome, unidade: lerUnidade(i.unidade),
      ...(modoPreco === "venda" && preco != null ? { preco } : {}),
      descricao: (i.detalhes ?? "").trim().slice(0, 2000) || null,
      categoria: (i.categoria ?? "").trim().slice(0, 100) || null,
      marca: (i.marca ?? "").trim().slice(0, 100) || null,
      ncm: ncm.length === 8 ? ncm : null,
    };
    // Mesmo produto = mesmo código E mesmo nome. Só o código não basta: "código da tabela" se repete entre
    // fornecedores (4.003 é alicate na MTX e grampeador na IMECO) e era descartado como duplicado (teste de 19/10).
    const chave = `${(codigo ?? "").toLowerCase()}|${nome.toLowerCase()}`;
    const ja = porChave.get(chave);
    if (!ja) {
      porChave.set(chave, { linha, pagina: i.pagina ?? null });
      ordem.push(chave);
    } else {
      for (const k of Object.keys(linha) as (keyof Linha)[]) {
        // deno-lint-ignore no-explicit-any
        if ((ja.linha as any)[k] == null && linha[k] != null) (ja.linha as any)[k] = linha[k];
      }
    }
  }
  const todos = ordem.map((k) => porChave.get(k)!);

  // Código repetido em produtos diferentes: com marcas diferentes, o código ganha a marca na frente ("IMECO 4.003"),
  // porque o cadastro aceita um produto por código. O que sobrar repetido a tela avisa.
  const porCodigo = new Map<string, Linha[]>();
  for (const { linha } of todos) {
    if (linha.codigo) porCodigo.set(linha.codigo.toLowerCase(), [...(porCodigo.get(linha.codigo.toLowerCase()) ?? []), linha]);
  }
  for (const grupo of porCodigo.values()) {
    const marcas = new Set(grupo.map((l) => (l.marca ?? "").toLowerCase()));
    if (grupo.length < 2 || marcas.size < 2) continue;
    for (const l of grupo) {
      const marca = (l.marca ?? "").split("/")[0].trim().toUpperCase();
      if (marca) l.codigo = `${marca} ${l.codigo}`.slice(0, 60);
    }
  }
  return { linhas: todos.map((t) => t.linha), paginas: todos.map((t) => t.pagina) };
}
