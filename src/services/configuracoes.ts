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

type RespostaConvite = { link: string | null; aviso?: string | null }

async function chamarConvite(corpo: Record<string, unknown>): Promise<RespostaConvite> {
  const { data, error } = await supabase.functions.invoke('convidar-membro', {
    body: { ...corpo, redirect_to: `${window.location.origin}/definir-senha` },
  })
  if (error) {
    const resposta = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
    throw new Error(resposta?.erro ?? 'Não foi possível gerar o link agora. Tente de novo.')
  }
  return data as RespostaConvite
}

/** Link de convite (conta nova ou ainda sem senha); link null = já tinha conta (aviso explica se houver). */
export const convidarMembro = (orgId: string, dados: { email: string; nome: string; papel: Exclude<Papel, 'dono'> }) =>
  chamarConvite({ org_id: orgId, ...dados })

/** Dono de empresa nova (só a equipe da plataforma): mesmo convite, papel dono. */
export const convidarDono = (orgId: string, dados: { email: string; nome: string }) =>
  chamarConvite({ org_id: orgId, ...dados, papel: 'dono' })

/** Link para alguém da equipe criar senha nova (esqueceu), sem depender de e-mail. */
export const linkNovaSenha = (orgId: string, email: string) =>
  chamarConvite({ org_id: orgId, email, acao: 'redefinir' }).then((r) => r.link)

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
  campos: Pick<Agente, 'prompt' | 'telefone_alerta' | 'regras_humano'>,
) {
  // As outras linhas da organização acompanham (trigger agentes_sincronizar).
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

export type NumeroWhatsapp = {
  id: string
  nome: string
  responsavel_id: string | null
  status_conexao: string | null
  numero_conectado: string | null
  conectado_em: string | null
  caiu_em: string | null
  alerta_queda_em: string | null
  desconectado_em: string | null
  agente_ativo: boolean
}

async function conexao<T>(orgId: string, acao: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp-conexao', { body: { org_id: orgId, acao, ...extra } })
  if (error) {
    const corpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
    throw new Error(corpo?.erro ?? 'Não foi possível falar com o WhatsApp. Tente de novo.')
  }
  return data as T
}

/** Números que a pessoa pode ver, com o estado consultado no WAHA agora. */
export const listarNumeros = (orgId: string) =>
  conexao<{ canais: NumeroWhatsapp[] }>(orgId, 'listar').then((r) => r.canais)
export const criarNumero = (orgId: string, nome: string, responsavelId: string | null) =>
  conexao<{ canal: NumeroWhatsapp }>(orgId, 'criar', { nome, responsavel_id: responsavelId })
export const iniciarNumero = (orgId: string, canalId: string) => conexao(orgId, 'iniciar', { canal_id: canalId })
export const qrNumero = (orgId: string, canalId: string) => conexao<{ imagem: string | null }>(orgId, 'qr', { canal_id: canalId })
export const codigoNumero = (orgId: string, canalId: string, telefone: string) =>
  conexao<{ codigo: string }>(orgId, 'codigo', { canal_id: canalId, telefone })
export const desconectarNumero = (orgId: string, canalId: string) => conexao(orgId, 'desconectar', { canal_id: canalId })
export const removerNumero = (orgId: string, canalId: string) => conexao(orgId, 'remover', { canal_id: canalId })

export async function editarNumero(canalId: string, campos: { nome: string; responsavel_id: string | null }) {
  const { error } = await supabase.from('canais').update(campos).eq('id', canalId)
  if (error) throw new Error('Não foi possível salvar o número. Tente de novo.')
}

/** Liga ou desliga o agente só neste número (as instruções são as mesmas da empresa). */
export async function ligarAgenteNoNumero(canalId: string, ativo: boolean) {
  const { error } = await supabase.from('agentes').update({ ativo }).eq('canal_id', canalId)
  if (error) throw new Error('Não foi possível mudar o agente deste número. Tente de novo.')
}

/** Números fora do ar há mais de 5 min (só os que a pessoa pode ver) — para a faixa de aviso. */
export async function numerosCaidos(orgId: string): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase
    .from('canais')
    .select('id, nome')
    .eq('org_id', orgId)
    .eq('ativo', true)
    .not('alerta_queda_em', 'is', null)
  if (error) throw error
  return data ?? []
}
