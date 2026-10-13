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
> & {
  contato: Pick<Contato, 'id' | 'nome' | 'nome_whatsapp' | 'telefone' | 'sem_agente'> | null
  canal: { id: string; nome: string; tipo: string } | null
}

export type Organizacao = { id: string; nome: string; status: string; papel: Database['public']['Enums']['papel_org'] }

export type Oportunidade = Pick<Tabelas['oportunidades']['Row'], 'id' | 'titulo' | 'valor_estimado' | 'resumo'> & {
  etapa: { nome: string; tipo: Database['public']['Enums']['tipo_etapa'] } | null
}

const CAMPOS_CONVERSA =
  'id, estado, atribuida_a, motivo_humano, ultima_mensagem_em, ultima_mensagem_resumo, nao_lidas, contato:contatos(id, nome, nome_whatsapp, telefone, sem_agente), canal:canais(id, nome, tipo)'

export async function listarOrganizacoes(userId: string): Promise<Organizacao[]> {
  const { data, error } = await supabase
    .from('membros_org')
    .select('papel, organizacoes(id, nome, status)')
    .eq('user_id', userId)
    .eq('ativo', true)
  if (error) throw error
  return (data ?? [])
    .filter((m) => m.organizacoes)
    .map((m) => ({ id: m.organizacoes!.id, nome: m.organizacoes!.nome, status: m.organizacoes!.status, papel: m.papel }))
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

export type NumeroVisivel = { id: string; nome: string; tipo: string; responsavel_id: string | null }

/** Números que a pessoa vê (a RLS já tira os de outros vendedores). */
export async function listarNumerosVisiveis(orgId: string): Promise<NumeroVisivel[]> {
  const { data, error } = await supabase
    .from('canais')
    .select('id, nome, tipo, responsavel_id')
    .eq('org_id', orgId)
    .eq('ativo', true)
    .order('criado_em')
  if (error) throw error
  return data ?? []
}

export async function listarConversas(orgId: string, estado: EstadoConversa, canalId?: string): Promise<ConversaLista[]> {
  let consulta = supabase
    .from('conversas')
    .select(CAMPOS_CONVERSA)
    .eq('org_id', orgId)
    .eq('estado', estado)
  if (canalId) consulta = consulta.eq('canal_id', canalId)
  const { data, error } = await consulta
    .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
    .limit(estado === 'encerrada' ? 100 : 300)
  if (error) throw error
  return (data ?? []) as ConversaLista[]
}

export async function contarPorEstado(orgId: string, canalId?: string): Promise<Record<EstadoConversa, number>> {
  const estados: EstadoConversa[] = ['aguardando_humano', 'humano', 'bot']
  const resultados = await Promise.all(
    estados.map((estado) => {
      const consulta = supabase
        .from('conversas')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('estado', estado)
      return canalId ? consulta.eq('canal_id', canalId) : consulta
    }),
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

/** Envia um modelo aprovado da API oficial (fora da janela de 24 h). `texto` é o que fica no histórico. */
export async function enviarModelo(conversaId: string, nome: string, idioma: string, parametros: string[], texto: string) {
  const { error } = await supabase.rpc('enviar_modelo', {
    p_conversa: conversaId,
    p_nome: nome,
    p_idioma: idioma,
    p_parametros: parametros,
    p_texto: texto,
  })
  if (error) throw error
}

/** Prospecção: abre (ou reabre) a conversa com o número e, se houver texto, já envia. Devolve o id da conversa. */
export async function iniciarConversa(canalId: string, telefone: string, nome: string | null, texto: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('iniciar_conversa', {
    p_canal: canalId,
    p_telefone: telefone,
    p_nome: nome ?? undefined,
    p_texto: texto ?? undefined,
  })
  if (error) {
    const m = error.message
    console.error('iniciar_conversa', error)
    throw new Error(
      m.includes('outro vendedor')
        ? 'Esse número já é cliente de outro vendedor. Peça para ele, ou para o dono, passar o contato para você.'
        : m.includes('telefone inválido')
          ? 'Número inválido. Use o celular com DDD.'
          : m.includes('suspensa')
            ? 'Esta empresa está suspensa.'
            : m.includes('Failed to fetch') || m.includes('NetworkError')
              ? 'A conexão com o Livih falhou e nada foi enviado. Confira a internet e tente de novo.'
              : m.includes('JWT')
                ? 'Sua sessão expirou. Recarregue a página e tente de novo.'
                : `Não foi possível iniciar a conversa (${m}).`,
    )
  }
  return data
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

export async function criarNota(orgId: string, contatoId: string, conversaId: string | null, texto: string) {
  const { error } = await supabase
    .from('notas')
    .insert({ org_id: orgId, contato_id: contatoId, conversa_id: conversaId, texto })
  if (error) throw error
}
