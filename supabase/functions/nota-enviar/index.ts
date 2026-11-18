// Mandar a NF-e ao cliente pelo WhatsApp e por e-mail (docs/balcao.md, entrega 2). Chamada pela tela: no balcão,
// logo depois de emitir (a nota ainda está na SEFAZ: o envio fica pendente e a nfe-retorno manda quando ela for
// autorizada); no bloco da nota, "Enviar ao cliente" (a nota já autorizada: manda na hora).
//
// POST { nota_id, whatsapp?, contato_id?, email?, salvar_email? } → { envios }
// Quem pode: quem vê a nota (equipe ou balcão; a RLS de notas_fiscais decide). O contato escolhido precisa ser do
// cliente da venda. "salvar_email" grava o e-mail no cadastro do cliente (decisão de 27/10). O WhatsApp novo vira um
// contato ligado ao cliente (nota_whatsapp_preparar), sem trocar o telefone de contato nenhum.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { processarEnvios } from "../_shared/envioNota.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Celular ou fixo brasileiro com DDD, com ou sem 55: devolve 55 + DDD + número. */
function telefone(v: string | undefined): string | null {
  let d = (v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^55\d{10,11}$/.test(d) ? d : null;
}
const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  const autorizacao = req.headers.get("Authorization") ?? "";
  const { data: quem } = await admin.auth.getUser(autorizacao.replace(/^Bearer\s+/i, ""));
  if (!quem.user) return json(401, { erro: "Faça login de novo." });

  let p: { nota_id?: string; whatsapp?: string; contato_id?: string; email?: string; salvar_email?: boolean };
  try {
    p = await req.json();
  } catch {
    return json(400, { erro: "corpo inválido" });
  }
  if (!p.nota_id) return json(400, { erro: "nota_id obrigatório" });

  // Com o login da pessoa: só a nota que ela vê.
  const comoUsuario = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false }, global: { headers: { Authorization: autorizacao } },
  });
  const { data: nota } = await comoUsuario.from("notas_fiscais").select("id, org_id, pedido_id, status, modelo").eq("id", p.nota_id).maybeSingle();
  if (!nota) return json(404, { erro: "Nota não encontrada." });
  if (nota.modelo !== "nfe") return json(400, { erro: "Por aqui só sai a NF-e." });
  if (nota.status !== "autorizada" && nota.status !== "processando") {
    return json(400, { erro: "Essa nota não foi autorizada: não dá para mandar ao cliente." });
  }

  const numero = p.whatsapp ? telefone(p.whatsapp) : null;
  if (p.whatsapp && !numero) return json(400, { erro: "Confira o WhatsApp: DDD e número, como (41) 99999-8888." });
  const email = (p.email ?? "").trim().toLowerCase();
  if (email && !emailValido(email)) return json(400, { erro: "Confira o e-mail." });
  if (!numero && !email) return json(400, { erro: "Informe o WhatsApp ou o e-mail." });

  const { data: ped } = await admin.from("pedidos").select("cliente_id").eq("id", nota.pedido_id).maybeSingle();
  const clienteId = ped?.cliente_id ?? null;
  let contatoId: string | null = null;
  if (numero && p.contato_id && clienteId) {
    const { data: ligado } = await admin.from("contatos_clientes").select("contato_id")
      .eq("cliente_id", clienteId).eq("contato_id", p.contato_id).maybeSingle();
    const { data: ct } = await admin.from("contatos").select("telefone").eq("id", p.contato_id).maybeSingle();
    // O número escolhido na lista é o do contato; se foi corrigido, vale o número digitado (outro contato).
    if (ligado && ct?.telefone === numero) contatoId = p.contato_id;
  }

  if (email && p.salvar_email && clienteId) {
    await admin.from("clientes").update({ email }).eq("id", clienteId);
    await admin.from("auditoria").insert({
      org_id: nota.org_id, ator_tipo: "atendente", ator_id: quem.user.id, acao: "salvar_email_nota", entidade: "clientes",
      entidade_id: clienteId, depois: { email },
    });
  }

  const linhas = [
    ...(numero ? [{ org_id: nota.org_id, nota_id: nota.id, canal: "whatsapp", destino: numero, contato_id: contatoId, criado_por: quem.user.id }] : []),
    ...(email ? [{ org_id: nota.org_id, nota_id: nota.id, canal: "email", destino: email, criado_por: quem.user.id }] : []),
  ];
  const { error } = await admin.from("nota_envios").insert(linhas);
  if (error) {
    console.error("nota_envios", error.message);
    return json(500, { erro: "Não foi possível registrar o envio. Tente de novo." });
  }

  // Autorizada com o DANFE: manda agora. Ainda na SEFAZ (ou sem o DANFE copiado): a nfe-retorno manda depois. Confere
  // de novo aqui (e não pelo status lido antes) para não perder a nota autorizada entre a leitura e o registro.
  await processarEnvios(admin, nota.id);
  const { data: envios } = await admin.from("nota_envios").select("id, canal, destino, situacao, resultado, criado_em")
    .eq("nota_id", nota.id).order("criado_em", { ascending: false });
  return json(200, { envios: envios ?? [] });
});
