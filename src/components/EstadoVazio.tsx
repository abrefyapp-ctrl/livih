import type { ReactNode } from 'react'
import { Icone, type NomeIcone } from './Icone'

export function EstadoVazio({
  icone,
  titulo,
  children,
  acao,
}: {
  icone: NomeIcone
  titulo: string
  children?: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-slate-100 text-texto-3">
        <Icone nome={icone} className="size-6" />
      </span>
      <p className="font-semibold text-texto">{titulo}</p>
      {children && <p className="max-w-xs text-pequeno text-texto-3">{children}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  )
}
