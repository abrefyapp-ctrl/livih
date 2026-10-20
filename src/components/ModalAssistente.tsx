import { useEffect, useMemo, useRef, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import {
  aplicarProposta,
  baseComProposta,
  buscarSessao,
  desfazerProposta,
  enviarAoAssistente,
  sessaoAberta,
  type ModoAssistente,
  type SecoesEscolhidas,
  type SessaoAssistente,
} from '../services/assistente'
import { listarBase, type Agente, type ConteudoBase } from '../services/configuracoes'
import { alertas as calcularAlertas } from '../services/saudeAgente'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'
import { ModalSimulador } from './ModalSimulador'
import { TextoWhatsapp } from './TextoWhatsapp'

const casosDe = (a: Agente): string[] => {
  const r = a.regras_humano as { casos?: unknown } | null
  return Array.isArray(r?.casos) ? r.casos.filter((c): c is string => typeof c === 'string') : []
}
const mil = (n: number) => `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: n < 10_000 ? 1 : 0 })} mil`
const ACAO = { criar: 'Novo', atualizar: 'Editar', desativar: 'Desativar' } as const
const MENSAGEM_INICIAL: Record<ModoAssistente, string> = {
  revisar: 'Revise as orientações do meu agente e proponha uma versão melhor.',
  montar: 'Quero montar as orientações do meu agente do zero.',
}

/**
 * Configurações → Agente → Assistente: conversa que monta ou revisa as orientações e devolve uma proposta por seção.
 * Nada muda no agente sem "Aplicar"; logo depois dá para desfazer.
 */
export function ModalAssistente({
  agente,
  aoFechar,
  aoAplicado,
  modoInicial,
}: {
  agente: Agente
  aoFechar: () => void
  aoAplicado: () => void
  /** Vindo dos Primeiros passos: começa já no modo, sem a tela de escolha (se não houver conversa aberta). */
  modoInicial?: ModoAssistente
}) {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const [base, setBase] = useState<ConteudoBase[] | null>(null)
  const [sessao, setSessao] = useState<SessaoAssistente | null>(null)
  const [carregou, setCarregou] = useState(false)
  const [aba, setAba] = useState<'conversa' | 'proposta'>('conversa')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [escolhidas, setEscolhidas] = useState<SecoesEscolhidas>({ instrucoes: true, regras: true, base: [] })
  const [testando, setTestando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  const iniciou = useRef(false)

  useEffect(() => {
    let ativo = true
    Promise.all([listarBase(orgId), sessaoAberta(orgId)])
      .then(([b, s]) => {
        if (!ativo) return
        setBase(b)
        setSessao(s)
        setCarregou(true)
      })
      .catch(() => ativo && (setErro('Não foi possível abrir o assistente.'), setCarregou(true)))
    return () => {
      ativo = false
    }
  }, [orgId])

  // Enquanto o assistente pensa, acompanha a sessão a cada 3 s.
  const pensando = sessao?.status === 'pensando' ? sessao.id : null
  useEffect(() => {
    if (!pensando) return
    const t = setInterval(() => {
      buscarSessao(pensando)
        .then((s) => {
          if (!s || s.status === 'pensando') return
          setSessao(s)
          if (s.proposta) {
            setEscolhidas({ instrucoes: !!s.proposta.instrucoes, regras: !!s.proposta.regras, base: s.proposta.base.map((_, i) => i) })
          }
        })
        .catch(() => undefined)
    }, 3000)
    return () => clearInterval(t)
  }, [pensando])

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [sessao?.mensagens.length, sessao?.status, aba])

  const alertasTexto = useMemo(
    () =>
      base
        ? calcularAlertas({ prompt: agente.prompt, casos: casosDe(agente), ativo: agente.ativo }, base).map(
            (a) => `${a.titulo}: ${a.mensagem}`,
          )
        : [],
    [agente, base],
  )

  async function enviar(mensagem: string, modo: ModoAssistente) {
    if (!mensagem.trim() || enviando) return
    setEnviando(true)
    setErro(null)
    try {
      const id = await enviarAoAssistente(orgId, sessao && ['conversando', 'proposta', 'erro'].includes(sessao.status) ? sessao.id : null, modo, mensagem, alertasTexto)
      setTexto('')
      setSessao(await buscarSessao(id))
      setAba('conversa')
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  useEffect(() => {
    if (!carregou || sessao || !modoInicial || iniciou.current) return
    iniciou.current = true
    void enviar(MENSAGEM_INICIAL[modoInicial], modoInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura
  }, [carregou, sessao, modoInicial])

  async function aplicar() {
    if (!sessao) return
    setAplicando(true)
    setErro(null)
    try {
      await aplicarProposta(sessao.id, escolhidas)
      setSessao(await buscarSessao(sessao.id))
      aoAplicado()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setAplicando(false)
    }
  }

  async function desfazer() {
    if (!sessao) return
    setAplicando(true)
    try {
      await desfazerProposta(sessao.id)
      setSessao(await buscarSessao(sessao.id))
      aoAplicado()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setAplicando(false)
    }
  }

  const proposta = sessao?.proposta ?? null
  const casosAtuais = casosDe(agente)
  const rascunho = proposta && base
    ? {
        prompt: escolhidas.instrucoes && proposta.instrucoes ? proposta.instrucoes.texto : agente.prompt,
        casos: escolhidas.regras && proposta.regras ? proposta.regras.lista : casosAtuais,
        base: baseComProposta(base, proposta.base.filter((_, i) => escolhidas.base.includes(i))),
      }
    : null
  const terminada = sessao?.status === 'aplicada' || sessao?.status === 'desfeita'
  const modo: ModoAssistente = sessao?.modo ?? (agente.prompt.trim() ? 'revisar' : 'montar')

  return (
    <>
      <Modal
        aberto={!testando}
        titulo="Assistente do agente"
        largura="max-w-2xl"
        aoFechar={aoFechar}
        rodape={
          proposta && aba === 'proposta' && !terminada ? (
            <>
              <Botao variante="secundario" icone="conversas" onClick={() => setTestando(true)} disabled={aplicando}>
                Testar no simulador
              </Botao>
              <Botao onClick={() => void aplicar()} carregando={aplicando} disabled={sessao?.status === 'pensando'}>
                Aplicar o que está marcado
              </Botao>
            </>
          ) : (
            <Botao variante="secundario" onClick={aoFechar}>
              Fechar
            </Botao>
          )
        }
      >
        {!carregou ? (
          <p className="text-pequeno text-texto-3">Carregando…</p>
        ) : !sessao || terminada ? (
          <div className="space-y-4">
            {sessao?.status === 'aplicada' && (
              <Aviso
                acao={
                  <Botao tamanho="sm" variante="secundario" onClick={() => void desfazer()} carregando={aplicando}>
                    Desfazer
                  </Botao>
                }
              >
                Proposta aplicada. Vale a partir da próxima mensagem dos clientes.
              </Aviso>
            )}
            {sessao?.status === 'desfeita' && <Aviso>Desfeito: o agente voltou a ser como era antes.</Aviso>}
            <p className="text-pequeno text-texto-2">
              O assistente escreve ou enxuga as orientações do agente (instruções, quando chamar a equipe e base de
              conhecimento) e mostra uma proposta com o antes e o depois. Nada muda sem você aplicar.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={enviando}
                onClick={() => void enviar(MENSAGEM_INICIAL.revisar, 'revisar')}
                className="rounded-lg border border-borda p-4 text-left hover:border-primaria hover:bg-primaria-suave disabled:opacity-60"
              >
                <p className="font-semibold">Revisar o agente atual</p>
                <p className="mt-1 text-pequeno text-texto-3">
                  Ele lê o que já existe, aponta o que pesa ou se repete e propõe uma versão enxuta.
                </p>
              </button>
              <button
                type="button"
                disabled={enviando}
                onClick={() => void enviar(MENSAGEM_INICIAL.montar, 'montar')}
                className="rounded-lg border border-borda p-4 text-left hover:border-primaria hover:bg-primaria-suave disabled:opacity-60"
              >
                <p className="font-semibold">Montar do zero</p>
                <p className="mt-1 text-pequeno text-texto-3">
                  Algumas perguntas sobre a empresa, uma por vez, e ele escreve tudo para você revisar.
                </p>
              </button>
            </div>
            {enviando && <p className="text-pequeno text-texto-3">Abrindo a conversa…</p>}
            {erro && <Aviso tom="erro">{erro}</Aviso>}
          </div>
        ) : (
          <div className="space-y-3">
            {proposta && (
              <div className="flex gap-1 rounded-md bg-fundo p-1 text-pequeno">
                {(['conversa', 'proposta'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAba(a)}
                    className={`flex-1 rounded-sm px-3 py-1.5 font-medium ${aba === a ? 'bg-superficie shadow-sm' : 'text-texto-2'}`}
                  >
                    {a === 'conversa' ? 'Conversa' : 'Proposta'}
                  </button>
                ))}
              </div>
            )}

            {aba === 'conversa' || !proposta ? (
              <>
                <div className="h-[50vh] space-y-2 overflow-y-auto rounded-md bg-fundo p-3 ring-1 ring-borda">
                  {sessao.mensagens.map((m, i) =>
                    m.de === 'dono' ? (
                      <div key={i} className="flex justify-end">
                        <p className="max-w-[80%] rounded-lg bg-primaria px-3 py-2 text-pequeno whitespace-pre-wrap text-white">{m.texto}</p>
                      </div>
                    ) : (
                      <div key={i} className="flex justify-start">
                        <div className="max-w-[90%] rounded-lg bg-superficie px-3 py-2 text-pequeno ring-1 ring-borda">
                          <p className="mb-0.5 flex items-center gap-1 text-legenda font-semibold text-primaria">
                            <Icone nome="agente" className="size-3.5" /> Assistente
                          </p>
                          <p className="break-words whitespace-pre-wrap">
                            <TextoWhatsapp texto={m.texto} />
                          </p>
                        </div>
                      </div>
                    ),
                  )}
                  {sessao.status === 'pensando' && (
                    <p className="flex items-center gap-1.5 text-legenda text-texto-3">
                      <Icone nome="relogio" className="size-3.5" /> O assistente está lendo e escrevendo… (até 1 a 2 minutos)
                    </p>
                  )}
                  {sessao.status === 'proposta' && proposta && (
                    <button type="button" onClick={() => setAba('proposta')} className="text-pequeno font-medium text-primaria underline">
                      Ver a proposta
                    </button>
                  )}
                  <div ref={fim} />
                </div>
                {(erro || sessao.erro) && <Aviso tom="erro">{erro ?? sessao.erro}</Aviso>}
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void enviar(texto, modo)
                  }}
                  className="flex items-end gap-2"
                >
                  <label htmlFor="mensagem-assistente" className="sr-only">
                    Mensagem para o assistente
                  </label>
                  <textarea
                    id="mensagem-assistente"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        void enviar(texto, modo)
                      }
                    }}
                    rows={Math.min(4, Math.max(1, texto.split('\n').length))}
                    placeholder={proposta ? 'Peça ajustes na proposta' : 'Responda ao assistente'}
                    disabled={enviando || sessao.status === 'pensando'}
                    className="block max-h-32 min-h-10 flex-1 resize-none rounded-md border border-borda px-3 py-2 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
                  />
                  <Botao type="submit" icone="enviar" carregando={enviando} disabled={!texto.trim() || sessao.status === 'pensando'}>
                    Enviar
                  </Botao>
                </form>
              </>
            ) : (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                <p className="text-legenda text-texto-3">Marque o que quer aplicar. Teste no simulador antes, se quiser.</p>
                {erro && <Aviso tom="erro">{erro}</Aviso>}

                {proposta.instrucoes && (
                  <Secao
                    titulo="Instruções"
                    marcada={escolhidas.instrucoes}
                    aoMarcar={(v) => setEscolhidas({ ...escolhidas, instrucoes: v })}
                    resumo={`${mil(agente.prompt.length)} → ${mil(proposta.instrucoes.texto.length)} caracteres`}
                    porQue={proposta.instrucoes.por_que}
                    antes={agente.prompt}
                    depois={proposta.instrucoes.texto}
                  />
                )}
                {proposta.regras && (
                  <Secao
                    titulo="Quando chamar a equipe"
                    marcada={escolhidas.regras}
                    aoMarcar={(v) => setEscolhidas({ ...escolhidas, regras: v })}
                    resumo={`${casosAtuais.length} → ${proposta.regras.lista.length} regras`}
                    porQue={proposta.regras.por_que}
                    antes={casosAtuais.map((c) => `• ${c}`).join('\n')}
                    depois={proposta.regras.lista.map((c) => `• ${c}`).join('\n')}
                  />
                )}
                {proposta.base.map((item, i) => {
                  const atual = item.id ? base?.find((b) => b.id === item.id) : undefined
                  return (
                    <Secao
                      key={i}
                      titulo={`Base: ${item.titulo}`}
                      etiqueta={ACAO[item.acao]}
                      marcada={escolhidas.base.includes(i)}
                      aoMarcar={(v) =>
                        setEscolhidas({ ...escolhidas, base: v ? [...escolhidas.base, i] : escolhidas.base.filter((x) => x !== i) })
                      }
                      resumo={
                        item.acao === 'desativar'
                          ? `${mil(atual?.conteudo.length ?? 0)} caracteres a menos`
                          : item.acao === 'criar'
                            ? `${mil(item.conteudo?.length ?? 0)} caracteres`
                            : `${mil(atual?.conteudo.length ?? 0)} → ${mil(item.conteudo?.length ?? 0)} caracteres`
                      }
                      porQue={item.por_que}
                      antes={atual?.conteudo}
                      depois={item.acao === 'desativar' ? undefined : (item.conteudo ?? '')}
                    />
                  )
                })}
                {proposta.observacoes.length > 0 && (
                  <div className="rounded-md bg-info-suave px-3 py-2 text-pequeno text-info">
                    <p className="font-semibold">Para fazer fora daqui</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {proposta.observacoes.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
      {testando && (
        <ModalSimulador
          aberto
          aoFechar={() => setTestando(false)}
          rascunho={rascunho}
          rotuloRascunho="Testar com a proposta do assistente (só as partes marcadas)"
        />
      )}
    </>
  )
}

function Secao({
  titulo,
  etiqueta,
  marcada,
  aoMarcar,
  resumo,
  porQue,
  antes,
  depois,
}: {
  titulo: string
  etiqueta?: string
  marcada: boolean
  aoMarcar: (v: boolean) => void
  resumo: string
  porQue: string
  antes?: string
  depois?: string
}) {
  const [ver, setVer] = useState<'antes' | 'depois' | null>(null)
  return (
    <div className={`rounded-md border px-3 py-2.5 ${marcada ? 'border-primaria' : 'border-borda opacity-70'}`}>
      <label className="flex cursor-pointer items-start gap-2">
        <input type="checkbox" checked={marcada} onChange={(e) => aoMarcar(e.target.checked)} className="mt-0.5 size-4 accent-primaria" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 font-medium">
            {titulo}
            {etiqueta && <span className="rounded-sm bg-fundo px-1.5 text-legenda font-normal text-texto-2 ring-1 ring-borda">{etiqueta}</span>}
          </span>
          <span className="block text-legenda text-texto-3">{resumo}</span>
          <span className="mt-0.5 block text-pequeno text-texto-2">{porQue}</span>
        </span>
      </label>
      <div className="mt-1.5 flex gap-3 pl-6 text-legenda">
        {antes != null && (
          <button type="button" onClick={() => setVer(ver === 'antes' ? null : 'antes')} className="text-texto-3 underline hover:text-texto">
            {ver === 'antes' ? 'Esconder' : 'Ver antes'}
          </button>
        )}
        {depois != null && (
          <button type="button" onClick={() => setVer(ver === 'depois' ? null : 'depois')} className="font-medium text-primaria underline">
            {ver === 'depois' ? 'Esconder' : 'Ver como fica'}
          </button>
        )}
      </div>
      {ver && (
        <pre className="mt-2 max-h-72 overflow-auto rounded-sm bg-fundo p-2 text-legenda whitespace-pre-wrap">
          {ver === 'antes' ? antes : depois}
        </pre>
      )}
    </div>
  )
}
