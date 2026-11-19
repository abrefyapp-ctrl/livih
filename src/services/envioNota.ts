import { formatarTelefoneLocal } from './formato'
import type { DestinosNota, EnvioNota } from './nfe'

// Regras do envio da NF-e ao cliente (docs/balcao.md, entrega 2; decisões de 27/10), usadas por components/EnvioNota.tsx.
// De onde vem o WhatsApp: o contato do cliente que conversou por último; sem contato, o telefone do cliente só se for
// celular. De onde vem o e-mail: o do cliente; sem ele, o de um contato.

export type FormEnvio = {
  whatsapp: boolean
  numero: string
  contatoId: string | null
  email: boolean
  endereco: string
  salvarEmail: boolean
}

const digitos = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '')
/** 55 + DDD + número, ou null. */
export function normalizarWhatsapp(v: string): string | null {
  let d = digitos(v)
  if (d.length === 10 || d.length === 11) d = `55${d}`
  return /^55\d{10,11}$/.test(d) ? d : null
}
const ehCelular = (v: string | null) => {
  const d = normalizarWhatsapp(v ?? '')
  return !!d && d.length === 13 && d[4] === '9'
}
const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export function formInicial(d: DestinosNota | null): FormEnvio {
  const contato = d?.contatos[0] ?? null
  const numero = contato?.telefone ?? (d && ehCelular(d.telefone) ? normalizarWhatsapp(d.telefone ?? '') : null) ?? ''
  const endereco = d?.email ?? d?.contatos.find((c) => c.email)?.email ?? ''
  return {
    whatsapp: !!numero,
    numero: numero ? formatarTelefoneLocal(numero) : '',
    contatoId: contato?.id ?? null,
    email: !!endereco,
    endereco,
    // Desmarcado (19/11/2026): no teste, trocar o e-mail só para mandar a nota a outro endereço trocava também o
    // cadastro do cliente sem a pessoa perceber.
    salvarEmail: false,
  }
}

/** O que impede mandar, em texto para a tela; null = pode. */
export function problemaEnvio(f: FormEnvio): string | null {
  if (f.whatsapp && !normalizarWhatsapp(f.numero)) return 'Confira o WhatsApp da nota: DDD e número, como (41) 99999-8888.'
  if (f.email && !emailValido(f.endereco)) return 'Confira o e-mail da nota.'
  return null
}

export const querEnviar = (f: FormEnvio) => f.whatsapp || f.email

/** Corpo para pedirEnvioNota. */
export function paraEnvio(notaId: string, f: FormEnvio, d: DestinosNota | null) {
  const numero = f.whatsapp ? normalizarWhatsapp(f.numero) : null
  const endereco = f.email ? f.endereco.trim().toLowerCase() : ''
  const mudouEmail = !!endereco && endereco !== (d?.email ?? '').toLowerCase()
  return {
    nota_id: notaId,
    ...(numero ? { whatsapp: numero, contato_id: f.contatoId } : {}),
    ...(endereco ? { email: endereco, salvar_email: mudouEmail && f.salvarEmail } : {}),
  }
}


/** Recarrega os envios enquanto algum ainda não terminou (a nfe-retorno manda em segundo plano). */
export const enviosEmAndamento = (envios: EnvioNota[]) => envios.some((e) => e.situacao === 'pendente' || e.situacao === 'enviando')
