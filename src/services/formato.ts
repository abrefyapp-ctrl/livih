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

/**
 * Reais. Por padrão sem centavos (valor estimado de oportunidade, totais de funil); com `centavos`, sempre com duas
 * casas: preço, item, total de pedido e tudo o que é cobrado (R$ 12,50 não pode virar R$ 13).
 */
export function moeda(valor: number | null, centavos = false): string {
  if (valor == null) return ''
  return valor.toLocaleString(
    'pt-BR',
    centavos
      ? { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 },
  )
}

/** 11222333000181 → 11.222.333/0001-81 */
export function formatarCnpj(cnpj: string | null | undefined): string {
  const d = (cnpj ?? '').replace(/\D/g, '')
  if (d.length !== 14) return cnpj ?? ''
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** 1,5 / 10 / 2,125 (até 3 casas); vazio → —. */
export const quantidade = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/** "Orcamento-12-Maria-Silva.pdf" (sem acento nem espaço: abre bem em qualquer celular). */
export function nomeArquivoOrcamento(d: { pedido: { status: string; numero: number }; cliente: { nome: string } | null }): string {
  const tipo = d.pedido.status === 'rascunho' ? 'Orcamento' : 'Pedido'
  const cliente = (d.cliente?.nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${tipo}-${d.pedido.numero}${cliente ? `-${cliente}` : ''}.pdf`
}
