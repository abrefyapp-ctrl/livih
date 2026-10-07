import type { ButtonHTMLAttributes } from 'react'
import { Icone, type NomeIcone } from './Icone'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo'

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-primaria text-white hover:bg-primaria-hover',
  secundario: 'bg-superficie text-texto ring-1 ring-borda ring-inset hover:bg-fundo',
  fantasma: 'text-texto-2 hover:bg-fundo hover:text-texto',
  perigo: 'bg-erro text-white hover:bg-red-800',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante
  tamanho?: 'sm' | 'md'
  icone?: NomeIcone
  carregando?: boolean
}

export function Botao({
  variante = 'primario',
  tamanho = 'md',
  icone,
  carregando = false,
  disabled,
  className = '',
  children,
  ...resto
}: Props) {
  const tam = tamanho === 'sm' ? 'h-8 gap-1.5 px-3 text-pequeno' : 'h-10 gap-2 px-4 text-corpo'
  return (
    <button
      type="button"
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${tam} ${VARIANTES[variante]} ${className}`}
      {...resto}
    >
      {carregando ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icone && <Icone nome={icone} className="size-4" />
      )}
      {children}
    </button>
  )
}
