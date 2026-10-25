// NFS-e Nacional pela Focus NFe (docs/nfse.md): emite a nota de serviço de um pedido, de uma OS ou avulsa.
//
//   { pedido_id } | { os_id } | { cliente_id, valor, descricao }
//   + { emissora_id?, descricao?, data_competencia?, iss_retido?, informacoes? }  → { nota } | { erro, faltando[] }
//
// Quem pode: dono, admin e quem tem "Emite nota fiscal". O pedido, a OS e o cliente são lidos com o login da pessoa
// (a RLS decide o que ela vê). A nota nasce "processando"; o resultado vem pelo gatilho da Focus (nfe-retorno).
// No padrão nacional a alíquota do ISS vem parametrizada pela prefeitura: o Livih não manda.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { type Ambiente, BASE, basic, mensagemFocus, tokenDoCnpj } from "../_shared/focus.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const TOKEN_REVENDA = (Deno.env.get("FOCUS_TOKEN_PRODUCAO") ?? "").trim();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const so = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const r2 = (n: number) => Math.round(n * 100) / 100;
const agoraBrasilia = () => `${new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 19)}-03:00`;
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Opção pelo Simples na NFS-e Nacional, pelo regime do CNPJ: 1 não optante, 2 MEI, 3 ME/EPP. */
const opcaoSimples = (regime: number | null) => (regime === 4 ? "2" : regime === 1 || regime === 2 ? "3" : "1");

/** Código IBGE de um município pela Focus (para o endereço do tomador). */
async function ibgeDe(cidade: string | null, uf: string | null): Promise<string | null> {
  if (!cidade || !uf || !TOKEN_REVENDA) return null;
  try {
    const r = await fetch(`https://api.focusnfe.com.br/v2/municipios?sigla_uf=${uf}&nome_municipio=${encodeURIComponent(cidade)}`, {
      headers: { Authorization: basic(TOKEN_REVENDA) }, signal: AbortSignal.timeout(15000),
    });
    const lista = (await r.json().catch(() => null)) as { codigo_municipio?: string }[] | null;
    return Array.isArray(lista) && lista[0]?.codigo_municipio ? String(lista[0].codigo_municipio) : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  let p: {
    pedido_id?: string; os_id?: string; cliente_id?: string; valor?: number; emissora_id?: string; descricao?: string;
    data_competencia?: string; iss_retido?: boolean; informacoes?: string;
  };
  try {
    p = await req.json();
  } catch {
    return json(400, { erro: "corpo inválido" });
  }
  const autorizacao = req.headers.get("Authorization") ?? "";
  const { data: quem } = await admin.auth.getUser(autorizacao.replace(/^Bearer\s+/i, ""));
  if (!quem.user) return json(401, { erro: "Faça login de novo." });
  const comoUsuario = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false }, global: { headers: { Authorization: autorizacao } },
  });

  // ---- origem: pedido, OS ou avulsa (sempre lida com o login da pessoa) ----
  let orgId: string;
  let clienteId: string | null;
  let valor = 0;
  let descricaoBase = "";
  let emissoraOrigem: string | null = null;
  const faltando: string[] = [];

  if (p.pedido_id) {
    const { data: ped } = await comoUsuario.from("pedidos").select("id, org_id, numero, status, cliente_id, emissora_id, total").eq("id", p.pedido_id).maybeSingle();
    if (!ped) return json(404, { erro: "Pedido não encontrado." });
    if (ped.status === "rascunho") faltando.push("Confirme o pedido antes de emitir a nota.");
    if (ped.status === "cancelado") faltando.push("O pedido está cancelado.");
    const { data: itens } = await admin.from("pedido_itens").select("descricao, quantidade").eq("pedido_id", ped.id).order("ordem");
    orgId = ped.org_id; clienteId = ped.cliente_id; valor = Number(ped.total); emissoraOrigem = ped.emissora_id;
    descricaoBase = (itens ?? []).map((i) => `${Number(i.quantidade) === 1 ? "" : `${Number(i.quantidade)} x `}${i.descricao}`).join("; ");
  } else if (p.os_id) {
    const { data: os } = await comoUsuario.from("ordens_servico").select("id, org_id, numero, cliente_id").eq("id", p.os_id).maybeSingle();
    if (!os) return json(404, { erro: "Ordem de serviço não encontrada." });
    const { data: itens } = await admin.from("os_itens")
      .select("modelo, identificacao, valor, cobranca, desfecho, tipo:os_tipos_item(nome), servico:os_servicos(nome)")
      .eq("os_id", os.id).order("ordem");
    // Na nota entra o que é cobrado e não foi encerrado fora do caminho (não aprovado, sem conserto, cancelado).
    const cobrados = ((itens ?? []) as unknown as {
      modelo: string | null; identificacao: string | null; valor: number; cobranca: string; desfecho: string | null;
      tipo: { nome: string } | null; servico: { nome: string } | null;
    }[]).filter((i) => i.cobranca === "cobrado" && !i.desfecho);
    orgId = os.org_id; clienteId = os.cliente_id;
    valor = r2(cobrados.reduce((t, i) => t + Number(i.valor), 0));
    descricaoBase = `OS nº ${os.numero}: ` + cobrados.map((i) =>
      [i.servico?.nome, [i.tipo?.nome, i.modelo].filter(Boolean).join(" "), i.identificacao ? `(${i.identificacao})` : null].filter(Boolean).join(" ")
    ).join("; ");
    if (!cobrados.length) faltando.push("A OS não tem item cobrado (garantia, cortesia e itens encerrados não entram na nota).");
  } else if (p.cliente_id) {
    const { data: cli } = await comoUsuario.from("clientes").select("id, org_id").eq("id", p.cliente_id).maybeSingle();
    if (!cli) return json(404, { erro: "Cliente não encontrado." });
    orgId = cli.org_id; clienteId = cli.id; valor = r2(Number(p.valor) || 0);
  } else {
    return json(400, { erro: "Informe o pedido, a OS ou o cliente." });
  }

  const { data: pode } = await comoUsuario.rpc("emite_nota_fiscal", { p_org: orgId });
  if (pode !== true) return json(403, { erro: "Você não tem a permissão \"Emite nota fiscal\". Peça ao dono ou ao admin." });

  const emissoraId = p.emissora_id || emissoraOrigem;
  const [{ data: emi }, { data: cli }, { data: viva }] = await Promise.all([
    emissoraId
      ? admin.from("emissoras").select("*").eq("id", emissoraId).eq("org_id", orgId).maybeSingle()
      : admin.from("emissoras").select("*").eq("org_id", orgId).eq("padrao", true).maybeSingle(),
    clienteId ? admin.from("clientes").select("*").eq("id", clienteId).maybeSingle() : { data: null },
    p.pedido_id || p.os_id
      ? admin.from("notas_fiscais").select("id, status").eq(p.pedido_id ? "pedido_id" : "os_id", (p.pedido_id ?? p.os_id)!)
          .in("status", ["processando", "autorizada"]).maybeSingle()
      : { data: null },
  ]);
  if (viva) return json(409, { erro: viva.status === "autorizada" ? "Já existe nota autorizada para isto." : "A nota já está sendo processada." });

  // ---- o que falta ----
  if (!emi) faltando.push("Escolha o CNPJ que emite (Configurações → Empresa).");
  else {
    if (emi.nfe_status !== "pronta") faltando.push(`O CNPJ ${emi.nome_fantasia || emi.razao_social} não está pronto na Focus (Configurações → Empresa → Nota fiscal).`);
    if (!emi.nfse_habilitada_focus) faltando.push("Ative a nota de serviço (NFS-e) na configuração do CNPJ e salve (Configurações → Empresa → Nota fiscal).");
    if (!emi.nfse_codigo_tributacao_nacional) faltando.push("Informe o código de tributação nacional do ISS na configuração do CNPJ (a contabilidade sabe).");
    if (!emi.codigo_municipio_ibge) faltando.push("O município do CNPJ não foi reconhecido: confira a cidade e a UF no cadastro e salve a configuração de novo.");
  }
  if (!cli) faltando.push("Ligue a nota a um cliente do cadastro (com CNPJ ou CPF).");
  else if (!cli.documento) faltando.push(`O cliente ${cli.nome} não tem CNPJ/CPF no cadastro.`);
  const descricao = (p.descricao?.trim() || descricaoBase || emi?.nfse_descricao_padrao || "").slice(0, 1000);
  if (!descricao) faltando.push("Descreva o serviço prestado.");
  if (!(valor > 0)) faltando.push("O valor do serviço precisa ser maior que zero.");
  const competencia = /^\d{4}-\d{2}-\d{2}$/.test(p.data_competencia ?? "") ? p.data_competencia! : hojeBrasilia();
  if (faltando.length) return json(422, { erro: "Falta arrumar antes de emitir:", faltando });

  const ambiente = emi!.nfe_ambiente as Ambiente;
  const token = await tokenDoCnpj(admin, emi!.id, ambiente);
  if (!token) return json(422, { erro: "O CNPJ ainda não tem o acesso da Focus para este ambiente. Salve a configuração da nota fiscal de novo." });

  // ---- monta a DPS ----
  const ibgeTomador = cli!.cidade ? await ibgeDe(cli!.cidade, cli!.uf) : null;
  const fone = so(cli!.telefone);
  const corpo: Record<string, unknown> = {
    data_emissao: agoraBrasilia(),
    data_competencia: competencia,
    emitente_dps: "1",
    codigo_municipio_emissora: Number(emi!.codigo_municipio_ibge),
    cnpj_prestador: emi!.cnpj,
    ...(so(emi!.inscricao_municipal) ? { inscricao_municipal_prestador: so(emi!.inscricao_municipal) } : {}),
    codigo_opcao_simples_nacional: opcaoSimples(emi!.regime_tributario),
    regime_especial_tributacao: String(emi!.nfse_regime_especial ?? 0),
    ...(cli!.documento!.length === 14 ? { cnpj_tomador: cli!.documento } : { cpf_tomador: cli!.documento }),
    razao_social_tomador: (cli!.razao_social || cli!.nome).slice(0, 150),
    // Endereço só completo e com o município reconhecido (no padrão nacional ele é opcional).
    ...(ibgeTomador && cli!.logradouro && cli!.numero && cli!.bairro && cli!.cep
      ? {
          logradouro_tomador: cli!.logradouro.slice(0, 255), numero_tomador: cli!.numero.slice(0, 60),
          ...(cli!.complemento ? { complemento_tomador: cli!.complemento.slice(0, 156) } : {}),
          bairro_tomador: cli!.bairro.slice(0, 60), codigo_municipio_tomador: Number(ibgeTomador), cep_tomador: Number(cli!.cep),
        }
      : {}),
    ...(cli!.email ? { email_tomador: cli!.email.slice(0, 80) } : {}),
    ...(fone.length >= 6 ? { telefone_tomador: fone.slice(-20) } : {}),
    codigo_municipio_prestacao: emi!.codigo_municipio_ibge,
    codigo_tributacao_nacional_iss: emi!.nfse_codigo_tributacao_nacional,
    ...(emi!.nfse_codigo_tributacao_municipal ? { codigo_tributacao_municipal_iss: emi!.nfse_codigo_tributacao_municipal } : {}),
    ...(emi!.nfse_codigo_nbs ? { codigo_nbs: emi!.nfse_codigo_nbs } : {}),
    descricao_servico: descricao,
    valor_servico: valor,
    tributacao_iss: 1,
    tipo_retencao_iss: p.iss_retido ? 2 : 1,
    ...(p.informacoes?.trim() ? { informacoes_complementares: p.informacoes.trim().slice(0, 2000) } : {}),
    // Reforma tributária: finalidade regular, consumidor final (pessoa física) e destinatário = tomador.
    finalidade_emissao: 0,
    consumidor_final: cli!.tipo === "pf" ? 1 : 0,
    indicador_destinatario: 0,
    ...(emi!.ibs_cbs_cst && emi!.ibs_cbs_classificacao
      ? { ibs_cbs_situacao_tributaria: emi!.ibs_cbs_cst, ibs_cbs_classificacao_tributaria: emi!.ibs_cbs_classificacao }
      : {}),
  };

  // ---- grava e envia ----
  const id = crypto.randomUUID();
  const ref = `lvs${id.replace(/-/g, "")}`;
  const { data: nota, error: erroNota } = await admin.from("notas_fiscais").insert({
    id, org_id: orgId, emissora_id: emi!.id, pedido_id: p.pedido_id ?? null, os_id: p.os_id ?? null, cliente_id: cli!.id,
    ref, ambiente, modelo: "nfse", valor, descricao, data_competencia: competencia, criado_por: quem.user.id,
  }).select("*").single();
  if (erroNota) {
    console.error("nota de serviço", erroNota.message);
    return json(erroNota.code === "23505" ? 409 : 500, { erro: erroNota.code === "23505" ? "A nota já está sendo processada." : "Não foi possível registrar a nota." });
  }

  let r: Response;
  try {
    r = await fetch(`${BASE[ambiente]}/v2/nfsen?ref=${ref}`, {
      method: "POST",
      headers: { Authorization: basic(token), "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    console.error("emitir nfse", ref, String(e).slice(0, 200));
    return json(202, { nota, aviso: "A Focus demorou a responder. O Livih confere sozinho em instantes." });
  }
  if (!r.ok && r.status !== 202) {
    const mensagem = mensagemFocus(await r.json().catch(() => null), r.status);
    console.error("emitir nfse", ref, r.status, mensagem.slice(0, 300));
    await admin.from("notas_fiscais").update({ status: "rejeitada", mensagem: mensagem.slice(0, 4000) }).eq("id", id);
  }
  const { data: final } = await admin.from("notas_fiscais").select("*").eq("id", id).single();
  return json(200, { nota: final, valor: moeda(valor) });
});
