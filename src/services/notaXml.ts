// Leitura do XML da NF-e (Entrada por nota, docs/entrada-por-nota.md). Sem IA e sem biblioteca: o XML da nota é
// gerado por sistema e tem estrutura fixa (nfeProc > NFe > infNFe > ide, emit, det*, total). Ignora prefixo de
// namespace (ns:tag) e decodifica as entidades.

export type ItemNota = {
  codigo: string | null
  descricao: string
  ncm: string | null
  unidade: string | null
  quantidade: number | null
  valor_unitario: number | null
  valor_total: number | null
}

export type NotaLida = {
  origem: 'xml' | 'pdf' | 'imagem'
  chave: string | null
  numero: string | null
  serie: string | null
  emissao: string | null
  emitente_cnpj: string | null
  emitente_nome: string | null
  valor_total: number | null
  itens: ItemNota[]
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodificar = (t: string) =>
  t
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTIDADES[e] ?? m),
    )
    .trim()

/** Conteúdo do primeiro <tag> (com ou sem prefixo) dentro de `xml`. */
function bloco(xml: string, tag: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`).exec(xml)
  return m ? m[1] : null
}
function todos(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'g')
  return [...xml.matchAll(re)].map((m) => m[1])
}
const texto = (xml: string | null, tag: string) => {
  const b = xml == null ? null : bloco(xml, tag)
  return b == null ? null : decodificar(b) || null
}
const numero = (xml: string | null, tag: string) => {
  const t = texto(xml, tag)
  const n = t == null ? NaN : Number(t)
  return Number.isFinite(n) ? n : null
}
const semZeros = (t: string | null) => (t ? t.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || null : null)

export function lerNotaXml(xml: string): NotaLida {
  const inf = /<(?:[\w-]+:)?infNFe\b([^>]*)>/.exec(xml)
  if (!inf) throw new Error('Este XML não é de uma NF-e (não achei a tag infNFe).')
  const chave = /Id\s*=\s*"NFe(\d{44})"/.exec(inf[1])?.[1] ?? (texto(xml, 'chNFe')?.replace(/\D/g, '') || null)
  const ide = bloco(xml, 'ide')
  const emit = bloco(xml, 'emit')
  const emissao = (texto(ide, 'dhEmi') ?? texto(ide, 'dEmi'))?.slice(0, 10) ?? null
  const itens = todos(xml, 'det').map((det): ItemNota => {
    const prod = bloco(det, 'prod') ?? det
    const ncm = texto(prod, 'NCM')
    return {
      codigo: texto(prod, 'cProd'),
      descricao: texto(prod, 'xProd') ?? '(sem descrição)',
      ncm: ncm && /^\d{8}$/.test(ncm) ? ncm : null,
      unidade: texto(prod, 'uCom'),
      quantidade: numero(prod, 'qCom'),
      valor_unitario: numero(prod, 'vUnCom'),
      valor_total: numero(prod, 'vProd'),
    }
  })
  if (!itens.length) throw new Error('A nota não tem itens.')
  return {
    origem: 'xml',
    chave: chave && chave.length === 44 ? chave : null,
    numero: semZeros(texto(ide, 'nNF')),
    serie: semZeros(texto(ide, 'serie')),
    emissao: emissao && /^\d{4}-\d{2}-\d{2}$/.test(emissao) ? emissao : null,
    emitente_cnpj: (texto(emit, 'CNPJ') ?? texto(emit, 'CPF'))?.replace(/\D/g, '') || null,
    emitente_nome: texto(emit, 'xNome'),
    valor_total: numero(bloco(xml, 'ICMSTot'), 'vNF'),
    itens,
  }
}
