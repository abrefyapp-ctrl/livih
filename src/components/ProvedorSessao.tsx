import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'
import { listarEquipe, listarOrganizacoes, type Organizacao, type Perfil } from '../services/atendimento'
import { ContextoSessao } from '../hooks/useSessao'

const CHAVE_ORG = 'livih.org'
const SEM_EQUIPE = new Map<string, Perfil>()

function lerOrgSalva(): string | null {
  try {
    return localStorage.getItem(CHAVE_ORG)
  } catch {
    return null
  }
}

// Cada resultado guarda a quem pertence (usuário, organização): trocar de conta ou de organização
// descarta o antigo sem precisar zerar estado dentro de efeito.
type Orgs = { userId: string; lista: Organizacao[] }
type Equipe = { orgId: string; mapa: Map<string, Perfil> }

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [orgs, setOrgs] = useState<Orgs | null>(null)
  const [orgId, setOrgId] = useState<string | null>(lerOrgSalva)
  const [equipe, setEquipe] = useState<Equipe | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_evento, nova) => setSessao(nova))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = sessao?.user.id
  useEffect(() => {
    if (!userId) return
    let ativo = true
    listarOrganizacoes(userId)
      .then((lista) => ativo && setOrgs({ userId, lista }))
      .catch(() => ativo && setOrgs({ userId, lista: [] }))
    return () => {
      ativo = false
    }
  }, [userId])

  const organizacoes = useMemo(() => (orgs && orgs.userId === userId ? orgs.lista : []), [orgs, userId])
  const carregandoOrgs = !!userId && orgs?.userId !== userId

  const orgAtiva = useMemo(
    () => organizacoes.find((o) => o.id === orgId) ?? organizacoes[0] ?? null,
    [organizacoes, orgId],
  )

  const orgAtivaId = orgAtiva?.id
  useEffect(() => {
    if (!orgAtivaId) return
    let ativo = true
    listarEquipe(orgAtivaId)
      .then((perfis) => ativo && setEquipe({ orgId: orgAtivaId, mapa: new Map(perfis.map((p) => [p.user_id, p])) }))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgAtivaId])

  const mapaEquipe = equipe && equipe.orgId === orgAtivaId ? equipe.mapa : SEM_EQUIPE

  const trocarOrganizacao = useCallback((id: string) => {
    setOrgId(id)
    try {
      localStorage.setItem(CHAVE_ORG, id)
    } catch {
      /* sem armazenamento: vale só nesta aba */
    }
  }, [])

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const valor = useMemo(
    () => ({ sessao, organizacoes, orgAtiva, carregandoOrgs, equipe: mapaEquipe, trocarOrganizacao, sair }),
    [sessao, organizacoes, orgAtiva, carregandoOrgs, mapaEquipe, trocarOrganizacao, sair],
  )

  return <ContextoSessao.Provider value={valor}>{children}</ContextoSessao.Provider>
}
