import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

export type Emissora = Database['public']['Tables']['emissoras']['Row']
export type DadosEmissora = Omit<Emissora, 'id' | 'org_id' | 'logo_path' | 'padrao' | 'criado_em' | 'atualizado_em'>

/** 11222333000181 → 11.222.333/0001-81 */
export function formatarCnpj(cnpj: string | null | undefined): string {
  const d = (cnpj ?? '').replace(/\D/g, '')
  if (d.length !== 14) return cnpj ?? ''
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** Mesma conta do banco (cnpj_valido): a tela avisa antes de tentar salvar. */
export function cnpjValido(v: string): boolean {
  const d = v.replace(/\D/g, '')
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const s = pesos.reduce((t, p, i) => t + p * Number(d[i]), 0)
    return s % 11 < 2 ? 0 : 11 - (s % 11)
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

const erroAmigavel = (e: { message: string; code?: string }) =>
  new Error(
    e.code === '23505'
      ? 'Esse CNPJ já está cadastrado nesta conta.'
      : e.message.includes('cnpj')
        ? 'CNPJ inválido. Confira os números.'
        : 'Não foi possível salvar. Confira os campos e tente de novo.',
  )

export async function listarEmissoras(orgId: string): Promise<Emissora[]> {
  const { data, error } = await supabase
    .from('emissoras')
    .select('*')
    .eq('org_id', orgId)
    .order('padrao', { ascending: false })
    .order('criado_em')
  if (error) throw error
  return data ?? []
}

/** Cria (com o id já escolhido, para a logo subir no caminho certo) ou atualiza. */
export async function salvarEmissora(orgId: string, id: string, nova: boolean, dados: DadosEmissora) {
  const { error } = nova
    ? await supabase.from('emissoras').insert({ id, org_id: orgId, ...dados })
    : await supabase.from('emissoras').update(dados).eq('id', id)
  if (error) throw erroAmigavel(error)
}

export async function definirPadrao(id: string) {
  const { error } = await supabase.from('emissoras').update({ padrao: true }).eq('id', id)
  if (error) throw new Error('Não foi possível mudar a padrão. Tente de novo.')
}

export async function removerEmissora(e: Emissora) {
  const { error } = await supabase.from('emissoras').delete().eq('id', e.id)
  if (error)
    throw new Error(
      error.code === '23503'
        ? 'Essa empresa já está em pedidos e não pode sair: eles precisam continuar mostrando de qual CNPJ saíram.'
        : 'Não foi possível remover. Tente de novo.',
    )
  if (e.logo_path) await supabase.storage.from('logos').remove([e.logo_path])
}

/** Sobe a logo nova, aponta a emissora para ela e apaga a anterior. Só PNG e JPG (o PDF lê bem). */
export async function trocarLogo(orgId: string, emissora: Pick<Emissora, 'id' | 'logo_path'>, arquivo: File) {
  const ext = arquivo.type === 'image/png' ? 'png' : 'jpg'
  const path = `${orgId}/${emissora.id}/logo-${Date.now()}.${ext}`
  const { error: erroUpload } = await supabase.storage.from('logos').upload(path, arquivo, { contentType: arquivo.type })
  if (erroUpload) throw new Error('Não foi possível enviar a logo. Use PNG ou JPG de até 2 MB.')
  const { error } = await supabase.from('emissoras').update({ logo_path: path }).eq('id', emissora.id)
  if (error) throw new Error('A logo subiu, mas não foi ligada à empresa. Tente de novo.')
  if (emissora.logo_path) await supabase.storage.from('logos').remove([emissora.logo_path])
}

export async function tirarLogo(emissora: Pick<Emissora, 'id' | 'logo_path'>) {
  const { error } = await supabase.from('emissoras').update({ logo_path: null }).eq('id', emissora.id)
  if (error) throw new Error('Não foi possível tirar a logo. Tente de novo.')
  if (emissora.logo_path) await supabase.storage.from('logos').remove([emissora.logo_path])
}

export async function urlLogo(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('logos').createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

export type Endereco = { logradouro: string; bairro: string; cidade: string; uf: string }

/** Preenche o endereço pelo CEP (ViaCEP). null = CEP não encontrado ou serviço fora. */
export async function buscarCep(cep: string): Promise<Endereco | null> {
  const d = cep.replace(/\D/g, '')
  if (d.length !== 8) return null
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(6000) })
    const j = await r.json()
    if (!r.ok || j.erro) return null
    return { logradouro: j.logradouro ?? '', bairro: j.bairro ?? '', cidade: j.localidade ?? '', uf: j.uf ?? '' }
  } catch {
    return null
  }
}

/** Nome e telefone de quem está logado (o telefone sai no PDF do orçamento). */
export async function salvarMeusDados(userId: string, nome: string, telefone: string | null) {
  const { error } = await supabase.from('perfis').update({ nome, telefone }).eq('user_id', userId)
  if (error) throw new Error('Não foi possível salvar seus dados. Tente de novo.')
}
