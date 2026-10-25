import { BOM } from './planilhaOs'
import { lerCsv } from './planilhaProdutos'

// Importação de clientes por planilha (CSV do Excel), docs/clientes.md, entrega 4. Sem Supabase, para dar para testar
// fora da tela. A tela mostra a prévia; o banco (clientes_importar) acha pelo CNPJ/CPF, atualiza só o que veio
// preenchido e cria o resto.

export type LinhaCliente = {
  tipo: string | null
  nome: string | null
  razao_social: string | null
  documento: string | null
  inscricao_estadual: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  email: string | null
  telefone: string | null
  observacoes: string | null
  celular: string | null
  contato: string | null
}
type Coluna = keyof LinhaCliente

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const nomeColuna = (h: string) => semAcento(h).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

// Nomes que as planilhas costumam usar (sem acento, minúsculas). A primeira coluna que bater fica.
const COLUNAS: Record<Coluna, string[]> = {
  tipo: ['tipo', 'tipo de pessoa', 'pessoa'],
  nome: ['nome fantasia', 'fantasia', 'nome', 'cliente', 'apelido'],
  razao_social: ['razao social', 'razao', 'nome empresarial'],
  documento: ['cnpj', 'cpf', 'cnpj cpf', 'cpf cnpj', 'documento', 'cnpj ou cpf', 'cpf ou cnpj'],
  inscricao_estadual: ['inscricao estadual', 'ie', 'insc estadual', 'i e'],
  cep: ['cep'],
  logradouro: ['endereco', 'logradouro', 'rua', 'avenida'],
  numero: ['numero', 'n', 'no', 'nro', 'num'],
  complemento: ['complemento', 'compl'],
  bairro: ['bairro'],
  cidade: ['cidade', 'municipio'],
  uf: ['uf', 'estado'],
  email: ['email', 'e mail', 'email nfe', 'email da nota'],
  telefone: ['telefone', 'fone', 'telefone fixo', 'tel'],
  observacoes: ['observacoes', 'observacao', 'obs'],
  celular: ['celular', 'whatsapp', 'whats', 'celular whatsapp'],
  contato: ['contato', 'nome do contato', 'comprador', 'responsavel'],
}

const ROTULOS: Record<Coluna, string> = {
  tipo: 'Tipo (PJ/PF)', nome: 'Nome fantasia', razao_social: 'Razão social', documento: 'CNPJ/CPF',
  inscricao_estadual: 'Inscrição estadual', cep: 'CEP', logradouro: 'Endereço', numero: 'Número', complemento: 'Complemento',
  bairro: 'Bairro', cidade: 'Cidade', uf: 'UF', email: 'E-mail', telefone: 'Telefone', observacoes: 'Observações',
  celular: 'Celular (WhatsApp)', contato: 'Nome do contato',
}
const ORDEM_MODELO: Coluna[] = [
  'nome', 'razao_social', 'documento', 'inscricao_estadual', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
  'email', 'telefone', 'contato', 'celular', 'observacoes',
]

export type LeituraClientes = {
  linhas: LinhaCliente[]
  /** Colunas reconhecidas (rótulo do Livih → cabeçalho da planilha). */
  reconhecidas: { coluna: string; cabecalho: string }[]
  ignoradas: string[]
  /** Linhas sem nome nem documento (não vão para o banco). */
  vazias: number
}

export function planilhaParaClientes(texto: string): LeituraClientes {
  const tabela = lerCsv(texto.startsWith(BOM) ? texto.slice(1) : texto)
  const [cab = [], ...corpo] = tabela
  const normalizados = cab.map(nomeColuna)
  const indice = new Map<Coluna, number>()
  const usadas = new Set<number>()
  // Nomes mais específicos primeiro ("nome fantasia" antes de "nome", "razao social" antes de tudo).
  const ordem: Coluna[] = ['razao_social', 'documento', 'inscricao_estadual', 'celular', 'contato', 'nome', ...(Object.keys(COLUNAS) as Coluna[])]
  for (const c of ordem) {
    if (indice.has(c)) continue
    for (const nome of COLUNAS[c]) {
      const i = normalizados.findIndex((h, k) => !usadas.has(k) && h === nome)
      if (i >= 0) {
        indice.set(c, i)
        usadas.add(i)
        break
      }
    }
  }

  let vazias = 0
  const linhas: LinhaCliente[] = []
  for (const l of corpo) {
    const v = (c: Coluna) => {
      const i = indice.get(c)
      const t = i == null ? '' : (l[i] ?? '').trim()
      return t || null
    }
    const linha = Object.fromEntries((Object.keys(COLUNAS) as Coluna[]).map((c) => [c, v(c)])) as LinhaCliente
    if (!linha.nome && !linha.razao_social && !linha.documento) {
      vazias++
      continue
    }
    linhas.push(linha)
  }
  return {
    linhas,
    reconhecidas: [...indice.entries()].map(([c, i]) => ({ coluna: ROTULOS[c], cabecalho: cab[i].trim() })),
    ignoradas: cab.filter((h, i) => h.trim() && !usadas.has(i)).map((h) => h.trim()),
    vazias,
  }
}

/** Modelo para baixar: cabeçalho e uma linha de exemplo, separado por ponto e vírgula (abre certo no Excel). */
export function modeloPlanilhaClientes(): string {
  const exemplo: Partial<Record<Coluna, string>> = {
    nome: 'Metalúrgica Exemplo', razao_social: 'Exemplo Indústria de Metais Ltda', documento: '11.222.333/0001-81',
    inscricao_estadual: 'ISENTO', cep: '80010-000', logradouro: 'Rua XV de Novembro', numero: '100', bairro: 'Centro',
    cidade: 'Curitiba', uf: 'PR', email: 'compras@exemplo.com.br', contato: 'Maria (compras)', celular: '(41) 99999-0000',
  }
  const celula = (t: string) => (/[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)
  return BOM + [ORDEM_MODELO.map((c) => ROTULOS[c]), ORDEM_MODELO.map((c) => exemplo[c] ?? '')].map((l) => l.map(celula).join(';')).join('\r\n')
}
