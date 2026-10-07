import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'
import type { EstadoConversa } from './atendimento'

type Tabelas = Database['public']['Tables']
export type TipoEtapa = Database['public']['Enums']['tipo_etapa']
export type Etapa = Pick<Tabelas['etapas_funil']['Row'], 'id' | 'nome' | 'ordem' | 'tipo'>

type EtapaResumo = { nome: string; tipo: TipoEtapa } | null

export type ContatoLista = Pick<
  Tabelas['contatos']['Row'],
  'id' | 'nome' | 'nome_whatsapp' | 'telefone' | 'empresa' | 'email' | 'origem' | 'tags' | 'responsavel_id' | 'criado_em'
> & {
  conversas: { id: string; estado: EstadoConversa; ultima_mensagem_em: string | null }[]
  oportunidades: { id: string; titulo: string; valor_estimado: number | null; fechada_em: string | null; etapa: EtapaResumo }[]
}

export type ContatoPerfil = Tabelas['contatos']['Row'] & {
  conversas: {
    id: string
    estado: EstadoConversa
    ultima_mensagem_em: string | null
    ultima_mensagem_resumo: string | null
    canal: { nome: string } | null
  }[]
}

export type Oportunidade = Pick<
  Tabelas['oportunidades']['Row'],
  'id' | 'titulo' | 'resumo' | 'valor_estimado' | 'responsavel_id' | 'origem' | 'fechada_em' | 'motivo_perda' | 'etapa_id' | 'contato_id' | 'criado_em' | 'atualizado_em'
> & { contato: { id: string; nome: string | null; nome_whatsapp: string | null; telefone: string | null } | null }

export type PassoFunil = {
  id: number
  etapa_de: string | null
  etapa_para: string | null
  autor_tipo: Database['public']['Enums']['autor_tipo']
  autor_id: string | null
  criado_em: string
}

export type DadosContato = Pick<Tabelas['contatos']['Row'], 'nome' | 'telefone' | 'empresa' | 'email' | 'responsavel_id'>

/** 41999998888 / (41) 99999-8888 / +55… → 5541999998888; vazio → null; inválido → undefined. */
export function normalizarTelefone(v: string): string | null | undefined {
  const d = v.replace(/\D/g, '')
  if (!d) return null
  if (d.length === 10 || d.length === 11) return `55${d}`
  if (d.length >= 12 && d.length <= 15) return d
  return undefined
}

const erroAmigavel = (e: { message: string; code?: string }, padrao: string) =>
  new Error(
    e.code === '23505'
      ? 'Já existe um contato com esse telefone.'
      : e.message.includes('da equipe')
        ? 'O responsável precisa ser da equipe.'
        : padrao,
  )

// ---- contatos ----

export async function listarContatos(orgId: string, busca: string): Promise<ContatoLista[]> {
  let consulta = supabase
    .from('contatos')
    .select(
      'id, nome, nome_whatsapp, telefone, empresa, email, origem, tags, responsavel_id, criado_em, ' +
        'conversas(id, estado, ultima_mensagem_em), ' +
        'oportunidades(id, titulo, valor_estimado, fechada_em, etapa:etapas_funil(nome, tipo))',
    )
    .eq('org_id', orgId)
  const termo = busca.trim().replace(/[,()%]/g, ' ')
  if (termo) {
    const digitos = termo.replace(/\D/g, '')
    const filtros = [`nome.ilike.%${termo}%`, `nome_whatsapp.ilike.%${termo}%`, `empresa.ilike.%${termo}%`, `email.ilike.%${termo}%`]
    if (digitos.length >= 4) filtros.push(`telefone.like.%${digitos}%`)
    consulta = consulta.or(filtros.join(','))
  }
  const { data, error } = await consulta.order('atualizado_em', { ascending: false }).limit(300)
  if (error) throw error
  return (data ?? []) as unknown as ContatoLista[]
}

export async function buscarContatoPerfil(id: string): Promise<ContatoPerfil | null> {
  const { data, error } = await supabase
    .from('contatos')
    .select('*, conversas(id, estado, ultima_mensagem_em, ultima_mensagem_resumo, canal:canais(nome))')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as ContatoPerfil | null
}

export async function criarContato(orgId: string, dados: DadosContato): Promise<string> {
  const { data, error } = await supabase
    .from('contatos')
    .insert({ org_id: orgId, origem: 'manual', ...dados })
    .select('id')
    .single()
  if (error) throw erroAmigavel(error, 'Não foi possível criar o contato. Tente de novo.')
  return data.id
}

export async function atualizarContato(id: string, dados: Partial<DadosContato>) {
  const { error } = await supabase.from('contatos').update(dados).eq('id', id)
  if (error) throw erroAmigavel(error, 'Não foi possível salvar o contato. Tente de novo.')
}

// ---- funil ----

export async function listarEtapas(orgId: string): Promise<Etapa[]> {
  const { data, error } = await supabase.from('etapas_funil').select('id, nome, ordem, tipo').eq('org_id', orgId).order('ordem')
  if (error) throw error
  return data ?? []
}

const CAMPOS_OPORTUNIDADE =
  'id, titulo, resumo, valor_estimado, responsavel_id, origem, fechada_em, motivo_perda, etapa_id, contato_id, criado_em, atualizado_em, ' +
  'contato:contatos(id, nome, nome_whatsapp, telefone)'

export async function listarOportunidades(orgId: string, contatoId?: string): Promise<Oportunidade[]> {
  let consulta = supabase.from('oportunidades').select(CAMPOS_OPORTUNIDADE).eq('org_id', orgId)
  if (contatoId) consulta = consulta.eq('contato_id', contatoId)
  const { data, error } = await consulta.order('atualizado_em', { ascending: false }).limit(500)
  if (error) throw error
  return (data ?? []) as unknown as Oportunidade[]
}

export async function criarOportunidade(
  orgId: string,
  dados: { contato_id: string; etapa_id: string; titulo: string; valor_estimado: number | null; responsavel_id: string | null },
) {
  const { error } = await supabase.from('oportunidades').insert({ org_id: orgId, origem: 'manual', ...dados })
  if (error) throw erroAmigavel(error, 'Não foi possível criar a oportunidade. Tente de novo.')
}

export async function atualizarOportunidade(
  id: string,
  campos: Partial<Pick<Oportunidade, 'titulo' | 'resumo' | 'valor_estimado' | 'responsavel_id' | 'etapa_id' | 'motivo_perda'>>,
) {
  const { error } = await supabase.from('oportunidades').update(campos).eq('id', id)
  if (error) throw erroAmigavel(error, 'Não foi possível salvar a oportunidade. Tente de novo.')
}

export async function historicoOportunidade(id: string): Promise<PassoFunil[]> {
  const { data, error } = await supabase
    .from('oportunidade_historico')
    .select('id, etapa_de, etapa_para, autor_tipo, autor_id, criado_em')
    .eq('oportunidade_id', id)
    .order('criado_em', { ascending: false })
  if (error) throw error
  return data ?? []
}
