import { useState } from 'react'
import { Aviso } from './Aviso'
import { Botao } from './Botao'

/** Caixa de resposta. Enter envia; Shift+Enter quebra a linha. */
export function Compositor({ dica, aoEnviar }: { dica?: string; aoEnviar: (texto: string) => Promise<void> }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar() {
    const t = texto.trim()
    if (!t || enviando) return
    setEnviando(true)
    setErro(null)
    try {
      await aoEnviar(t)
      setTexto('')
    } catch {
      setErro('A mensagem não foi enviada. Confira a conexão e tente de novo — o texto continua aqui.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void enviar()
      }}
      className="space-y-2 border-t border-borda bg-superficie p-3"
    >
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {dica && <p className="text-legenda text-texto-3">{dica}</p>}
      <div className="flex items-end gap-2">
        <label htmlFor="resposta" className="sr-only">
          Mensagem
        </label>
        <textarea
          id="resposta"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void enviar()
            }
          }}
          rows={Math.min(5, Math.max(1, texto.split('\n').length))}
          placeholder="Escreva uma mensagem"
          className="block max-h-40 min-h-10 flex-1 resize-none rounded-md border border-borda px-3 py-2 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
        />
        <Botao type="submit" icone="enviar" carregando={enviando} disabled={!texto.trim()}>
          <span className="hidden sm:inline">Enviar</span>
          <span className="sr-only sm:hidden">Enviar</span>
        </Botao>
      </div>
    </form>
  )
}
