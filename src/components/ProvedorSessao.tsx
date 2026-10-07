import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'
import { listarEquipe, listarOrganizacoes, type Organizacao, type Perfil } from '../services/atendimento'
import { ehAdminPlataforma } from '../services/plataforma'
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
type Orgs = { userId: string; lista: Organizacao[]; admin: boolean }
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
    Promise.all([listarOrganizacoes(userId), ehAdminPlataforma(userId).catch(() => false)])
      .then(([lista, admin]) => ativo && setOrgs({ userId, lista, admin }))
      .catch(() => ativo && setOrgs({ userId, lista: [], admin: false }))
    return () => {
      ativo = false
    }
  }, [userId])

  const minhas = orgs && orgs.userId === userId ? orgs : null
  const adminPlataforma = !!minhas?.admin
  // Empresa suspensa sai do seletor; a equipe da plataforma continua entrando (suporte).
  const organizacoes = useMemo(
    () => (minhas ? minhas.lista.filter((o) => adminPlataforma || o.status === 'ativa') : []),
    [minhas, adminPlataforma],
  )
  const suspensas = useMemo(
    () => (minhas && !adminPlataforma ? minhas.lista.filter((o) => o.status !== 'ativa') : []),
    [minhas, adminPlataforma],
  )
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
    () => ({ sessao, organizacoes, suspensas, adminPlataforma, orgAtiva, carregandoOrgs, equipe: mapaEquipe, trocarOrganizacao, sair }),
    [sessao, organizacoes, suspensas, adminPlataforma, orgAtiva, carregandoOrgs, mapaEquipe, trocarOrganizacao, sair],
  )

  return <ContextoSessao.Provider value={valor}>{children}</ContextoSessao.Provider>
}
