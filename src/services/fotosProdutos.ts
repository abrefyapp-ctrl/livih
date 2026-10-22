import { supabase } from './supabaseClient'
import { salvarDocumento, TIPO_FOTO, type Documento, type ProdutoLigado } from './documentos'

// Fotos de produto em massa (docs/identificar-produto-foto.md). Cada foto vira um documento "Foto do produto"
// ligado ao produto, achado pelo nome do arquivo (o código do produto) ou pela pasta. O banco põe a foto na fila
// de indexação sozinho (migration 20261022120000): depois disso o agente reconhece o produto pela foto do cliente.

export type Situacao = 'ok' | 'aproximado' | 'sem_produto' | 'repetido' | 'ja_existe' | 'formato'
export type LinhaFoto = { arquivo: File; nome: string; produto: ProdutoLigado | null; situacao: Situacao }

const ACEITOS = ['image/jpeg', 'image/png', 'image/webp']
const LADO_MAXIMO = 1600
const TAMANHO_SEM_REDUZIR = 1.5 * 1024 * 1024

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
/** O código como aparece num nome de arquivo: "/" e os outros caracteres proibidos no Windows viram "-". */
const chaveExata = (t: string) => semAcento(t).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ')
/** Só letras e números: "80 W LS" acha "80/W-LS". Usada só quando a exata não acha, e marcada para conferir. */
const chaveSolta = (t: string) => semAcento(t).replace(/[^a-z0-9]+/g, '')
const semExtensao = (nome: string) => nome.replace(/\.[^.]+$/, '')

/** "GR-123 (2)" → "GR-123": o sufixo que o Windows põe ao renomear vários arquivos de uma vez. */
const semNumeracao = (t: string) => t.replace(/\s*\(\d{1,3}\)\s*$/, '').trim()
/** "GR-123_2", "GR-123-2", "GR-123 2" → "GR-123": só tentado se o nome inteiro não for um código. */
const semSufixo = (t: string) => t.replace(/[\s_-]+\d{1,2}$/, '').trim()

function indice(produtos: ProdutoLigado[], chave: (t: string) => string) {
  const mapa = new Map<string, ProdutoLigado[]>()
  for (const p of produtos) {
    if (!p.codigo?.trim()) continue
    const k = chave(p.codigo)
    if (k) mapa.set(k, [...(mapa.get(k) ?? []), p])
  }
  return mapa
}

/** Casa cada arquivo com um produto. A tela mostra o resultado antes de enviar. */
export function casarFotos(arquivos: File[], produtos: ProdutoLigado[], existentes: Documento[]): { linhas: LinhaFoto[]; ignorados: number } {
  const exata = indice(produtos, chaveExata)
  const solta = indice(produtos, chaveSolta)
  // Já cadastradas: mesmo produto e mesmo nome de arquivo (sem extensão, que muda quando a foto é reduzida).
  const jaTem = new Set(
    existentes
      .filter((d) => d.tipo === TIPO_FOTO)
      .flatMap((d) => d.produtos.map((p) => `${p.id}|${semAcento(semExtensao(d.nome_arquivo))}`)),
  )

  let ignorados = 0
  const linhas: LinhaFoto[] = []
  for (const arquivo of arquivos) {
    const caminho = (arquivo as File & { webkitRelativePath?: string }).webkitRelativePath || arquivo.name
    const heic = /\.(heic|heif)$/i.test(arquivo.name)
    if (!arquivo.type.startsWith('image/') && !heic) {
      ignorados++ // Thumbs.db, desktop.ini, PDFs perdidos na pasta
      continue
    }
    if (!ACEITOS.includes(arquivo.type)) {
      linhas.push({ arquivo, nome: caminho, produto: null, situacao: 'formato' })
      continue
    }

    const base = semNumeracao(semExtensao(arquivo.name))
    const pasta = caminho.split('/').slice(-2, -1)[0]
    const tentativas = [base, semSufixo(base), ...(pasta ? [semNumeracao(pasta), semSufixo(semNumeracao(pasta))] : [])]
    let achados: ProdutoLigado[] | undefined
    let aproximado = false
    for (const t of tentativas) {
      achados = exata.get(chaveExata(t))
      if (achados) break
    }
    if (!achados) {
      for (const t of tentativas) {
        achados = solta.get(chaveSolta(t))
        if (achados) {
          aproximado = true
          break
        }
      }
    }

    if (!achados) linhas.push({ arquivo, nome: caminho, produto: null, situacao: 'sem_produto' })
    else if (achados.length > 1) linhas.push({ arquivo, nome: caminho, produto: null, situacao: 'repetido' })
    else {
      const produto = achados[0]
      const repetida = jaTem.has(`${produto.id}|${semAcento(semExtensao(arquivo.name))}`)
      linhas.push({ arquivo, nome: caminho, produto, situacao: repetida ? 'ja_existe' : aproximado ? 'aproximado' : 'ok' })
    }
  }
  linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
  return { linhas, ignorados }
}

/**
 * Foto de celular tem 4 a 12 MB: reduz para no máximo 1600 px no lado maior, em JPEG. Fica leve para guardar,
 * para a IA comparar e para mandar ao cliente no WhatsApp. Se o navegador não conseguir, sobe a original.
 */
export async function reduzirImagem(f: File): Promise<File> {
  try {
    const imagem = await createImageBitmap(f)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height))
    if (escala === 1 && f.size <= TAMANHO_SEM_REDUZIR) {
      imagem.close()
      return f
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(imagem.width * escala)
    canvas.height = Math.round(imagem.height * escala)
    const ctx = canvas.getContext('2d')
    if (!ctx) return f
    ctx.fillStyle = '#ffffff' // PNG transparente não fica com fundo preto no JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height)
    imagem.close()
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    if (!blob || blob.size >= f.size) return f
    return new File([blob], `${semExtensao(f.name)}.jpg`, { type: 'image/jpeg' })
  } catch {
    return f
  }
}

export async function enviarFoto(orgId: string, linha: LinhaFoto) {
  if (!linha.produto) throw new Error('Foto sem produto.')
  await enviarFotoProduto(orgId, linha.arquivo, linha.produto)
}

/** Uma foto ligada a um produto (envio em massa e "Adicionar foto" na ficha do produto). */
export async function enviarFotoProduto(orgId: string, original: File, produto: ProdutoLigado) {
  if (!ACEITOS.includes(original.type)) throw new Error(`"${original.name}": use JPG, PNG ou WebP.`)
  const arquivo = await reduzirImagem(original)
  await salvarDocumento(
    orgId,
    null,
    { titulo: `Foto — ${produto.nome}`.slice(0, 200), tipo: TIPO_FOTO, descricao: null, palavras_chave: null, fonte_url: null, ativo: true },
    arquivo,
    [produto.id],
  )
}

export type AndamentoFotos = { prontas: number; naFila: number; comErro: number }

/** Quantas fotos da biblioteca já servem para a identificação. */
export async function andamentoFotos(orgId: string): Promise<AndamentoFotos> {
  const contar = async (status: string[]) => {
    const { count, error } = await supabase
      .from('fotos_indice')
      .select('documento_id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', status)
    if (error) throw error
    return count ?? 0
  }
  const [prontas, naFila, comErro] = await Promise.all([contar(['pronto']), contar(['pendente', 'processando']), contar(['erro'])])
  return { prontas, naFila, comErro }
}
