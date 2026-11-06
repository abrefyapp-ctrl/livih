import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

type Linha = Database['public']['Tables']['respostas_rapidas']['Row']
/** `usuario_id` nulo: resposta da empresa (toda a equipe usa; dono e admin editam). Preenchido: pessoal. */
export type RespostaRapida = Pick<Linha, 'id' | 'usuario_id' | 'atalho' | 'texto'>

/** Atalho como o banco aceita: minúsculas sem acento, números, - e _, até 30 caracteres. */
export function normalizarAtalho(t: string) {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 30)
}

/** As respostas que a pessoa pode usar: as da empresa e as dela (a RLS esconde as pessoais dos outros). */
export async function listarRespostasRapidas(orgId: string): Promise<RespostaRapida[]> {
  const { data, error } = await supabase
    .from('respostas_rapidas')
    .select('id, usuario_id, atalho, texto')
    .eq('org_id', orgId)
    .order('atalho')
  if (error) throw error
  return data ?? []
}

export async function salvarRespostaRapida(
  orgId: string,
  r: { id?: string; usuario_id: string | null; atalho: string; texto: string },
) {
  const linha = { org_id: orgId, usuario_id: r.usuario_id, atalho: r.atalho, texto: r.texto.trim() }
  const { error } = r.id
    ? await supabase.from('respostas_rapidas').update({ atalho: linha.atalho, texto: linha.texto }).eq('id', r.id)
    : await supabase.from('respostas_rapidas').insert(linha)
  if (error)
    throw new Error(
      error.code === '23505'
        ? `Já existe uma resposta com o atalho /${r.atalho} nesta lista. Escolha outro.`
        : 'Não foi possível salvar a resposta. Tente de novo.',
    )
}

export async function apagarRespostaRapida(id: string) {
  const { error } = await supabase.from('respostas_rapidas').delete().eq('id', id)
  if (error) throw new Error('Não foi possível apagar a resposta. Tente de novo.')
}

/**
 * Texto pronto para a caixa da conversa: "{nome}" vira o primeiro nome do cliente. Sem nome conhecido (só o celular),
 * some a variável e o espaço antes dela ("Oi {nome}, tudo bem?" → "Oi, tudo bem?").
 */
export function preencherResposta(texto: string, primeiroNome: string | null) {
  if (primeiroNome) return texto.replace(/\{nome\}/gi, primeiroNome)
  return texto.replace(/ ?\{nome\}/gi, '')
}
