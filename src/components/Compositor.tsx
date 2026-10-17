import { useRef, useState, type ReactNode } from 'react'
import { LIMITE_ARQUIVO } from '../services/atendimento'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/**
 * Caixa de resposta. Enter envia; Shift+Enter quebra a linha.
 * `acao` fica ao lado da caixa (ex.: enviar modelo); com `bloqueio`, a caixa dá lugar ao aviso.
 * Com `aoEnviarArquivo`, aparece o clipe (ou cola-se um arquivo/print): o texto vira a legenda.
 * Com `aoAbrirBiblioteca`, um botão ao lado abre os documentos cadastrados da empresa.
 */
export function Compositor({
  dica,
  aoEnviar,
  aoEnviarArquivo,
  aoAbrirBiblioteca,
  acao,
  bloqueio,
}: {
  dica?: string
  aoEnviar: (texto: string) => Promise<void>
  aoEnviarArquivo?: (arquivo: File, legenda: string) => Promise<void>
  aoAbrirBiblioteca?: () => void
  acao?: ReactNode
  bloqueio?: ReactNode
}) {
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const seletor = useRef<HTMLInputElement>(null)

  function escolher(f: File | undefined) {
    if (!f) return
    if (f.size > LIMITE_ARQUIVO) {
      setErro(`"${f.name}" tem ${tamanhoLegivel(f.size)}. O limite é ${tamanhoLegivel(LIMITE_ARQUIVO)}.`)
      return
    }
    setErro(null)
    setArquivo(f)
  }

  async function enviar() {
    const t = texto.trim()
    if (enviando || (!t && !arquivo)) return
    setEnviando(true)
    setErro(null)
    try {
      if (arquivo && aoEnviarArquivo) await aoEnviarArquivo(arquivo, t)
      else await aoEnviar(t)
      setTexto('')
      setArquivo(null)
    } catch {
      setErro(
        arquivo
          ? 'O arquivo não foi enviado. Confira a conexão e tente de novo — ele continua selecionado.'
          : 'A mensagem não foi enviada. Confira a conexão e tente de novo — o texto continua aqui.',
      )
    } finally {
      setEnviando(false)
    }
  }

  if (bloqueio)
    return (
      <div className="flex flex-wrap items-center gap-3 border-t border-borda bg-superficie p-3">
        <div className="min-w-0 flex-1 text-pequeno text-texto-2">{bloqueio}</div>
        {acao}
      </div>
    )

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
      {arquivo && (
        <div className="flex items-center gap-2 rounded-md bg-fundo px-3 py-2 ring-1 ring-borda">
          <Icone nome="clipe" className="size-4 shrink-0 text-texto-3" />
          <p className="min-w-0 flex-1 truncate text-pequeno">
            <span className="font-medium">{arquivo.name}</span>{' '}
            <span className="text-texto-3">· {tamanhoLegivel(arquivo.size)}</span>
          </p>
          <button
            type="button"
            onClick={() => setArquivo(null)}
            disabled={enviando}
            className="rounded-sm p-1 text-texto-3 hover:bg-superficie hover:text-texto"
          >
            <Icone nome="fechar" className="size-4" />
            <span className="sr-only">Tirar o arquivo</span>
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        {acao}
        {aoEnviarArquivo && (
          <>
            <input
              ref={seletor}
              type="file"
              className="hidden"
              onChange={(e) => {
                escolher(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <Botao variante="secundario" icone="clipe" disabled={enviando} onClick={() => seletor.current?.click()} title="Anexar arquivo do computador">
              <span className="sr-only">Anexar arquivo</span>
            </Botao>
          </>
        )}
        {aoAbrirBiblioteca && (
          <Botao variante="secundario" icone="livro" disabled={enviando} onClick={aoAbrirBiblioteca} title="Enviar documento da biblioteca">
            <span className="sr-only">Enviar documento da biblioteca</span>
          </Botao>
        )}
        <label htmlFor="resposta" className="sr-only">
          {arquivo ? 'Legenda' : 'Mensagem'}
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
          onPaste={(e) => {
            const f = e.clipboardData.files[0]
            if (f && aoEnviarArquivo) {
              e.preventDefault()
              escolher(f)
            }
          }}
          rows={Math.min(5, Math.max(1, texto.split('\n').length))}
          placeholder={arquivo ? 'Legenda (opcional)' : 'Escreva uma mensagem'}
          className="block max-h-40 min-h-10 flex-1 resize-none rounded-md border border-borda px-3 py-2 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
        />
        <Botao type="submit" icone="enviar" carregando={enviando} disabled={!texto.trim() && !arquivo}>
          <span className="hidden sm:inline">Enviar</span>
          <span className="sr-only sm:hidden">Enviar</span>
        </Botao>
      </div>
    </form>
  )
}
