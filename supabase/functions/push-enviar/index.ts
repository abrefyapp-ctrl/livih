// Entrega as notificações push da fila (push_fila) aos aparelhos inscritos (push_inscricoes).
// Chamada só pelo banco (header x-livih-segredo, conferido no Vault): trigger da fila e o "preparar".
// As chaves VAPID nascem aqui na primeira execução e ficam no Vault (push_salvar_chaves); a pública vai para
// push_config, que o front lê para inscrever o aparelho.

import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
// Contato exigido pelo protocolo VAPID: o serviço de push usa se precisar avisar sobre abuso.
const CONTATO = "mailto:contato@livih.com.br";

let servidor: webpush.ApplicationServer | null = null;

async function servidorPush(): Promise<webpush.ApplicationServer> {
  if (servidor) return servidor;
  let { data: chaves } = await supabase.rpc("push_chaves");
  if (!chaves) {
    const par = await webpush.generateVapidKeys({ extractable: true });
    const exportadas = await webpush.exportVapidKeys(par);
    const publica = await webpush.exportApplicationServerKey(par);
    const { data, error } = await supabase.rpc("push_salvar_chaves", { p_chaves: exportadas, p_publica: publica });
    if (error) throw new Error(`push_salvar_chaves: ${error.message}`);
    chaves = data;
  }
  const vapidKeys = await webpush.importVapidKeys(chaves);
  servidor = await webpush.ApplicationServer.new({ contactInformation: CONTATO, vapidKeys });
  return servidor;
}

type Item = { fila_id: number; user_id: string; conversa_id: string | null; titulo: string; corpo: string; url: string };
type Inscricao = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

Deno.serve(async (req) => {
  const { data: autorizado } = await supabase.rpc("verificar_segredo_interno", {
    p_segredo: req.headers.get("x-livih-segredo") ?? "",
  });
  if (autorizado !== true) return new Response("não autorizado", { status: 401 });

  const app = await servidorPush();
  const corpo = await req.json().catch(() => ({}));
  if (corpo?.acao === "preparar") return Response.json({ ok: true });

  const { data: itens, error } = await supabase.rpc("push_reivindicar", { p_limite: 100 });
  if (error) return Response.json({ erro: error.message }, { status: 500 });
  const lista = (itens ?? []) as Item[];
  if (!lista.length) return Response.json({ enviadas: 0 });

  const usuarios = [...new Set(lista.map((i) => i.user_id))];
  const { data: insc } = await supabase.from("push_inscricoes").select("id, user_id, endpoint, p256dh, auth").in("user_id", usuarios);
  const porUsuario = new Map<string, Inscricao[]>();
  for (const i of (insc ?? []) as Inscricao[]) porUsuario.set(i.user_id, [...(porUsuario.get(i.user_id) ?? []), i]);

  let enviadas = 0, falhas = 0;
  const vencidas: string[] = [];
  await Promise.all(lista.map(async (item) => {
    const mensagem = JSON.stringify({
      titulo: item.titulo,
      corpo: item.corpo,
      url: item.url,
      tag: item.conversa_id ?? `teste-${item.fila_id}`,
    });
    const erros: string[] = [];
    await Promise.all((porUsuario.get(item.user_id) ?? []).map(async (i) => {
      try {
        await app.subscribe({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } })
          .pushTextMessage(mensagem, { urgency: webpush.Urgency.High, ttl: 3600, topic: undefined });
        enviadas++;
      } catch (e) {
        falhas++;
        // Aparelho desinstalou o app ou revogou a permissão: a inscrição não volta mais.
        if (e instanceof webpush.PushMessageError && e.isGone()) vencidas.push(i.id);
        else erros.push(String(e).slice(0, 200));
      }
    }));
    if (erros.length) await supabase.from("push_fila").update({ erro: erros.join(" | ").slice(0, 500) }).eq("id", item.fila_id);
  }));
  if (vencidas.length) await supabase.from("push_inscricoes").delete().in("id", vencidas);

  return Response.json({ enviadas, falhas, removidas: vencidas.length });
});
