import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { listarContatos, type ContatoLista } from '../services/crm'
import { lerNumero, moeda, nomeDoContato } from '../services/formato'
import { clienteResumo, contatosDoCliente, type ContatoDoCliente } from '../services/clientes'
import { ModalEscolherCliente } from './ClienteDoContato'
import { ModalCliente } from './ModalCliente'
import {
  adicionarItens,
  atualizarItem,
  atualizarOrdem,
  criarOrdem,
  data,
  definirDesfecho,
  faturar,
  hojeIso,
  moverItens,
  registrarPagamento,
  ROTULO_COBRANCA,
  ROTULO_DESFECHO,
  type Cobranca,
  type ConfiguracaoOs,
  type DadosItem,
  type DadosOrdem,
  type Desfecho,
  type EtapaOs,
  type ItemOs,
  type Ordem,
} from '../services/os'
import { useEquipe } from '../hooks/useEquipe'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Icone } from './Icone'
import { Modal } from './Modal'

export const CLASSE_CAMPO =
  'block h-10 w-full min-w-0 rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none'

/** Rodapé padrão: Cancelar + ação do formulário. */
function Rodape({ form, rotulo, salvando, desabilitado, aoFechar }: {
  form: string
  rotulo: string
  salvando: boolean
  desabilitado?: boolean
  aoFechar: () => void
}) {
  return (
    <>
      <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
        Cancelar
      </Botao>
      <Botao type="submit" form={form} carregando={salvando} disabled={desabilitado}>
        {rotulo}
      </Botao>
    </>
  )
}

export function Campo({ rotulo, id, children, ajuda }: { rotulo: string; id: string; children: ReactNode; ajuda?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-pequeno font-medium text-texto-2">
        {rotulo}
      </label>
      {children}
      {ajuda && <p className="text-legenda text-texto-3">{ajuda}</p>}
    </div>
  )
}

/** Executa a ação, mostra o erro do banco e fecha quando dá certo. */
function useAcao(aoConcluir: () => void) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const executar = async (acao: () => Promise<unknown>) => {
    setSalvando(true)
    setErro(null)
    try {
      await acao()
      aoConcluir()
    } catch (e) {
      setErro((e as Error).message)
      setSalvando(false)
    }
  }
  return { salvando, erro, executar }
}

const resumoItens = (n: number) => (n === 1 ? '1 item' : `${n} itens`)

// ---- mover de etapa ----

export function ModalMover({ itens, etapas, etapaInicial, aoFechar, aoSalvar }: {
  itens: Pick<ItemOs, 'id' | 'etapa_id' | 'etapa_desde'>[]
  etapas: EtapaOs[]
  etapaInicial?: string
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const atual = itens.length === 1 ? itens[0].etapa_id : null
  const proxima = useMemo(() => {
    const i = etapas.findIndex((e) => e.id === atual)
    return i >= 0 && i < etapas.length - 1 ? etapas[i + 1].id : (etapas.find((e) => e.id !== atual)?.id ?? '')
  }, [etapas, atual])
  const [etapa, setEtapa] = useState(etapaInicial ?? proxima)
  const [dia, setDia] = useState(hojeIso())
  const { salvando, erro, executar } = useAcao(aoSalvar)
  const minimo = itens.filter((i) => i.etapa_id !== etapa).reduce((m, i) => (i.etapa_desde > m ? i.etapa_desde : m), '')

  return (
    <Modal
      aberto
      titulo={itens.length === 1 ? 'Mover item' : `Mover ${resumoItens(itens.length)}`}
      aoFechar={aoFechar}
      rodape={<Rodape form="form-mover" rotulo="Mover" salvando={salvando} desabilitado={!etapa || !dia} aoFechar={aoFechar} />}
    >
      <form
        id="form-mover"
        onSubmit={(e) => {
          e.preventDefault()
          void executar(() => moverItens(itens.map((i) => i.id), etapa, dia))
        }}
        className="space-y-3"
      >
        <Campo rotulo="Para a etapa" id="mover-etapa">
          <select id="mover-etapa" value={etapa} onChange={(e) => setEtapa(e.target.value)} className={CLASSE_CAMPO}>
            {etapas.map((e) => (
              <option key={e.id} value={e.id} disabled={e.id === atual}>
                {e.nome}
                {e.id === atual ? ' (atual)' : ''}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Quando aconteceu" id="mover-data" ajuda="A data do fato, não a de hoje, se a mudança foi antes. É dela que sai o tempo de cada etapa.">
          <input id="mover-data" type="date" value={dia} min={minimo || undefined} max={hojeIso()} required onChange={(e) => setDia(e.target.value)} className={CLASSE_CAMPO} />
        </Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Modal>
  )
}

// ---- encerrar / reabrir ----

export function ModalDesfecho({ itens, aoFechar, aoSalvar }: { itens: Pick<ItemOs, 'id' | 'desfecho'>[]; aoFechar: () => void; aoSalvar: () => void }) {
  const reabrir = itens.every((i) => i.desfecho)
  const [desfecho, setDesfecho] = useState<Desfecho>('nao_aprovado')
  const [dia, setDia] = useState(hojeIso())
  const { salvando, erro, executar } = useAcao(aoSalvar)
  return (
    <Modal
      aberto
      titulo={reabrir ? 'Reabrir' : `Encerrar ${resumoItens(itens.length)}`}
      aoFechar={aoFechar}
      rodape={<Rodape form="form-desfecho" rotulo={reabrir ? 'Reabrir' : 'Encerrar'} salvando={salvando} aoFechar={aoFechar} />}
    >
      <form
        id="form-desfecho"
        onSubmit={(e) => {
          e.preventDefault()
          void executar(() => definirDesfecho(itens.map((i) => i.id), reabrir ? null : desfecho, dia))
        }}
        className="space-y-3"
      >
        {reabrir ? (
          <p className="text-pequeno">O item volta para o quadro, na etapa em que estava.</p>
        ) : (
          <>
            <p className="text-pequeno">Para o que sai do processo antes de ficar pronto. O item sai do quadro e continua na lista.</p>
            <fieldset className="space-y-2">
              <legend className="sr-only">Motivo</legend>
              {(Object.keys(ROTULO_DESFECHO) as Desfecho[]).map((d) => (
                <label key={d} className="flex cursor-pointer items-center gap-2 text-pequeno">
                  <input type="radio" name="desfecho" checked={desfecho === d} onChange={() => setDesfecho(d)} className="size-4 accent-primaria" />
                  {ROTULO_DESFECHO[d]}
                </label>
              ))}
            </fieldset>
            <Campo rotulo="Quando" id="desfecho-data">
              <input id="desfecho-data" type="date" value={dia} max={hojeIso()} required onChange={(e) => setDia(e.target.value)} className={CLASSE_CAMPO} />
            </Campo>
          </>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Modal>
  )
}

// ---- faturar e receber ----

export function ModalFaturar({ itens, prazoDias, aoFechar, aoSalvar }: {
  itens: Pick<ItemOs, 'id' | 'valor' | 'faturado_em' | 'vencimento_em'>[]
  /** Prazo do cliente (ou o padrão): só para mostrar o vencimento que o banco vai calcular. */
  prazoDias: number
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [dia, setDia] = useState(itens[0]?.faturado_em ?? hojeIso())
  const [vencimento, setVencimento] = useState(itens.length === 1 ? (itens[0].vencimento_em ?? '') : '')
  const { salvando, erro, executar } = useAcao(aoSalvar)
  const total = itens.reduce((s, i) => s + i.valor, 0)
  const calculado = dia ? data(new Date(Date.parse(`${dia}T12:00:00Z`) + prazoDias * 864e5).toISOString()) : ''
  const faturados = itens.some((i) => i.faturado_em)
  return (
    <Modal
      aberto
      titulo={`Faturar ${resumoItens(itens.length)}`}
      aoFechar={aoFechar}
      rodape={
        <>
          {faturados && (
            <Botao variante="fantasma" onClick={() => void executar(() => faturar(itens.map((i) => i.id), null, null))} disabled={salvando} className="mr-auto">
              Desfazer faturamento
            </Botao>
          )}
          <Rodape form="form-faturar" rotulo="Faturar" salvando={salvando} desabilitado={!dia} aoFechar={aoFechar} />
        </>
      }
    >
      <form
        id="form-faturar"
        onSubmit={(e) => {
          e.preventDefault()
          void executar(() => faturar(itens.map((i) => i.id), dia, vencimento || null))
        }}
        className="space-y-3"
      >
        <p className="text-pequeno">
          Total: <strong>{moeda(total, true)}</strong>
        </p>
        <Campo rotulo="Data do faturamento (boleto)" id="fat-data">
          <input id="fat-data" type="date" value={dia} required onChange={(e) => setDia(e.target.value)} className={CLASSE_CAMPO} />
        </Campo>
        <Campo rotulo="Vencimento" id="fat-venc" ajuda={`Vazio: ${prazoDias} dias depois do faturamento${calculado ? ` (${calculado})` : ''}, pelo prazo do cliente.`}>
          <input id="fat-venc" type="date" value={vencimento} min={dia || undefined} onChange={(e) => setVencimento(e.target.value)} className={CLASSE_CAMPO} />
        </Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Modal>
  )
}

export function ModalPagamento({ itens, aoFechar, aoSalvar }: { itens: Pick<ItemOs, 'id' | 'valor' | 'pago_em'>[]; aoFechar: () => void; aoSalvar: () => void }) {
  const [dia, setDia] = useState(itens[0]?.pago_em ?? hojeIso())
  const { salvando, erro, executar } = useAcao(aoSalvar)
  const pagos = itens.some((i) => i.pago_em)
  return (
    <Modal
      aberto
      titulo="Pagamento recebido"
      aoFechar={aoFechar}
      rodape={
        <>
          {pagos && (
            <Botao variante="fantasma" onClick={() => void executar(() => registrarPagamento(itens.map((i) => i.id), null))} disabled={salvando} className="mr-auto">
              Desfazer
            </Botao>
          )}
          <Rodape form="form-pago" rotulo="Registrar" salvando={salvando} desabilitado={!dia} aoFechar={aoFechar} />
        </>
      }
    >
      <form
        id="form-pago"
        onSubmit={(e) => {
          e.preventDefault()
          void executar(() => registrarPagamento(itens.map((i) => i.id), dia))
        }}
        className="space-y-3"
      >
        <p className="text-pequeno">
          {resumoItens(itens.length)} · <strong>{moeda(itens.reduce((s, i) => s + i.valor, 0), true)}</strong>
        </p>
        <Campo rotulo="Data do pagamento" id="pago-data">
          <input id="pago-data" type="date" value={dia} max={hojeIso()} required onChange={(e) => setDia(e.target.value)} className={CLASSE_CAMPO} />
        </Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Modal>
  )
}

// ---- item ----

type RascunhoItem = {
  chave: string
  tipo_id: string
  servico_id: string
  modelo: string
  identificacao: string
  campos: Record<string, string>
  valor: string
  cobranca: Cobranca
  observacao: string
  quantidade: string
}

const itemVazio = (cfg: ConfiguracaoOs, tipoId = ''): RascunhoItem => {
  const tipo = cfg.tipos.find((t) => t.id === tipoId)
  const servico = cfg.servicos.find((s) => s.id === tipo?.servico_padrao_id)
  return {
    chave: crypto.randomUUID(),
    tipo_id: tipoId,
    servico_id: servico?.id ?? '',
    modelo: '',
    identificacao: '',
    campos: {},
    valor: servico ? String(servico.preco).replace('.', ',') : '',
    cobranca: 'cobrado',
    observacao: '',
    quantidade: '1',
  }
}

const deItemOs = (i: ItemOs): RascunhoItem => ({
  chave: i.id,
  tipo_id: i.tipo_id ?? '',
  servico_id: i.servico_id ?? '',
  modelo: i.modelo ?? '',
  identificacao: i.identificacao ?? '',
  campos: i.campos,
  valor: i.valor ? String(i.valor).replace('.', ',') : '',
  cobranca: i.cobranca,
  observacao: i.observacao ?? '',
  quantidade: '1',
})

function problemaItem(r: RascunhoItem, cfg: ConfiguracaoOs): string | null {
  if (lerNumero(r.valor) === undefined || (lerNumero(r.valor) ?? 0) < 0) return 'Valor inválido.'
  const q = Number(r.quantidade)
  if (!Number.isInteger(q) || q < 1 || q > 50) return 'Quantidade de 1 a 50.'
  const tipo = cfg.tipos.find((t) => t.id === r.tipo_id)
  const faltando = tipo?.campos.find((c) => c.obrigatorio && !r.campos[c.chave]?.trim())
  if (faltando) return `Preencha ${faltando.rotulo}.`
  return null
}

const paraDados = (r: RascunhoItem): DadosItem => ({
  tipo_id: r.tipo_id || null,
  servico_id: r.servico_id || null,
  modelo: r.modelo.trim() || null,
  identificacao: r.identificacao.trim() || null,
  campos: Object.fromEntries(Object.entries(r.campos).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])),
  valor: lerNumero(r.valor) ?? 0,
  cobranca: r.cobranca,
  observacao: r.observacao.trim() || null,
})

/** Quantidade N vira N itens iguais (cada um com a própria identificação, preenchida depois). */
const expandir = (r: RascunhoItem): DadosItem[] => {
  const d = paraDados(r)
  return Array.from({ length: Number(r.quantidade) || 1 }, (_, n) => ({ ...d, identificacao: n === 0 ? d.identificacao : null }))
}

function CamposItem({ r, cfg, novo, aoMudar }: { r: RascunhoItem; cfg: ConfiguracaoOs; novo: boolean; aoMudar: (r: RascunhoItem) => void }) {
  const tipo = cfg.tipos.find((t) => t.id === r.tipo_id)
  const id = (c: string) => `item-${r.chave}-${c}`
  const trocarTipo = (tipoId: string) => {
    const t = cfg.tipos.find((x) => x.id === tipoId)
    const s = cfg.servicos.find((x) => x.id === t?.servico_padrao_id)
    aoMudar({ ...r, tipo_id: tipoId, ...(s && !r.servico_id ? { servico_id: s.id, valor: String(s.preco).replace('.', ',') } : {}) })
  }
  const trocarServico = (servicoId: string) => {
    const s = cfg.servicos.find((x) => x.id === servicoId)
    aoMudar({ ...r, servico_id: servicoId, ...(s ? { valor: String(s.preco).replace('.', ',') } : {}) })
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cfg.tipos.length > 0 && (
        <Campo rotulo="Tipo" id={id('tipo')}>
          <select id={id('tipo')} value={r.tipo_id} onChange={(e) => trocarTipo(e.target.value)} className={CLASSE_CAMPO}>
            <option value="">Sem tipo</option>
            {cfg.tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
      )}
      <CampoTexto rotulo="Modelo / descrição" value={r.modelo} maxLength={120} onChange={(e) => aoMudar({ ...r, modelo: e.target.value })} />
      <CampoTexto
        rotulo={tipo?.rotulo_identificacao ?? 'Nº de série'}
        value={r.identificacao}
        maxLength={120}
        onChange={(e) => aoMudar({ ...r, identificacao: e.target.value })}
      />
      {tipo?.campos.map((c) => (
        <Campo key={c.chave} rotulo={`${c.rotulo}${c.obrigatorio ? ' *' : ''}`} id={id(c.chave)}>
          {c.tipo === 'lista' ? (
            <select id={id(c.chave)} value={r.campos[c.chave] ?? ''} onChange={(e) => aoMudar({ ...r, campos: { ...r.campos, [c.chave]: e.target.value } })} className={CLASSE_CAMPO}>
              <option value="">—</option>
              {(c.opcoes ?? []).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              id={id(c.chave)}
              type={c.tipo === 'data' ? 'date' : 'text'}
              inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
              value={r.campos[c.chave] ?? ''}
              onChange={(e) => aoMudar({ ...r, campos: { ...r.campos, [c.chave]: e.target.value } })}
              className={CLASSE_CAMPO}
            />
          )}
        </Campo>
      ))}
      {cfg.servicos.length > 0 && (
        <Campo rotulo="Serviço" id={id('servico')}>
          <select id={id('servico')} value={r.servico_id} onChange={(e) => trocarServico(e.target.value)} className={CLASSE_CAMPO}>
            <option value="">Sem serviço da tabela</option>
            {cfg.servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.codigo ? `${s.codigo} · ` : ''}
                {s.nome} · {moeda(Number(s.preco), true)}
              </option>
            ))}
          </select>
        </Campo>
      )}
      <CampoTexto rotulo="Valor (R$)" inputMode="decimal" value={r.valor} onChange={(e) => aoMudar({ ...r, valor: e.target.value })} placeholder="0,00" />
      <Campo rotulo="Cobrança" id={id('cobranca')}>
        <select id={id('cobranca')} value={r.cobranca} onChange={(e) => aoMudar({ ...r, cobranca: e.target.value as Cobranca })} className={CLASSE_CAMPO}>
          {(Object.keys(ROTULO_COBRANCA) as Cobranca[]).map((c) => (
            <option key={c} value={c}>
              {ROTULO_COBRANCA[c]}
            </option>
          ))}
        </select>
      </Campo>
      {novo && (
        <CampoTexto
          rotulo="Quantidade"
          type="number"
          min={1}
          max={50}
          value={r.quantidade}
          onChange={(e) => aoMudar({ ...r, quantidade: e.target.value })}
          ajuda="Itens iguais (ex.: 6 ferramentas): cada um anda sozinho."
        />
      )}
      <div className="sm:col-span-2">
        <Campo rotulo="Observação" id={id('obs')}>
          <textarea
            id={id('obs')}
            rows={2}
            maxLength={2000}
            value={r.observacao}
            onChange={(e) => aoMudar({ ...r, observacao: e.target.value })}
            className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 focus:border-primaria focus:outline-none"
          />
        </Campo>
      </div>
    </div>
  )
}

/** Novo item numa OS que já existe, ou edição de um item. */
export function ModalItem({ orgId, ordem, cfg, item, proximaOrdem, aoFechar, aoSalvar }: {
  orgId: string
  ordem: Pick<Ordem, 'id' | 'recebida_em'>
  cfg: ConfiguracaoOs
  item?: ItemOs
  proximaOrdem: number
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [r, setR] = useState<RascunhoItem>(() => (item ? deItemOs(item) : itemVazio(cfg, cfg.tipos.length === 1 ? cfg.tipos[0].id : '')))
  const { salvando, erro, executar } = useAcao(aoSalvar)
  const problema = problemaItem(r, cfg)
  return (
    <Modal
      aberto
      titulo={item ? 'Editar item' : 'Adicionar item'}
      largura="max-w-2xl"
      aoFechar={aoFechar}
      rodape={<Rodape form="form-item" rotulo="Salvar" salvando={salvando} desabilitado={!!problema} aoFechar={aoFechar} />}
    >
      <form
        id="form-item"
        onSubmit={(e) => {
          e.preventDefault()
          void executar(() => (item ? atualizarItem(item.id, paraDados(r)) : adicionarItens(orgId, ordem, cfg.etapas[0].id, expandir(r), proximaOrdem)))
        }}
        className="space-y-3"
      >
        <CamposItem r={r} cfg={cfg} novo={!item} aoMudar={setR} />
        {problema && r.valor && <p className="text-legenda text-atencao">{problema}</p>}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Modal>
  )
}

// ---- ordem (nova, com itens; ou edição do cabeçalho) ----

export function ModalOrdem({ orgId, cfg, ordem, aoFechar, aoSalvar }: {
  orgId: string
  cfg: ConfiguracaoOs
  ordem?: Ordem
  aoFechar: () => void
  /** id da OS criada ou editada. */
  aoSalvar: (id: string) => void
}) {
  const equipe = useEquipe(orgId)
  const [contatos, setContatos] = useState<ContatoLista[] | null>(null)
  const [busca, setBusca] = useState('')
  const [contatoId, setContatoId] = useState(ordem?.contato_id ?? '')
  // Cliente do cadastro (docs/clientes.md); o contato fica como "A/C". Contato sozinho traz o cliente dele (banco).
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(
    ordem?.cliente_id ? { id: ordem.cliente_id, nome: ordem.cliente_nome ?? 'Cliente' } : null,
  )
  const [contatosCliente, setContatosCliente] = useState<{ clienteId: string; lista: ContatoDoCliente[] } | null>(null)
  const [escolherCliente, setEscolherCliente] = useState(false)
  const [novoCliente, setNovoCliente] = useState(false)
  const [nf, setNf] = useState(ordem?.nf_cliente ?? '')
  const [numeroCliente, setNumeroCliente] = useState(ordem?.numero_cliente ?? '')
  const [recebida, setRecebida] = useState(ordem?.recebida_em ?? hojeIso())
  const [responsavel, setResponsavel] = useState(ordem?.responsavel_id ?? '')
  const [observacao, setObservacao] = useState(ordem?.observacao ?? '')
  const [itens, setItens] = useState<RascunhoItem[]>(() => (ordem ? [] : [itemVazio(cfg, cfg.tipos.length === 1 ? cfg.tipos[0].id : '')]))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarContatos(orgId, '')
      .then((l) => ativo && setContatos(l))
      .catch(() => ativo && setContatos([]))
    return () => {
      ativo = false
    }
  }, [orgId])

  useEffect(() => {
    if (!cliente) return
    let ativo = true
    const clienteId = cliente.id
    contatosDoCliente(clienteId)
      .then((lista) => ativo && setContatosCliente({ clienteId, lista }))
      .catch(() => ativo && setContatosCliente({ clienteId, lista: [] }))
    return () => {
      ativo = false
    }
  }, [cliente])
  const doCliente = cliente && contatosCliente?.clienteId === cliente.id ? contatosCliente.lista : null

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const l = contatos ?? []
    return (t ? l.filter((c) => `${nomeDoContato(c)} ${c.empresa ?? ''} ${c.telefone ?? ''}`.toLowerCase().includes(t)) : l).slice(0, 50)
  }, [busca, contatos])

  const problema = !cliente && !contatoId && !ordem?.cliente_nome ? 'Escolha o cliente (ou um contato).' : (itens.map((r) => problemaItem(r, cfg)).find(Boolean) ?? null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    const dados: DadosOrdem = {
      contato_id: contatoId || null,
      cliente_id: cliente?.id ?? null,
      // O banco põe o nome do cliente (ou do contato) quando eles mudam; sem mudança, fica o que já estava.
      cliente_nome: cliente?.nome ?? ordem?.cliente_nome ?? null,
      nf_cliente: nf.trim() || null,
      numero_cliente: numeroCliente.trim() || null,
      recebida_em: recebida,
      responsavel_id: responsavel || null,
      observacao: observacao.trim() || null,
    }
    try {
      if (ordem) {
        await atualizarOrdem(ordem.id, dados)
        aoSalvar(ordem.id)
      } else {
        aoSalvar(await criarOrdem(orgId, dados, itens.flatMap(expandir), cfg.etapas[0].id))
      }
    } catch (e) {
      setErro((e as Error).message)
      setSalvando(false)
    }
  }

  const contatoAtual = contatos?.find((c) => c.id === contatoId)

  return (
    <Modal
      aberto
      titulo={ordem ? `OS nº ${ordem.numero}` : 'Nova OS'}
      largura="max-w-2xl"
      aoFechar={aoFechar}
      rodape={<Rodape form="form-ordem" rotulo={ordem ? 'Salvar' : 'Criar OS'} salvando={salvando} desabilitado={!!problema} aoFechar={aoFechar} />}
    >
      <form id="form-ordem" onSubmit={salvar} className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold text-texto">Cliente</legend>
          {cliente ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-pequeno font-medium text-texto-2">Cliente</p>
                <p className="flex flex-wrap items-center gap-2 text-pequeno">
                  <span className="font-medium">{cliente.nome}</span>
                  <button type="button" onClick={() => (setCliente(null), setContatoId(''))} className="text-primaria hover:underline">
                    Trocar
                  </button>
                </p>
              </div>
              <Campo rotulo="A/C (contato, opcional)" id="os-ac">
                <select id="os-ac" value={contatoId} onChange={(e) => setContatoId(e.target.value)} className={CLASSE_CAMPO}>
                  <option value="">Ninguém</option>
                  {(doCliente ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {nomeDoContato(c)}
                    </option>
                  ))}
                  {contatoId && doCliente && !doCliente.some((c) => c.id === contatoId) && <option value={contatoId}>{contatoAtual ? nomeDoContato(contatoAtual) : 'Contato atual'}</option>}
                </select>
              </Campo>
            </div>
          ) : contatoId ? (
            <p className="flex items-center gap-2 text-pequeno">
              <span className="font-medium">{contatoAtual ? `${nomeDoContato(contatoAtual)}${contatoAtual.empresa ? ` · ${contatoAtual.empresa}` : ''}` : (ordem?.cliente_nome ?? 'Contato')}</span>
              <button type="button" onClick={() => setContatoId('')} className="text-primaria hover:underline">
                Trocar
              </button>
              <span className="text-legenda text-texto-3">Se o contato estiver ligado a um cliente, a OS fica nesse cliente.</span>
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="os-busca" className="block text-pequeno font-medium text-texto-2">
                  Contato da Livih
                </label>
                <input id="os-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, empresa ou telefone" className={CLASSE_CAMPO} />
                <select
                  aria-label="Escolha o contato"
                  size={4}
                  value=""
                  onChange={(e) => setContatoId(e.target.value)}
                  className="block w-full rounded-md border border-borda bg-superficie p-1 text-pequeno focus:border-primaria focus:outline-none"
                >
                  {!contatos && <option disabled>Carregando…</option>}
                  {filtrados.map((c) => (
                    <option key={c.id} value={c.id} className="rounded px-2 py-1">
                      {nomeDoContato(c)}
                      {c.empresa ? ` · ${c.empresa}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <p className="text-pequeno font-medium text-texto-2">Ou pelo cadastro de clientes</p>
                <div className="flex flex-wrap gap-2">
                  <Botao variante="secundario" tamanho="sm" icone="busca" onClick={() => setEscolherCliente(true)}>
                    Escolher cliente
                  </Botao>
                  <Botao variante="secundario" tamanho="sm" icone="mais" onClick={() => setNovoCliente(true)}>
                    Novo cliente
                  </Botao>
                </div>
                <p className="text-legenda text-texto-3">Para empresa que não conversa pelo WhatsApp da Livih.</p>
                {ordem?.cliente_nome && !ordem.cliente_id && !ordem.contato_id && (
                  <p className="text-legenda text-texto-3">Hoje: {ordem.cliente_nome} (sem cadastro)</p>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <CampoTexto rotulo="NF do cliente" value={nf} maxLength={40} onChange={(e) => setNf(e.target.value)} />
            <CampoTexto rotulo="Nº da OS do cliente" value={numeroCliente} maxLength={40} onChange={(e) => setNumeroCliente(e.target.value)} />
            <CampoTexto rotulo="Recebido em" type="date" value={recebida} max={hojeIso()} required onChange={(e) => setRecebida(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Responsável" id="os-resp">
              <select id="os-resp" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={CLASSE_CAMPO}>
                <option value="">Ninguém</option>
                {equipe.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.nome || m.email}
                  </option>
                ))}
              </select>
            </Campo>
            <CampoTexto rotulo="Observação" value={observacao} maxLength={2000} onChange={(e) => setObservacao(e.target.value)} />
          </div>
        </fieldset>

        {!ordem && (
          <fieldset className="space-y-3">
            <legend className="mb-2 font-semibold text-texto">Itens</legend>
            {itens.map((r, n) => (
              <div key={r.chave} className="space-y-3 rounded-md border border-borda p-3">
                <div className="flex items-center justify-between">
                  <p className="text-pequeno font-medium text-texto-2">Item {n + 1}</p>
                  {itens.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItens(itens.filter((x) => x.chave !== r.chave))}
                      aria-label={`Remover item ${n + 1}`}
                      className="rounded-md p-1.5 text-texto-3 hover:bg-erro-suave hover:text-erro"
                    >
                      <Icone nome="lixeira" className="size-4" />
                    </button>
                  )}
                </div>
                <CamposItem r={r} cfg={cfg} novo aoMudar={(x) => setItens(itens.map((y) => (y.chave === r.chave ? x : y)))} />
              </div>
            ))}
            <Botao
              variante="secundario"
              tamanho="sm"
              icone="mais"
              onClick={() => setItens([...itens, { ...itemVazio(cfg, itens[itens.length - 1]?.tipo_id ?? ''), cobranca: itens[itens.length - 1]?.cobranca ?? 'cobrado' }])}
            >
              Outro item
            </Botao>
          </fieldset>
        )}

        {problema && (contatoId || cliente) && <p className="text-legenda text-atencao">{problema}</p>}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
      {escolherCliente && (
        <ModalEscolherCliente
          orgId={orgId}
          aoFechar={() => setEscolherCliente(false)}
          aoEscolher={(id, c) => {
            setCliente({ id, nome: c.nome })
            setContatoId('')
            setEscolherCliente(false)
          }}
        />
      )}
      {novoCliente && (
        <ModalCliente
          aoFechar={() => setNovoCliente(false)}
          aoSalvar={(id) => {
            setNovoCliente(false)
            void clienteResumo(id).then((c) => c && setCliente({ id, nome: c.nome }))
          }}
        />
      )}
    </Modal>
  )
}
