import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSessao } from '../hooks/useSessao'
import { listarNumeros, type NumeroWhatsapp } from '../services/configuracoes'
import {
  apagarModelo,
  criarModelo,
  listarModelos,
  nomeTecnico,
  ROTULO_CATEGORIA,
  ROTULO_IDIOMA,
  ROTULO_STATUS,
  variaveisDe,
  type Modelo,
  type ModeloNovo,
} from '../services/modelos'
import { formatarTelefone } from '../services/formato'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { EstadoVazio } from './EstadoVazio'
import { Icone } from './Icone'
import { Modal } from './Modal'
import { TextoWhatsapp } from './TextoWhatsapp'

const TONS = {
  ok: 'bg-primaria-suave text-primaria',
  atencao: 'bg-atencao-suave text-atencao',
  erro: 'bg-erro-suave text-erro',
  neutro: 'bg-slate-100 text-texto-3',
}

const VAZIO: ModeloNovo = {
  nome: '',
  categoria: 'UTILITY',
  idioma: 'pt_BR',
  cabecalho: '',
  corpo: '',
  exemplos: [],
  rodape: '',
  botoes: [],
}

const CLASSE_CAMPO =
  'block w-full rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none'

function Etiqueta({ status }: { status: string }) {
  const s = ROTULO_STATUS[status] ?? { texto: status, tom: 'neutro' as const }
  return <span className={`inline-flex rounded-sm px-1.5 py-0.5 text-legenda font-medium ${TONS[s.tom]}`}>{s.texto}</span>
}

/** Como a mensagem chega no WhatsApp, com os exemplos no lugar das variáveis. */
function Previa({ cabecalho, corpo, rodape, botoes, exemplos }: Pick<ModeloNovo, 'cabecalho' | 'corpo' | 'rodape' | 'botoes' | 'exemplos'>) {
  const texto = corpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (marca, n) => exemplos[Number(n) - 1]?.trim() || marca)
  const listaBotoes = botoes.filter((b) => b.trim())
  return (
    <div className="rounded-lg bg-[#efeae2] p-3">
      <div className="max-w-xs overflow-hidden rounded-lg bg-white text-pequeno shadow-sm">
        <div className="space-y-1 px-3 py-2">
          {cabecalho.trim() && <p className="font-semibold">{cabecalho}</p>}
          <p className="break-words whitespace-pre-wrap">
            {texto.trim() ? <TextoWhatsapp texto={texto} /> : <span className="text-texto-3">O texto da mensagem aparece aqui.</span>}
          </p>
          {rodape.trim() && <p className="text-legenda text-texto-3">{rodape}</p>}
        </div>
        {listaBotoes.map((b, i) => (
          <p key={i} className="border-t border-borda py-2 text-center font-medium text-info">
            {b}
          </p>
        ))}
      </div>
    </div>
  )
}

function corpoDe(m: Modelo) {
  return m.components.find((c) => c.type === 'BODY')?.text ?? ''
}

export function SecaoModelos() {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'

  const [numeros, setNumeros] = useState<{ orgId: string; lista: NumeroWhatsapp[] } | null>(null)
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [modelos, setModelos] = useState<{ canalId: string; lista: Modelo[] } | null>(null)
  const [versao, setVersao] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState<ModeloNovo | null>(null)
  const [erroNovo, setErroNovo] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState<Modelo | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const refCorpo = useRef<HTMLTextAreaElement>(null)

  const oficiais = numeros?.orgId === orgId ? numeros.lista.filter((n) => n.tipo === 'meta') : null
  const canalId = oficiais?.some((n) => n.id === escolhido) ? escolhido : (oficiais?.[0]?.id ?? null)
  const lista = canalId && modelos?.canalId === canalId ? modelos.lista : null

  useEffect(() => {
    let ativo = true
    listarNumeros(orgId)
      .then((l) => ativo && setNumeros({ orgId, lista: l }))
      .catch((e) => ativo && setErro((e as Error).message))
    return () => {
      ativo = false
    }
  }, [orgId])

  // A Meta leva de minutos a horas para analisar: com algum modelo em análise, confere de novo a cada 30 s.
  useEffect(() => {
    if (!canalId) return
    let ativo = true
    let espera: ReturnType<typeof setTimeout>
    const ler = () =>
      listarModelos(orgId, canalId)
        .then((l) => {
          if (!ativo) return
          setModelos({ canalId, lista: l })
          setErro(null)
          if (l.some((m) => m.status === 'PENDING' || m.status === 'IN_APPEAL')) espera = setTimeout(ler, 30_000)
        })
        .catch((e) => ativo && setErro((e as Error).message))
    void ler()
    return () => {
      ativo = false
      clearTimeout(espera)
    }
  }, [orgId, canalId, versao])

  const variaveis = novo ? variaveisDe(novo.corpo) : []

  function inserirVariavel() {
    if (!novo) return
    const n = (variaveis.at(-1) ?? 0) + 1
    const campo = refCorpo.current
    const inicio = campo?.selectionStart ?? novo.corpo.length
    const fim = campo?.selectionEnd ?? novo.corpo.length
    const marca = `{{${n}}}`
    setNovo({ ...novo, corpo: novo.corpo.slice(0, inicio) + marca + novo.corpo.slice(fim) })
    requestAnimationFrame(() => {
      campo?.focus()
      campo?.setSelectionRange(inicio + marca.length, inicio + marca.length)
    })
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!novo || !canalId) return
    setSalvando(true)
    setErroNovo(null)
    try {
      await criarModelo(orgId, canalId, {
        ...novo,
        nome: novo.nome.replace(/_+$/, ''),
        exemplos: variaveis.map((n) => novo.exemplos[n - 1] ?? ''),
        botoes: novo.botoes.filter((b) => b.trim()),
      })
      setNovo(null)
      setVersao((v) => v + 1)
    } catch (e) {
      setErroNovo((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function apagar() {
    if (!apagando || !canalId) return
    setOcupado(true)
    try {
      await apagarModelo(orgId, canalId, apagando.name)
      setApagando(null)
      setVersao((v) => v + 1)
    } catch (e) {
      setErro((e as Error).message)
      setApagando(null)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <section aria-labelledby="titulo-modelos" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-modelos" className="text-h2 font-semibold">
            Modelos de mensagem
          </h2>
          <p className="max-w-xl text-pequeno text-texto-3">
            Na API oficial do WhatsApp, passadas 24 horas da última mensagem do cliente, só dá para escrever para ele com um
            modelo aprovado pela Meta. A análise leva de minutos a algumas horas.
          </p>
        </div>
        {gerencia && canalId && (
          <Botao
            icone="mais"
            onClick={() => {
              setErroNovo(null)
              setNovo(VAZIO)
            }}
          >
            Novo modelo
          </Botao>
        )}
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!oficiais ? (
        <p className="text-pequeno text-texto-3" aria-busy="true">
          Carregando…
        </p>
      ) : !oficiais.length ? (
        <div className="rounded-lg border border-borda bg-superficie">
          <EstadoVazio icone="arquivo" titulo="Nenhum número na API oficial">
            Modelos só existem em números conectados pela API oficial do WhatsApp. Os números ligados pelo celular (QR code)
            conversam sem modelo.
          </EstadoVazio>
        </div>
      ) : (
        <>
          {oficiais.length > 1 && (
            <div className="max-w-sm space-y-1.5">
              <label htmlFor="numero-modelos" className="block text-pequeno font-medium text-texto-2">
                Número
              </label>
              <select
                id="numero-modelos"
                value={canalId ?? ''}
                onChange={(e) => setEscolhido(e.target.value)}
                className={`${CLASSE_CAMPO} h-10`}
              >
                {oficiais.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                    {n.numero_conectado ? ` · ${formatarTelefone(n.numero_conectado)}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!lista ? (
            <p className="text-pequeno text-texto-3" aria-busy="true">
              Consultando a Meta…
            </p>
          ) : !lista.length ? (
            <div className="rounded-lg border border-borda bg-superficie">
              <EstadoVazio
                icone="arquivo"
                titulo="Nenhum modelo ainda"
                acao={
                  gerencia && (
                    <Botao icone="mais" onClick={() => setNovo(VAZIO)}>
                      Criar o primeiro modelo
                    </Botao>
                  )
                }
              >
                Um bom começo: um aviso de retorno, como “Olá, {'{{1}}'}! Sobre o seu pedido, podemos continuar por aqui?”.
              </EstadoVazio>
            </div>
          ) : (
            <ul className="space-y-3">
              {lista.map((m) => (
                <li key={m.id} className="rounded-lg border border-borda bg-superficie p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-pequeno font-medium break-all">{m.name}</span>
                        <Etiqueta status={m.status} />
                      </p>
                      <p className="text-legenda text-texto-3">
                        {ROTULO_CATEGORIA[m.category] ?? m.category} · {ROTULO_IDIOMA[m.language] ?? m.language}
                      </p>
                    </div>
                    {gerencia && (
                      <Botao tamanho="sm" variante="fantasma" icone="lixeira" onClick={() => setApagando(m)}>
                        Apagar
                      </Botao>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-3 text-pequeno whitespace-pre-wrap text-texto-2">{corpoDe(m)}</p>
                  {m.status === 'REJECTED' && m.rejected_reason && m.rejected_reason !== 'NONE' && (
                    <p className="mt-2 text-legenda text-erro">Motivo da Meta: {m.rejected_reason}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Modal
        aberto={!!novo}
        titulo="Novo modelo"
        largura="max-w-2xl"
        aoFechar={() => setNovo(null)}
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setNovo(null)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao type="submit" form="form-modelo" carregando={salvando} disabled={!novo?.nome || !novo?.corpo.trim()}>
              Enviar para a Meta aprovar
            </Botao>
          </>
        }
      >
        {novo && (
          <form id="form-modelo" onSubmit={salvar} className="grid gap-6 md:grid-cols-[1fr_16rem]">
            <div className="space-y-4">
              <CampoTexto
                rotulo="Nome"
                required
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: nomeTecnico(e.target.value) })}
                placeholder="retorno_pedido"
                ajuda="Só a equipe vê. Minúsculas, números e _."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="categoria-modelo" className="block text-pequeno font-medium text-texto-2">
                    Categoria
                  </label>
                  <select
                    id="categoria-modelo"
                    value={novo.categoria}
                    onChange={(e) => setNovo({ ...novo, categoria: e.target.value as ModeloNovo['categoria'] })}
                    className={`${CLASSE_CAMPO} h-10`}
                  >
                    <option value="UTILITY">Utilidade</option>
                    <option value="MARKETING">Marketing</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="idioma-modelo" className="block text-pequeno font-medium text-texto-2">
                    Idioma
                  </label>
                  <select
                    id="idioma-modelo"
                    value={novo.idioma}
                    onChange={(e) => setNovo({ ...novo, idioma: e.target.value as ModeloNovo['idioma'] })}
                    className={`${CLASSE_CAMPO} h-10`}
                  >
                    {Object.entries(ROTULO_IDIOMA).map(([v, r]) => (
                      <option key={v} value={v}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="-mt-2 text-legenda text-texto-3">
                {novo.categoria === 'UTILITY'
                  ? 'Utilidade: continuação de um atendimento, pedido ou cadastro do cliente. Custa menos.'
                  : 'Marketing: promoções, novidades e convites. A Meta reclassifica se o texto for de venda.'}
              </p>

              <CampoTexto
                rotulo="Título (opcional)"
                maxLength={60}
                value={novo.cabecalho}
                onChange={(e) => setNovo({ ...novo, cabecalho: e.target.value })}
              />

              <div className="space-y-1.5">
                <div className="flex items-end justify-between gap-2">
                  <label htmlFor="corpo-modelo" className="block text-pequeno font-medium text-texto-2">
                    Mensagem
                  </label>
                  <button type="button" onClick={inserirVariavel} className="text-pequeno font-medium text-primaria hover:underline">
                    + Variável
                  </button>
                </div>
                <textarea
                  id="corpo-modelo"
                  ref={refCorpo}
                  required
                  maxLength={1024}
                  rows={6}
                  value={novo.corpo}
                  onChange={(e) => setNovo({ ...novo, corpo: e.target.value })}
                  placeholder="Olá, {{1}}! Sobre o seu pedido, podemos continuar por aqui?"
                  aria-describedby="ajuda-corpo"
                  className={`${CLASSE_CAMPO} py-2 text-pequeno leading-relaxed`}
                />
                <p id="ajuda-corpo" className="text-legenda text-texto-3">
                  Variáveis como {'{{1}}'} são trocadas na hora do envio (ex.: o nome do cliente). Não comece nem termine com
                  uma. *negrito* e _itálico_ funcionam. {novo.corpo.length}/1024
                </p>
              </div>

              {variaveis.length > 0 && (
                <fieldset className="space-y-3 rounded-md bg-fundo p-3">
                  <legend className="sr-only">Exemplos das variáveis</legend>
                  <p className="text-pequeno text-texto-2">Exemplo de cada variável. A Meta usa para aprovar.</p>
                  {variaveis.map((n) => (
                    <CampoTexto
                      key={n}
                      rotulo={`{{${n}}}`}
                      required
                      value={novo.exemplos[n - 1] ?? ''}
                      onChange={(e) => {
                        const exemplos = [...novo.exemplos]
                        exemplos[n - 1] = e.target.value
                        setNovo({ ...novo, exemplos })
                      }}
                      placeholder={n === 1 ? 'Maria' : ''}
                    />
                  ))}
                </fieldset>
              )}

              <CampoTexto
                rotulo="Rodapé (opcional)"
                maxLength={60}
                value={novo.rodape}
                onChange={(e) => setNovo({ ...novo, rodape: e.target.value })}
                placeholder="Responda SAIR para não receber mais"
              />

              <div className="space-y-2">
                <p className="text-pequeno font-medium text-texto-2">Botões de resposta (opcional)</p>
                {novo.botoes.map((b, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <CampoTexto
                      rotulo={`Botão ${i + 1}`}
                      maxLength={25}
                      value={b}
                      onChange={(e) => {
                        const botoes = [...novo.botoes]
                        botoes[i] = e.target.value
                        setNovo({ ...novo, botoes })
                      }}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      aria-label={`Tirar o botão ${i + 1}`}
                      onClick={() => setNovo({ ...novo, botoes: novo.botoes.filter((_, j) => j !== i) })}
                      className="flex size-10 items-center justify-center rounded-md text-texto-3 hover:bg-slate-100 hover:text-texto"
                    >
                      <Icone nome="fechar" className="size-4" />
                    </button>
                  </div>
                ))}
                {novo.botoes.length < 3 && (
                  <button
                    type="button"
                    onClick={() => setNovo({ ...novo, botoes: [...novo.botoes, ''] })}
                    className="text-pequeno font-medium text-primaria hover:underline"
                  >
                    + Botão
                  </button>
                )}
              </div>

              {erroNovo && <Aviso tom="erro">{erroNovo}</Aviso>}
            </div>

            <div className="space-y-2 md:sticky md:top-0 md:self-start">
              <p className="text-pequeno font-medium text-texto-2">Prévia</p>
              <Previa {...novo} />
            </div>
          </form>
        )}
      </Modal>

      <DialogoConfirmacao
        aberto={!!apagando}
        titulo="Apagar este modelo?"
        rotuloConfirmar="Apagar modelo"
        perigo
        carregando={ocupado}
        aoConfirmar={() => void apagar()}
        aoCancelar={() => setApagando(null)}
      >
        {`“${apagando?.name}” sai da conta do WhatsApp em todos os idiomas. A Meta não deixa reaproveitar o mesmo nome por 30 dias.`}
      </DialogoConfirmacao>
    </section>
  )
}
