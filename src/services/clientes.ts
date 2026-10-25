import { supabase } from './supabaseClient'
import type { Database, Json } from './tiposBanco'
import type { LinhaCliente } from './planilhaClientes'

// Cadastro de clientes (migration 20261024120000, docs/clientes.md). Cliente é quem compra (CNPJ ou CPF); os
// contatos do WhatsApp apontam o cliente (contatos.cliente_id). A RLS segue a carteira; quem tem "Vê todos os
// clientes" vê todos (balcão), sem ver as conversas.

type Tabelas = Database['public']['Tables']
export type Cliente = Tabelas['clientes']['Row']
export type TipoCliente = 'pj' | 'pf'
export type DadosCliente = Pick<
  Cliente,
  | 'tipo' | 'nome' | 'razao_social' | 'documento' | 'inscricao_estadual' | 'cep' | 'logradouro' | 'numero' | 'complemento'
  | 'bairro' | 'cidade' | 'uf' | 'email' | 'telefone' | 'observacoes' | 'ativo'
> & { responsavel_id?: string | null }

export type ClienteLista = Cliente & {
  contatos: { count: number }[]
  pedidos: { numero: number; criado_em: string }[]
}
export type ContatoDoCliente = Pick<Tabelas['contatos']['Row'], 'id' | 'nome' | 'nome_whatsapp' | 'telefone' | 'email' | 'responsavel_id'>
export type PedidoDoCliente = Pick<Tabelas['pedidos']['Row'], 'id' | 'numero' | 'status' | 'total' | 'criado_em'>
/** O que o bloco "Cliente" do contato e da conversa mostra. */
export type ClienteResumo = Pick<Cliente, 'id' | 'nome' | 'razao_social' | 'tipo' | 'documento' | 'cidade' | 'uf'>

const RESUMO = 'id, nome, razao_social, tipo, documento, cidade, uf'

// ---- documento ----

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

function digitosVerificadores(base: string, pesos: number[]) {
  const s = pesos.reduce((t, p, i) => t + Number(base[i]) * p, 0)
  return s % 11 < 2 ? 0 : 11 - (s % 11)
}

/** Mesma conta do banco (cnpj_valido / cpf_valido): a tela avisa antes de tentar salvar. */
export function documentoValido(tipo: TipoCliente, v: string) {
  const d = soDigitos(v)
  if (tipo === 'pj') {
    if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false
    const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    return digitosVerificadores(d, p1) === Number(d[12]) && digitosVerificadores(d, [6, ...p1]) === Number(d[13])
  }
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false
  const p = [10, 9, 8, 7, 6, 5, 4, 3, 2]
  return digitosVerificadores(d, p) === Number(d[9]) && digitosVerificadores(d, [11, ...p]) === Number(d[10])
}

// Formatação sem Supabase fica em formato.ts (o PDF, que roda também no servidor, usa as mesmas).
export { enderecoEmLinha, formatarCep, formatarDocumento } from './formato'

const erroAmigavel = (e: { message: string; code?: string }, padrao: string) =>
  new Error(
    e.code === '23505'
      ? 'Já existe um cliente com esse CNPJ/CPF.'
      : e.code === '23514'
        ? 'Confira o CNPJ/CPF, o CEP e a UF.'
        : e.message.includes('só dono e admin')
          ? 'Só dono e admin trocam o vendedor responsável.'
          : e.message.includes('da equipe')
            ? 'O responsável precisa ser da equipe.'
            : e.message === 'cliente não encontrado'
              ? 'Cliente não encontrado (pode ser da carteira de outro vendedor).'
              : padrao,
  )

// ---- clientes ----

export async function listarClientes(orgId: string, busca: string, comPedidos: boolean): Promise<ClienteLista[]> {
  const campos = comPedidos ? '*, contatos(count), pedidos(numero, criado_em)' : '*, contatos(count)'
  let consulta = supabase.from('clientes').select(campos).eq('org_id', orgId)
  const termo = busca.trim().replace(/[,()%]/g, ' ')
  if (termo) {
    const digitos = termo.replace(/\D/g, '')
    const filtros = [`nome.ilike.%${termo}%`, `razao_social.ilike.%${termo}%`, `cidade.ilike.%${termo}%`]
    if (digitos.length >= 4) filtros.push(`documento.like.%${digitos}%`)
    consulta = consulta.or(filtros.join(','))
  }
  if (comPedidos) consulta = consulta.order('criado_em', { referencedTable: 'pedidos', ascending: false }).limit(1, { referencedTable: 'pedidos' })
  const { data, error } = await consulta.order('nome').limit(500)
  if (error) throw error
  return ((data ?? []) as unknown as ClienteLista[]).map((c) => ({ ...c, pedidos: c.pedidos ?? [] }))
}

export async function buscarCliente(id: string): Promise<Cliente | null> {
  const { data, error } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** Cria ou atualiza; devolve o id. */
export async function salvarCliente(orgId: string, id: string | null, dados: DadosCliente): Promise<string> {
  if (id) {
    const { error } = await supabase.from('clientes').update(dados).eq('id', id)
    if (error) throw erroAmigavel(error, 'Não foi possível salvar o cliente. Tente de novo.')
    return id
  }
  const { data, error } = await supabase.from('clientes').insert({ org_id: orgId, ...dados }).select('id').single()
  if (error) throw erroAmigavel(error, 'Não foi possível criar o cliente. Tente de novo.')
  return data.id
}

export async function apagarCliente(id: string) {
  const { data, error } = await supabase.from('clientes').delete().eq('id', id).select('id')
  if (error) throw erroAmigavel(error, 'Não foi possível remover o cliente.')
  if (!data?.length) throw new Error('Só dono e admin removem clientes.')
}

/** Busca para escolher um cliente (ligar contato, pedido). */
export async function procurarClientes(orgId: string, busca: string): Promise<ClienteResumo[]> {
  const termo = busca.trim().replace(/[,()%]/g, ' ')
  if (!termo) return []
  const digitos = termo.replace(/\D/g, '')
  const filtros = [`nome.ilike.%${termo}%`, `razao_social.ilike.%${termo}%`]
  if (digitos.length >= 4) filtros.push(`documento.like.%${digitos}%`)
  const { data, error } = await supabase
    .from('clientes')
    .select(RESUMO)
    .eq('org_id', orgId)
    .eq('ativo', true)
    .or(filtros.join(','))
    .order('nome')
    .limit(8)
  if (error) throw error
  return data ?? []
}

export async function clienteResumo(id: string): Promise<ClienteResumo | null> {
  const { data, error } = await supabase.from('clientes').select(RESUMO).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

// ---- contatos do cliente ----

export async function contatosDoCliente(clienteId: string): Promise<ContatoDoCliente[]> {
  const { data, error } = await supabase
    .from('contatos')
    .select('id, nome, nome_whatsapp, telefone, email, responsavel_id')
    .eq('cliente_id', clienteId)
    .order('nome')
  if (error) throw error
  return data ?? []
}

/** Liga (ou solta, com null) o contato a um cliente. */
export async function ligarContato(contatoId: string, clienteId: string | null) {
  const { data, error } = await supabase.from('contatos').update({ cliente_id: clienteId }).eq('id', contatoId).select('id')
  if (error) throw erroAmigavel(error, 'Não foi possível ligar o contato. Tente de novo.')
  if (!data?.length) throw new Error('Este contato é da carteira de outro vendedor: só ele, o dono ou o admin mudam.')
}

/** Contatos que a pessoa vê, para ligar ao cliente. */
export async function procurarContatos(orgId: string, busca: string): Promise<(ContatoDoCliente & { cliente_id: string | null })[]> {
  const termo = busca.trim().replace(/[,()%]/g, ' ')
  if (!termo) return []
  const digitos = termo.replace(/\D/g, '')
  const filtros = [`nome.ilike.%${termo}%`, `nome_whatsapp.ilike.%${termo}%`, `empresa.ilike.%${termo}%`]
  if (digitos.length >= 4) filtros.push(`telefone.like.%${digitos}%`)
  const { data, error } = await supabase
    .from('contatos')
    .select('id, nome, nome_whatsapp, telefone, email, responsavel_id, cliente_id')
    .eq('org_id', orgId)
    .or(filtros.join(','))
    .limit(8)
  if (error) throw error
  return data ?? []
}

export async function pedidosDoCliente(clienteId: string): Promise<PedidoDoCliente[]> {
  const { data, error } = await supabase
    .from('pedidos')
    .select('id, numero, status, total, criado_em')
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export type OrdemDoCliente = Pick<Tabelas['ordens_servico']['Row'], 'id' | 'numero' | 'recebida_em' | 'nf_cliente'>

export async function ordensDoCliente(clienteId: string): Promise<OrdemDoCliente[]> {
  const { data, error } = await supabase
    .from('ordens_servico')
    .select('id, numero, recebida_em, nf_cliente')
    .eq('cliente_id', clienteId)
    .order('recebida_em', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export type NegocioDoCliente ={ id: string; titulo: string; valor_estimado: number | null; fechada_em: string | null; contato_id: string; etapa: { nome: string; tipo: Database['public']['Enums']['tipo_etapa'] } | null }
export type ConversaDoCliente = { id: string; estado: Database['public']['Enums']['estado_conversa']; ultima_mensagem_em: string | null; ultima_mensagem_resumo: string | null; contato_id: string }

/** Negócios e conversas dos contatos ligados. A RLS mostra só os da carteira ("ver todos" não abre). */
export async function atividadeDosContatos(contatoIds: string[]): Promise<{ negocios: NegocioDoCliente[]; conversas: ConversaDoCliente[] }> {
  if (!contatoIds.length) return { negocios: [], conversas: [] }
  const [n, v] = await Promise.all([
    supabase
      .from('oportunidades')
      .select('id, titulo, valor_estimado, fechada_em, contato_id, etapa:etapas_funil(nome, tipo)')
      .in('contato_id', contatoIds)
      .order('atualizado_em', { ascending: false })
      .limit(30),
    supabase
      .from('conversas')
      .select('id, estado, ultima_mensagem_em, ultima_mensagem_resumo, contato_id')
      .in('contato_id', contatoIds)
      .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
      .limit(30),
  ])
  if (n.error) throw n.error
  if (v.error) throw v.error
  return { negocios: (n.data ?? []) as unknown as NegocioDoCliente[], conversas: v.data ?? [] }
}

// ---- importação (planilha) ----

export type ResultadoImportacao = { criados: number; atualizados: number; contatos_criados: number; contatos_ligados: number; avisos: string[] }

export async function importarClientes(orgId: string, linhas: LinhaCliente[]): Promise<ResultadoImportacao> {
  const { data, error } = await supabase.rpc('clientes_importar', { p_org: orgId, p_linhas: linhas as unknown as Json })
  if (error) throw new Error(error.message.includes('só dono e admin') ? 'Só dono e admin importam clientes.' : 'Não foi possível importar. Nada foi gravado.')
  return data as unknown as ResultadoImportacao
}

// ---- equipe ----

/** Quem da equipe tem "Vê todos os clientes" ligado (dono e admin já veem todos sem precisar). */
export async function listarVeTodosClientes(orgId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('membros_org').select('user_id').eq('org_id', orgId).eq('ve_todos_clientes', true)
  if (error) throw error
  return new Set((data ?? []).map((m) => m.user_id))
}

export async function definirVeTodosClientes(orgId: string, userId: string, valor: boolean) {
  const { error } = await supabase.rpc('membro_definir_ve_todos_clientes', { p_org: orgId, p_usuario: userId, p_valor: valor })
  if (error) throw new Error('Não foi possível mudar a permissão. Só dono e admin mudam.')
}

// ---- BrasilAPI (gratuita, sem chave, direto do navegador) ----

export type DadosBusca = Partial<Pick<Cliente, 'nome' | 'razao_social' | 'cep' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf' | 'email' | 'telefone'>>

const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
/** "RUA DAS FLORES" → "Rua das Flores" (a Receita devolve tudo em maiúsculas). */
const capitalizar = (v: string | undefined) =>
  v?.toLowerCase().replace(/(^|\s|\/|-)(\p{L})/gu, (_, s: string, l: string) => s + l.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase())

export async function buscarCnpj(cnpj: string): Promise<DadosBusca> {
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${soDigitos(cnpj)}`, { signal: AbortSignal.timeout(15000) })
  if (r.status === 404) throw new Error('CNPJ não encontrado na Receita.')
  if (!r.ok) throw new Error('A consulta do CNPJ não respondeu. Preencha à mão ou tente de novo.')
  const d = await r.json()
  const logradouro = [texto(d.descricao_tipo_de_logradouro), texto(d.logradouro)].filter(Boolean).join(' ')
  return {
    razao_social: texto(d.razao_social),
    nome: capitalizar(texto(d.nome_fantasia) ?? texto(d.razao_social)),
    cep: texto(String(d.cep ?? ''))?.replace(/\D/g, ''),
    logradouro: capitalizar(logradouro || undefined),
    numero: texto(d.numero),
    complemento: capitalizar(texto(d.complemento)),
    bairro: capitalizar(texto(d.bairro)),
    cidade: capitalizar(texto(d.municipio)),
    uf: texto(d.uf)?.toUpperCase(),
    email: texto(d.email)?.toLowerCase(),
    telefone: texto(d.ddd_telefone_1),
  }
}

export async function buscarCep(cep: string): Promise<DadosBusca> {
  const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${soDigitos(cep)}`, { signal: AbortSignal.timeout(15000) })
  if (r.status === 404) throw new Error('CEP não encontrado.')
  if (!r.ok) throw new Error('A consulta do CEP não respondeu. Preencha à mão.')
  const d = await r.json()
  return { logradouro: texto(d.street), bairro: texto(d.neighborhood), cidade: texto(d.city), uf: texto(d.state)?.toUpperCase() }
}
