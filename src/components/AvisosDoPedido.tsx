import { useEffect, useState } from 'react'
import { quandoCurto } from '../services/formato'
import { listarAvisosDoPedido, SITUACOES_AVISO, type EnvioAviso } from '../services/pedidoAvisos'
import { Icone } from './Icone'

/**
 * Tela do pedido: os avisos de situação mandados ao cliente pelo WhatsApp, ou por que não saíram. Some quando o pedido
 * não tem nenhum (aviso desligado ou nenhuma mudança ainda). `versao` recarrega depois de mudar a situação.
 */
export function AvisosDoPedido({ pedidoId, versao }: { pedidoId: string; versao: number }) {
  const [lista, setLista] = useState<EnvioAviso[]>([])

  useEffect(() => {
    let ativo = true
    listarAvisosDoPedido(pedidoId)
      .then((l) => ativo && setLista(l))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [pedidoId, versao])

  if (!lista.length) return null
  return (
    <section aria-labelledby="titulo-avisos" className="rounded-lg border border-borda bg-superficie px-4 py-3">
      <h2 id="titulo-avisos" className="text-pequeno font-semibold">
        Avisos ao cliente pelo WhatsApp
      </h2>
      <ul className="mt-2 space-y-1.5">
        {lista.map((a) => (
          <li key={a.id} className="flex items-start gap-2 text-pequeno">
            <Icone nome={a.enviado ? 'check' : 'alerta'} className={`mt-0.5 size-4 shrink-0 ${a.enviado ? 'text-primaria' : 'text-atencao'}`} />
            <span className="min-w-0">
              <span className="font-medium">{SITUACOES_AVISO.find((s) => s.id === a.status)?.rotulo ?? a.status}</span>
              <span className="text-texto-2"> · {a.resultado}</span>
              <span className="text-texto-3"> · {quandoCurto(a.criado_em)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
