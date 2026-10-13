import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

type Tabela = Database['public']['Tables']['compromissos']
export type StatusCompromisso = Database['public']['Enums']['status_compromisso']

export type Compromisso = Pick<
  Tabela['Row'],
  'id' | 'titulo' | 'inicio' | 'fim' | 'responsavel_id' | 'contato_id' | 'oportunidade_id' | 'local' | 'observacao' | 'status' | 'origem'
> & {
  contato: { id: string; nome: string | null; nome_whatsapp: string | null; telefone: string | null } | null
  oportunidade: { id: string; titulo: string } | null
}

export type DadosCompromisso = Pick<
  Tabela['Insert'],
  'titulo' | 'inicio' | 'fim' | 'responsavel_id' | 'contato_id' | 'oportunidade_id' | 'local' | 'observacao' | 'status'
>

export const ROTULO_STATUS: Record<StatusCompromisso, string> = {
  marcado: 'Marcado',
  confirmado: 'Confirmado',
  realizado: 'Realizado',
  nao_compareceu: 'Não compareceu',
  cancelado: 'Cancelado',
}

const CAMPOS =
  'id, titulo, inicio, fim, responsavel_id, contato_id, oportunidade_id, local, observacao, status, origem, ' +
  'contato:contatos(id, nome, nome_whatsapp, telefone), oportunidade:oportunidades(id, titulo)'

const erroAmigavel = (m: string) =>
  new Error(
    m.includes('responsável precisa')
      ? 'O responsável precisa ser da equipe.'
      : m.includes('outro cliente')
        ? 'A oportunidade escolhida é de outro cliente.'
        : m.includes('check')
          ? 'Confira o horário: o fim precisa ser depois do início, no mesmo dia.'
          : 'Não foi possível salvar o compromisso. Tente de novo.',
  )

/** Compromissos que começam no período [de, ate). A RLS já aplica a carteira. */
export async function listarCompromissos(orgId: string, de: Date, ate: Date): Promise<Compromisso[]> {
  const { data, error } = await supabase
    .from('compromissos')
    .select(CAMPOS)
    .eq('org_id', orgId)
    .gte('inicio', de.toISOString())
    .lt('inicio', ate.toISOString())
    .order('inicio')
  if (error) throw error
  return (data ?? []) as unknown as Compromisso[]
}

/** Próximos compromissos de um cliente (perfil do contato). */
export async function proximosDoContato(contatoId: string): Promise<Compromisso[]> {
  const { data, error } = await supabase
    .from('compromissos')
    .select(CAMPOS)
    .eq('contato_id', contatoId)
    .gte('fim', new Date().toISOString())
    .neq('status', 'cancelado')
    .order('inicio')
    .limit(5)
  if (error) throw error
  return (data ?? []) as unknown as Compromisso[]
}

export async function criarCompromisso(orgId: string, dados: DadosCompromisso) {
  const { error } = await supabase.from('compromissos').insert({ org_id: orgId, ...dados })
  if (error) throw erroAmigavel(error.message)
}

export async function atualizarCompromisso(id: string, dados: Partial<DadosCompromisso>) {
  const { error } = await supabase.from('compromissos').update(dados).eq('id', id)
  if (error) throw erroAmigavel(error.message)
}

export async function apagarCompromisso(id: string) {
  const { error } = await supabase.from('compromissos').delete().eq('id', id)
  if (error) throw new Error('Não foi possível apagar. Tente de novo.')
}

// ---- datas (no fuso do aparelho, que é o da equipe) ----

/** Segunda-feira 00:00 da semana de `d`. */
export function inicioDaSemana(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7))
  return r
}

export const somarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

export const mesmoDiaLocal = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const dois = (n: number) => String(n).padStart(2, '0')
/** "2026-10-12" para <input type="date">. */
export const dataInput = (d: Date) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
/** "14:30" para <input type="time">. */
export const horaInput = (d: Date) => `${dois(d.getHours())}:${dois(d.getMinutes())}`
/** Data e hora dos inputs → Date no fuso do aparelho. */
export const juntar = (data: string, hora: string) => new Date(`${data}T${hora}:00`)

export const horaCurta = (iso: string) => horaInput(new Date(iso))

/** "12 – 18 de outubro de 2026" (ou com os dois meses, se a semana virar o mês). */
export function rotuloSemana(segunda: Date): string {
  const domingo = somarDias(segunda, 6)
  const mes = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'long' })
  if (segunda.getMonth() === domingo.getMonth()) {
    return `${segunda.getDate()} – ${domingo.getDate()} de ${mes(domingo)} de ${domingo.getFullYear()}`
  }
  return `${segunda.getDate()} de ${mes(segunda)} – ${domingo.getDate()} de ${mes(domingo)} de ${domingo.getFullYear()}`
}
