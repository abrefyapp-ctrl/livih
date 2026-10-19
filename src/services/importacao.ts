import { FunctionsHttpError } from '@supabase/supabase-js'
import type { DadosProduto } from './erp'
import { supabase } from './supabaseClient'

// Importador de catálogo com IA (Edge Function importar-catalogo, docs/importador-catalogo.md). A importação roda no
// servidor; a tela acompanha pela tabela importacoes_catalogo (só dono/admin leem).

export type ModoPreco = 'venda' | 'sem_preco'
export type OrigemImportacao = 'pdf' | 'imagem' | 'planilha' | 'texto'
export type Importacao = {
  id: string
  origem: OrigemImportacao
  nome: string | null
  modo_preco: ModoPreco
  status: 'na_fila' | 'lendo' | 'pronto' | 'erro'
  progresso: number
  total: number
  erro: string | null
  criado_em: string
  resultado: { linhas?: DadosProduto[]; paginas?: (number | null)[]; falhas?: string[]; avisos?: string[] } | null
}

export const ACEITOS = '.pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp'
export const LIMITE_IMPORTACAO = 50 * 1024 * 1024

export function origemDoArquivo(f: File): OrigemImportacao | null {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'planilha'
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'imagem'
  return null
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/** Sobe o arquivo (ou manda o texto) e começa a importação. Devolve o id para acompanhar. */
export async function iniciarImportacao(
  orgId: string,
  entrada: { arquivo: File } | { texto: string; nome: string },
  modo: ModoPreco,
): Promise<string> {
  let corpo: Record<string, unknown>
  if ('arquivo' in entrada) {
    const origem = origemDoArquivo(entrada.arquivo)
    if (!origem) throw new Error('Use PDF, Excel, CSV ou foto (JPG, PNG).')
    const ext = entrada.arquivo.name.split('.').pop()!.toLowerCase()
    const chave = entrada.arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)
    const path = `${orgId}/${crypto.randomUUID()}-${chave}`
    const { error } = await supabase.storage
      .from('importacoes')
      .upload(path, entrada.arquivo, { contentType: MIME[ext] ?? entrada.arquivo.type, upsert: false })
    if (error) throw new Error('Não foi possível subir o arquivo. Confira o formato e o tamanho (até 50 MB).')
    corpo = { org_id: orgId, origem, path, nome: entrada.arquivo.name, modo_preco: modo }
  } else {
    corpo = { org_id: orgId, origem: 'texto', texto: entrada.texto, nome: entrada.nome, modo_preco: modo }
  }
  const { data, error } = await supabase.functions.invoke('importar-catalogo', { body: corpo })
  if (error) {
    const r = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
    throw new Error(r?.erro ?? 'Não foi possível começar a importação. Tente de novo.')
  }
  return (data as { id: string }).id
}

export async function buscarImportacao(id: string): Promise<Importacao | null> {
  const { data, error } = await supabase.from('importacoes_catalogo').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Importacao | null
}

/** Importações das últimas 24 h (para retomar a que ficou lendo ou revisar a que terminou com a tela fechada). */
export async function importacoesRecentes(orgId: string): Promise<Importacao[]> {
  const { data, error } = await supabase
    .from('importacoes_catalogo')
    .select('id, origem, nome, modo_preco, status, progresso, total, erro, criado_em, resultado')
    .eq('org_id', orgId)
    .gte('criado_em', new Date(Date.now() - 864e5).toISOString())
    .order('criado_em', { ascending: false })
    .limit(5)
  if (error) throw error
  return (data ?? []) as Importacao[]
}
