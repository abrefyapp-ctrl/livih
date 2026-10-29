import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ROTULO_TIPO_CONTA,
  listarCategorias,
  listarContas,
  listarLancamentos,
  listarSaldos,
  podeFinanceiro,
  prepararFinanceiro,
  quemDoLancamento,
  rotuloParcela,
  type Categoria,
  type Conta,
  type FiltroLancamentos,
  type Lancamento,
  type Saldo,
  type TipoConta,
  type TipoLancamento,
} from '../services/financeiro'
import { moeda } from '../services/formato'
import { data } from '../services/os'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { EstadoVazio } from '../components/EstadoVazio'
import { Icone } from '../components/Icone'
import {
  EtiquetaSituacao,
  ModalCategorias,
  ModalConta,
  ModalDetalheLancamento,
  ModalExtrato,
  ModalLancamento,
  ModalTransferencia,
} from '../components/ModaisFinanceiro'

type Aba = 'receber' | 'pagar' | 'contas'
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'receber', rotulo: 'A receber' },
  { id: 'pagar', rotulo: 'A pagar' },
  { id: 'contas', rotulo: 'Contas' },
]
const FILTROS: { id: FiltroLancamentos; rotulo: string }[] = [
  { id: 'abertos', rotulo: 'Em aberto' },
  { id: 'vencido', rotulo: 'Vencidos' },
  { id: 'pago', rotulo: 'Pagos' },
  { id: 'cancelado', rotulo: 'Cancelados' },
  { id: 'todos', rotulo: 'Todos' },
]

/** Financeiro (docs/financeiro.md): vem com o ERP ou as OS; dono, admin e quem tem a permissão Financeiro. */
export function Financeiro() {
  const { orgAtiva, modulos } = useSessao()
  const orgId = orgAtiva!.id
  const [acesso, setAcesso] = useState<{ orgId: string; ok: boolean; erro?: string } | null>(null)
  const ligado = !modulos || modulos.has('erp') || modulos.has('os')

  useEffect(() => {
    if (!ligado) return
    let ativo = true
    podeFinanceiro(orgId)
      .then(async (ok) => {
        if (ok) await prepararFinanceiro(orgId)
        if (ativo) setAcesso({ orgId, ok })
      })
      .catch((e: Error) => ativo && setAcesso({ orgId, ok: false, erro: e.message }))
    return () => {
      ativo = false
    }
  }, [orgId, ligado])

  if (!ligado) {
    return (
      <EstadoVazio icone="grafico" titulo="O financeiro não está ligado nesta empresa">
        Ele vem com o módulo Pedidos e estoque (ERP) ou Ordens de serviço. Fale com a equipe da Livih para ativar.
      </EstadoVazio>
    )
  }
  const a = acesso?.orgId === orgId ? acesso : null
  if (!a) return <p className="px-4 pt-6 text-pequeno text-texto-3 lg:px-8">Carregando…</p>
  if (!a.ok) {
    return (
      <EstadoVazio icone="grafico" titulo="Você não tem acesso ao financeiro">
        {a.erro ?? 'Peça ao dono ou a um admin da empresa a permissão Financeiro, em Configurações → Equipe.'}
      </EstadoVazio>
    )
  }
  return <TelaFinanceiro orgId={orgId} gerencia={orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'} />
}

function TelaFinanceiro({ orgId, gerencia }: { orgId: string; gerencia: boolean }) {
  const navegar = useNavigate()
  const { aba: abaUrl } = useParams()
  const aba: Aba = abaUrl === 'pagar' || abaUrl === 'contas' ? abaUrl : 'receber'
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [versao, setVersao] = useState(0)
  const recarregar = () => setVersao((v) => v + 1)

  // Contas e categorias servem às três abas (baixa, novo lançamento).
  useEffect(() => {
    let ativo = true
    Promise.all([listarContas(orgId), listarCategorias(orgId)])
      .then(([c, cat]) => ativo && (setContas(c), setCategorias(cat)))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pt-6 pb-3 lg:px-8">
        <div>
          <h1 className="text-h1 font-semibold">Financeiro</h1>
          <p className="text-pequeno text-texto-3">Contas a receber, contas a pagar e o saldo de cada conta.</p>
        </div>
        <div role="tablist" aria-label="Parte do financeiro" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-borda">
          {ABAS.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => navegar(`/financeiro/${a.id}`)}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-pequeno font-medium ${
                aba === a.id ? 'border-primaria text-primaria' : 'border-transparent text-texto-2 hover:text-texto'
              }`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      </div>
      {aba === 'contas' ? (
        <AbaContas orgId={orgId} gerencia={gerencia} contas={contas} categorias={categorias} versao={versao} aoMudar={recarregar} />
      ) : (
        <AbaLancamentos key={aba} orgId={orgId} tipo={aba} contas={contas} categorias={categorias} aoMudar={recarregar} />
      )}
    </div>
  )
}

function AbaLancamentos({ orgId, tipo, contas, categorias, aoMudar }: {
  orgId: string
  tipo: TipoLancamento
  contas: Conta[]
  categorias: Categoria[]
  aoMudar: () => void
}) {
  const receber = tipo === 'receber'
  const [filtro, setFiltro] = useState<FiltroLancamentos>('abertos')
  const [dados, setDados] = useState<{ chave: string; lista: Lancamento[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [versao, setVersao] = useState(0)
  const [novo, setNovo] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)

  const chave = `${orgId}|${tipo}|${filtro}|${versao}`
  useEffect(() => {
    let ativo = true
    listarLancamentos(orgId, tipo, filtro)
      .then((lista) => ativo && (setDados({ chave, lista }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar os lançamentos.'))
    return () => {
      ativo = false
    }
  }, [orgId, tipo, filtro, chave])

  const todos = dados?.chave === chave ? dados.lista : dados?.lista ?? null
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return todos ?? []
    return (todos ?? []).filter((l) => `${l.descricao} ${quemDoLancamento(l) ?? ''} ${l.categoria?.nome ?? ''}`.toLowerCase().includes(t))
  }, [todos, busca])
  const totais = useMemo(() => {
    const abertos = lista.filter((l) => l.situacao !== 'cancelado' && l.situacao !== 'pago')
    return {
      falta: abertos.reduce((s, l) => s + Number(l.restante), 0),
      vencido: abertos.filter((l) => l.situacao === 'vencido').reduce((s, l) => s + Number(l.restante), 0),
    }
  }, [lista])

  const mudou = () => {
    setVersao((v) => v + 1)
    aoMudar()
  }
  const selecionado = lista.find((l) => l.id === aberto) ?? null

  return (
    <>
      <div className="space-y-3 px-4 pb-3 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Situação" className="flex gap-1 overflow-x-auto rounded-md bg-slate-100 p-1 text-pequeno">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filtro === f.id}
                onClick={() => setFiltro(f.id)}
                className={`shrink-0 rounded px-3 py-1.5 font-medium ${filtro === f.id ? 'bg-superficie text-texto shadow-sm' : 'text-texto-2'}`}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
          <label className="relative min-w-56 flex-1 sm:max-w-xs">
            <span className="sr-only">Buscar lançamentos</span>
            <Icone nome="busca" className="pointer-events-none absolute top-3 left-3 size-4 text-texto-3" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={receber ? 'Descrição, cliente ou categoria' : 'Descrição, fornecedor ou categoria'}
              className="h-10 w-full rounded-md border border-borda bg-superficie pr-3 pl-9 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
          </label>
          <Botao icone="mais" className="ml-auto" onClick={() => setNovo(true)}>
            {receber ? 'Nova conta a receber' : 'Nova conta a pagar'}
          </Botao>
        </div>
        {(filtro === 'abertos' || filtro === 'vencido') && todos && (
          <p className="text-pequeno text-texto-2">
            {receber ? 'Falta receber' : 'Falta pagar'}: <strong className="text-texto tabular-nums">{moeda(totais.falta, true)}</strong>
            {totais.vencido > 0 && (
              <>
                {' '}
                · vencido: <strong className="text-erro tabular-nums">{moeda(totais.vencido, true)}</strong>
              </>
            )}
          </p>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>

      <div className="flex-1 overflow-auto px-4 pb-6 lg:px-8">
        {!todos ? (
          <p className="text-pequeno text-texto-3">Carregando…</p>
        ) : !lista.length ? (
          <div className="rounded-lg border border-borda bg-superficie">
            <EstadoVazio icone="grafico" titulo={busca ? 'Nenhum lançamento encontrado' : 'Nenhum lançamento aqui'}>
              {filtro === 'abertos' && !busca
                ? receber
                  ? 'Lance o que os clientes vão pagar pelo botão Nova conta a receber.'
                  : 'Lance as contas da empresa (fornecedores, aluguel, impostos) pelo botão Nova conta a pagar.'
                : null}
            </EstadoVazio>
          </div>
        ) : (
          <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
            {lista.map((l) => (
              <li key={l.id}>
                {/* Duas linhas (descrição; vencimento e quem) para caber no celular; no pago em parte, o valor é o que falta. */}
                <button onClick={() => setAberto(l.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fundo">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {l.descricao}
                      <span className="font-normal text-texto-3">{rotuloParcela(l)}</span>
                    </span>
                    <span className="block truncate text-legenda text-texto-3">
                      vence {data(l.vencimento)}
                      {quemDoLancamento(l) && ` · ${quemDoLancamento(l)}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
                    <EtiquetaSituacao situacao={l.situacao} emParte={Number(l.valor_pago) > 0} />
                    <span className="font-medium tabular-nums sm:w-28 sm:text-right">
                      {moeda(Number(l.valor_pago) > 0 && l.situacao !== 'pago' && l.situacao !== 'cancelado' ? Number(l.restante) : Number(l.valor), true)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {novo && (
        <ModalLancamento
          orgId={orgId}
          tipo={tipo}
          categorias={categorias}
          aoFechar={() => setNovo(false)}
          aoSalvar={() => {
            setNovo(false)
            mudou()
          }}
        />
      )}
      {selecionado && (
        <ModalDetalheLancamento
          key={`${selecionado.id}|${selecionado.atualizado_em}`}
          orgId={orgId}
          lancamento={selecionado}
          contas={contas}
          categorias={categorias}
          aoFechar={() => setAberto(null)}
          aoMudar={mudou}
        />
      )}
    </>
  )
}

function AbaContas({ orgId, gerencia, contas, categorias, versao, aoMudar }: {
  orgId: string
  gerencia: boolean
  contas: Conta[]
  categorias: Categoria[]
  versao: number
  aoMudar: () => void
}) {
  const [saldos, setSaldos] = useState<{ chave: string; lista: Saldo[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [janela, setJanela] = useState<'nova' | 'transferir' | 'categorias' | { editar: Conta } | { extrato: Saldo } | null>(null)
  const chave = `${orgId}|${versao}`

  useEffect(() => {
    let ativo = true
    listarSaldos(orgId)
      .then((lista) => ativo && (setSaldos({ chave, lista }), setErro(null)))
      .catch((e: Error) => ativo && setErro(e.message))
    return () => {
      ativo = false
    }
  }, [orgId, chave])

  const lista = saldos?.chave === chave ? saldos.lista : saldos?.lista ?? null
  const total = (lista ?? []).filter((s) => s.ativa).reduce((s, c) => s + Number(c.saldo), 0)
  const fechar = () => setJanela(null)
  const salvou = () => {
    setJanela(null)
    aoMudar()
  }

  return (
    <div className="flex-1 space-y-4 overflow-auto px-4 pb-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-pequeno text-texto-2">
          Saldo das contas em uso: <strong className="text-texto tabular-nums">{moeda(total, true)}</strong>
        </p>
        <Botao variante="secundario" icone="enviar" onClick={() => setJanela('transferir')}>
          Transferir
        </Botao>
        {gerencia && (
          <>
            <Botao variante="secundario" onClick={() => setJanela('categorias')}>
              Categorias
            </Botao>
            <Botao icone="mais" onClick={() => setJanela('nova')}>
              Nova conta
            </Botao>
          </>
        )}
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!lista ? (
        <p className="text-pequeno text-texto-3">Carregando…</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((s) => {
            const conta = contas.find((c) => c.id === s.conta_id)
            return (
              <li key={s.conta_id} className={`rounded-lg border border-borda bg-superficie p-4 ${s.ativa ? '' : 'opacity-60'}`}>
                <p className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{s.nome}</span>
                  <span className="text-legenda text-texto-3">
                    {ROTULO_TIPO_CONTA[s.tipo as TipoConta]}
                    {!s.ativa && ' · fora de uso'}
                  </span>
                </p>
                <p className={`mt-2 text-h2 font-semibold tabular-nums ${Number(s.saldo) < 0 ? 'text-erro' : ''}`}>{moeda(Number(s.saldo), true)}</p>
                <div className="mt-3 flex gap-2">
                  <Botao variante="secundario" tamanho="sm" onClick={() => setJanela({ extrato: s })}>
                    Extrato
                  </Botao>
                  {gerencia && conta && (
                    <Botao variante="fantasma" tamanho="sm" onClick={() => setJanela({ editar: conta })}>
                      Editar
                    </Botao>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-legenda text-texto-3">
        O saldo é o saldo inicial mais o que foi recebido, menos o que foi pago, mais e menos as transferências.
      </p>

      {janela === 'nova' && <ModalConta orgId={orgId} aoFechar={fechar} aoSalvar={salvou} />}
      {janela && typeof janela === 'object' && 'editar' in janela && (
        <ModalConta orgId={orgId} conta={janela.editar} aoFechar={fechar} aoSalvar={salvou} />
      )}
      {janela === 'transferir' && <ModalTransferencia orgId={orgId} contas={contas} aoFechar={fechar} aoSalvar={salvou} />}
      {janela === 'categorias' && <ModalCategorias orgId={orgId} categorias={categorias} aoFechar={fechar} aoMudar={aoMudar} />}
      {janela && typeof janela === 'object' && 'extrato' in janela && (
        <ModalExtrato saldo={(lista ?? []).find((s) => s.conta_id === janela.extrato.conta_id) ?? janela.extrato} aoFechar={fechar} aoMudar={aoMudar} />
      )}
    </div>
  )
}
