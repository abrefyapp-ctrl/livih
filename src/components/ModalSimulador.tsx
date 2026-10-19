import { useEffect, useRef, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import { descreverPasso, simular, type MensagemTeste } from '../services/simulador'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'
import { TextoWhatsapp } from './TextoWhatsapp'

/**
 * Configurações → Agente → Testar agente: conversa com o próprio agente sem WhatsApp. Buscas são reais; orçamento,
 * envio e chamar a equipe só aparecem como "faria". Com `rascunho`, dá para testar instruções ainda não salvas.
 */
export function ModalSimulador({
  aberto,
  aoFechar,
  rascunho,
}: {
  aberto: boolean
  aoFechar: () => void
  rascunho: { prompt: string; casos: string[] } | null
}) {
  const { orgAtiva } = useSessao()
  const [mensagens, setMensagens] = useState<MensagemTeste[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [usarRascunho, setUsarRascunho] = useState(true)
  const [detalhes, setDetalhes] = useState<number | null>(null)
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [mensagens, enviando])

  async function enviar() {
    const t = texto.trim()
    if (!t || enviando || !orgAtiva) return
    const conversa: MensagemTeste[] = [...mensagens, { de: 'cliente', texto: t }]
    setMensagens(conversa)
    setTexto('')
    setEnviando(true)
    setErro(null)
    try {
      const r = await simular(orgAtiva.id, conversa, rascunho && usarRascunho ? rascunho : null)
      const novas: MensagemTeste[] = []
      if (r.saudacao) novas.push({ de: 'assistente', texto: r.saudacao, saudacao: true })
      if (r.resposta) novas.push({ de: 'assistente', texto: r.resposta, passos: r.passos })
      else if (r.passos.length) novas.push({ de: 'assistente', texto: '', passos: r.passos })
      setMensagens([...conversa, ...novas])
      if (!novas.length) setErro('O agente entendeu que não precisava responder a esta mensagem.')
    } catch (e) {
      // A mensagem volta para a caixa, para tentar de novo.
      setMensagens(mensagens)
      setTexto(t)
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  function recomecar() {
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
          <Botao variante="secundario" onClick={recomecar} disabled={enviando || !mensagens.length}>
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
          Você escreve como se fosse o cliente. Nada vai para o WhatsApp nem fica no histórico. As buscas de produtos e
          documentos são reais; orçamento, envio de arquivo e chamar a equipe só aparecem como o que o agente faria.
        </p>
        {rascunho && (
          <label className="flex cursor-pointer items-center gap-2 rounded-md bg-atencao-suave px-3 py-2 text-pequeno text-atencao">
            <input
              type="checkbox"
              checked={usarRascunho}
              onChange={(e) => setUsarRascunho(e.target.checked)}
              className="size-4 accent-primaria"
            />
            Testar com as alterações ainda não salvas (instruções e regras)
          </label>
        )}

        <div className="h-[50vh] space-y-2 overflow-y-auto rounded-md bg-fundo p-3 ring-1 ring-borda">
          {!mensagens.length && (
            <p className="py-10 text-center text-pequeno text-texto-3">
              Comece como um cliente começaria. Ex.: “oi, vocês têm grampo 14/19?”
            </p>
          )}
          {mensagens.map((m, i) =>
            m.de === 'cliente' ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[80%] rounded-lg bg-primaria px-3 py-2 text-pequeno whitespace-pre-wrap text-white">{m.texto}</p>
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
              <Icone nome="relogio" className="size-3.5" /> O agente está pensando… (pode levar até 30 segundos)
            </p>
          )}
          <div ref={fim} />
        </div>

        {erro && <Aviso tom={erro.startsWith('O agente entendeu') ? 'info' : 'erro'}>{erro}</Aviso>}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void enviar()
          }}
          className="flex items-end gap-2"
        >
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
            placeholder="Escreva como o cliente"
            disabled={enviando}
            className="block max-h-32 min-h-10 flex-1 resize-none rounded-md border border-borda px-3 py-2 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
          <Botao type="submit" icone="enviar" carregando={enviando} disabled={!texto.trim()}>
            Enviar
          </Botao>
        </form>
      </div>
    </Modal>
  )
}
