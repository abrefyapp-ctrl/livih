import { supabase } from './supabaseClient'

// Painel e Relatório do piloto (migration 20261021120000, docs/painel-relatorio-piloto.md). As contas são feitas no
// banco; aqui só os tipos, as chamadas e a formatação.

export type Tempo = { n: number; mediana_seg: number | null; pct_5min?: number | null }
export type Periodo = {
  de: string
  ate: string
  resposta: {
    pedidos: number
    sem_resposta: number
    geral: Tempo
    agente: Tempo
    equipe: Tempo
    fora_horario: Tempo
    dentro_horario: Tempo
    por_dia: { dia: string; pedidos: number; agente_mediana_seg: number | null; equipe_mediana_seg: number | null }[]
  }
  leads: { novos: number; com_oportunidade: number; respondidos: number }
  funil: {
    criadas: number
    mudancas: number
    ganhas: number
    perdidas: number
    valor_ganho: number
    etapas: { nome: string; tipo: string; abertas: number; valor: number }[]
  }
  agente: { conversas: number; passadas: number; respostas: number; motivos: string[] }
  pedidos: { criados: number; pelo_agente: number; confirmados: number; valor_confirmado: number } | null
  vendedores:
    | { user_id: string; nome: string; conversas: number; respostas: number; mediana_seg: number | null; oportunidades_abertas: number }[]
    | null
}
export type ConfigPainel = { minutos_por_resposta: number; antes_tempo_resposta_min: number | null; piloto_inicio: string | null }
export type Resumo = { atual: Periodo; anterior: Periodo; gerencia: boolean; vendedor: string | null; config: ConfigPainel | null }
export type Pendencias = {
  sem_resposta: { conversa_id: string; contato: string | null; numero: string; desde: string }[]
  sem_retorno: { oportunidade_id: string; titulo: string; contato_id: string; contato: string | null; etapa: string; ultimo_contato: string | null }[]
}
export type Relatorio = {
  empresa: string
  inicio: string
  fim: string
  dias: number
  primeira_semana: Periodo
  ultima_semana: Periodo | null
  total: Periodo
  config: { minutos_por_resposta: number; antes_tempo_resposta_min: number | null } | null
}

export const MINUTOS_PADRAO = 2

/** Números de WhatsApp ativos da empresa, para o filtro do Painel. */
export async function listarNumerosAtivos(orgId: string): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase.from('canais').select('id, nome').eq('org_id', orgId).eq('ativo', true).order('nome')
  if (error) throw error
  return data ?? []
}

export async function buscarResumo(orgId: string, de: Date, ate: Date, canal: string | null, vendedor: string | null): Promise<Resumo> {
  const { data, error } = await supabase.rpc('painel_resumo', {
    p_org: orgId,
    p_de: de.toISOString(),
    p_ate: ate.toISOString(),
    p_canal: canal ?? undefined,
    p_vendedor: vendedor ?? undefined,
  })
  if (error) throw error
  return data as unknown as Resumo
}

export async function buscarPendencias(orgId: string, canal: string | null, vendedor: string | null): Promise<Pendencias> {
  const { data, error } = await supabase.rpc('painel_pendencias', {
    p_org: orgId,
    p_canal: canal ?? undefined,
    p_vendedor: vendedor ?? undefined,
  })
  if (error) throw error
  return data as unknown as Pendencias
}

export async function buscarRelatorio(orgId: string): Promise<Relatorio> {
  const { data, error } = await supabase.rpc('painel_relatorio', { p_org: orgId })
  if (error) throw error
  return data as unknown as Relatorio
}

export async function salvarConfig(orgId: string, campos: Partial<ConfigPainel>) {
  const { error } = await supabase.from('painel_config').upsert({ org_id: orgId, ...campos }, { onConflict: 'org_id' })
  if (error) throw new Error('Não foi possível salvar. Tente de novo.')
}

/** 18 → "18 s"; 234 → "3,9 min"; 7800 → "2 h 10 min". */
export function duracao(seg: number | null | undefined): string {
  if (seg == null) return '—'
  if (seg < 60) return `${Math.round(seg)} s`
  const min = seg / 60
  if (min < 60) return `${min.toLocaleString('pt-BR', { maximumFractionDigits: min < 10 ? 1 : 0 })} min`
  const h = Math.floor(min / 60)
  const resto = Math.round(min - h * 60)
  return resto ? `${h} h ${resto} min` : `${h} h`
}

export const porcentagem = (parte: number, todo: number) => (todo ? Math.round((100 * parte) / todo) : null)

/** Horas economizadas (estimativa): respostas do agente × minutos por resposta. */
export const horasEconomizadas = (respostas: number, minutos: number) => (respostas * minutos) / 60
