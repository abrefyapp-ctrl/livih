import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

// Plano e franquia de atendimentos do agente (migration 20261101120000; regras em docs/planos-modulos.md).
// O dono escolhe o que acontece ao passar do limite e compra pacotes; a equipe da plataforma define o plano e dá
// cortesia. Os atendimentos são contados no banco, na hora em que o agente responde.
type Funcoes = Database['public']['Functions']
export type ConsumoPlano = Funcoes['plano_consumo']['Returns'][number]
export type ConsumoEmpresa = Funcoes['plataforma_planos_consumo']['Returns'][number]
export type Plano = Database['public']['Tables']['planos']['Row']
export type EscolhaFranquia = 'parar' | 'continuar'

export async function buscarConsumoPlano(orgId: string): Promise<ConsumoPlano | null> {
  const { data, error } = await supabase.rpc('plano_consumo', { p_org: orgId })
  if (error) throw error
  return data?.[0] ?? null
}

export async function definirEscolhaFranquia(orgId: string, escolha: EscolhaFranquia) {
  const { error } = await supabase.rpc('plano_definir_escolha', { p_org: orgId, p_escolha: escolha })
  if (error) throw new Error(error.message.startsWith('Só o dono') ? error.message : 'Não foi possível salvar a escolha. Confira a internet e tente de novo.')
}

/** Devolve o novo limite do mês. `limiteAtual` é o que a tela mostrou: com clique duplo, o banco recusa a segunda compra. */
export async function comprarPacote(orgId: string, limiteAtual: number): Promise<number> {
  const { data, error } = await supabase.rpc('plano_comprar_pacote', { p_org: orgId, p_limite_atual: limiteAtual })
  if (error) {
    const conhecida = ['Só o dono', 'A sua empresa ainda não tem', 'O limite do mês mudou'].some((m) => error.message.startsWith(m))
    throw new Error(conhecida ? error.message : 'Não foi possível comprar o pacote. Confira a internet e tente de novo.')
  }
  return data
}

// ---------- plataforma ----------

export async function listarPlanos(): Promise<Plano[]> {
  const { data, error } = await supabase.from('planos').select('*').order('ordem')
  if (error) throw error
  return data ?? []
}

/** Consumo do mês de todas as empresas (só a equipe da plataforma), indexado pela empresa. */
export async function buscarConsumoDasEmpresas(): Promise<Map<string, ConsumoEmpresa>> {
  const { data, error } = await supabase.rpc('plataforma_planos_consumo')
  if (error) throw error
  return new Map((data ?? []).map((c) => [c.org_id, c]))
}

export async function definirPlano(orgId: string, plano: string) {
  const { error } = await supabase.rpc('plataforma_definir_plano', { p_org: orgId, p_plano: plano })
  if (error) throw new Error('Não foi possível mudar o plano. Confira a internet e tente de novo.')
}

export async function darCortesia(orgId: string, quantidade: number, motivo: string) {
  const { error } = await supabase.rpc('plataforma_dar_cortesia', { p_org: orgId, p_quantidade: quantidade, p_motivo: motivo })
  if (error) throw new Error(error.message.startsWith('Informe') ? error.message : 'Não foi possível dar a cortesia. Confira a internet e tente de novo.')
}

// ---------- troca de plano pelo dono (migration 20261102140000; decisões de 02/11) ----------

export type PlanoOpcao = { codigo: string; nome: string; preco_mensal: number; numeros_whatsapp: number; atendimentos: number }
export type SituacaoTroca = {
  pode_trocar: boolean
  /** Por que o dono não troca sozinho (sem cobrança ligada ou com valor combinado). */
  motivo: string | null
  /** Dono de verdade da empresa (a equipe da plataforma, no modo suporte, troca pela tela Empresas). */
  eh_dono: boolean
  plano: string
  /** Descida agendada para `vale_em` (dia 1 do mês seguinte). */
  plano_proximo: string | null
  vale_em: string
  numeros_ativos: number
  planos: PlanoOpcao[]
}
/** subir: vale agora, com `valor` de ajuste na próxima fatura; descer: vale em `vale_em`; cancelar: desfaz a descida. */
export type ResultadoTroca = {
  tipo: 'subir' | 'descer' | 'cancelar' | 'igual'
  plano: string
  valor?: number
  dias?: number
  dias_mes?: number
  vale_em?: string
  teste_gratis?: boolean
  /** Atendimentos do mês depois de subir (franquia a mais proporcional aos dias que faltam); nulo no plano interno. */
  limite_mes?: number | null
}

export async function buscarSituacaoTroca(orgId: string): Promise<SituacaoTroca> {
  const { data, error } = await supabase.rpc('plano_troca_situacao', { p_org: orgId })
  if (error) throw error
  return data as unknown as SituacaoTroca
}

/** Sem `confirmar`, só a prévia (o que acontece e quanto custa); com, faz a troca. */
export async function trocarPlano(orgId: string, plano: string, confirmar: boolean): Promise<ResultadoTroca> {
  const { data, error } = await supabase.rpc('plano_trocar', { p_org: orgId, p_plano: plano, p_confirmar: confirmar })
  if (error) {
    const doBanco = /^(Só o dono|Escolha um|Para escolher|O plano )/.test(error.message)
    throw new Error(doBanco ? error.message : 'Não foi possível trocar o plano. Confira a internet e tente de novo.')
  }
  return data as unknown as ResultadoTroca
}
