import { useEffect, useState } from 'react'
import { numerosCaidos } from '../services/configuracoes'

/**
 * Números (que a pessoa pode ver) fora do ar há mais de 5 min — o mesmo critério do aviso por mensagem.
 * Lê só o banco; quem consulta o WAHA é a verificação a cada 2 min.
 */
export function useNumerosCaidos(orgId: string | undefined) {
  const [caidos, setCaidos] = useState<{ orgId: string; nomes: string[] } | null>(null)

  useEffect(() => {
    if (!orgId) return
    let ativo = true
    const ler = () =>
      numerosCaidos(orgId)
        .then((l) => ativo && setCaidos({ orgId, nomes: l.map((n) => n.nome) }))
        .catch(() => undefined)
    void ler()
    const intervalo = setInterval(ler, 60_000)
    return () => {
      ativo = false
      clearInterval(intervalo)
    }
  }, [orgId])

  return caidos !== null && caidos.orgId === orgId ? caidos.nomes : []
}
