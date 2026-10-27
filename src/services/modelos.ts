import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// Modelos de mensagem da API oficial. Moram na conta do WhatsApp (WABA) do número, na Meta: a Livih não
// guarda cópia, lê sempre de lá (o status muda quando a Meta termina a análise).

export type ComponenteModelo = {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  format?: string
  text?: string
  buttons?: { type: string; text: string }[]
}

export type Modelo = {
  id: string
  name: string
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | 'IN_APPEAL' | string
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | string
  language: string
  components: ComponenteModelo[]
  rejected_reason?: string
}

export type ModeloNovo = {
  nome: string
  categoria: 'UTILITY' | 'MARKETING'
  idioma: 'pt_BR' | 'en_US' | 'es'
  cabecalho: string
  corpo: string
  exemplos: string[]
  rodape: string
  botoes: string[]
}

async function chamar<T>(orgId: string, canalId: string, acao: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp-modelos', {
    body: { org_id: orgId, canal_id: canalId, acao, ...extra },
  })
  if (error) {
    const corpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
    throw new Error(corpo?.erro ?? 'Não foi possível falar com a Meta. Tente de novo.')
  }
  return data as T
}

export const listarModelos = (orgId: string, canalId: string) =>
  chamar<{ modelos: Modelo[] }>(orgId, canalId, 'listar').then((r) => r.modelos)
export const criarModelo = (orgId: string, canalId: string, modelo: ModeloNovo) =>
  chamar<{ id: string; status: string }>(orgId, canalId, 'criar', { modelo })
export const apagarModelo = (orgId: string, canalId: string, nome: string) => chamar(orgId, canalId, 'apagar', { nome })

/** Variáveis {{n}} distintas do texto, em ordem. */
export function variaveisDe(texto: string): number[] {
  return [...new Set([...texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((v) => Number(v[1])))].sort((a, b) => a - b)
}

/** Nome no formato da Meta: minúsculas, sem acento, espaços viram _. */
export function nomeTecnico(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')
    .slice(0, 512)
}

export const ROTULO_STATUS: Record<string, { texto: string; tom: 'ok' | 'atencao' | 'erro' | 'neutro' }> = {
  APPROVED: { texto: 'Aprovado', tom: 'ok' },
  PENDING: { texto: 'Em análise', tom: 'atencao' },
  IN_APPEAL: { texto: 'Em recurso', tom: 'atencao' },
  REJECTED: { texto: 'Recusado', tom: 'erro' },
  PAUSED: { texto: 'Pausado pela Meta', tom: 'erro' },
  DISABLED: { texto: 'Desativado pela Meta', tom: 'erro' },
}

export const ROTULO_CATEGORIA: Record<string, string> = {
  UTILITY: 'Utilidade',
  MARKETING: 'Marketing',
  AUTHENTICATION: 'Autenticação',
}

export const ROTULO_IDIOMA: Record<string, string> = {
  pt_BR: 'Português (Brasil)',
  en_US: 'Inglês (EUA)',
  es: 'Espanhol',
}

/** Partes de texto de um modelo aprovado, para a prévia e para o histórico. */
export function partesDe(m: Modelo) {
  const de = (tipo: ComponenteModelo['type']) => m.components.find((c) => c.type === tipo)
  const cabecalho = de('HEADER')
  return {
    cabecalho: cabecalho?.format === 'TEXT' ? (cabecalho.text ?? '') : '',
    corpo: de('BODY')?.text ?? '',
    rodape: de('FOOTER')?.text ?? '',
    botoes: (de('BUTTONS')?.buttons ?? []).filter((b) => b.type === 'QUICK_REPLY').map((b) => b.text),
  }
}

/** Texto que fica no histórico da conversa: o que o cliente leu, com as variáveis preenchidas. */
export function textoEnviado(m: Modelo, valores: string[]) {
  const p = partesDe(m)
  const corpo = p.corpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => valores[Number(n) - 1]?.trim() ?? '')
  return [p.cabecalho && `*${p.cabecalho}*`, corpo, p.rodape && `_${p.rodape}_`].filter(Boolean).join('\n\n')
}

/** Modelos prontos para começar (Configurações → Modelos → Novo modelo): a pessoa escolhe e ajusta o texto. */
export const EXEMPLOS: { titulo: string; quando: string; modelo: ModeloNovo }[] = [
  {
    titulo: 'Retomar a conversa',
    quando: 'O cliente parou de responder há mais de 24 horas.',
    modelo: {
      nome: 'retomar_conversa',
      categoria: 'UTILITY',
      idioma: 'pt_BR',
      cabecalho: '',
      corpo: 'Olá, {{1}}! Aqui é da {{2}}. A nossa conversa ficou parada e queremos saber se ainda podemos ajudar. Quer continuar por aqui?',
      exemplos: ['Maria', 'Loja Exemplo'],
      rodape: '',
      botoes: ['Sim, quero continuar', 'Agora não'],
    },
  },
  {
    titulo: 'Pedido ou serviço pronto',
    quando: 'Avisar que o pedido ou o equipamento está pronto.',
    modelo: {
      nome: 'pedido_pronto',
      categoria: 'UTILITY',
      idioma: 'pt_BR',
      cabecalho: 'Tudo pronto',
      corpo: 'Olá, {{1}}! O seu pedido nº {{2}} está pronto. Quer combinar a retirada ou a entrega? É só responder esta mensagem.',
      exemplos: ['Maria', '1234'],
      rodape: '',
      botoes: [],
    },
  },
  {
    titulo: 'Orçamento enviado',
    quando: 'Perguntar se ficou alguma dúvida sobre o orçamento.',
    modelo: {
      nome: 'retorno_orcamento',
      categoria: 'UTILITY',
      idioma: 'pt_BR',
      cabecalho: '',
      corpo: 'Olá, {{1}}! Enviamos o orçamento nº {{2}} e queremos saber se ficou alguma dúvida. Podemos ajudar a fechar por aqui mesmo.',
      exemplos: ['Maria', '1234'],
      rodape: '',
      botoes: ['Tenho uma dúvida', 'Quero fechar'],
    },
  },
  {
    titulo: 'Promoção',
    quando: 'Campanha de produto ou condição especial.',
    modelo: {
      nome: 'promocao_semana',
      categoria: 'MARKETING',
      idioma: 'pt_BR',
      cabecalho: 'Condição especial',
      corpo: 'Olá, {{1}}! Esta semana temos {{2}} com condições especiais para clientes. Quer saber mais? Responda esta mensagem.',
      exemplos: ['Maria', 'grampos para pinador'],
      rodape: 'Responda SAIR para não receber mais',
      botoes: ['Quero saber mais'],
    },
  },
  {
    titulo: 'Reativar cliente',
    quando: 'Cliente que não compra há algum tempo.',
    modelo: {
      nome: 'novidades_cliente',
      categoria: 'MARKETING',
      idioma: 'pt_BR',
      cabecalho: '',
      corpo: 'Olá, {{1}}! Faz tempo que a gente não conversa. Chegaram novidades na {{2}} e lembramos de você. Posso te mostrar?',
      exemplos: ['Maria', 'Loja Exemplo'],
      rodape: 'Responda SAIR para não receber mais',
      botoes: ['Quero ver', 'Agora não'],
    },
  },
]

/**
 * Avisos antes de enviar para a Meta: o que costuma levar à recusa. Não impedem o envio (a Meta é quem decide),
 * mas evitam esperar horas por uma recusa previsível.
 */
export function avisosDoModelo(m: ModeloNovo): string[] {
  const avisos: string[] = []
  const corpo = m.corpo.trim()
  const vars = variaveisDe(corpo)
  if (/^\{\{\s*\d+\s*\}\}/.test(corpo) || /\{\{\s*\d+\s*\}\}[.!?…\s]*$/.test(corpo)) {
    avisos.push('A mensagem começa ou termina com uma variável. A Meta recusa: escreva texto antes e depois.')
  }
  if (vars.some((n, i) => n !== i + 1)) {
    avisos.push('As variáveis precisam estar em sequência: {{1}}, {{2}}, {{3}}…')
  }
  const palavras = corpo.replace(/\{\{\s*\d+\s*\}\}/g, ' ').split(/\s+/).filter(Boolean).length
  if (vars.length && palavras < vars.length * 3 + 2) {
    avisos.push('Pouco texto para tantas variáveis. A Meta pede mais palavras fixas em volta delas.')
  }
  if (/\{\{\s*\d+\s*\}\}\s*\{\{\s*\d+\s*\}\}/.test(corpo)) {
    avisos.push('Duas variáveis seguidas, sem texto entre elas. A Meta recusa.')
  }
  if (vars.some((n) => !m.exemplos[n - 1]?.trim())) {
    avisos.push('Preencha o exemplo de cada variável: a Meta usa para entender a mensagem.')
  }
  if (m.categoria === 'MARKETING' && !/sair|parar|cancelar/i.test(`${m.rodape} ${m.botoes.join(' ')}`)) {
    avisos.push('Em Marketing, ofereça um jeito de sair (ex.: rodapé "Responda SAIR para não receber mais"). Diminui bloqueios e denúncias.')
  }
  if (m.categoria === 'UTILITY' && /promo|desconto|oferta|novidade|aproveite|imperd/i.test(corpo)) {
    avisos.push('O texto parece de venda. A Meta deve reclassificar como Marketing (e cobrar como Marketing).')
  }
  return avisos
}
