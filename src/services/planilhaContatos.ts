import { BOM } from './planilhaOs'
import { lerCsv } from './planilhaProdutos'

// Importação e exportação de contatos por planilha (CSV do Excel), docs/crm-acompanhamento.md, entrega 4. Sem
// Supabase, para dar para testar fora da tela. O banco (contatos_importar) acha pelo celular, atualiza só o que veio
// preenchido e soma as etiquetas.

export type LinhaContato = {
  nome: string | null
  telefone: string | null
  email: string | null
  empresa: string | null
  etiquetas: string | null
  vendedor: string | null
}
type Coluna = keyof LinhaContato

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const nomeColuna = (h: string) => semAcento(h).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

// Nomes que as planilhas costumam usar (sem acento, minúsculas). A primeira coluna que bater fica.
const COLUNAS: Record<Coluna, string[]> = {
  telefone: ['celular', 'whatsapp', 'whats', 'telefone', 'fone', 'celular whatsapp', 'numero', 'tel'],
  nome: ['nome', 'contato', 'nome do contato', 'cliente'],
  email: ['email', 'e mail'],
  empresa: ['empresa', 'razao social', 'nome fantasia', 'fantasia'],
  etiquetas: ['etiquetas', 'etiqueta', 'tags', 'tag', 'grupo', 'segmento'],
  vendedor: ['vendedor', 'responsavel', 'email do vendedor', 'carteira'],
}

const ROTULOS: Record<Coluna, string> = {
  nome: 'Nome',
  telefone: 'Celular (WhatsApp)',
  email: 'E-mail',
  empresa: 'Empresa',
  etiquetas: 'Etiquetas',
  vendedor: 'Vendedor (e-mail)',
}
const ORDEM: Coluna[] = ['nome', 'telefone', 'email', 'empresa', 'etiquetas', 'vendedor']

export type LeituraContatos = {
  linhas: LinhaContato[]
  /** Colunas reconhecidas (rótulo da Livih → cabeçalho da planilha). */
  reconhecidas: { coluna: string; cabecalho: string }[]
  ignoradas: string[]
  /** Linhas sem celular (não vão para o banco). */
  semCelular: number
}

export function planilhaParaContatos(texto: string): LeituraContatos {
  const tabela = lerCsv(texto.startsWith(BOM) ? texto.slice(1) : texto)
  const [cab = [], ...corpo] = tabela
  const normalizados = cab.map(nomeColuna)
  const indice = new Map<Coluna, number>()
  const usadas = new Set<number>()
  // O celular primeiro (é a chave); "empresa" antes de "nome" ("nome fantasia" é da empresa, não da pessoa).
  for (const c of ['telefone', 'vendedor', 'empresa', 'email', 'etiquetas', 'nome'] as Coluna[]) {
    for (const nome of COLUNAS[c]) {
      const i = normalizados.findIndex((h, k) => !usadas.has(k) && h === nome)
      if (i >= 0) {
        indice.set(c, i)
        usadas.add(i)
        break
      }
    }
  }

  let semCelular = 0
  const linhas: LinhaContato[] = []
  for (const l of corpo) {
    const v = (c: Coluna) => {
      const i = indice.get(c)
      const t = i == null ? '' : (l[i] ?? '').trim()
      return t || null
    }
    const linha = Object.fromEntries(ORDEM.map((c) => [c, v(c)])) as LinhaContato
    if (!linha.telefone) {
      if (Object.values(linha).some(Boolean)) semCelular++
      continue
    }
    linhas.push(linha)
  }
  return {
    linhas,
    reconhecidas: [...indice.entries()].map(([c, i]) => ({ coluna: ROTULOS[c], cabecalho: cab[i].trim() })),
    ignoradas: cab.filter((h, i) => h.trim() && !usadas.has(i)).map((h) => h.trim()),
    semCelular,
  }
}

const celula = (t: string) => (/[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)

/** CSV separado por ponto e vírgula, com BOM: abre certo no Excel em português. */
export function csv(cabecalho: string[], linhas: (string | number | null | undefined)[][]): string {
  return BOM + [cabecalho, ...linhas.map((l) => l.map((v) => (v == null ? '' : String(v))))].map((l) => l.map(celula).join(';')).join('\r\n')
}

/** Baixa um texto como arquivo. */
export function baixarArquivo(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  a.download = nome
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Modelo para baixar: cabeçalho e uma linha de exemplo. */
export function modeloPlanilhaContatos(): string {
  return csv(
    ORDEM.map((c) => ROTULOS[c]),
    [['Maria Souza', '(41) 99999-0000', 'maria@exemplo.com.br', 'Loja Exemplo', 'cliente; atacado', 'vendedor@suaempresa.com.br']],
  )
}
