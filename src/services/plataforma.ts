import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

type Funcoes = Database['public']['Functions']
export type Empresa = Funcoes['plataforma_empresas']['Returns'][number]
export type PedidoAcesso = Database['public']['Tables']['pedidos_acesso']['Row']
export type PrimeirosPassos = Funcoes['org_primeiros_passos']['Returns'][number]

export async function ehAdminPlataforma(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('admins_plataforma').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return !!data
}

export async function listarEmpresas(): Promise<Empresa[]> {
  const { data, error } = await supabase.rpc('plataforma_empresas')
  if (error) throw error
  return data ?? []
}

/** Cria a empresa vazia; o dono entra em seguida pelo link (convidarDono). */
export async function criarEmpresa(nome: string): Promise<string> {
  const { data, error } = await supabase.rpc('plataforma_criar_empresa', { p_nome: nome })
  if (error) throw new Error(error.message.includes('nome') ? 'Informe o nome da empresa.' : 'Não foi possível criar a empresa.')
  return data
}

export async function definirStatusEmpresa(orgId: string, status: 'ativa' | 'suspensa') {
  const { error } = await supabase.rpc('plataforma_definir_status', { p_org: orgId, p_status: status })
  if (error) throw new Error('Não foi possível mudar a situação. Tente de novo.')
}

export async function listarPedidosPendentes(): Promise<PedidoAcesso[]> {
  const { data, error } = await supabase
    .from('pedidos_acesso')
    .select('*')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function decidirPedido(id: string, decisao: { status: 'aprovado'; orgId: string } | { status: 'recusado' }, userId: string) {
  const { error } = await supabase
    .from('pedidos_acesso')
    .update({
      status: decisao.status,
      org_id: decisao.status === 'aprovado' ? decisao.orgId : null,
      decidido_em: new Date().toISOString(),
      decidido_por: userId,
    })
    .eq('id', id)
  if (error) throw new Error('Não foi possível registrar a decisão.')
}

export async function buscarPrimeirosPassos(orgId: string): Promise<PrimeirosPassos | null> {
  const { data, error } = await supabase.rpc('org_primeiros_passos', { p_org: orgId })
  if (error) throw error
  return data?.[0] ?? null
}
