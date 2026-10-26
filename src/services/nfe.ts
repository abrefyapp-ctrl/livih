import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type { Emissora } from './empresa'

// NF-e pela Focus NFe (docs/nfe.md). Entrega 1: dados fiscais por CNPJ (emissora) e o cadastro na Focus (função
// nfe-config). O certificado vai direto para a Focus; os tokens dela ficam no Vault.

export type CamposFiscais = Pick<
  Emissora,
  | 'regime_tributario' | 'nfe_ambiente' | 'nfe_serie' | 'cfop_estadual' | 'cfop_interestadual' | 'icms_situacao'
  | 'icms_origem' | 'pis_situacao' | 'cofins_situacao' | 'limite_faturamento' | 'padrao_balcao'
  // NFS-e (docs/nfse.md)
  | 'nfse_ativa' | 'inscricao_municipal' | 'nfse_codigo_tributacao_nacional' | 'nfse_codigo_tributacao_municipal'
  | 'nfse_codigo_nbs' | 'nfse_descricao_padrao' | 'nfse_regime_especial' | 'ibs_cbs_cst' | 'ibs_cbs_classificacao'
  | 'nfse_codigo_indicador_operacao' | 'aliquota_simples'
>

export const REGIMES: { valor: number; rotulo: string }[] = [
  { valor: 1, rotulo: 'Simples Nacional' },
  { valor: 2, rotulo: 'Simples Nacional (excesso de sublimite)' },
  { valor: 4, rotulo: 'MEI' },
  { valor: 3, rotulo: 'Regime normal (Lucro Presumido ou Real)' },
]

export const ORIGENS: { valor: number; rotulo: string }[] = [
  { valor: 0, rotulo: '0 · Nacional' },
  { valor: 1, rotulo: '1 · Estrangeira, importação direta' },
  { valor: 2, rotulo: '2 · Estrangeira, adquirida no mercado interno' },
  { valor: 3, rotulo: '3 · Nacional, conteúdo de importação acima de 40%' },
  { valor: 4, rotulo: '4 · Nacional, processos produtivos básicos' },
  { valor: 5, rotulo: '5 · Nacional, conteúdo de importação até 40%' },
  { valor: 6, rotulo: '6 · Estrangeira, importação direta, sem similar' },
  { valor: 7, rotulo: '7 · Estrangeira, mercado interno, sem similar' },
  { valor: 8, rotulo: '8 · Nacional, conteúdo de importação acima de 70%' },
]

/**
 * Sugestão comum para venda de mercadoria, pelo regime. Só preenche o que está vazio na tela, e a tela pede para
 * conferir com a contabilidade: cada empresa tem as suas exceções.
 */
export function sugestaoFiscal(regime: number | null): Partial<CamposFiscais> {
  const simples = regime === 1 || regime === 2 || regime === 4
  return {
    cfop_estadual: '5102',
    cfop_interestadual: '6102',
    icms_situacao: simples ? '102' : '00',
    pis_situacao: simples ? '49' : '01',
    cofins_situacao: simples ? '49' : '01',
  }
}

/** Teto anual para a sugestão de CNPJ quando o admin não informa (Simples R$ 4,8 mi; MEI R$ 81 mil). */
export const limitePadrao = (regime: number | null) => (regime === 4 ? 81_000 : regime === 1 || regime === 2 ? 4_800_000 : null)

export const ROTULO_STATUS: Record<string, string> = {
  nao_configurada: 'Não configurada',
  pendente: 'Falta o certificado',
  pronta: 'Pronta para emitir',
  erro: 'Com erro',
}

export async function salvarFiscal(emissoraId: string, campos: CamposFiscais) {
  const { error } = await supabase.from('emissoras').update(campos).eq('id', emissoraId)
  if (error) {
    throw new Error(
      error.code === '23505'
        ? 'Já existe outro CNPJ marcado como o do balcão. Desmarque lá primeiro.'
        : error.code === '23514'
          ? 'Confira o CFOP (estadual começa com 5, interestadual com 6) e os códigos de situação.'
          : 'Não foi possível salvar a configuração fiscal.',
    )
  }
}

function base64(arquivo: File): Promise<string> {
  return new Promise((ok, falha) => {
    const leitor = new FileReader()
    leitor.onload = () => ok(String(leitor.result).replace(/^data:[^,]*,/, ''))
    leitor.onerror = () => falha(new Error('Não foi possível ler o certificado.'))
    leitor.readAsDataURL(arquivo)
  })
}

export type ResultadoFocus = { status: string; certificado_validade: string | null; mensagem: string | null }

/** Cadastra ou atualiza o CNPJ na Focus (com o certificado, quando vier). */
export async function sincronizarFocus(emissoraId: string, certificado: File | null, senha: string): Promise<ResultadoFocus> {
  const corpo: Record<string, string> = { emissora_id: emissoraId }
  if (certificado) {
    corpo.certificado_base64 = await base64(certificado)
    corpo.senha_certificado = senha
  }
  const { data, error } = await supabase.functions.invoke('nfe-config', { body: corpo })
  if (error) {
    const resposta = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
    throw new Error(resposta?.erro ?? 'Não foi possível falar com a Focus. Tente de novo.')
  }
  return data as ResultadoFocus
}

export async function definirEmiteNotaFiscal(orgId: string, userId: string, valor: boolean) {
  const { error } = await supabase.rpc('membro_definir_emite_nota_fiscal', { p_org: orgId, p_usuario: userId, p_valor: valor })
  if (error) throw new Error('Não foi possível mudar a permissão. Só dono e admin mudam.')
}

export async function listarEmiteNotaFiscal(orgId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('membros_org').select('user_id').eq('org_id', orgId).eq('emite_nota_fiscal', true)
  if (error) throw error
  return new Set((data ?? []).map((m) => m.user_id))
}

// ---- emissão (entrega 2) ----

export type NotaFiscal = {
  id: string; status: 'processando' | 'autorizada' | 'rejeitada' | 'cancelada'; ambiente: 'homologacao' | 'producao';
  numero: number | null; serie: number | null; chave: string | null; valor: number; mensagem: string | null;
  xml_path: string | null; danfe_path: string | null; xml_cancelamento_path: string | null; emissora_id: string;
  autorizada_em: string | null; cancelada_em: string | null; criado_em: string;
  modelo: 'nfe' | 'nfse'; descricao: string | null; pedido_id: string | null; os_id: string | null;
}

const CAMPOS_NOTA =
  'id, status, ambiente, numero, serie, chave, valor, mensagem, xml_path, danfe_path, xml_cancelamento_path, emissora_id, ' +
  'autorizada_em, cancelada_em, criado_em, modelo, descricao, pedido_id, os_id'

export const NOME_MODELO = { nfe: 'NF-e', nfse: 'NFS-e' } as const

/** A nota mais recente do pedido (viva, ou a última rejeitada/cancelada). */
export async function notaDoPedido(pedidoId: string): Promise<NotaFiscal | null> {
  const { data, error } = await supabase
    .from('notas_fiscais')
    .select(CAMPOS_NOTA)
    .eq('pedido_id', pedidoId)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as unknown as NotaFiscal | null
}

export async function podeEmitirNota(orgId: string): Promise<boolean> {
  const { data } = await supabase.rpc('emite_nota_fiscal', { p_org: orgId })
  return data === true
}

export const FORMAS_PAGAMENTO: { valor: string; rotulo: string }[] = [
  { valor: '15', rotulo: 'Boleto' },
  { valor: '17', rotulo: 'PIX' },
  { valor: '01', rotulo: 'Dinheiro' },
  { valor: '03', rotulo: 'Cartão de crédito' },
  { valor: '04', rotulo: 'Cartão de débito' },
  { valor: '16', rotulo: 'Depósito bancário' },
  { valor: '18', rotulo: 'Transferência bancária' },
  { valor: '90', rotulo: 'Sem pagamento (bonificação, remessa)' },
  { valor: '99', rotulo: 'Outros' },
]

export const PRESENCAS: { valor: number; rotulo: string }[] = [
  { valor: 1, rotulo: 'Presencial (no balcão)' },
  { valor: 2, rotulo: 'Pela internet' },
  { valor: 3, rotulo: 'Por telefone ou WhatsApp' },
  { valor: 9, rotulo: 'Outros, não presencial' },
]

export type PedidoEmissao = { pedido_id: string; emissora_id: string; forma_pagamento: string; a_prazo: boolean; presenca: number; informacoes: string }
export class FaltaParaEmitir extends Error {
  faltando: string[]
  constructor(mensagem: string, faltando: string[]) {
    super(mensagem)
    this.faltando = faltando
  }
}

export async function emitirNota(dados: PedidoEmissao): Promise<NotaFiscal> {
  const { data, error } = await supabase.functions.invoke('nfe-emitir', { body: dados })
  if (error) {
    const r = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
    if (r?.faltando?.length) throw new FaltaParaEmitir(r.erro ?? 'Falta arrumar antes de emitir:', r.faltando)
    throw new Error(r?.erro ?? 'Não foi possível emitir a nota. Tente de novo.')
  }
  return (data as { nota: NotaFiscal }).nota
}

/** Link temporário (1 h) para baixar o XML ou o DANFE guardados no Livih. */
export async function urlArquivoNota(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('notas-fiscais').createSignedUrl(path, 3600, { download: true })
  if (error) throw new Error('Não foi possível abrir o arquivo da nota.')
  return data.signedUrl
}

// ---- NFS-e (docs/nfse.md) ----

export const REGIMES_ESPECIAIS: { valor: number; rotulo: string }[] = [
  { valor: 0, rotulo: 'Nenhum' },
  { valor: 3, rotulo: 'Microempresa municipal' },
  { valor: 5, rotulo: 'Profissional autônomo' },
  { valor: 6, rotulo: 'Sociedade de profissionais' },
  { valor: 2, rotulo: 'Estimativa' },
  { valor: 1, rotulo: 'Ato cooperado (cooperativa)' },
  { valor: 4, rotulo: 'Notário ou registrador' },
  { valor: 9, rotulo: 'Outros' },
]

export async function notaDaOs(osId: string): Promise<NotaFiscal | null> {
  const { data, error } = await supabase.from('notas_fiscais').select(CAMPOS_NOTA).eq('os_id', osId)
    .order('criado_em', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data as unknown as NotaFiscal | null
}

export async function notasDoCliente(clienteId: string): Promise<NotaFiscal[]> {
  const { data, error } = await supabase.from('notas_fiscais').select(CAMPOS_NOTA).eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false }).limit(50)
  if (error) throw error
  return (data ?? []) as unknown as NotaFiscal[]
}

export type ServicoEmissao = {
  pedido_id?: string; os_id?: string; cliente_id?: string; valor?: number; emissora_id: string; descricao: string;
  data_competencia: string; iss_retido: boolean; informacoes: string
}

export async function emitirNotaServico(dados: ServicoEmissao): Promise<NotaFiscal> {
  const { data, error } = await supabase.functions.invoke('nfse-emitir', { body: dados })
  if (error) {
    const r = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
    if (r?.faltando?.length) throw new FaltaParaEmitir(r.erro ?? 'Falta arrumar antes de emitir:', r.faltando)
    throw new Error(r?.erro ?? 'Não foi possível emitir a nota de serviço. Tente de novo.')
  }
  return (data as { nota: NotaFiscal }).nota
}

/**
 * Credenciamento do emissor na SEFAZ (docs/nfe.md). O Paraná (e outros estados que validam o responsável técnico)
 * só autoriza NF-e de sistema que o próprio contribuinte cadastrou no portal: sem isso, rejeição 974 ("CNPJ do
 * responsável técnico diverge do cadastrado") ou 203 (emissor não habilitado). O responsável técnico das notas
 * é a Focus NFe, que emite para o Livih. Vale uma vez por CNPJ, para homologação e produção.
 */
export const FOCUS_RESPONSAVEL_TECNICO = { cnpj: '07.504.505/0001-32', razao: 'Focus NFe Ltda', sistema: 'ACRAS (código 54078)' }

/** A rejeição é a do sistema emissor não credenciado? */
export const rejeicaoCredenciamento = (mensagem: string | null) => !!mensagem && /^\s*(974|203)\b/.test(mensagem)
