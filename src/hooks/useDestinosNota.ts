import { useEffect, useState } from 'react'
import { destinosNota, type DestinosNota } from '../services/nfe'

/** Carrega os destinos do cliente (ou nada, sem cliente). */
export function useDestinosNota(clienteId: string | null) {
  const [dados, setDados] = useState<{ clienteId: string; destinos: DestinosNota | null } | null>(null)
  useEffect(() => {
    if (!clienteId) return
    let ativo = true
    destinosNota(clienteId)
      .then((d) => ativo && setDados({ clienteId, destinos: d }))
      .catch(() => ativo && setDados({ clienteId, destinos: null }))
    return () => {
      ativo = false
    }
  }, [clienteId])
  if (!clienteId) return { carregado: true, destinos: null }
  return { carregado: dados?.clienteId === clienteId, destinos: dados?.clienteId === clienteId ? dados.destinos : null }
}

