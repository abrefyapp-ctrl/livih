import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// Assistente orientador (Edge Function agente-assistente, docs/assistente-orientador.md). A conversa e a proposta
// ficam na sessão (assistente_sessoes, só dono/admin leem); aplicar e desfazer são funções do banco.

export type ModoAssistente = 'montar' | 'revisar'
export type ItemBaseProposto = {
  acao: 'criar' | 'atualizar' | 'desativar'
  id: string | null
  titulo: string
  conteudo: string | null
  por_que: string
}
export type Proposta = {
  instrucoes: { texto: string; por_que: string } | null
  regras: { lista: string[]; por_que: string } | null
  base: ItemBaseProposto[]
  observacoes: string[]
}
export type SessaoAssistente = {
  id: string
  modo: ModoAssistente
  status: 'conversando' | 'pensando' | 'proposta' | 'aplicada' | 'desfeita' | 'erro'
  mensagens: { de: 'dono' | 'assistente'; texto: string }[]
  proposta: Proposta | null
  erro: string | null
  criado_em: string
}
export type SecoesEscolhidas = { instrucoes: boolean; regras: boolean; base: number[] }

const CAMPOS = 'id, modo, status, mensagens, proposta, erro, criado_em'

export async function enviarAoAssistente(
  orgId: string,
  sessaoId: string | null,
  modo: ModoAssistente,
  mensagem: string,
  alertas: string[],
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('agente-assistente', {
    body: { org_id: orgId, sessao_id: sessaoId, modo, mensagem, alertas },
  })
  if (error) {
    const r = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
    throw new Error(r?.erro ?? 'O assistente não respondeu. Tente de novo.')
  }
  return (data as { sessao_id: string }).sessao_id
}

export async function buscarSessao(id: string): Promise<SessaoAssistente | null> {
  const { data, error } = await supabase.from('assistente_sessoes').select(CAMPOS).eq('id', id).maybeSingle()
  if (error) throw error
  return data as SessaoAssistente | null
}

/** A conversa em andamento mais recente (últimos 7 dias), para continuar de onde parou. */
export async function sessaoAberta(orgId: string): Promise<SessaoAssistente | null> {
  const { data, error } = await supabase
    .from('assistente_sessoes')
    .select(CAMPOS)
    .eq('org_id', orgId)
    .in('status', ['conversando', 'pensando', 'proposta', 'erro'])
    .gte('criado_em', new Date(Date.now() - 7 * 864e5).toISOString())
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as SessaoAssistente | null
}

export async function aplicarProposta(sessaoId: string, secoes: SecoesEscolhidas): Promise<number> {
  const { data, error } = await supabase.rpc('assistente_aplicar', { p_sessao: sessaoId, p_secoes: secoes })
  if (error) throw new Error(error.message.includes('escolha') ? 'Escolha ao menos uma parte da proposta.' : 'Não foi possível aplicar. Tente de novo.')
  return Number((data as { aplicadas?: number } | null)?.aplicadas ?? 0)
}

export async function desfazerProposta(sessaoId: string) {
  const { error } = await supabase.rpc('assistente_desfazer', { p_sessao: sessaoId })
  if (error) throw new Error('Não foi possível desfazer. Tente de novo.')
}

/** A base como o agente lê, já com a proposta (para testar no simulador antes de aplicar). */
export function baseComProposta(
  atual: { id: string; titulo: string; conteudo: string; ativo: boolean }[],
  base: ItemBaseProposto[],
): string {
  const porId = new Map(atual.filter((b) => b.ativo).map((b) => [b.id, { titulo: b.titulo, conteudo: b.conteudo }]))
  for (const item of base) {
    if (item.acao === 'desativar' && item.id) porId.delete(item.id)
    else if (item.acao === 'atualizar' && item.id) porId.set(item.id, { titulo: item.titulo, conteudo: item.conteudo ?? '' })
    else if (item.acao === 'criar') porId.set(`novo:${item.titulo}`, { titulo: item.titulo, conteudo: item.conteudo ?? '' })
  }
  return [...porId.values()]
    .sort((a, b) => a.titulo.localeCompare(b.titulo))
    .map((b) => `## ${b.titulo}\n\n${b.conteudo}`)
    .join('\n\n---\n\n')
}
