import { supabase } from './supabaseClient'
import type { ModeloCampanha, VariavelCampanha } from './campanhas'

// Aviso ao cliente quando o pedido muda de situação (migration 20261106130000). Uma linha por empresa; salvar é de dono
// e admin (pedido_avisos_salvar). O envio acontece no banco, quando alguém muda a situação do pedido.

export type SituacaoAviso = 'confirmado' | 'separando' | 'enviado' | 'entregue'
export const SITUACOES_AVISO: { id: SituacaoAviso; rotulo: string }[] = [
  { id: 'confirmado', rotulo: 'Confirmado' },
  { id: 'separando', rotulo: 'Separando' },
  { id: 'enviado', rotulo: 'Enviado' },
  { id: 'entregue', rotulo: 'Entregue' },
]

/** No modelo, além de nome, empresa e texto fixo: o número do pedido e a situação em palavras. */
export type FonteAviso = VariavelCampanha['fonte'] | 'pedido' | 'situacao'
export type VariavelAviso = { fonte: FonteAviso; valor?: string; padrao?: string }
export type ModeloAviso = Omit<ModeloCampanha, 'variaveis'> & { variaveis: VariavelAviso[] }

export const ROTULO_FONTE_AVISO: Record<FonteAviso, string> = {
  nome: 'Nome do contato',
  empresa: 'Empresa do contato',
  pedido: 'Número do pedido',
  situacao: 'Situação do pedido',
  fixo: 'Texto fixo',
}

export type ConfigAvisos = {
  ativo: boolean
  situacoes: SituacaoAviso[]
  textos: Record<SituacaoAviso, string>
  modelo: ModeloAviso | null
}

// Os mesmos textos do padrão do banco (pedido_avisos.textos).
export const CONFIG_AVISOS_PADRAO: ConfigAvisos = {
  ativo: false,
  situacoes: ['confirmado', 'enviado', 'entregue'],
  textos: {
    confirmado: 'Olá, {nome}! O seu pedido nº {numero} foi confirmado. Avisamos por aqui quando ele sair para entrega.',
    separando: 'Olá, {nome}! Estamos separando o seu pedido nº {numero}.',
    enviado: 'Olá, {nome}! O seu pedido nº {numero} saiu para entrega.',
    entregue: 'Olá, {nome}! O seu pedido nº {numero} foi entregue. Obrigado pela compra! Qualquer dúvida, é só responder esta mensagem.',
  },
  modelo: null,
}

export async function buscarConfigAvisos(orgId: string): Promise<ConfigAvisos> {
  const { data, error } = await supabase.from('pedido_avisos').select('ativo, situacoes, textos, modelo').eq('org_id', orgId).maybeSingle()
  if (error) throw error
  if (!data) return CONFIG_AVISOS_PADRAO
  return {
    ativo: data.ativo,
    situacoes: data.situacoes as SituacaoAviso[],
    textos: { ...CONFIG_AVISOS_PADRAO.textos, ...(data.textos as Partial<Record<SituacaoAviso, string>>) },
    modelo: (data.modelo as ModeloAviso | null) ?? null,
  }
}

export async function salvarConfigAvisos(orgId: string, cfg: ConfigAvisos) {
  const { error } = await supabase.rpc('pedido_avisos_salvar', { p_org: orgId, p_cfg: cfg as never })
  if (error) {
    const m = error.message
    throw new Error(
      m.includes('só dono e admin')
        ? 'Só dono e admin mudam o aviso de pedidos.'
        : m.includes('ao menos uma situação')
          ? 'Marque ao menos uma situação para avisar, ou desligue o aviso.'
          : m.includes('texto de cada situação')
            ? 'Escreva o texto de cada situação marcada (até 1.000 caracteres).'
            : m.includes('variáveis')
              ? 'Preencha todas as variáveis do modelo.'
              : m.includes('modelo inválido')
                ? 'O modelo escolhido não pode ser usado. Escolha outro.'
                : 'Não foi possível salvar. Tente de novo.',
    )
  }
}

export type EnvioAviso = { id: string; status: string; enviado: boolean; modelo: boolean; resultado: string; criado_em: string }

/** O que aconteceu com os avisos de um pedido (o mais recente por último). */
export async function listarAvisosDoPedido(pedidoId: string): Promise<EnvioAviso[]> {
  const { data, error } = await supabase
    .from('pedido_avisos_envios')
    .select('id, status, enviado, modelo, resultado, criado_em')
    .eq('pedido_id', pedidoId)
    .order('criado_em')
  if (error) throw error
  return data ?? []
}
