import { iniciais } from '../services/formato'

const TAMANHOS = { sm: 'size-8 text-legenda', md: 'size-10 text-pequeno', lg: 'size-14 text-h2' }

/** Iniciais sobre verde suave (contatos) ou navy (organização). O nome vai para o leitor de tela. */
export function Avatar({
  nome,
  tamanho = 'md',
  tom = 'contato',
}: {
  nome: string
  tamanho?: keyof typeof TAMANHOS
  tom?: 'contato' | 'organizacao'
}) {
  const cor = tom === 'organizacao' ? 'rounded-md bg-navy-900 text-white' : 'rounded-full bg-verde-100 text-primaria'
  return (
    <span
      role="img"
      aria-label={nome}
      className={`inline-flex shrink-0 items-center justify-center font-semibold ${TAMANHOS[tamanho]} ${cor}`}
    >
      {iniciais(nome)}
    </span>
  )
}
