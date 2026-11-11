import { formatarCep, formatarDocumento, formatarTelefoneLocal } from './formato'
import { supabase } from './supabaseClient'

// Dados de cobrança de cada empresa cliente: quem paga a Livih (migration 20261101140000; docs/cobranca-asaas.md).
// A plataforma preenche ao criar a empresa; o dono confere e corrige em Plano e consumo. Sem dados salvos, a
// emissora padrão vem como sugestão (sugerido = true).
export type DadosCobranca = {
  nome: string
  documento: string
  email: string
  telefone: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export const DADOS_COBRANCA_VAZIOS: DadosCobranca = {
  nome: '', documento: '', email: '', telefone: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
}

const OBRIGATORIOS: (keyof DadosCobranca)[] = ['nome', 'documento', 'email', 'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf']

export const dadosCobrancaVazios = (d: DadosCobranca) => Object.values(d).every((v) => !v.trim())
export const dadosCobrancaCompletos = (d: DadosCobranca) => OBRIGATORIOS.every((c) => !!d[c].trim())

export async function buscarDadosCobranca(orgId: string): Promise<{ dados: DadosCobranca; sugerido: boolean } | null> {
  const { data, error } = await supabase.rpc('cobranca_dados', { p_org: orgId })
  if (error) throw error
  const d = data?.[0]
  if (!d) return null
  const texto = (v: string | null) => v ?? ''
  return {
    sugerido: d.sugerido,
    dados: {
      // O banco guarda só os dígitos; na tela, com a pontuação.
      nome: texto(d.nome), documento: formatarDocumento(d.documento), email: texto(d.email), telefone: formatarTelefoneLocal(d.telefone),
      cep: formatarCep(d.cep),
      logradouro: texto(d.logradouro), numero: texto(d.numero), complemento: texto(d.complemento), bairro: texto(d.bairro),
      cidade: texto(d.cidade), uf: texto(d.uf),
    },
  }
}

/** O banco limpa a pontuação e confere CNPJ/CPF, e-mail e endereço; as mensagens dele já dizem o que corrigir. */
export async function salvarDadosCobranca(orgId: string, dados: DadosCobranca) {
  const { error } = await supabase.rpc('cobranca_salvar_dados', { p_org: orgId, p_dados: dados })
  if (error) {
    const doBanco = /^(Só o dono|Empresa|Informe|CNPJ ou CPF|Telefone|CEP|Preencha|O nome|O número|O complemento|O bairro|A rua)/.test(error.message)
    throw new Error(doBanco ? error.message : 'Não foi possível salvar os dados de cobrança. Confira a internet e tente de novo.')
  }
}

/** Empresas que já têm dados de cobrança (só a equipe da plataforma enxerga todas). */
export async function empresasComDadosCobranca(): Promise<Set<string>> {
  const { data, error } = await supabase.from('dados_cobranca').select('org_id')
  if (error) throw error
  return new Set((data ?? []).map((d) => d.org_id))
}
