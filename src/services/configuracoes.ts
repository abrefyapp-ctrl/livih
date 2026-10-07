import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

type Tabelas = Database['public']['Tables']
export type Papel = Database['public']['Enums']['papel_org']
export type Agente = Tabelas['agentes']['Row']
export type ConteudoBase = Tabelas['base_conhecimento']['Row']

export type MembroEquipe = {
  user_id: string
  nome: string | null
  email: string
  papel: Papel
  ativo: boolean
  ultimo_acesso: string | null
  senha_definida: boolean
  criado_em: string
}

export async function listarEquipeCompleta(orgId: string): Promise<MembroEquipe[]> {
  const { data, error } = await supabase.rpc('equipe_listar', { p_org: orgId })
  if (error) throw error
  return (data ?? []) as MembroEquipe[]
}

/** Devolve o link de convite (conta nova ou ainda sem senha) ou null (já tinha conta). */
export async function convidarMembro(
  orgId: string,
  dados: { email: string; nome: string; papel: Exclude<Papel, 'dono'> },
): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('convidar-membro', {
    body: { org_id: orgId, ...dados, redirect_to: `${window.location.origin}/definir-senha` },
  })
  if (error) {
    const corpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
    throw new Error(corpo?.erro ?? 'Não foi possível convidar agora. Tente de novo.')
  }
  return (data as { link: string | null }).link
}

export async function alterarMembro(orgId: string, userId: string, campos: { papel?: Papel; ativo?: boolean }) {
  const { error } = await supabase.from('membros_org').update(campos).eq('org_id', orgId).eq('user_id', userId)
  if (error) {
    throw new Error(
      error.message.includes('pelo menos um dono')
        ? 'A organização precisa de pelo menos um dono ativo.'
        : 'Não foi possível salvar. Tente de novo.',
    )
  }
}

export async function buscarAgente(orgId: string): Promise<Agente | null> {
  const { data, error } = await supabase.from('agentes').select('*').eq('org_id', orgId).limit(1).maybeSingle()
  if (error) throw error
  return data
}

export async function salvarAgente(
  id: string,
  campos: Pick<Agente, 'ativo' | 'prompt' | 'telefone_alerta' | 'regras_humano'>,
) {
  const { error } = await supabase.from('agentes').update(campos).eq('id', id)
  if (error) throw new Error('Não foi possível salvar o agente. Tente de novo.')
}

export async function listarBase(orgId: string): Promise<ConteudoBase[]> {
  const { data, error } = await supabase
    .from('base_conhecimento')
    .select('*')
    .eq('org_id', orgId)
    .order('ativo', { ascending: false })
    .order('titulo')
  if (error) throw error
  return data ?? []
}

export async function salvarConteudo(
  orgId: string,
  id: string | null,
  campos: Pick<ConteudoBase, 'titulo' | 'conteudo' | 'ativo'>,
) {
  const consulta = id
    ? supabase.from('base_conhecimento').update(campos).eq('id', id)
    : supabase.from('base_conhecimento').insert({ org_id: orgId, ...campos })
  const { error } = await consulta
  if (error) throw new Error('Não foi possível salvar o conteúdo. Tente de novo.')
}

export async function removerConteudo(id: string) {
  const { error } = await supabase.from('base_conhecimento').delete().eq('id', id)
  if (error) throw new Error('Não foi possível remover. Tente de novo.')
}
