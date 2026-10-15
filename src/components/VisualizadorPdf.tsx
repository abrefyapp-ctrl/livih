import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Aviso } from './Aviso'
import { Icone } from './Icone'

/**
 * PDF dentro do app, igual em qualquer aparelho: o pdf.js desenha cada página num canvas (o leitor do navegador
 * não serve — o Chrome do Android não mostra PDF embutido e o Safari do iPhone mostra só a 1ª página).
 * Quase tela cheia no celular; `acoes` fica no rodapé (baixar, enviar…).
 */
export function VisualizadorPdf({
  aberto,
  titulo,
  arquivo,
  erro,
  aoFechar,
  acoes,
}: {
  aberto: boolean
  titulo: string
  /** null enquanto o PDF é gerado. */
  arquivo: Blob | null
  erro?: string | null
  aoFechar: () => void
  acoes?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const paginas = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  const [desenho, setDesenho] = useState<{ arquivo: Blob; erro: boolean } | null>(null)
  // Zoom: no celular a página inteira na largura deixa a letra pequena. Redesenha na largura nova (nitidez).
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (aberto && !d.open) d.showModal()
    if (!aberto && d.open) d.close()
  }, [aberto])

  useEffect(() => {
    const alvo = paginas.current
    if (!aberto || !arquivo || !alvo) return
    let ativo = true
    ;(async () => {
      // pdf.js só carrega aqui, na primeira prévia (chunk à parte).
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      const carga = pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) })
      const doc = await carga.promise
      const largura = alvo.clientWidth
      const nitidez = Math.min(window.devicePixelRatio || 1, 2)
      const novas: HTMLCanvasElement[] = []
      for (let n = 1; n <= doc.numPages && ativo; n++) {
        const pagina = await doc.getPage(n)
        const escala = (largura / pagina.getViewport({ scale: 1 }).width) * nitidez
        const viewport = pagina.getViewport({ scale: escala })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.className = 'block w-full rounded-sm bg-white shadow-md'
        canvas.setAttribute('aria-label', `Página ${n} de ${doc.numPages}`)
        canvas.setAttribute('role', 'img')
        await pagina.render({ canvas, viewport }).promise
        novas.push(canvas)
      }
      await carga.destroy()
      // Troca tudo de uma vez: no zoom, a página antiga fica na tela até a nova estar pronta.
      if (ativo) {
        alvo.replaceChildren(...novas)
        setDesenho({ arquivo, erro: false })
      }
    })().catch(() => ativo && setDesenho({ arquivo, erro: true }))
    return () => {
      ativo = false
    }
  }, [aberto, arquivo, zoom])

  const pronto = !!arquivo && desenho?.arquivo === arquivo
  const falhou = !!erro || (pronto && desenho.erro)

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        aoFechar()
      }}
      aria-labelledby={idTitulo}
      className="m-auto flex h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-4xl flex-col rounded-lg bg-superficie p-0 text-texto shadow-xl backdrop:bg-navy-900/50 sm:h-[calc(100dvh-3rem)]"
    >
      <div className="flex items-center gap-3 border-b border-borda px-4 py-3">
        <h2 id={idTitulo} className="min-w-0 flex-1 truncate text-h2 font-semibold">
          {titulo}
        </h2>
        {pronto && !falhou && (
          <div className="flex items-center gap-1" role="group" aria-label="Zoom">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
              disabled={zoom <= 1}
              className="flex size-9 items-center justify-center rounded-md text-h2 leading-none text-texto-2 hover:bg-fundo hover:text-texto disabled:opacity-40"
            >
              −<span className="sr-only">Diminuir</span>
            </button>
            <span className="w-11 text-center text-legenda text-texto-3 tabular-nums">{zoom * 100}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z + 0.5))}
              disabled={zoom >= 3}
              className="flex size-9 items-center justify-center rounded-md text-h2 leading-none text-texto-2 hover:bg-fundo hover:text-texto disabled:opacity-40"
            >
              +<span className="sr-only">Aumentar</span>
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={aoFechar}
          className="flex size-9 items-center justify-center rounded-md text-texto-2 hover:bg-fundo hover:text-texto"
        >
          <Icone nome="fechar" className="size-5" />
          <span className="sr-only">Fechar</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-slate-200 p-3 sm:p-6">
        {falhou ? (
          <Aviso tom="erro">{erro ?? 'Não foi possível mostrar o PDF. Baixe para abrir no leitor do aparelho.'}</Aviso>
        ) : (
          !pronto && (
            <p className="py-10 text-center text-pequeno text-texto-2" aria-live="polite">
              {arquivo ? 'Abrindo o PDF…' : 'Gerando o PDF…'}
            </p>
          )
        )}
        <div
          ref={paginas}
          style={{ width: `calc(min(100%, 48rem) * ${zoom})` }}
          className={`mx-auto space-y-4 ${falhou ? 'hidden' : ''}`}
        />
      </div>

      {acoes && <div className="flex flex-wrap justify-end gap-2 border-t border-borda px-4 py-3">{acoes}</div>}
    </dialog>
  )
}
