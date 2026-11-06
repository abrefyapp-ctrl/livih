import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LIMITE_ARQUIVO } from '../services/atendimento'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** Resposta rápida já com o {nome} trocado; `pessoal` separa as da pessoa das da empresa na lista. */
export type RespostaPronta = { id: string; atalho: string; texto: string; pessoal: boolean }

// "/atalho" no fim do texto, no começo ou depois de um espaço (assim "https://site/x" não abre a lista).
const BARRA = /(^|\s)\/([^\s/]*)$/

/**
 * Caixa de resposta. Enter envia; Shift+Enter quebra a linha.
 * `acao` fica ao lado da caixa (ex.: enviar modelo); com `bloqueio`, a caixa dá lugar ao aviso.
 * Com `aoEnviarArquivo`, aparece o clipe (ou cola-se um arquivo/print): o texto vira a legenda.
 * Com `aoAbrirBiblioteca`, um botão ao lado abre os documentos cadastrados da empresa.
 * Com `respostas`, "/" (ou o botão do raio) abre as respostas rápidas; a escolhida entra no texto para revisar, não sai
 * sozinha.
 */
export function Compositor({
  dica,
  aoEnviar,
  aoEnviarArquivo,
  aoAbrirBiblioteca,
  acao,
  bloqueio,
  respostas,
}: {
  dica?: string
  aoEnviar: (texto: string) => Promise<void>
  aoEnviarArquivo?: (arquivo: File, legenda: string) => Promise<void>
  aoAbrirBiblioteca?: () => void
  acao?: ReactNode
  bloqueio?: ReactNode
  respostas?: RespostaPronta[]
}) {
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const seletor = useRef<HTMLInputElement>(null)
  const caixa = useRef<HTMLTextAreaElement>(null)
  const [destaque, setDestaque] = useState(0)
  // Esc fecha a lista até o texto mudar.
  const [listaFechadaEm, setListaFechadaEm] = useState<string | null>(null)

  const barra = respostas && !arquivo ? BARRA.exec(texto) : null
  const busca = barra?.[2].toLowerCase() ?? ''
  const opcoes = barra
    ? (respostas ?? [])
        .filter((r) => r.atalho.includes(busca) || (busca.length > 1 && r.texto.toLowerCase().includes(busca)))
        .sort(
          (a, b) =>
            Number(!a.atalho.startsWith(busca)) - Number(!b.atalho.startsWith(busca)) || Number(!a.pessoal) - Number(!b.pessoal),
        )
        .slice(0, 8)
    : []
  const listaAberta = !!barra && listaFechadaEm !== texto
  const indice = Math.min(destaque, Math.max(0, opcoes.length - 1))

  function usar(r: RespostaPronta) {
    const novo = barra ? texto.slice(0, barra.index + barra[1].length) + r.texto : r.texto
    setTexto(novo)
    setDestaque(0)
    requestAnimationFrame(() => {
      const el = caixa.current
      if (!el) return
      el.focus()
      el.setSelectionRange(novo.length, novo.length)
    })
  }

  function abrirRespostas() {
    setListaFechadaEm(null)
    setDestaque(0)
    setTexto(!texto || /\s$/.test(texto) ? texto + '/' : texto + ' /')
    requestAnimationFrame(() => caixa.current?.focus())
  }

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
        {respostas && !arquivo && (
          <Botao variante="secundario" icone="raio" disabled={enviando} onClick={abrirRespostas} title="Respostas rápidas (ou digite /)">
            <span className="sr-only">Respostas rápidas</span>
          </Botao>
        )}
        <label htmlFor="resposta" className="sr-only">
          {arquivo ? 'Legenda' : 'Mensagem'}
        </label>
        <div className="relative min-w-0 flex-1">
          {listaAberta && (
            <div className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-md bg-superficie shadow-lg ring-1 ring-borda">
              {!respostas?.length ? (
                <p className="px-3 py-2.5 text-pequeno text-texto-2">
                  Nenhuma resposta rápida ainda.{' '}
                  <Link to="/configuracoes/respostas" className="font-medium text-primaria underline">
                    Criar em Configurações
                  </Link>
                </p>
              ) : !opcoes.length ? (
                <p className="px-3 py-2.5 text-pequeno text-texto-3">Nenhuma resposta com “{busca}”. Enter envia o texto como está.</p>
              ) : (
                <ul role="listbox" id="respostas-rapidas" aria-label="Respostas rápidas" className="max-h-72 overflow-y-auto py-1">
                  {opcoes.map((r, i) => (
                    <li
                      key={r.id}
                      id={`resposta-${r.id}`}
                      role="option"
                      aria-selected={i === indice}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        usar(r)
                      }}
                      onMouseEnter={() => setDestaque(i)}
                      className={`cursor-pointer px-3 py-2 ${i === indice ? 'bg-primaria-suave' : ''}`}
                    >
                      <p className="flex items-center gap-2 text-pequeno font-medium">
                        /{r.atalho}
                        {r.pessoal && <span className="text-legenda font-normal text-texto-3">minha</span>}
                      </p>
                      <p className="line-clamp-2 text-legenda whitespace-pre-line text-texto-2">{r.texto}</p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="border-t border-borda bg-fundo px-3 py-1.5 text-legenda text-texto-3">
                <span className="hidden sm:inline">↑↓ para escolher · Enter ou Tab para usar · Esc para fechar · </span>
                <Link to="/configuracoes/respostas" className="underline hover:text-texto">
                  Editar as respostas
                </Link>
              </p>
            </div>
          )}
          <textarea
            ref={caixa}
            id="resposta"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            role={respostas ? 'combobox' : undefined}
            aria-expanded={respostas ? listaAberta && opcoes.length > 0 : undefined}
            aria-controls={respostas ? 'respostas-rapidas' : undefined}
            aria-activedescendant={listaAberta && opcoes[indice] ? `resposta-${opcoes[indice].id}` : undefined}
            onKeyDown={(e) => {
              if (listaAberta && opcoes.length) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  setDestaque((indice + (e.key === 'ArrowDown' ? 1 : opcoes.length - 1)) % opcoes.length)
                  return
                }
                if ((e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) || e.key === 'Tab') {
                  e.preventDefault()
                  usar(opcoes[indice])
                  return
                }
              }
              if (listaAberta && e.key === 'Escape') {
                e.preventDefault()
                setListaFechadaEm(texto)
                return
              }
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
            placeholder={arquivo ? 'Legenda (opcional)' : respostas ? 'Mensagem, ou / para respostas rápidas' : 'Escreva uma mensagem'}
            className="block max-h-40 min-h-10 w-full resize-none rounded-md border border-borda px-3 py-2 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
        </div>
        <Botao type="submit" icone="enviar" carregando={enviando} disabled={!texto.trim() && !arquivo}>
          <span className="hidden sm:inline">Enviar</span>
          <span className="sr-only sm:hidden">Enviar</span>
        </Botao>
      </div>
    </form>
  )
}
