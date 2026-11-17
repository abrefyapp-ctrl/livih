// O que os webhooks de entrada (WAHA e Meta) fazem igual depois de gravar a mensagem:
// acordar o agente no n8n e transcrever áudio.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
export const AUDIO_MAX_SEGUNDOS = 5 * 60;

export type Entrada = { org_id: string; conversa_id: string; mensagem_id: string; chamar_agente: boolean };

export function emSegundoPlano(p: Promise<unknown>) {
  const tarefa = p.catch((e) => console.error("segundo plano", String(e)));
  // @ts-ignore EdgeRuntime existe no runtime do Supabase
  globalThis.EdgeRuntime?.waitUntil?.(tarefa);
}

// Conversa com o bot → avisa o agente no n8n. Só a referência vai; o n8n lê o resto do banco.
// Se o agente não pode ser chamado, o cliente não pode ficar sem resposta em silêncio: a conversa vai para a
// equipe (aguardando_humano) com o motivo. Aconteceu em 08/10/2026: os secrets do n8n sumiram do projeto e o
// agente parou de responder sem nenhum aviso.
export async function avisarAgente(supabase: SupabaseClient, ref: { org_id: string; conversa_id: string; mensagem_id: string }) {
  const agenteUrl = Deno.env.get("N8N_AGENTE_URL");
  const token = Deno.env.get("N8N_AGENTE_TOKEN");
  let falha: string | null = null;
  if (!agenteUrl || !token) {
    falha = "Agente indisponível (configuração do servidor)";
  } else {
    try {
      const r = await fetch(agenteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-livih-token": token },
        body: JSON.stringify({ org_id: ref.org_id, conversa_id: ref.conversa_id, mensagem_id: ref.mensagem_id }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) {
        console.error("n8n", r.status, (await r.text()).slice(0, 200));
        falha = `Agente indisponível (n8n respondeu ${r.status})`;
      }
    } catch (e) {
      console.error("n8n", String(e));
      falha = "Agente indisponível (n8n fora do ar)";
    }
  }
  if (falha) {
    console.error("agente não acionado:", falha, ref.conversa_id);
    await supabase.from("conversas").update({ estado: "aguardando_humano", motivo_humano: falha })
      .eq("id", ref.conversa_id).eq("estado", "bot");
  }
}

/**
 * Transcreve o áudio (gpt-4o-transcribe, em português). Separada em 17/11 para o simulador (agente-simular) usar a
 * mesma transcrição da entrada pelo WhatsApp. O webm é o que o navegador grava no "Testar agente"; no WhatsApp
 * chega ogg. Devolve null se falhar.
 */
export async function transcrever(
  bytes: ArrayBuffer, mime: string | undefined,
): Promise<{ texto: string; tokensEntrada: number; tokensSaida: number } | null> {
  if (!OPENAI_API_KEY) return null;
  const tipo = (mime ?? "audio/ogg").split(";")[0];
  const ext = tipo.includes("mpeg") || tipo.includes("mp3") ? "mp3" : tipo.includes("mp4") || tipo.includes("m4a") ? "m4a" : tipo.includes("webm") ? "webm"
    : tipo.includes("wav") ? "wav" : "ogg";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: tipo }), `audio.${ext}`);
  form.append("model", "gpt-4o-transcribe");
  form.append("language", "pt");
  const t = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const corpo = await t.json().catch(() => null);
  if (!t.ok || !corpo?.text) {
    console.error("transcrição", t.status, JSON.stringify(corpo).slice(0, 200));
    return null;
  }
  return { texto: corpo.text, tokensEntrada: Number(corpo.usage?.input_tokens ?? 0), tokensSaida: Number(corpo.usage?.output_tokens ?? 0) };
}

// Baixa o áudio (o arquivo não é guardado), transcreve e grava. Áudio longo demais não é transcrito:
// o agente vê "[audio]" e pede um áudio mais curto ou texto. `baixar` sabe autenticar no provedor.
export async function transcreverEAvisar(
  supabase: SupabaseClient, baixar: () => Promise<Response>, mime: string | undefined, segundos: number, entrada: Entrada,
) {
  let chamar = entrada.chamar_agente;
  if (OPENAI_API_KEY && (!segundos || segundos <= AUDIO_MAX_SEGUNDOS)) {
    const audio = await baixar();
    if (audio.ok) {
      const t = await transcrever(await audio.arrayBuffer(), mime);
      if (t) {
        const { data } = await supabase.rpc("registrar_transcricao", { p_mensagem: entrada.mensagem_id, p_transcricao: t.texto });
        chamar = data?.chamar_agente ?? chamar;
        // Consumo de IA (tabela uso_ia): falha aqui não atrapalha o atendimento.
        const { error: erroUso } = await supabase.from("uso_ia").upsert({
          org_id: entrada.org_id, conversa_id: entrada.conversa_id, mensagem_id: entrada.mensagem_id,
          tipo: "transcricao", modelo: "gpt-4o-transcribe",
          tokens_entrada: t.tokensEntrada, tokens_saida: t.tokensSaida,
          segundos_audio: segundos || null, origem_ref: `audio:${entrada.mensagem_id}`,
        }, { onConflict: "origem_ref", ignoreDuplicates: true });
        if (erroUso) console.error("uso_ia transcrição", erroUso.message);
      }
    } else console.error("download do áudio", audio.status);
  }
  if (chamar) await avisarAgente(supabase, entrada);
}

// Celular brasileiro sem o 9 (contas antigas, e a Meta manda o wa_id assim) ganha o 9: na Livih todo telefone tem.
export function normalizarTelefone(numero: string | null | undefined): string | undefined {
  const d = String(numero ?? "").replace(/\D/g, "");
  const br = d.match(/^55(\d{2})(\d{8})$/);
  const tel = br && /^[6-9]/.test(br[2]) ? `55${br[1]}9${br[2]}` : d;
  return /^\d{10,15}$/.test(tel) ? tel : undefined;
}
