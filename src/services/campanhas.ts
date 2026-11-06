import { supabase } from './supabaseClient'
import type { Database, Json } from './tiposBanco'

type Tabelas = Database['public']['Tables']

// Campanhas de divulgação pela API oficial (docs/campanhas.md). Dono e admin criam; o banco (campanhas_liberar,
// pelo cron) libera aos poucos para a fila de envio de sempre.

export type Campanha = Tabelas['campanhas']['Row']
export type StatusCampanha = 'agendada' | 'enviando' | 'pausada' | 'concluida' | 'cancelada'

export type FonteVariavel = 'nome' | 'empresa' | 'fixo'
/** valor: o texto fixo; padrao: o que entra quando falta o nome ou a empresa do contato. */
export type VariavelCampanha = { fonte: FonteVariavel; valor?: string; padrao?: string }

export type ModeloCampanha = {
  nome: string
  idioma: string
  categoria: string
  cabecalho: string
  corpo: string
  rodape: string
  variaveis: VariavelCampanha[]
}

export type FiltrosCampanha = {
  tags?: string[]
  etapas?: string[]
  responsaveis?: string[]
  com_cliente?: boolean | null
  inativos_dias?: number | null
}

export type Resumo = {
  total: number
  pendentes: number
  enviadas: number
  entregues: number
  lidas: number
  erros: number
  puladas: number
  respostas: number
  orcamentos: number
}

export const ROTULO_STATUS: Record<StatusCampanha, { texto: string; cor: string }> = {
  agendada: { texto: 'Agendada', cor: 'bg-fundo text-texto-2' },
  enviando: { texto: 'Enviando', cor: 'bg-info-suave text-info' },
  pausada: { texto: 'Pausada', cor: 'bg-atencao-suave text-atencao' },
  concluida: { texto: 'Concluída', cor: 'bg-primaria-suave text-primaria' },
  cancelada: { texto: 'Cancelada', cor: 'bg-fundo text-texto-3' },
}

export const ROTULO_FONTE: Record<FonteVariavel, string> = {
  nome: 'Nome do contato',
  empresa: 'Empresa do contato',
  fixo: 'Texto fixo',
}

export async function listarCampanhas(orgId: string): Promise<{ campanha: Campanha; resumo: Resumo | null }[]> {
  const [{ data, error }, { data: resumos, error: erroResumo }] = await Promise.all([
    supabase.from('campanhas').select('*').eq('org_id', orgId).order('criado_em', { ascending: false }).limit(100),
    supabase.rpc('campanhas_resumo', { p_org: orgId }),
  ])
  if (error) throw error
  if (erroResumo) throw erroResumo
  const porId = new Map((resumos ?? []).map((r) => [r.campanha_id, r]))
  return (data ?? []).map((campanha) => {
    const r = porId.get(campanha.id)
    return {
      campanha,
      resumo: r
        ? {
            total: Number(r.total),
            pendentes: Number(r.pendentes),
            enviadas: Number(r.enviadas),
            entregues: Number(r.entregues),
            lidas: Number(r.lidas),
            erros: Number(r.erros),
            puladas: Number(r.puladas),
            respostas: Number(r.respostas),
            orcamentos: Number(r.orcamentos),
          }
        : null,
    }
  })
}

export async function previaPublico(orgId: string, filtros: FiltrosCampanha) {
  const { data, error } = await supabase.rpc('campanha_publico', { p_org: orgId, p_filtros: filtros as Json })
  if (error) throw error
  return data as { total: number; sem_nome: number; sem_empresa: number; descadastrados: number; amostra: string[] }
}

export async function listarEtiquetas(orgId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('campanha_etiquetas', { p_org: orgId })
  if (error) throw error
  return data ?? []
}

export type NumeroLista = { telefone: string; nome: string | null }

/**
 * Lista de números colada na campanha: um por linha, com o nome depois, se quiser ("(41) 99999-0000 Vidraçaria Sol").
 * Linha só com números separados por vírgula ou ponto e vírgula vira vários. O celular fica só com dígitos e com 55,
 * como o banco guarda; repetido sai, e o que não parece celular volta em `invalidos` para a pessoa corrigir.
 */
export function lerListaNumeros(texto: string): { numeros: NumeroLista[]; invalidos: string[] } {
  const numeros: NumeroLista[] = []
  const invalidos: string[] = []
  const vistos = new Set<string>()
  const pedacos = texto
    .split(/\r?\n/)
    .flatMap((l) => (/\p{L}/u.test(l) ? [l] : l.split(/[,;]/)))
    .map((l) => l.trim())
    .filter(Boolean)
  for (const p of pedacos) {
    const m = /^([+\d\s().-]+?)(?:\s*[,;\t–-]\s*|\s+)(\p{L}.*)$/u.exec(p)
    const bruto = m ? m[1] : p
    const nome = m ? m[2].trim().slice(0, 200) : null
    let tel = bruto.replace(/\D/g, '')
    if (tel.length === 10 || tel.length === 11) tel = '55' + tel
    if (!/^\d{12,15}$/.test(tel)) {
      invalidos.push(p)
      continue
    }
    if (vistos.has(tel)) continue
    vistos.add(tel)
    numeros.push({ telefone: tel, nome })
  }
  return { numeros, invalidos }
}

export async function criarCampanha(
  orgId: string,
  dados: {
    nome: string
    canal_id: string
    modelo: ModeloCampanha
    /** Público por filtros, ou `numeros` (lista digitada; os novos viram contato com a `etiqueta`). */
    filtros?: FiltrosCampanha
    numeros?: NumeroLista[]
    etiqueta?: string | null
    agendada_para: string | null
    limite_dia: number
    consentimento: boolean
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('campanha_criar', { p_org: orgId, p_dados: dados as unknown as Json })
  if (error) {
    // As mensagens do banco já são para a pessoa (filtros sem ninguém, variável vazia, número fora da API oficial).
    if (/nenhum contato|nenhum número|número inválido|no máximo|preencha|confirme|API oficial|modelo inválido/.test(error.message))
      throw new Error(error.message.charAt(0).toUpperCase() + error.message.slice(1) + '.')
    throw new Error('Não foi possível criar a campanha. Tente de novo.')
  }
  return data as string
}

export async function acaoCampanha(id: string, acao: 'pausar' | 'retomar' | 'cancelar') {
  const { error } = await supabase.rpc('campanha_acao', { p_campanha: id, p_acao: acao })
  if (error) throw new Error('Não foi possível mudar a campanha. Recarregue a página e tente de novo.')
}

export function variaveisDoModelo(m: unknown): ModeloCampanha | null {
  const v = m as ModeloCampanha | null
  return v && typeof v.corpo === 'string' ? v : null
}
