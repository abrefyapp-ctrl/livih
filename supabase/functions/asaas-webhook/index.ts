// Webhook do Asaas (docs/cobranca-asaas.md, entrega 3): pagamento, atraso, estorno e mudança das faturas da Livih.
//
// O Asaas manda cada evento com o token cadastrado no webhook (cabeçalho asaas-access-token). Um token por conta:
// ASAAS_WEBHOOK_TOKEN (produção) e ASAAS_WEBHOOK_TOKEN_SANDBOX; o token diz de qual ambiente é o evento, e evento do
// sandbox não mexe em fatura de produção. A regra fica no banco (cobranca_evento_asaas): marca a fatura, reativa a
// empresa suspensa por atraso e ignora evento repetido. A resposta sai depois de gravar: se o banco falhar, o 500 faz
// o Asaas tentar de novo (com 15 falhas seguidas ele pausa a fila; retomar em Integrações → Webhooks, no painel).
// Mesmo endereço para o sandbox e a produção.

import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const TOKENS = [
  { ambiente: "producao", token: Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "" },
  { ambiente: "sandbox", token: Deno.env.get("ASAAS_WEBHOOK_TOKEN_SANDBOX") ?? "" },
].filter((t) => t.token);

// Comparação em tempo constante: o tempo da resposta não pode dar pistas do token.
function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

type Evento = { id?: string; event?: string; dateCreated?: string;
  payment?: { id?: string; status?: string; dueDate?: string; externalReference?: string } };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("use POST", { status: 405 });
  if (!TOKENS.length) {
    console.error("asaas-webhook: falta o secret ASAAS_WEBHOOK_TOKEN ou ASAAS_WEBHOOK_TOKEN_SANDBOX");
    return new Response("não configurado", { status: 503 });
  }
  const recebido = req.headers.get("asaas-access-token") ?? "";
  const ambiente = TOKENS.find((t) => iguais(recebido, t.token))?.ambiente;
  if (!ambiente) return new Response("não autorizado", { status: 401 });

  const corpo = await req.json().catch(() => null) as Evento | null;
  // Eventos que não são de cobrança (transferência, nota fiscal do Asaas…): só confirma o recebimento.
  if (!corpo?.event || !corpo.payment?.id) return Response.json({ ok: true, ignorado: "sem cobrança" });

  // Só o necessário: o resto do pagamento traz dados do cliente, que não precisam passar por aqui. A referência é o id
  // da fatura: acha a fatura quando o evento chega antes de a asaas-cobranca gravar o id da cobrança.
  const pagamento = { id: corpo.payment.id, status: corpo.payment.status, dueDate: corpo.payment.dueDate,
    externalReference: corpo.payment.externalReference };
  const { data, error } = await admin.rpc("cobranca_evento_asaas", {
    p_evento_id: corpo.id ?? `${corpo.event}:${corpo.payment.id}:${corpo.dateCreated ?? ""}`,
    p_evento: corpo.event,
    p_pagamento: pagamento,
    p_ambiente: ambiente,
  });
  if (error) {
    console.error("asaas-webhook", ambiente, corpo.event, corpo.payment.id, error.message);
    return new Response("erro ao gravar", { status: 500 });
  }
  console.log("asaas-webhook", ambiente, corpo.event, corpo.payment.id, data);
  return Response.json({ ok: true, resultado: data });
});
