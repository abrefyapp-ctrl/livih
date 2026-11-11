import { supabase } from './supabaseClient'

// Origem do lead (migration 20261111140000, docs/equipes-origem-prospeccao.md entrega 3). A origem é gravada pelo
// banco no começo de cada ciclo de conversa; aqui só a configuração (origem do número e regras de texto).

/** Sugestões para o campo de origem; a empresa pode escrever outra. */
export const ORIGENS_SUGERIDAS = ['Site', 'Google Ads', 'Instagram', 'Facebook', 'Indicação', 'Loja', 'E-commerce']

export type RegraOrigem = { id: string; texto: string; origem: string }

/** Origem de cada número da empresa (id → origem). */
export async function origensDosNumeros(orgId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('canais').select('id, origem').eq('org_id', orgId).not('origem', 'is', null)
  if (error) throw error
  return new Map((data ?? []).map((c) => [c.id, c.origem as string]))
}

export async function definirOrigemDoNumero(canalId: string, origem: string) {
  const { error } = await supabase.rpc('canal_definir_origem', { p_canal: canalId, p_origem: origem })
  if (error) throw new Error(error.message.startsWith('Só dono') || error.message.startsWith('A origem') ? error.message : 'Não foi possível salvar a origem. Tente de novo.')
}

export async function listarRegrasOrigem(orgId: string): Promise<RegraOrigem[]> {
  const { data, error } = await supabase.from('origem_regras').select('id, texto, origem').eq('org_id', orgId).order('origem')
  if (error) throw error
  return data ?? []
}

/** As mensagens de erro da função já são para a pessoa (texto curto, repetido, sem permissão). */
export async function salvarRegraOrigem(orgId: string, regra: { id: string | null; texto: string; origem: string }) {
  const { error } = await supabase.rpc('origem_regra_salvar', {
    p_org: orgId,
    p_id: regra.id ?? undefined,
    p_texto: regra.texto,
    p_origem: regra.origem,
  })
  if (error) throw new Error(error.message.match(/^(Só|O texto|Informe|Já existe|Regra|A origem)/) ? error.message : 'Não foi possível salvar a regra. Tente de novo.')
}

export async function removerRegraOrigem(id: string) {
  const { error } = await supabase.rpc('origem_regra_remover', { p_id: id })
  if (error) throw new Error('Não foi possível remover a regra. Tente de novo.')
}
