import { supabase } from './supabaseClient'

// Equipes e gestor de equipe (migration 20261110210000, docs/equipes-origem-prospeccao.md, entrega 1). Cada pessoa
// em uma equipe só; o gestor vê o que os vendedores da equipe veem e liga/desliga o agente dos números deles.

export type Equipe = { id: string; nome: string }
/** ausente_ate: último dia da ausência (AAAA-MM-DD); nulo com ausente = até alguém desmarcar. */
export type LugarNaEquipe = {
  equipe_id: string | null
  gestor: boolean
  ativo: boolean
  ausente: boolean
  ausente_ate: string | null
}

export async function listarEquipes(orgId: string): Promise<Equipe[]> {
  const { data, error } = await supabase.from('equipes').select('id, nome').eq('org_id', orgId).order('nome')
  if (error) throw error
  return data ?? []
}

/** Equipe e marcação de gestor de cada pessoa da empresa. */
export async function listarLugares(orgId: string): Promise<Map<string, LugarNaEquipe>> {
  const { data, error } = await supabase
    .from('membros_org')
    .select('user_id, equipe_id, gestor, ativo, ausente, ausente_ate')
    .eq('org_id', orgId)
  if (error) throw error
  return new Map(
    (data ?? []).map((m) => [
      m.user_id,
      { equipe_id: m.equipe_id, gestor: m.gestor, ativo: m.ativo, ausente: m.ausente, ausente_ate: m.ausente_ate },
    ]),
  )
}

/** Cria (id nulo) ou renomeia uma equipe. A mensagem de erro do banco já diz o que fazer. */
export async function salvarEquipe(orgId: string, id: string | null, nome: string): Promise<string> {
  const { data, error } = await supabase.rpc('equipe_salvar', { p_org: orgId, p_equipe: id as string, p_nome: nome })
  if (error) throw new Error(error.message || 'Não foi possível salvar a equipe. Tente de novo.')
  return data as string
}

export async function removerEquipe(id: string) {
  const { error } = await supabase.rpc('equipe_remover', { p_equipe: id })
  if (error) throw new Error('Não foi possível remover a equipe. Tente de novo.')
}

/** Põe a pessoa numa equipe (nulo tira) e diz se é gestor dela. */
export async function definirEquipeDaPessoa(orgId: string, userId: string, equipeId: string | null, gestor: boolean) {
  const { error } = await supabase.rpc('membro_definir_equipe', {
    p_org: orgId,
    p_usuario: userId,
    p_equipe: equipeId as string,
    p_gestor: gestor,
  })
  if (error) throw new Error('Não foi possível mudar a equipe. Tente de novo.')
}

// ---- distribuição sem carteira (migration 20261113120000, docs/equipes-origem-prospeccao.md, entrega 2) ----

const hojeBrasilia = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

/** Ausente hoje: a data de volta ainda não passou (depois dela, a pessoa volta sozinha). */
export function ausenteAgora(l: LugarNaEquipe | undefined): boolean {
  return !!l?.ausente && (!l.ausente_ate || l.ausente_ate >= hojeBrasilia())
}

/** "Ausente" ou "Ausente até 20/11". */
export function rotuloAusencia(l: LugarNaEquipe): string {
  if (!l.ausente_ate) return 'Ausente'
  const [, m, d] = l.ausente_ate.split('-')
  return `Ausente até ${d}/${m}`
}

/** Dono e admin marcam qualquer pessoa; o gestor, as da equipe dele. A mensagem do banco já diz o que fazer. */
export async function definirAusencia(orgId: string, userId: string, ausente: boolean, ate: string | null) {
  const { error } = await supabase.rpc('membro_definir_ausencia', {
    p_org: orgId,
    p_usuario: userId,
    p_ausente: ausente,
    p_ate: ate as string,
  })
  if (error) throw new Error(error.message || 'Não foi possível marcar a ausência. Tente de novo.')
}

/** Cidades de cada equipe (id da equipe → nomes como foram digitados). */
export async function listarCidades(orgId: string): Promise<Map<string, string[]>> {
  const { data, error } = await supabase.from('equipes_cidades').select('equipe_id, cidade').eq('org_id', orgId).order('cidade')
  if (error) throw error
  const mapa = new Map<string, string[]>()
  for (const c of data ?? []) mapa.set(c.equipe_id, [...(mapa.get(c.equipe_id) ?? []), c.cidade])
  return mapa
}

/** Troca a lista inteira de cidades da equipe. Uma cidade só pode estar em uma equipe. */
export async function definirCidades(equipeId: string, cidades: string[]) {
  const { error } = await supabase.rpc('equipe_definir_cidades', { p_equipe: equipeId, p_cidades: cidades })
  if (error) throw new Error(error.message || 'Não foi possível salvar as cidades. Tente de novo.')
}

/** Dias que contam para "quem mais atendeu" o cliente. */
export async function lerJanelaDistribuicao(orgId: string): Promise<number> {
  const { data, error } = await supabase.from('organizacoes').select('distribuicao_janela_dias').eq('id', orgId).single()
  if (error) throw error
  return data.distribuicao_janela_dias
}

export async function definirJanelaDistribuicao(orgId: string, dias: number) {
  const { error } = await supabase.rpc('org_definir_janela_distribuicao', { p_org: orgId, p_dias: dias })
  if (error) throw new Error(error.message || 'Não foi possível mudar o período. Tente de novo.')
}

/** Quem é da equipe que a pessoa gerencia (vazio = não é gestor ativo de nenhuma). */
export function equipeQueGerencia(lugares: Map<string, LugarNaEquipe>, eu: string | undefined): Set<string> {
  const meu = eu ? lugares.get(eu) : undefined
  if (!meu?.gestor || !meu.ativo || !meu.equipe_id) return new Set()
  return new Set([...lugares].filter(([, l]) => l.equipe_id === meu.equipe_id).map(([id]) => id))
}
