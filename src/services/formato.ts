const fuso = 'America/Sao_Paulo'

const diaChave = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: fuso })

/** 5541999998888 → (41) 99999-8888; fora do Brasil, +DDI e o resto. */
export function formatarTelefone(tel: string | null | undefined): string {
  if (!tel) return ''
  const br = tel.match(/^55(\d{2})(\d{4,5})(\d{4})$/)
  if (br) return `(${br[1]}) ${br[2]}-${br[3]}`
  return `+${tel}`
}

export function nomeDoContato(c: { nome: string | null; nome_whatsapp: string | null; telefone: string | null } | null) {
  if (!c) return 'Contato'
  return c.nome?.trim() || c.nome_whatsapp?.trim() || formatarTelefone(c.telefone) || 'Contato sem nome'
}

export function iniciais(nome: string): string {
  const partes = nome.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })
}

/** Lista de conversas: "14:32" hoje, "Ontem", ou "07/10". */
export function quandoCurto(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(hoje.getTime() - 86_400_000)
  if (diaChave(d) === diaChave(hoje)) return hora(iso)
  if (diaChave(d) === diaChave(ontem)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit' })
}

/** Separador de dia no histórico: "Hoje", "Ontem" ou "segunda-feira, 6 de outubro". */
export function rotuloDia(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(hoje.getTime() - 86_400_000)
  if (diaChave(d) === diaChave(hoje)) return 'Hoje'
  if (diaChave(d) === diaChave(ontem)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { timeZone: fuso, weekday: 'long', day: 'numeric', month: 'long' })
}

export const mesmoDia = (a: string, b: string) => diaChave(new Date(a)) === diaChave(new Date(b))

/** "há 5 min", "há 2 h", "há 3 dias" — para quanto tempo a conversa espera. */
export function haQuanto(iso: string | null): string {
  if (!iso) return ''
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const dias = Math.round(h / 24)
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
}

export function moeda(valor: number | null): string {
  if (valor == null) return ''
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
