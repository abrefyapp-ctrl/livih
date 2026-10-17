import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

// Biblioteca de documentos (migration 20261016150000, docs/biblioteca-documentos.md). Arquivo no bucket privado
// `documentos` (org/documento/arquivo). Dono/admin cadastram; toda a equipe vê e envia na conversa.

export type DocumentoRow = Database['public']['Tables']['documentos']['Row']
export type ProdutoLigado = { id: string; nome: string; codigo: string | null }
export type Documento = DocumentoRow & { produtos: ProdutoLigado[] }
export type CamposDocumento = Pick<DocumentoRow, 'titulo' | 'tipo' | 'descricao' | 'palavras_chave' | 'fonte_url' | 'ativo'>

export const LIMITE_DOCUMENTO = 50 * 1024 * 1024
export const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4']
/** Sugestões para o campo Tipo; os já usados pela empresa entram junto. */
export const TIPOS_SUGERIDOS = ['Vista explodida', 'Manual', 'Catálogo', 'Ficha técnica', 'Tabela de preços', 'Certificado de garantia']

/** A chave do storage não aceita qualquer caractere; o nome original fica no cadastro. */
const chave = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .slice(-80) || 'arquivo'

export async function listarDocumentos(orgId: string): Promise<Documento[]> {
  const [docs, ligacoes] = await Promise.all([
    supabase.from('documentos').select('*').eq('org_id', orgId).order('titulo'),
    supabase.from('documentos_produtos').select('documento_id, produto_id').eq('org_id', orgId),
  ])
  if (docs.error) throw docs.error
  if (ligacoes.error) throw ligacoes.error
  const ids = [...new Set((ligacoes.data ?? []).map((l) => l.produto_id))]
  const produtos = new Map<string, ProdutoLigado>()
  if (ids.length) {
    const { data, error } = await supabase.from('produtos').select('id, nome, codigo').in('id', ids)
    if (error) throw error
    for (const p of data ?? []) produtos.set(p.id, p)
  }
  return (docs.data ?? []).map((d) => ({
    ...d,
    produtos: (ligacoes.data ?? [])
      .filter((l) => l.documento_id === d.id)
      .map((l) => produtos.get(l.produto_id))
      .filter((p): p is ProdutoLigado => !!p),
  }))
}

/** Cria ou atualiza. Arquivo novo: sobe antes de gravar e apaga o anterior depois (o que já foi enviado tem cópia). */
export async function salvarDocumento(
  orgId: string,
  atual: Documento | null,
  campos: CamposDocumento,
  arquivo: File | null,
  produtoIds: string[],
): Promise<void> {
  const id = atual?.id ?? crypto.randomUUID()
  let dadosArquivo: Pick<DocumentoRow, 'path' | 'nome_arquivo' | 'mime' | 'tamanho'> | null = null
  if (arquivo) {
    const path = `${orgId}/${id}/${Date.now()}-${chave(arquivo.name)}`
    const { error } = await supabase.storage
      .from('documentos')
      .upload(path, arquivo, { contentType: arquivo.type || 'application/octet-stream', upsert: false })
    if (error) throw new Error('Não foi possível subir o arquivo. Confira o formato (PDF, imagem ou MP4) e o tamanho (até 50 MB).')
    dadosArquivo = { path, nome_arquivo: arquivo.name.slice(0, 200), mime: arquivo.type || 'application/octet-stream', tamanho: arquivo.size }
  }

  if (atual) {
    const { error } = await supabase.from('documentos').update({ ...campos, ...dadosArquivo }).eq('id', id)
    if (error) throw new Error('Não foi possível salvar o documento. Tente de novo.')
    if (dadosArquivo) await supabase.storage.from('documentos').remove([atual.path])
  } else {
    if (!dadosArquivo) throw new Error('Escolha o arquivo.')
    const { error } = await supabase.from('documentos').insert({ id, org_id: orgId, ...campos, ...dadosArquivo })
    if (error) {
      await supabase.storage.from('documentos').remove([dadosArquivo.path])
      throw new Error('Não foi possível salvar o documento. Tente de novo.')
    }
  }

  const antes = new Set(atual?.produtos.map((p) => p.id) ?? [])
  const depois = new Set(produtoIds)
  const sair = [...antes].filter((p) => !depois.has(p))
  const entrar = [...depois].filter((p) => !antes.has(p))
  if (sair.length) {
    const { error } = await supabase.from('documentos_produtos').delete().eq('documento_id', id).in('produto_id', sair)
    if (error) throw new Error('O documento foi salvo, mas não deu para atualizar os produtos ligados.')
  }
  if (entrar.length) {
    const { error } = await supabase
      .from('documentos_produtos')
      .insert(entrar.map((produto_id) => ({ documento_id: id, produto_id, org_id: orgId })))
    if (error) throw new Error('O documento foi salvo, mas não deu para ligar os produtos.')
  }
}

export async function removerDocumento(doc: Documento) {
  const { error } = await supabase.from('documentos').delete().eq('id', doc.id)
  if (error) throw new Error('Não foi possível remover o documento.')
  await supabase.storage.from('documentos').remove([doc.path])
}

/** Documentos ligados a um produto (modal do produto). */
export async function documentosDoProduto(produtoId: string): Promise<DocumentoRow[]> {
  const { data: ligacoes, error } = await supabase.from('documentos_produtos').select('documento_id').eq('produto_id', produtoId)
  if (error) throw error
  const ids = (ligacoes ?? []).map((l) => l.documento_id)
  if (!ids.length) return []
  const { data, error: erroDocs } = await supabase.from('documentos').select('*').in('id', ids).order('titulo')
  if (erroDocs) throw erroDocs
  return data ?? []
}

/** URL temporária para conferir o arquivo. */
export async function urlDocumento(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

/**
 * Equipe envia da biblioteca: copia para a pasta da conversa (o histórico guarda a cópia, como o agente faz) e segue
 * pelo envio de arquivo de sempre. Se a cópia entre buckets falhar, baixa e sobe de novo.
 */
export async function enviarDocumento(orgId: string, conversaId: string, doc: Documento) {
  const destino = `${orgId}/${conversaId}/${crypto.randomUUID()}-${chave(doc.nome_arquivo)}`
  const copia = await supabase.storage.from('documentos').copy(doc.path, destino, { destinationBucket: 'midias' })
  if (copia.error) {
    const { data, error } = await supabase.storage.from('documentos').download(doc.path)
    if (error) throw error
    const subida = await supabase.storage.from('midias').upload(destino, data, { contentType: doc.mime, upsert: false })
    if (subida.error) throw subida.error
  }
  const { data: mensagem, error } = await supabase.rpc('enviar_arquivo', {
    p_conversa: conversaId,
    p_path: destino,
    p_nome: doc.nome_arquivo,
    p_legenda: doc.titulo,
  })
  if (error) throw error
  // O registro só alimenta o "já enviado" do agente: se falhar, o arquivo já foi.
  await supabase.rpc('registrar_envio_documento', { p_documento: doc.id, p_mensagem: mensagem })
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Filtro da tela: todas as palavras em título, tipo, descrição, palavras-chave ou produtos ligados. */
export function filtrarDocumentos(lista: Documento[], busca: string): Documento[] {
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean)
  if (!palavras.length) return lista
  return lista.filter((d) => {
    const texto = semAcento(
      [d.titulo, d.tipo, d.descricao, d.palavras_chave, ...d.produtos.flatMap((p) => [p.nome, p.codigo])].filter(Boolean).join(' '),
    )
    return palavras.every((p) => texto.includes(p))
  })
}

export function tamanhoLegivel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
