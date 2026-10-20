import type { DadosProduto } from './erp'
import { lerNumero } from './formato'

// Importação de produtos por planilha (CSV). Sem Supabase, para dar para testar fora da tela.
//
// Regra (20/10): a importação ATUALIZA pelo código e só mexe no que veio preenchido. Coluna ausente ou célula vazia
// mantém o valor atual do produto. Antes, planilha sem preço zerava o preço dos produtos já cadastrados, sem estoque
// mínimo apagava o mínimo e sem unidade trocava tudo para "un". Produto novo usa os padrões do cadastro (un, sem
// preço).
//
// Estoque (20/10): coluna Estoque/Quantidade/Saldo = saldo final. Vem à parte (`estoques`, na mesma ordem das linhas)
// e vira ajuste no banco (estoque_definir_saldos). Planilha sem nome, só com código, atualiza o que já está cadastrado.

/** Linha da planilha: sem nome só serve para atualizar um produto que já existe (pelo código). */
export type LinhaPlanilha = Omit<DadosProduto, 'nome'> & { nome?: string }

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
/** Cabeçalho comparável: sem o que vem entre parênteses e sem pontuação ("Preço (R$)" → "preco", "Vlr. Venda" → "vlr venda"). */
const nomeColuna = (h: string) =>
  semAcento(h).replace(/\([^)]*\)/g, ' ').replace(/r\$/g, ' ').replace(/[^a-z0-9_ ]/g, ' ').replace(/\s+/g, ' ').trim()

/** CSV do Excel brasileiro (separado por ; ou ,), com aspas. */
export function lerCsv(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ','
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === sep) {
      linha.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo)
      if (linha.some((x) => x.trim())) linhas.push(linha)
      linha = []
      campo = ''
    } else campo += c
  }
  linha.push(campo)
  if (linha.some((x) => x.trim())) linhas.push(linha)
  return linhas
}

type ColunaPlanilha =
  | 'codigo' | 'nome' | 'unidade' | 'preco' | 'estoque_minimo' | 'categoria' | 'marca' | 'ncm' | 'descricao' | 'controla_estoque'
  | 'estoque'
const COLUNAS: Record<ColunaPlanilha, string[]> = {
  codigo: ['codigo', 'cod', 'sku', 'referencia', 'ref'],
  nome: ['nome', 'produto', 'descricao', 'item'],
  unidade: ['unidade', 'un', 'und', 'medida'],
  preco: [
    'preco', 'valor', 'preco de venda', 'preco venda', 'valor de venda', 'valor venda', 'vlr venda', 'preco unitario',
    'valor unitario', 'vlr unitario', 'preco tabela', 'preco de tabela', 'preco final',
  ],
  estoque_minimo: ['estoque minimo', 'estoque_minimo', 'minimo'],
  categoria: ['categoria', 'familia', 'grupo', 'linha'],
  marca: ['marca', 'fabricante', 'fornecedor'],
  ncm: ['ncm'],
  // "descricao" já é sinônimo de nome (planilhas antigas); o texto longo vem em "detalhes".
  descricao: ['detalhes', 'especificacoes', 'observacoes'],
  controla_estoque: ['controla estoque', 'controla_estoque', 'estoque controlado'],
  estoque: ['estoque', 'quantidade', 'saldo', 'estoque atual', 'qtd', 'quantidade em estoque'],
}

/** sim/não, s/n, 1/0, x; vazio → null; outra coisa → undefined. */
function lerSimNao(v: string): boolean | null | undefined {
  const t = semAcento(v)
  if (!t) return null
  if (['sim', 's', '1', 'x', 'true'].includes(t)) return true
  if (['nao', 'n', '0', 'false'].includes(t)) return false
  return undefined
}

/** "8467.19.00" → "84671900"; vazio → null; inválido → undefined. */
export function lerNcm(v: string): string | null | undefined {
  const d = v.replace(/\D/g, '')
  if (!d) return null
  return d.length === 8 ? d : undefined
}

export function planilhaParaProdutos(texto: string): { linhas: LinhaPlanilha[]; erros: string[]; estoques: (number | null)[] } {
  const [cab, ...resto] = lerCsv(texto.replace(/^\uFEFF/, ''))
  const erros: string[] = []
  if (!cab) return { linhas: [], erros: ['A planilha está vazia.'], estoques: [] }
  const idx = Object.fromEntries(
    Object.entries(COLUNAS).map(([campo, nomes]) => [campo, cab.findIndex((h) => nomes.includes(nomeColuna(h)))]),
  ) as Record<ColunaPlanilha, number>
  if (idx.nome < 0 && idx.codigo < 0) {
    return { linhas: [], erros: ['Falta a coluna "nome" (ou "produto") ou "código" no cabeçalho.'], estoques: [] }
  }
  // Só código e nada que dê para atualizar (ex.: "Preço (R$)" antes de 20/10): avisa em vez de importar sem mudar nada.
  if (idx.nome < 0 && Object.entries(idx).every(([c, i]) => c === 'codigo' || i < 0)) {
    const outras = cab.filter((_, i) => i !== idx.codigo).map((h) => `"${h.trim()}"`).join(', ')
    return {
      linhas: [],
      erros: [`Nenhuma coluna para atualizar foi reconhecida${outras ? ` (${outras})` : ''}. Use, por exemplo, "Preço", "Estoque" ou "Categoria".`],
      estoques: [],
    }
  }
  // Célula da coluna (vazia se a coluna não existe).
  const celula = (l: string[], c: ColunaPlanilha) => (idx[c] >= 0 ? (l[idx[c]] ?? '').trim() : '')

  const linhas: LinhaPlanilha[] = []
  const estoques: (number | null)[] = []
  resto.forEach((l) => {
    const nome = celula(l, 'nome')
    const codigoCelula = celula(l, 'codigo')
    if (!nome && !codigoCelula) return
    const identificacao = nome || codigoCelula
    const preco = lerNumero(celula(l, 'preco').replace(/r\$\s*/i, ''))
    const minimo = lerNumero(celula(l, 'estoque_minimo'))
    const ncm = lerNcm(celula(l, 'ncm'))
    const controla = lerSimNao(celula(l, 'controla_estoque'))
    const estoque = lerNumero(celula(l, 'estoque'))
    if (preco === undefined || minimo === undefined || ncm === undefined || controla === undefined) {
      erros.push(`"${identificacao}": preço, estoque mínimo, NCM ou "controla estoque" inválido.`)
      return
    }
    if (estoque === undefined || (estoque !== null && estoque < 0)) {
      erros.push(`"${identificacao}": estoque inválido.`)
      return
    }
    const texto = (c: ColunaPlanilha, max: number) => celula(l, c).slice(0, max) || null
    // Só entra o que veio preenchido: o resto fica como está no cadastro (ou no padrão, se o produto for novo).
    const linha: LinhaPlanilha = nome ? { nome: nome.slice(0, 200) } : {}
    if (texto('codigo', 60)) linha.codigo = texto('codigo', 60)
    if (texto('unidade', 10)) linha.unidade = texto('unidade', 10)!
    if (preco !== null) linha.preco = preco
    if (minimo !== null) linha.estoque_minimo = minimo
    if (texto('categoria', 100)) linha.categoria = texto('categoria', 100)
    if (texto('marca', 100)) linha.marca = texto('marca', 100)
    if (ncm) linha.ncm = ncm
    if (texto('descricao', 2000)) linha.descricao = texto('descricao', 2000)
    if (controla !== null) linha.controla_estoque = controla
    linhas.push(linha)
    estoques.push(estoque)
  })
  return { linhas, erros, estoques }
}
