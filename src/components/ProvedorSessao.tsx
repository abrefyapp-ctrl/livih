import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../services/supabaseClient'
import { listarEquipe, listarOrganizacoes, type Organizacao, type Perfil } from '../services/atendimento'
import { ehAdminPlataforma } from '../services/plataforma'
import { listarModulos } from '../services/modulos'
import { desativarNotificacoes } from '../services/notificacoes'
import { ContextoSessao } from '../hooks/useSessao'

const CHAVE_ORG = 'livih.org'
const CHAVE_SUPORTE = 'livih.suporte'
const SEM_EQUIPE = new Map<string, Perfil>()

// Empresa aberta em modo suporte (equipe da plataforma). Sobrevive ao recarregar; só vale para admin da plataforma.
type OrgSuporte = Pick<Organizacao, 'id' | 'nome' | 'status'>
function lerSuporte(): OrgSuporte | null {
  try {
    const v = localStorage.getItem(CHAVE_SUPORTE)
    return v ? (JSON.parse(v) as OrgSuporte) : null
  } catch {
    return null
  }
}

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
type Modulos = { chave: string; ligados: Set<string> }

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [orgs, setOrgs] = useState<Orgs | null>(null)
  const [orgId, setOrgId] = useState<string | null>(lerOrgSalva)
  const [suporte, setSuporte] = useState<OrgSuporte | null>(lerSuporte)
  const [equipe, setEquipe] = useState<Equipe | null>(null)
  const [modulos, setModulos] = useState<Modulos | null>(null)
  const [versaoModulos, setVersaoModulos] = useState(0)

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

  // Modo suporte: a tela trata a plataforma como dono (o banco já libera tudo para eh_admin_plataforma).
  const orgAtiva = useMemo<Organizacao | null>(() => {
    if (adminPlataforma && suporte) {
      return organizacoes.find((o) => o.id === suporte.id) ?? { ...suporte, papel: 'dono', suporte: true }
    }
    return organizacoes.find((o) => o.id === orgId) ?? organizacoes[0] ?? null
  }, [organizacoes, orgId, adminPlataforma, suporte])

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

  // Sem resposta do banco, vale o padrão (agenda ligada): melhor mostrar a tela do que sumir com ela por um erro de rede.
  const chaveModulos = `${orgAtivaId}|${versaoModulos}`
  useEffect(() => {
    if (!orgAtivaId) return
    let ativo = true
    listarModulos(orgAtivaId)
      .then((l) => ativo && setModulos({ chave: chaveModulos, ligados: new Set(l.filter((m) => m.ativo).map((m) => m.codigo)) }))
      .catch(() => ativo && setModulos({ chave: chaveModulos, ligados: new Set(['agenda']) }))
    return () => {
      ativo = false
    }
  }, [orgAtivaId, chaveModulos])
  // Mantém o que já está na tela enquanto relê (sem piscar o menu); só some quando a empresa muda.
  // `modulos &&` explícito: com `modulos?.` o lado esquerdo vira undefined e casa com orgAtivaId undefined (sem login).
  const modulosAtivos = modulos && modulos.chave.split('|')[0] === orgAtivaId ? modulos.ligados : null
  const recarregarModulos = useCallback(() => setVersaoModulos((v) => v + 1), [])

  // Módulo ligado pela plataforma em outra aba ou outro aparelho: o menu acompanha quando a pessoa volta para a aba.
  useEffect(() => {
    const aoVoltar = () => document.visibilityState === 'visible' && recarregarModulos()
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [recarregarModulos])

  const trocarOrganizacao = useCallback((id: string) => {
    setOrgId(id)
    try {
      localStorage.setItem(CHAVE_ORG, id)
    } catch {
      /* sem armazenamento: vale só nesta aba */
    }
  }, [])

  const acessarComoSuporte = useCallback((org: OrgSuporte) => {
    setSuporte(org)
    try {
      localStorage.setItem(CHAVE_SUPORTE, JSON.stringify(org))
    } catch {
      /* sem armazenamento: vale só nesta aba */
    }
  }, [])

  const sairDoSuporte = useCallback(() => {
    setSuporte(null)
    try {
      localStorage.removeItem(CHAVE_SUPORTE)
    } catch {
      /* nada salvo */
    }
  }, [])

  const sair = useCallback(async () => {
    // Aparelho compartilhado: quem sai não continua recebendo as notificações da conta.
    await desativarNotificacoes().catch(() => undefined)
    sairDoSuporte()
    await supabase.auth.signOut()
  }, [sairDoSuporte])

  const valor = useMemo(
    () => ({
      sessao,
      organizacoes,
      suspensas,
      adminPlataforma,
      orgAtiva,
      carregandoOrgs,
      equipe: mapaEquipe,
      modulos: modulosAtivos,
      recarregarModulos,
      trocarOrganizacao,
      acessarComoSuporte,
      sairDoSuporte,
      sair,
    }),
    [
      sessao,
      organizacoes,
      suspensas,
      adminPlataforma,
      orgAtiva,
      carregandoOrgs,
      mapaEquipe,
      modulosAtivos,
      recarregarModulos,
      trocarOrganizacao,
      acessarComoSuporte,
      sairDoSuporte,
      sair,
    ],
  )

  return <ContextoSessao.Provider value={valor}>{children}</ContextoSessao.Provider>
}
