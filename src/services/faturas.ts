import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

// Faturas da Livih e contrato de cobrança de cada empresa (migration 20261101150000; docs/cobranca-asaas.md).
// O banco monta a fatura e a Edge Function asaas-cobranca cria a cobrança no Asaas e grava o link de pagamento.
export type Fatura = Database['public']['Tables']['faturas']['Row']
export type Contrato = Database['public']['Tables']['contratos_cobranca']['Row']
export type ItemFatura = { descricao: string; quantidade: number; valor: number }

export const SITUACAO_FATURA: Record<string, { rotulo: string; tom: 'neutro' | 'atencao' | 'ok' | 'erro' }> = {
  a_enviar: { rotulo: 'Gerando a cobrança', tom: 'neutro' },
  enviando: { rotulo: 'Gerando a cobrança', tom: 'neutro' },
  // "Em aberto" e não "A pagar": até o aviso de pagamento do Asaas (entrega 3), a fatura paga continua assim.
  aberta: { rotulo: 'Em aberto', tom: 'atencao' },
  paga: { rotulo: 'Paga', tom: 'ok' },
  vencida: { rotulo: 'Vencida', tom: 'erro' },
  a_cancelar: { rotulo: 'Cancelando', tom: 'neutro' },
  cancelada: { rotulo: 'Cancelada', tom: 'neutro' },
  erro: { rotulo: 'Sem link de pagamento', tom: 'erro' },
}

/** Últimas faturas da empresa, da mais recente para a mais antiga. */
export async function listarFaturas(orgId: string, limite = 12): Promise<Fatura[]> {
  const { data, error } = await supabase
    .from('faturas')
    .select('*')
    .eq('org_id', orgId)
    .order('competencia', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data ?? []
}

export async function buscarContrato(orgId: string): Promise<Contrato | null> {
  const { data, error } = await supabase.from('contratos_cobranca').select('*').eq('org_id', orgId).maybeSingle()
  if (error) throw error
  return data
}

// ---------- plataforma ----------

export async function definirContrato(orgId: string, c: { ativo: boolean; inicio: string; valorFixo: number | null; motivo: string }) {
  const { error } = await supabase.rpc('plataforma_definir_contrato', {
    p_org: orgId,
    p_ativo: c.ativo,
    p_inicio: c.inicio,
    p_valor_fixo: c.valorFixo as number,
    p_motivo: c.motivo,
  })
  if (error) {
    const doBanco = /^(Informe|Salve|Empresa|Só a equipe)/.test(error.message)
    throw new Error(doBanco ? error.message : 'Não foi possível salvar a cobrança. Confira a internet e tente de novo.')
  }
}

/** Gera agora a fatura do mês (início no meio do mês ou teste no sandbox). */
export async function gerarFatura(orgId: string) {
  const { error } = await supabase.rpc('plataforma_gerar_fatura', { p_org: orgId })
  if (error) {
    const doBanco = /^(Marque|A primeira|A fatura|Não há valor|Só a equipe)/.test(error.message)
    throw new Error(doBanco ? error.message : 'Não foi possível gerar a fatura. Confira a internet e tente de novo.')
  }
}

/** Tenta de novo uma fatura sem link de pagamento (dados corrigidos, Asaas de volta). */
export async function reenviarFatura(faturaId: string) {
  const { error } = await supabase.rpc('plataforma_reenviar_fatura', { p_fatura: faturaId })
  if (error) {
    const doBanco = /^(Só dá|Só a equipe)/.test(error.message)
    throw new Error(doBanco ? error.message : 'Não foi possível tentar de novo. Confira a internet e tente outra vez.')
  }
}

/** Cancela a fatura (teste no sandbox, cobrança por engano) e libera o mês; a cobrança no Asaas é apagada. */
export async function cancelarFatura(faturaId: string) {
  const { error } = await supabase.rpc('plataforma_cancelar_fatura', { p_fatura: faturaId })
  if (error) {
    const doBanco = /^(Esta fatura|Só a equipe)/.test(error.message)
    throw new Error(doBanco ? error.message : 'Não foi possível cancelar a fatura. Confira a internet e tente de novo.')
  }
}
