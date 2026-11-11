import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSessao } from '../hooks/useSessao'
import { abrirCadastroMeta, carregarSdkMeta } from '../services/cadastroMeta'
import {
  codigoNumero,
  conectarNumeroDoPortfolio,
  conectarOficial,
  criarNumero,
  definirDistribuicao,
  desconectarNumero,
  editarNumero,
  iniciarNumero,
  ligarAgenteNoNumero,
  listarEquipeCompleta,
  listarNumeros,
  listarRecebeContatos,
  numerosQueDistribuem,
  pagamentoMeta,
  qrNumero,
  removerNumero,
  type MembroEquipe,
  type NumeroWhatsapp,
  type PagamentoMetaCanal,
} from '../services/configuracoes'
import { equipeQueGerencia, listarEquipes, listarLugares, type Equipe, type LugarNaEquipe } from '../services/equipes'
import { formatarTelefone, haQuanto, quandoCurto } from '../services/formato'
import { definirOrigemDoNumero, origensDosNumeros } from '../services/origem'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { EstadoVazio } from './EstadoVazio'
import { Icone } from './Icone'
import { Interruptor } from './Interruptor'
import { Modal } from './Modal'
import { ID_SUGESTOES_ORIGEM, RegrasDeOrigem, SugestoesDeOrigem } from './OrigemDosContatos'
import { PagamentoMeta } from './PagamentoMeta'

type Edicao = { nome: string; responsavel_id: string }
/** Janela "Configurar": nome, dono, origem e distribuição salvos juntos num botão só. */
type Configuracao = { numero: NumeroWhatsapp; nome: string; responsavel_id: string; origem: string; distribui: boolean }
type Portfolio = { nome: string; waba_id: string; phone_number_id: string }
type Confirmacao = { tipo: 'desconectar' | 'remover' | 'oficial'; numero: NumeroWhatsapp }

const CLASSE_FILTRO = 'h-9 rounded-md border border-borda bg-superficie px-3 text-pequeno focus:border-primaria focus:outline-none'

/** Busca e filtro só aparecem a partir daqui: com 2 ou 3 números, são ruído. */
const MINIMO_PARA_FILTRAR = 6

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function Ponto({ cor }: { cor: string }) {
  return <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${cor}`} />
}

function Situacao({ n }: { n: NumeroWhatsapp }) {
  const s = n.status_conexao
  if (s === 'WORKING')
    return (
      <p className="flex gap-2 text-pequeno">
        <Ponto cor="bg-destaque" />
        <span>
          {n.tipo === 'meta' ? 'Conectado pela API oficial' : 'Conectado'}
          {n.numero_conectado && ` · ${formatarTelefone(n.numero_conectado)}`}
          {n.conectado_em && <span className="text-texto-3"> · desde {quandoCurto(n.conectado_em).toLowerCase()}</span>}
        </span>
      </p>
    )
  if (s === 'SCAN_QR_CODE')
    return (
      <p className="flex gap-2 text-pequeno">
        <Ponto cor="bg-atencao" /> Aguardando o celular ser conectado
      </p>
    )
  if (s === 'STARTING')
    return (
      <p className="flex gap-2 text-pequeno">
        <Ponto cor="bg-atencao" /> Iniciando a conexão…
      </p>
    )
  if (s === 'INACESSIVEL')
    return (
      <p className="flex gap-2 text-pequeno">
        <Ponto cor="bg-erro" /> Servidor do WhatsApp fora do ar. Se continuar, avise o suporte da Livih.
      </p>
    )
  return (
    <p className="flex gap-2 text-pequeno text-erro">
      <Ponto cor="bg-erro" />
      {n.desconectado_em
        ? `Desconectado pela equipe ${haQuanto(n.desconectado_em)}`
        : n.caiu_em
          ? `Caiu ${haQuanto(n.caiu_em)}. Ninguém recebe as mensagens deste número.`
          : 'Não conectado'}
    </p>
  )
}

function Etiqueta({ children }: { children: string }) {
  return <span className="rounded-sm bg-fundo px-1.5 py-0.5 text-legenda font-normal text-texto-2 ring-1 ring-borda ring-inset">{children}</span>
}

// Uma linha por número (revisão de 11/11): a CEFEQ tem 27 números, e o cartão de antes, com a origem, a distribuição e
// as ações abertos, dava ~350 px cada um e repetia os mesmos textos 27 vezes. O que muda pouco foi para "Configurar".
export function SecaoWhatsapp() {
  const { orgAtiva, sessao, adminPlataforma } = useSessao()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  // API oficial: liberada para dono e admin de toda empresa desde a aprovação da Meta (26/10: whatsapp_business_messaging
  // e whatsapp_business_management). Não no modo suporte: o cadastro da Meta abre com a conta de quem clica, e o
  // portfólio tem de ser o da empresa. O número do portfólio da F7 continua só para a equipe da plataforma.
  const oficial = gerencia && !orgAtiva?.suporte
  const portfolioF7 = oficial && adminPlataforma
  const eu = sessao?.user.id
  const [numeros, setNumeros] = useState<{ orgId: string; lista: NumeroWhatsapp[] } | null>(null)
  const [equipe, setEquipe] = useState<MembroEquipe[]>([])
  const [versao, setVersao] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [pareando, setPareando] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [config, setConfig] = useState<Configuracao | null>(null)
  const [erroConfig, setErroConfig] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('')

  const lista = numeros?.orgId === orgId ? numeros.lista : null
  const recarregar = () => setVersao((v) => v + 1)

  // SDK da Meta carregado antes do clique: o cadastro abre numa janela, que o navegador só deixa abrir
  // direto do clique.
  const sdkMeta = useRef<Awaited<ReturnType<typeof carregarSdkMeta>> | null>(null)
  useEffect(() => {
    if (!oficial) return
    carregarSdkMeta()
      .then((fb) => (sdkMeta.current = fb))
      .catch(() => undefined)
  }, [oficial])

  /** Embedded Signup. Com canalId o número do WAHA passa para a API oficial no mesmo canal. */
  function conectarPelaApiOficial(canalId: string | null) {
    const fb = sdkMeta.current
    if (!fb) {
      setErro('O login da Meta ainda está carregando (ou foi bloqueado pelo navegador). Tente de novo em instantes.')
      return
    }
    setOcupado(canalId ?? 'oficial')
    setErro(null)
    abrirCadastroMeta(fb)
      .then((r) => conectarOficial(orgId, r, canalId ? { canal_id: canalId } : { nome: '', responsavel_id: null }))
      .then(() => {
        setConfirmacao(null)
        recarregar()
      })
      .catch((e) => setErro((e as Error).message))
      .finally(() => setOcupado(null))
  }

  // Pareando, o estado muda em segundos; tudo conectado, basta conferir de vez em quando.
  useEffect(() => {
    let ativo = true
    let espera: ReturnType<typeof setTimeout>
    const ler = () =>
      listarNumeros(orgId)
        .then((l) => {
          if (!ativo) return
          setNumeros({ orgId, lista: l })
          setErro(null)
          espera = setTimeout(ler, l.every((n) => n.status_conexao === 'WORKING') ? 30_000 : 5_000)
        })
        .catch((e) => {
          if (!ativo) return
          setErro((e as Error).message)
          espera = setTimeout(ler, 15_000)
        })
    void ler()
    return () => {
      ativo = false
      clearTimeout(espera)
    }
  }, [orgId, versao])

  // A equipe (nomes) e as equipes de venda: o gestor de equipe também liga e desliga o agente dos números dos
  // vendedores dela (migration 20261110210000).
  const [lugares, setLugares] = useState<Map<string, LugarNaEquipe>>(new Map())
  const [equipes, setEquipes] = useState<Equipe[]>([])
  useEffect(() => {
    let ativo = true
    listarEquipeCompleta(orgId)
      .then((e) => ativo && setEquipe(e.filter((m) => m.ativo)))
      .catch(() => undefined)
    listarLugares(orgId)
      .then((l) => ativo && setLugares(l))
      .catch(() => undefined)
    listarEquipes(orgId)
      .then((l) => ativo && setEquipes(l))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId])
  const minhaEquipe = gerencia ? new Set<string>() : equipeQueGerencia(lugares, eu)
  const podeLigarAgente = (n: NumeroWhatsapp) => gerencia || (!!n.responsavel_id && minhaEquipe.has(n.responsavel_id))
  const equipeDo = (n: NumeroWhatsapp) => {
    const id = n.responsavel_id ? lugares.get(n.responsavel_id)?.equipe_id : null
    return id ? (equipes.find((e) => e.id === id) ?? null) : null
  }

  // Distribuição dos contatos novos (docs/crm-acompanhamento.md, entrega 3): só nos números da empresa.
  const [distribuicao, setDistribuicao] = useState<{ orgId: string; numeros: Set<string>; recebem: number } | null>(null)
  useEffect(() => {
    if (!gerencia) return
    let ativo = true
    Promise.all([numerosQueDistribuem(orgId), listarRecebeContatos(orgId)])
      .then(([numeros, recebem]) => ativo && setDistribuicao({ orgId, numeros, recebem: recebem.size }))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, gerencia, versao])
  const distribui = (id: string) => distribuicao?.orgId === orgId && distribuicao.numeros.has(id)

  // Origem dos contatos de cada número (migration 20261111140000): só dono e admin configuram.
  const [origensLidas, setOrigensLidas] = useState<{ orgId: string; mapa: Map<string, string> } | null>(null)
  useEffect(() => {
    if (!gerencia) return
    let ativo = true
    origensDosNumeros(orgId)
      .then((mapa) => ativo && setOrigensLidas({ orgId, mapa }))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, gerencia, versao])
  const origens = origensLidas?.orgId === orgId ? origensLidas.mapa : null

  // Forma de pagamento da Meta nos números oficiais (06/11): a Meta cobra a empresa direto e a API não diz se há cartão.
  const [pagamentoLido, setPagamentoLido] = useState<{ orgId: string; mapa: Map<string, PagamentoMetaCanal> } | null>(null)
  const [versaoPagamento, setVersaoPagamento] = useState(0)
  useEffect(() => {
    let ativo = true
    pagamentoMeta(orgId)
      .then((l) => ativo && setPagamentoLido({ orgId, mapa: new Map(l.map((c) => [c.id, c])) }))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, versao, versaoPagamento])
  const pagamentos = pagamentoLido?.orgId === orgId ? pagamentoLido.mapa : null
  const recarregarPagamentos = () => setVersaoPagamento((v) => v + 1)

  const nomeDe = (userId: string) => {
    const m = equipe.find((x) => x.user_id === userId)
    return userId === eu ? 'você' : (m?.nome ?? m?.email ?? 'um vendedor')
  }

  async function executar(id: string, fn: () => Promise<unknown>) {
    setOcupado(id)
    setErro(null)
    try {
      await fn()
      recarregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    if (!edicao) return
    await executar('edicao', async () => {
      const { canal } = await criarNumero(orgId, edicao.nome.trim(), edicao.responsavel_id || null)
      setPareando(canal.id)
      setEdicao(null)
    })
  }

  function abrirConfiguracao(n: NumeroWhatsapp) {
    setErroConfig(null)
    setConfig({ numero: n, nome: n.nome, responsavel_id: n.responsavel_id ?? '', origem: origens?.get(n.id) ?? '', distribui: distribui(n.id) })
  }

  // Salva só o que mudou. A origem e a distribuição têm funções próprias no banco (cada uma confere o papel).
  async function salvarConfiguracao(e: FormEvent) {
    e.preventDefault()
    if (!config) return
    const n = config.numero
    const responsavel = config.responsavel_id || null
    setOcupado('config')
    setErroConfig(null)
    try {
      if (config.nome.trim() !== n.nome || responsavel !== n.responsavel_id)
        await editarNumero(n.id, { nome: config.nome.trim(), responsavel_id: responsavel })
      if (config.origem.trim() !== (origens?.get(n.id) ?? '')) await definirOrigemDoNumero(n.id, config.origem)
      if (!responsavel && config.distribui !== distribui(n.id)) await definirDistribuicao(n.id, config.distribui)
      setConfig(null)
      recarregar()
    } catch (err) {
      setErroConfig((err as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  /** Fecha a janela e pede a confirmação: desconectar, remover e passar para a API oficial. */
  function confirmar(tipo: Confirmacao['tipo']) {
    if (!config) return
    setConfirmacao({ tipo, numero: config.numero })
    setConfig(null)
  }

  async function salvarPortfolio(e: FormEvent) {
    e.preventDefault()
    if (!portfolio) return
    await executar('portfolio', async () => {
      await conectarNumeroDoPortfolio(orgId, portfolio)
      setPortfolio(null)
    })
  }

  // Busca por nome, telefone ou dono; filtro por situação, tipo ou equipe do dono do número.
  const termo = semAcento(busca.trim())
  const digitos = busca.replace(/\D/g, '')
  const visiveis = (lista ?? []).filter((n) => {
    if (filtro === 'desconectados' && n.status_conexao === 'WORKING') return false
    if (filtro === 'empresa' && n.responsavel_id) return false
    if (filtro === 'vendedores' && !n.responsavel_id) return false
    if (filtro.startsWith('equipe:') && equipeDo(n)?.id !== filtro.slice(7)) return false
    if (!termo) return true
    const dono = n.responsavel_id ? nomeDe(n.responsavel_id) : ''
    return (
      semAcento(`${n.nome} ${dono}`).includes(termo) || (!!digitos && !!n.numero_conectado?.includes(digitos))
    )
  })
  const desconectados = (lista ?? []).filter((n) => n.status_conexao !== 'WORKING').length
  const filtrando = !!termo || !!filtro

  return (
    <section aria-labelledby="titulo-whatsapp" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 id="titulo-whatsapp" className="text-h2 font-semibold">
            WhatsApp
          </h2>
          <p className="text-pequeno text-texto-3">
            As conversas do número da empresa são vistas por toda a equipe. As do número de um vendedor, só por ele, pelo
            gestor da equipe dele, pelo dono e pelos admins.
          </p>
        </div>
        {gerencia && (
          // No celular, os botões ocupam a largura toda e ficam do mesmo tamanho.
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
            {oficial && (
              <Botao variante="secundario" carregando={ocupado === 'oficial'} onClick={() => conectarPelaApiOficial(null)}>
                Conectar pela API oficial
              </Botao>
            )}
            {portfolioF7 && (
              <Botao variante="secundario" onClick={() => setPortfolio({ nome: '', waba_id: '', phone_number_id: '' })}>
                Número do portfólio da F7
              </Botao>
            )}
            <Botao icone="mais" onClick={() => setEdicao({ nome: '', responsavel_id: '' })}>
              Adicionar número
            </Botao>
          </div>
        )}
      </div>

      {!gerencia && <Aviso>Só dono e admin conectam, desconectam e mudam os números. Se um cair, avise um deles.</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {gerencia && <RegrasDeOrigem orgId={orgId} />}

      {!lista ? (
        <p className="text-pequeno text-texto-3" aria-busy="true">
          Consultando o WhatsApp…
        </p>
      ) : !lista.length ? (
        <div className="rounded-lg border border-borda bg-superficie">
          <EstadoVazio
            icone="telefone"
            titulo="Nenhum número conectado"
            acao={
              gerencia && (
                <Botao icone="telefone" onClick={() => setEdicao({ nome: 'Número da empresa', responsavel_id: '' })}>
                  Conectar o número da empresa
                </Botao>
              )
            }
          >
            Conecte o celular da empresa para o agente começar a atender. Use um número só para isso.
          </EstadoVazio>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.length >= MINIMO_PARA_FILTRAR && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1 sm:max-w-xs">
                <span className="sr-only">Buscar número</span>
                <Icone nome="busca" className="pointer-events-none absolute top-2.5 left-3 size-4 text-texto-3" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome, vendedor ou telefone"
                  className={`${CLASSE_FILTRO} w-full pl-9`}
                />
              </label>
              <label>
                <span className="sr-only">Mostrar</span>
                <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={CLASSE_FILTRO}>
                  <option value="">Todos os números</option>
                  <option value="desconectados">Desconectados ({desconectados})</option>
                  <option value="empresa">Da empresa</option>
                  <option value="vendedores">De vendedores</option>
                  {equipes.map((eq) => (
                    <option key={eq.id} value={`equipe:${eq.id}`}>
                      {eq.nome}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-pequeno text-texto-3" aria-live="polite">
                {filtrando ? `${visiveis.length} de ${lista.length} números` : `${lista.length} números`}
                {!filtrando && desconectados > 0 && (
                  <span className="text-erro"> · {desconectados === 1 ? '1 desconectado' : `${desconectados} desconectados`}</span>
                )}
              </p>
            </div>
          )}

          {!visiveis.length ? (
            <p className="rounded-lg border border-borda bg-superficie p-5 text-pequeno text-texto-3">
              Nenhum número com esse filtro.{' '}
              <button
                onClick={() => {
                  setBusca('')
                  setFiltro('')
                }}
                className="font-medium text-primaria underline"
              >
                Mostrar todos
              </button>
            </p>
          ) : (
            <ul className="divide-y divide-borda overflow-hidden rounded-lg border border-borda bg-superficie">
              {visiveis.map((n) => {
                const conectado = n.status_conexao === 'WORKING'
                const origem = origens?.get(n.id)
                const eq = equipeDo(n)
                return (
                  <li key={n.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {/* Largura mínima: no celular, os controles descem para a linha de baixo em vez de espremer o texto. */}
                      <div className="min-w-[14rem] flex-1 space-y-0.5">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                          <span className="truncate">{n.nome}</span>
                          {origem && <Etiqueta>{`Origem: ${origem}`}</Etiqueta>}
                          {gerencia && !n.responsavel_id && distribui(n.id) && <Etiqueta>Distribui contatos novos</Etiqueta>}
                        </p>
                        <p className="text-legenda text-texto-3">
                          {!n.responsavel_id ? 'Da empresa · toda a equipe vê' : n.responsavel_id === eu ? 'Seu número' : `De ${nomeDe(n.responsavel_id)}`}
                          {eq && ` · ${eq.nome}`}
                          {n.tipo === 'meta' && (n.meta_coexistencia ? ' · API oficial, também no app do celular' : ' · API oficial')}
                        </p>
                        <Situacao n={n} />
                      </div>

                      <div className="ml-auto flex flex-wrap items-center gap-3">
                        {gerencia && !conectado && n.tipo !== 'meta' && (
                          <Botao
                            tamanho="sm"
                            icone="telefone"
                            carregando={ocupado === n.id}
                            onClick={() =>
                              void executar(n.id, async () => {
                                await iniciarNumero(orgId, n.id)
                                setPareando(n.id)
                              })
                            }
                          >
                            Conectar celular
                          </Botao>
                        )}
                        {podeLigarAgente(n) ? (
                          <Interruptor
                            ligado={n.agente_ativo}
                            desabilitado={ocupado === n.id}
                            aoMudar={(v) => void executar(n.id, () => ligarAgenteNoNumero(n.id, v))}
                            title="Agente de IA neste número"
                            className="w-36"
                          >
                            Agente {n.agente_ativo ? 'ligado' : 'desligado'}
                          </Interruptor>
                        ) : (
                          <span className="text-pequeno text-texto-3">Agente {n.agente_ativo ? 'ligado' : 'desligado'}</span>
                        )}
                        {gerencia && (
                          <Botao tamanho="sm" variante="secundario" icone="config" onClick={() => abrirConfiguracao(n)}>
                            Configurar
                          </Botao>
                        )}
                      </div>
                    </div>

                    {n.tipo === 'meta' && pagamentos?.get(n.id) && (
                      <div className="pt-3">
                        <PagamentoMeta canal={pagamentos.get(n.id)!} gerencia={gerencia} aoConfirmar={recarregarPagamentos} />
                      </div>
                    )}

                    {gerencia && pareando === n.id && n.status_conexao === 'SCAN_QR_CODE' && (
                      <div className="mt-3 border-t border-borda pt-4">
                        <Pareamento orgId={orgId} canalId={n.id} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {gerencia && <SugestoesDeOrigem />}

      <Modal
        aberto={!!edicao}
        titulo="Adicionar número"
        aoFechar={() => setEdicao(null)}
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setEdicao(null)} disabled={ocupado === 'edicao'}>
              Cancelar
            </Botao>
            <Botao type="submit" form="form-numero" carregando={ocupado === 'edicao'} disabled={!edicao?.nome.trim()}>
              Adicionar e conectar
            </Botao>
          </>
        }
      >
        {edicao && (
          <form id="form-numero" onSubmit={adicionar} className="space-y-4">
            <CampoTexto
              rotulo="Nome do número"
              required
              value={edicao.nome}
              onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
              placeholder="Ex.: Comercial – Ana"
            />
            <SeletorDono equipe={equipe} valor={edicao.responsavel_id} aoMudar={(v) => setEdicao({ ...edicao, responsavel_id: v })} />
            <p className="text-legenda text-texto-3">
              O agente começa desligado neste número. Ele usa as mesmas instruções e a mesma base da empresa.
            </p>
          </form>
        )}
      </Modal>

      <Modal
        aberto={!!config}
        titulo={config ? `Configurar “${config.numero.nome}”` : 'Configurar número'}
        largura="max-w-xl"
        aoFechar={() => setConfig(null)}
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setConfig(null)} disabled={ocupado === 'config'}>
              Cancelar
            </Botao>
            <Botao type="submit" form="form-config" carregando={ocupado === 'config'} disabled={!config?.nome.trim()}>
              Salvar
            </Botao>
          </>
        }
      >
        {config && (
          <form id="form-config" onSubmit={salvarConfiguracao} className="space-y-5">
            {erroConfig && <Aviso tom="erro">{erroConfig}</Aviso>}
            <CampoTexto
              rotulo="Nome do número"
              required
              value={config.nome}
              onChange={(e) => setConfig({ ...config, nome: e.target.value })}
            />
            <SeletorDono equipe={equipe} valor={config.responsavel_id} aoMudar={(v) => setConfig({ ...config, responsavel_id: v })} />
            <CampoTexto
              rotulo="Origem dos contatos deste número (opcional)"
              list={ID_SUGESTOES_ORIGEM}
              maxLength={60}
              placeholder="Ex.: Google Ads"
              value={config.origem}
              onChange={(e) => setConfig({ ...config, origem: e.target.value })}
              ajuda="Quem escrever neste número depois de 30 dias sem falar com a empresa entra com esta origem no Painel. Deixe em branco se o número não tem uma origem só."
            />
            {!config.responsavel_id && (
              <div className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={config.distribui}
                    disabled={!distribuicao}
                    onChange={(e) => setConfig({ ...config, distribui: e.target.checked })}
                    className="mt-0.5 size-4 shrink-0 accent-primaria"
                  />
                  <span>
                    <span className="block text-pequeno font-medium text-texto">Distribuir os contatos novos entre a equipe</span>
                    <span className="block text-legenda text-texto-3">
                      Quem escreve pela primeira vez e ainda não tem vendedor entra na carteira do próximo da fila, que é
                      avisado no celular. O agente continua atendendo; quando ele chamar a equipe, o aviso vai para esse
                      vendedor. Quem já tem vendedor continua com ele.
                    </span>
                  </span>
                </label>
                {config.distribui && distribuicao?.recebem === 0 && (
                  <Aviso tom="atencao">
                    Ninguém está marcado para receber contatos novos, então nada é distribuído. Em Configurações → Equipe,
                    clique em Editar na pessoa e marque “Recebe contatos novos”.
                  </Aviso>
                )}
              </div>
            )}

            <div className="space-y-2 border-t border-borda pt-4">
              <p className="text-pequeno font-medium text-texto-2">Conexão</p>
              <div className="flex flex-wrap gap-2">
                {oficial && config.numero.tipo !== 'meta' && (
                  <Botao tamanho="sm" variante="secundario" onClick={() => confirmar('oficial')}>
                    Passar para a API oficial
                  </Botao>
                )}
                {config.numero.status_conexao === 'WORKING' && config.numero.tipo !== 'meta' && (
                  <Botao tamanho="sm" variante="perigoTexto" onClick={() => confirmar('desconectar')}>
                    Desconectar
                  </Botao>
                )}
                <Botao tamanho="sm" variante="perigoTexto" icone="lixeira" onClick={() => confirmar('remover')}>
                  Remover número
                </Botao>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={!!portfolio}
        titulo="Número do portfólio da F7"
        aoFechar={() => setPortfolio(null)}
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setPortfolio(null)} disabled={ocupado === 'portfolio'}>
              Cancelar
            </Botao>
            <Botao
              type="submit"
              form="form-portfolio"
              carregando={ocupado === 'portfolio'}
              disabled={!portfolio?.waba_id.trim() || !portfolio?.phone_number_id.trim()}
            >
              Conectar
            </Botao>
          </>
        }
      >
        {portfolio && (
          <form id="form-portfolio" onSubmit={salvarPortfolio} className="space-y-4">
            <p className="text-pequeno text-texto-2">
              Para números que já estão na conta do WhatsApp da própria F7, como o número de teste da Meta. Não passa pelo
              cadastro da Meta: usa o token de usuário do sistema. Os IDs ficam em WhatsApp → Configuração da API, no painel
              do app.
            </p>
            <CampoTexto
              rotulo="Nome do número"
              value={portfolio.nome}
              onChange={(e) => setPortfolio({ ...portfolio, nome: e.target.value })}
              placeholder="Ex.: Teste da Meta"
            />
            <CampoTexto
              rotulo="ID da conta do WhatsApp Business (WABA)"
              required
              inputMode="numeric"
              value={portfolio.waba_id}
              onChange={(e) => setPortfolio({ ...portfolio, waba_id: e.target.value.replace(/\D/g, '') })}
            />
            <CampoTexto
              rotulo="ID do número de telefone"
              required
              inputMode="numeric"
              value={portfolio.phone_number_id}
              onChange={(e) => setPortfolio({ ...portfolio, phone_number_id: e.target.value.replace(/\D/g, '') })}
            />
          </form>
        )}
      </Modal>

      <DialogoConfirmacao
        aberto={!!confirmacao}
        titulo={
          confirmacao?.tipo === 'oficial'
            ? 'Passar para a API oficial?'
            : confirmacao?.tipo === 'remover'
              ? 'Remover este número?'
              : 'Desconectar este número?'
        }
        rotuloConfirmar={
          confirmacao?.tipo === 'oficial' ? 'Conectar com a Meta' : confirmacao?.tipo === 'remover' ? 'Remover número' : 'Desconectar'
        }
        perigo={confirmacao?.tipo !== 'oficial'}
        carregando={!!confirmacao && ocupado === confirmacao.numero.id}
        aoConfirmar={() => {
          if (!confirmacao) return
          // O cadastro da Meta abre uma janela: tem que sair direto deste clique.
          if (confirmacao.tipo === 'oficial') return conectarPelaApiOficial(confirmacao.numero.id)
          void executar(confirmacao.numero.id, async () => {
            if (confirmacao.tipo === 'remover') await removerNumero(orgId, confirmacao.numero.id)
            else await desconectarNumero(orgId, confirmacao.numero.id)
            setConfirmacao(null)
          })
        }}
        aoCancelar={() => setConfirmacao(null)}
      >
        {confirmacao?.tipo === 'oficial'
          ? `“${confirmacao.numero.nome}” passa a funcionar pela API oficial do WhatsApp, com as mesmas conversas. Na janela da Meta, entre com o portfólio da empresa e escolha conectar o app WhatsApp Business que já existe: o celular continua funcionando. Os aparelhos conectados (WhatsApp Web) se desconectam nessa hora.`
          : confirmacao?.tipo === 'remover'
          ? `“${confirmacao.numero.nome}” sai da Livih. As conversas antigas continuam no histórico, mas nada novo entra ou sai por ele.`
          : `Nada entra ou sai por “${confirmacao?.numero.nome}” até alguém conectar o celular de novo.`}
      </DialogoConfirmacao>
    </section>
  )
}

/** De quem é o número: da empresa (toda a equipe vê) ou de um vendedor. */
function SeletorDono({ equipe, valor, aoMudar }: { equipe: MembroEquipe[]; valor: string; aoMudar: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="responsavel" className="block text-pequeno font-medium text-texto-2">
        De quem é este número
      </label>
      <select
        id="responsavel"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="block h-10 w-full rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none"
      >
        <option value="">Da empresa — toda a equipe vê</option>
        {equipe.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            De {m.nome || m.email} — só ele(a), o gestor da equipe, dono e admin veem
          </option>
        ))}
      </select>
    </div>
  )
}

/** QR code (renovado sozinho) ou código de 8 dígitos para quem está no próprio celular. */
function Pareamento({ orgId, canalId }: { orgId: string; canalId: string }) {
  const [modo, setModo] = useState<'qr' | 'codigo'>('qr')
  const [qr, setQr] = useState<string | null>(null)
  const [telefone, setTelefone] = useState('')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (modo !== 'qr') return
    let ativo = true
    let espera: ReturnType<typeof setTimeout>
    const buscar = () =>
      qrNumero(orgId, canalId)
        .then((r) => ativo && setQr(r.imagem))
        .catch(() => undefined)
        .finally(() => {
          if (ativo) espera = setTimeout(buscar, 15_000) // o WhatsApp troca o QR a cada ~20 s
        })
    void buscar()
    return () => {
      ativo = false
      clearTimeout(espera)
    }
  }, [orgId, canalId, modo])

  async function gerarCodigo() {
    setGerando(true)
    setErro(null)
    try {
      setCodigo((await codigoNumero(orgId, canalId, telefone)).codigo)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Forma de conectar" className="inline-flex rounded-md bg-slate-100 p-1 text-pequeno">
        {(
          [
            ['qr', 'Ler QR code'],
            ['codigo', 'Usar código'],
          ] as const
        ).map(([m, rotulo]) => (
          <button
            key={m}
            role="tab"
            aria-selected={modo === m}
            onClick={() => setModo(m)}
            className={`rounded px-3 py-1.5 font-medium ${modo === m ? 'bg-superficie text-texto shadow-sm' : 'text-texto-2'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {modo === 'qr' ? (
        <div className="flex flex-wrap gap-6">
          <div className="flex size-64 items-center justify-center rounded-lg ring-1 ring-borda">
            {qr ? (
              <img src={qr} alt="QR code para conectar o WhatsApp" className="size-60" />
            ) : (
              <span className="size-6 animate-spin rounded-full border-2 border-texto-3 border-t-transparent" />
            )}
          </div>
          <ol className="max-w-xs list-decimal space-y-2 pl-5 text-pequeno text-texto-2">
            <li>No celular deste número, abra o WhatsApp.</li>
            <li>
              Toque em <strong>⋮</strong> (Android) ou <strong>Configurações</strong> (iPhone) →{' '}
              <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong>.
            </li>
            <li>Aponte a câmera para o código. Ele se renova sozinho.</li>
          </ol>
        </div>
      ) : (
        <div className="max-w-md space-y-3">
          <p className="text-pequeno text-texto-2">Para quem está com esta tela aberta no próprio celular do número.</p>
          <div className="flex items-end gap-2">
            <CampoTexto
              rotulo="Número do celular"
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(41) 99999-8888"
              className="flex-1"
            />
            <Botao onClick={() => void gerarCodigo()} carregando={gerando} disabled={!telefone.trim()}>
              Gerar código
            </Botao>
          </div>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          {codigo && (
            <>
              <p className="rounded-lg bg-fundo py-4 text-center font-mono text-h1 font-semibold tracking-widest">{codigo}</p>
              <p className="flex gap-2 text-pequeno text-texto-2">
                <Icone nome="telefone" className="mt-0.5 size-4 shrink-0" />
                No WhatsApp: Dispositivos conectados → Conectar dispositivo → Conectar com número de telefone → digite o código.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
