import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// Simulador de conversa (Edge Function agente-simular, docs/simulador-agente.md): a conversa de teste fica só na
// tela e vai inteira a cada pergunta. Nada vai para o WhatsApp nem para o histórico.

export type MensagemTeste = { de: 'cliente' | 'assistente'; texto: string; saudacao?: boolean; passos?: Passo[] }
export type Passo = { ferramenta: string | null; entrada: unknown; saida: string }
export type RespostaTeste = { saudacao: string | null; resposta: string | null; passos: Passo[] }

export async function simular(
  orgId: string,
  mensagens: MensagemTeste[],
  rascunho: { prompt: string; casos: string[] } | null,
): Promise<RespostaTeste> {
  const { data, error } = await supabase.functions.invoke('agente-simular', {
    body: {
      org_id: orgId,
      mensagens: mensagens.map((m) => ({ de: m.de, texto: m.texto })),
      prompt: rascunho?.prompt ?? null,
      casos: rascunho?.casos ?? null,
    },
  })
  if (error) {
    const corpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
    throw new Error(corpo?.erro ?? 'O agente não respondeu. Tente de novo.')
  }
  return data as RespostaTeste
}

const lerJson = (t: string) => {
  try {
    return JSON.parse(t) as Record<string, unknown>
  } catch {
    return null
  }
}
const texto = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v))

/** O que o agente fez, em uma linha que o dono da empresa entende. */
export function descreverPasso(p: Passo): string {
  const e = (typeof p.entrada === 'object' && p.entrada ? p.entrada : {}) as Record<string, unknown>
  const s = lerJson(p.saida) ?? {}
  switch (p.ferramenta) {
    case 'buscar_produtos':
      return `Buscou produtos: “${texto(e.busca)}” → ${Number(s.encontrados ?? 0)} encontrado(s)`
    case 'buscar_documentos':
      return `Buscou documentos: “${texto(e.busca)}” → ${Number(s.encontrados ?? 0)} encontrado(s)`
    case 'montar_pedido':
      return s.sucesso ? `Montou o orçamento: ${texto(s.total_formatado)}` : `Tentou montar o orçamento: ${texto(s.aviso)}`
    case 'enviar_orcamento':
      return 'Enviaria o PDF do orçamento'
    case 'enviar_documento':
      return s.enviado ? `Enviaria o documento “${texto(s.titulo)}”` : `Não achou o documento: ${texto(s.aviso)}`
    case 'chamar_humano':
      return `Passaria para a equipe: ${texto(e.motivo)}`
    case 'atualizar_contato':
      return `Gravaria no contato: ${Object.entries(e).map(([k, v]) => `${k} = ${texto(v)}`).join(', ')}`
    case 'registrar_oportunidade':
      return `Registraria a oportunidade “${texto(e.titulo)}”`
    case 'mover_etapa':
      return `Moveria para a etapa “${texto(e.etapa)}”`
    case 'registrar_nota':
      return 'Deixaria uma nota para a equipe'
    default:
      return `Usou ${p.ferramenta ?? 'uma ferramenta'}`
  }
}
