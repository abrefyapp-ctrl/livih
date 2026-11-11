import type { ReactNode } from 'react'

/**
 * Chave liga/desliga para o que vale na hora (agente no número, aviso de pedidos, módulos). Antes cada tela tinha a
 * sua: o agente usava chave e o aviso de pedidos uma caixa de marcar (revisão de 11/11).
 */
export function Interruptor({
  ligado,
  aoMudar,
  desabilitado = false,
  children,
  title,
  className = '',
}: {
  ligado: boolean
  aoMudar: (ligado: boolean) => void
  desabilitado?: boolean
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <label
      title={title}
      className={`flex items-center gap-2 text-pequeno text-texto-2 ${desabilitado ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${className}`}
    >
      <span className="relative inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          role="switch"
          checked={ligado}
          disabled={desabilitado}
          onChange={(e) => aoMudar(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-primaria peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-destaque" />
        <span className="absolute left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
      {children}
    </label>
  )
}
