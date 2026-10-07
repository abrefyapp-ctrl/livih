import { useEffect, useRef, type ReactNode } from 'react'
import { Botao } from './Botao'

/** Usa o <dialog> nativo: foco preso, Esc fecha e o fundo fica inerte sem código extra. */
export function DialogoConfirmacao({
  aberto,
  titulo,
  children,
  rotuloConfirmar,
  perigo = false,
  carregando = false,
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean
  titulo: string
  children: ReactNode
  rotuloConfirmar: string
  perigo?: boolean
  carregando?: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

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
        aoCancelar()
      }}
      aria-labelledby="dialogo-titulo"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg bg-superficie p-0 text-texto shadow-xl backdrop:bg-navy-900/40"
    >
      <div className="p-5">
        <h2 id="dialogo-titulo" className="text-h2 font-semibold">
          {titulo}
        </h2>
        <div className="mt-2 text-corpo text-texto-2">{children}</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-borda px-5 py-3">
        <Botao variante="secundario" onClick={aoCancelar} disabled={carregando}>
          Cancelar
        </Botao>
        <Botao variante={perigo ? 'perigo' : 'primario'} onClick={aoConfirmar} carregando={carregando}>
          {rotuloConfirmar}
        </Botao>
      </div>
    </dialog>
  )
}
