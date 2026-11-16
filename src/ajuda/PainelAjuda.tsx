import { useEffect, useRef } from 'react'
import { Icone } from '../components/Icone'
import { MANUAIS } from './manuais'

/**
 * Ajuda num painel à direita da tela (16/11): no computador a tela encolhe e o manual fica ao lado, para ler e fazer
 * ao mesmo tempo; no celular e no tablet o painel cobre a tela. A página /ajuda continua para quem quer outra aba.
 */
export function PainelAjuda({
  manual: id,
  aoEscolher,
  aoFechar,
}: {
  manual: string | null
  aoEscolher: (manual: string | null) => void
  aoFechar: () => void
}) {
  const manual = id ? MANUAIS.find((m) => m.id === id) : null
  const rolagem = useRef<HTMLDivElement>(null)
  const fechar = useRef<HTMLButtonElement>(null)

  // Manual novo começa do alto.
  useEffect(() => {
    rolagem.current?.scrollTo({ top: 0 })
  }, [id])

  // Ao abrir, o foco vai para o painel (quem usa teclado ou leitor de tela chega direto nele).
  useEffect(() => {
    fechar.current?.focus()
  }, [])

  return (
    <>
      {/* Celular e tablet: o painel cobre a tela; tocar fora fecha. */}
      <button aria-label="Fechar a ajuda" className="fixed inset-0 z-30 bg-navy-900/40 lg:hidden" onClick={aoFechar} />
      <aside
        aria-label="Ajuda"
        onKeyDown={(e) => e.key === 'Escape' && aoFechar()}
        className="fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-superficie shadow-xl sm:max-w-md lg:static lg:z-auto lg:w-[28rem] lg:max-w-none lg:shrink-0 lg:border-l lg:border-borda lg:shadow-none"
      >
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-borda px-2">
          {manual ? (
            <button
              type="button"
              onClick={() => aoEscolher(null)}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-pequeno font-medium text-texto-2 hover:bg-fundo hover:text-texto"
            >
              <Icone nome="voltar" className="size-4" />
              Todos os manuais
            </button>
          ) : (
            <span className="flex items-center gap-2 px-2 font-semibold">
              <Icone nome="livro" className="size-5 text-primaria" />
              Ajuda
            </span>
          )}
          <a
            href={manual ? `/ajuda/${manual.id}` : '/ajuda'}
            target="_blank"
            rel="noopener"
            title="Abrir em outra aba"
            className="ml-auto rounded-md p-2 text-texto-3 hover:bg-fundo hover:text-texto"
          >
            <Icone nome="link" className="size-4" />
            <span className="sr-only">Abrir em outra aba</span>
          </a>
          <button
            ref={fechar}
            type="button"
            onClick={aoFechar}
            title="Fechar a ajuda"
            className="rounded-md p-2 text-texto-3 hover:bg-fundo hover:text-texto"
          >
            <Icone nome="fechar" className="size-4" />
            <span className="sr-only">Fechar a ajuda</span>
          </button>
        </div>

        <div ref={rolagem} className="min-h-0 flex-1 overflow-y-auto">
          {!manual ? (
            <div className="space-y-3 p-4">
              <p className="text-pequeno text-texto-3">Manuais de uso da Livih, passo a passo e com as telas. Leia aqui e faça na tela ao lado.</p>
              <ul className="space-y-2">
                {MANUAIS.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => aoEscolher(m.id)}
                      className="flex w-full items-start gap-3 rounded-lg border border-borda p-3 text-left hover:border-primaria"
                    >
                      <span className="rounded-md bg-primaria-suave p-2 text-primaria">
                        <Icone nome={m.icone} className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-texto">{m.titulo}</span>
                        <span className="block text-pequeno text-texto-2">{m.resumo}</span>
                        {m.para && <span className="mt-1 block text-legenda text-texto-3">Para: {m.para}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-pequeno text-texto-3">Mais manuais estão a caminho. Dúvida que eles não respondem: fale com o suporte da Livih.</p>
            </div>
          ) : (
            <div className="space-y-6 p-4">
              <div>
                <h2 className="text-h2 font-semibold">{manual.titulo}</h2>
                <p className="text-legenda text-texto-3">
                  {manual.para ? `Para: ${manual.para} · ` : ''}Atualizado em {manual.atualizado}
                </p>
              </div>
              <details className="rounded-lg border border-borda bg-fundo px-3 py-2">
                <summary className="cursor-pointer text-pequeno font-semibold text-texto-2">Neste manual</summary>
                <ol className="mt-2 space-y-1">
                  {manual.secoes.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })}
                        className="text-left text-pequeno text-texto-2 hover:text-primaria"
                      >
                        {s.titulo}
                      </button>
                    </li>
                  ))}
                </ol>
              </details>
              <article className="min-w-0 space-y-8">
                <manual.Conteudo />
              </article>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
