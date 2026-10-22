import { lerNumero } from './formato'
import { lerCsv } from './planilhaProdutos'
import type { Cobranca, Desfecho, EtapaOs, LinhaImportacao } from './os'

// Importação de ordens de serviço por planilha (CSV no modelo do módulo). Sem Supabase, para dar para testar fora da
// tela. Uma linha por item; linhas com o mesmo cliente, NF, OS do cliente e recebimento viram uma OS só (no banco).
// Cada etapa (menos a primeira, que é o recebimento) é uma coluna com a data em que o item chegou nela.
//
// Leniente com planilha feita à mão: a data pode vir no meio do texto ("FINALIZADO 04/02/2026"), "GARANTIA" na
// coluna de cobrança vira garantia e "não foi aprovado orçamento" vira o desfecho.

/** Marca de UTF-8 no começo do CSV: o Excel abre com acento certo. */
export const BOM = String.fromCharCode(0xfeff)

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const nomeColuna = (h: string) => semAcento(h).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

type Coluna =
  | 'cliente' | 'nf_cliente' | 'numero_cliente' | 'recebida_em' | 'tipo' | 'modelo' | 'identificacao' | 'valor'
  | 'cobranca' | 'desfecho' | 'faturado_em' | 'vencimento_em' | 'pago_em' | 'observacao'
const COLUNAS: Record<Coluna, string[]> = {
  cliente: ['cliente', 'empresa'],
  nf_cliente: ['nf do cliente', 'nf', 'nota fiscal', 'nota'],
  numero_cliente: ['os do cliente', 'o s do cliente', 'numero do cliente', 'pedido do cliente'],
  recebida_em: ['recebido em', 'recebido', 'recebimento', 'data de recebimento', 'entrada', 'data de entrada'],
  tipo: ['tipo', 'item', 'equipamento'],
  modelo: ['modelo', 'descricao'],
  identificacao: ['identificacao', 'n de serie', 'no de serie', 'numero de serie', 'serie', 'imei', 'placa'],
  valor: ['valor', 'valor r', 'preco'],
  cobranca: ['cobranca'],
  desfecho: ['desfecho', 'encerramento'],
  faturado_em: ['faturado em', 'faturamento', 'boleto', 'data do boleto'],
  vencimento_em: ['vencimento'],
  pago_em: ['pago em', 'pagamento', 'recebido o pagamento'],
  observacao: ['observacao', 'observacoes', 'obs'],
}

const ROTULOS: Record<Coluna, string> = {
  cliente: 'Cliente',
  nf_cliente: 'NF do cliente',
  numero_cliente: 'OS do cliente',
  recebida_em: 'Recebido em',
  tipo: 'Tipo',
  modelo: 'Modelo',
  identificacao: 'Identificação',
  valor: 'Valor',
  cobranca: 'Cobrança',
  desfecho: 'Desfecho',
  faturado_em: 'Faturado em',
  vencimento_em: 'Vencimento',
  pago_em: 'Pago em',
  observacao: 'Observação',
}

/** Primeira data do texto (dd/mm/aaaa, dd/mm/aa ou aaaa-mm-dd) → AAAA-MM-DD; sem data → null; data impossível → undefined. */
export function lerData(v: string): string | null | undefined {
  const t = v.trim()
  if (!t) return null
  let a: number, m: number, d: number
  const iso = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  const br = t.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/)
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (br) {
    ;[d, m, a] = [Number(br[1]), Number(br[2]), Number(br[3])]
    if (br[3].length === 2) a += 2000
    else if (br[3].length === 3) return undefined
  } else return null
  const dt = new Date(Date.UTC(a, m - 1, d))
  if (a < 2000 || a > 2100 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined
  return dt.toISOString().slice(0, 10)
}

function lerCobranca(v: string): Cobranca | null {
  const t = semAcento(v)
  if (t.includes('garantia')) return 'garantia'
  if (t.includes('cortesia')) return 'cortesia'
  return null
}

function lerDesfecho(v: string): Desfecho | null {
  const t = semAcento(v)
  if (/nao (foi )?aprovad|reprovad|recusad/.test(t)) return 'nao_aprovado'
  if (/sem conserto|nao deu conserto|nao tem conserto/.test(t)) return 'sem_conserto'
  if (t.includes('cancelad')) return 'cancelado'
  return null
}

/** Modelo para baixar: o cabeçalho com as etapas da empresa e uma linha de exemplo. */
export function modeloPlanilha(etapas: EtapaOs[]): string {
  const depois = etapas.slice(1)
  const cab = [
    ...(['cliente', 'nf_cliente', 'numero_cliente', 'recebida_em', 'tipo', 'modelo', 'identificacao', 'valor', 'cobranca', 'desfecho'] as Coluna[]).map((c) => ROTULOS[c]),
    ...depois.map((e) => e.nome),
    ...(['faturado_em', 'vencimento_em', 'pago_em', 'observacao'] as Coluna[]).map((c) => ROTULOS[c]),
  ]
  const exemplo = [
    'Indústria Exemplo', '182979', '124', '07/01/2026', 'Motor', 'SPINDLE SJ ZT', 'L14XE004', '150,00', '', '',
    ...depois.map((_, n) => (n === 0 ? '10/01/2026' : '')),
    '', '', '', 'Troca de rolamento',
  ]
  return BOM + [cab, exemplo].map((l) => l.join(';')).join('\r\n')
}

/** Excel no Brasil salva CSV em Windows-1252; os outros, em UTF-8. */
export async function textoDoArquivo(f: File): Promise<string> {
  const bytes = await f.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

export type LeituraOs = { linhas: LinhaImportacao[]; erros: string[]; colunasEtapas: string[]; ignoradas: string[] }

export function planilhaParaOs(texto: string, etapas: EtapaOs[]): LeituraOs {
  const [cab, ...resto] = lerCsv(texto.startsWith(BOM) ? texto.slice(1) : texto)
  if (!cab) return { linhas: [], erros: ['A planilha está vazia.'], colunasEtapas: [], ignoradas: [] }
  const nomes = cab.map(nomeColuna)
  const usadas = new Set<number>()
  // Etapa antes das colunas fixas: "Recebido" pode ser o nome da primeira etapa e da coluna de recebimento.
  const idxEtapa = new Map<string, number>()
  etapas.slice(1).forEach((e) => {
    const i = nomes.indexOf(nomeColuna(e.nome))
    if (i >= 0) {
      idxEtapa.set(e.id, i)
      usadas.add(i)
    }
  })
  const idx = Object.fromEntries(
    (Object.keys(COLUNAS) as Coluna[]).map((c) => {
      const i = nomes.findIndex((n, j) => !usadas.has(j) && COLUNAS[c].includes(n))
      if (i >= 0) usadas.add(i)
      return [c, i]
    }),
  ) as Record<Coluna, number>
  if (idx.recebida_em < 0) {
    return { linhas: [], erros: ['Falta a coluna "Recebido em" no cabeçalho. Baixe o modelo para ver as colunas.'], colunasEtapas: [], ignoradas: [] }
  }
  const celula = (l: string[], c: Coluna) => (idx[c] >= 0 ? (l[idx[c]] ?? '').trim() : '')

  const erros: string[] = []
  const linhas: LinhaImportacao[] = []
  resto.forEach((l, n) => {
    const nLinha = n + 2
    if (!l.some((x) => x.trim())) return
    const recebida = lerData(celula(l, 'recebida_em'))
    if (!recebida) {
      erros.push(`Linha ${nLinha}: sem data de recebimento válida.`)
      return
    }
    const valor = lerNumero(celula(l, 'valor').replace(/r\$\s*/i, ''))
    if (valor === undefined || (valor ?? 0) < 0) {
      erros.push(`Linha ${nLinha}: valor inválido ("${celula(l, 'valor')}").`)
      return
    }
    const passos: LinhaImportacao['etapas'] = []
    let invalida = false
    for (const [etapaId, i] of idxEtapa) {
      const d = lerData(l[i] ?? '')
      if (d === undefined) invalida = true
      else if (d) passos.push({ etapa_id: etapaId, data: d < recebida ? recebida : d })
    }
    const fat = lerData(celula(l, 'faturado_em'))
    const venc = lerData(celula(l, 'vencimento_em'))
    const pago = lerData(celula(l, 'pago_em'))
    if (invalida || fat === undefined || venc === undefined || pago === undefined) {
      erros.push(`Linha ${nLinha}: data impossível em alguma coluna (confira dia, mês e ano).`)
      return
    }
    // Cobrança e desfecho também são lidos de textos soltos (planilha antiga: "GARANTIA" no boleto, "NÃO FOI APROVADO").
    const textos = [celula(l, 'cobranca'), celula(l, 'faturado_em'), celula(l, 'observacao')]
    const cobranca = lerCobranca(celula(l, 'cobranca')) ?? lerCobranca(celula(l, 'faturado_em')) ?? 'cobrado'
    const desfecho = lerDesfecho(celula(l, 'desfecho')) ?? (textos.map(lerDesfecho).find(Boolean) || null)
    const texto = (c: Coluna, max: number) => celula(l, c).slice(0, max) || null
    linhas.push({
      cliente: texto('cliente', 200),
      nf_cliente: texto('nf_cliente', 40),
      numero_cliente: texto('numero_cliente', 40),
      recebida_em: recebida,
      tipo: texto('tipo', 60),
      modelo: texto('modelo', 120),
      identificacao: texto('identificacao', 120),
      valor,
      observacao: texto('observacao', 2000),
      cobranca,
      desfecho,
      etapas: passos,
      faturado_em: cobranca === 'cobrado' ? fat : null,
      vencimento_em: cobranca === 'cobrado' && fat ? venc : null,
      pago_em: cobranca === 'cobrado' && fat ? pago : null,
    })
  })
  return {
    linhas,
    erros,
    colunasEtapas: etapas.filter((e) => idxEtapa.has(e.id)).map((e) => e.nome),
    ignoradas: cab.filter((h, i) => h.trim() && !usadas.has(i)).map((h) => h.trim()),
  }
}
