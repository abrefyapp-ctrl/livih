import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Produto } from './erp'
import { lerNotaXml, type ItemNota, type NotaLida } from './notaXml'
import { supabase } from './supabaseClient'

// Entrada por nota (docs/entrada-por-nota.md): XML lido aqui; PDF e foto pela Edge Function ler-nota. O lançamento é
// uma transação no banco (nota_entrada_lancar, migration 20261021130000).

export type { ItemNota, NotaLida }

export const ACEITOS_NOTA = '.xml,.pdf,.jpg,.jpeg,.png,.webp,text/xml,application/xml,application/pdf,image/*'
export const LIMITE_NOTA = 20 * 1024 * 1024

const MIME: Record<string, string> = {
  xml: 'application/xml',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/** Guarda o arquivo da nota (auditoria) e devolve os dados lidos e o caminho. */
export async function lerNota(orgId: string, arquivo: File): Promise<{ nota: NotaLida; path: string }> {
  const ext = arquivo.name.split('.').pop()?.toLowerCase() ?? ''
  if (!MIME[ext]) throw new Error('Use o XML da nota, o PDF (DANFE) ou uma foto (JPG, PNG).')
  if (arquivo.size > LIMITE_NOTA) throw new Error('Arquivo grande demais (até 20 MB).')
  // XML: lê antes de subir, para avisar na hora se não for uma NF-e.
  const doXml = ext === 'xml' ? lerNotaXml(await arquivo.text()) : null

  const chave = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)
  const path = `${orgId}/${crypto.randomUUID()}-${chave}`
  const { error } = await supabase.storage.from('notas-entrada').upload(path, arquivo, { contentType: MIME[ext], upsert: false })
  if (error) throw new Error('Não foi possível subir o arquivo. Tente de novo.')
  if (doXml) return { nota: doXml, path }

  const { data, error: erroIa } = await supabase.functions.invoke('ler-nota', { body: { org_id: orgId, path } })
  if (erroIa) {
    const r = erroIa instanceof FunctionsHttpError ? await erroIa.context.json().catch(() => null) : null
    throw new Error(r?.erro ?? 'Não foi possível ler a nota. Tente de novo.')
  }
  return { nota: (data as { nota: NotaLida }).nota, path }
}

export type Vinculo = { codigo_fornecedor: string; produto_id: string; fator: number }

/** Itens desse fornecedor já ligados a produtos em notas anteriores. */
export async function vinculosDoFornecedor(orgId: string, cnpj: string): Promise<Vinculo[]> {
  const { data, error } = await supabase
    .from('produtos_fornecedores')
    .select('codigo_fornecedor, produto_id, fator')
    .eq('org_id', orgId)
    .eq('fornecedor_cnpj', cnpj)
  if (error) throw error
  return (data ?? []).map((v) => ({ ...v, fator: Number(v.fator) }))
}

/** Data em que a nota já foi lançada (pela chave), ou null. */
export async function notaJaLancada(orgId: string, chave: string): Promise<string | null> {
  const { data } = await supabase.from('notas_entrada').select('criado_em').eq('org_id', orgId).eq('chave', chave).maybeSingle()
  return data?.criado_em ?? null
}

export async function ultimoCusto(produtoId: string): Promise<{ custo: number; atualizado_em: string } | null> {
  const { data } = await supabase.from('produtos_custos').select('custo, atualizado_em').eq('produto_id', produtoId).maybeSingle()
  return data ? { custo: Number(data.custo), atualizado_em: data.atualizado_em } : null
}

// ---- revisão ----

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const palavras = (t: string) => new Set(normal(t).split(/[^a-z0-9/.,-]+/).filter((p) => p.length > 1))

export type Destino =
  | { tipo: 'produto'; produtoId: string; fator: number; origem: 'vinculo' | 'codigo' | 'nome' | 'escolha' }
  | { tipo: 'novo'; nome: string; codigo: string; unidade: string }
  | { tipo: 'ignorar' }

/** Primeira sugestão para cada item: vínculo salvo, depois código igual, depois nome igual; senão, produto novo. */
export function sugerirDestino(item: ItemNota, vinculos: Map<string, Vinculo>, porCodigo: Map<string, Produto>, porNome: Map<string, Produto>): Destino {
  const v = item.codigo ? vinculos.get(item.codigo.toLowerCase()) : undefined
  if (v) return { tipo: 'produto', produtoId: v.produto_id, fator: v.fator, origem: 'vinculo' }
  const c = item.codigo ? porCodigo.get(item.codigo.toLowerCase()) : undefined
  if (c) return { tipo: 'produto', produtoId: c.id!, fator: 1, origem: 'codigo' }
  const n = porNome.get(normal(item.descricao))
  if (n) return { tipo: 'produto', produtoId: n.id!, fator: 1, origem: 'nome' }
  return {
    tipo: 'novo',
    nome: item.descricao.slice(0, 200),
    // O código do fornecedor só vira código do produto se não estiver em uso no cadastro.
    codigo: item.codigo && !porCodigo.has(item.codigo.toLowerCase()) ? item.codigo : '',
    unidade: (item.unidade ?? 'un').toLowerCase().slice(0, 10),
  }
}

/** Até 3 produtos com nome parecido (palavras em comum), para ligar em vez de criar outro. */
export function parecidos(descricao: string, produtos: Produto[]): Produto[] {
  const alvo = palavras(descricao)
  if (!alvo.size) return []
  return produtos
    .map((p) => {
      const ps = palavras(p.nome ?? '')
      let comum = 0
      for (const w of alvo) if (ps.has(w)) comum++
      return { p, nota: comum / Math.max(alvo.size, ps.size) }
    })
    .filter((x) => x.nota >= 0.5)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, 3)
    .map((x) => x.p)
}

export async function lancarNota(orgId: string, nota: NotaLida, path: string, itens: { item: ItemNota; destino: Destino }[]) {
  const corpo = itens
    .filter((x) => x.destino.tipo !== 'ignorar')
    .map(({ item, destino }) => ({
      produto_id: destino.tipo === 'produto' ? destino.produtoId : null,
      novo: destino.tipo === 'novo' ? { nome: destino.nome, codigo: destino.codigo || null, unidade: destino.unidade, ncm: item.ncm } : null,
      fator: destino.tipo === 'produto' ? destino.fator : 1,
      codigo_fornecedor: item.codigo,
      descricao: item.descricao,
      unidade: item.unidade,
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario,
      valor_total: item.valor_total,
      ncm: item.ncm,
    }))
  const { data, error } = await supabase.rpc('nota_entrada_lancar', {
    p_org: orgId,
    p_nota: {
      chave: nota.chave,
      numero: nota.numero,
      serie: nota.serie,
      emissao: nota.emissao,
      emitente_cnpj: nota.emitente_cnpj,
      emitente_nome: nota.emitente_nome,
      valor_total: nota.valor_total,
      origem: nota.origem,
      arquivo_path: path,
    },
    p_itens: corpo,
  })
  if (error) {
    const m = error.message
    if (/esta nota já foi lançada|quantidade inválida|item sem produto|a nota não tem itens/.test(m)) {
      throw new Error(m.charAt(0).toUpperCase() + m.slice(1) + '.')
    }
    if (m.includes('produtos_codigo_unico')) throw new Error('Um produto novo usa um código que já existe no cadastro. Troque o código.')
    throw new Error('Não foi possível lançar a nota. Tente de novo.')
  }
  return data as { nota_id: string; itens: number; criados: number; unidades: number }
}
