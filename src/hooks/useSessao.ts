import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Organizacao, Perfil } from '../services/atendimento'

export type Sessao = {
  /** undefined enquanto carrega a sessão salva. */
  sessao: Session | null | undefined
  /** Só as ativas (a equipe da plataforma vê também as suspensas). */
  organizacoes: Organizacao[]
  /** Empresas suspensas do usuário (para explicar por que não entra). */
  suspensas: Organizacao[]
  /** Equipe da F7: vê o painel de empresas. */
  adminPlataforma: boolean
  /** null quando o usuário não pertence a nenhuma organização. */
  orgAtiva: Organizacao | null
  carregandoOrgs: boolean
  equipe: Map<string, Perfil>
  trocarOrganizacao: (id: string) => void
  sair: () => Promise<void>
}

export const ContextoSessao = createContext<Sessao | null>(null)

export function useSessao(): Sessao {
  const valor = useContext(ContextoSessao)
  if (!valor) throw new Error('useSessao fora do ProvedorSessao')
  return valor
}
