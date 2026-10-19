// Assistente orientador: Configurações → Agente → Assistente (docs/assistente-orientador.md).
//
// Conversa com o dono para montar (empresa nova) ou revisar (agente existente) as instruções, as regras de chamar a
// equipe e a base de conhecimento. Devolve uma PROPOSTA com antes e depois; aplicar e desfazer são funções do banco
// chamadas pela tela (assistente_aplicar / assistente_desfazer). Aqui nada é gravado no agente.
//
//   { org_id, sessao_id?, modo?: 'montar'|'revisar', mensagem, alertas?: string[] } → { sessao_id }
// A resposta sai em segundo plano: a tela acompanha a sessão (status 'pensando' → 'conversando' | 'proposta').

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false } });
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
// Decisão de 20/10: gpt-5. Se a conta não tiver o modelo, cai no mini (e registra qual usou).
const MODELO = Deno.env.get("MODELO_ASSISTENTE") ?? "gpt-5";
const MODELO_RESERVA = "gpt-5-mini";
const LIMITE_DIA = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
// @ts-ignore EdgeRuntime existe no runtime do Supabase
const emSegundoPlano = (tarefa: Promise<unknown>) => globalThis.EdgeRuntime?.waitUntil?.(tarefa);

type Mensagem = { de: "dono" | "assistente"; texto: string };
type Sessao = { id: string; org_id: string; modo: "montar" | "revisar"; mensagens: Mensagem[]; proposta: unknown };

const INSTRUCAO = `Você é o assistente da Livih que ajuda o dono de uma empresa a escrever as orientações do agente de IA que atende os clientes dela no WhatsApp. Fale em português do Brasil, com o dono, de forma curta e clara, sem jargão técnico (não fale em "prompt", "tokens" ou "JSON").

O agente lê, em TODA resposta, três coisas que o dono escreve:
1. INSTRUÇÕES: quem o agente é, o que a empresa faz e vende, para quem, o tom de voz, como conduzir a conversa (o que perguntar para entender o cliente), o que pode e o que não pode prometer.
2. REGRAS DE CHAMAR A EQUIPE: uma lista de situações, cada uma em UMA frase curta (ex.: "Cliente pede desconto acima de 5%", "Reclamação de produto com defeito").
3. BASE DE CONHECIMENTO: conteúdos por tema (políticas de pagamento, frete e prazos, garantia, perguntas frequentes, compatibilidades), cada um curto e sem repetir o que está nas instruções.

Quanto mais curto, mais rápido e barato, e o agente erra menos. Metas: instruções até ~8 mil caracteres; cada conteúdo da base até ~5 mil; regras em uma frase cada.

O que a Livih JÁ faz sozinha (NUNCA escreva isso nas orientações, é repetição): as ferramentas do agente (buscar produtos e preços no cadastro, montar e enviar orçamento em PDF, buscar e enviar documentos da biblioteca, gravar dados do contato, chamar a equipe), a regra de nunca prometer nem dizer que enviou arquivo sem enviar, a saudação e o horário de atendimento (têm campos próprios), os dados do contato e a data/hora.

Onde cada coisa deve ficar:
- Catálogo, lista de produtos ou tabela de preços NÃO vai na base: vai para Produtos (o dono importa em Produtos → Importar com IA). Se a base tiver isso, proponha desativar o conteúdo e diga, em observacoes, para importar.
- Arquivos (manuais, vistas explodidas, catálogos em PDF) vão para Documentos. Se as orientações falarem de enviar arquivo, oriente cadastrar em Configurações → Documentos.

Regras de trabalho:
- Nunca invente política, preço, prazo, endereço ou regra da empresa. Use só o que está no material atual ou o que o dono disse. Se faltar algo importante, pergunte.
- Ao enxugar, preserve TODA informação útil: números, condições, exceções, nomes. Pode mudar de lugar (ex.: das instruções para a base), mas não perder. Só tire o que é repetido, decoração (linhas de ====, ----), ou o que a Livih já faz sozinha.
- Cada informação em UM lugar só: se uma política vai para a base, ela sai das instruções (e vice-versa). Não deixe a mesma regra nos dois.
- Proibições escritas pela empresa ("nunca...", "não...") ficam explícitas, com o mesmo sentido, mesmo que pareçam deduzíveis de outra regra (ex.: "nunca somar os dois descontos").
- Mantenha o jeito de falar da empresa e escreva as orientações em segunda pessoa para o agente ("Você é...").

Modo MONTAR (empresa nova): entreviste o dono com UMA pergunta por vez (no máximo umas 8), na ordem: o que a empresa faz e vende e para quem; tom de voz; como o cliente costuma comprar (o que o agente precisa perguntar); pagamento; frete e prazos; o que o agente não pode prometer; quando chamar a equipe; perguntas mais comuns dos clientes. Quando tiver o suficiente (ou se o dono pedir), mande a proposta completa.
Modo REVISAR (agente existente): na primeira resposta, diga em 3 a 6 tópicos curtos o que encontrou (tamanho, repetições, o que está no lugar errado) e já mande a proposta. Depois, ajuste conforme o dono pedir.

Formato da resposta:
- mensagem: o que você diz ao dono agora (curto; em lista quando ajudar).
- proposta: null enquanto ainda estiver perguntando. Quando propor, inclua só as partes que mudam:
  - instrucoes: o texto completo novo (ou null se não muda), e por_que em uma frase.
  - regras: a lista completa nova (ou null se não muda), e por_que.
  - base: um item por conteúdo que muda: acao "criar" (id null), "atualizar" (id existente, título e conteúdo completos novos) ou "desativar" (id existente, conteudo null); por_que em uma frase. Use só ids que existem no material atual.
  - observacoes: o que o dono precisa fazer fora daqui (importar catálogo, cadastrar documento, conferir uma informação).
- Ao ajustar uma proposta já feita, mande a proposta inteira de novo, atualizada.`;

const TEXTO = { type: "string" };
const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mensagem", "proposta"],
  properties: {
    mensagem: TEXTO,
    proposta: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["instrucoes", "regras", "base", "observacoes"],
          properties: {
            instrucoes: {
              anyOf: [{ type: "null" }, {
                type: "object", additionalProperties: false, required: ["texto", "por_que"],
                properties: { texto: TEXTO, por_que: TEXTO },
              }],
            },
            regras: {
              anyOf: [{ type: "null" }, {
                type: "object", additionalProperties: false, required: ["lista", "por_que"],
                properties: { lista: { type: "array", items: TEXTO }, por_que: TEXTO },
              }],
            },
            base: {
              type: "array",
              items: {
                type: "object", additionalProperties: false, required: ["acao", "id", "titulo", "conteudo", "por_que"],
                properties: {
                  acao: { type: "string", enum: ["criar", "atualizar", "desativar"] },
                  id: { type: ["string", "null"] }, titulo: TEXTO, conteudo: { type: ["string", "null"] }, por_que: TEXTO,
                },
              },
            },
            observacoes: { type: "array", items: TEXTO },
          },
        },
      ],
    },
  },
};

async function chamarModelo(modelo: string, input: unknown[]) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      reasoning: { effort: "low" },
      max_output_tokens: 24_000,
      input,
      text: { format: { type: "json_schema", name: "assistente", schema: ESQUEMA, strict: true } },
    }),
    signal: AbortSignal.timeout(140_000),
  });
  const corpo = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, corpo };
}

async function material(orgId: string) {
  const [{ data: org }, { data: ag }, { data: base }, { data: erp }, { count: docs }] = await Promise.all([
    admin.from("organizacoes").select("nome").eq("id", orgId).maybeSingle(),
    admin.from("agentes").select("prompt, regras_humano").eq("org_id", orgId).order("ativo", { ascending: false }).limit(1).maybeSingle(),
    admin.from("base_conhecimento").select("id, titulo, conteudo, ativo").eq("org_id", orgId).order("titulo"),
    admin.rpc("modulo_ativo", { p_org: orgId, p_modulo: "erp" }),
    admin.from("documentos").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("ativo", true),
  ]);
  const casos = Array.isArray(ag?.regras_humano?.casos) ? ag!.regras_humano.casos : [];
  return { nome: org?.nome ?? "a empresa", prompt: ag?.prompt ?? "", casos, base: base ?? [], erp: !!erp, docs: docs ?? 0 };
}

async function processar(sessao: Sessao, alertas: string[]) {
  try {
    const m = await material(sessao.org_id);
    const contexto = [
      `EMPRESA: ${m.nome}. MODO: ${sessao.modo === "montar" ? "MONTAR (empresa nova)" : "REVISAR (agente existente)"}.`,
      `Usa o cadastro de Produtos: ${m.erp ? "sim" : "não (o pacote de Pedidos não está ligado)"}. Documentos ativos na biblioteca: ${m.docs}.`,
      alertas.length ? `ALERTAS DA SAÚDE DO AGENTE:\n${alertas.map((a) => `- ${a}`).join("\n")}` : "",
      `INSTRUÇÕES ATUAIS (${m.prompt.length} caracteres):\n<<<\n${m.prompt || "(vazio)"}\n>>>`,
      `REGRAS ATUAIS DE CHAMAR A EQUIPE:\n${m.casos.length ? m.casos.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n") : "(nenhuma)"}`,
      `BASE DE CONHECIMENTO ATUAL:\n${m.base.length
        ? m.base.map((b) => `--- id: ${b.id} | ${b.ativo ? "ATIVO" : "INATIVO (o agente não lê)"} | ${b.titulo} (${b.conteudo.length} caracteres)\n${b.conteudo}`).join("\n\n")
        : "(vazia)"}`,
      sessao.proposta ? `SUA ÚLTIMA PROPOSTA (ainda não aplicada):\n${JSON.stringify(sessao.proposta)}` : "",
    ].filter(Boolean).join("\n\n");

    const input = [
      { role: "developer", content: [{ type: "input_text", text: INSTRUCAO }] },
      { role: "user", content: [{ type: "input_text", text: `MATERIAL ATUAL DO AGENTE:\n\n${contexto}` }] },
      ...sessao.mensagens.slice(-30).map((x) => ({
        role: x.de === "dono" ? "user" : "assistant",
        content: [{ type: x.de === "dono" ? "input_text" : "output_text", text: x.texto }],
      })),
    ];

    let modelo = MODELO;
    let r = await chamarModelo(modelo, input);
    if (!r.ok && (r.status === 404 || r.corpo?.error?.code === "model_not_found")) {
      console.error("assistente: modelo indisponível, usando reserva", MODELO);
      modelo = MODELO_RESERVA;
      r = await chamarModelo(modelo, input);
    }
    if (!r.ok) throw new Error(`IA ${r.status}: ${JSON.stringify(r.corpo?.error ?? r.corpo).slice(0, 200)}`);
    const texto = (r.corpo?.output ?? [])
      .flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? [])
      .filter((c: { type: string }) => c.type === "output_text")
      .map((c: { text?: string }) => c.text ?? "")
      .join("");
    const saida = JSON.parse(texto);

    const mensagens = [...sessao.mensagens, { de: "assistente", texto: String(saida.mensagem ?? "").trim() }];
    await admin.from("assistente_sessoes").update({
      mensagens,
      proposta: saida.proposta ?? sessao.proposta ?? null,
      status: saida.proposta ? "proposta" : sessao.proposta ? "proposta" : "conversando",
      erro: null,
    }).eq("id", sessao.id);

    const { error: erroUso } = await admin.from("uso_ia").upsert({
      org_id: sessao.org_id, tipo: "assistente", modelo, chamadas: 1,
      tokens_entrada: Number(r.corpo?.usage?.input_tokens ?? 0), tokens_saida: Number(r.corpo?.usage?.output_tokens ?? 0),
      origem_ref: `assistente:${sessao.id}:${mensagens.length}`,
    }, { onConflict: "origem_ref", ignoreDuplicates: true });
    if (erroUso) console.error("uso_ia assistente", erroUso.message);
  } catch (e) {
    console.error("assistente", sessao.id, String(e).slice(0, 300));
    await admin.from("assistente_sessoes").update({
      status: sessao.proposta ? "proposta" : "erro",
      erro: "O assistente não conseguiu responder. Tente de novo.",
    }).eq("id", sessao.id);
  }
}

/** Chave de serviço em qualquer formato (JWT ou sb_secret_): usada só para testar a qualidade das propostas. */
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
  const { data: quem } = servico ? { data: { user: null } } : await admin.auth.getUser(token);
  if (!servico && !quem.user) return json(401, { erro: "Faça login de novo." });
  const userId = quem.user?.id ?? null;
  const mensagem = String(p.mensagem ?? "").trim().slice(0, 8000);
  if (!p.org_id || !mensagem) return json(400, { erro: "Escreva a mensagem." });

  if (userId) {
    const [{ data: membro }, { data: plataforma }] = await Promise.all([
      admin.from("membros_org").select("papel").eq("org_id", p.org_id).eq("user_id", userId).eq("ativo", true).maybeSingle(),
      admin.from("admins_plataforma").select("user_id").eq("user_id", userId).maybeSingle(),
    ]);
    if (!plataforma && membro?.papel !== "dono" && membro?.papel !== "admin") {
      return json(403, { erro: "Só o dono e os administradores usam o assistente." });
    }
  }
  if (!OPENAI_API_KEY) return json(500, { erro: "Assistente indisponível (configuração do servidor)." });

  const { count } = await admin.from("uso_ia").select("id", { count: "exact", head: true })
    .eq("org_id", p.org_id).eq("tipo", "assistente").gte("criado_em", new Date(Date.now() - 864e5).toISOString());
  if ((count ?? 0) >= LIMITE_DIA) return json(429, { erro: `Limite de ${LIMITE_DIA} respostas do assistente por dia. Continue amanhã.` });

  let sessao: Sessao | null = null;
  if (p.sessao_id) {
    const { data } = await admin.from("assistente_sessoes").select("id, org_id, modo, mensagens, proposta, status")
      .eq("id", p.sessao_id).eq("org_id", p.org_id).maybeSingle();
    if (!data) return json(404, { erro: "Conversa não encontrada." });
    if (data.status === "pensando") return json(409, { erro: "O assistente ainda está respondendo." });
    if (data.status === "aplicada" || data.status === "desfeita") return json(409, { erro: "Esta conversa terminou. Comece outra." });
    sessao = data as Sessao;
  } else {
    if (!["montar", "revisar"].includes(p.modo)) return json(400, { erro: "Escolha montar ou revisar." });
    const { data, error } = await admin.from("assistente_sessoes")
      .insert({ org_id: p.org_id, criado_por: userId, modo: p.modo })
      .select("id, org_id, modo, mensagens, proposta").single();
    if (error || !data) return json(500, { erro: "Não foi possível começar. Tente de novo." });
    sessao = data as Sessao;
  }

  sessao.mensagens = [...(sessao.mensagens ?? []), { de: "dono", texto: mensagem }];
  await admin.from("assistente_sessoes").update({ mensagens: sessao.mensagens, status: "pensando", erro: null }).eq("id", sessao.id);
  const alertas = Array.isArray(p.alertas) ? p.alertas.filter((a: unknown) => typeof a === "string").slice(0, 20) : [];
  emSegundoPlano(processar(sessao, alertas));
  return json(200, { sessao_id: sessao.id });
});
