import { useId, useState, type InputHTMLAttributes } from 'react'
import { Icone } from './Icone'

type Props = InputHTMLAttributes<HTMLInputElement> & { rotulo: string; erro?: string; ajuda?: string }

/** Rótulo sempre visível (placeholder não substitui rótulo); senha com botão de mostrar. */
export function CampoTexto({ rotulo, erro, ajuda, type = 'text', className = '', ...resto }: Props) {
  const id = useId()
  const [mostrar, setMostrar] = useState(false)
  const senha = type === 'password'
  const descricao = erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined

  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-pequeno font-medium text-texto-2">
        {rotulo}
      </label>
      <div className="relative">
        <input
          id={id}
          type={senha && mostrar ? 'text' : type}
          aria-invalid={!!erro || undefined}
          aria-describedby={descricao}
          className={`block h-10 w-full rounded-md border bg-superficie px-3 placeholder:text-texto-3 focus:outline-none ${
            senha ? 'pr-10' : ''
          } ${erro ? 'border-erro focus:border-erro' : 'border-borda focus:border-primaria'}`}
          {...resto}
        />
        {senha && (
          <button
            type="button"
            onClick={() => setMostrar((v) => !v)}
            aria-label={mostrar ? 'Esconder senha' : 'Mostrar senha'}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-texto-3 hover:text-texto"
          >
            <Icone nome={mostrar ? 'olhoFechado' : 'olho'} className="size-4" />
          </button>
        )}
      </div>
      {erro ? (
        <p id={`${id}-erro`} className="flex items-center gap-1 text-legenda text-erro">
          <Icone nome="erro" className="size-3.5" />
          {erro}
        </p>
      ) : (
        ajuda && (
          <p id={`${id}-ajuda`} className="text-legenda text-texto-3">
            {ajuda}
          </p>
        )
      )}
    </div>
  )
}
