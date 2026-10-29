import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

// Financeiro (migration 20261028120000, docs/financeiro.md): liga com o ERP ou as OS. As tabelas só se leem; lançar,
// dar baixa, desfazer e transferir passam pelas funções fin_*, que conferem a permissão e mantêm o pago e o histórico.

type Tabelas = Database['public']['Tables']
export type TipoLancamento = 'receber' | 'pagar'
export type Situacao = 'aberto' | 'parcial' | 'vencido' | 'pago' | 'cancelado'
export type FormaPagamento = 'pix' | 'boleto' | 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'transferencia' | 'cheque' | 'outro'
export type TipoConta = 'banco' | 'caixa' | 'carteira_digital' | 'outro'

export type Conta = Tabelas['fin_contas']['Row']
export type Categoria = Tabelas['fin_categorias']['Row']
export type Saldo = Database['public']['Functions']['fin_saldos']['Returns'][number]
export type Lancamento = Tabelas['fin_lancamentos']['Row'] & {
  restante: number
  situacao: Situacao
  cliente: { nome: string } | null
  categoria: { nome: string } | null
  // Origem (entrega 2); vem nula quando quem olha não vê o pedido (carteira de outro vendedor).
  pedido: { numero: number } | null
  os_item: { os_id: string } | null
}
export type Baixa = Tabelas['fin_baixas']['Row'] & { conta: { nome: string } | null }
export type MovimentoExtrato = {
  id: string
  tipo: 'baixa' | 'transferencia'
  data: string
  criado_em: string
  descricao: string
  valor: number
  desfeito: boolean
}

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  aberto: 'Em aberto',
  parcial: 'Pago em parte',
  vencido: 'Vencido',
  pago: 'Pago',
  cancelado: 'Cancelado',
}
export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
  cheque: 'Cheque',
  outro: 'Outro',
}
export const ROTULO_TIPO_CONTA: Record<TipoConta, string> = {
  banco: 'Banco',
  caixa: 'Caixa da loja',
  carteira_digital: 'Carteira digital',
  outro: 'Outro',
}

/** " (3/5)" quando há mais de uma parcela. */
export const rotuloParcela = (l: { parcela: number; parcelas: number }) => (l.parcelas > 1 ? ` (${l.parcela}/${l.parcelas})` : '')

/** Quem paga ou recebe: o cliente (a receber) ou o fornecedor (a pagar). */
export const quemDoLancamento = (l: Lancamento) => l.cliente?.nome || l.fornecedor_nome || null

// Os tipos gerados não aceitam null nos argumentos das funções, mas o banco aceita (campo opcional vazio).
const vazio = null as unknown as string

/** As mensagens das funções fin_* já são para a pessoa: só ajusta a primeira letra e o ponto. */
function amigavel(e: { message: string; code?: string }, padrao: string) {
  if (e.code === 'P0001') return new Error(e.message.charAt(0).toUpperCase() + e.message.slice(1).replace(/\.$/, '') + '.')
  if (e.code === '23505') return new Error('Já existe um cadastro com esse nome.')
  return new Error(padrao)
}

// ---- acesso ----

export async function podeFinanceiro(orgId: string): Promise<boolean> {
  const { data } = await supabase.rpc('pode_financeiro', { p_org: orgId })
  return !!data
}

/** Categorias padrão e o caixa na primeira vez; depois não faz nada. */
export async function prepararFinanceiro(orgId: string) {
  const { error } = await supabase.rpc('fin_preparar', { p_org: orgId })
  if (error) throw amigavel(error, 'Não foi possível abrir o financeiro.')
}

export async function definirFinanceiro(orgId: string, userId: string, valor: boolean) {
  const { error } = await supabase.rpc('membro_definir_financeiro', { p_org: orgId, p_usuario: userId, p_valor: valor })
  if (error) throw new Error('Não foi possível mudar a permissão. Só dono e admin mudam.')
}

export async function listarFinanceiro(orgId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('membros_org').select('user_id').eq('org_id', orgId).eq('financeiro', true)
  if (error) throw error
  return new Set((data ?? []).map((m) => m.user_id))
}

// ---- contas e categorias ----

export async function listarSaldos(orgId: string): Promise<Saldo[]> {
  const { data, error } = await supabase.rpc('fin_saldos', { p_org: orgId })
  if (error) throw amigavel(error, 'Não foi possível carregar as contas.')
  return data ?? []
}

export async function listarContas(orgId: string): Promise<Conta[]> {
  const { data, error } = await supabase.from('fin_contas').select('*').eq('org_id', orgId).order('nome')
  if (error) throw error
  return data ?? []
}

export async function salvarConta(
  orgId: string,
  id: string | null,
  c: { nome: string; tipo: TipoConta; saldo_inicial: number; saldo_inicial_em: string; ativa: boolean },
): Promise<string> {
  const { data, error } = await supabase.rpc('fin_salvar_conta', {
    p_org: orgId,
    p_id: id ?? vazio,
    p_nome: c.nome,
    p_tipo: c.tipo,
    p_emissora: vazio,
    p_saldo_inicial: c.saldo_inicial,
    p_saldo_inicial_em: c.saldo_inicial_em,
    p_ativa: c.ativa,
  })
  if (error) throw amigavel(error, 'Não foi possível salvar a conta.')
  return data
}

export async function listarCategorias(orgId: string): Promise<Categoria[]> {
  const { data, error } = await supabase.from('fin_categorias').select('*').eq('org_id', orgId).order('nome')
  if (error) throw error
  return data ?? []
}

export async function salvarCategoria(
  orgId: string,
  id: string | null,
  c: { nome: string; tipo: 'receita' | 'despesa'; ativa: boolean },
): Promise<string> {
  const { data, error } = await supabase.rpc('fin_salvar_categoria', {
    p_org: orgId,
    p_id: id ?? vazio,
    p_nome: c.nome,
    p_tipo: c.tipo,
    p_ativa: c.ativa,
  })
  if (error) throw amigavel(error, 'Não foi possível salvar a categoria.')
  return data
}

// ---- lançamentos ----

export type FiltroLancamentos = 'abertos' | 'vencido' | 'pago' | 'cancelado' | 'todos'

export async function listarLancamentos(orgId: string, tipo: TipoLancamento, filtro: FiltroLancamentos): Promise<Lancamento[]> {
  let consulta = supabase
    .from('fin_lancamentos_situacao')
    .select('*, cliente:clientes(nome), categoria:fin_categorias(nome), pedido:pedidos(numero), os_item:os_itens(os_id)')
    .eq('org_id', orgId)
    .eq('tipo', tipo)
  if (filtro === 'abertos') consulta = consulta.in('situacao', ['aberto', 'parcial', 'vencido'])
  else if (filtro !== 'todos') consulta = consulta.eq('situacao', filtro)
  // Em aberto: o que vence primeiro em cima. Pagos e cancelados: o mais recente em cima.
  const crescente = filtro === 'abertos' || filtro === 'vencido'
  const { data, error } = await consulta.order('vencimento', { ascending: crescente }).order('parcela').limit(1000)
  if (error) throw error
  return (data ?? []) as unknown as Lancamento[]
}

export type NovaParcela = { vencimento: string; valor: number }

export async function criarLancamento(
  orgId: string,
  l: {
    tipo: TipoLancamento
    descricao: string
    categoria_id: string | null
    cliente_id: string | null
    fornecedor_cnpj: string | null
    fornecedor_nome: string | null
    parcelas: NovaParcela[]
    observacao: string | null
  },
): Promise<string> {
  const { data, error } = await supabase.rpc('fin_criar_lancamento', {
    p_org: orgId,
    p_tipo: l.tipo,
    p_descricao: l.descricao,
    p_categoria: l.categoria_id ?? vazio,
    p_emissora: vazio,
    p_cliente: l.cliente_id ?? vazio,
    p_fornecedor_cnpj: l.fornecedor_cnpj ?? vazio,
    p_fornecedor_nome: l.fornecedor_nome ?? vazio,
    p_parcelas: l.parcelas,
    p_observacao: l.observacao ?? vazio,
  })
  if (error) throw amigavel(error, 'Não foi possível salvar o lançamento.')
  return data
}

export async function editarLancamento(
  id: string,
  l: { descricao: string; categoria_id: string | null; vencimento: string; valor: number; observacao: string | null },
) {
  const { error } = await supabase.rpc('fin_editar_lancamento', {
    p_id: id,
    p_descricao: l.descricao,
    p_categoria: l.categoria_id ?? vazio,
    p_vencimento: l.vencimento,
    p_valor: l.valor,
    p_observacao: l.observacao ?? vazio,
  })
  if (error) throw amigavel(error, 'Não foi possível salvar o lançamento.')
}

export async function cancelarLancamento(id: string, motivo: string | null) {
  const { error } = await supabase.rpc('fin_cancelar_lancamento', { p_id: id, p_motivo: motivo ?? vazio })
  if (error) throw amigavel(error, 'Não foi possível cancelar o lançamento.')
}

/**
 * Parcelas de um valor: `parcelar` divide o total (os centavos que sobram vão na última); `repetir` lança o mesmo valor
 * todo mês (aluguel, internet). O vencimento anda 30 dias (parcelar) ou um mês (repetir) a partir do primeiro.
 */
export function montarParcelas(total: number, quantas: number, primeiro: string, modo: 'parcelar' | 'repetir'): NovaParcela[] {
  if (!(total > 0) || quantas < 1 || !primeiro) return []
  const centavos = Math.round(total * 100)
  const base = modo === 'repetir' ? centavos : Math.floor(centavos / quantas)
  return Array.from({ length: quantas }, (_, i) => ({
    vencimento: modo === 'repetir' ? somarMeses(primeiro, i) : somarDiasIso(primeiro, 30 * i),
    valor: (modo === 'parcelar' && i === quantas - 1 ? centavos - base * (quantas - 1) : base) / 100,
  }))
}

const somarDiasIso = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** 31/01 + 1 mês = 28/02 (ou 29): o dia não passa do último do mês. */
function somarMeses(iso: string, meses: number) {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1, 12))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0, 12)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}

// ---- pedido ----

export type ParcelaPedido = Database['public']['Functions']['pedido_parcelas']['Returns'][number]

/** Parcelas do pedido confirmado; quem vê o pedido vê (sem a permissão Financeiro). */
export async function listarParcelasPedido(pedidoId: string): Promise<ParcelaPedido[]> {
  const { data, error } = await supabase.rpc('pedido_parcelas', { p_pedido: pedidoId })
  if (error) throw error
  return data ?? []
}

/** Prazos comuns, em dias depois da confirmação. */
export const PRAZOS_PRONTOS: { rotulo: string; prazos: number[] }[] = [
  { rotulo: 'À vista', prazos: [0] },
  { rotulo: '30 dias', prazos: [30] },
  { rotulo: '30/60 dias', prazos: [30, 60] },
  { rotulo: '30/60/90 dias', prazos: [30, 60, 90] },
  { rotulo: '28/56/84 dias', prazos: [28, 56, 84] },
]

/** "30/60/90" → [30, 60, 90]; inválido → null. Até 24 parcelas, de 0 a 720 dias, em ordem. */
export function lerPrazos(texto: string): number[] | null {
  const partes = texto.split(/[\s/;,]+/).filter(Boolean)
  if (!partes.length || partes.length > 24) return null
  const dias = partes.map(Number)
  if (dias.some((d) => !Number.isInteger(d) || d < 0 || d > 720)) return null
  return dias.every((d, i) => i === 0 || d >= dias[i - 1]) ? dias : null
}

export const rotuloPrazos = (prazos: number[] | null) =>
  !prazos?.length || (prazos.length === 1 && prazos[0] === 0)
    ? 'À vista'
    : `${prazos.join('/')} dias`

// ---- baixas ----

export async function listarBaixas(lancamentoId: string): Promise<Baixa[]> {
  const { data, error } = await supabase
    .from('fin_baixas')
    .select('*, conta:fin_contas(nome)')
    .eq('lancamento_id', lancamentoId)
    .order('data')
    .order('criado_em')
  if (error) throw error
  return (data ?? []) as unknown as Baixa[]
}

export async function baixar(
  lancamentoId: string,
  b: { conta_id: string; data: string; valor: number; forma: FormaPagamento; observacao: string | null },
): Promise<string> {
  const { data, error } = await supabase.rpc('fin_baixar', {
    p_lancamento: lancamentoId,
    p_conta: b.conta_id,
    p_data: b.data,
    p_valor: b.valor,
    p_forma: b.forma,
    p_observacao: b.observacao ?? vazio,
  })
  if (error) throw amigavel(error, 'Não foi possível registrar o pagamento.')
  return data
}

export async function desfazerBaixa(id: string, motivo: string | null) {
  const { error } = await supabase.rpc('fin_desfazer_baixa', { p_baixa: id, p_motivo: motivo ?? vazio })
  if (error) throw amigavel(error, 'Não foi possível desfazer o pagamento.')
}

// ---- transferências e extrato ----

export async function transferir(orgId: string, t: { origem: string; destino: string; data: string; valor: number; observacao: string | null }) {
  const { error } = await supabase.rpc('fin_transferir', {
    p_org: orgId,
    p_origem: t.origem,
    p_destino: t.destino,
    p_data: t.data,
    p_valor: t.valor,
    p_observacao: t.observacao ?? vazio,
  })
  if (error) throw amigavel(error, 'Não foi possível registrar a transferência.')
}

export async function desfazerTransferencia(id: string) {
  const { error } = await supabase.rpc('fin_desfazer_transferencia', { p_id: id })
  if (error) throw amigavel(error, 'Não foi possível desfazer a transferência.')
}

/** Entradas e saídas da conta desde `desde`, o mais recente em cima (valor negativo = saiu). */
export async function extratoConta(contaId: string, desde: string): Promise<MovimentoExtrato[]> {
  const [baixas, transf] = await Promise.all([
    supabase
      .from('fin_baixas')
      .select('id, data, criado_em, valor, desfeita_em, forma, lancamento:fin_lancamentos(tipo, descricao, parcela, parcelas)')
      .eq('conta_id', contaId)
      .gte('data', desde),
    supabase
      .from('fin_transferencias')
      .select('id, data, criado_em, valor, desfeita_em, observacao, conta_origem_id, conta_destino_id, origem:fin_contas!fin_transferencias_conta_origem_id_org_id_fkey(nome), destino:fin_contas!fin_transferencias_conta_destino_id_org_id_fkey(nome)')
      .or(`conta_origem_id.eq.${contaId},conta_destino_id.eq.${contaId}`)
      .gte('data', desde),
  ])
  if (baixas.error) throw baixas.error
  if (transf.error) throw transf.error
  type LinhaBaixa = { id: string; data: string; criado_em: string; valor: number; desfeita_em: string | null; forma: FormaPagamento
    lancamento: { tipo: TipoLancamento; descricao: string; parcela: number; parcelas: number } | null }
  type LinhaTransf = { id: string; data: string; criado_em: string; valor: number; desfeita_em: string | null; observacao: string | null
    conta_origem_id: string; origem: { nome: string } | null; destino: { nome: string } | null }
  const movimentos: MovimentoExtrato[] = [
    ...((baixas.data ?? []) as unknown as LinhaBaixa[]).map((b) => ({
      id: b.id,
      tipo: 'baixa' as const,
      data: b.data,
      criado_em: b.criado_em,
      descricao: `${b.lancamento?.descricao ?? 'Lançamento'}${b.lancamento && b.lancamento.parcelas > 1 ? ` (${b.lancamento.parcela}/${b.lancamento.parcelas})` : ''} · ${ROTULO_FORMA[b.forma]}`,
      valor: b.lancamento?.tipo === 'pagar' ? -Number(b.valor) : Number(b.valor),
      desfeito: !!b.desfeita_em,
    })),
    ...((transf.data ?? []) as unknown as LinhaTransf[]).map((t) => {
      const saiu = t.conta_origem_id === contaId
      return {
        id: t.id,
        tipo: 'transferencia' as const,
        data: t.data,
        criado_em: t.criado_em,
        descricao: `${saiu ? `Transferência para ${t.destino?.nome ?? 'outra conta'}` : `Transferência de ${t.origem?.nome ?? 'outra conta'}`}${t.observacao ? ` · ${t.observacao}` : ''}`,
        valor: saiu ? -Number(t.valor) : Number(t.valor),
        desfeito: !!t.desfeita_em,
      }
    }),
  ]
  // No mesmo dia, o último lançado em cima.
  return movimentos.sort((a, b) => b.data.localeCompare(a.data) || b.criado_em.localeCompare(a.criado_em))
}
