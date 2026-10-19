"""Gera n8n/livih-agente.json (workflow do agente do Livih) e n8n/livih-simulador.json (simulador de conversa).

O JSON é gerado daqui para que o código dos nós fique legível e versionado.
Uso (na raiz do repo): python n8n/gerar_workflow.py
"""
import copy
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

// Arquivo/imagem: o `texto` é só o nome do arquivo ou a legenda. Sem esta marcação o agente lia
// "cliente: requisicao_compra.pdf" como se tivesse o conteúdo e inventava "os itens do anexo" (JoGrampo, 15/10).
const MIDIA = { imagem: 'uma imagem', video: 'um vídeo', documento: 'um documento', figurinha: 'uma figurinha',
  localizacao: 'uma localização', contato: 'um contato', outro: 'uma mensagem sem texto' };
const linha = (m) => {
  let t;
  if (m.tipo === 'texto') t = m.texto || '';
  else if (m.tipo === 'audio') {
    t = m.texto || '[áudio que não deu para transcrever — peça para escrever ou mandar um áudio mais curto]';
  } else if (m.de === 'cliente' && m.descricao) {
    // Imagem/PDF descritos pela IA na entrada (migration 20261016140000): o agente lê a descrição, não o arquivo.
    t = `[o cliente enviou ${MIDIA[m.tipo] || 'um arquivo'}${m.texto ? ` (${m.texto})` : ''} — descrição automática do arquivo: ${m.descricao}]`;
  } else if (m.de === 'cliente') {
    t = `[o cliente enviou ${MIDIA[m.tipo] || 'um arquivo'}${m.texto ? ` (${m.texto})` : ''} — você NÃO consegue abrir este arquivo]`;
  } else {
    t = `[${MIDIA[m.tipo] || 'arquivo'} enviado${m.texto ? `: ${m.texto}` : ''}]`;
  }
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
- **buscar_produtos**: quando o cliente perguntar de um produto (preço, embalagem, quantidade, especificação, compatibilidade, se tem), busque no cadastro pela referência, modelo ou nome que ele usou (ex.: "14/19", "grampeador IMECO", "prego anelado"). Informe só o que vier da busca, com o preço exatamente como veio. Se o preço vier vazio (preco_texto "sob consulta"), NUNCA diga um valor nem R$ 0: diga que a equipe confirma o preço e, se o cliente quiser esse item, chame a equipe. Se vierem vários parecidos, pergunte qual ele quer; se não vier nenhum, não invente: peça mais detalhes ou chame a equipe. Pode buscar mais de uma vez com termos diferentes.
- **montar_pedido**: quando o cliente disser o que quer comprar E as quantidades, monte o pedido com o código exato que veio da busca (campo codigo) e a quantidade na unidade do produto (ex.: 10 caixinhas = quantidade 10). Mande SEMPRE a lista completa do pedido (se o cliente mudar algo, reenvie tudo). O preço vem do cadastro: confirme ao cliente os itens e o total exatamente como a ferramenta devolveu, e diga que o frete não está incluso e é calculado pela equipe. Se algum código voltar em nao_encontrados, busque de novo antes de remontar. Para o cliente, o que você monta é um ORÇAMENTO: chame sempre de "orçamento nº X", usando o campo orcamento_numero (o mesmo número do PDF), nunca de "pedido", porque ainda não foi confirmado pela equipe.
- **enviar_orcamento**: envia ao cliente o PDF do pedido montado. Use quando o cliente pedir o orçamento, a proposta ou o PDF, ou confirmar os itens. Antes, monte (ou atualize) com montar_pedido. Depois de enviar, diga em uma frase que o orçamento foi enviado e que a equipe confirma frete e pagamento.
- **buscar_documentos** e **enviar_documento**: quando o cliente pedir um arquivo (vista explodida, desenho de peças, manual, catálogo, ficha técnica, foto do produto), busque na biblioteca com o produto e o tipo que ele disse. Se vier exatamente o que ele pediu, envie com enviar_documento; se vierem vários parecidos, pergunte qual; se não vier nenhum, diga que a equipe envia e chame chamar_humano. Envie só o que ele pediu (no máximo 3 por resposta). Se a ferramenta disser que o documento já foi enviado, diga que está na mensagem daquele horário; reenvie (reenviar=sim) só se o cliente disser que não recebeu.
- **chamar_humano**: chame quando acontecer um destes casos:
${regras.map((r) => `  - ${r}`).join('\n') || '  - o cliente pedir para falar com uma pessoa'}
  Depois de chamar, diga ao cliente, em uma frase, que um especialista vai continuar a conversa por aqui. Não continue o atendimento depois disso.

- **Arquivos e imagens**: você não vê o arquivo em si. Quando a foto ou o PDF do cliente vier com "descrição automática", use a descrição para entender o que ele quer: busque os produtos citados (buscar_produtos) e, se for uma lista de itens com quantidades, monte o orçamento (montar_pedido). Se a descrição estiver incompleta, ilegível ou não bastar para identificar o produto, pergunte o que faltar, sem inventar. Quando NÃO houver descrição (arquivo que não deu para ler, planilha, vídeo), diga com clareza, uma única vez, que por aqui você não consegue abrir o arquivo e peça para escrever na conversa o que precisa; se for pedido de orçamento em arquivo e o cliente preferir não digitar, chame a equipe com chamar_humano. Nunca fale de detalhes do arquivo que não estejam na descrição.
- **O que você consegue enviar**: só o PDF do orçamento (enviar_orcamento) e os documentos da biblioteca (buscar_documentos + enviar_documento). Nunca prometa um arquivo antes de achá-lo na biblioteca, e nunca prometa link, boleto, nota fiscal ou qualquer outro arquivo: diga que a equipe envia e chame chamar_humano com o motivo (ex.: "Cliente pediu a vista explodida do grampeador 14/45, que não está na biblioteca"). Prometer e não enviar deixa o cliente esperando.
- **Nunca diga que enviou sem ter enviado**: só diga "enviei", "reenviei", "segue" ou "está acima na conversa" sobre um arquivo se enviar_orcamento ou enviar_documento devolveu enviado: true NESTA resposta (ou se a ferramenta avisou que o documento já tinha sido enviado). Se não, nada foi enviado. Se o cliente disser que não recebeu, não insista: reenvie ou chame a equipe.
- **Nome do cliente**: use o nome que está em "O que já sabemos deste contato". Um nome que o cliente escreve num cumprimento ("boa tarde, Flávio") é de quem ele espera que atenda, não o dele.

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


def ferramenta_codigo(nome, descricao, codigo_js, schema):
    """Ferramenta cujo código faz mais que uma chamada ao banco (ex.: enviar_orcamento)."""
    return {
        "parameters": {
            "description": descricao,
            "jsCode": RPC_FERRAMENTA + codigo_js,
            "specifyInputSchema": True,
            "schemaType": "manual",
            "inputSchema": json.dumps(schema, ensure_ascii=False, indent=2),
        },
        "type": "@n8n/n8n-nodes-langchain.toolCode",
        "typeVersion": 1.3,
        "name": nome,
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, "livih-agente/" + nome)),
    }


# PDF do orçamento: dados do banco -> serviço livih-pdf (rede interna do n8n) -> bucket midias -> mensagem do agente
# na fila de envio. Docs: docs/agente-pedido.md. Variáveis: LIVIH_SUPABASE_URL, LIVIH_SUPABASE_KEY, LIVIH_PDF_TOKEN.
ENVIAR_ORCAMENTO = r"""
const conversa = $('Validar').first().json.conversa_id;
const URL = $env.LIVIH_SUPABASE_URL;
const auth = { apikey: $env.LIVIH_SUPABASE_KEY, Authorization: `Bearer ${$env.LIVIH_SUPABASE_KEY}` };

const d = await rpc('agente_dados_orcamento', { p_conversa: conversa });
if (!d || d.erro || !d.sucesso) return JSON.stringify(d || { erro: 'sem dados do orçamento' });

// A logo é privada (bucket logos): URL assinada por 10 minutos, só para o serviço baixar.
let logo_url = null;
if (d.logo_path) {
  const s = await this.helpers.httpRequest({
    method: 'POST', url: `${URL}/storage/v1/object/sign/logos/${d.logo_path}`, headers: auth,
    body: { expiresIn: 600 }, json: true, ignoreHttpStatusErrors: true, returnFullResponse: true,
  });
  if (s.statusCode < 400 && s.body?.signedURL) logo_url = `${URL}/storage/v1${s.body.signedURL}`;
}

// O n8n NÃO manipula o PDF: o httpRequest dele embrulhava o binário em JSON ({"type":"Buffer","data":[...]}) e o
// cliente recebia um arquivo que não abre (16/10). Aqui só se cria uma URL de upload assinada (uso único) na pasta
// da conversa; o livih-pdf gera o PDF e sobe direto por ela, sem precisar da chave do Supabase.
const path = `${d.org_id}/${conversa}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-orcamento-${d.pedido.numero}.pdf`;
const assinatura = await this.helpers.httpRequest({
  method: 'POST', url: `${URL}/storage/v1/object/upload/sign/midias/${path}`, headers: auth,
  body: {}, json: true, ignoreHttpStatusErrors: true, returnFullResponse: true,
});
if (assinatura.statusCode >= 400 || !assinatura.body?.url) {
  return JSON.stringify({ erro: `não foi possível preparar o envio do PDF (HTTP ${assinatura.statusCode}); chame a equipe` });
}

const dados = { pedido: { ...d.pedido, contato: null }, itens: d.itens, emissora: d.emissora, cliente: d.cliente, vendedor: d.vendedor };
const pdf = await this.helpers.httpRequest({
  method: 'POST', url: 'http://livih-pdf:3000/orcamento',
  headers: { 'x-livih-token': $env.LIVIH_PDF_TOKEN },
  body: { dados, logo_url, upload_url: `${URL}/storage/v1${assinatura.body.url}` }, json: true,
  ignoreHttpStatusErrors: true, returnFullResponse: true, timeout: 60000,
});
if (pdf.statusCode >= 400 || !pdf.body?.ok) {
  return JSON.stringify({ erro: `não foi possível gerar o PDF (${pdf.body?.erro || 'HTTP ' + pdf.statusCode}); chame a equipe` });
}
const nome = pdf.body.nome || `Orcamento-${d.pedido.numero}.pdf`;

const tipo = d.pedido.status === 'rascunho' ? 'Orçamento' : 'Pedido';
const empresa = d.emissora?.nome_fantasia || d.emissora?.razao_social;
const env = await rpc('agente_enviar_arquivo', {
  p_conversa: conversa, p_path: path, p_nome: nome,
  p_legenda: `${tipo} nº ${d.pedido.numero}${empresa ? ` – ${empresa}` : ''}`,
});
return JSON.stringify({ enviado: !!env?.enviado, orcamento_numero: d.pedido.numero, total: d.pedido.total, aviso: env?.aviso || env?.erro || null });
"""


# Documento da biblioteca (migration 20261016150000, docs/biblioteca-documentos.md): o banco confere e devolve
# origem/destino; o arquivo é COPIADO de `documentos` para a pasta da conversa em `midias` (o histórico guarda a
# cópia) e entra na fila pela mesma agente_enviar_arquivo do orçamento.
ENVIAR_DOCUMENTO = r"""
const conversa = $('Validar').first().json.conversa_id;
const URL = $env.LIVIH_SUPABASE_URL;
const auth = { apikey: $env.LIVIH_SUPABASE_KEY, Authorization: `Bearer ${$env.LIVIH_SUPABASE_KEY}` };
const a = $input.item.json || {};
const id = String(a.documento_id || '').trim();
const reenviar = /^s/i.test(String(a.reenviar || ''));
if (!id) return JSON.stringify({ enviado: false, erro: 'informe documento_id: o id que veio de buscar_documentos' });

const p = await rpc('agente_preparar_documento', { p_conversa: conversa, p_documento: id, p_reenviar: reenviar });
if (!p || p.erro || !p.pronto) return JSON.stringify(p || { enviado: false, erro: 'documento indisponível; chame a equipe' });

const copia = await this.helpers.httpRequest({
  method: 'POST', url: `${URL}/storage/v1/object/copy`, headers: auth,
  body: { bucketId: 'documentos', sourceKey: p.origem, destinationBucket: 'midias', destinationKey: p.destino },
  json: true, ignoreHttpStatusErrors: true, returnFullResponse: true,
});
if (copia.statusCode >= 400) {
  return JSON.stringify({ enviado: false, erro: `não foi possível preparar o arquivo (HTTP ${copia.statusCode}); chame a equipe` });
}
const e = await rpc('agente_enviar_documento', { p_conversa: conversa, p_documento: id, p_path: p.destino });
return JSON.stringify({ enviado: !!e?.enviado, titulo: e?.titulo || p.titulo, aviso: e?.aviso || e?.erro || null });
"""


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
        "montar_pedido",
        "Monta (ou atualiza) o orçamento do cliente com a lista COMPLETA de itens. O preço vem do cadastro. Devolve "
        "orcamento_numero, itens, total e códigos não encontrados.",
        "agente_montar_pedido",
        "{ p_conversa: conversa, p_itens: args.itens, p_observacao: args.observacao || null }",
        {
            "type": "object",
            "properties": {
                "itens": {
                    "type": "array",
                    "description": "Todos os itens do pedido, cada um com o código exato da busca e a quantidade",
                    "items": {
                        "type": "object",
                        "properties": {
                            "codigo": {"type": "string", "description": "Código do produto, exatamente como veio de buscar_produtos"},
                            "quantidade": {"type": "number", "description": "Quantidade na unidade do produto (ex.: caixinhas)"},
                        },
                        "required": ["codigo", "quantidade"],
                    },
                },
                "observacao": {"type": "string", "description": "Observação do cliente sobre o pedido (opcional)"},
            },
            "required": ["itens"],
        },
    ),
    ferramenta_codigo(
        "enviar_orcamento",
        "Gera o PDF do pedido montado e envia ao cliente no WhatsApp. Use depois de montar_pedido, quando o cliente "
        "pedir o orçamento ou confirmar os itens.",
        ENVIAR_ORCAMENTO,
        {"type": "object", "properties": {"confirmar": {"type": "string", "description": "Escreva sim"}}},
    ),
    ferramenta(
        "buscar_documentos",
        "Busca na biblioteca da empresa os arquivos que podem ser enviados ao cliente (vista explodida, manual, "
        "catálogo, ficha técnica...). Devolve id, título, tipo e produtos ligados.",
        "agente_buscar_documentos",
        "{ p_conversa: conversa, p_busca: args.busca }",
        obj({"busca": "O documento e o produto que o cliente pediu, ex.: vista explodida 80W, catálogo de grampos"},
            ["busca"]),
    ),
    ferramenta_codigo(
        "enviar_documento",
        "Envia ao cliente no WhatsApp um documento da biblioteca, pelo id devolvido por buscar_documentos.",
        ENVIAR_DOCUMENTO,
        obj({"documento_id": "O id exato que veio de buscar_documentos",
             "reenviar": "sim só quando o cliente disser que não recebeu o documento já enviado"}, ["documento_id"]),
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
FERRAMENTAS_BASE = copy.deepcopy(FERRAMENTAS)
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


# ============================================================================
# Simulador de conversa (docs/simulador-agente.md; migration 20261019120000)
# ============================================================================
# Mesmo prompt (o Contexto é o do agente, com 3 trocas) e as mesmas ferramentas (nome, descrição e esquema), mas
# sem estado e sem gravar: a tela manda a conversa de teste inteira a cada pergunta; leituras são reais e o que
# gravaria só é simulado. Webhook síncrono (responde com o último nó), sem a espera de 6 s.

def trocar(texto, antigo, novo):
    assert texto.count(antigo) == 1, f"o Contexto do agente mudou; ajuste o simulador: {antigo[:60]!r}"
    return texto.replace(antigo, novo)


VALIDAR_SIM = """// Só o Livih (Edge Function agente-simular) chama este webhook.
const req = $input.first().json;
if ((req.headers?.['x-livih-token'] || '') !== $env.LIVIH_AGENTE_TOKEN) throw new Error('não autorizado');
const { org_id, mensagens, prompt, casos } = req.body || {};
if (!org_id || !Array.isArray(mensagens) || !mensagens.length) throw new Error('pedido inválido');
return [{ json: { org_id, mensagens, prompt: prompt ?? null, casos: casos ?? null } }];
"""

CONTEXTO_SIM = trocar(CONTEXTO, """// Depois da espera: se o cliente mandou outra mensagem (ou um atendente assumiu), esta execução
// desiste; a execução da mensagem mais nova responde tudo junto.
const { conversa_id, mensagem_id } = $input.first().json;
if ((await rpc('agente_deve_responder', { p_conversa: conversa_id, p_mensagem: mensagem_id })) !== true) return [];

const c = await rpc('agente_contexto', { p_conversa: conversa_id });""",
"""// Simulador: a conversa de teste vem inteira da tela (nada no banco); instruções e regras podem ser as não salvas.
const { org_id, mensagens, prompt, casos } = $input.first().json;
const c = await rpc('agente_contexto_simulado', { p_org: org_id, p_mensagens: mensagens, p_prompt: prompt, p_casos: casos });""")
CONTEXTO_SIM = trocar(CONTEXTO_SIM, """if (saudacaoAgora) {
  const r = await rpc('agente_responder', { p_conversa: conversa_id, p_texto: textoAbertura, p_mensagem: mensagem_id });
  if (r?.enviado === false) return [];
}
""", "// Simulador: a saudação não é enviada; volta para a tela junto com a resposta.\n")
CONTEXTO_SIM = trocar(CONTEXTO_SIM, "return [{ json: { conversa_id, mensagem_id, prompt_sistema, entrada } }];",
                      "return [{ json: { org_id, prompt_sistema, entrada, saudacao: saudacaoAgora ? textoAbertura : null } }];")

RESPONDER_SIM = r"""// Volta para a tela: saudação automática (se saiu), a resposta e o que o agente fez (ferramentas).
const out = $input.first().json;
const texto = String(out.output || '').trim();
// O n8n embrulha o retorno da ferramenta em [{"response": "<json>"}]: devolve só o que a ferramenta respondeu.
const desembrulhar = (o) => {
  try {
    const v = typeof o === 'string' ? JSON.parse(o) : o;
    if (Array.isArray(v) && v.length === 1 && typeof v[0]?.response === 'string') return v[0].response;
  } catch {}
  return typeof o === 'string' ? o : JSON.stringify(o ?? '');
};
const passos = (out.intermediateSteps || []).map((p) => ({
  ferramenta: p.action?.tool || null,
  entrada: p.action?.toolInput ?? null,
  saida: desembrulhar(p.observation).slice(0, 4000),
}));
return [{ json: {
  saudacao: $('Contexto').first().json.saudacao,
  resposta: !texto || /^\W*SEM_RESPOSTA\W*$/i.test(texto) ? null : texto,
  passos,
  execucao: $execution.id,
} }];
"""

SIMULADO = "JSON.stringify({ sucesso: true, simulado: true })"
CORPO_SIM = {
    "atualizar_contato": SIMULADO,
    "registrar_oportunidade": SIMULADO,
    "mover_etapa": SIMULADO,
    "registrar_nota": SIMULADO,
    "buscar_produtos": "JSON.stringify(await rpc('buscar_produtos_org', { p_org: org, p_busca: args.busca, p_limite: 8 }))",
    "buscar_documentos": "JSON.stringify(await rpc('buscar_documentos_org', { p_org: org, p_busca: args.busca }))",
    "montar_pedido": "JSON.stringify(await rpc('simulador_montar_pedido', { p_org: org, p_itens: args.itens, p_observacao: args.observacao || null }))",
    "enviar_orcamento": "JSON.stringify({ enviado: true, simulado: true })",
    "enviar_documento": "JSON.stringify(await rpc('simulador_documento', { p_org: org, p_documento: String(args.documento_id || '').trim() }))",
    "chamar_humano": "JSON.stringify({ sucesso: true, simulado: true })",
}

ferramentas_sim = []
for t in FERRAMENTAS_BASE:
    nome = t["name"]
    assert nome in CORPO_SIM, f"ferramenta nova sem versão no simulador: {nome}"
    campos = json.dumps(list(json.loads(t["parameters"]["inputSchema"]).get("properties", {}).keys()))
    t = copy.deepcopy(t)
    t["id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, "livih-simulador/" + nome))
    t["parameters"]["jsCode"] = RPC_FERRAMENTA + f"""
// Simulador: a empresa vem do webhook; nada é gravado nem enviado.
const org = $('Validar').first().json.org_id;
const CAMPOS = {campos};
const args = Object.fromEntries(Object.entries($input.item.json || {{}}).filter(([k]) => CAMPOS.includes(k)));
return {CORPO_SIM[nome]};
"""
    ferramentas_sim.append(t)
for i, t in enumerate(ferramentas_sim):
    t["position"] = [880 + i * 150, 260]


def no_sim(nome, tipo, versao, params, pos, **extra):
    n = no(nome, tipo, versao, params, pos, **extra)
    n["id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, "livih-simulador/" + nome))
    return n


nodes_sim = [
    no_sim("Webhook", "n8n-nodes-base.webhook", 2.1,
           {"httpMethod": "POST", "path": "livih-agente-simulador", "responseMode": "lastNode",
            "responseData": "firstEntryJson", "options": {}},
           [0, 0], webhookId="5f0d6c1e-1a2b-4a9e-9a61-0000000000b1"),
    no_sim("Validar", "n8n-nodes-base.code", 2, {"jsCode": VALIDAR_SIM}, [220, 0]),
    no_sim("Contexto", "n8n-nodes-base.code", 2, {"jsCode": CONTEXTO_SIM}, [440, 0]),
    no_sim("AI Agent", "@n8n/n8n-nodes-langchain.agent", 3.1,
           {"promptType": "define", "text": "={{ $json.entrada }}",
            "options": {"systemMessage": "={{ $json.prompt_sistema }}", "maxIterations": 8,
                        "returnIntermediateSteps": True}}, [700, 0]),
    no_sim("OpenAI Chat Model", "@n8n/n8n-nodes-langchain.lmChatOpenAi", 1.3,
           {"model": {"__rl": True, "mode": "list", "value": "gpt-5-mini"}, "builtInTools": {}, "options": {}}, [560, 260],
           credentials={"openAiApi": {"id": "7sGjuIVHzRDjq3T0", "name": "OpenAI account"}}),
    no_sim("Responder", "n8n-nodes-base.code", 2, {"jsCode": RESPONDER_SIM}, [1100, 0]),
] + ferramentas_sim

conexoes_sim = {
    "Webhook": {"main": [[{"node": "Validar", "type": "main", "index": 0}]]},
    "Validar": {"main": [[{"node": "Contexto", "type": "main", "index": 0}]]},
    "Contexto": {"main": [[{"node": "AI Agent", "type": "main", "index": 0}]]},
    "AI Agent": {"main": [[{"node": "Responder", "type": "main", "index": 0}]]},
    "OpenAI Chat Model": {"ai_languageModel": [[{"node": "AI Agent", "type": "ai_languageModel", "index": 0}]]},
}
for t in ferramentas_sim:
    conexoes_sim[t["name"]] = {"ai_tool": [[{"node": "AI Agent", "type": "ai_tool", "index": 0}]]}

with open("n8n/livih-simulador.json", "w", encoding="utf-8") as f:
    json.dump({"id": "LvhSimuladorAg01", "name": "Livih — Simulador do agente", "active": False, "nodes": nodes_sim,
               "connections": conexoes_sim, "settings": {"executionOrder": "v1"}, "pinData": {}},
              f, ensure_ascii=False, indent=2)
print("n8n/livih-simulador.json:", len(nodes_sim), "nós")
