import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

// Tarefas com lembrete (migration 20261105130000, docs/crm-acompanhamento.md): o próximo passo da equipe com o
// cliente, ligado ao contato e, se houver, à oportunidade e à conversa. executor 'agente' são as retomadas do agente
// (entrega 2). A RLS segue a carteira do contato.

type Tabela = Database['public']['Tables']['tarefas']
export type SituacaoTarefa = 'aberta' | 'feita' | 'cancelada'

export type Tarefa = Pick<
  Tabela['Row'],
  | 'id' | 'titulo' | 'observacao' | 'vence_em' | 'executor' | 'responsavel_id' | 'contato_id' | 'oportunidade_id'
  | 'conversa_id' | 'status' | 'resultado' | 'lembrete_minutos' | 'concluida_em' | 'criado_por' | 'criado_em'
> & {
  contato: { id: string; nome: string | null; nome_whatsapp: string | null; telefone: string | null } | null
  oportunidade: { id: string; titulo: string } | null
}

export type DadosTarefa = Pick<
  Tabela['Insert'],
  'titulo' | 'observacao' | 'vence_em' | 'responsavel_id' | 'contato_id' | 'oportunidade_id' | 'conversa_id' | 'lembrete_minutos'
> & { executor?: 'equipe' | 'agente' }

/** Antecedência do lembrete para o responsável (celular e WhatsApp). Nulo = sem lembrete. */
export const LEMBRETES_TAREFA: [number | null, string][] = [
  [0, 'Na hora'],
  [10, '10 minutos antes'],
  [30, '30 minutos antes'],
  [60, '1 hora antes'],
  [120, '2 horas antes'],
  [1440, '1 dia antes'],
  [null, 'Sem lembrete'],
]

const CAMPOS =
  'id, titulo, observacao, vence_em, executor, responsavel_id, contato_id, oportunidade_id, conversa_id, status, resultado, ' +
  'lembrete_minutos, concluida_em, criado_por, criado_em, ' +
  'contato:contatos(id, nome, nome_whatsapp, telefone), oportunidade:oportunidades(id, titulo)'

const erroAmigavel = (m: string) =>
  new Error(
    m.includes('tarefas_uma_retomada_aberta')
      ? 'Este cliente já tem uma retomada do agente marcada. Abra a que existe em Tarefas para mudar a data.'
      : m.includes('responsável precisa')
      ? 'O responsável precisa ser da equipe.'
      : m.includes('outro contato')
        ? 'A oportunidade escolhida é de outro contato.'
        : m.includes('row-level security')
          ? 'Este contato é da carteira de outro vendedor.'
          : 'Não foi possível salvar a tarefa. Tente de novo.',
  )

/**
 * Abertas (todas, pela data) ou concluídas nos últimos 30 dias (as mais recentes primeiro). `responsavel`: só as
 * dessa pessoa. A RLS já aplica a carteira.
 */
export async function listarTarefas(orgId: string, situacao: 'abertas' | 'concluidas', responsavel?: string | null): Promise<Tarefa[]> {
  let q = supabase.from('tarefas').select(CAMPOS).eq('org_id', orgId)
  if (responsavel) q = q.eq('responsavel_id', responsavel)
  q =
    situacao === 'abertas'
      ? q.eq('status', 'aberta').order('vence_em').limit(500)
      : q
          .neq('status', 'aberta')
          .gte('concluida_em', new Date(Date.now() - 30 * 86_400_000).toISOString())
          .order('concluida_em', { ascending: false })
          .limit(200)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as Tarefa[]
}

/** Tarefas de um contato (ou só de uma oportunidade): as abertas e as 5 últimas concluídas. */
export async function tarefasDoContato(contatoId: string, oportunidadeId?: string): Promise<{ abertas: Tarefa[]; concluidas: Tarefa[] }> {
  const base = () => {
    const q = supabase.from('tarefas').select(CAMPOS).eq('contato_id', contatoId)
    return oportunidadeId ? q.eq('oportunidade_id', oportunidadeId) : q
  }
  const [a, c] = await Promise.all([
    base().eq('status', 'aberta').order('vence_em').limit(50),
    base().neq('status', 'aberta').order('concluida_em', { ascending: false }).limit(5),
  ])
  if (a.error) throw a.error
  if (c.error) throw c.error
  return { abertas: (a.data ?? []) as unknown as Tarefa[], concluidas: (c.data ?? []) as unknown as Tarefa[] }
}

export type ProximoPasso = { titulo: string; vence_em: string; executor: string }

/**
 * Próximo passo de cada oportunidade aberta: a tarefa aberta mais próxima dela ou, sem nenhuma, a do contato que não
 * está ligada a outra oportunidade (mesma regra do "sem retorno" do Painel).
 */
export async function proximosPassos(orgId: string): Promise<{ porOportunidade: Map<string, ProximoPasso>; porContato: Map<string, ProximoPasso> }> {
  const { data, error } = await supabase
    .from('tarefas')
    .select('titulo, vence_em, executor, oportunidade_id, contato_id')
    .eq('org_id', orgId)
    .eq('status', 'aberta')
    .not('contato_id', 'is', null)
    .order('vence_em')
    .limit(1000)
  if (error) throw error
  const porOportunidade = new Map<string, ProximoPasso>()
  const porContato = new Map<string, ProximoPasso>()
  for (const t of data ?? []) {
    const passo = { titulo: t.titulo, vence_em: t.vence_em, executor: t.executor }
    if (t.oportunidade_id) {
      if (!porOportunidade.has(t.oportunidade_id)) porOportunidade.set(t.oportunidade_id, passo)
    } else if (t.contato_id && !porContato.has(t.contato_id)) {
      porContato.set(t.contato_id, passo)
    }
  }
  return { porOportunidade, porContato }
}

export async function criarTarefa(orgId: string, dados: DadosTarefa) {
  const { error } = await supabase.from('tarefas').insert({ org_id: orgId, ...dados })
  if (error) throw erroAmigavel(error.message)
}

export async function atualizarTarefa(id: string, dados: Partial<DadosTarefa> & { status?: SituacaoTarefa; resultado?: string | null }) {
  const { data, error } = await supabase.from('tarefas').update(dados).eq('id', id).select('id')
  if (error) throw erroAmigavel(error.message)
  if (!data?.length) throw new Error('Esta tarefa não está mais disponível. Atualize a página.')
}

export async function apagarTarefa(id: string) {
  const { data, error } = await supabase.from('tarefas').delete().eq('id', id).select('id')
  if (error) throw new Error('Não foi possível apagar. Tente de novo.')
  if (!data?.length) throw new Error('Só quem criou a tarefa, o dono ou o admin apagam. Você pode concluir ou cancelar.')
}

// ---- prazo (no fuso do aparelho, que é o da equipe) ----

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const DIA = 86_400_000

/** 'atrasada' (já passou), 'hoje' ou 'depois'. */
export function prazo(vence: string, agora = new Date()): 'atrasada' | 'hoje' | 'depois' {
  const v = new Date(vence)
  if (v < agora) return 'atrasada'
  return inicioDoDia(v).getTime() === inicioDoDia(agora).getTime() ? 'hoje' : 'depois'
}

/** "Hoje 14:00", "Amanhã 09:00", "Ontem 16:30", "qui., 12/11 09:00". */
export function quandoTarefa(vence: string, agora = new Date()): string {
  const v = new Date(vence)
  const hora = v.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dias = Math.round((inicioDoDia(v).getTime() - inicioDoDia(agora).getTime()) / DIA)
  if (dias === 0) return `Hoje ${hora}`
  if (dias === 1) return `Amanhã ${hora}`
  if (dias === -1) return `Ontem ${hora}`
  const dia = v.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
  return `${dia} ${hora}`
}

/** Sugestões rápidas de quando: hoje à tarde (ou daqui a 1 h), amanhã, em 3 dias e na segunda que vem, às 9 h. */
export function sugestoesDeQuando(agora = new Date()): { rotulo: string; quando: Date }[] {
  const as = (d: Date, h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0)
  const hoje = inicioDoDia(agora)
  const emUmaHora = new Date(agora.getTime() + 60 * 60_000)
  emUmaHora.setMinutes(emUmaHora.getMinutes() < 30 ? 30 : 60, 0, 0)
  const tarde = as(hoje, 15)
  const segunda = new Date(hoje.getTime() + (((8 - hoje.getDay()) % 7 || 7) * DIA))
  return [
    tarde > agora ? { rotulo: 'Hoje à tarde', quando: tarde } : { rotulo: 'Daqui a 1 hora', quando: emUmaHora },
    { rotulo: 'Amanhã', quando: as(new Date(hoje.getTime() + DIA), 9) },
    { rotulo: 'Em 3 dias', quando: as(new Date(hoje.getTime() + 3 * DIA), 9) },
    { rotulo: 'Segunda que vem', quando: as(segunda, 9) },
  ]
}
