import { supabase } from './supabaseClient'

// Venda de balcão (docs/balcao.md, migration 20261118140000). A venda inteira fecha numa chamada (balcao_fechar):
// pedido, itens, confirmação, entrega e o pagamento na hora. A NF-e sai depois, pela mesma função do pedido.

export type FormaBalcao = 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito' | 'a_prazo'

export const FORMAS_BALCAO: { valor: FormaBalcao; rotulo: string }[] = [
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'cartao_debito', rotulo: 'Débito' },
  { valor: 'cartao_credito', rotulo: 'Crédito' },
  { valor: 'a_prazo', rotulo: 'A prazo' },
]

export type ConfigBalcao = {
  financeiro: boolean
  conta: { id: string; nome: string } | null
  conta_escolhida: string | null
  contas: { id: string; nome: string; tipo: string }[] | null
  emissora: { id: string; nome: string; pronta: boolean; balcao: boolean } | null
  emite_nota: boolean
  gerencia: boolean
}

export type ItemVenda = { produto_id: string; quantidade: number; desconto?: number; desconto_percentual?: number }

export type VendaFechada = {
  pedido_id: string
  numero: number
  total: number
  pago: boolean
  emissora_id: string | null
  forma: string
  prazos: number[]
}

const amigavel = (m: string, padrao: string) => {
  const conhecidos = [
    'o balcão não está liberado',
    'a venda',
    'cliente não encontrado',
    'o desconto',
    'venda a prazo precisa',
    'informe de 1 a 12 prazos',
    'escolha a forma',
    'produto não encontrado',
    'quantidade inválida',
    'a empresa não tem conta',
    'só o dono ou um admin',
    'escolha uma conta',
    'venda não encontrada',
    'só o dono ou um admin cancela',
    'este pedido não é venda de balcão',
    'só dá para cancelar venda fechada',
    'escreva o motivo',
    'a NF-e desta venda',
    'usuário do balcão não encontrado',
  ]
  if (conhecidos.some((c) => m.includes(c))) return new Error(m.charAt(0).toUpperCase() + m.slice(1).replace(/\.$/, '') + '.')
  return new Error(padrao)
}

export async function podeBalcao(orgId: string): Promise<boolean> {
  const { data } = await supabase.rpc('balcao_pode', { p_org: orgId })
  return data === true
}

export async function configBalcao(orgId: string): Promise<ConfigBalcao> {
  const { data, error } = await supabase.rpc('balcao_config', { p_org: orgId })
  if (error) throw amigavel(error.message, 'Não foi possível abrir o balcão. Atualize a página.')
  return data as unknown as ConfigBalcao
}

export async function definirContaBalcao(orgId: string, contaId: string | null) {
  const { error } = await supabase.rpc('balcao_definir_conta', { p_org: orgId, p_conta: contaId as string })
  if (error) throw amigavel(error.message, 'Não foi possível trocar a conta do caixa.')
}

export async function maisVendidosBalcao(orgId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('balcao_mais_vendidos', { p_org: orgId })
  if (error) return []
  return (data ?? []).map((l: { produto_id: string }) => l.produto_id)
}

export async function fecharVenda(
  orgId: string,
  venda: { itens: ItemVenda[]; clienteId: string | null; forma: FormaBalcao; prazos: number[] | null; desconto: number; observacao: string },
): Promise<VendaFechada> {
  const { data, error } = await supabase.rpc('balcao_fechar', {
    p_org: orgId,
    p_itens: venda.itens,
    p_cliente: venda.clienteId as string,
    p_forma: venda.forma,
    p_prazos: venda.prazos as number[],
    p_desconto: venda.desconto,
    p_observacao: venda.observacao,
  })
  if (error) throw amigavel(error.message, 'Não foi possível fechar a venda. Confira a conexão e tente de novo: nada foi gravado.')
  return data as unknown as VendaFechada
}

/** "30/60/90" ou "30, 45" → [30, 60, 90]. Inválido: null. */
export function lerPrazos(texto: string): number[] | null {
  const partes = texto.split(/[\s/,;]+/).filter(Boolean)
  if (!partes.length || partes.length > 12) return null
  const dias = partes.map((p) => Number(p))
  if (dias.some((d) => !Number.isInteger(d) || d < 1 || d > 365)) return null
  return [...dias].sort((a, b) => a - b)
}

/** Cancela a venda de balcão inteira (dono e admin): desfaz o pagamento, devolve o estoque e cancela as parcelas. */
export async function cancelarVenda(pedidoId: string, motivo: string) {
  const { error } = await supabase.rpc('balcao_cancelar', { p_pedido: pedidoId, p_motivo: motivo })
  if (error) throw amigavel(error.message, 'Não foi possível cancelar a venda. Tente de novo.')
}

// ---- usuários do balcão (Configurações → Equipe; dono e admin) ----

export type UsuarioBalcao = { user_id: string; nome: string; email: string; ativo: boolean; emite_nota_fiscal: boolean; criado_em: string }

export async function listarUsuariosBalcao(orgId: string): Promise<UsuarioBalcao[]> {
  const { data, error } = await supabase.rpc('balcao_usuarios_listar', { p_org: orgId })
  if (error) throw amigavel(error.message, 'Não foi possível carregar os usuários do balcão.')
  return (data ?? []) as UsuarioBalcao[]
}

/** Tira ou devolve o acesso e liga ou desliga "Emite nota fiscal" (null mantém como está). */
export async function definirUsuarioBalcao(orgId: string, userId: string, campos: { ativo?: boolean; emiteNota?: boolean }) {
  const { error } = await supabase.rpc('balcao_usuario_definir', {
    p_org: orgId,
    p_usuario: userId,
    p_ativo: (campos.ativo ?? null) as boolean,
    p_emite_nota: (campos.emiteNota ?? null) as boolean,
  })
  if (error) throw amigavel(error.message, 'Não foi possível salvar. Tente de novo.')
}
