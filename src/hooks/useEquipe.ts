import { useEffect, useState } from 'react'
import { listarEquipeCompleta, type MembroEquipe } from '../services/configuracoes'

/** Pessoas ativas da equipe, para escolher responsável. */
export function useEquipe(orgId: string | undefined) {
  const [equipe, setEquipe] = useState<{ orgId: string; lista: MembroEquipe[] } | null>(null)

  useEffect(() => {
    if (!orgId) return
    let ativo = true
    listarEquipeCompleta(orgId)
      .then((l) => ativo && setEquipe({ orgId, lista: l.filter((m) => m.ativo) }))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId])

  return equipe !== null && equipe.orgId === orgId ? equipe.lista : []
}
