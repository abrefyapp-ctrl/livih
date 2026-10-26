// Saúde do agente (docs/saude-do-agente.md): quanto o agente lê a cada resposta e o que está pesando. Só regras fixas,
// sem IA e sem banco: as funções daqui são puras (o carregamento fica em saudeAgenteDados.ts).

/** Caracteres por token medidos na JoGrampo em 15/10 (233 mil caracteres ≈ 50 mil tokens). */
export const CARACTERES_POR_TOKEN = 4.5
/**
 * Texto fixo do sistema (bloco do CRM, regras de arquivos, horário, dados do contato) mais a definição das
 * ferramentas. Medido em 16/10 na JoGrampo: o lido de fato menos instruções, regras, base e histórico (10 mil),
 * mais ~1,5 mil das ferramentas de documentos (buscar_documentos, enviar_documento) e da regra delas.
 */
export const PARTE_FIXA = 11_500
export const HISTORICO_PADRAO = 3_000
export const CHAMADAS_PADRAO = 1.6
/** Mesmo câmbio do painel de uso da plataforma. */
export const CAMBIO = 5.5

export const LIMITE_VERDE = 40_000
export const LIMITE_AMARELO = 100_000

export type ParteId = 'instrucoes' | 'regras' | 'base' | 'fixa' | 'historico'
export type Parte = { id: ParteId; rotulo: string; caracteres: number }
export type Faixa = 'verde' | 'amarelo' | 'vermelho'

export type AgenteSaude = { prompt: string; casos: string[]; ativo: boolean }
export type ItemBase = { id: string; titulo: string; conteudo: string; ativo: boolean }

export type Alvo = { tipo: 'prompt' } | { tipo: 'regras' } | { tipo: 'base'; id: string }
export type Acao = 'limpar' | 'desativar' | 'produtos' | 'editar'
export type Alerta = {
  codigo: 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6'
  /** Única na lista (código + alvo), para chave do React e para não repetir. */
  chave: string
  titulo: string
  mensagem: string
  /** Caracteres que deixam de ser lidos a cada chamada se o alerta for resolvido (0 quando não dá para estimar). */
  economia: number
  alvo: Alvo | null
  acao: Acao | null
  exemplos?: string[]
}

const mil = (n: number) => `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: n < 10_000 ? 1 : 0 })} mil`

export function medir(agente: AgenteSaude | null, base: ItemBase[], historico = HISTORICO_PADRAO): Parte[] {
  return [
    { id: 'instrucoes', rotulo: 'Instruções', caracteres: agente?.prompt.length ?? 0 },
    { id: 'regras', rotulo: 'Quando chamar a equipe', caracteres: (agente?.casos ?? []).reduce((s, c) => s + c.length, 0) },
    { id: 'base', rotulo: 'Base de conhecimento', caracteres: base.filter((b) => b.ativo).reduce((s, b) => s + b.conteudo.length, 0) },
    { id: 'fixa', rotulo: 'Parte fixa da Livih', caracteres: PARTE_FIXA },
    { id: 'historico', rotulo: 'Conversa (histórico)', caracteres: Math.round(historico) },
  ]
}

export const total = (partes: Parte[]) => partes.reduce((s, p) => s + p.caracteres, 0)

export function faixa(caracteres: number): Faixa {
  if (caracteres <= LIMITE_VERDE) return 'verde'
  if (caracteres <= LIMITE_AMARELO) return 'amarelo'
  return 'vermelho'
}

/** Custo de entrada em R$ por resposta: chamadas × tokens × preço. A saída (~50 tokens) é desprezível. */
export function estimarCusto(caracteres: number, chamadas: number, usdPorMilhaoEntrada: number): number {
  return ((chamadas * caracteres) / CARACTERES_POR_TOKEN) * (usdPorMilhaoEntrada / 1e6) * CAMBIO
}

// ---------------------------------------------------------------- separadores (A3)

const SEPARADOR = /^\s*[=\-_*~#]{5,}\s*$/

/** Tira as linhas só de decoração (===, -----, #####) e junta quebras de linha triplas. Mesma regra de 15/10. */
export function limparSeparadores(texto: string): { texto: string; removidos: number; linhas: string[] } {
  const linhas: string[] = []
  const limpo = texto
    .split('\n')
    .filter((l) => (SEPARADOR.test(l) ? (linhas.push(l), false) : true))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
  return { texto: limpo, removidos: texto.length - limpo.length, linhas }
}

/** Regras de chamar a equipe: limpa cada uma e descarta as que eram só separador. */
export function limparCasos(casos: string[]): { casos: string[]; removidos: number; linhas: string[] } {
  const linhas: string[] = []
  const limpos: string[] = []
  for (const c of casos) {
    const r = limparSeparadores(c)
    linhas.push(...r.linhas)
    if (r.texto.trim()) limpos.push(r.texto.trim())
  }
  const antes = casos.reduce((s, c) => s + c.length, 0)
  return { casos: limpos, removidos: antes - limpos.reduce((s, c) => s + c.length, 0), linhas }
}

// ---------------------------------------------------------------- comparação de textos (A2, A5)

const normalizarLinha = (l: string) => l.trim().toLowerCase().replace(/\s+/g, ' ')
const linhasLongas = (t: string) => new Set(t.split('\n').map(normalizarLinha).filter((l) => l.length > 30))

/** Palavras com a forma original (para mostrar) e a normalizada (para comparar). */
function palavras(t: string) {
  return t
    .split(/\s+/)
    .map((original) => ({ original, chave: original.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') }))
    .filter((p) => p.chave)
}

const TAM_TRECHO = 8
const trechos = (ps: { chave: string }[]) => {
  const s = new Set<string>()
  for (let i = 0; i + TAM_TRECHO <= ps.length; i++) s.add(ps.slice(i, i + TAM_TRECHO).map((p) => p.chave).join(' '))
  return s
}

/** Quanto do texto `a` aparece em `b` (sequências de 8 palavras), com os trechos repetidos mais longos de `a`. */
function repeticao(a: string, b: string) {
  const pa = palavras(a)
  const tb = trechos(palavras(b))
  const coberta = new Array<boolean>(pa.length).fill(false)
  let comuns = 0
  let totalTrechos = 0
  for (let i = 0; i + TAM_TRECHO <= pa.length; i++) {
    totalTrechos++
    if (tb.has(pa.slice(i, i + TAM_TRECHO).map((p) => p.chave).join(' '))) {
      comuns++
      for (let j = i; j < i + TAM_TRECHO; j++) coberta[j] = true
    }
  }
  const sequencias: { inicio: number; fim: number }[] = []
  for (let i = 0; i < pa.length; i++) {
    if (!coberta[i]) continue
    const inicio = i
    while (i < pa.length && coberta[i]) i++
    sequencias.push({ inicio, fim: i })
  }
  const caracteres = sequencias.reduce(
    (s, q) => s + pa.slice(q.inicio, q.fim).reduce((t, p) => t + p.original.length + 1, 0),
    0,
  )
  const exemplos = sequencias
    .sort((x, y) => y.fim - y.inicio - (x.fim - x.inicio))
    .slice(0, 3)
    .map((q) => {
      const t = pa.slice(q.inicio, q.fim).map((p) => p.original).join(' ')
      return t.length > 140 ? `${t.slice(0, 140)}…` : t
    })
  return { fracao: totalTrechos ? comuns / totalTrechos : 0, caracteres, exemplos }
}

// ---------------------------------------------------------------- alertas

type Fonte = { nome: string; texto: string; alvo: Alvo | null }

const LIMITE_PROMPT = 20_000
const LIMITE_REGRA = 3_000
const LIMITE_ITEM = 15_000

/**
 * Alertas A1 a A6, do que mais economiza para o que menos. Com `agente` null, só os da base (a lista da Base de
 * conhecimento usa assim para marcar cada item).
 */
export function alertas(agente: AgenteSaude | null, base: ItemBase[]): Alerta[] {
  const lista: Alerta[] = []
  const ativos = base.filter((b) => b.ativo)

  // A1 — catálogo colado na base: o agente lê todos os preços em toda resposta.
  for (const b of ativos) {
    const precos = (b.conteudo.match(/R\$\s?\d/g) ?? []).length
    const linhasProduto = b.conteudo.split('\n').filter((l) => /^\s*[-*•]?\s*(produto|pre[çc]o|valor)\s*:/i.test(l)).length
    if (precos >= 20 || linhasProduto >= 20) {
      lista.push({
        codigo: 'A1',
        chave: `A1:${b.id}`,
        titulo: `“${b.titulo}” parece um catálogo`,
        mensagem: `Tem ${Math.max(precos, linhasProduto)} preços ou produtos. Na base, o agente lê tudo em toda resposta; cadastrados em Produtos, ele consulta só quando o cliente pergunta. Use “Importar este catálogo” (a IA monta a lista para você revisar) e depois desative este conteúdo.`,
        economia: b.conteudo.length,
        alvo: { tipo: 'base', id: b.id },
        acao: 'produtos',
      })
    }
  }

  // A2 — um conteúdo ativo contido em outro (80% das linhas longas).
  const linhasPorItem = new Map(ativos.map((b) => [b.id, linhasLongas(b.conteudo)]))
  const repetidos = new Set<string>()
  for (const x of ativos) {
    if (repetidos.has(x.id)) continue
    const lx = linhasPorItem.get(x.id)!
    if (lx.size < 3) continue
    for (const y of ativos) {
      if (y.id === x.id || repetidos.has(y.id)) continue
      const ly = linhasPorItem.get(y.id)!
      let comuns = 0
      for (const l of lx) if (ly.has(l)) comuns++
      if (comuns / lx.size < 0.8) continue
      // Os dois se contêm: desativa o menor.
      const [menor, maior] = x.conteudo.length <= y.conteudo.length || comuns / ly.size < 0.8 ? [x, y] : [y, x]
      repetidos.add(menor.id)
      lista.push({
        codigo: 'A2',
        chave: `A2:${menor.id}`,
        titulo: `“${menor.titulo}” repete “${maior.titulo}”`,
        mensagem: 'O conteúdo já está no outro item. Desativar este não muda o que o agente sabe.',
        economia: menor.conteudo.length,
        alvo: { tipo: 'base', id: menor.id },
        acao: 'desativar',
      })
      break
    }
  }

  // A3 — separadores. A4 — textos longos demais para ler em toda resposta.
  const separadores = (alvo: Alvo, nome: string, removidos: number, chave: string) =>
    removidos > 0 &&
    lista.push({
      codigo: 'A3',
      chave: `A3:${chave}`,
      titulo: `Separadores em ${nome}`,
      mensagem: `${mil(removidos)} caracteres de linhas só de decoração (=====, -----). O agente lê e você paga, sem mudar nada no atendimento.`,
      economia: removidos,
      alvo,
      acao: 'limpar',
    })
  const longo = (alvo: Alvo, nome: string, tamanho: number, limite: number, chave: string) =>
    tamanho > limite &&
    lista.push({
      codigo: 'A4',
      chave: `A4:${chave}`,
      titulo: `Texto longo demais: ${nome}`,
      mensagem: `${mil(tamanho)} caracteres, lidos em toda resposta (o recomendado é até ${mil(limite)}). Corte o que se repete e o que o cliente quase nunca pergunta.`,
      economia: tamanho - limite,
      alvo,
      acao: 'editar',
    })

  if (agente) {
    separadores({ tipo: 'prompt' }, 'Instruções', limparSeparadores(agente.prompt).removidos, 'prompt')
    separadores({ tipo: 'regras' }, 'Quando chamar a equipe', limparCasos(agente.casos).removidos, 'regras')
    longo({ tipo: 'prompt' }, 'Instruções', agente.prompt.length, LIMITE_PROMPT, 'prompt')
    agente.casos.forEach((c, i) => longo({ tipo: 'regras' }, `regra ${i + 1} de chamar a equipe`, c.length, LIMITE_REGRA, `regra${i}`))
  }
  for (const b of ativos) {
    separadores({ tipo: 'base', id: b.id }, `“${b.titulo}”`, limparSeparadores(b.conteudo).removidos, b.id)
    if (!lista.some((a) => a.alvo?.tipo === 'base' && a.alvo.id === b.id && (a.codigo === 'A1' || a.codigo === 'A2')))
      longo({ tipo: 'base', id: b.id }, `“${b.titulo}”`, b.conteudo.length, LIMITE_ITEM, b.id)
  }

  // A5 — o mesmo texto em mais de um lugar (instruções, regras, base).
  if (agente) {
    const fontes: Fonte[] = [
      { nome: '“Instruções”', texto: agente.prompt, alvo: { tipo: 'prompt' } },
      { nome: '“Quando chamar a equipe”', texto: agente.casos.join('\n'), alvo: { tipo: 'regras' } },
      { nome: 'a base de conhecimento', texto: ativos.map((b) => b.conteudo).join('\n'), alvo: null },
    ]
    comparar(fontes.filter((f) => f.texto.trim()))
  }
  // Também item contra item da base (repetição parcial, abaixo dos 80% do A2). Catálogo e repetido já têm alerta.
  const jaAvisados = new Set(lista.filter((a) => a.codigo === 'A1' || a.codigo === 'A2').map((a) => (a.alvo as { id: string }).id))
  comparar(
    ativos
      .filter((b) => !jaAvisados.has(b.id))
      .map((b): Fonte => ({ nome: `“${b.titulo}”`, texto: b.conteudo, alvo: { tipo: 'base', id: b.id } })),
  )

  function comparar(fontes: Fonte[]) {
    for (let i = 0; i < fontes.length; i++) {
      for (let j = i + 1; j < fontes.length; j++) {
        const [menor, maior] = fontes[i].texto.length <= fontes[j].texto.length ? [fontes[i], fontes[j]] : [fontes[j], fontes[i]]
        const r = repeticao(menor.texto, maior.texto)
        if (r.fracao <= 0.15) continue
        lista.push({
          codigo: 'A5',
          chave: `A5:${menor.nome}:${maior.nome}`,
          titulo: `${menor.nome.replace(/^a /, 'A ')} repete trechos de ${maior.nome}`,
          mensagem: `${Math.round(r.fracao * 100)}% de ${menor.nome} também está em ${maior.nome}. Deixe cada informação em um lugar só.`,
          economia: r.caracteres,
          alvo: menor.alvo,
          acao: null,
          exemplos: r.exemplos,
        })
      }
    }
  }

  // A6 — sem instruções ou sem base.
  if (agente && !agente.prompt.trim())
    lista.push({
      codigo: 'A6',
      chave: 'A6:prompt',
      titulo: 'O agente está sem instruções',
      mensagem: 'Ele responde só com o conhecimento geral dele. Escreva quem ele é, o que a empresa faz e o que pode prometer.',
      economia: 0,
      alvo: { tipo: 'prompt' },
      acao: 'editar',
    })
  if (agente?.ativo && !ativos.length)
    lista.push({
      codigo: 'A6',
      chave: 'A6:base',
      titulo: 'A base de conhecimento está vazia',
      mensagem: 'Com o agente ligado e sem base, ele responde só com as instruções e o conhecimento geral dele.',
      economia: 0,
      alvo: null,
      acao: 'editar',
    })

  return lista.sort((a, b) => b.economia - a.economia)
}
