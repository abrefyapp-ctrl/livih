import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// Modelos de mensagem da API oficial. Moram na conta do WhatsApp (WABA) do número, na Meta: a Livih não
// guarda cópia, lê sempre de lá (o status muda quando a Meta termina a análise).

export type ComponenteModelo = {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  format?: string
  text?: string
  buttons?: { type: string; text: string }[]
}

export type Modelo = {
  id: string
  name: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'IN_APPEAL' | string
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | string
  language: string
  components: ComponenteModelo[]
  rejected_reason?: string
}

export type ModeloNovo = {
  nome: string
  categoria: 'UTILITY' | 'MARKETING'
  idioma: 'pt_BR' | 'en_US' | 'es'
  cabecalho: string
  corpo: string
  exemplos: string[]
  rodape: string
  botoes: string[]
}

async function chamar<T>(orgId: string, canalId: string, acao: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp-modelos', {
    body: { org_id: orgId, canal_id: canalId, acao, ...extra },
  })
  if (error) {
    const corpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
    throw new Error(corpo?.erro ?? 'Não foi possível falar com a Meta. Tente de novo.')
  }
  return data as T
}

export const listarModelos = (orgId: string, canalId: string) =>
  chamar<{ modelos: Modelo[] }>(orgId, canalId, 'listar').then((r) => r.modelos)
export const criarModelo = (orgId: string, canalId: string, modelo: ModeloNovo) =>
  chamar<{ id: string; status: string }>(orgId, canalId, 'criar', { modelo })
export const apagarModelo = (orgId: string, canalId: string, nome: string) => chamar(orgId, canalId, 'apagar', { nome })

/** Variáveis {{n}} distintas do texto, em ordem. */
export function variaveisDe(texto: string): number[] {
  return [...new Set([...texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((v) => Number(v[1])))].sort((a, b) => a - b)
}

/** Nome no formato da Meta: minúsculas, sem acento, espaços viram _. */
export function nomeTecnico(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')
    .slice(0, 512)
}

export const ROTULO_STATUS: Record<string, { texto: string; tom: 'ok' | 'atencao' | 'erro' | 'neutro' }> = {
  APPROVED: { texto: 'Aprovado', tom: 'ok' },
  PENDING: { texto: 'Em análise', tom: 'atencao' },
  IN_APPEAL: { texto: 'Em recurso', tom: 'atencao' },
  REJECTED: { texto: 'Recusado', tom: 'erro' },
  PAUSED: { texto: 'Pausado pela Meta', tom: 'erro' },
  DISABLED: { texto: 'Desativado pela Meta', tom: 'erro' },
}

export const ROTULO_CATEGORIA: Record<string, string> = {
  UTILITY: 'Utilidade',
  MARKETING: 'Marketing',
  AUTHENTICATION: 'Autenticação',
}

export const ROTULO_IDIOMA: Record<string, string> = {
  pt_BR: 'Português (Brasil)',
  en_US: 'Inglês (EUA)',
  es: 'Espanhol',
}
