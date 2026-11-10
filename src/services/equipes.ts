import { supabase } from './supabaseClient'

// Equipes e gestor de equipe (migration 20261110210000, docs/equipes-origem-prospeccao.md, entrega 1). Cada pessoa
// em uma equipe só; o gestor vê o que os vendedores da equipe veem e liga/desliga o agente dos números deles.

export type Equipe = { id: string; nome: string }
export type LugarNaEquipe = { equipe_id: string | null; gestor: boolean; ativo: boolean }

export async function listarEquipes(orgId: string): Promise<Equipe[]> {
  const { data, error } = await supabase.from('equipes').select('id, nome').eq('org_id', orgId).order('nome')
  if (error) throw error
  return data ?? []
}

/** Equipe e marcação de gestor de cada pessoa da empresa. */
export async function listarLugares(orgId: string): Promise<Map<string, LugarNaEquipe>> {
  const { data, error } = await supabase.from('membros_org').select('user_id, equipe_id, gestor, ativo').eq('org_id', orgId)
  if (error) throw error
  return new Map((data ?? []).map((m) => [m.user_id, { equipe_id: m.equipe_id, gestor: m.gestor, ativo: m.ativo }]))
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

/** Quem é da equipe que a pessoa gerencia (vazio = não é gestor ativo de nenhuma). */
export function equipeQueGerencia(lugares: Map<string, LugarNaEquipe>, eu: string | undefined): Set<string> {
  const meu = eu ? lugares.get(eu) : undefined
  if (!meu?.gestor || !meu.ativo || !meu.equipe_id) return new Set()
  return new Set([...lugares].filter(([, l]) => l.equipe_id === meu.equipe_id).map(([id]) => id))
}
