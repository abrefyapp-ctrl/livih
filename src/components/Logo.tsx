/**
 * Marca oficial da Livih (public/marca). `claro` é a versão sobre o fundo petróleo (#092124) — só
 * combina com esse fundo, que vem na própria imagem. Sem nome: só o símbolo (menu recolhido, carregando).
 */
export function Logo({ comNome = true, claro = false }: { comNome?: boolean; claro?: boolean }) {
  if (!comNome) return <img src="/marca/livih-simbolo.png" alt="Livih" className="size-8 shrink-0 self-start object-contain" />
  return claro ? (
    <img src="/marca/livih-petroleo.png" alt="Livih" className="h-12 w-auto shrink-0 self-start object-contain" />
  ) : (
    <img src="/marca/livih.png" alt="Livih" className="h-8 w-auto shrink-0 self-start object-contain" />
  )
}
