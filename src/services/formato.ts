const fuso = 'America/Sao_Paulo'

const diaChave = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: fuso })

/** 5541999998888 → (41) 99999-8888; fora do Brasil, +DDI e o resto. */
export function formatarTelefone(tel: string | null | undefined): string {
  if (!tel) return ''
  const br = tel.match(/^55(\d{2})(\d{4,5})(\d{4})$/)
  if (br) return `(${br[1]}) ${br[2]}-${br[3]}`
  return `+${tel}`
}

/** Telefone guardado sem o 55 (dados de cobrança): 41995617336 → (41) 99561-7336; o que não for DDD + número volta como veio. */
export function formatarTelefoneLocal(v: string | null | undefined): string {
  const d = (v ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '')
  const m = d.match(/^(\d{2})(\d{4,5})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (v ?? '')
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

/**
 * CNPJ, CPF ou chave de acesso sem pontuação e em maiúsculas, a mesma limpeza do banco (limpar_documento). Desde 07/2026
 * a Receita dá CNPJ com letras (12.ABC.345/01DE-35): tirar tudo o que não é número trocaria o CNPJ por outro.
 */
export const limparDocumento = (v: string | null | undefined) => (v ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()

/**
 * Mesma conta do banco (cnpj_valido): 12 letras ou números e 2 dígitos verificadores. Cada caractere vale o código
 * menos 48 (0–9 = 0–9, A = 17 … Z = 42); pesos e módulo 11 iguais aos do CNPJ só de números.
 */
export function cnpjValido(v: string): boolean {
  const d = limparDocumento(v)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(.)\1{13}$/.test(d)) return false
  const dv = (n: number) => {
    const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].slice(13 - n)
    const s = pesos.reduce((t, p, i) => t + p * (d.charCodeAt(i) - 48), 0)
    return s % 11 < 2 ? 0 : 11 - (s % 11)
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

/** 11222333000181 → 11.222.333/0001-81; 12ABC34501DE35 → 12.ABC.345/01DE-35 */
export function formatarCnpj(cnpj: string | null | undefined): string {
  const d = limparDocumento(cnpj)
  if (d.length !== 14) return cnpj ?? ''
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** CNPJ (14) ou CPF (11) com pontuação; o resto volta como veio. */
export function formatarDocumento(v: string | null | undefined): string {
  const d = limparDocumento(v)
  if (d.length === 14) return formatarCnpj(d)
  if (/^\d{11}$/.test(d)) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  return v ?? ''
}

/** 80010000 → 80010-000 */
export function formatarCep(v: string | null | undefined): string {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (v ?? '')
}

type Endereco = { logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null; cep: string | null }

/** "Rua X, 100 - sala 2 · Centro · Curitiba/PR · 80010-000", sem as partes vazias. */
export function enderecoEmLinha(c: Endereco): string {
  const rua = [c.logradouro, c.numero].filter(Boolean).join(', ') + (c.complemento ? ` - ${c.complemento}` : '')
  const cidade = [c.cidade, c.uf].filter(Boolean).join('/')
  return [rua, c.bairro, cidade, c.cep ? formatarCep(c.cep) : null].filter(Boolean).join(' · ')
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

/** "1.234,56" → 1234.56; vazio → null; inválido → undefined. */
export function lerNumero(v: string): number | null | undefined {
  const t = v.trim()
  if (!t) return null
  const limpo = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(limpo)
  return Number.isFinite(n) ? n : undefined
}
