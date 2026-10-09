import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

// Consumo de inteligência artificial por empresa e mês (view uso_ia_mensal; ver a migration 20261009120000).
// Dono/admin da empresa veem a própria; a equipe da plataforma vê todas. O custo em dólar só vem preenchido para
// a plataforma (para a empresa ele vem vazio).
export type UsoIaMes = Database['public']['Views']['uso_ia_mensal']['Row']

/** Primeiro dia do mês atual em Brasília, no formato da coluna `mes` (AAAA-MM-01). */
export function mesAtual(): string {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date())
  return `${hoje}-01`
}

/** Últimos meses de uma empresa, do mais recente para o mais antigo. */
export async function buscarUsoIaDaEmpresa(orgId: string, meses = 6): Promise<UsoIaMes[]> {
  const { data, error } = await supabase
    .from('uso_ia_mensal')
    .select('*')
    .eq('org_id', orgId)
    .order('mes', { ascending: false })
    .limit(meses)
  if (error) throw error
  return data ?? []
}

/** Uso do mês atual de todas as empresas (só a plataforma enxerga todas), indexado pela empresa. */
export async function buscarUsoIaDoMes(): Promise<Map<string, UsoIaMes>> {
  const { data, error } = await supabase.from('uso_ia_mensal').select('*').eq('mes', mesAtual())
  if (error) throw error
  return new Map((data ?? []).filter((u) => u.org_id).map((u) => [u.org_id as string, u]))
}

export const nomeDoMes = (mes: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${mes}T00:00:00Z`))

export const dolar = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(v))
