// Convida alguém para a equipe de uma organização. Chamada pela tela de Configurações → Equipe.
//
// Só o dono da organização convida (mesma regra da policy membros_gerir). Não manda e-mail: devolve
// um link de convite para o dono repassar (WhatsApp, por exemplo) — o link abre /definir-senha já
// logado. Se a pessoa já tem conta no Livih, só entra na equipe e usa a senha que já tem.
//
// POST { org_id, email, nome?, papel: 'admin' | 'atendente', redirect_to }
//   → { link } (conta nova ou ainda sem senha) | { link: null } (já tinha conta: entra com a senha dela)
//   409 se já está na equipe
// POST { org_id, email, acao: 'redefinir', redirect_to } → { link } para alguém da equipe criar senha nova
//   (esqueceu a senha) sem depender do e-mail do Supabase.

import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_SUPABASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Um link de senha para conta que JÁ existe entrega a conta a quem gerou. Só o dono da organização
// pode gerar, e só para quem não tem acesso a mais nada: se a pessoa está em outra organização (ou é admin
// da plataforma), o dono desta tomaria a conta e veria a outra. Nesses casos, "Esqueci minha senha" (vai
// para o e-mail dela).
async function soDestaOrganizacao(userId: string, orgId: string): Promise<boolean> {
  const [{ count }, { data: adm }] = await Promise.all([
    admin.from("membros_org").select("org_id", { count: "exact", head: true }).eq("user_id", userId).neq("org_id", orgId),
    admin.from("admins_plataforma").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  return (count ?? 0) === 0 && !adm;
}
const SO_PELO_EMAIL = "Essa pessoa também tem acesso a outra organização. Peça para ela usar “Esqueci minha senha” na tela de entrar.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { erro: "use POST" });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await admin.auth.getUser(token);
  if (!quem.user) return json(401, { erro: "faça login de novo" });

  let p: { org_id?: string; email?: string; nome?: string; papel?: string; redirect_to?: string; acao?: string };
  try {
    p = await req.json();
  } catch {
    return json(400, { erro: "corpo inválido" });
  }
  const email = (p.email ?? "").trim().toLowerCase();
  const papel = p.papel === "admin" ? "admin" : "atendente";
  if (!p.org_id || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { erro: "Informe um e-mail válido." });

  // Mesma regra da RLS: só o dono da organização.
  const { data: dono } = await admin
    .from("membros_org")
    .select("user_id")
    .eq("org_id", p.org_id)
    .eq("user_id", quem.user.id)
    .eq("papel", "dono")
    .eq("ativo", true)
    .maybeSingle();
  if (!dono) return json(403, { erro: "Só o dono da organização convida pessoas." });

  // O link só pode levar para o próprio app (a lista de redirecionamentos do Auth também confere).
  let redirectTo: string | undefined;
  try {
    const u = new URL(p.redirect_to ?? "");
    if (u.pathname === "/definir-senha") redirectTo = u.toString();
  } catch { /* sem redirect: vale o Site URL do Auth */ }

  const { data: achados } = await admin.rpc("usuario_por_email", { p_email: email });
  const existente = (achados as { id: string; senha_definida: boolean }[] | null)?.[0];

  if (p.acao === "redefinir") {
    const { data: membro } = existente
      ? await admin.from("membros_org").select("ativo").eq("org_id", p.org_id).eq("user_id", existente.id).maybeSingle()
      : { data: null };
    if (!membro?.ativo) return json(404, { erro: "Essa pessoa não está ativa na equipe." });
    if (!(await soDestaOrganizacao(existente!.id, p.org_id))) return json(409, { erro: SO_PELO_EMAIL });
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    if (error) {
      console.error("generateLink recovery", error.message);
      return json(500, { erro: "Não foi possível gerar o link. Tente de novo." });
    }
    return json(200, { link: data.properties.action_link });
  }

  if (existente) {
    const { data: membro } = await admin
      .from("membros_org")
      .select("ativo")
      .eq("org_id", p.org_id)
      .eq("user_id", existente.id)
      .maybeSingle();
    // Já está na equipe e ativo: convite novo não mexe no papel (isso é na lista da equipe).
    if (membro?.ativo && existente.senha_definida) return json(409, { erro: "Essa pessoa já está na equipe." });
  }

  let userId = existente?.id ?? null;
  let link: string | null = null;
  let aviso: string | null = null;
  const nome = (p.nome ?? "").trim();

  if (!existente) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo, data: nome ? { nome } : undefined },
    });
    if (error || !data.user) {
      console.error("generateLink invite", error?.message);
      return json(500, { erro: "Não foi possível criar o convite. Tente de novo." });
    }
    userId = data.user.id;
    link = data.properties.action_link;
  } else if (!existente.senha_definida && !(await soDestaOrganizacao(existente.id, p.org_id))) {
    aviso = SO_PELO_EMAIL; // entra na equipe, mas o link de senha só pelo e-mail dela
  } else if (!existente.senha_definida) {
    // Convidado antes e ainda sem senha: link novo para criar a senha.
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    if (error) {
      console.error("generateLink recovery", error.message);
      return json(500, { erro: "Não foi possível gerar um link novo. Tente de novo." });
    }
    link = data.properties.action_link;
  }
  if (nome && link) await admin.from("perfis").update({ nome }).eq("user_id", userId!);

  const { error: erroMembro } = await admin
    .from("membros_org")
    .upsert({ org_id: p.org_id, user_id: userId!, papel, ativo: true }, { onConflict: "org_id,user_id" });
  if (erroMembro) {
    console.error("membros_org", erroMembro.message);
    return json(500, { erro: "A conta existe, mas não entrou na equipe. Tente de novo." });
  }

  return json(200, { link, aviso });
});
