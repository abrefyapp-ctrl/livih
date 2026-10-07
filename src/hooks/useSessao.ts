import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Organizacao, Perfil } from '../services/atendimento'

export type Sessao = {
  /** undefined enquanto carrega a sessão salva. */
  sessao: Session | null | undefined
  organizacoes: Organizacao[]
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
