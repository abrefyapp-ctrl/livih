// Retomada do cliente pelo agente (docs/crm-acompanhamento.md, entrega 2; migration 20261105140000).
//
// Chamada só pelo banco (header x-livih-segredo), pela rodada followup_rodar, com { tarefa_id }. Lê a conversa e o
// motivo (agente_followup_dados), pede à IA UMA mensagem curta de retomada no tom do agente, ou que ela decida não
// mandar (a conversa terminou, o cliente já comprou ou não quer), e devolve ao banco (agente_followup_concluir), que
// confere de novo se o cliente não respondeu nesse meio tempo, envia e marca a próxima tentativa. Sem ferramentas:
// a retomada só escreve. Se a IA falhar, o banco tenta de novo em 1 hora.

import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODELO = Deno.env.get("MODELO_FOLLOWUP") ?? "gpt-5-mini";

// @ts-ignore EdgeRuntime existe no runtime do Supabase
const emSegundoPlano = (tarefa: Promise<unknown>) => globalThis.EdgeRuntime?.waitUntil?.(tarefa);

type Msg = { de: string; texto: string | null; descricao?: string | null; em: string; tipo?: string };
type Dados = {
  valido: boolean;
  org_id: string;
  conversa_id: string;
  motivo: string;
  tentativa: number;
  titulo: string;
  observacao: string | null;
  oportunidade: { titulo: string; resumo: string | null; etapa: string } | null;
  orcamento: { numero: number; total: number } | null;
  contexto: {
    organizacao?: { nome?: string };
    agente?: { nome?: string; prompt?: string };
    contato?: { nome?: string | null; nome_whatsapp?: string | null; empresa?: string | null };
    cliente?: { nome?: string; razao_social?: string | null } | null;
    mensagens?: Msg[];
  };
};

const MOTIVOS: Record<string, string> = {
  orcamento: "o orçamento foi enviado e o cliente não respondeu. Pergunte, sem pressão, se ele conseguiu ver e se ficou alguma dúvida.",
  conversa: "a última mensagem foi nossa e o cliente não respondeu. Retome o assunto que ficou em aberto.",
  oportunidade: "há uma negociação em aberto com este cliente e a conversa parou há alguns dias. Retome o assunto.",
  pedido_cliente: "o próprio cliente pediu para falarmos de novo hoje. Retome o assunto combinado.",
  manual: "a equipe pediu para você retomar o contato com este cliente. Retome o assunto que ficou em aberto.",
};

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["enviar", "mensagem"],
  properties: {
    enviar: { type: "boolean", description: "false quando não faz sentido retomar agora" },
    mensagem: { type: "string", description: "A mensagem para o cliente (vazia se enviar = false)" },
  },
};

function montarEntrada(d: Dados) {
  const c = d.contexto ?? {};
  const empresa = c.organizacao?.nome || "a empresa";
  const nomeCliente = c.contato?.nome || c.contato?.nome_whatsapp || "";
  const ultima = d.tentativa >= 2;
  const instrucao = `Você é ${c.agente?.nome || "o assistente"} da ${empresa} e atende os clientes pelo WhatsApp. Siga o tom de voz e as regras das instruções da empresa.

AGORA a sua tarefa é outra: o cliente parou de responder e você vai escrever UMA mensagem curta de retomada (1 a 3 frases), natural, educada e sem pressão, que retome o assunto em aberto e convide o cliente a responder.

Por que retomar: ${MOTIVOS[d.motivo] ?? MOTIVOS.conversa}
Esta é a tentativa ${d.tentativa} de 2${ultima ? " (a última: seja ainda mais breve e deixe a porta aberta, sem cobrar resposta)" : ""}.

Regras:
- Fale só do que está na conversa. Não invente preço, prazo, desconto, promoção, estoque nem novidade.
- Não cumprimente como se fosse a primeira conversa e não repita a saudação da empresa.
- Não diga que é uma mensagem automática, não fale de sistema, ferramenta ou CRM.
- Use o primeiro nome do cliente se souber${nomeCliente ? ` (${nomeCliente})` : ""}; não use o nome que o cliente escreveu num cumprimento (é de quem ele esperava que atendesse).
- Uma pergunta só, no máximo.
- NÃO escreva (enviar = false) se a conversa terminou de forma natural (o cliente agradeceu e se despediu, já comprou, disse que não quer, pediu para não ser incomodado ou para parar), se a última mensagem já foi uma retomada sem resposta e não há nada novo a dizer, ou se retomar agora pareceria insistente.`;

  const linhas = (c.mensagens ?? []).map((m) => {
    const texto = m.descricao ? `${m.texto ?? ""} [arquivo: ${m.descricao}]` : (m.texto ?? `[${m.tipo ?? "mensagem"}]`);
    return `[${m.em}] ${m.de}: ${texto}`;
  });
  const material = [
    `INSTRUÇÕES DA EMPRESA:\n<<<\n${(c.agente?.prompt ?? "").slice(0, 12000) || "(sem instruções)"}\n>>>`,
    `CLIENTE: ${nomeCliente || "nome não informado"}${c.contato?.empresa ? `, empresa ${c.contato.empresa}` : ""}${
      c.cliente ? ` (cadastro: ${c.cliente.razao_social || c.cliente.nome})` : ""}`,
    d.oportunidade ? `NEGOCIAÇÃO: ${d.oportunidade.titulo} — etapa ${d.oportunidade.etapa}${d.oportunidade.resumo ? `. ${d.oportunidade.resumo}` : ""}` : "",
    d.orcamento ? `ORÇAMENTO EM ABERTO: nº ${d.orcamento.numero}` : "",
    d.observacao ? `OBSERVAÇÃO DA TAREFA: ${d.observacao}` : "",
    `CONVERSA (mais antigas primeiro):\n${linhas.join("\n") || "(sem mensagens)"}`,
    `Data e hora agora: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília).`,
  ].filter(Boolean).join("\n\n");

  return [
    { role: "developer", content: [{ type: "input_text", text: instrucao }] },
    { role: "user", content: [{ type: "input_text", text: material }] },
  ];
}

async function processar(tarefaId: string) {
  const { data, error } = await admin.rpc("agente_followup_dados", { p_tarefa: tarefaId });
  if (error) throw new Error(`dados: ${error.message}`);
  const d = data as Dados;
  if (!d?.valido) return;

  try {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY ausente");
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        reasoning: { effort: "low" },
        max_output_tokens: 2000,
        input: montarEntrada(d),
        text: { format: { type: "json_schema", name: "retomada", schema: ESQUEMA, strict: true } },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`IA ${r.status}: ${JSON.stringify(corpo?.error ?? corpo).slice(0, 200)}`);
    const texto = (corpo?.output ?? [])
      .flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? [])
      .filter((x: { type: string }) => x.type === "output_text")
      .map((x: { text?: string }) => x.text ?? "")
      .join("");
    const saida = JSON.parse(texto) as { enviar: boolean; mensagem: string };

    const { error: erroUso } = await admin.from("uso_ia").upsert({
      org_id: d.org_id, conversa_id: d.conversa_id, tipo: "followup", modelo: MODELO, chamadas: 1,
      tokens_entrada: Number(corpo?.usage?.input_tokens ?? 0), tokens_saida: Number(corpo?.usage?.output_tokens ?? 0),
      origem_ref: `followup:${tarefaId}`,
    }, { onConflict: "origem_ref", ignoreDuplicates: true });
    if (erroUso) console.error("uso_ia followup", erroUso.message);

    const mensagem = saida.enviar ? saida.mensagem.trim() : "";
    const { error: erroFim } = await admin.rpc("agente_followup_concluir", { p_tarefa: tarefaId, p_texto: mensagem || null });
    if (erroFim) throw new Error(`concluir: ${erroFim.message}`);
  } catch (e) {
    console.error("agente-followup", tarefaId, String(e).slice(0, 300));
    await admin.rpc("agente_followup_concluir", { p_tarefa: tarefaId, p_texto: null, p_erro: String(e).slice(0, 200) });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("use POST", { status: 405 });
  const segredo = req.headers.get("x-livih-segredo");
  if (!segredo) return new Response("não autorizado", { status: 401 });
  const { data: ok } = await admin.rpc("verificar_segredo_interno", { p_segredo: segredo });
  if (ok !== true) return new Response("não autorizado", { status: 401 });
  const { tarefa_id } = await req.json().catch(() => ({}));
  if (typeof tarefa_id !== "string") return new Response("tarefa_id", { status: 400 });
  emSegundoPlano(processar(tarefa_id).catch((e) => console.error("agente-followup", String(e))));
  return Response.json({ ok: true });
});
