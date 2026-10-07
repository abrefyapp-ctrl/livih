import { useEffect, useState } from 'react'
import { canalDaOrganizacao } from '../services/configuracoes'

/**
 * true quando o WhatsApp da organização está fora há mais de 5 min (o mesmo critério do aviso por
 * mensagem). Lê só o banco — quem consulta o WAHA é a verificação a cada 2 min.
 */
export function useCanalCaido(orgId: string | undefined) {
  const [caido, setCaido] = useState<{ orgId: string; valor: boolean } | null>(null)

  useEffect(() => {
    if (!orgId) return
    let ativo = true
    const ler = () =>
      canalDaOrganizacao(orgId)
        .then((c) => ativo && setCaido({ orgId, valor: !!c?.alerta_queda_em }))
        .catch(() => undefined)
    void ler()
    const intervalo = setInterval(ler, 60_000)
    return () => {
      ativo = false
      clearInterval(intervalo)
    }
  }, [orgId])

  return caido !== null && caido.orgId === orgId && caido.valor
}
