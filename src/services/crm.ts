import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'
import type { EstadoConversa } from './atendimento'

type Tabelas = Database['public']['Tables']
export type TipoEtapa = Database['public']['Enums']['tipo_etapa']
export type Etapa = Pick<Tabelas['etapas_funil']['Row'], 'id' | 'nome' | 'ordem' | 'tipo'>

type EtapaResumo = { nome: string; tipo: TipoEtapa } | null

export type ContatoLista = Pick<
  Tabelas['contatos']['Row'],
  'id' | 'nome' | 'nome_whatsapp' | 'telefone' | 'empresa' | 'email' | 'origem' | 'tags' | 'responsavel_id' | 'sem_agente' | 'criado_em'
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
  'id' | 'titulo' | 'resumo' | 'valor_estimado' | 'responsavel_id' | 'origem' | 'fechada_em' | 'motivo_perda' | 'motivo_perda_id' | 'etapa_id' | 'contato_id' | 'criado_em' | 'atualizado_em'
> & { contato: { id: string; nome: string | null; nome_whatsapp: string | null; telefone: string | null } | null }

export type PassoFunil = {
  id: number
  etapa_de: string | null
  etapa_para: string | null
  autor_tipo: Database['public']['Enums']['autor_tipo']
  autor_id: string | null
  criado_em: string
}

export type DadosContato = Pick<Tabelas['contatos']['Row'], 'nome' | 'telefone' | 'empresa' | 'email' | 'responsavel_id' | 'sem_agente' | 'descadastrado_em'>

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
      'id, nome, nome_whatsapp, telefone, empresa, email, origem, tags, responsavel_id, sem_agente, criado_em, ' +
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

// ---- importar e exportar contatos (migration 20261105170000, docs/crm-acompanhamento.md entrega 4) ----

export type ContatoExportado = Pick<
  Tabelas['contatos']['Row'],
  'nome' | 'nome_whatsapp' | 'telefone' | 'email' | 'empresa' | 'tags' | 'responsavel_id' | 'origem' | 'sem_agente' | 'descadastrado_em' | 'criado_em'
>

/** Todos os contatos que a pessoa vê (com a busca da tela), em páginas de 1.000, até 20.000. */
export async function exportarContatos(orgId: string, busca: string): Promise<ContatoExportado[]> {
  const termo = busca.trim().replace(/[,()%]/g, ' ')
  const todos: ContatoExportado[] = []
  for (let de = 0; de < 20_000; de += 1000) {
    let q = supabase
      .from('contatos')
      .select('nome, nome_whatsapp, telefone, email, empresa, tags, responsavel_id, origem, sem_agente, descadastrado_em, criado_em')
      .eq('org_id', orgId)
    if (termo) {
      const digitos = termo.replace(/\D/g, '')
      const filtros = [`nome.ilike.%${termo}%`, `nome_whatsapp.ilike.%${termo}%`, `empresa.ilike.%${termo}%`, `email.ilike.%${termo}%`]
      if (digitos.length >= 4) filtros.push(`telefone.like.%${digitos}%`)
      q = q.or(filtros.join(','))
    }
    const { data, error } = await q.order('criado_em').order('id').range(de, de + 999)
    if (error) throw error
    todos.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return todos
}

export type ResultadoImportacaoContatos = { criados: number; atualizados: number; avisos: string[] }

export async function importarContatos(orgId: string, linhas: unknown[]): Promise<ResultadoImportacaoContatos> {
  const { data, error } = await supabase.rpc('contatos_importar', { p_org: orgId, p_linhas: linhas as never })
  if (error) {
    throw new Error(
      error.message.includes('só dono e admin')
        ? 'Só dono e admin importam contatos.'
        : error.message.includes('5.000')
          ? 'No máximo 5.000 linhas por vez. Divida a planilha.'
          : 'Não foi possível importar. Confira a planilha e tente de novo.',
    )
  }
  return data as ResultadoImportacaoContatos
}

// ---- motivos de perda ----

export type MotivoPerda = Pick<Tabelas['motivos_perda']['Row'], 'id' | 'nome' | 'ordem' | 'ativo'>

export async function listarMotivosPerda(orgId: string): Promise<MotivoPerda[]> {
  const { data, error } = await supabase.from('motivos_perda').select('id, nome, ordem, ativo').eq('org_id', orgId).order('ordem').order('nome')
  if (error) throw error
  return data ?? []
}

export async function salvarMotivosPerda(orgId: string, motivos: { id?: string; nome: string; ativo: boolean }[], apagar: string[]) {
  for (const [i, m] of motivos.entries()) {
    const linha = { org_id: orgId, nome: m.nome.trim(), ordem: i + 1, ativo: m.ativo }
    const { error } = m.id
      ? await supabase.from('motivos_perda').update(linha).eq('id', m.id)
      : await supabase.from('motivos_perda').insert(linha)
    if (error) throw new Error(error.code === '23505' ? `O motivo “${m.nome.trim()}” está repetido.` : 'Não foi possível salvar os motivos de perda.')
  }
  if (apagar.length) {
    const { error } = await supabase.from('motivos_perda').delete().in('id', apagar)
    if (error) throw new Error('Não foi possível apagar os motivos de perda.')
  }
}

export type PerdaPorMotivo = { motivo: string; quantidade: number; valor: number }

export async function perdasPorMotivo(orgId: string, de: Date, ate: Date, vendedor: string | null): Promise<PerdaPorMotivo[]> {
  const { data, error } = await supabase.rpc('painel_perdas', {
    p_org: orgId,
    p_de: de.toISOString(),
    p_ate: ate.toISOString(),
    p_vendedor: vendedor as string,
  })
  if (error) throw error
  return (data ?? []) as PerdaPorMotivo[]
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

/**
 * Salva o funil inteiro de uma vez: etapas abertas na ordem do quadro (id null = nova), nomes de Ganho e Perdido
 * e, para cada etapa removida que tem cartões, a etapa que os recebe.
 */
export async function salvarFunil(
  orgId: string,
  abertas: { id: string | null; nome: string }[],
  ganho: string,
  perdido: string,
  mover: Record<string, string>,
) {
  const { error } = await supabase.rpc('funil_salvar', {
    p_org: orgId,
    p_abertas: abertas,
    p_ganho: ganho,
    p_perdido: perdido,
    p_mover: mover,
  })
  if (error) {
    const m = error.message
    throw new Error(
      m.includes('mesmo nome') || m.includes('precisa de nome') || m.includes('escolha para onde') || m.includes('no máximo')
        ? m.charAt(0).toUpperCase() + m.slice(1) + '.'
        : 'Não foi possível salvar as etapas. Tente de novo.',
    )
  }
}

const CAMPOS_OPORTUNIDADE =
  'id, titulo, resumo, valor_estimado, responsavel_id, origem, fechada_em, motivo_perda, motivo_perda_id, etapa_id, contato_id, criado_em, atualizado_em, ' +
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
  campos: Partial<Pick<Oportunidade, 'titulo' | 'resumo' | 'valor_estimado' | 'responsavel_id' | 'etapa_id' | 'motivo_perda' | 'motivo_perda_id'>>,
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
