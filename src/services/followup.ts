import { supabase } from './supabaseClient'
import type { ModeloCampanha } from './campanhas'

// Retomada do cliente pelo agente (migration 20261105140000, docs/crm-acompanhamento.md, entrega 2). Uma linha por
// empresa; salvar é de dono e admin (followup_salvar).

export type ConfigFollowup = {
  ativo: boolean
  /** Horas (ou dias) de espera de cada caso; null = caso desligado. */
  orcamento_horas: number | null
  conversa_horas: number | null
  oportunidade_dias: number | null
  equipe: boolean
  pedido_cliente: boolean
  intervalo_dias: number
  /** Modelo da API oficial para fora das 24 h (formato das campanhas). */
  modelo: ModeloCampanha | null
}

export const CONFIG_PADRAO: ConfigFollowup = {
  ativo: false,
  orcamento_horas: 24,
  conversa_horas: 24,
  oportunidade_dias: 3,
  equipe: true,
  pedido_cliente: true,
  intervalo_dias: 2,
  modelo: null,
}

export async function buscarFollowup(orgId: string): Promise<ConfigFollowup> {
  const { data, error } = await supabase.from('agente_followup').select('*').eq('org_id', orgId).maybeSingle()
  if (error) throw error
  if (!data) return CONFIG_PADRAO
  return {
    ativo: data.ativo,
    orcamento_horas: data.orcamento_horas,
    conversa_horas: data.conversa_horas,
    oportunidade_dias: data.oportunidade_dias,
    equipe: data.equipe,
    pedido_cliente: data.pedido_cliente,
    intervalo_dias: data.intervalo_dias,
    modelo: (data.modelo as ModeloCampanha | null) ?? null,
  }
}

export async function salvarFollowup(orgId: string, cfg: ConfigFollowup) {
  const { error } = await supabase.rpc('followup_salvar', { p_org: orgId, p_cfg: cfg as never })
  if (error) {
    throw new Error(
      error.message.includes('só dono e admin')
        ? 'Só dono e admin mudam a retomada do agente.'
        : error.message.includes('variáveis')
          ? 'Preencha todas as variáveis do modelo.'
          : error.message.includes('modelo inválido')
            ? 'O modelo escolhido não pode ser usado. Escolha outro.'
            : 'Não foi possível salvar. Tente de novo.',
    )
  }
}
