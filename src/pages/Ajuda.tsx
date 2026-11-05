import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MANUAIS } from '../ajuda/manuais'
import { EstadoVazio } from '../components/EstadoVazio'
import { Icone } from '../components/Icone'
import { Logo } from '../components/Logo'

/** A aba da Ajuda: sem o menu do app, só o cabeçalho e a leitura. */
function Casca({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.title = 'Ajuda · Livih'
  }, [])
  return (
    <div className="flex h-dvh flex-col bg-fundo">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-borda bg-superficie px-4 lg:px-8">
        <Link to="/ajuda" aria-label="Ajuda da Livih" className="flex items-center gap-3">
          <Logo />
          <span className="border-l border-borda pl-3 font-semibold text-texto-2">Ajuda</span>
        </Link>
        <span className="ml-auto hidden text-legenda text-texto-3 sm:block">Leia aqui e faça os passos na aba da Livih.</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}

/**
 * Ajuda: os manuais de uso da Livih (src/ajuda/). Abre em outra aba (menu Ajuda e "Como usar" das telas), fora do
 * layout do app. /ajuda lista os manuais; /ajuda/<id> abre um, com o índice das seções ao lado (no celular, em cima).
 * /ajuda/<id>#<seção> já abre na seção.
 */
export function Ajuda() {
  return (
    <Casca>
      <Conteudo />
    </Casca>
  )
}

function Conteudo() {
  const { manual: id } = useParams()
  const manual = id ? MANUAIS.find((m) => m.id === id) : null

  // A rolagem da Livih é numa área interna: o navegador não leva sozinho até a seção do endereço.
  useEffect(() => {
    if (!manual) return
    const alvo = decodeURIComponent(window.location.hash.slice(1))
    if (alvo) requestAnimationFrame(() => document.getElementById(alvo)?.scrollIntoView())
  }, [manual])

  if (id && !manual) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8">
        <EstadoVazio icone="livro" titulo="Manual não encontrado" acao={<Link to="/ajuda" className="font-semibold text-primaria hover:underline">Ver todos os manuais</Link>}>
          O endereço pode ter mudado.
        </EstadoVazio>
      </div>
    )
  }

  if (!manual) {
    return (
      <div>
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 lg:px-8">
          <div>
            <h1 className="text-h1 font-semibold">Ajuda</h1>
            <p className="text-pequeno text-texto-3">Manuais de uso da Livih, passo a passo e com as telas.</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {MANUAIS.map((m) => (
              <li key={m.id}>
                <Link
                  to={`/ajuda/${m.id}`}
                  className="flex h-full items-start gap-3 rounded-lg border border-borda bg-superficie p-4 hover:border-primaria"
                >
                  <span className="rounded-md bg-primaria-suave p-2 text-primaria">
                    <Icone nome={m.icone} className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-texto">{m.titulo}</span>
                    <span className="block text-pequeno text-texto-2">{m.resumo}</span>
                    {m.para && <span className="mt-1 block text-legenda text-texto-3">Para: {m.para}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-pequeno text-texto-3">Mais manuais estão a caminho. Dúvida que eles não respondem: fale com o suporte da Livih.</p>
        </div>
      </div>
    )
  }

  const { Conteudo } = manual
  const irPara = (secao: string) => {
    document.getElementById(secao)?.scrollIntoView({ behavior: 'smooth' })
    history.replaceState(null, '', `#${secao}`)
  }

  return (
    <div>
      <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
        <Link to="/ajuda" className="inline-flex items-center gap-1 text-pequeno text-texto-3 hover:text-texto">
          <Icone nome="voltar" className="size-4" /> Todos os manuais
        </Link>
        <div className="mt-2 mb-6">
          <h1 className="text-h1 font-semibold">{manual.titulo}</h1>
          <p className="text-pequeno text-texto-3">
            {manual.para ? `Para: ${manual.para} · ` : ''}Atualizado em {manual.atualizado}
          </p>
        </div>
        <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
          <nav aria-label="Neste manual" className="lg:sticky lg:top-0 lg:self-start">
            <p className="mb-2 text-legenda font-semibold tracking-wide text-texto-3 uppercase">Neste manual</p>
            <ol className="space-y-1 border-l border-borda">
              {manual.secoes.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => irPara(s.id)}
                    className="-ml-px border-l-2 border-transparent py-0.5 pl-3 text-left text-pequeno text-texto-2 hover:border-primaria hover:text-texto"
                  >
                    {s.titulo}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <article className="max-w-3xl min-w-0 space-y-8">
            <Conteudo />
          </article>
        </div>
      </div>
    </div>
  )
}
