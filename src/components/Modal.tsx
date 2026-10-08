import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * Janela modal sobre o <dialog> nativo: foco preso, Esc fecha e o fundo fica inerte sem código extra.
 * `rodape` fica fixo embaixo, separado por borda (ações da janela).
 */
export function Modal({
  aberto,
  titulo,
  aoFechar,
  children,
  rodape,
  largura = 'max-w-md',
}: {
  aberto: boolean
  titulo: string
  aoFechar: () => void
  children: ReactNode
  rodape?: ReactNode
  largura?: 'max-w-md' | 'max-w-xl' | 'max-w-2xl'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const idTitulo = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (aberto && !d.open) d.showModal()
    if (!aberto && d.open) d.close()
  }, [aberto])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        aoFechar()
      }}
      aria-labelledby={idTitulo}
      className={`m-auto w-[calc(100%-2rem)] ${largura} rounded-lg bg-superficie p-0 text-texto shadow-xl backdrop:bg-navy-900/40`}
    >
      {aberto && (
        <>
          <div className="relative max-h-[75vh] overflow-y-auto p-5">
            <h2 id={idTitulo} className="text-h2 font-semibold">
              {titulo}
            </h2>
            <div className="mt-3 text-corpo text-texto-2">{children}</div>
          </div>
          {rodape && <div className="flex justify-end gap-2 border-t border-borda px-5 py-3">{rodape}</div>}
        </>
      )}
    </dialog>
  )
}
