import type { EstadoConversa } from './atendimento'

/** Abas da caixa de entrada, na ordem de prioridade de atendimento. */
export const ABAS: { estado: EstadoConversa; rotulo: string }[] = [
  { estado: 'aguardando_humano', rotulo: 'Aguardando' },
  { estado: 'humano', rotulo: 'Atendendo' },
  { estado: 'bot', rotulo: 'Agente' },
  { estado: 'encerrada', rotulo: 'Encerradas' },
]

export const ehAba = (v: string | null): v is EstadoConversa => ABAS.some((a) => a.estado === v)
