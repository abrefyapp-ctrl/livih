import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// Simulador de conversa (Edge Function agente-simular, docs/simulador-agente.md): a conversa de teste fica só na
// tela e vai inteira a cada pergunta. Nada vai para o WhatsApp nem para o histórico.
// Foto e áudio (17/11): o arquivo vai só junto da mensagem nova; a função devolve a descrição ou a transcrição, que
// fica na mensagem e volta como texto nas próximas perguntas (o arquivo não é processado de novo).

export type TipoMensagemTeste = 'texto' | 'imagem' | 'audio'
export type MensagemTeste = {
  de: 'cliente' | 'assistente'
  texto: string
  tipo?: TipoMensagemTeste
  /** Foto: o que a IA descreveu (e o produto achado no catálogo). null = não deu para descrever. */
  descricao?: string | null
  /** Endereço local do arquivo, só para mostrar na tela. */
  url?: string
  /** A foto já foi descrita ou o áudio transcrito (com ou sem sucesso). */
  lida?: boolean
  saudacao?: boolean
  passos?: Passo[]
}
export type Passo = { ferramenta: string | null; entrada: unknown; saida: string }
export type MidiaTeste = { tipo: 'imagem' | 'audio'; arquivo: Blob; segundos?: number }
export type RespostaTeste = {
  saudacao: string | null
  resposta: string | null
  passos: Passo[]
  midia: { tipo: TipoMensagemTeste; texto: string; descricao: string | null } | null
}

/** Foto e áudio até estes limites (o áudio, como no WhatsApp: o agente não ouve mais de 5 min). */
export const AUDIO_MAX_SEGUNDOS = 5 * 60
export const AUDIO_MAX_BYTES = 10 * 1024 * 1024
const FOTO_LADO_MAX = 1600

// Os formatos que a transcrição aceita (os mesmos do MIME_OK do agente-simular). O Windows muitas vezes não informa
// o tipo do .opus exportado do WhatsApp, então a extensão decide quando o tipo falta ou é outro nome do mesmo formato.
const AUDIO_POR_EXTENSAO: Record<string, string> = {
  opus: 'audio/ogg', ogg: 'audio/ogg', oga: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4',
  wav: 'audio/wav', webm: 'audio/webm',
}
const AUDIO_ACEITO = /^audio\/(webm|ogg|mpeg|mp3|mp4|x-m4a|wav|x-wav)$/

/** O áudio com o tipo que a transcrição entende, ou null se o formato não serve. */
export function prepararAudio(arquivo: File): Blob | null {
  const tipo = arquivo.type.split(';')[0].toLowerCase()
  if (AUDIO_ACEITO.test(tipo)) return arquivo
  const ext = arquivo.name.split('.').pop()?.toLowerCase() ?? ''
  const pelaExtensao = AUDIO_POR_EXTENSAO[ext]
  return pelaExtensao ? new Blob([arquivo], { type: pelaExtensao }) : null
}

const paraBase64 = (arquivo: Blob) =>
  new Promise<string>((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(String(leitor.result).replace(/^data:[^,]*,/, ''))
    leitor.onerror = () => reject(new Error('Não deu para ler o arquivo. Escolha de novo ou tente outro.'))
    leitor.readAsDataURL(arquivo)
  })

/** Reduz a foto como o WhatsApp faz (lado maior até 1.600 px, JPG): o teste fica parecido e o envio, leve. */
export async function reduzirFoto(arquivo: Blob): Promise<Blob> {
  let imagem: ImageBitmap
  try {
    imagem = await createImageBitmap(arquivo)
  } catch {
    throw new Error('Formato de foto não aceito. Use JPG, PNG ou WebP.')
  }
  const escala = Math.min(1, FOTO_LADO_MAX / Math.max(imagem.width, imagem.height))
  const tela = document.createElement('canvas')
  tela.width = Math.round(imagem.width * escala)
  tela.height = Math.round(imagem.height * escala)
  tela.getContext('2d')?.drawImage(imagem, 0, 0, tela.width, tela.height)
  imagem.close()
  return await new Promise<Blob>((resolve, reject) =>
    tela.toBlob((b) => (b ? resolve(b) : reject(new Error('Não deu para preparar a foto. Tente de novo ou escolha outra.'))), 'image/jpeg', 0.85),
  )
}

/** Duração do áudio escolhido no computador (0 quando o navegador não informa). */
export function duracaoAudio(arquivo: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(arquivo)
    const audio = new Audio()
    const fim = (s: number) => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(s) ? s : 0)
    }
    audio.onloadedmetadata = () => fim(audio.duration)
    audio.onerror = () => fim(0)
    audio.src = url
  })
}

export async function simular(
  orgId: string,
  mensagens: MensagemTeste[],
  rascunho: { prompt: string; casos: string[]; base?: string } | null,
  midia: MidiaTeste | null = null,
): Promise<RespostaTeste> {
  const { data, error } = await supabase.functions.invoke('agente-simular', {
    body: {
      org_id: orgId,
      mensagens: mensagens.map((m) => ({ de: m.de, texto: m.texto, tipo: m.tipo ?? 'texto', descricao: m.descricao ?? null })),
      midia: midia
        ? {
            tipo: midia.tipo,
            mime: midia.arquivo.type,
            base64: await paraBase64(midia.arquivo),
            segundos: midia.segundos ?? null,
          }
        : null,
      prompt: rascunho?.prompt ?? null,
      casos: rascunho?.casos ?? null,
      base: rascunho?.base ?? null,
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
