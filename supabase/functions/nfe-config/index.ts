// NF-e pela Focus NFe, entrega 1 (docs/nfe.md): cadastra ou atualiza o CNPJ (emissora) na conta de revenda da Livih.
//
// Configurações → Empresa → CNPJ → Nota fiscal → Salvar. A tela grava os dados fiscais na emissora e chama esta função:
//   { emissora_id, certificado_base64?, senha_certificado? } → { status, certificado_validade, mensagem? }
// Login validado aqui dentro (dono/admin da empresa ou a equipe da plataforma). O certificado e a senha vão direto
// para a Focus: não são gravados nem aparecem em log. Os tokens que a Focus devolve para o CNPJ ficam no Vault.

import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
// A API de empresas fica no servidor de produção, com o token principal da conta da Livih.
const FOCUS_EMPRESAS = "https://api.focusnfe.com.br/v2/empresas";
const TOKEN_REVENDA = Deno.env.get("FOCUS_TOKEN_PRODUCAO") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Emissora = {
  id: string; org_id: string; razao_social: string; nome_fantasia: string | null; cnpj: string;
  inscricao_estadual: string | null; cep: string | null; logradouro: string | null; numero: string | null;
  complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null; telefone: string | null;
  email: string | null; regime_tributario: number | null; nfe_serie: number; nfe_status: string;
  focus_empresa_id: number | null; certificado_validade: string | null;
};

/** O que falta no cadastro do CNPJ para a Focus aceitar (a tela mostra a lista). */
function faltando(e: Emissora): string[] {
  const f: string[] = [];
  if (!e.regime_tributario) f.push("regime tributário");
  if (!e.cep) f.push("CEP");
  if (!e.logradouro) f.push("rua");
  if (!e.numero) f.push("número (ou SN)");
  if (!e.bairro) f.push("bairro");
  if (!e.cidade) f.push("cidade");
  if (!e.uf) f.push("UF");
  return f;
}

/** Mensagens de erro da Focus em português legível (vêm em erros[] com campo e mensagem). */
function mensagemFocus(corpo: unknown, status: number): string {
  const c = corpo as { mensagem?: string; erros?: { mensagem?: string; campo?: string }[] } | null;
  const lista = (c?.erros ?? []).map((e) => e.mensagem).filter(Boolean);
  if (lista.length) return lista.join(" · ");
  if (c?.mensagem) return c.mensagem;
  return status === 401 ? "A conta da Livih na Focus recusou o acesso (token)." : `A Focus respondeu ${status}.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });
  if (!TOKEN_REVENDA) return json(500, { erro: "A conta da Livih na Focus não está configurada (FOCUS_TOKEN_PRODUCAO)." });

  let p: { emissora_id?: string; certificado_base64?: string; senha_certificado?: string };
  try {
    p = await req.json();
  } catch {
    return json(400, { erro: "corpo inválido" });
  }

  const tokenUsuario = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await admin.auth.getUser(tokenUsuario);
  if (!quem.user) return json(401, { erro: "Faça login de novo." });
  if (!p.emissora_id) return json(400, { erro: "emissora_id obrigatório" });

  const { data: e } = await admin.from("emissoras").select("*").eq("id", p.emissora_id).maybeSingle<Emissora>();
  if (!e) return json(404, { erro: "CNPJ não encontrado." });

  // Dono/admin da empresa, ou a equipe da plataforma (modo suporte).
  const [{ data: membro }, { data: plataforma }] = await Promise.all([
    admin.from("membros_org").select("papel").eq("org_id", e.org_id).eq("user_id", quem.user.id).eq("ativo", true).maybeSingle(),
    admin.from("admins_plataforma").select("user_id").eq("user_id", quem.user.id).maybeSingle(),
  ]);
  if (!plataforma && membro?.papel !== "dono" && membro?.papel !== "admin") {
    return json(403, { erro: "Só o dono e os administradores configuram a nota fiscal." });
  }

  const falta = faltando(e);
  if (falta.length) return json(422, { erro: `Preencha no cadastro do CNPJ: ${falta.join(", ")}.`, faltando: falta });
  const temCertificado = !!p.certificado_base64;
  if (temCertificado && !p.senha_certificado) return json(422, { erro: "Informe a senha do certificado." });
  if (!temCertificado && !e.focus_empresa_id) {
    return json(422, { erro: "Envie o certificado digital A1 (.pfx) com a senha para cadastrar o CNPJ na Focus." });
  }

  const ie = (e.inscricao_estadual ?? "").replace(/\D/g, "");
  const corpo: Record<string, unknown> = {
    nome: e.razao_social,
    nome_fantasia: e.nome_fantasia || e.razao_social,
    cnpj: e.cnpj,
    ...(ie ? { inscricao_estadual: Number(ie) } : {}),
    regime_tributario: e.regime_tributario,
    email: e.email || undefined,
    telefone: e.telefone || undefined,
    logradouro: e.logradouro,
    numero: e.numero,
    complemento: e.complemento || undefined,
    bairro: e.bairro,
    municipio: e.cidade,
    cep: Number(e.cep),
    uf: e.uf,
    habilita_nfe: true,
    discrimina_impostos: true,
    enviar_email_destinatario: true,
    serie_nfe_producao: String(e.nfe_serie),
    serie_nfe_homologacao: String(e.nfe_serie),
    ...(temCertificado
      ? { arquivo_certificado_base64: p.certificado_base64, senha_certificado: p.senha_certificado, certificado_especifico: true }
      : {}),
  };

  const url = e.focus_empresa_id ? `${FOCUS_EMPRESAS}/${e.focus_empresa_id}` : FOCUS_EMPRESAS;
  let r: Response;
  try {
    r = await fetch(url, {
      method: e.focus_empresa_id ? "PUT" : "POST",
      headers: { Authorization: `Basic ${btoa(`${TOKEN_REVENDA}:`)}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    console.error("focus empresas", String(err).slice(0, 200));
    return json(502, { erro: "A Focus não respondeu. Tente de novo em instantes." });
  }
  const resposta = await r.json().catch(() => null);

  if (!r.ok) {
    const mensagem = mensagemFocus(resposta, r.status);
    console.error("focus empresas", r.status, e.id, mensagem.slice(0, 300));
    // CNPJ já pronto continua pronto (só esta atualização falhou); o erro fica visível na tela.
    await admin.from("emissoras").update({
      nfe_status: e.nfe_status === "pronta" ? "pronta" : "erro", nfe_erro: mensagem.slice(0, 2000), nfe_sincronizado_em: new Date().toISOString(),
    }).eq("id", e.id);
    return json(422, { erro: mensagem, status: e.nfe_status === "pronta" ? "pronta" : "erro" });
  }

  const f = resposta as {
    id?: number; token_producao?: string; token_homologacao?: string; certificado_valido_ate?: string | null; certificado_cnpj?: string | null;
  };
  const { error: erroTokens } = await admin.rpc("nfe_salvar_tokens", {
    p_emissora: e.id, p_producao: f.token_producao ?? null, p_homologacao: f.token_homologacao ?? null,
  });
  if (erroTokens) console.error("nfe_salvar_tokens", erroTokens.message);

  const validade = f.certificado_valido_ate ?? e.certificado_validade;
  const temTokens = !erroTokens && (!!f.token_homologacao || !!f.token_producao || !!e.focus_empresa_id);
  const vencido = !!validade && new Date(validade) < new Date();
  const status = validade && !vencido && temTokens ? "pronta" : "pendente";
  const mensagem = vencido
    ? "O certificado está vencido: envie o novo."
    : !validade ? "A Focus ainda não registrou o certificado: envie o arquivo .pfx com a senha." : null;
  await admin.from("emissoras").update({
    focus_empresa_id: f.id ?? e.focus_empresa_id,
    certificado_validade: validade,
    certificado_cnpj: f.certificado_cnpj ?? null,
    nfe_status: status,
    nfe_erro: mensagem,
    nfe_sincronizado_em: new Date().toISOString(),
  }).eq("id", e.id);

  return json(200, { status, certificado_validade: validade, mensagem });
});
