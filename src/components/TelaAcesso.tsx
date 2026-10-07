import type { ReactNode } from 'react'
import { Logo } from './Logo'

/** Moldura das telas sem login (entrar, definir senha). No desktop, a marca ocupa a esquerda. */
export function TelaAcesso({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <div className="hidden w-2/5 flex-col justify-between bg-navy-900 p-10 text-white lg:flex">
        <Logo claro />
        <div className="max-w-sm">
          <p className="text-2xl leading-snug font-semibold">
            Atendimento no WhatsApp com <span className="text-verde-400">agente de IA</span> e equipe no mesmo lugar.
          </p>
          <p className="mt-3 text-corpo text-slate-400">O agente responde na hora e chama você quando a conversa pede uma pessoa.</p>
        </div>
        <p className="text-legenda text-slate-400">Livih · por F7 Tech</p>
      </div>
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-h1 font-semibold">{titulo}</h1>
          <p className="mt-1 mb-6 text-texto-3">{subtitulo}</p>
          {children}
        </div>
      </main>
    </div>
  )
}
