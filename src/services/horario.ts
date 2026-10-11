import type { Json } from './tiposBanco'

export type DiaAtendimento = { aberto: boolean; inicio: string; fim: string }
/** dias[0] = segunda … dias[6] = domingo. */
export type Horario = { vinteQuatro: boolean; dias: DiaAtendimento[] }

export const NOMES_DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const PADRAO: DiaAtendimento[] = NOMES_DIAS.map((_, i) => ({ aberto: i < 5, inicio: '08:00', fim: '18:00' }))

/** Banco: null = 24 h; {"1": ["08:00","18:00"], …} com 1 = segunda (dia ISO); dia ausente = fechado. */
export function horarioDoBanco(v: Json | null): Horario {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { vinteQuatro: true, dias: PADRAO }
  return {
    vinteQuatro: false,
    dias: PADRAO.map((p, i) => {
      const f = (v as Record<string, Json | undefined>)[String(i + 1)]
      return Array.isArray(f) && typeof f[0] === 'string' && typeof f[1] === 'string'
        ? { aberto: true, inicio: f[0], fim: f[1] }
        : { ...p, aberto: false }
    }),
  }
}

export function horarioParaBanco(h: Horario): Json | null {
  if (h.vinteQuatro) return null
  return Object.fromEntries(h.dias.flatMap((d, i) => (d.aberto ? [[String(i + 1), [d.inicio, d.fim]]] : [])))
}

export function erroDoHorario(h: Horario): string | undefined {
  if (h.vinteQuatro) return undefined
  if (!h.dias.some((d) => d.aberto)) return 'Marque pelo menos um dia de atendimento.'
  const i = h.dias.findIndex((d) => d.aberto && (!d.inicio || !d.fim || d.inicio >= d.fim))
  return i >= 0 ? `${NOMES_DIAS[i]}: o horário de fim tem que ser depois do início.` : undefined
}
