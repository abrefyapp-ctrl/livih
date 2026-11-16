import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

export type Modulo = Database['public']['Functions']['org_modulos']['Returns'][number]

/** Módulos da empresa com a situação atual (padrão do catálogo ou exceção da empresa). */
export async function listarModulos(orgId: string): Promise<Modulo[]> {
  const { data, error } = await supabase.rpc('org_modulos', { p_org: orgId })
  if (error) throw error
  return data ?? []
}

/** Financeiro escondido na empresa (16/11, a CEFEQ usa o do Sollus): sem menu, sem pagamento no orçamento. */
export async function lerFinanceiroOculto(orgId: string): Promise<boolean> {
  const { data, error } = await supabase.from('organizacoes').select('financeiro_oculto').eq('id', orgId).maybeSingle()
  if (error) throw error
  return !!data?.financeiro_oculto
}

/** Esconde ou mostra o Financeiro numa empresa (só a equipe da plataforma). */
export async function definirFinanceiroOculto(orgId: string, oculto: boolean) {
  const { error } = await supabase.rpc('plataforma_definir_financeiro_oculto', { p_org: orgId, p_oculto: oculto })
  if (error) {
    throw new Error(
      /^(Só a equipe|Empresa não encontrada)/.test(error.message)
        ? error.message
        : 'Não foi possível mudar o Financeiro. Confira a internet e tente de novo.',
    )
  }
}

/** Liga ou desliga um módulo numa empresa (só a equipe da plataforma). */
export async function definirModulo(orgId: string, codigo: string, ativo: boolean) {
  const { error } = await supabase.rpc('plataforma_definir_modulo', { p_org: orgId, p_modulo: codigo, p_ativo: ativo })
  if (error) throw new Error('Não foi possível mudar o módulo. Tente de novo.')
}
