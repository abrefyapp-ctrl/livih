import { useEffect, useMemo, useState } from 'react'
import {
  ROTULO_FORMA,
  ROTULO_SITUACAO,
  ROTULO_TIPO_CONTA,
  baixar,
  cancelarLancamento,
  criarLancamento,
  desfazerBaixa,
  desfazerTransferencia,
  editarLancamento,
  extratoConta,
  listarBaixas,
  montarParcelas,
  quemDoLancamento,
  rotuloParcela,
  salvarCategoria,
  salvarConta,
  transferir,
  type Baixa,
  type Categoria,
  type Conta,
  type FormaPagamento,
  type Lancamento,
  type MovimentoExtrato,
  type Saldo,
  type Situacao,
  type TipoConta,
  type TipoLancamento,
} from '../services/financeiro'
import { listarClientes, type ClienteLista } from '../services/clientes'
import { formatarCnpj, lerNumero, moeda } from '../services/formato'
import { data, hojeIso, somarDias } from '../services/os'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CLASSE_CAMPO, Campo } from './ModaisOs'
import { Modal } from './Modal'

const COR_SITUACAO: Record<Situacao, string> = {
  aberto: 'bg-slate-100 text-texto-2',
  parcial: 'bg-info-suave text-info',
  vencido: 'bg-erro-suave text-erro',
  pago: 'bg-primaria-suave text-primaria',
  cancelado: 'bg-slate-100 text-texto-3 line-through',
}

export function EtiquetaSituacao({ situacao }: { situacao: Situacao }) {
  return (
    <span className={`inline-flex rounded-sm px-1.5 py-0.5 text-legenda font-medium ${COR_SITUACAO[situacao]}`}>
      {ROTULO_SITUACAO[situacao]}
    </span>
  )
}

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

/** Executa a ação, mostra o erro do banco e avisa quando dá certo. */
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
  return { salvando, erro, setErro, executar }
}

const valorValido = (v: string) => {
  const n = lerNumero(v)
  return n != null && n > 0 ? n : null
}

// ---- novo lançamento e edição ----

export function ModalLancamento({
  orgId,
  tipo,
  categorias,
  lancamento,
  aoFechar,
  aoSalvar,
}: {
  orgId: string
  tipo: TipoLancamento
  categorias: Categoria[]
  lancamento?: Lancamento
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const editando = !!lancamento
  const receber = tipo === 'receber'
  const [descricao, setDescricao] = useState(lancamento?.descricao ?? '')
  const [categoriaId, setCategoriaId] = useState(lancamento?.categoria_id ?? '')
  const [valor, setValor] = useState(lancamento ? String(lancamento.valor).replace('.', ',') : '')
  const [vencimento, setVencimento] = useState(lancamento?.vencimento ?? hojeIso())
  const [modo, setModo] = useState<'unica' | 'parcelar' | 'repetir'>('unica')
  const [quantas, setQuantas] = useState('2')
  const [clienteId, setClienteId] = useState('')
  const [buscaCliente, setBuscaCliente] = useState('')
  const [clientes, setClientes] = useState<ClienteLista[]>([])
  const [fornecedorNome, setFornecedorNome] = useState('')
  const [fornecedorCnpj, setFornecedorCnpj] = useState('')
  const [observacao, setObservacao] = useState(lancamento?.observacao ?? '')
  const { salvando, erro, setErro, executar } = useAcao(aoSalvar)

  useEffect(() => {
    if (!receber || editando) return
    let ativo = true
    listarClientes(orgId, '', false)
      .then((l) => ativo && setClientes(l))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, receber, editando])

  const clientesFiltrados = useMemo(() => {
    const t = buscaCliente.trim().toLowerCase()
    const l = t ? clientes.filter((c) => `${c.nome} ${c.razao_social ?? ''} ${c.documento ?? ''}`.toLowerCase().includes(t)) : clientes
    return l.slice(0, 50)
  }, [buscaCliente, clientes])

  const opcoesCategoria = categorias.filter((c) => c.tipo === (receber ? 'receita' : 'despesa') && (c.ativa || c.id === categoriaId))
  const total = valorValido(valor)
  const n = modo === 'unica' ? 1 : Math.min(120, Math.max(2, Number(quantas) || 0))
  const parcelas = total && !editando ? montarParcelas(total, n, vencimento, modo === 'repetir' ? 'repetir' : 'parcelar') : []
  const cnpjDigitos = fornecedorCnpj.replace(/\D/g, '')

  function salvar() {
    if (!descricao.trim()) return setErro('Informe a descrição.')
    if (!total) return setErro('Informe um valor maior que zero.')
    if (cnpjDigitos && cnpjDigitos.length !== 11 && cnpjDigitos.length !== 14) return setErro('O CNPJ ou CPF do fornecedor precisa ter 14 ou 11 números.')
    if (editando) {
      void executar(() =>
        editarLancamento(lancamento.id, {
          descricao: descricao.trim(),
          categoria_id: categoriaId || null,
          vencimento,
          valor: total,
          observacao: observacao.trim() || null,
        }),
      )
      return
    }
    void executar(() =>
      criarLancamento(orgId, {
        tipo,
        descricao: descricao.trim(),
        categoria_id: categoriaId || null,
        cliente_id: receber ? clienteId || null : null,
        fornecedor_cnpj: receber ? null : cnpjDigitos || null,
        fornecedor_nome: receber ? null : fornecedorNome.trim() || null,
        parcelas,
        observacao: observacao.trim() || null,
      }),
    )
  }

  const titulo = editando ? 'Editar lançamento' : receber ? 'Nova conta a receber' : 'Nova conta a pagar'
  return (
    <Modal
      aberto
      largura="max-w-xl"
      titulo={titulo}
      aoFechar={aoFechar}
      rodape={<Rodape form="form-lancamento" rotulo="Salvar" salvando={salvando} aoFechar={aoFechar} />}
    >
      <form
        id="form-lancamento"
        onSubmit={(e) => {
          e.preventDefault()
          salvar()
        }}
        className="space-y-3"
      >
        <Campo rotulo="Descrição" id="lanc-descricao">
          <input
            id="lanc-descricao"
            value={descricao}
            maxLength={200}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={receber ? 'Ex.: Venda para a Indústria Teste' : 'Ex.: Aluguel de novembro'}
            className={CLASSE_CAMPO}
          />
        </Campo>

        {!editando && receber && (
          <Campo rotulo="Cliente (opcional)" id="lanc-cliente-busca">
            <input
              id="lanc-cliente-busca"
              value={buscaCliente}
              onChange={(e) => setBuscaCliente(e.target.value)}
              placeholder="Buscar por nome, razão social ou CNPJ"
              className={CLASSE_CAMPO}
            />
            <select
              aria-label="Escolha o cliente"
              size={4}
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className="block w-full rounded-md border border-borda bg-superficie p-1 text-pequeno focus:border-primaria focus:outline-none"
            >
              <option value="" className="rounded px-2 py-1 text-texto-3">
                Sem cliente
              </option>
              {clientesFiltrados.map((c) => (
                <option key={c.id} value={c.id} className="rounded px-2 py-1">
                  {c.nome}
                  {c.razao_social && c.razao_social !== c.nome ? ` · ${c.razao_social}` : ''}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {!editando && !receber && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Fornecedor (opcional)" id="lanc-fornecedor">
              <input id="lanc-fornecedor" value={fornecedorNome} maxLength={200} onChange={(e) => setFornecedorNome(e.target.value)} className={CLASSE_CAMPO} />
            </Campo>
            <Campo rotulo="CNPJ ou CPF do fornecedor" id="lanc-fornecedor-cnpj">
              <input id="lanc-fornecedor-cnpj" inputMode="numeric" value={fornecedorCnpj} onChange={(e) => setFornecedorCnpj(e.target.value)} className={CLASSE_CAMPO} />
            </Campo>
          </div>
        )}
        {editando && quemDoLancamento(lancamento) && (
          <p className="text-pequeno">
            {receber ? 'Cliente' : 'Fornecedor'}: <strong>{quemDoLancamento(lancamento)}</strong>
          </p>
        )}

        <Campo rotulo="Categoria" id="lanc-categoria">
          <select id="lanc-categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={CLASSE_CAMPO}>
            <option value="">Sem categoria</option>
            {opcoesCategoria.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo={modo === 'parcelar' ? 'Valor total (R$)' : 'Valor (R$)'} id="lanc-valor">
            <input id="lanc-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className={CLASSE_CAMPO} />
          </Campo>
          <Campo rotulo={modo === 'unica' || editando ? 'Vencimento' : 'Primeiro vencimento'} id="lanc-vencimento">
            <input id="lanc-vencimento" type="date" required value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={CLASSE_CAMPO} />
          </Campo>
        </div>
        {editando && lancamento.origem !== 'manual' && (
          <p className="text-legenda text-texto-3">O valor vem do pedido, da OS ou da nota e só muda lá.</p>
        )}

        {!editando && (
          <fieldset className="space-y-2">
            <legend className="text-pequeno font-medium text-texto-2">Parcelas</legend>
            <div role="radiogroup" className="flex flex-wrap gap-4 text-pequeno">
              {([
                ['unica', 'Uma vez só'],
                ['parcelar', 'Dividir o total em parcelas'],
                ['repetir', 'Repetir todo mês'],
              ] as const).map(([id, rotulo]) => (
                <label key={id} className="inline-flex cursor-pointer items-center gap-2">
                  <input type="radio" name="lanc-modo" checked={modo === id} onChange={() => setModo(id)} className="accent-primaria" />
                  {rotulo}
                </label>
              ))}
            </div>
            {modo !== 'unica' && (
              <div className="flex items-center gap-2 text-pequeno">
                <label htmlFor="lanc-quantas">{modo === 'parcelar' ? 'Quantas parcelas' : 'Por quantos meses'}</label>
                <input
                  id="lanc-quantas"
                  type="number"
                  min={2}
                  max={120}
                  value={quantas}
                  onChange={(e) => setQuantas(e.target.value)}
                  className="h-9 w-20 rounded-md border border-borda bg-superficie px-2 focus:border-primaria focus:outline-none"
                />
              </div>
            )}
            {parcelas.length > 1 && (
              <ul className="max-h-32 overflow-y-auto rounded-md bg-fundo px-3 py-2 text-legenda text-texto-2">
                {parcelas.map((p, i) => (
                  <li key={i} className="flex justify-between tabular-nums">
                    <span>
                      {i + 1}/{parcelas.length} · vence {data(p.vencimento)}
                    </span>
                    <span>{moeda(p.valor, true)}</span>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}

        <Campo rotulo="Observação (opcional)" id="lanc-obs">
          <textarea
            id="lanc-obs"
            rows={2}
            maxLength={1000}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 focus:border-primaria focus:outline-none"
          />
        </Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Modal>
  )
}

// ---- detalhe: pagamentos, editar, cancelar ----

export function ModalDetalheLancamento({
  lancamento: l,
  contas,
  categorias,
  orgId,
  aoFechar,
  aoMudar,
}: {
  lancamento: Lancamento
  contas: Conta[]
  categorias: Categoria[]
  orgId: string
  aoFechar: () => void
  aoMudar: () => void
}) {
  const receber = l.tipo === 'receber'
  const [baixas, setBaixas] = useState<Baixa[] | null>(null)
  const [versao, setVersao] = useState(0)
  const [janela, setJanela] = useState<'baixa' | 'editar' | 'cancelar' | { desfazer: Baixa } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarBaixas(l.id)
      .then((b) => ativo && setBaixas(b))
      .catch(() => ativo && setErro('Não foi possível carregar os pagamentos.'))
    return () => {
      ativo = false
    }
  }, [l.id, versao])

  const mudou = () => {
    setJanela(null)
    setVersao((v) => v + 1)
    aoMudar()
  }
  const encerrado = l.situacao === 'cancelado' || l.situacao === 'pago'
  const ativas = (baixas ?? []).filter((b) => !b.desfeita_em)

  if (janela === 'baixa') {
    return <ModalBaixa lancamento={l} contas={contas} aoFechar={() => setJanela(null)} aoSalvar={mudou} />
  }
  if (janela === 'editar') {
    return <ModalLancamento orgId={orgId} tipo={l.tipo as TipoLancamento} categorias={categorias} lancamento={l} aoFechar={() => setJanela(null)} aoSalvar={mudou} />
  }
  if (janela === 'cancelar') {
    return (
      <ModalMotivo
        titulo="Cancelar lançamento"
        texto={`${l.descricao}${rotuloParcela(l)}, ${moeda(Number(l.valor), true)}. O lançamento continua na lista, como cancelado.`}
        rotulo="Cancelar lançamento"
        aoFechar={() => setJanela(null)}
        aoConfirmar={(motivo) => cancelarLancamento(l.id, motivo).then(mudou)}
      />
    )
  }
  if (janela && 'desfazer' in janela) {
    const b = janela.desfazer
    return (
      <ModalMotivo
        titulo={receber ? 'Desfazer recebimento' : 'Desfazer pagamento'}
        texto={`${moeda(Number(b.valor), true)} em ${data(b.data)} (${b.conta?.nome ?? 'conta'}). O registro fica no histórico, marcado como desfeito.`}
        rotulo="Desfazer"
        aoFechar={() => setJanela(null)}
        aoConfirmar={(motivo) => desfazerBaixa(b.id, motivo).then(mudou)}
      />
    )
  }

  return (
    <Modal
      aberto
      largura="max-w-xl"
      titulo={`${l.descricao}${rotuloParcela(l)}`}
      aoFechar={aoFechar}
      rodape={
        <>
          {l.situacao !== 'cancelado' && (
            <Botao variante="fantasma" onClick={() => setJanela('editar')}>
              Editar
            </Botao>
          )}
          {l.situacao !== 'cancelado' && !ativas.length && (
            <Botao variante="fantasma" onClick={() => setJanela('cancelar')}>
              Cancelar lançamento
            </Botao>
          )}
          {!encerrado && (
            <Botao icone="check" onClick={() => setJanela('baixa')}>
              {receber ? 'Registrar recebimento' : 'Registrar pagamento'}
            </Botao>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-pequeno">
          <div>
            <dt className="text-texto-3">Situação</dt>
            <dd className="mt-0.5">
              <EtiquetaSituacao situacao={l.situacao} />
            </dd>
          </div>
          <div>
            <dt className="text-texto-3">Vencimento</dt>
            <dd className="font-medium text-texto">{data(l.vencimento)}</dd>
          </div>
          <div>
            <dt className="text-texto-3">Valor</dt>
            <dd className="font-medium text-texto tabular-nums">{moeda(Number(l.valor), true)}</dd>
          </div>
          <div>
            <dt className="text-texto-3">{receber ? 'Falta receber' : 'Falta pagar'}</dt>
            <dd className="font-medium text-texto tabular-nums">{moeda(l.situacao === 'cancelado' ? 0 : Number(l.restante), true)}</dd>
          </div>
          {quemDoLancamento(l) && (
            <div>
              <dt className="text-texto-3">{receber ? 'Cliente' : 'Fornecedor'}</dt>
              <dd className="text-texto">
                {quemDoLancamento(l)}
                {l.fornecedor_cnpj && <span className="block text-legenda text-texto-3">{formatarCnpj(l.fornecedor_cnpj)}</span>}
              </dd>
            </div>
          )}
          {l.categoria && (
            <div>
              <dt className="text-texto-3">Categoria</dt>
              <dd className="text-texto">{l.categoria.nome}</dd>
            </div>
          )}
        </dl>
        {l.observacao && <p className="rounded-md bg-fundo px-3 py-2 text-pequeno whitespace-pre-line">{l.observacao}</p>}
        {l.situacao === 'cancelado' && (
          <Aviso tom="atencao">Cancelado{l.motivo_cancelamento ? `: ${l.motivo_cancelamento}` : '.'}</Aviso>
        )}

        <section>
          <h3 className="mb-2 text-pequeno font-semibold text-texto">{receber ? 'Recebimentos' : 'Pagamentos'}</h3>
          {!baixas ? (
            <p className="text-pequeno text-texto-3">Carregando…</p>
          ) : !baixas.length ? (
            <p className="text-pequeno text-texto-3">Nenhum ainda.</p>
          ) : (
            <ul className="divide-y divide-borda rounded-md border border-borda text-pequeno">
              {baixas.map((b) => (
                <li key={b.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${b.desfeita_em ? 'text-texto-3' : ''}`}>
                  <span className="w-20 tabular-nums">{data(b.data)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {ROTULO_FORMA[b.forma as FormaPagamento]} · {b.conta?.nome ?? 'conta'}
                    {b.desfeita_em && ` · desfeito${b.motivo_desfazer ? `: ${b.motivo_desfazer}` : ''}`}
                  </span>
                  <span className={`font-medium tabular-nums ${b.desfeita_em ? 'line-through' : ''}`}>{moeda(Number(b.valor), true)}</span>
                  {!b.desfeita_em && (
                    <Botao variante="fantasma" tamanho="sm" onClick={() => setJanela({ desfazer: b })}>
                      Desfazer
                    </Botao>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Modal>
  )
}

/** Confirma uma ação com motivo opcional (cancelar, desfazer). */
function ModalMotivo({ titulo, texto, rotulo, aoFechar, aoConfirmar }: {
  titulo: string
  texto: string
  rotulo: string
  aoFechar: () => void
  aoConfirmar: (motivo: string | null) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const { salvando, erro, executar } = useAcao(() => undefined)
  return (
    <Modal
      aberto
      titulo={titulo}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Voltar
          </Botao>
          <Botao variante="perigo" carregando={salvando} onClick={() => void executar(() => aoConfirmar(motivo.trim() || null))}>
            {rotulo}
          </Botao>
        </>
      }
    >
      <div className="space-y-3">
        <p>{texto}</p>
        <Campo rotulo="Motivo (opcional)" id="motivo">
          <input id="motivo" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} className={CLASSE_CAMPO} />
        </Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Modal>
  )
}

// ---- baixa ----

function ModalBaixa({ lancamento: l, contas, aoFechar, aoSalvar }: {
  lancamento: Lancamento
  contas: Conta[]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const receber = l.tipo === 'receber'
  const ativas = contas.filter((c) => c.ativa)
  const [contaId, setContaId] = useState(ativas[0]?.id ?? '')
  const [dia, setDia] = useState(hojeIso())
  const [valor, setValor] = useState(Number(l.restante).toFixed(2).replace('.', ','))
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [observacao, setObservacao] = useState('')
  const { salvando, erro, setErro, executar } = useAcao(aoSalvar)

  function salvar() {
    const v = valorValido(valor)
    if (!v) return setErro('Informe um valor maior que zero.')
    void executar(() => baixar(l.id, { conta_id: contaId, data: dia, valor: v, forma, observacao: observacao.trim() || null }))
  }

  return (
    <Modal
      aberto
      titulo={receber ? 'Registrar recebimento' : 'Registrar pagamento'}
      aoFechar={aoFechar}
      rodape={<Rodape form="form-baixa" rotulo="Registrar" salvando={salvando} desabilitado={!contaId} aoFechar={aoFechar} />}
    >
      <form
        id="form-baixa"
        onSubmit={(e) => {
          e.preventDefault()
          salvar()
        }}
        className="space-y-3"
      >
        <p className="text-pequeno">
          {l.descricao}
          {rotuloParcela(l)}: falta {receber ? 'receber' : 'pagar'} <strong>{moeda(Number(l.restante), true)}</strong>.
        </p>
        {!ativas.length && <Aviso tom="atencao">Cadastre uma conta (banco ou caixa) na aba Contas antes de registrar.</Aviso>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Valor (R$)" id="baixa-valor" ajuda="Menos que o total deixa a parcela paga em parte.">
            <input id="baixa-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={CLASSE_CAMPO} />
          </Campo>
          <Campo rotulo={receber ? 'Recebido em' : 'Pago em'} id="baixa-data">
            <input id="baixa-data" type="date" required max={hojeIso()} value={dia} onChange={(e) => setDia(e.target.value)} className={CLASSE_CAMPO} />
          </Campo>
          <Campo rotulo={receber ? 'Entrou na conta' : 'Saiu da conta'} id="baixa-conta">
            <select id="baixa-conta" value={contaId} onChange={(e) => setContaId(e.target.value)} className={CLASSE_CAMPO}>
              {ativas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Forma" id="baixa-forma">
            <select id="baixa-forma" value={forma} onChange={(e) => setForma(e.target.value as FormaPagamento)} className={CLASSE_CAMPO}>
              {Object.entries(ROTULO_FORMA).map(([id, rotulo]) => (
                <option key={id} value={id}>
                  {rotulo}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Observação (opcional)" id="baixa-obs">
          <input id="baixa-obs" value={observacao} maxLength={500} onChange={(e) => setObservacao(e.target.value)} className={CLASSE_CAMPO} />
        </Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Modal>
  )
}

// ---- contas, transferência e extrato ----

export function ModalConta({ orgId, conta, aoFechar, aoSalvar }: {
  orgId: string
  conta?: Conta
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [nome, setNome] = useState(conta?.nome ?? '')
  const [tipo, setTipo] = useState<TipoConta>((conta?.tipo as TipoConta) ?? 'banco')
  const [saldo, setSaldo] = useState(conta ? String(conta.saldo_inicial).replace('.', ',') : '0')
  const [desde, setDesde] = useState(conta?.saldo_inicial_em ?? hojeIso())
  const [ativa, setAtiva] = useState(conta?.ativa ?? true)
  const { salvando, erro, setErro, executar } = useAcao(aoSalvar)

  function salvar() {
    const s = lerNumero(saldo)
    if (!nome.trim()) return setErro('Informe o nome da conta.')
    if (s === undefined) return setErro('Saldo inicial inválido.')
    void executar(() => salvarConta(orgId, conta?.id ?? null, { nome: nome.trim(), tipo, saldo_inicial: s ?? 0, saldo_inicial_em: desde, ativa }))
  }

  return (
    <Modal
      aberto
      titulo={conta ? 'Editar conta' : 'Nova conta'}
      aoFechar={aoFechar}
      rodape={<Rodape form="form-conta" rotulo="Salvar" salvando={salvando} aoFechar={aoFechar} />}
    >
      <form
        id="form-conta"
        onSubmit={(e) => {
          e.preventDefault()
          salvar()
        }}
        className="space-y-3"
      >
        <Campo rotulo="Nome" id="conta-nome">
          <input id="conta-nome" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Banco do Brasil" className={CLASSE_CAMPO} />
        </Campo>
        <Campo rotulo="Tipo" id="conta-tipo">
          <select id="conta-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoConta)} className={CLASSE_CAMPO}>
            {Object.entries(ROTULO_TIPO_CONTA).map(([id, rotulo]) => (
              <option key={id} value={id}>
                {rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Saldo inicial (R$)" id="conta-saldo" ajuda="O que havia na conta ao começar a usar a Livih.">
            <input id="conta-saldo" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} className={CLASSE_CAMPO} />
          </Campo>
          <Campo rotulo="Saldo em" id="conta-desde">
            <input id="conta-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={CLASSE_CAMPO} />
          </Campo>
        </div>
        {conta && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-pequeno">
            <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="accent-primaria" />
            Conta em uso (desmarque para esconder das baixas sem perder o histórico)
          </label>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Modal>
  )
}

export function ModalTransferencia({ orgId, contas, aoFechar, aoSalvar }: {
  orgId: string
  contas: Conta[]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const ativas = contas.filter((c) => c.ativa)
  const [origem, setOrigem] = useState(ativas[0]?.id ?? '')
  const [destino, setDestino] = useState(ativas[1]?.id ?? '')
  const [dia, setDia] = useState(hojeIso())
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const { salvando, erro, setErro, executar } = useAcao(aoSalvar)

  function salvar() {
    const v = valorValido(valor)
    if (!v) return setErro('Informe um valor maior que zero.')
    void executar(() => transferir(orgId, { origem, destino, data: dia, valor: v, observacao: observacao.trim() || null }))
  }

  return (
    <Modal
      aberto
      titulo="Transferir entre contas"
      aoFechar={aoFechar}
      rodape={<Rodape form="form-transf" rotulo="Transferir" salvando={salvando} desabilitado={ativas.length < 2} aoFechar={aoFechar} />}
    >
      <form
        id="form-transf"
        onSubmit={(e) => {
          e.preventDefault()
          salvar()
        }}
        className="space-y-3"
      >
        {ativas.length < 2 && <Aviso tom="atencao">Cadastre pelo menos duas contas para transferir.</Aviso>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Sai de" id="transf-origem">
            <select id="transf-origem" value={origem} onChange={(e) => setOrigem(e.target.value)} className={CLASSE_CAMPO}>
              {ativas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Entra em" id="transf-destino">
            <select id="transf-destino" value={destino} onChange={(e) => setDestino(e.target.value)} className={CLASSE_CAMPO}>
              {ativas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Valor (R$)" id="transf-valor">
            <input id="transf-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className={CLASSE_CAMPO} />
          </Campo>
          <Campo rotulo="Data" id="transf-data">
            <input id="transf-data" type="date" required max={hojeIso()} value={dia} onChange={(e) => setDia(e.target.value)} className={CLASSE_CAMPO} />
          </Campo>
        </div>
        <Campo rotulo="Observação (opcional)" id="transf-obs">
          <input id="transf-obs" value={observacao} maxLength={500} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: depósito do caixa" className={CLASSE_CAMPO} />
        </Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Modal>
  )
}

export function ModalExtrato({ saldo, aoFechar, aoMudar }: { saldo: Saldo; aoFechar: () => void; aoMudar: () => void }) {
  const [dias, setDias] = useState(30)
  const [movimentos, setMovimentos] = useState<{ chave: string; lista: MovimentoExtrato[] } | null>(null)
  const [versao, setVersao] = useState(0)
  const [desfazendo, setDesfazendo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const chave = `${saldo.conta_id}|${dias}|${versao}`

  useEffect(() => {
    let ativo = true
    extratoConta(saldo.conta_id, somarDias(hojeIso(), -dias))
      .then((lista) => ativo && setMovimentos({ chave, lista }))
      .catch(() => ativo && setErro('Não foi possível carregar o extrato.'))
    return () => {
      ativo = false
    }
  }, [saldo.conta_id, dias, chave])

  async function desfazer(id: string) {
    setDesfazendo(id)
    setErro(null)
    try {
      await desfazerTransferencia(id)
      setVersao((v) => v + 1)
      aoMudar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setDesfazendo(null)
    }
  }

  const lista = movimentos?.chave === chave ? movimentos.lista : null
  return (
    <Modal aberto largura="max-w-xl" titulo={`Extrato: ${saldo.nome}`} aoFechar={aoFechar}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-pequeno">
            Saldo agora: <strong className="tabular-nums">{moeda(Number(saldo.saldo), true)}</strong>
          </p>
          <select
            aria-label="Período"
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="h-8 rounded-md border border-borda bg-superficie px-2 text-pequeno"
          >
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={365}>Último ano</option>
          </select>
        </div>
        {!lista ? (
          <p className="text-pequeno text-texto-3">Carregando…</p>
        ) : !lista.length ? (
          <p className="text-pequeno text-texto-3">Nenhum movimento no período.</p>
        ) : (
          <ul className="divide-y divide-borda rounded-md border border-borda text-pequeno">
            {lista.map((m) => (
              <li key={`${m.tipo}-${m.id}`} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${m.desfeito ? 'text-texto-3' : ''}`}>
                <span className="w-14 tabular-nums">{data(m.data, true)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {m.descricao}
                  {m.desfeito && ' · desfeito'}
                </span>
                <span className={`font-medium tabular-nums ${m.desfeito ? 'line-through' : m.valor < 0 ? 'text-erro' : 'text-primaria'}`}>
                  {moeda(m.valor, true)}
                </span>
                {m.tipo === 'transferencia' && !m.desfeito && (
                  <Botao variante="fantasma" tamanho="sm" carregando={desfazendo === m.id} onClick={() => void desfazer(m.id)}>
                    Desfazer
                  </Botao>
                )}
              </li>
            ))}
          </ul>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Modal>
  )
}

// ---- categorias ----

export function ModalCategorias({ orgId, categorias, aoFechar, aoMudar }: {
  orgId: string
  categorias: Categoria[]
  aoFechar: () => void
  aoMudar: () => void
}) {
  const [nova, setNova] = useState('')
  const [tipoNova, setTipoNova] = useState<'receita' | 'despesa'>('despesa')
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function executar(chave: string, acao: () => Promise<unknown>) {
    setSalvando(chave)
    setErro(null)
    try {
      await acao()
      aoMudar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(null)
    }
  }

  const grupos = [
    { tipo: 'receita' as const, rotulo: 'Receitas (a receber)' },
    { tipo: 'despesa' as const, rotulo: 'Despesas (a pagar)' },
  ]
  return (
    <Modal aberto largura="max-w-xl" titulo="Categorias" aoFechar={aoFechar}>
      <div className="space-y-4">
        {grupos.map((g) => (
          <section key={g.tipo}>
            <h3 className="mb-1 text-pequeno font-semibold text-texto">{g.rotulo}</h3>
            <ul className="divide-y divide-borda rounded-md border border-borda text-pequeno">
              {categorias
                .filter((c) => c.tipo === g.tipo)
                .map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-1.5">
                    <span className={`flex-1 ${c.ativa ? '' : 'text-texto-3 line-through'}`}>{c.nome}</span>
                    <Botao
                      variante="fantasma"
                      tamanho="sm"
                      carregando={salvando === c.id}
                      onClick={() => void executar(c.id, () => salvarCategoria(orgId, c.id, { nome: c.nome, tipo: g.tipo, ativa: !c.ativa }))}
                    >
                      {c.ativa ? 'Desativar' : 'Reativar'}
                    </Botao>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!nova.trim()) return
            void executar('nova', () => salvarCategoria(orgId, null, { nome: nova.trim(), tipo: tipoNova, ativa: true }).then(() => setNova('')))
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-48 flex-1">
            <Campo rotulo="Nova categoria" id="cat-nova">
              <input id="cat-nova" value={nova} maxLength={60} onChange={(e) => setNova(e.target.value)} className={CLASSE_CAMPO} />
            </Campo>
          </div>
          <select aria-label="Tipo da categoria" value={tipoNova} onChange={(e) => setTipoNova(e.target.value as 'receita' | 'despesa')} className="h-10 rounded-md border border-borda bg-superficie px-2">
            <option value="receita">Receita</option>
            <option value="despesa">Despesa</option>
          </select>
          <Botao type="submit" carregando={salvando === 'nova'} disabled={!nova.trim()}>
            Adicionar
          </Botao>
        </form>
        <p className="text-legenda text-texto-3">Desativar esconde a categoria dos lançamentos novos; os antigos continuam com ela.</p>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Modal>
  )
}
