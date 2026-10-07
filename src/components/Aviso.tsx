import type { ReactNode } from 'react'
import { Icone, type NomeIcone } from './Icone'

const TONS: Record<'info' | 'atencao' | 'erro', { cor: string; icone: NomeIcone }> = {
  info: { cor: 'bg-info-suave text-info', icone: 'erro' },
  atencao: { cor: 'bg-atencao-suave text-atencao', icone: 'alerta' },
  erro: { cor: 'bg-erro-suave text-erro', icone: 'erro' },
}

export function Aviso({
  tom = 'info',
  children,
  acao,
}: {
  tom?: keyof typeof TONS
  children: ReactNode
  acao?: ReactNode
}) {
  const t = TONS[tom]
  return (
    <div role={tom === 'erro' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-md px-3 py-2 text-pequeno ${t.cor}`}>
      <Icone nome={t.icone} className="mt-px size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {acao}
    </div>
  )
}
