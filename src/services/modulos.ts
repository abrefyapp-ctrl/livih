import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

export type Modulo = Database['public']['Functions']['org_modulos']['Returns'][number]

/** Módulos da empresa com a situação atual (padrão do catálogo ou exceção da empresa). */
export async function listarModulos(orgId: string): Promise<Modulo[]> {
  const { data, error } = await supabase.rpc('org_modulos', { p_org: orgId })
  if (error) throw error
  return data ?? []
}

/** Liga ou desliga um módulo numa empresa (só a equipe da plataforma). */
export async function definirModulo(orgId: string, codigo: string, ativo: boolean) {
  const { error } = await supabase.rpc('plataforma_definir_modulo', { p_org: orgId, p_modulo: codigo, p_ativo: ativo })
  if (error) throw new Error('Não foi possível mudar o módulo. Tente de novo.')
}
