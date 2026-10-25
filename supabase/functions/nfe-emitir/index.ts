// NF-e pela Focus NFe, entrega 2 (docs/nfe.md): emite a nota de um pedido (de qualquer canal).
//
//   { pedido_id, emissora_id?, forma_pagamento?, a_prazo?, presenca?, informacoes? } → { nota } | { erro, faltando[] }
//
// Quem pode: dono, admin e quem tem "Emite nota fiscal", para pedido que a pessoa vê (a RLS do pedido, lida com o
// login dela). Antes de enviar, confere o que falta (cliente sem CNPJ/CPF ou endereço, produto sem NCM, CNPJ sem
// certificado) e devolve a lista. A nota nasce "processando"; o resultado vem pelo gatilho da Focus (nfe-retorno).
//
// Primeira versão: Simples Nacional e MEI (CSOSN 102, 103, 300 e 400), sem substituição tributária nem DIFAL.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { type Ambiente, aplicarRetorno, BASE, basic, mensagemFocus, type Nota, tokenDoCnpj } from "../_shared/focus.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const CSOSN_ACEITOS = ["102", "103", "300", "400"];
const CST_SEM_VALOR = ["04", "05", "06", "07", "08", "09"];
const CST_ZERADO = ["49", "99"];
const FORMAS = ["01", "02", "03", "04", "05", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "90", "99"];
const HOMOLOGACAO = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

const so = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Divide um valor entre os itens na proporção do valor de cada um; o centavo que sobra vai para o último. */
function ratear(total: number, bases: number[]): number[] {
  const soma = bases.reduce((a, b) => a + b, 0);
  if (!total || !soma) return bases.map(() => 0);
  const partes = bases.map((b) => r2((total * b) / soma));
  partes[partes.length - 1] = r2(partes[partes.length - 1] + total - partes.reduce((a, b) => a + b, 0));
  return partes;
}

/** Data e hora de Brasília com fuso (formato da SEFAZ). */
function agoraBrasilia() {
  const d = new Date(Date.now() - 3 * 3600_000);
  return `${d.toISOString().slice(0, 19)}-03:00`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  let p: { pedido_id?: string; emissora_id?: string; forma_pagamento?: string; a_prazo?: boolean; presenca?: number; informacoes?: string };
  try {
    p = await req.json();
  } catch {
    return json(400, { erro: "corpo inválido" });
  }
  const autorizacao = req.headers.get("Authorization") ?? "";
  const { data: quem } = await admin.auth.getUser(autorizacao.replace(/^Bearer\s+/i, ""));
  if (!quem.user) return json(401, { erro: "Faça login de novo." });
  if (!p.pedido_id) return json(400, { erro: "pedido_id obrigatório" });

  // Com o login da pessoa: só pedido que ela vê, e só se ela emite nota nessa empresa.
  const comoUsuario = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false }, global: { headers: { Authorization: autorizacao } },
  });
  const { data: visivel } = await comoUsuario.from("pedidos").select("id, org_id").eq("id", p.pedido_id).maybeSingle();
  if (!visivel) return json(404, { erro: "Pedido não encontrado." });
  const { data: pode } = await comoUsuario.rpc("emite_nota_fiscal", { p_org: visivel.org_id });
  if (pode !== true) return json(403, { erro: "Você não tem a permissão \"Emite nota fiscal\". Peça ao dono ou ao admin." });

  const [{ data: ped }, { data: itens }, { data: viva }] = await Promise.all([
    admin.from("pedidos").select("*").eq("id", p.pedido_id).single(),
    admin.from("pedido_itens").select("*").eq("pedido_id", p.pedido_id).order("ordem"),
    admin.from("notas_fiscais").select("id, status").eq("pedido_id", p.pedido_id).in("status", ["processando", "autorizada"]).maybeSingle(),
  ]);
  if (!ped) return json(404, { erro: "Pedido não encontrado." });
  if (viva) return json(409, { erro: viva.status === "autorizada" ? "Este pedido já tem nota autorizada." : "A nota deste pedido já está sendo processada." });

  const emissoraId = p.emissora_id || ped.emissora_id;
  const idsProdutos = (itens ?? []).map((i) => i.produto_id).filter(Boolean) as string[];
  const [{ data: emi }, { data: produtos }, { data: cli }, { data: ct }] = await Promise.all([
    emissoraId
      ? admin.from("emissoras").select("*").eq("id", emissoraId).eq("org_id", ped.org_id).maybeSingle()
      : admin.from("emissoras").select("*").eq("org_id", ped.org_id).eq("padrao", true).maybeSingle(),
    idsProdutos.length ? admin.from("produtos").select("id, codigo, ncm, cest, origem, unidade").in("id", idsProdutos) : { data: [] },
    ped.cliente_id ? admin.from("clientes").select("*").eq("id", ped.cliente_id).maybeSingle() : { data: null },
    ped.contato_id ? admin.from("contatos").select("email, telefone").eq("id", ped.contato_id).maybeSingle() : { data: null },
  ]);

  // ---- o que falta ----
  const faltando: string[] = [];
  if (ped.status === "rascunho") faltando.push("Confirme o pedido antes de emitir a nota.");
  if (ped.status === "cancelado") faltando.push("O pedido está cancelado.");
  if (!emi) faltando.push("Escolha o CNPJ que emite (Configurações → Empresa).");
  else {
    if (emi.nfe_status !== "pronta") faltando.push(`O CNPJ ${emi.nome_fantasia || emi.razao_social} não está pronto na Focus (Configurações → Empresa → Nota fiscal).`);
    // A NF-e exige a IE do emitente: números, ou ISENTO quando a empresa é dispensada (caso F7, 25/10: rejeição de schema).
    if (!so(emi.inscricao_estadual) && !/isent/i.test(emi.inscricao_estadual ?? "")) {
      faltando.push(`Informe a inscrição estadual do CNPJ ${emi.nome_fantasia || emi.razao_social} (ou ISENTO, se a empresa for dispensada) em Configurações → Empresa → Editar.`);
    }
    if (emi.regime_tributario === 3) faltando.push("Regime normal (Presumido/Real) ainda não é emitido por esta versão: use o Simples ou fale com o suporte.");
    if (!emi.cfop_estadual || !emi.cfop_interestadual) faltando.push("Informe os CFOPs na configuração da nota fiscal do CNPJ.");
    if (!emi.icms_situacao || !CSOSN_ACEITOS.includes(emi.icms_situacao)) faltando.push(`CSOSN do ICMS: esta versão emite com ${CSOSN_ACEITOS.join(", ")} (configuração do CNPJ).`);
    for (const [nome, cst] of [["PIS", emi.pis_situacao], ["COFINS", emi.cofins_situacao]] as const) {
      if (!cst || ![...CST_SEM_VALOR, ...CST_ZERADO].includes(cst)) faltando.push(`CST do ${nome}: esta versão emite com ${[...CST_SEM_VALOR, ...CST_ZERADO].join(", ")} (configuração do CNPJ).`);
    }
  }
  if (!cli) faltando.push("Ligue o pedido a um cliente do cadastro (com CNPJ/CPF e endereço).");
  else {
    if (!cli.documento) faltando.push(`O cliente ${cli.nome} não tem CNPJ/CPF no cadastro.`);
    const end = [["CEP", cli.cep], ["rua", cli.logradouro], ["número", cli.numero], ["bairro", cli.bairro], ["cidade", cli.cidade], ["UF", cli.uf]]
      .filter(([, v]) => !v).map(([n]) => n);
    if (end.length) faltando.push(`Endereço do cliente ${cli.nome}: falta ${end.join(", ")}.`);
  }
  const porId = new Map((produtos ?? []).map((x) => [x.id, x]));
  if (!(itens ?? []).length) faltando.push("O pedido não tem itens.");
  (itens ?? []).forEach((i, n) => {
    const pr = i.produto_id ? porId.get(i.produto_id) : null;
    if (!pr) faltando.push(`Item ${n + 1} (${i.descricao}): não é um produto do cadastro (a nota precisa do NCM).`);
    else if (!/^\d{8}$/.test(pr.ncm ?? "")) faltando.push(`Produto ${i.descricao}: falta o NCM (8 números) no cadastro.`);
    if (!(Number(i.quantidade) > 0) || !(Number(i.preco_unitario) > 0)) faltando.push(`Item ${n + 1} (${i.descricao}): quantidade e preço precisam ser maiores que zero.`);
  });
  const forma = p.forma_pagamento && FORMAS.includes(p.forma_pagamento) ? p.forma_pagamento : "99";
  if (faltando.length) return json(422, { erro: "Falta arrumar antes de emitir:", faltando });

  const ambiente = emi!.nfe_ambiente as Ambiente;
  const token = await tokenDoCnpj(admin, emi!.id, ambiente);
  if (!token) return json(422, { erro: "O CNPJ ainda não tem o acesso da Focus para este ambiente. Salve a configuração da nota fiscal de novo." });

  // ---- monta a nota ----
  const interna = (emi!.uf ?? "") === (cli!.uf ?? "");
  const cfop = interna ? emi!.cfop_estadual! : emi!.cfop_interestadual!;
  const ieCli = so(cli!.inscricao_estadual);
  const indicadorIe = cli!.tipo === "pf" ? 9 : ieCli ? 1 : /isent/i.test(cli!.inscricao_estadual ?? "") ? 2 : 9;
  const brutos = (itens ?? []).map((i) => r2(Number(i.quantidade) * Number(i.preco_unitario)));
  const descontos = ratear(Number(ped.desconto) || 0, brutos);
  const fretes = ratear(Number(ped.frete) || 0, brutos);
  const valorProdutos = r2(brutos.reduce((a, b) => a + b, 0));
  const valorTotal = r2(valorProdutos - (Number(ped.desconto) || 0) + (Number(ped.frete) || 0));
  const zerado = (cst: string, prefixo: "pis" | "cofins") =>
    CST_ZERADO.includes(cst) ? { [`${prefixo}_base_calculo`]: 0, [`${prefixo}_aliquota_porcentual`]: 0, [`${prefixo}_valor`]: 0 } : {};

  const corpo: Record<string, unknown> = {
    natureza_operacao: "Venda de mercadoria",
    data_emissao: agoraBrasilia(),
    data_entrada_saida: agoraBrasilia(),
    tipo_documento: 1,
    finalidade_emissao: 1,
    local_destino: interna ? 1 : 2,
    consumidor_final: indicadorIe === 9 ? 1 : 0,
    presenca_comprador: [1, 2, 3, 4, 9].includes(Number(p.presenca)) ? Number(p.presenca) : 9,
    modalidade_frete: Number(ped.frete) > 0 ? 0 : 9,
    cnpj_emitente: emi!.cnpj,
    // A do cadastro do Livih (a API de empresas da Focus só guarda IE numérica).
    inscricao_estadual_emitente: so(emi!.inscricao_estadual) || "ISENTO",
    nome_destinatario: ambiente === "homologacao" ? HOMOLOGACAO : (cli!.razao_social || cli!.nome).slice(0, 60),
    ...(cli!.documento!.length === 14 ? { cnpj_destinatario: cli!.documento } : { cpf_destinatario: cli!.documento }),
    indicador_inscricao_estadual_destinatario: indicadorIe,
    ...(indicadorIe === 1 ? { inscricao_estadual_destinatario: ieCli } : {}),
    logradouro_destinatario: cli!.logradouro,
    numero_destinatario: cli!.numero,
    ...(cli!.complemento ? { complemento_destinatario: cli!.complemento } : {}),
    bairro_destinatario: cli!.bairro,
    municipio_destinatario: cli!.cidade,
    uf_destinatario: cli!.uf,
    cep_destinatario: cli!.cep,
    pais_destinatario: "Brasil",
    ...(so(cli!.telefone || ct?.telefone).length >= 6 ? { telefone_destinatario: so(cli!.telefone || ct?.telefone).slice(-14) } : {}),
    ...((cli!.email || ct?.email) ? { email_destinatario: (cli!.email || ct?.email)!.slice(0, 60) } : {}),
    valor_produtos: valorProdutos,
    valor_desconto: r2(Number(ped.desconto) || 0),
    valor_frete: r2(Number(ped.frete) || 0),
    valor_total: valorTotal,
    formas_pagamento: [{
      indicador_pagamento: p.a_prazo ? 1 : 0, forma_pagamento: forma, valor_pagamento: forma === "90" ? 0 : valorTotal,
    }],
    informacoes_adicionais_contribuinte: [`Pedido nº ${ped.numero}`, (p.informacoes ?? "").trim()].filter(Boolean).join(". ").slice(0, 5000),
    items: (itens ?? []).map((i, n) => {
      const pr = porId.get(i.produto_id!)!;
      const unidade = (pr.unidade || "UN").slice(0, 6).toUpperCase();
      return {
        numero_item: n + 1,
        codigo_produto: (pr.codigo || pr.id.slice(0, 8)).slice(0, 60),
        descricao: i.descricao.slice(0, 120),
        cfop,
        unidade_comercial: unidade,
        quantidade_comercial: Number(i.quantidade),
        valor_unitario_comercial: Number(i.preco_unitario),
        unidade_tributavel: unidade,
        quantidade_tributavel: Number(i.quantidade),
        valor_unitario_tributavel: Number(i.preco_unitario),
        valor_bruto: brutos[n],
        ...(descontos[n] ? { valor_desconto: descontos[n] } : {}),
        ...(fretes[n] ? { valor_frete: fretes[n] } : {}),
        inclui_no_total: 1,
        codigo_ncm: pr.ncm,
        ...(pr.cest ? { cest: pr.cest } : {}),
        icms_origem: pr.origem ?? emi!.icms_origem,
        icms_situacao_tributaria: emi!.icms_situacao,
        pis_situacao_tributaria: emi!.pis_situacao,
        ...zerado(emi!.pis_situacao!, "pis"),
        cofins_situacao_tributaria: emi!.cofins_situacao,
        ...zerado(emi!.cofins_situacao!, "cofins"),
      };
    }),
  };

  // ---- grava e envia ----
  const id = crypto.randomUUID();
  const ref = `lvh${id.replace(/-/g, "")}`;
  const { data: nota, error: erroNota } = await admin.from("notas_fiscais").insert({
    id, org_id: ped.org_id, emissora_id: emi!.id, pedido_id: ped.id, cliente_id: cli!.id, ref, ambiente,
    valor: valorTotal, criado_por: quem.user.id,
  }).select("*").single();
  if (erroNota) {
    console.error("nota", erroNota.message);
    return json(erroNota.code === "23505" ? 409 : 500, { erro: erroNota.code === "23505" ? "A nota deste pedido já está sendo processada." : "Não foi possível registrar a nota." });
  }

  let r: Response;
  try {
    r = await fetch(`${BASE[ambiente]}/v2/nfe?ref=${ref}`, {
      method: "POST",
      headers: { Authorization: basic(token), "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    // Sem resposta: a nota fica processando e a conferência do cron descobre se a Focus recebeu.
    console.error("emitir", ref, String(e).slice(0, 200));
    return json(202, { nota, aviso: "A Focus demorou a responder. O Livih confere sozinho em instantes." });
  }
  const resposta = await r.json().catch(() => null);
  if (r.status === 201 || r.status === 200) await aplicarRetorno(admin, nota as Nota, resposta ?? {});
  else if (r.status !== 202) {
    const mensagem = mensagemFocus(resposta, r.status);
    console.error("emitir", ref, r.status, mensagem.slice(0, 300));
    await admin.from("notas_fiscais").update({ status: "rejeitada", mensagem: mensagem.slice(0, 4000) }).eq("id", id);
  }
  const { data: final } = await admin.from("notas_fiscais").select("*").eq("id", id).single();
  return json(200, { nota: final });
});
