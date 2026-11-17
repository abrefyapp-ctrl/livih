import { useEffect, useRef, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import {
  AUDIO_MAX_BYTES,
  AUDIO_MAX_SEGUNDOS,
  descreverPasso,
  duracaoAudio,
  prepararAudio,
  reduzirFoto,
  simular,
  type MensagemTeste,
} from '../services/simulador'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'
import { TextoWhatsapp } from './TextoWhatsapp'

type Anexo = { tipo: 'imagem' | 'audio'; arquivo: Blob; url: string; segundos?: number }

const relogio = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// O que o navegador sabe gravar e a transcrição aceita: webm (Chrome, Edge, Firefox) ou mp4 (Safari).
const formatoGravacao = () =>
  ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''

/**
 * Configurações → Agente → Testar agente: conversa com o próprio agente sem WhatsApp. Buscas são reais; orçamento,
 * envio e chamar a equipe só aparecem como "faria". Com `rascunho`, dá para testar instruções ainda não salvas.
 * Foto e áudio (17/11) passam pela mesma descrição e transcrição da entrada pelo WhatsApp, e a tela mostra o que o
 * agente leu de cada um.
 */
export function ModalSimulador({
  aberto,
  aoFechar,
  rascunho,
  rotuloRascunho = 'Testar com as alterações ainda não salvas (instruções e regras)',
}: {
  aberto: boolean
  aoFechar: () => void
  rascunho: { prompt: string; casos: string[]; base?: string } | null
  /** Texto do aviso do rascunho (padrão: alterações não salvas do formulário). */
  rotuloRascunho?: string
}) {
  const { orgAtiva } = useSessao()
  const [mensagens, setMensagens] = useState<MensagemTeste[]>([])
  const [texto, setTexto] = useState('')
  const [anexo, setAnexo] = useState<Anexo | null>(null)
  const [gravando, setGravando] = useState<number | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [usarRascunho, setUsarRascunho] = useState(true)
  const [detalhes, setDetalhes] = useState<number | null>(null)
  const fim = useRef<HTMLDivElement>(null)
  const seletor = useRef<HTMLInputElement>(null)
  const gravador = useRef<{ recorder: MediaRecorder; inicio: number; cancelar: boolean; timer: number } | null>(null)

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [mensagens, enviando])

  // Fechou a janela no meio da gravação: para o microfone.
  useEffect(() => {
    if (aberto) return
    const g = gravador.current
    if (g) {
      g.cancelar = true
      g.recorder.stop()
    }
  }, [aberto])

  function trocarAnexo(novo: Anexo | null) {
    if (anexo) URL.revokeObjectURL(anexo.url)
    setAnexo(novo)
  }

  async function escolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return
    setErro(null)
    try {
      const audio = arquivo.type.startsWith('image/') ? null : prepararAudio(arquivo)
      if (arquivo.type.startsWith('image/')) {
        const foto = await reduzirFoto(arquivo)
        trocarAnexo({ tipo: 'imagem', arquivo: foto, url: URL.createObjectURL(foto) })
      } else if (audio) {
        if (audio.size > AUDIO_MAX_BYTES) {
          throw new Error('Áudio grande demais (o limite é 10 MB). Escolha um mais curto ou grave pelo microfone.')
        }
        const segundos = await duracaoAudio(audio)
        if (segundos > AUDIO_MAX_SEGUNDOS) {
          throw new Error('Áudio com mais de 5 minutos. No WhatsApp o agente também não transcreve áudios tão longos. Escolha um mais curto.')
        }
        trocarAnexo({ tipo: 'audio', arquivo: audio, url: URL.createObjectURL(audio), segundos })
      } else {
        throw new Error(
          'Esse arquivo não serve para o teste. Escolha uma foto (JPG, PNG ou WebP) ou um áudio (MP3, M4A, OGG, OPUS, WebM ou WAV).',
        )
      }
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  async function gravar() {
    setErro(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErro('Este navegador não grava áudio. Escolha um arquivo de áudio pelo clipe.')
      return
    }
    let fluxo: MediaStream
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setErro(
        'A Livih não conseguiu usar o microfone. Confira se ele está ligado e se o navegador liberou o acesso a este site (no cadeado, ao lado do endereço). Depois, tente de novo.',
      )
      return
    }
    const formato = formatoGravacao()
    const recorder = new MediaRecorder(fluxo, formato ? { mimeType: formato } : undefined)
    const partes: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size) partes.push(e.data)
    }
    recorder.onstop = () => {
      fluxo.getTracks().forEach((t) => t.stop())
      const g = gravador.current
      gravador.current = null
      setGravando(null)
      if (!g) return
      window.clearInterval(g.timer)
      if (g.cancelar || !partes.length) return
      const arquivo = new Blob(partes, { type: (recorder.mimeType || formato || 'audio/webm').split(';')[0] })
      const segundos = Math.round((Date.now() - g.inicio) / 1000)
      trocarAnexo({ tipo: 'audio', arquivo, url: URL.createObjectURL(arquivo), segundos })
    }
    const inicio = Date.now()
    const timer = window.setInterval(() => {
      const s = Math.floor((Date.now() - inicio) / 1000)
      setGravando(s)
      // Mais de 5 min o agente não ouviria: para sozinho.
      if (s >= AUDIO_MAX_SEGUNDOS && recorder.state === 'recording') recorder.stop()
    }, 250)
    gravador.current = { recorder, inicio, cancelar: false, timer }
    recorder.start()
    setGravando(0)
  }

  function pararGravacao(cancelar: boolean) {
    const g = gravador.current
    if (!g) return
    g.cancelar = cancelar
    g.recorder.stop()
  }

  async function enviar() {
    const t = texto.trim()
    if ((!t && !anexo) || enviando || !orgAtiva || gravando !== null) return
    const nova: MensagemTeste = anexo
      ? { de: 'cliente', tipo: anexo.tipo, texto: anexo.tipo === 'audio' ? '' : t, url: anexo.url }
      : { de: 'cliente', texto: t }
    const midia = anexo ? { tipo: anexo.tipo, arquivo: anexo.arquivo, segundos: anexo.segundos } : null
    const anexoEnviado = anexo
    const conversa: MensagemTeste[] = [...mensagens, nova]
    setMensagens(conversa)
    // O áudio vai sem texto: o que estava escrito fica na caixa para a próxima mensagem.
    if (anexo?.tipo !== 'audio') setTexto('')
    setAnexo(null)
    setEnviando(true)
    setErro(null)
    try {
      const r = await simular(orgAtiva.id, conversa, rascunho && usarRascunho ? rascunho : null, midia)
      // A descrição da foto ou a transcrição do áudio fica na mensagem e vai como texto nas próximas perguntas.
      const enviada: MensagemTeste = r.midia ? { ...nova, texto: r.midia.texto, descricao: r.midia.descricao, lida: true } : nova
      const novas: MensagemTeste[] = []
      if (r.saudacao) novas.push({ de: 'assistente', texto: r.saudacao, saudacao: true })
      if (r.resposta) novas.push({ de: 'assistente', texto: r.resposta, passos: r.passos })
      else if (r.passos.length) novas.push({ de: 'assistente', texto: '', passos: r.passos })
      setMensagens([...mensagens, enviada, ...novas])
      if (!novas.length) setErro('O agente entendeu que não precisava responder a esta mensagem.')
    } catch (e) {
      // A mensagem volta para a caixa, para tentar de novo.
      setMensagens(mensagens)
      setTexto(t)
      setAnexo(anexoEnviado)
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  function recomecar() {
    mensagens.forEach((m) => m.url && URL.revokeObjectURL(m.url))
    trocarAnexo(null)
    setMensagens([])
    setErro(null)
    setDetalhes(null)
  }

  return (
    <Modal
      aberto={aberto}
      titulo="Testar agente"
      aoFechar={aoFechar}
      largura="max-w-2xl"
      rodape={
        <>
          <Botao variante="secundario" onClick={recomecar} disabled={enviando || (!mensagens.length && !anexo)}>
            Recomeçar
          </Botao>
          <Botao variante="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-legenda text-texto-3">
          Você escreve, manda foto ou grava áudio como se fosse o cliente. Nada vai para o WhatsApp nem fica no
          histórico. As buscas de produtos e documentos são reais; orçamento, envio de arquivo e chamar a equipe só
          aparecem como o que o agente faria.
        </p>
        {rascunho && (
          <label className="flex cursor-pointer items-center gap-2 rounded-md bg-atencao-suave px-3 py-2 text-pequeno text-atencao">
            <input
              type="checkbox"
              checked={usarRascunho}
              onChange={(e) => setUsarRascunho(e.target.checked)}
              className="size-4 accent-primaria"
            />
            {rotuloRascunho}
          </label>
        )}

        <div className="h-[50vh] space-y-2 overflow-y-auto rounded-md bg-fundo p-3 ring-1 ring-borda">
          {!mensagens.length && (
            <p className="py-10 text-center text-pequeno text-texto-3">
              Comece como um cliente começaria: escreva “oi, vocês têm grampo 14/19?”, mande a foto de um produto ou
              grave um áudio.
            </p>
          )}
          {mensagens.map((m, i) =>
            m.de === 'cliente' ? (
              <div key={i} className="flex flex-col items-end gap-1">
                <div className="max-w-[80%] space-y-1.5 rounded-lg bg-primaria px-3 py-2 text-pequeno text-white">
                  {m.tipo === 'imagem' && m.url && (
                    <img src={m.url} alt="Foto enviada no teste" className="max-h-48 rounded-md" />
                  )}
                  {m.tipo === 'audio' && m.url && <audio controls src={m.url} className="h-9 max-w-full" />}
                  {m.texto && m.tipo !== 'audio' && <p className="whitespace-pre-wrap">{m.texto}</p>}
                </div>
                {m.lida && <LeituraDoAgente mensagem={m} />}
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] space-y-1.5 rounded-lg bg-superficie px-3 py-2 text-pequeno ring-1 ring-borda">
                  <p className="flex items-center gap-1 text-legenda font-semibold text-primaria">
                    <Icone nome="agente" className="size-3.5" />
                    {m.saudacao ? 'Saudação automática' : 'Agente'}
                  </p>
                  {m.texto && (
                    <p className="break-words whitespace-pre-wrap">
                      <TextoWhatsapp texto={m.texto} />
                    </p>
                  )}
                  {m.passos && m.passos.length > 0 && (
                    <div className="border-t border-borda pt-1.5">
                      <ul className="space-y-0.5 text-legenda text-texto-2">
                        {m.passos.map((p, j) => (
                          <li key={j} className="flex items-start gap-1">
                            <Icone nome="check" className="mt-0.5 size-3 shrink-0 text-texto-3" />
                            {descreverPasso(p)}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => setDetalhes(detalhes === i ? null : i)}
                        className="mt-1 text-legenda text-texto-3 underline hover:text-texto"
                      >
                        {detalhes === i ? 'Esconder detalhes' : 'Ver o que as ferramentas devolveram'}
                      </button>
                      {detalhes === i && (
                        <pre className="mt-1 max-h-60 overflow-auto rounded-sm bg-fundo p-2 text-legenda whitespace-pre-wrap">
                          {m.passos.map((p) => `${p.ferramenta}\n${JSON.stringify(p.entrada)}\n→ ${p.saida}`).join('\n\n')}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          {enviando && (
            <p className="flex items-center gap-1.5 text-legenda text-texto-3">
              <Icone nome="relogio" className="size-3.5" />
              {mensagens[mensagens.length - 1]?.tipo === 'imagem'
                ? 'Lendo a foto e pensando… (pode levar até 1 minuto)'
                : mensagens[mensagens.length - 1]?.tipo === 'audio'
                  ? 'Transcrevendo o áudio e pensando… (pode levar até 1 minuto)'
                  : 'O agente está pensando… (pode levar até 30 segundos)'}
            </p>
          )}
          <div ref={fim} />
        </div>

        {erro && <Aviso tom={erro.startsWith('O agente entendeu') ? 'info' : 'erro'}>{erro}</Aviso>}

        {anexo && (
          <div className="flex items-center gap-2 rounded-md bg-fundo px-3 py-2 ring-1 ring-borda">
            {anexo.tipo === 'imagem' ? (
              <img src={anexo.url} alt="Foto para enviar" className="size-12 rounded-sm object-cover" />
            ) : (
              <audio controls src={anexo.url} className="h-9 min-w-0 flex-1" />
            )}
            <p className="min-w-0 flex-1 text-pequeno text-texto-2">
              {anexo.tipo === 'imagem'
                ? 'Foto pronta. Escreva uma legenda, se quiser, e envie.'
                : `Áudio pronto${anexo.segundos ? ` (${relogio(anexo.segundos)})` : ''}.`}
            </p>
            <button
              type="button"
              onClick={() => trocarAnexo(null)}
              disabled={enviando}
              title={anexo.tipo === 'imagem' ? 'Remover a foto' : 'Remover o áudio'}
              className="rounded-sm p-1 text-texto-3 hover:bg-superficie hover:text-texto"
            >
              <Icone nome="fechar" className="size-4" />
              <span className="sr-only">{anexo.tipo === 'imagem' ? 'Remover a foto' : 'Remover o áudio'}</span>
            </button>
          </div>
        )}

        {gravando !== null ? (
          <div className="flex items-center gap-2 rounded-md bg-erro-suave px-3 py-2">
            <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-erro" />
            <p className="flex-1 text-pequeno text-erro">
              Gravando {relogio(gravando)} <span className="text-texto-3">(até 5:00)</span>
            </p>
            <Botao variante="secundario" tamanho="sm" onClick={() => pararGravacao(true)}>
              Cancelar
            </Botao>
            <Botao tamanho="sm" icone="check" onClick={() => pararGravacao(false)}>
              Parar
            </Botao>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void enviar()
            }}
            className="flex items-end gap-2"
          >
            <input
              ref={seletor}
              type="file"
              accept="image/jpeg,image/png,image/webp,audio/*,.opus,.ogg,.m4a"
              className="hidden"
              onChange={(e) => {
                void escolherArquivo(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <Botao
              variante="secundario"
              icone="clipe"
              disabled={enviando}
              onClick={() => seletor.current?.click()}
              title="Mandar uma foto ou um áudio já salvo"
            >
              <span className="sr-only">Mandar foto ou áudio</span>
            </Botao>
            <Botao
              variante="secundario"
              icone="microfone"
              disabled={enviando || anexo?.tipo === 'imagem'}
              onClick={() => void gravar()}
              title={anexo?.tipo === 'imagem' ? 'Remova a foto para gravar um áudio' : 'Gravar um áudio como o cliente'}
            >
              <span className="sr-only">Gravar áudio</span>
            </Botao>
            <label htmlFor="mensagem-teste" className="sr-only">
              Mensagem do cliente
            </label>
            <textarea
              id="mensagem-teste"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void enviar()
                }
              }}
              rows={Math.min(4, Math.max(1, texto.split('\n').length))}
              placeholder={
                anexo?.tipo === 'audio' ? 'O áudio vai sem texto, como no WhatsApp' : anexo ? 'Legenda (opcional)' : 'Escreva como o cliente'
              }
              disabled={enviando || anexo?.tipo === 'audio'}
              className="block max-h-32 min-h-10 min-w-0 flex-1 resize-none rounded-md border border-borda px-3 py-2 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
            <Botao type="submit" icone="enviar" carregando={enviando} disabled={!texto.trim() && !anexo}>
              Enviar
            </Botao>
          </form>
        )}
      </div>
    </Modal>
  )
}

/** O que o agente leu da foto ou do áudio, para conferir se o teste vale. */
function LeituraDoAgente({ mensagem: m }: { mensagem: MensagemTeste }) {
  if (m.tipo === 'audio') {
    return m.texto ? (
      <p className="max-w-[80%] text-right text-legenda text-texto-3">
        Transcrição: <span className="italic">“{m.texto}”</span>
      </p>
    ) : (
      <p className="max-w-[80%] text-right text-legenda text-atencao">
        Não deu para transcrever: o agente vai pedir que o cliente escreva ou mande um áudio mais curto.
      </p>
    )
  }
  if (m.tipo !== 'imagem') return null
  return m.descricao ? (
    <details className="max-w-[80%] text-legenda text-texto-3">
      <summary className="cursor-pointer text-right hover:text-texto">O que o agente leu da foto</summary>
      <p className="mt-1 rounded-sm bg-superficie p-2 whitespace-pre-wrap ring-1 ring-borda">{m.descricao}</p>
    </details>
  ) : (
    <p className="max-w-[80%] text-right text-legenda text-atencao">
      Não deu para ler a foto: o agente vai dizer que não abre o arquivo e pedir por escrito.
    </p>
  )
}
