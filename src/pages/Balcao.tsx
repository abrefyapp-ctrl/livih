import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { EstadoVazio } from '../components/EstadoVazio'
import { CamposEnvio, ListaEnvios } from '../components/EnvioNota'
import { Icone } from '../components/Icone'
import { useDestinosNota } from '../hooks/useDestinosNota'
import { enviosEmAndamento, formInicial, paraEnvio, problemaEnvio, querEnviar, type FormEnvio } from '../services/envioNota'
import {
  configBalcao,
  definirContaBalcao,
  fecharVenda,
  FORMAS_BALCAO,
  lerPrazos,
  maisVendidosBalcao,
  type ConfigBalcao,
  type FormaBalcao,
  type VendaFechada,
} from '../services/balcao'
import { clienteResumo, procurarClientes, type ClienteResumo } from '../services/clientes'
import { listarProdutos, type Produto } from '../services/erp'
import { formatarDocumento, lerNumero, moeda, quantidade } from '../services/formato'
import {
  emitirNota,
  enviosDaNota,
  FaltaParaEmitir,
  FORMA_SEFAZ,
  notaDoPedido,
  pedirEnvioNota,
  urlArquivoNota,
  type DestinosNota,
  type EnvioNota,
  type NotaFiscal,
} from '../services/nfe'

// Venda de balcão (docs/balcao.md, decisões de 27/10 e 18/11). Uma tela para a venda de um minuto: buscar o produto
// (o leitor de código de barras funciona como teclado: digita o código e aperta Enter), ajustar, escolher o pagamento
// e fechar. A venda fecha inteira no banco (balcao_fechar); a NF-e sai depois, e a impressão do DANFE abre sozinha.

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const r2 = (n: number) => Math.round(n * 100) / 100
const CHAVE_IMPRIMIR = 'livih.balcao.imprimir'

function lerPreferencia(): boolean {
  try {
    return localStorage.getItem(CHAVE_IMPRIMIR) !== 'nao'
  } catch {
    return true
  }
}
function gravarPreferencia(v: boolean) {
  try {
    localStorage.setItem(CHAVE_IMPRIMIR, v ? 'sim' : 'nao')
  } catch {
    // sem armazenamento (janela anônima): só não lembra
  }
}

type Linha = { produto: Produto; quantidade: number; desconto: string }

/** Desconto digitado no item: "10%" ou "5,00". Vazio é zero; inválido ou maior que o item, erro. */
function descontoDaLinha(l: Linha): { reais: number; pct: number | null; erro: string | null; bruto: number } {
  const bruto = r2(l.quantidade * Number(l.produto.preco))
  const t = l.desconto.trim()
  if (!t) return { reais: 0, pct: null, erro: null, bruto }
  const emPct = t.endsWith('%')
  const n = lerNumero(t.slice(0, emPct ? -1 : undefined))
  if (n == null || n < 0 || (emPct && n > 100)) return { reais: 0, pct: null, erro: 'Desconto inválido: use 5,00 ou 10%.', bruto }
  const reais = emPct ? r2((bruto * n) / 100) : r2(n)
  if (reais > bruto) return { reais, pct: null, erro: 'O desconto passa do valor do item.', bruto }
  return { reais, pct: emPct && n > 0 ? n : null, erro: null, bruto }
}

const PRAZOS_PRONTOS = ['30', '30/60', '30/60/90']

/** Imprime o DANFE: baixa o PDF e abre a impressão a partir da cópia local (o navegador não imprime PDF de outro endereço). */
async function imprimirDanfe(path: string): Promise<boolean> {
  try {
    const url = await urlArquivoNota(path)
    const blob = await (await fetch(url)).blob()
    const local = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
    const quadro = document.createElement('iframe')
    quadro.style.position = 'fixed'
    quadro.style.width = '0'
    quadro.style.height = '0'
    quadro.style.border = '0'
    quadro.src = local
    document.body.appendChild(quadro)
    await new Promise<void>((ok) => {
      quadro.onload = () => ok()
      setTimeout(ok, 4000)
    })
    quadro.contentWindow?.focus()
    quadro.contentWindow?.print()
    // A impressão é modal: dá tempo de o vendedor imprimir antes de soltar o arquivo.
    setTimeout(() => {
      quadro.remove()
      URL.revokeObjectURL(local)
    }, 60_000)
    return true
  } catch {
    return false
  }
}

type EstadoNota =
  | { tipo: 'sem' ; motivo: string | null }
  | { tipo: 'enviando' }
  | { tipo: 'nota'; nota: NotaFiscal }
  | { tipo: 'falha'; erro: string; faltando: string[] }
type Ultima = {
  venda: VendaFechada
  forma: FormaBalcao
  cliente: string | null
  nota: EstadoNota
  impressa: boolean | null
  /** Envio da nota ao cliente (entrega 2): o que foi pedido e o resultado. */
  envios: EnvioNota[]
  erroEnvio: string | null
}

export function Balcao() {
  const { orgAtiva, modulos } = useSessao()
  if (modulos && !(modulos.has('erp') && modulos.has('balcao'))) {
    return (
      <EstadoVazio icone="caixa" titulo="O Balcão não está ligado nesta empresa">
        É um módulo que vem junto com Pedidos e estoque. Fale com a equipe da Livih para ativar.
      </EstadoVazio>
    )
  }
  return <TelaBalcao key={orgAtiva!.id} orgId={orgAtiva!.id} />
}

function TelaBalcao({ orgId }: { orgId: string }) {
  const [config, setConfig] = useState<ConfigBalcao | null>(null)
  const [erroConfig, setErroConfig] = useState<string | null>(null)
  const [versaoConfig, setVersaoConfig] = useState(0)
  const [produtos, setProdutos] = useState<Produto[] | null>(null)
  const [maisVendidos, setMaisVendidos] = useState<string[]>([])

  const [busca, setBusca] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [cliente, setCliente] = useState<ClienteResumo | null>(null)
  const [forma, setForma] = useState<FormaBalcao>('dinheiro')
  const [recebido, setRecebido] = useState('')
  const [prazoEscolhido, setPrazoEscolhido] = useState('30')
  const [prazoOutro, setPrazoOutro] = useState('')
  const [descontoTotal, setDescontoTotal] = useState('')
  const [observacao, setObservacao] = useState('')
  const [emitir, setEmitir] = useState(true)
  const [imprimir, setImprimir] = useState(lerPreferencia)

  const [fechando, setFechando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ultima, setUltima] = useState<Ultima | null>(null)
  const campoBusca = useRef<HTMLInputElement>(null)

  // Veio do cadastro do cliente ("Iniciar venda", 18/11): começa a venda com ele escolhido e limpa o endereço.
  const [params, setParams] = useSearchParams()
  const clienteDoLink = params.get('cliente')
  useEffect(() => {
    if (!clienteDoLink) return
    let ativo = true
    clienteResumo(clienteDoLink)
      .then((c) => ativo && c && setCliente(c))
      .catch(() => undefined)
      .finally(() => ativo && setParams({}, { replace: true }))
    return () => {
      ativo = false
    }
  }, [clienteDoLink, setParams])

  useEffect(() => {
    let ativo = true
    configBalcao(orgId)
      .then((c) => {
        if (!ativo) return
        setConfig(c)
        setErroConfig(null)
      })
      .catch((e) => ativo && setErroConfig((e as Error).message))
    return () => {
      ativo = false
    }
  }, [orgId, versaoConfig])

  useEffect(() => {
    let ativo = true
    listarProdutos(orgId)
      .then((l) => ativo && setProdutos(l))
      .catch(() => ativo && setErro('Não foi possível carregar os produtos. Atualize a página.'))
    maisVendidosBalcao(orgId).then((l) => ativo && setMaisVendidos(l))
    return () => {
      ativo = false
    }
  }, [orgId])

  // ---- produto ----
  const resultados = useMemo(() => {
    const t = semAcento(busca)
    if (!t || !produtos) return []
    return produtos.filter((p) => semAcento(`${p.nome} ${p.codigo ?? ''} ${p.marca ?? ''}`).includes(t)).slice(0, 8)
  }, [busca, produtos])
  const sugestoes = useMemo(() => {
    if (!produtos) return []
    const porId = new Map(produtos.map((p) => [p.id, p]))
    return maisVendidos.map((id) => porId.get(id)).filter((p): p is Produto => !!p)
  }, [maisVendidos, produtos])

  function adicionar(p: Produto) {
    setLinhas((l) => {
      const i = l.findIndex((x) => x.produto.id === p.id)
      if (i >= 0) return l.map((x, n) => (n === i ? { ...x, quantidade: x.quantidade + 1 } : x))
      return [...l, { produto: p, quantidade: 1, desconto: '' }]
    })
    setBusca('')
    setErro(null)
    campoBusca.current?.focus()
  }

  // Enter: o código exato (leitor de código de barras) ou o primeiro da lista.
  function teclaBusca(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const t = busca.trim().toLowerCase()
    if (!t) return
    const exato = produtos?.find((p) => (p.codigo ?? '').toLowerCase() === t)
    const p = exato ?? resultados[0]
    if (p) adicionar(p)
    else setErro(`Nenhum produto com "${busca.trim()}". Confira o código ou busque pelo nome.`)
  }

  const mudarLinha = (id: string, dados: Partial<Linha>) =>
    setLinhas((l) => l.map((x) => (x.produto.id === id ? { ...x, ...dados } : x)))

  // ---- contas ----
  const calc = linhas.map((l) => ({ linha: l, ...descontoDaLinha(l) }))
  const subtotal = r2(calc.reduce((a, c) => a + c.bruto - (c.erro ? 0 : c.reais), 0))
  const descTotal = lerNumero(descontoTotal) ?? (descontoTotal.trim() ? NaN : 0)
  const total = r2(Math.max(subtotal - (Number.isFinite(descTotal) ? (descTotal as number) : 0), 0))
  const valorRecebido = lerNumero(recebido)
  const prazos = forma === 'a_prazo' ? lerPrazos(prazoEscolhido === 'outro' ? prazoOutro : prazoEscolhido) : null

  // NF-e: precisa de cliente com cadastro (sem cliente, a NF-e não tem destinatário; NFC-e fica para depois).
  const podeNota = !!config?.emite_nota && !!config.emissora?.pronta
  const motivoSemNota = !config
    ? null
    : !config.emite_nota
      ? 'Você não emite nota fiscal nesta empresa. Quem tem a permissão emite depois, no pedido.'
      : !config.emissora?.pronta
        ? 'O CNPJ do balcão ainda não está pronto para emitir (Configurações → Empresa → Nota fiscal).'
        : !cliente
          ? 'Para a NF-e, escolha o cliente. Consumidor final sem cadastro não recebe NF-e.'
          : null
  const vaiEmitir = podeNota && !!cliente && emitir

  // Para onde vai a nota quando for autorizada (entrega 2): o WhatsApp e o e-mail do cliente, já sugeridos.
  const destinosCli = useDestinosNota(vaiEmitir ? (cliente?.id ?? null) : null)
  const [envioForm, setEnvioForm] = useState<{ clienteId: string; form: FormEnvio } | null>(null)
  const formEnvio: FormEnvio | null =
    vaiEmitir && cliente && destinosCli.carregado
      ? envioForm?.clienteId === cliente.id
        ? envioForm.form
        : formInicial(destinosCli.destinos)
      : null
  const problemaDoEnvio = formEnvio && querEnviar(formEnvio) ? problemaEnvio(formEnvio) : null

  const bloqueio = !linhas.length
    ? 'Adicione pelo menos um produto.'
    : calc.some((c) => c.erro)
      ? 'Corrija o desconto marcado em vermelho.'
      : !Number.isFinite(descTotal) || (descTotal as number) < 0
        ? 'O desconto no total está inválido.'
        : (descTotal as number) > subtotal
          ? 'O desconto no total passa do valor dos itens.'
          : forma === 'a_prazo' && !cliente
            ? 'Venda a prazo precisa de cliente: escolha o cliente.'
            : forma === 'a_prazo' && !prazos
              ? 'Informe os prazos em dias, como 30/60 (de 1 a 365 dias, até 12 parcelas).'
              : forma === 'dinheiro' && recebido.trim() && (valorRecebido == null || valorRecebido < total)
                ? 'O valor recebido é menor que o total.'
                : problemaDoEnvio

  function limpar() {
    setLinhas([])
    setCliente(null)
    setForma('dinheiro')
    setRecebido('')
    setPrazoEscolhido('30')
    setPrazoOutro('')
    setDescontoTotal('')
    setObservacao('')
    setEmitir(true)
    setEnvioForm(null)
    setErro(null)
    campoBusca.current?.focus()
  }

  async function fechar() {
    if (bloqueio || fechando) return
    setFechando(true)
    setErro(null)
    try {
      const venda = await fecharVenda(orgId, {
        itens: calc.map((c) => ({
          produto_id: c.linha.produto.id!,
          quantidade: c.linha.quantidade,
          ...(c.pct != null ? { desconto_percentual: c.pct } : { desconto: c.reais }),
        })),
        clienteId: cliente?.id ?? null,
        forma,
        prazos,
        desconto: (descTotal as number) || 0,
        observacao,
      })
      const nomeCliente = cliente ? cliente.razao_social || cliente.nome : null
      const emiteAgora = vaiEmitir
      const envio = emiteAgora && formEnvio && querEnviar(formEnvio) ? { form: formEnvio, destinos: destinosCli.destinos } : null
      setUltima({
        venda,
        forma,
        cliente: nomeCliente,
        nota: emiteAgora ? { tipo: 'enviando' } : { tipo: 'sem', motivo: cliente ? motivoSemNota : null },
        impressa: null,
        envios: [],
        erroEnvio: null,
      })
      limpar()
      if (emiteAgora) void emitirDaVenda(venda, forma, envio)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setFechando(false)
    }
  }

  async function emitirDaVenda(
    venda: VendaFechada,
    formaVenda: FormaBalcao,
    envio: { form: FormEnvio; destinos: DestinosNota | null } | null,
  ) {
    try {
      const nota = await emitirNota({
        pedido_id: venda.pedido_id,
        emissora_id: venda.emissora_id ?? config!.emissora!.id,
        forma_pagamento: FORMA_SEFAZ[venda.forma] ?? '99',
        // Cartão de crédito é à vista para a SEFAZ (quem parcela é a operadora): sem fatura e duplicatas na nota.
        a_prazo: formaVenda === 'a_prazo',
        presenca: 1,
        informacoes: '',
        transporte: { modalidade: 9, transportadora: null, volume: null },
      })
      setUltima((u) => (u && u.venda.pedido_id === venda.pedido_id ? { ...u, nota: { tipo: 'nota', nota } } : u))
      // A nota ainda está na SEFAZ: o envio fica pedido e sai sozinho quando ela for autorizada (nfe-retorno).
      if (envio) {
        try {
          const envios = await pedirEnvioNota(paraEnvio(nota.id, envio.form, envio.destinos))
          setUltima((u) => (u && u.venda.pedido_id === venda.pedido_id ? { ...u, envios } : u))
        } catch (e) {
          const erroEnvio = (e as Error).message
          setUltima((u) => (u && u.venda.pedido_id === venda.pedido_id ? { ...u, erroEnvio } : u))
        }
      }
    } catch (e) {
      const faltando = e instanceof FaltaParaEmitir ? e.faltando : []
      setUltima((u) =>
        u && u.venda.pedido_id === venda.pedido_id ? { ...u, nota: { tipo: 'falha', erro: (e as Error).message, faltando } } : u,
      )
    }
  }

  // Acompanha os envios ao cliente até saírem (a nfe-retorno manda em segundo plano).
  const notaDosEnvios = ultima?.nota.tipo === 'nota' ? ultima.nota.nota.id : null
  const enviosPendentes = !!ultima && enviosEmAndamento(ultima.envios)
  useEffect(() => {
    if (!enviosPendentes || !notaDosEnvios) return
    const t = setTimeout(() => {
      enviosDaNota(notaDosEnvios)
        .then((envios) => setUltima((u) => (u && u.nota.tipo === 'nota' && u.nota.nota.id === notaDosEnvios ? { ...u, envios } : u)))
        .catch(() => undefined)
    }, 4000)
    return () => clearTimeout(t)
  }, [enviosPendentes, notaDosEnvios, ultima])

  // Acompanha a nota até ter o DANFE guardado; aí abre a impressão (se marcado neste computador).
  const notaAtual = ultima?.nota.tipo === 'nota' ? ultima.nota.nota : null
  const esperando = !!notaAtual && (notaAtual.status === 'processando' || (notaAtual.status === 'autorizada' && !notaAtual.danfe_path))
  useEffect(() => {
    if (!esperando || !notaAtual?.pedido_id) return
    const pedidoId = notaAtual.pedido_id
    const t = setTimeout(() => {
      notaDoPedido(pedidoId)
        .then((n) => n && setUltima((u) => (u && u.venda.pedido_id === pedidoId ? { ...u, nota: { tipo: 'nota', nota: n } } : u)))
        .catch(() => undefined)
    }, 4000)
    return () => clearTimeout(t)
  }, [esperando, notaAtual])

  // Uma impressão automática por venda, mesmo que a tela redesenhe enquanto o PDF baixa.
  const impressas = useRef(new Set<string>())
  const danfe = notaAtual?.status === 'autorizada' ? notaAtual.danfe_path : null
  const pedidoDaNota = notaAtual?.pedido_id ?? null
  useEffect(() => {
    if (!danfe || !imprimir || !pedidoDaNota || impressas.current.has(pedidoDaNota)) return
    impressas.current.add(pedidoDaNota)
    imprimirDanfe(danfe).then((ok) =>
      setUltima((u) => (u && u.venda.pedido_id === pedidoDaNota ? { ...u, impressa: ok } : u)),
    )
  }, [danfe, imprimir, pedidoDaNota])

  async function trocarConta(id: string) {
    setErro(null)
    try {
      await definirContaBalcao(orgId, id || null)
      setVersaoConfig((v) => v + 1)
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  if (erroConfig) {
    return (
      <EstadoVazio icone="caixa" titulo="O balcão não abriu">
        {erroConfig} Quem atende no balcão precisa da permissão “Vê todos os clientes” (Configurações → Equipe).
      </EstadoVazio>
    )
  }

  const pagoNaHora = forma === 'dinheiro' || forma === 'pix' || forma === 'cartao_debito'

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-1 px-4 pt-6 pb-3 lg:px-8">
        <h1 className="text-h1 font-semibold">Balcão</h1>
        <p className="text-pequeno text-texto-3">
          Busque pelo código ou pelo nome. Com o leitor de código de barras, é só passar o produto.
        </p>
      </div>

      <div className="flex-1 overflow-auto px-4 pb-8 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ---------- produtos e itens ---------- */}
          <div className="min-w-0 space-y-4">
            <section aria-label="Buscar produto" className="relative">
              <label className="relative block">
                <span className="sr-only">Buscar produto pelo código ou pelo nome</span>
                <Icone nome="busca" className="pointer-events-none absolute top-3.5 left-3 size-5 text-texto-3" />
                <input
                  ref={campoBusca}
                  type="search"
                  autoFocus
                  autoComplete="off"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={teclaBusca}
                  placeholder={produtos ? 'Código ou nome do produto, e Enter' : 'Carregando produtos…'}
                  className="h-12 w-full rounded-lg border border-borda bg-superficie pr-3 pl-10 text-corpo placeholder:text-texto-3 focus:border-primaria focus:outline-none"
                />
              </label>
              {resultados.length > 0 && (
                <ul className="absolute top-full z-20 mt-1 max-h-80 w-full overflow-auto rounded-md border border-borda bg-superficie py-1 shadow-lg">
                  {resultados.map((p, i) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => adicionar(p)}
                        className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-pequeno hover:bg-fundo ${i === 0 ? 'bg-fundo' : ''}`}
                      >
                        <span className="min-w-0 truncate">
                          {p.nome}
                          {p.codigo && <span className="text-texto-3"> · {p.codigo}</span>}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {moeda(Number(p.preco), true)}
                          {p.controla_estoque && (
                            <span className={Number(p.saldo) > 0 ? 'text-texto-3' : 'text-atencao'}>
                              {' · '}
                              {quantidade(Number(p.saldo))} {p.unidade}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {!busca && !linhas.length && sugestoes.length > 0 && (
              <section aria-label="Mais vendidos">
                <p className="mb-2 text-legenda font-medium text-texto-3 uppercase">Mais vendidos</p>
                <div className="flex flex-wrap gap-2">
                  {sugestoes.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => adicionar(p)}
                      className="rounded-md border border-borda bg-superficie px-3 py-2 text-left text-pequeno hover:border-primaria"
                    >
                      <span className="block max-w-48 truncate font-medium">{p.nome}</span>
                      <span className="text-texto-3 tabular-nums">{moeda(Number(p.preco), true)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="titulo-itens-balcao" className="rounded-lg border border-borda bg-superficie">
              <h2 id="titulo-itens-balcao" className="border-b border-borda px-4 py-3 font-semibold">
                Itens {linhas.length > 0 && <span className="font-normal text-texto-3">({linhas.length})</span>}
              </h2>
              {!linhas.length ? (
                <p className="px-4 py-6 text-pequeno text-texto-3">Nenhum produto ainda. Busque acima ou passe o leitor.</p>
              ) : (
                <ul className="divide-y divide-borda">
                  {calc.map(({ linha: l, bruto, reais, erro: erroDesc }) => {
                    const semSaldo = l.produto.controla_estoque && Number(l.produto.saldo) < l.quantidade
                    return (
                      <li key={l.produto.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                        <div className="min-w-48 flex-1">
                          <p className="font-medium">{l.produto.nome}</p>
                          <p className="text-legenda text-texto-3 tabular-nums">
                            {l.produto.codigo && `${l.produto.codigo} · `}
                            {moeda(Number(l.produto.preco), true)} / {l.produto.unidade}
                            {semSaldo && (
                              <span className="text-atencao">
                                {' · '}estoque: {quantidade(Number(l.produto.saldo))} (pode vender)
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`Tirar um de ${l.produto.nome}`}
                            onClick={() => l.quantidade > 1 && mudarLinha(l.produto.id!, { quantidade: l.quantidade - 1 })}
                            disabled={l.quantidade <= 1}
                            className="flex size-9 items-center justify-center rounded-md border border-borda text-corpo hover:bg-fundo disabled:opacity-40"
                          >
                            −
                          </button>
                          <input
                            aria-label={`Quantidade de ${l.produto.nome}`}
                            inputMode="decimal"
                            value={quantidade(l.quantidade)}
                            onChange={(e) => {
                              const n = lerNumero(e.target.value)
                              if (n != null && n > 0) mudarLinha(l.produto.id!, { quantidade: n })
                            }}
                            className="h-9 w-16 rounded-md border border-borda bg-superficie px-2 text-center tabular-nums focus:border-primaria focus:outline-none"
                          />
                          <button
                            type="button"
                            aria-label={`Mais um de ${l.produto.nome}`}
                            onClick={() => mudarLinha(l.produto.id!, { quantidade: l.quantidade + 1 })}
                            className="flex size-9 items-center justify-center rounded-md border border-borda text-corpo hover:bg-fundo"
                          >
                            +
                          </button>
                        </div>
                        <div className="w-28">
                          <input
                            aria-label={`Desconto de ${l.produto.nome}, em reais ou em %`}
                            aria-invalid={!!erroDesc || undefined}
                            inputMode="decimal"
                            value={l.desconto}
                            placeholder="Desc. R$ ou %"
                            onChange={(e) => mudarLinha(l.produto.id!, { desconto: e.target.value })}
                            className={`h-9 w-full rounded-md border bg-superficie px-2 text-right tabular-nums placeholder:text-texto-3 focus:outline-none ${
                              erroDesc ? 'border-erro' : 'border-borda focus:border-primaria'
                            }`}
                          />
                          {erroDesc && <p className="mt-0.5 text-legenda text-erro">{erroDesc}</p>}
                        </div>
                        <div className="w-28 text-right tabular-nums">
                          <p className="font-semibold">{moeda(bruto - (erroDesc ? 0 : reais), true)}</p>
                          {!erroDesc && reais > 0 && <p className="text-legenda text-texto-3">− {moeda(reais, true)}</p>}
                        </div>
                        <button
                          type="button"
                          aria-label={`Tirar ${l.produto.nome} da venda`}
                          onClick={() => setLinhas((x) => x.filter((y) => y.produto.id !== l.produto.id))}
                          className="flex size-9 items-center justify-center rounded-md text-texto-3 hover:bg-erro-suave hover:text-erro"
                        >
                          <Icone nome="lixeira" className="size-4" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {ultima && <UltimaVenda ultima={ultima} aoImprimir={(path) => void imprimirDanfe(path)} />}
          </div>

          {/* ---------- cliente, pagamento e fechamento ---------- */}
          <div className="space-y-4">
            <EscolherCliente orgId={orgId} cliente={cliente} aoMudar={setCliente} />

            <section aria-labelledby="titulo-pagamento" className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
              <h2 id="titulo-pagamento" className="font-semibold">
                Pagamento
              </h2>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Forma de pagamento">
                {FORMAS_BALCAO.map((f) => (
                  <button
                    key={f.valor}
                    type="button"
                    role="radio"
                    aria-checked={forma === f.valor}
                    onClick={() => setForma(f.valor)}
                    className={`h-10 rounded-md border text-pequeno font-medium ${
                      forma === f.valor ? 'border-primaria bg-primaria-suave text-primaria' : 'border-borda hover:bg-fundo'
                    }`}
                  >
                    {f.rotulo}
                  </button>
                ))}
              </div>

              {forma === 'dinheiro' && (
                <div className="flex items-end gap-3">
                  <label className="flex-1 space-y-1">
                    <span className="block text-pequeno font-medium text-texto-2">Valor recebido (opcional)</span>
                    <input
                      inputMode="decimal"
                      value={recebido}
                      onChange={(e) => setRecebido(e.target.value)}
                      placeholder="0,00"
                      className="h-10 w-full rounded-md border border-borda bg-superficie px-3 text-right tabular-nums placeholder:text-texto-3 focus:border-primaria focus:outline-none"
                    />
                  </label>
                  {valorRecebido != null && valorRecebido >= total && total > 0 && (
                    <p className="pb-2 text-pequeno">
                      Troco: <strong className="tabular-nums">{moeda(r2(valorRecebido - total), true)}</strong>
                    </p>
                  )}
                </div>
              )}
              {forma === 'a_prazo' && (
                <div className="space-y-2">
                  <p className="text-pequeno font-medium text-texto-2">Prazos (dias, em boleto)</p>
                  <div className="flex flex-wrap gap-2">
                    {[...PRAZOS_PRONTOS, 'outro'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={prazoEscolhido === p}
                        onClick={() => setPrazoEscolhido(p)}
                        className={`h-9 rounded-md border px-3 text-pequeno ${
                          prazoEscolhido === p ? 'border-primaria bg-primaria-suave text-primaria' : 'border-borda hover:bg-fundo'
                        }`}
                      >
                        {p === 'outro' ? 'Outro' : p}
                      </button>
                    ))}
                  </div>
                  {prazoEscolhido === 'outro' && (
                    <input
                      aria-label="Prazos em dias"
                      value={prazoOutro}
                      onChange={(e) => setPrazoOutro(e.target.value)}
                      placeholder="Ex.: 28/56"
                      className="h-10 w-full rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
                    />
                  )}
                  {prazos && total > 0 && (
                    <p className="text-legenda text-texto-3">
                      {prazos.length} parcela{prazos.length > 1 ? 's' : ''} de cerca de {moeda(r2(total / prazos.length), true)}
                    </p>
                  )}
                </div>
              )}
              {config && (
                <p className="text-legenda text-texto-3">
                  {!config.financeiro
                    ? 'O Financeiro está desligado: a venda não gera contas a receber.'
                    : pagoNaHora
                      ? `Entra pago na conta ${config.conta?.nome ?? 'do caixa'}.`
                      : forma === 'cartao_credito'
                        ? 'Fica a receber em 30 dias, até cair o dinheiro da maquininha.'
                        : 'Fica a receber no Financeiro, nos prazos escolhidos.'}
                </p>
              )}
              {config?.gerencia && config.financeiro && config.contas && config.contas.length > 1 && (
                <label className="block space-y-1">
                  <span className="block text-legenda text-texto-3">Conta das vendas pagas na hora (só dono e admin mudam)</span>
                  <select
                    value={config.conta_escolhida ?? ''}
                    onChange={(e) => void trocarConta(e.target.value)}
                    className="h-9 w-full rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none"
                  >
                    <option value="">Automática ({config.contas.find((c) => c.tipo === 'caixa')?.nome ?? config.contas[0].nome})</option>
                    {config.contas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </section>

            <section aria-label="Total e fechamento" className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
              <div className="space-y-1.5 text-pequeno tabular-nums">
                <div className="flex justify-between">
                  <span className="text-texto-2">Itens</span>
                  <span>{moeda(subtotal, true)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="balcao-desconto" className="text-texto-2">
                    Desconto no total (R$)
                  </label>
                  <input
                    id="balcao-desconto"
                    inputMode="decimal"
                    value={descontoTotal}
                    onChange={(e) => setDescontoTotal(e.target.value)}
                    placeholder="0,00"
                    className="h-8 w-28 rounded-md border border-borda bg-superficie px-2 text-right placeholder:text-texto-3 focus:border-primaria focus:outline-none"
                  />
                </div>
                <div className="flex justify-between border-t border-borda pt-2 text-h2 font-semibold">
                  <span>Total</span>
                  <span>{moeda(total, true)}</span>
                </div>
              </div>

              <label className="block space-y-1">
                <span className="block text-pequeno font-medium text-texto-2">Observação (opcional)</span>
                <input
                  value={observacao}
                  maxLength={500}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Ex.: retira amanhã"
                  className="h-10 w-full rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
                />
              </label>

              <fieldset className="space-y-2 text-pequeno">
                <legend className="sr-only">Nota fiscal</legend>
                <label className={`flex items-start gap-2 ${podeNota && cliente ? 'cursor-pointer' : 'opacity-60'}`}>
                  <input
                    type="checkbox"
                    checked={vaiEmitir}
                    disabled={!podeNota || !cliente}
                    onChange={(e) => setEmitir(e.target.checked)}
                    className="mt-0.5 size-4 accent-primaria"
                  />
                  <span>
                    Emitir a NF-e{config?.emissora ? ` pelo CNPJ ${config.emissora.nome}` : ''}
                    {motivoSemNota && <span className="block text-legenda text-texto-3">{motivoSemNota}</span>}
                  </span>
                </label>
                {vaiEmitir && (
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={imprimir}
                      onChange={(e) => {
                        setImprimir(e.target.checked)
                        gravarPreferencia(e.target.checked)
                      }}
                      className="mt-0.5 size-4 accent-primaria"
                    />
                    <span>
                      Abrir a impressão do DANFE quando a nota for autorizada
                      <span className="block text-legenda text-texto-3">Fica lembrado neste computador.</span>
                    </span>
                  </label>
                )}
                {vaiEmitir && cliente && (
                  <div className="space-y-2 rounded-md bg-fundo p-3">
                    <p className="text-legenda font-medium text-texto-2 uppercase">Quando a nota for autorizada</p>
                    {formEnvio ? (
                      <CamposEnvio
                        destinos={destinosCli.destinos}
                        valor={formEnvio}
                        aoMudar={(f) => setEnvioForm({ clienteId: cliente.id, form: f })}
                      />
                    ) : (
                      <p className="text-legenda text-texto-3">Carregando o WhatsApp e o e-mail do cliente…</p>
                    )}
                  </div>
                )}
              </fieldset>

              {erro && <Aviso tom="erro">{erro}</Aviso>}
              <Botao className="h-12 w-full text-corpo" onClick={() => void fechar()} disabled={!!bloqueio} carregando={fechando}>
                Fechar venda · {moeda(total, true)}
              </Botao>
              {bloqueio && linhas.length > 0 && <p className="text-legenda text-texto-3">{bloqueio}</p>}
              {linhas.length > 0 && (
                <button type="button" onClick={limpar} className="w-full text-center text-legenda text-texto-3 underline">
                  Cancelar esta venda (limpa a tela)
                </button>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function EscolherCliente({
  orgId,
  cliente,
  aoMudar,
}: {
  orgId: string
  cliente: ClienteResumo | null
  aoMudar: (c: ClienteResumo | null) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState<{ termo: string; itens: ClienteResumo[] } | null>(null)

  useEffect(() => {
    const termo = busca.trim()
    if (!aberto || termo.length < 2) return
    let ativo = true
    const t = setTimeout(() => {
      procurarClientes(orgId, termo)
        .then((itens) => ativo && setLista({ termo, itens }))
        .catch(() => ativo && setLista({ termo, itens: [] }))
    }, 300)
    return () => {
      ativo = false
      clearTimeout(t)
    }
  }, [orgId, busca, aberto])

  const itens = lista && lista.termo === busca.trim() ? lista.itens : null

  return (
    <section aria-labelledby="titulo-cliente-balcao" className="space-y-2 rounded-lg border border-borda bg-superficie p-4">
      <h2 id="titulo-cliente-balcao" className="font-semibold">
        Cliente
      </h2>
      {cliente ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{cliente.razao_social || cliente.nome}</p>
            <p className="text-legenda text-texto-3">
              {cliente.documento ? formatarDocumento(cliente.documento) : 'sem CNPJ/CPF'}
              {cliente.cidade && ` · ${cliente.cidade}${cliente.uf ? `/${cliente.uf}` : ''}`}
            </p>
          </div>
          <button type="button" onClick={() => aoMudar(null)} className="shrink-0 text-legenda text-texto-3 underline">
            Consumidor final
          </button>
        </div>
      ) : !aberto ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-pequeno text-texto-2">Consumidor final</p>
          <button type="button" onClick={() => setAberto(true)} className="text-pequeno font-medium text-primaria underline">
            Escolher cliente
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setAberto(false)}
            placeholder="Nome, razão social, CNPJ ou CPF"
            aria-label="Buscar cliente"
            className="h-10 w-full rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
          {busca.trim().length >= 2 &&
            (itens === null ? (
              <p className="text-legenda text-texto-3">Buscando…</p>
            ) : !itens.length ? (
              <p className="text-legenda text-texto-3">
                Nenhum cliente encontrado. Cadastre em <Link to="/clientes" className="underline">Clientes</Link> e volte.
              </p>
            ) : (
              <ul className="divide-y divide-borda rounded-md border border-borda">
                {itens.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        aoMudar(c)
                        setAberto(false)
                        setBusca('')
                      }}
                      className="w-full px-3 py-2 text-left text-pequeno hover:bg-fundo"
                    >
                      <span className="block truncate font-medium">{c.razao_social || c.nome}</span>
                      <span className="text-legenda text-texto-3">{c.documento ? formatarDocumento(c.documento) : 'sem CNPJ/CPF'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}
          <button type="button" onClick={() => setAberto(false)} className="text-legenda text-texto-3 underline">
            Continuar como consumidor final
          </button>
        </div>
      )}
    </section>
  )
}

const ROTULO_FORMA: Record<FormaBalcao, string> = {
  dinheiro: 'dinheiro',
  pix: 'Pix',
  cartao_debito: 'débito',
  cartao_credito: 'crédito',
  a_prazo: 'a prazo',
}

/** Andamento da última venda: o vendedor já pode atender o próximo enquanto a nota anda. */
function UltimaVenda({ ultima, aoImprimir }: { ultima: Ultima; aoImprimir: (path: string) => void }) {
  const { venda, nota } = ultima
  const n = nota.tipo === 'nota' ? nota.nota : null
  const passo = (ok: boolean | null, texto: string, extra?: ReactNode) => (
    <li className="flex items-start gap-2">
      <Icone
        nome={ok === false ? 'erro' : ok ? 'check' : 'relogio'}
        className={`mt-0.5 size-4 shrink-0 ${ok === false ? 'text-erro' : ok ? 'text-primaria' : 'text-texto-3'}`}
      />
      <span className="min-w-0">
        {texto}
        {extra}
      </span>
    </li>
  )
  return (
    <section aria-live="polite" className="space-y-2 rounded-lg border border-borda bg-superficie p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          Venda nº {venda.numero} fechada · {moeda(Number(venda.total), true)}
        </h2>
        <Link to={`/pedidos/${venda.pedido_id}`} className="text-pequeno font-medium text-primaria underline">
          Ver pedido
        </Link>
      </div>
      <ul className="space-y-1.5 text-pequeno">
        {passo(true, `${ultima.cliente ?? 'Consumidor final'} · ${ROTULO_FORMA[ultima.forma]}${venda.pago ? ', já pago' : ''}`)}
        {passo(true, 'Estoque baixado e pedido entregue')}
        {nota.tipo === 'sem' && nota.motivo && passo(null, `Sem NF-e: ${nota.motivo}`)}
        {nota.tipo === 'enviando' && passo(null, 'NF-e: enviando…')}
        {nota.tipo === 'falha' &&
          passo(
            false,
            `NF-e não saiu: ${nota.erro}`,
            <>
              {nota.faltando.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-legenda">
                  {nota.faltando.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              <span className="block text-legenda text-texto-3">A venda está gravada. Acerte o que falta e emita no pedido.</span>
            </>,
          )}
        {n &&
          (n.status === 'processando'
            ? passo(null, 'NF-e: na SEFAZ… costuma levar de segundos a poucos minutos.')
            : n.status === 'autorizada'
              ? passo(
                  true,
                  `NF-e nº ${n.numero ?? ''} autorizada${n.ambiente === 'homologacao' ? ' (teste, sem valor fiscal)' : ''}`,
                  n.danfe_path ? (
                    <>
                      {' · '}
                      <button type="button" onClick={() => aoImprimir(n.danfe_path!)} className="font-medium text-primaria underline">
                        {ultima.impressa ? 'imprimir de novo' : 'imprimir o DANFE'}
                      </button>
                      {ultima.impressa === false && (
                        <span className="block text-legenda text-erro">A impressão não abriu sozinha. Clique em imprimir o DANFE.</span>
                      )}
                    </>
                  ) : (
                    <span className="text-texto-3"> · preparando o DANFE…</span>
                  ),
                )
              : passo(false, `NF-e ${n.status === 'rejeitada' ? 'recusada' : n.status}: ${n.mensagem ?? 'veja no pedido'}`))}
      </ul>
      {ultima.erroEnvio && <Aviso tom="erro">Envio da nota ao cliente: {ultima.erroEnvio} Reenvie pelo pedido.</Aviso>}
      {ultima.envios.length > 0 && (
        <div className="border-t border-borda pt-2">
          <ListaEnvios envios={ultima.envios} />
        </div>
      )}
    </section>
  )
}
