import { supabase } from './supabaseClient'
import type { Database, Json } from './tiposBanco'

// Ordens de serviço (módulo 'os', migration 20261022130000, docs/ordens-de-servico.md). Etapa, desfecho,
// faturamento e pagamento só mudam pelas funções do banco, que gravam o histórico; aqui só as chamadas.

type Tabelas = Database['public']['Tables']
export type Marco = 'recebido' | 'orcamento' | 'aprovacao' | 'finalizado' | 'entregue'
export type Desfecho = 'nao_aprovado' | 'sem_conserto' | 'cancelado'
export type Cobranca = 'cobrado' | 'garantia' | 'cortesia'
export type EtapaOs = Omit<Tabelas['os_etapas']['Row'], 'marco'> & { marco: Marco | null }
export type ServicoOs = Tabelas['os_servicos']['Row']
export type CampoTipo = { chave: string; rotulo: string; tipo: 'texto' | 'numero' | 'data' | 'lista'; opcoes?: string[]; obrigatorio?: boolean }
export type TipoItem = Omit<Tabelas['os_tipos_item']['Row'], 'campos'> & { campos: CampoTipo[] }
export type ConfigOs = Tabelas['os_config']['Row']
export type Ordem = Tabelas['ordens_servico']['Row']
export type ItemOs = Omit<Tabelas['os_itens']['Row'], 'desfecho' | 'cobranca' | 'campos'> & {
  desfecho: Desfecho | null
  cobranca: Cobranca
  campos: Record<string, string>
}
export type PassoOs = Tabelas['os_item_historico']['Row']
export type PrevisaoItem = Database['public']['Functions']['os_previsao_itens']['Returns'][number]

export const ROTULO_MARCO: Record<Marco, string> = {
  recebido: 'Recebido',
  orcamento: 'Orçamento',
  aprovacao: 'Aprovação do cliente',
  finalizado: 'Finalizado',
  entregue: 'Entregue',
}
export const ROTULO_DESFECHO: Record<Desfecho, string> = {
  nao_aprovado: 'Orçamento não aprovado',
  sem_conserto: 'Sem conserto',
  cancelado: 'Cancelado',
}
export const ROTULO_COBRANCA: Record<Cobranca, string> = { cobrado: 'Cobrado', garantia: 'Garantia', cortesia: 'Cortesia' }

const amigavel = (e: { message: string; code?: string }, padrao: string) => {
  const conhecidos = [
    'a data não pode',
    'item encerrado',
    'item em garantia',
    'o vencimento não pode',
    'só item faturado',
    'escolha para onde vão',
    'toda etapa precisa',
    'há etapas com o mesmo nome',
    'cada marco só pode',
    'são precisas pelo menos',
    'no máximo',
    'o responsável precisa ser da equipe',
    'a planilha não tem linhas',
    'linha sem data',
    'item faturado: desfaça',
    'a empresa ainda não tem etapas',
  ]
  const achado = conhecidos.find((c) => e.message.includes(c))
  if (achado) return new Error(e.message.charAt(0).toUpperCase() + e.message.slice(1).replace(/\.$/, '') + '.')
  if (e.code === '23505') return new Error('Já existe um cadastro com esse nome ou código.')
  return new Error(padrao)
}

// ---- datas (sempre AAAA-MM-DD, no fuso de São Paulo) ----

export const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
export const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
export const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 864e5)
/** 2026-01-07 → 07/01/2026; curto → 07/01. */
export function data(iso: string | null | undefined, curto = false): string {
  if (!iso) return ''
  const [a, m, d] = iso.slice(0, 10).split('-')
  return curto ? `${d}/${m}` : `${d}/${m}/${a}`
}

// ---- configuração ----

export type ConfiguracaoOs = { config: ConfigOs; etapas: EtapaOs[]; tipos: TipoItem[]; servicos: ServicoOs[] }

/** Cria a configuração e as etapas padrão na primeira vez e devolve tudo o que as telas usam. */
export async function carregarConfiguracao(orgId: string): Promise<ConfiguracaoOs> {
  const { error } = await supabase.rpc('os_preparar', { p_org: orgId })
  if (error) throw amigavel(error, 'Não foi possível abrir as ordens de serviço.')
  const [config, etapas, tipos, servicos] = await Promise.all([
    supabase.from('os_config').select('*').eq('org_id', orgId).single(),
    supabase.from('os_etapas').select('*').eq('org_id', orgId).eq('ativo', true).order('ordem'),
    supabase.from('os_tipos_item').select('*').eq('org_id', orgId).eq('ativo', true).order('nome'),
    supabase.from('os_servicos').select('*').eq('org_id', orgId).eq('ativo', true).order('nome'),
  ])
  const erro = config.error ?? etapas.error ?? tipos.error ?? servicos.error
  if (erro) throw erro
  return {
    config: config.data!,
    etapas: (etapas.data ?? []) as EtapaOs[],
    tipos: (tipos.data ?? []).map((t) => ({ ...t, campos: (Array.isArray(t.campos) ? t.campos : []) as CampoTipo[] })),
    servicos: servicos.data ?? [],
  }
}

/** Todas as etapas, inclusive as removidas (para mostrar o histórico). */
export async function todasAsEtapas(orgId: string): Promise<EtapaOs[]> {
  const { data, error } = await supabase.from('os_etapas').select('*').eq('org_id', orgId).order('ordem')
  if (error) throw error
  return (data ?? []) as EtapaOs[]
}

export type LinhaEtapa = { id: string | null; nome: string; marco: Marco | null; prazo_padrao_dias: number | null }

export async function salvarEtapas(orgId: string, etapas: LinhaEtapa[], mover: Record<string, string>) {
  const { error } = await supabase.rpc('os_salvar_etapas', { p_org: orgId, p_etapas: etapas as unknown as Json, p_mover: mover })
  if (error) throw amigavel(error, 'Não foi possível salvar as etapas.')
}

export async function salvarConfig(orgId: string, dados: Pick<ConfigOs, 'prazo_pagamento_dias' | 'alerta_fator'>) {
  const { error } = await supabase.from('os_config').update(dados).eq('org_id', orgId)
  if (error) throw amigavel(error, 'Não foi possível salvar.')
}

export type DadosTipo = Pick<TipoItem, 'nome' | 'rotulo_identificacao' | 'campos' | 'servico_padrao_id'>

export async function salvarTipo(orgId: string, id: string | null, dados: DadosTipo) {
  const linha = { ...dados, campos: dados.campos as unknown as Json }
  const { error } = id
    ? await supabase.from('os_tipos_item').update(linha).eq('id', id)
    : await supabase.from('os_tipos_item').insert({ org_id: orgId, ...linha })
  if (error) throw amigavel(error, 'Não foi possível salvar o tipo.')
}

/** Tipo e serviço já usados em itens não somem: saem da lista (os itens antigos continuam com eles). */
export async function desativarTipo(id: string) {
  const { error } = await supabase.from('os_tipos_item').update({ ativo: false }).eq('id', id)
  if (error) throw amigavel(error, 'Não foi possível remover o tipo.')
}

export type DadosServico = Pick<ServicoOs, 'codigo' | 'nome' | 'preco'>

export async function salvarServico(orgId: string, id: string | null, dados: DadosServico) {
  const { error } = id
    ? await supabase.from('os_servicos').update(dados).eq('id', id)
    : await supabase.from('os_servicos').insert({ org_id: orgId, ...dados })
  if (error) throw amigavel(error, 'Não foi possível salvar o serviço.')
}

export async function desativarServico(id: string) {
  const { error } = await supabase.from('os_servicos').update({ ativo: false }).eq('id', id)
  if (error) throw amigavel(error, 'Não foi possível remover o serviço.')
}

// Prazo por cliente (a empresa que paga; migration 20261024140000).
export type PrazoCliente = { cliente_id: string; prazo_pagamento_dias: number; cliente: { nome: string } | null }

export async function listarPrazosClientes(orgId: string): Promise<PrazoCliente[]> {
  const { data, error } = await supabase
    .from('os_prazos_cliente')
    .select('cliente_id, prazo_pagamento_dias, cliente:clientes(nome)')
    .eq('org_id', orgId)
  if (error) throw error
  return (data ?? []) as PrazoCliente[]
}

/** dias nulo = volta ao prazo padrão da empresa. */
export async function definirPrazoCliente(orgId: string, clienteId: string, dias: number | null) {
  const { error } =
    dias == null
      ? await supabase.from('os_prazos_cliente').delete().eq('org_id', orgId).eq('cliente_id', clienteId)
      : await supabase.from('os_prazos_cliente').upsert({ org_id: orgId, cliente_id: clienteId, prazo_pagamento_dias: dias })
  if (error) throw amigavel(error, 'Não foi possível salvar o prazo.')
}

// ---- ordens e itens ----

const deItem = (i: Tabelas['os_itens']['Row']): ItemOs => ({
  ...i,
  desfecho: i.desfecho as Desfecho | null,
  cobranca: i.cobranca as Cobranca,
  campos: (i.campos && typeof i.campos === 'object' && !Array.isArray(i.campos) ? i.campos : {}) as Record<string, string>,
  valor: Number(i.valor),
})

// O banco devolve no máximo 1000 linhas por consulta.
const PAGINA = 1000

async function emPaginas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const todos: T[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1)
    if (error) throw error
    todos.push(...(data ?? []))
    if ((data ?? []).length < PAGINA) return todos
  }
}

export type Oficina = { ordens: Map<string, Ordem>; itens: ItemOs[]; previsao: Map<string, PrevisaoItem> }

/** Previsão de cada item aberto ou a receber (término, faturamento, recebimento, parado). Sempre estimativa. */
export async function buscarPrevisao(orgId: string): Promise<Map<string, PrevisaoItem>> {
  const { data, error } = await supabase.rpc('os_previsao_itens', { p_org: orgId })
  if (error) throw error
  return new Map((data ?? []).map((p) => [p.item_id, p]))
}

/** Ordens, itens e a previsão de cada item: o quadro, a lista e a busca trabalham sobre isso. */
export async function carregarOficina(orgId: string): Promise<Oficina> {
  const [ordens, itens, previsao] = await Promise.all([
    emPaginas<Ordem>((de, ate) => supabase.from('ordens_servico').select('*').eq('org_id', orgId).order('numero').range(de, ate)),
    emPaginas<Tabelas['os_itens']['Row']>((de, ate) =>
      supabase.from('os_itens').select('*').eq('org_id', orgId).order('os_id').order('ordem').order('id').range(de, ate),
    ),
    buscarPrevisao(orgId),
  ])
  return { ordens: new Map(ordens.map((o) => [o.id, o])), itens: itens.map(deItem), previsao }
}

export async function buscarOrdem(id: string): Promise<{ ordem: Ordem; itens: ItemOs[]; historico: PassoOs[] } | null> {
  const [ordem, itens] = await Promise.all([
    supabase.from('ordens_servico').select('*').eq('id', id).maybeSingle(),
    supabase.from('os_itens').select('*').eq('os_id', id).order('ordem').order('criado_em'),
  ])
  if (ordem.error || itens.error) throw ordem.error ?? itens.error
  if (!ordem.data) return null
  const ids = (itens.data ?? []).map((i) => i.id)
  const historico = ids.length
    ? await supabase.from('os_item_historico').select('*').in('item_id', ids).order('data').order('id')
    : { data: [], error: null }
  if (historico.error) throw historico.error
  return { ordem: ordem.data, itens: (itens.data ?? []).map(deItem), historico: historico.data ?? [] }
}

export type DadosOrdem = Pick<Ordem, 'contato_id' | 'cliente_id' | 'cliente_nome' | 'nf_cliente' | 'numero_cliente' | 'recebida_em' | 'observacao' | 'responsavel_id'>
export type DadosItem = Pick<ItemOs, 'tipo_id' | 'servico_id' | 'modelo' | 'identificacao' | 'campos' | 'valor' | 'cobranca' | 'observacao'>

const linhaItem = (d: Partial<DadosItem>) => ({ ...d, campos: d.campos as Json | undefined })

// Item novo entra na primeira etapa, desde o recebimento da OS. O gatilho do banco confere a etapa; a tela manda os
// dois porque as colunas são obrigatórias (e o tipo gerado do banco exige).
const linhasItens = (orgId: string, os: Pick<Ordem, 'id' | 'recebida_em'>, etapaInicial: string, itens: DadosItem[], ordemInicial: number) =>
  itens.map((i, n) => ({
    org_id: orgId,
    os_id: os.id,
    ordem: ordemInicial + n,
    etapa_id: etapaInicial,
    etapa_desde: os.recebida_em,
    ...linhaItem(i),
  }))

/** Cria a OS com os itens. Devolve o id. */
export async function criarOrdem(orgId: string, dados: DadosOrdem, itens: DadosItem[], etapaInicial: string): Promise<string> {
  // numero: o gatilho numera em sequência por empresa (o 0 só cumpre a coluna obrigatória, como no pedido).
  const { data, error } = await supabase
    .from('ordens_servico')
    .insert({ org_id: orgId, numero: 0, ...dados })
    .select('id, recebida_em')
    .single()
  if (error) throw amigavel(error, 'Não foi possível criar a OS.')
  if (itens.length) {
    const r = await supabase.from('os_itens').insert(linhasItens(orgId, data, etapaInicial, itens, 0))
    if (r.error) throw amigavel(r.error, 'A OS foi criada, mas os itens não. Abra a OS e adicione de novo.')
  }
  return data.id
}

export async function atualizarOrdem(id: string, dados: Partial<DadosOrdem>) {
  const { error } = await supabase.from('ordens_servico').update(dados).eq('id', id)
  if (error) throw amigavel(error, 'Não foi possível salvar a OS.')
}

export async function apagarOrdem(id: string) {
  const { error, count } = await supabase.from('ordens_servico').delete({ count: 'exact' }).eq('id', id)
  if (error || !count) throw new Error('Não foi possível apagar a OS (só dono e admin apagam).')
}

export async function adicionarItens(
  orgId: string,
  os: Pick<Ordem, 'id' | 'recebida_em'>,
  etapaInicial: string,
  itens: DadosItem[],
  ordemInicial: number,
) {
  const { error } = await supabase.from('os_itens').insert(linhasItens(orgId, os, etapaInicial, itens, ordemInicial))
  if (error) throw amigavel(error, 'Não foi possível adicionar o item.')
}

export async function atualizarItem(id: string, dados: Partial<DadosItem>) {
  const { error } = await supabase.from('os_itens').update(linhaItem(dados)).eq('id', id)
  if (error) throw amigavel(error, 'Não foi possível salvar o item.')
}

export async function apagarItem(id: string) {
  const { error, count } = await supabase.from('os_itens').delete({ count: 'exact' }).eq('id', id)
  if (error || !count) throw new Error('Não foi possível apagar o item (só dono e admin apagam).')
}

export async function moverItens(itens: string[], etapa: string, dataIso: string) {
  const { error } = await supabase.rpc('os_mover_itens', { p_itens: itens, p_etapa: etapa, p_data: dataIso })
  if (error) throw amigavel(error, 'Não foi possível mover.')
}

/** desfecho nulo reabre o item. */
export async function definirDesfecho(itens: string[], desfecho: Desfecho | null, dataIso: string) {
  const { error } = await supabase.rpc('os_definir_desfecho', {
    p_itens: itens,
    p_desfecho: desfecho as string,
    p_data: dataIso,
  })
  if (error) throw amigavel(error, 'Não foi possível salvar.')
}

/** dataIso nulo desfaz o faturamento. Vencimento vazio = data + prazo do cliente. */
export async function faturar(itens: string[], dataIso: string | null, vencimento: string | null) {
  const { error } = await supabase.rpc('os_faturar', {
    p_itens: itens,
    p_data: dataIso as string,
    p_vencimento: vencimento ?? undefined,
  })
  if (error) throw amigavel(error, 'Não foi possível faturar (só dono e admin faturam).')
}

export async function registrarPagamento(itens: string[], dataIso: string | null) {
  const { error } = await supabase.rpc('os_registrar_pagamento', { p_itens: itens, p_data: dataIso as string })
  if (error) throw amigavel(error, 'Não foi possível registrar o pagamento.')
}

// ---- painel ----

export type PainelOs = {
  etapas: { id: string; nome: string; marco: Marco | null; ordem: number; itens: number; valor: number; parados: number; mediana_dias: number | null; passagens: number }[]
  tipos: { tipo_id: string | null; nome: string; finalizados: number; mediana_dias: number | null }[]
  recebidos: number
  finalizados: number
  por_semana: { semana: string; recebidos: number; finalizados: number }[]
  aprovacao: { aprovados: number; nao_aprovados: number } | null
  desfechos: Partial<Record<Desfecho, number>>
  financeiro: { faturado: number; recebido: number; vencido: number; a_vencer: number; sem_faturar: number }
  caixa: { dias: number; confirmado: number; previsto: number }[]
  em_orcamento: { itens: number; valor: number }
  parados: {
    item_id: string
    os_id: string
    os_numero: number
    cliente: string | null
    modelo: string | null
    identificacao: string | null
    etapa: string
    dias: number
    normal: number
  }[]
}

export async function buscarPainel(orgId: string, de: string, ate: string): Promise<PainelOs> {
  const { data, error } = await supabase.rpc('os_painel', { p_org: orgId, p_de: de, p_ate: ate })
  if (error) throw amigavel(error, 'Não foi possível carregar o painel.')
  return data as unknown as PainelOs
}

// ---- importação ----

export type LinhaImportacao = {
  cliente: string | null
  /** CNPJ ou CPF: acha o cliente cadastrado (ou cria com ele). */
  documento: string | null
  nf_cliente: string | null
  numero_cliente: string | null
  recebida_em: string
  tipo: string | null
  modelo: string | null
  identificacao: string | null
  valor: number | null
  observacao: string | null
  cobranca: Cobranca
  desfecho: Desfecho | null
  etapas: { etapa_id: string; data: string }[]
  faturado_em: string | null
  vencimento_em: string | null
  pago_em: string | null
}

export async function importar(orgId: string, linhas: LinhaImportacao[]): Promise<{ ordens: number; itens: number; clientes_criados: number }> {
  const { data, error } = await supabase.rpc('os_importar', { p_org: orgId, p_linhas: linhas as unknown as Json })
  if (error) throw amigavel(error, 'Não foi possível importar. Nada foi gravado.')
  return data as { ordens: number; itens: number; clientes_criados: number }
}
