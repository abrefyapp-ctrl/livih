import type { ReactNode } from 'react'

// Peças dos manuais da Ajuda (src/ajuda/): o mesmo visual em todos. O texto de cada manual mora no componente dele.

/** Seção do manual, com âncora para o índice ("#antes-de-comecar"). */
export function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-6 space-y-3">
      <h2 id={`${id}-titulo`} className="text-h2 font-semibold text-texto">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

export function Subtitulo({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 font-semibold text-texto">{children}</h3>
}

export function Paragrafo({ children }: { children: ReactNode }) {
  return <p className="leading-relaxed text-texto-2">{children}</p>
}

export function Lista({ itens, numerada = false }: { itens: ReactNode[]; numerada?: boolean }) {
  const Tag = numerada ? 'ol' : 'ul'
  return (
    <Tag className={`space-y-1.5 pl-5 leading-relaxed text-texto-2 ${numerada ? 'list-decimal' : 'list-disc'}`}>
      {itens.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Tag>
  )
}

/** Tabela simples: a primeira coluna em destaque. Rola na horizontal no celular. */
export function Tabela({ colunas, linhas }: { colunas: string[]; linhas: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-borda">
      <table className="w-full min-w-[32rem] text-left text-pequeno">
        <thead className="bg-fundo text-texto-2">
          <tr>
            {colunas.map((c) => (
              <th key={c} scope="col" className="px-3 py-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((l, i) => (
            <tr key={i} className="align-top">
              {l.map((celula, j) => (
                <td key={j} className={`px-3 py-2 ${j === 0 ? 'font-medium text-texto' : 'text-texto-2'}`}>
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Imagem de tela com legenda. As imagens ficam em public/ajuda/<manual>/, sem dados reais de clientes. */
export function Figura({ src, alt, legenda, largura = 'max-w-xl' }: { src: string; alt: string; legenda?: string; largura?: string }) {
  return (
    <figure className={`space-y-1.5 ${largura}`}>
      <img src={src} alt={alt} loading="lazy" className="w-full rounded-lg border border-borda bg-superficie shadow-sm" />
      {legenda && <figcaption className="text-legenda text-texto-3">{legenda}</figcaption>}
    </figure>
  )
}

/** Caminho no app, como "Configurações → Modelos". */
export function Caminho({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-texto">{children}</strong>
}
