import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  adicionarItem,
  apagarPedido,
  atualizarItem,
  atualizarPedido,
  buscarPedido,
  lerNumero,
  listarProdutos,
  mudarStatusPedido,
  PROXIMOS,
  quantidade,
  removerItem,
  type ItemPedido,
  type Pedido,
  type Produto,
  type StatusPedido,
} from '../services/erp'
import { listarEmissoras, type Emissora } from '../services/empresa'
import {
  conversaDoCliente,
  enviarOrcamentoWhatsapp,
  gerarPdfOrcamento,
  montarOrcamento,
  nomeArquivoOrcamento,
  type ConversaEnvio,
} from '../services/orcamento'
import { moeda, nomeDoContato, quandoCurto } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { CampoTexto } from '../components/CampoTexto'
import { DialogoConfirmacao } from '../components/DialogoConfirmacao'
import { EstadoVazio } from '../components/EstadoVazio'
import { EtiquetaPedido } from '../components/EtiquetaPedido'
import { Icone } from '../components/Icone'

const ROTULO_ACAO: Partial<Record<StatusPedido, string>> = {
  confirmado: 'Confirmar pedido',
  separando: 'Separando',
  enviado: 'Marcar como enviado',
  entregue: 'Marcar como entregue',
  rascunho: 'Voltar para rascunho',
  cancelado: 'Cancelar pedido',
}

const texto = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

export function PedidoDetalhe() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { orgAtiva, modulos } = useSessao()
  const orgId = orgAtiva!.id
  const [dados, setDados] = useState<{ chave: string; pedido: Pedido; itens: ItemPedido[] } | null | undefined>(undefined)
  const [versao, setVersao] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<StatusPedido | 'apagar' | null>(null)
  const [conversa, setConversa] = useState<{ contatoId: string; info: ConversaEnvio | null } | null>(null)
  const [confirmarEnvio, setConfirmarEnvio] = useState(false)
  const [enviadoEm, setEnviadoEm] = useState<string | null>(null)

  const chave = `${id}|${versao}`
  useEffect(() => {
    if (!id) return
    let ativo = true
    buscarPedido(id)
      .then((r) => ativo && setDados(r ? { chave, ...r } : null))
      .catch(() => ativo && setErro('Não foi possível carregar o pedido.'))
    return () => {
      ativo = false
    }
  }, [id, chave])

  // Conversa do cliente por onde o PDF sai (a mais recente que a pessoa vê).
  const contatoId = dados?.pedido.contato_id ?? null
  useEffect(() => {
    if (!contatoId) return
    let ativo = true
    conversaDoCliente(contatoId)
      .then((info) => ativo && setConversa({ contatoId, info }))
      .catch(() => ativo && setConversa({ contatoId, info: null }))
    return () => {
      ativo = false
    }
  }, [contatoId])
  const envio = conversa && conversa.contatoId === contatoId ? conversa.info : undefined

  if (modulos && !modulos.has('erp')) {
    return <EstadoVazio icone="pedido" titulo="Pedidos e estoque não está ligado nesta empresa" />
  }
  if (dados === null) {
    return (
      <EstadoVazio icone="pedido" titulo="Pedido não encontrado" acao={<Link to="/pedidos" className="font-medium text-primaria underline">Voltar para Pedidos</Link>}>
        Ele pode ser de um cliente da carteira de outro vendedor.
      </EstadoVazio>
    )
  }
  const atual = dados
  if (!atual) return <p className="p-6 text-pequeno text-texto-3">{erro ?? 'Carregando pedido…'}</p>

  const { pedido, itens } = atual
  const rascunho = pedido.status === 'rascunho'
  const recarregar = () => setVersao((v) => v + 1)

  async function executar(chaveOcupado: string, fn: () => Promise<unknown>) {
    setOcupado(chaveOcupado)
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

  // Gera no navegador e baixa. Lê do banco (não da tela): sai exatamente o que está salvo.
  async function baixarPdf() {
    setOcupado('pdf')
    setErro(null)
    try {
      const dadosPdf = await montarOrcamento(orgId, pedido.id)
      const url = URL.createObjectURL(await gerarPdfOrcamento(dadosPdf))
      const a = document.createElement('a')
      a.href = url
      a.download = nomeArquivoOrcamento(dadosPdf)
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setErro('Não foi possível gerar o PDF. Tente de novo.')
    } finally {
      setOcupado(null)
    }
  }

  // Antes de confirmar o envio, explica por que não dá (sem cliente, sem conversa, janela da API oficial).
  function pedirEnvio() {
    setEnviadoEm(null)
    if (!pedido.contato) return setErro('Escolha o cliente do pedido para enviar pelo WhatsApp.')
    if (envio === undefined) return setErro('Procurando a conversa do cliente. Tente de novo em instantes.')
    if (!envio)
      return setErro(
        `${nomeDoContato(pedido.contato)} ainda não tem conversa no Livih. Comece uma em Conversas → Nova conversa e envie o PDF de lá, ou baixe e mande por outro canal.`,
      )
    if (envio.janelaFechada)
      return setErro(
        `Faz mais de 24 horas que ${nomeDoContato(pedido.contato)} escreveu no número ${envio.numero} (API oficial): só dá para retomar com um modelo aprovado. Depois que o cliente responder, o PDF pode ir.`,
      )
    setErro(null)
    setConfirmarEnvio(true)
  }

  async function enviarWhatsapp() {
    if (!envio) return
    setOcupado('whatsapp')
    setErro(null)
    try {
      await enviarOrcamentoWhatsapp(orgId, envio.id, await montarOrcamento(orgId, pedido.id))
      setEnviadoEm(envio.id)
    } catch {
      setErro('O PDF não foi enviado. Confira a conexão e tente de novo.')
    } finally {
      setOcupado(null)
      setConfirmarEnvio(false)
    }
  }

  // Ações destrutivas (cancelar, voltar ao rascunho, apagar) pedem confirmação; o resto vai direto.
  function acao(s: StatusPedido) {
    if (s === 'cancelado' || s === 'rascunho') setConfirmar(s)
    else void executar(s, () => mudarStatusPedido(pedido.id, s))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 lg:px-8">
        <Link to="/pedidos" className="inline-flex items-center gap-1 text-pequeno text-texto-2 hover:text-primaria">
          <Icone nome="voltar" className="size-4" /> Pedidos
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="flex flex-wrap items-center gap-3 text-h1 font-semibold">
              Pedido #{pedido.numero} <EtiquetaPedido status={pedido.status} />
            </h1>
            <p className="text-pequeno text-texto-2">
              {pedido.contato ? (
                <Link to={`/contatos/${pedido.contato.id}`} className="font-medium text-primaria hover:underline">
                  {nomeDoContato(pedido.contato)}
                </Link>
              ) : (
                'Sem cliente'
              )}
              <span className="text-texto-3"> · criado {quandoCurto(pedido.criado_em).toLowerCase()}</span>
              {pedido.origem === 'agente' && <span className="text-texto-3"> · montado pelo agente</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Botao
              tamanho="sm"
              variante="secundario"
              icone="baixar"
              carregando={ocupado === 'pdf'}
              disabled={!!ocupado || !itens.length}
              title={itens.length ? undefined : 'Adicione itens para gerar o PDF'}
              onClick={() => void baixarPdf()}
            >
              {rascunho ? 'Orçamento em PDF' : 'PDF do pedido'}
            </Botao>
            <Botao
              tamanho="sm"
              variante="secundario"
              icone="enviar"
              carregando={ocupado === 'whatsapp'}
              disabled={!!ocupado || !itens.length}
              onClick={pedirEnvio}
            >
              Enviar pelo WhatsApp
            </Botao>
            {PROXIMOS[pedido.status].map((s) => (
              <Botao
                key={s}
                tamanho="sm"
                variante={s === 'cancelado' || s === 'rascunho' ? 'fantasma' : s === PROXIMOS[pedido.status][0] ? 'primario' : 'secundario'}
                carregando={ocupado === s}
                disabled={!!ocupado}
                onClick={() => acao(s)}
              >
                {ROTULO_ACAO[s]}
              </Botao>
            ))}
            {rascunho && (
              <Botao tamanho="sm" variante="fantasma" icone="lixeira" onClick={() => setConfirmar('apagar')} disabled={!!ocupado}>
                Apagar
              </Botao>
            )}
          </div>
        </div>

        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {enviadoEm && (
          <Aviso>
            PDF enviado. Ele aparece na conversa como “Enviando” e muda para entregue quando chegar.{' '}
            <Link to={`/conversas/${enviadoEm}`} className="font-medium text-primaria underline">
              Ver na conversa
            </Link>
          </Aviso>
        )}
        {rascunho && <Aviso>Rascunho: ajuste os itens e confirme. Só na confirmação o estoque baixa.</Aviso>}

        <Itens orgId={orgId} pedido={pedido} itens={itens} editavel={rascunho} aoMudar={recarregar} aoErro={setErro} />

        <Totais pedido={pedido} editavel={rascunho} aoMudar={recarregar} aoErro={setErro} />

        {/* Recria ao trocar a empresa: o banco recarrega validade, condições e prazo. */}
        <Orcamento key={pedido.emissora_id ?? 'sem'} orgId={orgId} pedido={pedido} editavel={rascunho} aoMudar={recarregar} aoErro={setErro} />

        <Observacao pedido={pedido} aoErro={setErro} />
      </div>

      <DialogoConfirmacao
        aberto={confirmarEnvio}
        titulo={`Enviar ${rascunho ? 'o orçamento' : 'o pedido'} pelo WhatsApp?`}
        rotuloConfirmar="Enviar PDF"
        carregando={ocupado === 'whatsapp'}
        aoConfirmar={() => void enviarWhatsapp()}
        aoCancelar={() => setConfirmarEnvio(false)}
      >
        {rascunho ? 'O orçamento' : 'O pedido'} nº {pedido.numero} vai em PDF para {pedido.contato ? nomeDoContato(pedido.contato) : 'o cliente'} pelo
        número {envio?.numero}. Sai exatamente o que está salvo agora, fica no histórico da conversa e você assume o atendimento.
      </DialogoConfirmacao>

      <DialogoConfirmacao
        aberto={!!confirmar}
        titulo={confirmar === 'apagar' ? 'Apagar este rascunho?' : confirmar === 'cancelado' ? 'Cancelar este pedido?' : 'Voltar para rascunho?'}
        rotuloConfirmar={confirmar === 'apagar' ? 'Apagar' : confirmar === 'cancelado' ? 'Cancelar pedido' : 'Voltar para rascunho'}
        perigo={confirmar !== 'rascunho'}
        carregando={!!ocupado}
        aoConfirmar={() => {
          const c = confirmar
          if (c === 'apagar') {
            setOcupado('apagar')
            apagarPedido(pedido.id)
              .then(() => navegar('/pedidos'))
              .catch((e) => {
                setErro((e as Error).message)
                setOcupado(null)
                setConfirmar(null)
              })
          } else if (c) {
            void executar(c, () => mudarStatusPedido(pedido.id, c)).then(() => setConfirmar(null))
          }
        }}
        aoCancelar={() => setConfirmar(null)}
      >
        {confirmar === 'apagar'
          ? 'O rascunho e os itens somem. O número dele não é reaproveitado.'
          : confirmar === 'cancelado'
            ? `O pedido fica registrado como cancelado${pedido.estoque_baixado ? ' e os itens voltam para o estoque' : ''}. Não dá para desfazer.`
            : `Os itens ${pedido.estoque_baixado ? 'voltam para o estoque e ' : ''}podem ser editados de novo.`}
      </DialogoConfirmacao>
    </div>
  )
}

function Itens({
  orgId,
  pedido,
  itens,
  editavel,
  aoMudar,
  aoErro,
}: {
  orgId: string
  pedido: Pedido
  itens: ItemPedido[]
  editavel: boolean
  aoMudar: () => void
  aoErro: (m: string | null) => void
}) {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [busca, setBusca] = useState('')
  const [produtoId, setProdutoId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [qtd, setQtd] = useState('1')
  const [preco, setPreco] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!editavel) return
    let ativo = true
    listarProdutos(orgId)
      .then((l) => ativo && setProdutos(l))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, editavel])

  const sugestoes = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t || produtoId) return []
    return produtos.filter((p) => `${p.nome} ${p.codigo ?? ''}`.toLowerCase().includes(t)).slice(0, 8)
  }, [busca, produtos, produtoId])

  function escolher(p: Produto) {
    setProdutoId(p.id!)
    setBusca(p.nome!)
    setDescricao(p.nome!)
    setPreco(texto(Number(p.preco)))
  }

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    const q = lerNumero(qtd)
    const pr = lerNumero(preco)
    const desc = (produtoId ? descricao : busca).trim()
    if (!desc || !q || q <= 0 || pr == null || pr < 0) {
      aoErro('Informe o item, a quantidade e o preço.')
      return
    }
    setSalvando(true)
    aoErro(null)
    try {
      await adicionarItem(orgId, pedido.id, {
        produto_id: produtoId || null,
        descricao: desc,
        quantidade: q,
        preco_unitario: pr,
        ordem: itens.length,
      })
      setProdutoId('')
      setBusca('')
      setDescricao('')
      setQtd('1')
      setPreco('')
      aoMudar()
    } catch (e) {
      aoErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const produtoEscolhido = produtos.find((p) => p.id === produtoId)

  return (
    <section aria-labelledby="titulo-itens" className="rounded-lg border border-borda bg-superficie">
      <h2 id="titulo-itens" className="border-b border-borda px-4 py-3 font-semibold">
        Itens
      </h2>
      {itens.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-pequeno">
            <thead className="text-left text-legenda text-texto-3 uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 text-right font-medium">Qtd.</th>
                <th className="px-4 py-2 text-right font-medium">Preço</th>
                <th className="px-4 py-2 text-right font-medium">Subtotal</th>
                {editavel && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {itens.map((i) => (
                <LinhaItem key={i.id} item={i} editavel={editavel} aoMudar={aoMudar} aoErro={aoErro} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-4 text-pequeno text-texto-3">Nenhum item ainda.</p>
      )}

      {editavel && (
        <form onSubmit={adicionar} className="flex flex-wrap items-end gap-2 border-t border-borda p-4">
          <div className="relative min-w-56 flex-1 space-y-1.5">
            <label htmlFor="item-produto" className="block text-pequeno font-medium text-texto-2">
              Produto ou item avulso
            </label>
            <input
              id="item-produto"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setProdutoId('')
              }}
              autoComplete="off"
              placeholder="Buscar no catálogo ou digitar"
              className="block h-10 w-full rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
            {sugestoes.length > 0 && (
              <ul className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-borda bg-superficie py-1 shadow-lg">
                {sugestoes.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => escolher(p)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-pequeno hover:bg-fundo"
                    >
                      <span className="min-w-0 truncate">
                        {p.nome}
                        {p.codigo && <span className="text-texto-3"> · {p.codigo}</span>}
                      </span>
                      <span className="shrink-0 text-texto-3 tabular-nums">
                        {moeda(Number(p.preco))}
                        {p.controla_estoque && ` · ${quantidade(Number(p.saldo))} ${p.unidade}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <CampoTexto rotulo="Qtd." inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} className="w-20" />
          <CampoTexto rotulo="Preço (R$)" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} className="w-28" placeholder="0,00" />
          <Botao type="submit" variante="secundario" icone="mais" carregando={salvando}>
            Adicionar
          </Botao>
          {produtoEscolhido?.controla_estoque && Number(produtoEscolhido.saldo) < (lerNumero(qtd) ?? 0) && (
            <p className="w-full text-legenda text-atencao">
              Estoque atual: {quantidade(Number(produtoEscolhido.saldo))} {produtoEscolhido.unidade}. O pedido pode ser confirmado mesmo assim.
            </p>
          )}
        </form>
      )}
    </section>
  )
}

function LinhaItem({ item, editavel, aoMudar, aoErro }: { item: ItemPedido; editavel: boolean; aoMudar: () => void; aoErro: (m: string | null) => void }) {
  const [qtd, setQtd] = useState(texto(Number(item.quantidade)))
  const [preco, setPreco] = useState(texto(Number(item.preco_unitario)))

  async function salvarCampo(campo: 'quantidade' | 'preco_unitario', valor: string) {
    const n = lerNumero(valor)
    const original = campo === 'quantidade' ? Number(item.quantidade) : Number(item.preco_unitario)
    if (n === original) return
    if (n == null || n < 0 || (campo === 'quantidade' && n === 0)) {
      aoErro('Valor inválido.')
      return
    }
    try {
      await atualizarItem(item.id, { [campo]: n })
      aoMudar()
    } catch (e) {
      aoErro((e as Error).message)
    }
  }

  const campo = 'h-8 w-24 rounded-md border border-borda bg-superficie px-2 text-right tabular-nums focus:border-primaria focus:outline-none'
  return (
    <tr>
      <td className="px-4 py-2">{item.descricao}</td>
      <td className="px-4 py-2 text-right tabular-nums">
        {editavel ? (
          <input aria-label={`Quantidade de ${item.descricao}`} inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} onBlur={() => void salvarCampo('quantidade', qtd)} className={campo} />
        ) : (
          quantidade(Number(item.quantidade))
        )}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {editavel ? (
          <input aria-label={`Preço de ${item.descricao}`} inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} onBlur={() => void salvarCampo('preco_unitario', preco)} className={campo} />
        ) : (
          moeda(Number(item.preco_unitario))
        )}
      </td>
      <td className="px-4 py-2 text-right font-medium tabular-nums">{moeda(Number(item.subtotal))}</td>
      {editavel && (
        <td className="px-2 py-2">
          <button
            type="button"
            aria-label={`Tirar ${item.descricao}`}
            onClick={() => removerItem(item.id).then(aoMudar).catch((e) => aoErro((e as Error).message))}
            className="flex size-8 items-center justify-center rounded-md text-texto-3 hover:bg-erro-suave hover:text-erro"
          >
            <Icone nome="lixeira" className="size-4" />
          </button>
        </td>
      )}
    </tr>
  )
}

function Totais({ pedido, editavel, aoMudar, aoErro }: { pedido: Pedido; editavel: boolean; aoMudar: () => void; aoErro: (m: string | null) => void }) {
  const [desconto, setDesconto] = useState(texto(Number(pedido.desconto)))
  const [frete, setFrete] = useState(texto(Number(pedido.frete)))

  async function salvar(campo: 'desconto' | 'frete', valor: string) {
    const n = lerNumero(valor) ?? 0
    if (n === Number(pedido[campo])) return
    if (n < 0) {
      aoErro('Valor inválido.')
      return
    }
    try {
      await atualizarPedido(pedido.id, { [campo]: n })
      aoMudar()
    } catch (e) {
      aoErro((e as Error).message)
    }
  }

  const linha = 'flex items-center justify-between gap-4 py-1.5'
  const campo = 'h-8 w-28 rounded-md border border-borda bg-superficie px-2 text-right tabular-nums focus:border-primaria focus:outline-none'
  return (
    <section aria-label="Totais" className="ml-auto max-w-sm rounded-lg border border-borda bg-superficie px-4 py-2 text-pequeno tabular-nums">
      <div className={linha}>
        <span className="text-texto-2">Subtotal</span>
        <span>{moeda(Number(pedido.subtotal))}</span>
      </div>
      <div className={linha}>
        <label htmlFor="ped-desconto" className="text-texto-2">
          Desconto
        </label>
        {editavel ? (
          <input id="ped-desconto" inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} onBlur={() => void salvar('desconto', desconto)} className={campo} />
        ) : (
          <span>− {moeda(Number(pedido.desconto))}</span>
        )}
      </div>
      <div className={linha}>
        <label htmlFor="ped-frete" className="text-texto-2">
          Frete
        </label>
        {editavel ? (
          <input id="ped-frete" inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} onBlur={() => void salvar('frete', frete)} className={campo} />
        ) : (
          <span>{moeda(Number(pedido.frete))}</span>
        )}
      </div>
      <div className={`${linha} border-t border-borda pt-2 text-corpo font-semibold`}>
        <span>Total</span>
        <span>{moeda(Number(pedido.total))}</span>
      </div>
    </section>
  )
}

function Observacao({ pedido, aoErro }: { pedido: Pedido; aoErro: (m: string | null) => void }) {
  const [obs, setObs] = useState(pedido.observacao ?? '')
  const [salvo, setSalvo] = useState(false)
  return (
    <section className="space-y-1.5">
      <label htmlFor="ped-obs" className="block text-pequeno font-medium text-texto-2">
        Observação
      </label>
      <textarea
        id="ped-obs"
        rows={3}
        maxLength={2000}
        value={obs}
        onChange={(e) => {
          setObs(e.target.value)
          setSalvo(false)
        }}
        onBlur={() => {
          if (obs === (pedido.observacao ?? '')) return
          atualizarPedido(pedido.id, { observacao: obs.trim() || null })
            .then(() => setSalvo(true))
            .catch((e) => aoErro((e as Error).message))
        }}
        placeholder="Endereço de entrega, forma de pagamento, combinados com o cliente"
        className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none"
      />
      {salvo && <p className="text-legenda text-texto-3">Salvo.</p>}
    </section>
  )
}

const hojeBrasil = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const dataCurta = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR')

/** De qual empresa (CNPJ) o orçamento sai, vendedor, validade, condições e prazo. Tudo vai para o PDF. */
function Orcamento({
  orgId,
  pedido,
  editavel,
  aoMudar,
  aoErro,
}: {
  orgId: string
  pedido: Pedido
  editavel: boolean
  aoMudar: () => void
  aoErro: (m: string | null) => void
}) {
  const { equipe } = useSessao()
  const [emissoras, setEmissoras] = useState<{ orgId: string; lista: Emissora[] } | null>(null)
  const [validade, setValidade] = useState(pedido.validade ?? '')
  const [prazo, setPrazo] = useState(pedido.prazo_entrega ?? '')
  const [condicoes, setCondicoes] = useState(pedido.condicoes_pagamento ?? '')

  useEffect(() => {
    let ativo = true
    listarEmissoras(orgId)
      .then((lista) => ativo && setEmissoras({ orgId, lista }))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId])

  const lista = emissoras?.orgId === orgId ? emissoras.lista : null
  const emissora = lista?.find((e) => e.id === pedido.emissora_id)
  const vencido = editavel && !!pedido.validade && pedido.validade < hojeBrasil()
  const vendedores = [...equipe.values()].sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? ''))

  async function salvar(dados: Parameters<typeof atualizarPedido>[1]) {
    aoErro(null)
    try {
      await atualizarPedido(pedido.id, dados)
      aoMudar()
    } catch (e) {
      aoErro((e as Error).message)
    }
  }

  const rotulo = 'block text-pequeno font-medium text-texto-2'
  const caixa = 'block h-10 w-full rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none disabled:bg-fundo disabled:text-texto-2'
  const nomeEmissora = (e: Emissora) => e.nome_fantasia || e.razao_social

  return (
    <section aria-labelledby="titulo-orcamento" className="rounded-lg border border-borda bg-superficie">
      <h2 id="titulo-orcamento" className="border-b border-borda px-4 py-3 font-semibold">
        Orçamento
      </h2>
      <div className="space-y-4 p-4">
        {vencido && (
          <Aviso tom="atencao">
            A validade deste orçamento venceu em {dataCurta(pedido.validade!)}. Confira preços e condições antes de reenviar.
          </Aviso>
        )}
        {lista && !lista.length && (
          <Aviso>
            Nenhuma empresa cadastrada: o orçamento sai sem logo e sem CNPJ.{' '}
            <Link to="/configuracoes/empresa" className="font-medium text-primaria underline">
              Cadastrar em Configurações → Empresa
            </Link>
          </Aviso>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {!!lista?.length && (
            <div className="space-y-1.5">
              <label htmlFor="orc-emissora" className={rotulo}>
                Empresa (CNPJ)
              </label>
              {lista.length > 1 ? (
                <select
                  id="orc-emissora"
                  value={pedido.emissora_id ?? ''}
                  disabled={!editavel}
                  onChange={(e) => void salvar({ emissora_id: e.target.value || null })}
                  className={caixa}
                >
                  {!emissora && <option value="">Escolha</option>}
                  {lista.map((e) => (
                    <option key={e.id} value={e.id}>
                      {nomeEmissora(e)}
                    </option>
                  ))}
                </select>
              ) : (
                <p id="orc-emissora" className="flex h-10 items-center text-pequeno">
                  {emissora ? nomeEmissora(emissora) : nomeEmissora(lista[0])}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="orc-vendedor" className={rotulo}>
              Vendedor responsável
            </label>
            <select
              id="orc-vendedor"
              value={pedido.responsavel_id ?? ''}
              onChange={(e) => void salvar({ responsavel_id: e.target.value || null })}
              className={caixa}
            >
              <option value="">Ninguém</option>
              {vendedores.map((v) => (
                <option key={v.user_id} value={v.user_id}>
                  {v.nome ?? 'Sem nome'}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="orc-validade" className={rotulo}>
              Válido até
            </label>
            <input
              id="orc-validade"
              type="date"
              value={validade}
              disabled={!editavel}
              onChange={(e) => setValidade(e.target.value)}
              onBlur={() => validade !== (pedido.validade ?? '') && void salvar({ validade: validade || null })}
              className={caixa}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="orc-prazo" className={rotulo}>
              Prazo de entrega
            </label>
            <input
              id="orc-prazo"
              value={prazo}
              maxLength={500}
              disabled={!editavel}
              placeholder="Ex.: 10 dias úteis"
              onChange={(e) => setPrazo(e.target.value)}
              onBlur={() => prazo.trim() !== (pedido.prazo_entrega ?? '') && void salvar({ prazo_entrega: prazo.trim() || null })}
              className={caixa}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="orc-condicoes" className={rotulo}>
            Condições de pagamento
          </label>
          <textarea
            id="orc-condicoes"
            rows={2}
            maxLength={1000}
            value={condicoes}
            disabled={!editavel}
            placeholder="Ex.: 50% na aprovação e 50% na entrega"
            onChange={(e) => setCondicoes(e.target.value)}
            onBlur={() =>
              condicoes.trim() !== (pedido.condicoes_pagamento ?? '') && void salvar({ condicoes_pagamento: condicoes.trim() || null })
            }
            className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none disabled:bg-fundo disabled:text-texto-2"
          />
        </div>
        {!editavel && <p className="text-legenda text-texto-3">Depois de confirmado, só o vendedor responsável muda.</p>}
      </div>
    </section>
  )
}
