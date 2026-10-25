import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type { Emissora } from './empresa'

// NF-e pela Focus NFe (docs/nfe.md). Entrega 1: dados fiscais por CNPJ (emissora) e o cadastro na Focus (função
// nfe-config). O certificado vai direto para a Focus; os tokens dela ficam no Vault.

export type CamposFiscais = Pick<
  Emissora,
  | 'regime_tributario' | 'nfe_ambiente' | 'nfe_serie' | 'cfop_estadual' | 'cfop_interestadual' | 'icms_situacao'
  | 'icms_origem' | 'pis_situacao' | 'cofins_situacao' | 'limite_faturamento' | 'padrao_balcao'
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
