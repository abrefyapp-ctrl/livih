// Cobrança da Livih pelo Asaas (docs/cobranca-asaas.md, entrega 2): envia as faturas montadas pelo banco.
//
// Chamada só pelo banco (header x-livih-segredo): no fechamento do dia 1, ao gerar uma fatura pela tela Empresas e no
// reenvio diário. Para cada fatura 'a_enviar': cria ou atualiza o cliente no Asaas com os dados de cobrança, cria a
// cobrança avulsa (o cliente escolhe Pix, boleto ou cartão no link; multa de 2 % e juros de 1 % ao mês) e grava o
// link. A fatura passa por 'enviando' antes, para duas chamadas não cobrarem duas vezes; e, antes de criar, a função
// procura no Asaas a cobrança com a referência da fatura (gravação perdida numa tentativa anterior). Fatura
// 'a_cancelar' (cancelada pela plataforma depois de enviada) tem a cobrança apagada no Asaas.
// No sandbox o cliente fica sem notificações do Asaas: o e-mail é o real da empresa, e a cobrança é de teste.
// Ambiente: sandbox até ASAAS_AMBIENTE=producao nos secrets (chaves ASAAS_KEY_SANDBOX e ASAAS_KEY).

import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const PRODUCAO = Deno.env.get("ASAAS_AMBIENTE") === "producao";
const AMBIENTE = PRODUCAO ? "producao" : "sandbox";
const BASE = PRODUCAO ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
const CHAVE = Deno.env.get(PRODUCAO ? "ASAAS_KEY" : "ASAAS_KEY_SANDBOX") ?? "";
const LOTE = 20;

// @ts-ignore EdgeRuntime existe no runtime do Supabase
const emSegundoPlano = (tarefa: Promise<unknown>) => globalThis.EdgeRuntime?.waitUntil?.(tarefa);

type Fatura = { id: string; org_id: string; competencia: string; vencimento: string; valor: number; tentativas: number;
  itens: { descricao: string; quantidade: number; valor: number }[] };
type Dados = { nome: string; documento: string; email: string; telefone: string | null; cep: string; logradouro: string;
  numero: string; complemento: string | null; bairro: string; cidade: string; uf: string };

async function asaas(metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    // O Asaas exige User-Agent nas contas novas.
    headers: { "Content-Type": "application/json", "access_token": CHAVE, "User-Agent": "livih" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const erros = (j?.errors ?? []) as { description?: string }[];
    const descricao = erros.map((e) => e.description).filter(Boolean).join("; ");
    console.error("asaas", metodo, caminho, r.status, descricao);
    const erro: Error & { status?: number } = new Error(descricao
      ? `O Asaas recusou: ${descricao}`
      : `O Asaas não aceitou a cobrança (código ${r.status}). Nova tentativa no dia seguinte, às 9h.`);
    erro.status = r.status;
    throw erro;
  }
  return j;
}

/** Cliente da empresa no Asaas, criado ou atualizado com os dados de cobrança de agora. */
async function garantirCliente(orgId: string): Promise<string> {
  const { data: d } = await admin.from("dados_cobranca").select("*").eq("org_id", orgId).maybeSingle<Dados>();
  if (!d) throw new Error("Faltam os dados de cobrança da empresa.");
  const { data: contrato } = await admin.from("contratos_cobranca").select("asaas_cliente_id, asaas_ambiente")
    .eq("org_id", orgId).maybeSingle<{ asaas_cliente_id: string | null; asaas_ambiente: string | null }>();

  const corpo = {
    name: d.nome,
    cpfCnpj: d.documento,
    email: d.email,
    ...(d.telefone?.length === 11 ? { mobilePhone: d.telefone } : d.telefone ? { phone: d.telefone } : {}),
    postalCode: d.cep,
    address: d.logradouro,
    addressNumber: d.numero,
    complement: d.complemento ?? undefined,
    province: d.bairro,
    externalReference: orgId,
    notificationDisabled: !PRODUCAO,
  };

  let id = contrato?.asaas_ambiente === AMBIENTE ? contrato.asaas_cliente_id : null;
  if (!id) {
    const achados = await asaas("GET", `/customers?externalReference=${encodeURIComponent(orgId)}`);
    id = (achados?.data ?? []).find((c: { deleted?: boolean }) => !c.deleted)?.id ?? null;
  }
  if (id) {
    await asaas("PUT", `/customers/${id}`, corpo);
  } else {
    id = (await asaas("POST", "/customers", corpo)).id as string;
  }
  const { error } = await admin.from("contratos_cobranca").update({ asaas_cliente_id: id, asaas_ambiente: AMBIENTE })
    .eq("org_id", orgId);
  if (error) console.error("guardar cliente asaas", error.message);
  return id;
}

function descricao(f: Fatura) {
  const [ano, mes] = f.competencia.split("-");
  const itens = f.itens.map((i) => i.quantidade > 1 ? `${i.descricao} (${i.quantidade})` : i.descricao).join("; ");
  return `Mensalidade da Livih ${mes}/${ano}: ${itens}`.slice(0, 500);
}

// Falha de rede e tempo esgotado chegam em inglês: viram uma frase para a tela.
function mensagemDeErro(e: unknown) {
  const erro = e as Error;
  if (erro?.name === "TimeoutError" || erro?.name === "TypeError") {
    console.error("asaas rede", String(e));
    return "O Asaas não respondeu a tempo. Nova tentativa no dia seguinte, às 9h.";
  }
  return String(erro?.message ?? e).slice(0, 500);
}

async function cancelar(id: string, asaasId: string) {
  try {
    await asaas("DELETE", `/payments/${asaasId}`);
  } catch (e) {
    // Já apagada no Asaas: segue e marca como cancelada.
    if ((e as { status?: number }).status !== 404) {
      console.error("cancelar no asaas", id, String(e));
      return;
    }
  }
  const { error } = await admin.from("faturas").update({ status: "cancelada", atualizado_em: new Date().toISOString() })
    .eq("id", id).eq("status", "a_cancelar");
  if (error) console.error("gravar cancelamento", id, error.message);
}

async function enviar(f: Fatura) {
  try {
    const cliente = await garantirCliente(f.org_id);
    const achadas = await asaas("GET", `/payments?externalReference=${encodeURIComponent(f.id)}`);
    let cobranca = (achadas?.data ?? []).find((p: { deleted?: boolean }) => !p.deleted);
    if (!cobranca) {
      cobranca = await asaas("POST", "/payments", {
        customer: cliente,
        billingType: "UNDEFINED",
        value: Number(f.valor),
        dueDate: f.vencimento,
        description: descricao(f),
        externalReference: f.id,
        fine: { value: 2 },
        interest: { value: 1 },
      });
    }
    const agora = new Date().toISOString();
    const { error } = await admin.from("faturas").update({
      asaas_id: cobranca.id, link: cobranca.invoiceUrl, ambiente: AMBIENTE, erro: null,
      enviada_em: agora, atualizado_em: agora, tentativas: f.tentativas + 1,
    }).eq("id", f.id);
    if (error) console.error("gravar fatura enviada", f.id, error.message);
    // A situação só muda se ainda está 'enviando': o webhook pode ter marcado a fatura como paga nesse meio-tempo.
    // Cobrança achada pela referência (tentativa anterior que caiu) já pode estar paga ou vencida no Asaas.
    const situacao = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(cobranca.status)
      ? { status: "paga", paga_em: agora }
      : { status: cobranca.status === "OVERDUE" ? "vencida" : "aberta" };
    const { error: erroSituacao } = await admin.from("faturas").update(situacao).eq("id", f.id).eq("status", "enviando");
    if (erroSituacao) console.error("gravar situação da fatura", f.id, erroSituacao.message);
  } catch (e) {
    const { error } = await admin.from("faturas").update({
      status: "erro", erro: mensagemDeErro(e), atualizado_em: new Date().toISOString(),
      tentativas: f.tentativas + 1,
    }).eq("id", f.id).eq("status", "enviando");
    if (error) console.error("gravar erro da fatura", f.id, error.message);
  }
}

async function processar() {
  if (!CHAVE) return console.error(`asaas-cobranca: falta a chave do Asaas (${AMBIENTE})`);
  const { data: canceladas } = await admin.from("faturas").select("id, asaas_id").eq("status", "a_cancelar").limit(LOTE);
  for (const c of canceladas ?? []) if (c.asaas_id) await cancelar(c.id, c.asaas_id);
  const { data: fila } = await admin.from("faturas").select("id").eq("status", "a_enviar").order("criado_em").limit(LOTE);
  if (!fila?.length) return;
  // Pega para si: só segue o que ainda estava 'a_enviar' (outra chamada pode ter pegado antes).
  const { data: pegas } = await admin.from("faturas")
    .update({ status: "enviando", atualizado_em: new Date().toISOString() })
    .in("id", fila.map((f) => f.id)).eq("status", "a_enviar")
    .select("id, org_id, competencia, vencimento, valor, tentativas, itens");
  for (const f of (pegas ?? []) as Fatura[]) await enviar(f);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("use POST", { status: 405 });
  const segredo = req.headers.get("x-livih-segredo");
  if (!segredo) return new Response("não autorizado", { status: 401 });
  const { data: ok } = await admin.rpc("verificar_segredo_interno", { p_segredo: segredo });
  if (ok !== true) return new Response("não autorizado", { status: 401 });
  emSegundoPlano(processar().catch((e) => console.error("asaas-cobranca", String(e))));
  return Response.json({ ok: true });
});
