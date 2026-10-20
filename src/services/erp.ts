import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

type Tabelas = Database['public']['Tables']
export type Produto = Database['public']['Views']['produtos_saldo']['Row']
export type DadosProduto = Pick<
  Tabelas['produtos']['Insert'],
  'codigo' | 'nome' | 'descricao' | 'unidade' | 'preco' | 'controla_estoque' | 'estoque_minimo' | 'ativo' | 'categoria' | 'marca' | 'ncm'
>
export type StatusPedido = 'rascunho' | 'confirmado' | 'separando' | 'enviado' | 'entregue' | 'cancelado'
export type ItemPedido = Tabelas['pedido_itens']['Row']
export type Pedido = Omit<Tabelas['pedidos']['Row'], 'status'> & {
  status: StatusPedido
  contato: { id: string; nome: string | null; nome_whatsapp: string | null; telefone: string | null } | null
}
export type Movimento = Tabelas['estoque_movimentos']['Row'] & { pedido: { numero: number } | null }

export const ROTULO_STATUS: Record<StatusPedido, string> = {
  rascunho: 'Rascunho',
  confirmado: 'Confirmado',
  separando: 'Separando',
  enviado: 'Enviado',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

/** Próximos passos possíveis a partir de cada situação (a mesma regra do banco). */
export const PROXIMOS: Record<StatusPedido, StatusPedido[]> = {
  rascunho: ['confirmado', 'cancelado'],
  confirmado: ['separando', 'enviado', 'entregue', 'rascunho', 'cancelado'],
  separando: ['enviado', 'entregue', 'confirmado', 'cancelado'],
  enviado: ['entregue', 'cancelado'],
  entregue: [],
  cancelado: [],
}

const CAMPOS_PEDIDO = '*, contato:contatos(id, nome, nome_whatsapp, telefone)'

const amigavel = (m: string, padrao: string) => {
  const conhecidos = [
    'o pedido não tem itens',
    'só dá para mudar os itens',
    'cliente, valores e condições só mudam no rascunho',
    'ajuste precisa de motivo',
    'quantidade inválida',
    'o responsável precisa ser da equipe',
    'a oportunidade é de outro cliente',
    'não dá para passar',
  ]
  const achado = conhecidos.find((c) => m.includes(c))
  if (achado) return new Error(m.charAt(0).toUpperCase() + m.slice(1).replace(/\.$/, '') + '.')
  if (m.includes('produtos_codigo_unico')) return new Error('Já existe um produto com esse código.')
  return new Error(padrao)
}

// ---- produtos ----

export async function listarProdutos(orgId: string, incluirInativos = false): Promise<Produto[]> {
  let q = supabase.from('produtos_saldo').select('*').eq('org_id', orgId)
  if (!incluirInativos) q = q.eq('ativo', true)
  const { data, error } = await q.order('nome').limit(5000)
  if (error) throw error
  return data ?? []
}

export async function salvarProduto(orgId: string, id: string | null, dados: DadosProduto) {
  const { error } = id
    ? await supabase.from('produtos').update(dados).eq('id', id)
    : await supabase.from('produtos').insert({ org_id: orgId, ...dados })
  if (error) throw amigavel(error.message, 'Não foi possível salvar o produto.')
}

/** Inativar some das buscas, dos pedidos novos e do agente; o histórico fica. */
export async function mudarAtivoProduto(id: string, ativo: boolean) {
  const { error } = await supabase.from('produtos').update({ ativo }).eq('id', id)
  if (error) throw amigavel(error.message, 'Não foi possível atualizar o produto.')
}

/**
 * Exclui de vez. Produto com movimento de estoque não sai (política produtos_apagar: o histórico depende dele) e o
 * banco não acusa erro, só não apaga: devolve false para a tela oferecer inativar. Pedidos antigos guardam o nome.
 */
export async function excluirProduto(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('produtos').delete().eq('id', id).select('id')
  if (error) throw amigavel(error.message, 'Não foi possível excluir o produto.')
  return (data ?? []).length > 0
}

/**
 * Importação: atualiza pelo código quando ele já existe, cria o resto. Linha sem nome (planilha só com código) só
 * atualiza: se o código não está cadastrado, fica de fora (`ignorados`).
 */
export async function importarProdutos(orgId: string, linhas: (Omit<DadosProduto, 'nome'> & { nome?: string })[], existentes: Produto[]) {
  const porCodigo = new Map(existentes.filter((p) => p.codigo).map((p) => [p.codigo!.toLowerCase(), p.id!]))
  let criados = 0
  let atualizados = 0
  let ignorados = 0
  const novos: DadosProduto[] = []
  for (const l of linhas) {
    const id = l.codigo ? porCodigo.get(l.codigo.toLowerCase()) : undefined
    if (id) {
      const { error } = await supabase.from('produtos').update(l).eq('id', id)
      if (error) throw amigavel(error.message, `Erro ao atualizar "${l.nome ?? l.codigo}".`)
      atualizados++
    } else if (l.nome) novos.push({ ...l, nome: l.nome })
    else ignorados++
  }
  for (let i = 0; i < novos.length; i += 200) {
    const { error } = await supabase.from('produtos').insert(novos.slice(i, i + 200).map((l) => ({ org_id: orgId, ...l })))
    if (error) throw amigavel(error.message, 'Erro ao criar os produtos da planilha.')
    criados += Math.min(200, novos.length - i)
  }
  return { criados, atualizados, ignorados }
}

/** Estoque pela planilha: deixa o saldo de cada produto igual ao número (ajuste no histórico). Migration 20261020140000. */
export async function definirSaldos(orgId: string, itens: { codigo: string | null; nome: string | null; saldo: number }[]) {
  let alterados = 0
  for (let i = 0; i < itens.length; i += 2000) {
    const { data, error } = await supabase.rpc('estoque_definir_saldos', { p_org: orgId, p_itens: itens.slice(i, i + 2000) })
    if (error) throw amigavel(error.message, 'Os produtos foram importados, mas não deu para lançar o estoque. Tente de novo.')
    alterados += Number((data as { alterados?: number } | null)?.alterados ?? 0)
  }
  return alterados
}

export async function lancarEstoque(produtoId: string, quantidade: number, tipo: 'entrada' | 'ajuste', motivo: string) {
  const { error } = await supabase.rpc('estoque_lancar', { p_produto: produtoId, p_quantidade: quantidade, p_tipo: tipo, p_motivo: motivo })
  if (error) throw amigavel(error.message, 'Não foi possível lançar no estoque.')
}

export async function movimentosDoProduto(produtoId: string): Promise<Movimento[]> {
  const { data, error } = await supabase
    .from('estoque_movimentos')
    .select('*, pedido:pedidos(numero)')
    .eq('produto_id', produtoId)
    .order('criado_em', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as unknown as Movimento[]
}

// ---- pedidos ----

export async function listarPedidos(orgId: string, status: StatusPedido | 'abertos' | 'todos', contatoId?: string): Promise<Pedido[]> {
  let q = supabase.from('pedidos').select(CAMPOS_PEDIDO).eq('org_id', orgId)
  if (status === 'abertos') q = q.in('status', ['rascunho', 'confirmado', 'separando', 'enviado'])
  else if (status !== 'todos') q = q.eq('status', status)
  if (contatoId) q = q.eq('contato_id', contatoId)
  const { data, error } = await q.order('numero', { ascending: false }).limit(300)
  if (error) throw error
  return (data ?? []) as unknown as Pedido[]
}

export async function buscarPedido(id: string): Promise<{ pedido: Pedido; itens: ItemPedido[] } | null> {
  const [{ data: pedido, error }, { data: itens, error: erroItens }] = await Promise.all([
    supabase.from('pedidos').select(CAMPOS_PEDIDO).eq('id', id).maybeSingle(),
    supabase.from('pedido_itens').select('*').eq('pedido_id', id).order('ordem'),
  ])
  if (error || erroItens) throw error ?? erroItens
  return pedido ? { pedido: pedido as unknown as Pedido, itens: itens ?? [] } : null
}

export async function criarPedido(orgId: string, contatoId: string | null): Promise<string> {
  // numero: 0 só satisfaz o tipo; o número de verdade vem do banco (gatilho pedido_preparar).
  const { data, error } = await supabase
    .from('pedidos')
    .insert({ org_id: orgId, contato_id: contatoId, numero: 0 })
    .select('id')
    .single()
  if (error) throw amigavel(error.message, 'Não foi possível criar o pedido.')
  return data.id
}

export async function atualizarPedido(
  id: string,
  dados: Partial<Pick<
      Tabelas['pedidos']['Update'],
      | 'contato_id'
      | 'desconto'
      | 'frete'
      | 'observacao'
      | 'responsavel_id'
      | 'emissora_id'
      | 'validade'
      | 'condicoes_pagamento'
      | 'prazo_entrega'
    >>,
) {
  const { error } = await supabase.from('pedidos').update(dados).eq('id', id)
  if (error) throw amigavel(error.message, 'Não foi possível salvar o pedido.')
}

export async function apagarPedido(id: string) {
  const { error } = await supabase.from('pedidos').delete().eq('id', id)
  if (error) throw new Error('Não foi possível apagar o rascunho.')
}

export async function adicionarItem(
  orgId: string,
  pedidoId: string,
  item: { produto_id: string | null; descricao: string; quantidade: number; preco_unitario: number; ordem: number },
) {
  const { error } = await supabase.from('pedido_itens').insert({ org_id: orgId, pedido_id: pedidoId, ...item })
  if (error) throw amigavel(error.message, 'Não foi possível adicionar o item.')
}

export async function atualizarItem(id: string, dados: { quantidade?: number; preco_unitario?: number; descricao?: string }) {
  const { error } = await supabase.from('pedido_itens').update(dados).eq('id', id)
  if (error) throw amigavel(error.message, 'Não foi possível mudar o item.')
}

export async function removerItem(id: string) {
  const { error } = await supabase.from('pedido_itens').delete().eq('id', id)
  if (error) throw amigavel(error.message, 'Não foi possível tirar o item.')
}

export async function mudarStatusPedido(id: string, status: StatusPedido) {
  const { error } = await supabase.rpc('pedido_mudar_status', { p_pedido: id, p_status: status })
  if (error) throw amigavel(error.message, 'Não foi possível mudar a situação do pedido.')
}

// ---- números ----

/** "1,5" / "1.234,50" / "12.5" → número; vazio → null; inválido → undefined. */

// Em formato.ts (sem Supabase) para o PDF do orçamento rodar também no servidor (serviço livih-pdf).
export { lerNumero, quantidade } from './formato'
