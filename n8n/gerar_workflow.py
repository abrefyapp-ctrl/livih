"""Gera n8n/livih-agente.json (workflow do agente do Livih).

O JSON é gerado daqui para que o código dos nós fique legível e versionado.
Uso (na raiz do repo): python n8n/gerar_workflow.py
"""
import json
import uuid

# Chamada às funções do Supabase do Livih (só service_role). Variáveis na VPS: LIVIH_SUPABASE_URL,
# LIVIH_SUPABASE_KEY, LIVIH_AGENTE_TOKEN (repassadas ao n8n e ao worker, e na N8N_RUNNERS_ENV_ALLOWLIST).
RPC = """const rpc = async (fn, body) => {
  const r = await this.helpers.httpRequest({
    method: 'POST',
    url: `${$env.LIVIH_SUPABASE_URL}/rest/v1/rpc/${fn}`,
    headers: { apikey: $env.LIVIH_SUPABASE_KEY, Authorization: `Bearer ${$env.LIVIH_SUPABASE_KEY}` },
    body,
    json: true,
    ignoreHttpStatusErrors: true,
    returnFullResponse: true,
  });
  if (r.statusCode >= 400) throw new Error(`${fn}: ${r.body?.message || 'HTTP ' + r.statusCode}`);
  return r.body;
};
"""

VALIDAR = """// Só o Livih (Edge Function waha-webhook) chama este webhook: confere o token compartilhado.
const req = $input.first().json;
if ((req.headers?.['x-livih-token'] || '') !== $env.LIVIH_AGENTE_TOKEN) return [];
const { conversa_id, mensagem_id } = req.body || {};
if (!conversa_id || !mensagem_id) return [];
return [{ json: { conversa_id, mensagem_id } }];
"""

CONTEXTO = RPC + r"""
// Depois da espera: se o cliente mandou outra mensagem (ou um atendente assumiu), esta execução
// desiste; a execução da mensagem mais nova responde tudo junto.
const { conversa_id, mensagem_id } = $input.first().json;
if ((await rpc('agente_deve_responder', { p_conversa: conversa_id, p_mensagem: mensagem_id })) !== true) return [];

const c = await rpc('agente_contexto', { p_conversa: conversa_id });
const contato = c.contato || {};
const op = c.oportunidade;
const regras = c.agente?.regras_humano?.casos || [];

const linha = (m) => {
  const t = m.texto
    ? m.texto
    : m.tipo === 'audio'
      ? '[áudio que não deu para transcrever — peça para escrever ou mandar um áudio mais curto]'
      : `[${m.tipo} — você só lê texto e áudio; peça para descrever por escrito se for importante]`;
  return `[${m.em}] ${m.de}: ${t}`;
};

const agora = new Date().toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

// Saudação e horário (migration 20261010140000). "Dentro do horário" e "primeira resposta" vêm prontos do banco.
const DIAS = ['', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const horario = c.agente?.horario;
const textoHorario = horario
  ? DIAS.slice(1).map((d, i) => {
      const f = horario[String(i + 1)];
      return `${d} ${Array.isArray(f) ? `${f[0]} às ${f[1]}` : 'fechado'}`;
    }).join('; ')
  : null;
const saudacao = (c.agente?.saudacao || '').trim();
const foraHorario = (c.agente?.mensagem_fora_horario || '').trim();

// Saudação configurada: o próprio sistema manda o texto exato na primeira resposta (não depende da IA);
// o agente continua em seguida. Em branco, o agente cumprimenta do jeito dele.
// Fora do horário, com aviso configurado, saudação e aviso saem JUNTOS numa mensagem só (antes eram duas
// seguidas: a saudação do sistema e o aviso escrito pela IA).
const saudacaoAgora = saudacao && c.primeira_resposta;
const foraAgora = !!textoHorario && !c.dentro_do_horario;
const avisoJunto = saudacaoAgora && foraAgora && !!foraHorario;
const textoAbertura = avisoJunto ? `${saudacao}\n\n${foraHorario}` : saudacao;
if (saudacaoAgora) {
  const r = await rpc('agente_responder', { p_conversa: conversa_id, p_texto: textoAbertura, p_mensagem: mensagem_id });
  if (r?.enviado === false) return [];
}
// Fora do horário o aviso precisa sair, então o "oi" sozinho não pode ficar sem resposta (a menos que o aviso já
// tenha ido junto com a saudação).
const podeCalar = !foraAgora || avisoJunto;
const blocoSaudacao = saudacaoAgora
  ? `O sistema ACABOU de enviar ao cliente a saudação da empresa${avisoJunto ? ' junto com o aviso de fora do horário' : ''}: "${textoAbertura}". Não cumprimente de novo nem repita a pergunta da saudação${avisoJunto ? ', e não repita o aviso de horário' : ''}. ${podeCalar
      ? 'Se as mensagens novas do cliente forem só um cumprimento (oi, olá, bom dia...) sem nenhum pedido ou pergunta, a saudação já basta: responda exatamente SEM_RESPOSTA. Se o cliente já disse o que precisa, responda direto ao assunto.'
      : 'Se o cliente já disse o que precisa, responda direto ao assunto; se foi só um cumprimento, dê apenas o aviso de fora do horário, em uma mensagem curta.'}`
  : saudacao
    ? 'A conversa já está em andamento: não repita a saudação.'
    : '';
const blocoHorario = !textoHorario
  ? ''
  : c.dentro_do_horario
    ? `Horário de atendimento da equipe (Brasília): ${textoHorario}. Agora a equipe está DISPONÍVEL.`
    : `Horário de atendimento da equipe (Brasília): ${textoHorario}. Agora estamos FORA do horário: a equipe não está disponível. ${avisoJunto ? 'O aviso de fora do horário JÁ foi enviado junto com a saudação: não avise de novo.' : `Avise o cliente uma única vez na conversa (não repita se já avisou) que a equipe retorna no próximo horário de atendimento${foraHorario ? `, usando esta mensagem como base: "${foraHorario}"` : ''}.`} Continue ajudando normalmente: tire dúvidas, entenda a necessidade e anote os dados. Se precisar chamar a equipe, chame e diga que ela responde quando voltar.`;
const blocoAbertura = [blocoSaudacao, blocoHorario].filter(Boolean).join('\n\n');

// Ordem pensada para o cache de prompt da OpenAI (cobra ~90% menos pelo início repetido entre chamadas): primeiro
// tudo o que é fixo por agente/empresa (instruções, CRM, regras, base), depois o que muda a cada conversa ou minuto
// (saudação/horário, dados do contato, data e hora). Não pôr nada variável antes da base.
const prompt_sistema = `${c.agente?.prompt || ''}

---

# CRM — COMO USAR AS FERRAMENTAS

Você trabalha dentro do CRM da ${c.organizacao?.nome || 'empresa'}. As ferramentas gravam o que você aprende na conversa.

- **atualizar_contato**: sempre que o cliente disser algo novo sobre ele (nome, empresa, e-mail, cargo, segmento, cidade, tamanho da equipe), grave. Não pergunte nada só para preencher cadastro.
- **registrar_oportunidade**: quando entender a necessidade, registre com um título curto e um resumo do diagnóstico. Atualize o resumo quando aprender mais.
- **mover_etapa**: reflita o avanço no funil usando exatamente um destes nomes: ${(c.etapas || []).join(', ')}. Nunca marque Ganho ou Perdido; isso é da equipe.
- **registrar_nota**: antes de passar para a equipe, deixe um resumo útil: dores, contexto, o que já foi explicado e o próximo passo sugerido.
- **buscar_produtos**: quando o cliente perguntar de um produto (preço, embalagem, quantidade, especificação, compatibilidade, se tem), busque no cadastro pela referência, modelo ou nome que ele usou (ex.: "14/19", "grampeador IMECO", "prego anelado"). Informe só o que vier da busca, com o preço exatamente como veio. Se vierem vários parecidos, pergunte qual ele quer; se não vier nenhum, não invente: peça mais detalhes ou chame a equipe. Pode buscar mais de uma vez com termos diferentes.
- **chamar_humano**: chame quando acontecer um destes casos:
${regras.map((r) => `  - ${r}`).join('\n') || '  - o cliente pedir para falar com uma pessoa'}
  Depois de chamar, diga ao cliente, em uma frase, que um especialista vai continuar a conversa por aqui. Não continue o atendimento depois disso.

Nunca fale de ferramentas, CRM ou sistema com o cliente. A sua resposta final é exatamente o texto que será enviado no WhatsApp.

# BASE DE CONHECIMENTO

${c.base_conhecimento || '(vazia)'}
${blocoAbertura ? `
# SAUDAÇÃO E HORÁRIO

${blocoAbertura}
` : ''}
# O QUE JÁ SABEMOS DESTE CONTATO

- Nome: ${contato.nome || contato.nome_whatsapp || 'não informado'}${contato.nome ? '' : ' (nome do perfil do WhatsApp, não confirmado)'}
- Empresa: ${contato.empresa || 'não informada'}
- E-mail: ${contato.email || 'não informado'}
- Outros dados: ${Object.keys(contato.dados || {}).length ? JSON.stringify(contato.dados) : 'nenhum'}
- Oportunidade aberta: ${op ? `"${op.titulo}" — etapa ${op.etapa}${op.resumo ? `. Resumo: ${op.resumo}` : ''}` : 'nenhuma ainda'}

Data e hora agora: ${agora} (horário de Brasília).`;

// Ponto de retomada (migration 20261009130000): a conversa voltou para o agente (devolvida pela equipe, reaberta
// ou agente religado). O que veio antes é só contexto: a equipe já tratou ou o assunto ficou para trás.
const msgs = c.mensagens || [];
// O contexto foi lido antes de a saudação sair: ela entra no fim do histórico para o agente ver a ordem certa.
if (saudacaoAgora) {
  const em = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  msgs.push({ de: 'assistente (saudação automática)', tipo: 'texto', texto: textoAbertura, em, anterior: false });
}
const anteriores = msgs.filter((m) => m.anterior);
const novas = msgs.filter((m) => !m.anterior);

const entrada = anteriores.length
  ? `Histórico ANTERIOR da conversa no WhatsApp (mais antigas primeiro). Você voltou a atender esta conversa em ${c.retomado_em}; estas mensagens já foram tratadas pela equipe ou são de um atendimento passado. Use só como contexto (nome, o que já foi combinado, o que a equipe respondeu). Não responda a perguntas daqui, não repita o que a equipe já disse e não retome esses assuntos, a não ser que o cliente volte a falar deles nas mensagens novas:

${anteriores.map(linha).join('\n')}

--- Mensagens NOVAS, depois que você voltou a atender (responda a estas) ---

${novas.map(linha).join('\n')}

Escreva a próxima resposta para o cliente, respondendo às mensagens novas.`
  : `Histórico da conversa no WhatsApp (mais antigas primeiro):

${msgs.map(linha).join('\n')}

Escreva a próxima resposta para o cliente.`;

return [{ json: { conversa_id, mensagem_id, prompt_sistema, entrada } }];
"""

RESPONDER = RPC + r"""
const texto = String($input.first().json.output || '').trim();
// SEM_RESPOSTA: a saudação automática já respondeu um simples "oi" (ver Contexto).
if (!texto || /^\W*SEM_RESPOSTA\W*$/i.test(texto)) return [];
const { conversa_id, mensagem_id } = $('Contexto').first().json;
const r = await rpc('agente_responder', { p_conversa: conversa_id, p_texto: texto, p_mensagem: mensagem_id });
return [{ json: r }];
"""

RPC_FERRAMENTA = RPC.replace(
    "if (r.statusCode >= 400) throw new Error(`${fn}: ${r.body?.message || 'HTTP ' + r.statusCode}`);",
    "if (r.statusCode >= 400) return { erro: r.body?.message || `HTTP ${r.statusCode}` };",
)


def ferramenta(nome, descricao, fn, corpo_js, schema):
    campos = json.dumps(list(schema["properties"].keys()))
    code = RPC_FERRAMENTA + f"""
// A conversa vem do webhook, nunca do modelo: o agente não escolhe em qual conversa mexe.
const conversa = $('Validar').first().json.conversa_id;
// $input.item.json traz o item inteiro do workflow junto com os argumentos: fica só o que é do esquema.
const CAMPOS = {campos};
const args = Object.fromEntries(Object.entries($input.item.json || {{}}).filter(([k]) => CAMPOS.includes(k)));
return JSON.stringify(await rpc('{fn}', {corpo_js}));
"""
    return {
        "parameters": {
            "description": descricao,
            "jsCode": code,
            "specifyInputSchema": True,
            "schemaType": "manual",
            "inputSchema": json.dumps(schema, ensure_ascii=False, indent=2),
        },
        "type": "@n8n/n8n-nodes-langchain.toolCode",
        "typeVersion": 1.3,
        "name": nome,
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, "livih-agente/" + nome)),
    }


def obj(props, obrig=None):
    o = {"type": "object", "properties": {k: {"type": "string", "description": v} for k, v in props.items()}}
    if obrig:
        o["required"] = obrig
    return o


FERRAMENTAS = [
    ferramenta(
        "atualizar_contato",
        "Grava o que o cliente contou sobre ele mesmo. Envie só os campos que ele informou.",
        "agente_atualizar_contato",
        "{ p_conversa: conversa, p_dados: args }",
        obj({"nome": "Nome da pessoa", "empresa": "Nome da empresa", "email": "E-mail",
             "cargo": "Cargo ou função", "segmento": "Ramo de atuação da empresa", "cidade": "Cidade",
             "colaboradores": "Tamanho da equipe"}),
    ),
    ferramenta(
        "registrar_oportunidade",
        "Cria ou atualiza a oportunidade (lead) deste contato com um título curto e o resumo do diagnóstico até agora.",
        "agente_registrar_oportunidade",
        "{ p_conversa: conversa, p_titulo: args.titulo, p_resumo: args.resumo }",
        obj({"titulo": "Título curto da necessidade, ex.: Agente de atendimento para clínica",
             "resumo": "Resumo do diagnóstico: processo, gargalos, impacto"}, ["titulo", "resumo"]),
    ),
    ferramenta(
        "mover_etapa",
        "Move a oportunidade deste contato para outra etapa do funil (use o nome exato de uma etapa aberta).",
        "agente_mover_etapa",
        "{ p_conversa: conversa, p_etapa: args.etapa }",
        obj({"etapa": "Nome exato da etapa"}, ["etapa"]),
    ),
    ferramenta(
        "registrar_nota",
        "Deixa uma nota interna para a equipe (o cliente não vê).",
        "agente_nota",
        "{ p_conversa: conversa, p_texto: args.texto }",
        obj({"texto": "Conteúdo da nota"}, ["texto"]),
    ),
    # Catálogo fora da base de conhecimento (migration 20261015150000): o agente busca só o que o cliente perguntou.
    ferramenta(
        "buscar_produtos",
        "Busca produtos no cadastro da empresa (nome, código, categoria, marca, detalhes) e devolve preço, unidade e "
        "detalhes dos mais parecidos. Use antes de falar de qualquer produto.",
        "agente_buscar_produtos",
        "{ p_conversa: conversa, p_busca: args.busca, p_limite: 8 }",
        obj({"busca": "O que o cliente procura: referência, modelo, nome ou tipo do produto, ex.: 14/19, grampeador IMECO"},
            ["busca"]),
    ),
    ferramenta(
        "chamar_humano",
        "Passa a conversa para a equipe: o assistente para de responder e a equipe é avisada no WhatsApp.",
        "agente_chamar_humano",
        "{ p_conversa: conversa, p_motivo: args.motivo }",
        obj({"motivo": "Por que a equipe deve assumir, em uma frase"}, ["motivo"]),
    ),
]


def no(nome, tipo, versao, params, pos, **extra):
    return {"parameters": params, "type": tipo, "typeVersion": versao, "name": nome,
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, "livih-agente/" + nome)), "position": pos, **extra}


nodes = [
    no("Webhook", "n8n-nodes-base.webhook", 2.1, {"httpMethod": "POST", "path": "livih-agente", "options": {}},
       [0, 0], webhookId="5f0d6c1e-1a2b-4a9e-9a61-0000000000a1"),
    no("Validar", "n8n-nodes-base.code", 2, {"jsCode": VALIDAR}, [220, 0]),
    no("Aguardar", "n8n-nodes-base.wait", 1.1, {"amount": 6, "unit": "seconds"}, [440, 0],
       webhookId="5f0d6c1e-1a2b-4a9e-9a61-0000000000a2"),
    no("Contexto", "n8n-nodes-base.code", 2, {"jsCode": CONTEXTO}, [660, 0]),
    no("AI Agent", "@n8n/n8n-nodes-langchain.agent", 3.1,
       {"promptType": "define", "text": "={{ $json.entrada }}",
        "options": {"systemMessage": "={{ $json.prompt_sistema }}", "maxIterations": 8}}, [900, 0]),
    no("OpenAI Chat Model", "@n8n/n8n-nodes-langchain.lmChatOpenAi", 1.3,
       {"model": {"__rl": True, "mode": "list", "value": "gpt-5-mini"}, "builtInTools": {}, "options": {}}, [700, 260],
       credentials={"openAiApi": {"id": "7sGjuIVHzRDjq3T0", "name": "OpenAI account"}}),
    no("Responder", "n8n-nodes-base.code", 2, {"jsCode": RESPONDER}, [1300, 0]),
]
for i, t in enumerate(FERRAMENTAS):
    t["position"] = [880 + i * 150, 260]
nodes += FERRAMENTAS

connections = {
    "Webhook": {"main": [[{"node": "Validar", "type": "main", "index": 0}]]},
    "Validar": {"main": [[{"node": "Aguardar", "type": "main", "index": 0}]]},
    "Aguardar": {"main": [[{"node": "Contexto", "type": "main", "index": 0}]]},
    "Contexto": {"main": [[{"node": "AI Agent", "type": "main", "index": 0}]]},
    "AI Agent": {"main": [[{"node": "Responder", "type": "main", "index": 0}]]},
    "OpenAI Chat Model": {"ai_languageModel": [[{"node": "AI Agent", "type": "ai_languageModel", "index": 0}]]},
}
for t in FERRAMENTAS:
    connections[t["name"]] = {"ai_tool": [[{"node": "AI Agent", "type": "ai_tool", "index": 0}]]}

workflow = {
    "id": "LvhAgenteLivih01",
    "name": "Livih — Agente",
    "active": False,
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"},
    "pinData": {},
}

with open("n8n/livih-agente.json", "w", encoding="utf-8") as f:
    json.dump(workflow, f, ensure_ascii=False, indent=2)
print("n8n/livih-agente.json:", len(nodes), "nós")
