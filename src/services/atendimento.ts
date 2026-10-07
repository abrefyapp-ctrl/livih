import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

type Tabelas = Database['public']['Tables']
export type EstadoConversa = Database['public']['Enums']['estado_conversa']
export type Mensagem = Tabelas['mensagens']['Row']
export type Contato = Tabelas['contatos']['Row']
export type Nota = Tabelas['notas']['Row']
export type Perfil = Tabelas['perfis']['Row']

export type ConversaLista = Pick<
  Tabelas['conversas']['Row'],
  'id' | 'estado' | 'atribuida_a' | 'motivo_humano' | 'ultima_mensagem_em' | 'ultima_mensagem_resumo' | 'nao_lidas'
> & { contato: Pick<Contato, 'id' | 'nome' | 'nome_whatsapp' | 'telefone'> | null }

export type Organizacao = { id: string; nome: string; papel: Database['public']['Enums']['papel_org'] }

export type Oportunidade = Pick<Tabelas['oportunidades']['Row'], 'id' | 'titulo' | 'valor_estimado' | 'resumo'> & {
  etapa: { nome: string; tipo: Database['public']['Enums']['tipo_etapa'] } | null
}

const CAMPOS_CONVERSA =
  'id, estado, atribuida_a, motivo_humano, ultima_mensagem_em, ultima_mensagem_resumo, nao_lidas, contato:contatos(id, nome, nome_whatsapp, telefone)'

export async function listarOrganizacoes(userId: string): Promise<Organizacao[]> {
  const { data, error } = await supabase
    .from('membros_org')
    .select('papel, organizacoes(id, nome)')
    .eq('user_id', userId)
    .eq('ativo', true)
  if (error) throw error
  return (data ?? [])
    .filter((m) => m.organizacoes)
    .map((m) => ({ id: m.organizacoes!.id, nome: m.organizacoes!.nome, papel: m.papel }))
    .sort((a, b) => a.nome.localeCompare(b.nome))
}

/** Perfis da equipe (para mostrar quem está atendendo). A RLS só devolve quem divide organização. */
export async function listarEquipe(orgId: string): Promise<Perfil[]> {
  const { data: membros, error } = await supabase.from('membros_org').select('user_id').eq('org_id', orgId)
  if (error) throw error
  const ids = (membros ?? []).map((m) => m.user_id)
  if (!ids.length) return []
  const { data, error: erroPerfis } = await supabase.from('perfis').select('*').in('user_id', ids)
  if (erroPerfis) throw erroPerfis
  return data ?? []
}

export async function listarConversas(orgId: string, estado: EstadoConversa): Promise<ConversaLista[]> {
  const { data, error } = await supabase
    .from('conversas')
    .select(CAMPOS_CONVERSA)
    .eq('org_id', orgId)
    .eq('estado', estado)
    .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
    .limit(estado === 'encerrada' ? 100 : 300)
  if (error) throw error
  return (data ?? []) as ConversaLista[]
}

export async function contarPorEstado(orgId: string): Promise<Record<EstadoConversa, number>> {
  const estados: EstadoConversa[] = ['aguardando_humano', 'humano', 'bot']
  const resultados = await Promise.all(
    estados.map((estado) =>
      supabase
        .from('conversas')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('estado', estado),
    ),
  )
  const contagem = { aguardando_humano: 0, humano: 0, bot: 0, encerrada: 0 }
  resultados.forEach((r, i) => {
    if (r.error) throw r.error
    contagem[estados[i]] = r.count ?? 0
  })
  return contagem
}

export async function buscarConversa(id: string): Promise<ConversaLista | null> {
  const { data, error } = await supabase.from('conversas').select(CAMPOS_CONVERSA).eq('id', id).maybeSingle()
  if (error) throw error
  return data as ConversaLista | null
}

/** As 200 mais recentes, em ordem cronológica. */
export async function listarMensagens(conversaId: string): Promise<Mensagem[]> {
  const { data, error } = await supabase
    .from('mensagens')
    .select('*')
    .eq('conversa_id', conversaId)
    .order('criado_em', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).reverse()
}

/** Responde pelo sistema. O backend coloca a conversa em atendimento por quem enviou. */
export async function enviarMensagem(conversaId: string, texto: string) {
  const { error } = await supabase.rpc('enviar_mensagem', { p_conversa: conversaId, p_texto: texto })
  if (error) throw error
}

async function atualizarConversa(id: string, campos: Database['public']['Tables']['conversas']['Update']) {
  const { error } = await supabase.from('conversas').update(campos).eq('id', id)
  if (error) throw error
}

export const assumirConversa = (id: string, userId: string) =>
  atualizarConversa(id, { estado: 'humano', atribuida_a: userId })

export const devolverAoAgente = (id: string) =>
  atualizarConversa(id, { estado: 'bot', atribuida_a: null, motivo_humano: null })

export const encerrarConversa = (id: string) => atualizarConversa(id, { estado: 'encerrada', atribuida_a: null })

export const marcarComoLida = (id: string) => atualizarConversa(id, { nao_lidas: 0 })

export async function buscarContato(id: string): Promise<Contato | null> {
  const { data, error } = await supabase.from('contatos').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function listarOportunidades(contatoId: string): Promise<Oportunidade[]> {
  const { data, error } = await supabase
    .from('oportunidades')
    .select('id, titulo, valor_estimado, resumo, etapa:etapas_funil(nome, tipo)')
    .eq('contato_id', contatoId)
    .order('criado_em', { ascending: false })
  if (error) throw error
  return (data ?? []) as Oportunidade[]
}

export async function listarNotas(contatoId: string): Promise<Nota[]> {
  const { data, error } = await supabase
    .from('notas')
    .select('*')
    .eq('contato_id', contatoId)
    .order('criado_em', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export async function criarNota(orgId: string, contatoId: string, conversaId: string, texto: string) {
  const { error } = await supabase
    .from('notas')
    .insert({ org_id: orgId, contato_id: contatoId, conversa_id: conversaId, texto })
  if (error) throw error
}
