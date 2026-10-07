/** Marca da Livih: o "L" em dois planos do kit + o nome. */
export function Logo({ comNome = true, claro = false }: { comNome?: boolean; claro?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label="Livih">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <path d="M6 4l8-3v22l-8 3z" className="fill-destaque" />
        <path d="M6 26l8-3h14l-8 3z" className="fill-primaria" />
      </svg>
      {comNome && (
        <span className={`text-h2 font-bold tracking-tight ${claro ? 'text-white' : 'text-texto'}`}>livih</span>
      )}
    </span>
  )
}
