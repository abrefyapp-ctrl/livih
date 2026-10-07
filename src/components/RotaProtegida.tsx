import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { SemOrganizacao } from '../pages/SemOrganizacao'
import { Logo } from './Logo'

function Carregando() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3" aria-busy="true">
      <Logo comNome={false} />
      <p className="text-pequeno text-texto-3">Carregando…</p>
    </div>
  )
}

/** Exige login e pelo menos uma organização ativa. */
export function RotaProtegida({ children }: { children: ReactNode }) {
  const { sessao, orgAtiva, carregandoOrgs, organizacoes, suspensas } = useSessao()
  const local = useLocation()

  if (sessao === undefined) return <Carregando />
  if (!sessao) return <Navigate to="/login" replace state={{ de: local.pathname + local.search }} />
  if (carregandoOrgs || (!orgAtiva && organizacoes.length)) return <Carregando />
  if (!orgAtiva) return <SemOrganizacao suspensas={suspensas} />
  return children
}
