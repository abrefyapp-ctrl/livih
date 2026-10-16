import { supabase } from './supabaseClient'
import { CAMBIO, CARACTERES_POR_TOKEN, CHAMADAS_PADRAO } from './saudeAgente'

// Consumo real do agente para o painel Saúde do agente. `uso_ia` é legível por dono/admin; `precos_ia` só pela
// plataforma (decisão de 09/10, mantida em 16/10): sem preço, os valores em R$ ficam nulos e a tela não os mostra.

export type UsoReal = {
  /** Últimos 7 dias. */
  respostas: number
  conversas: number
  /** Caracteres lidos de fato por chamada (tokens de entrada × 4,5). */
  caracteresPorChamada: number | null
  /** Média dos últimos 30 dias (ou o padrão, sem histórico). */
  chamadas: number
  modelo: string
  /** Só para a plataforma (null para a empresa). */
  usdEntrada: number | null
  custoPorResposta: number | null
  custoPorConversa: number | null
  projecaoMes: number | null
}

type Linha = { tokens_entrada: number; tokens_saida: number; chamadas: number; conversa_id: string | null; modelo: string; criado_em: string }

export async function carregarUsoReal(orgId: string): Promise<UsoReal> {
  const desde30 = new Date(Date.now() - 30 * 864e5).toISOString()
  const [uso, precos] = await Promise.all([
    supabase
      .from('uso_ia')
      .select('tokens_entrada, tokens_saida, chamadas, conversa_id, modelo, criado_em')
      .eq('org_id', orgId)
      .eq('tipo', 'resposta')
      .gte('criado_em', desde30)
      .order('criado_em', { ascending: false })
      .limit(10000),
    // Para a empresa a RLS devolve vazio, sem erro.
    supabase.from('precos_ia').select('modelo, usd_por_milhao_entrada, usd_por_milhao_saida'),
  ])
  if (uso.error) throw uso.error
  const linhas = (uso.data ?? []) as Linha[]
  const desde7 = Date.now() - 7 * 864e5
  const semana = linhas.filter((l) => new Date(l.criado_em).getTime() >= desde7)

  const totalChamadas = linhas.reduce((s, l) => s + Math.max(l.chamadas, 1), 0)
  const chamadas = linhas.length ? totalChamadas / linhas.length : CHAMADAS_PADRAO
  const chamadasSemana = semana.reduce((s, l) => s + Math.max(l.chamadas, 1), 0)
  const caracteresPorChamada = chamadasSemana
    ? (semana.reduce((s, l) => s + l.tokens_entrada, 0) / chamadasSemana) * CARACTERES_POR_TOKEN
    : null
  const conversas = new Set(semana.map((l) => l.conversa_id).filter(Boolean)).size
  const modelo = linhas[0]?.modelo ?? 'gpt-5-mini'

  const preco = (precos.data ?? []).find((p) => p.modelo === modelo)
  let custoPorResposta: number | null = null
  let custoPorConversa: number | null = null
  let projecaoMes: number | null = null
  if (preco && semana.length) {
    const custo = semana.reduce(
      (s, l) => s + (l.tokens_entrada * Number(preco.usd_por_milhao_entrada) + l.tokens_saida * Number(preco.usd_por_milhao_saida)) / 1e6,
      0,
    ) * CAMBIO
    custoPorResposta = custo / semana.length
    custoPorConversa = conversas ? custo / conversas : null
    projecaoMes = (custo / 7) * 30
  }

  return {
    respostas: semana.length,
    conversas,
    caracteresPorChamada,
    chamadas,
    modelo,
    usdEntrada: preco ? Number(preco.usd_por_milhao_entrada) : null,
    custoPorResposta,
    custoPorConversa,
    projecaoMes,
  }
}
