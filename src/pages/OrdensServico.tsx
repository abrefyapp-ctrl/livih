import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { moeda } from '../services/formato'
import {
  carregarConfiguracao,
  carregarOficina,
  data,
  diasEntre,
  hojeIso,
  ROTULO_COBRANCA,
  ROTULO_DESFECHO,
  type ConfiguracaoOs,
  type EtapaOs,
  type ItemOs,
  type Oficina,
  type Ordem,
} from '../services/os'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { EstadoVazio } from '../components/EstadoVazio'
import { Icone } from '../components/Icone'
import { ModalMover, ModalOrdem } from '../components/ModaisOs'
import { ModalImportarOs } from '../components/ModalImportarOs'
import { BOM } from '../services/planilhaOs'
import { PainelOficina } from '../components/PainelOficina'

const DIAS_ENTREGUES = 30

type Aba = 'quadro' | 'lista' | 'painel'
type Situacao = 'abertos' | 'receber' | 'encerrados' | 'todos'

export function OrdensServico() {
  const { orgAtiva, modulos } = useSessao()
  if (modulos && !modulos.has('os')) {
    return (
      <EstadoVazio icone="ferramenta" titulo="Ordens de serviço não está ligado nesta empresa">
        É um pacote adicional. Fale com a equipe da Livih para ativar.
      </EstadoVazio>
    )
  }
  return <Oficina orgId={orgAtiva!.id} gerencia={orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'} />
}

/** Texto para busca: OS, NF, cliente, modelo, identificação e tipo. */
const textoBusca = (i: ItemOs, o: Ordem | undefined, tipo: string | undefined) =>
  `${o?.numero ?? ''} ${o?.nf_cliente ?? ''} ${o?.numero_cliente ?? ''} ${o?.cliente_nome ?? ''} ${i.modelo ?? ''} ${i.identificacao ?? ''} ${tipo ?? ''}`.toLowerCase()

function Oficina({ orgId, gerencia }: { orgId: string; gerencia: boolean }) {
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const aba = (['quadro', 'lista', 'painel'].includes(params.get('aba') ?? '') ? params.get('aba') : 'quadro') as Aba
  const [dados, setDados] = useState<{ orgId: string; cfg: ConfiguracaoOs; oficina: Oficina } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [soParados, setSoParados] = useState(false)
  const [situacao, setSituacao] = useState<Situacao>('abertos')
  const [nova, setNova] = useState(false)
  const [importar, setImportar] = useState(false)
  const [mover, setMover] = useState<{ item: ItemOs; etapa: string } | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    let espera: ReturnType<typeof setTimeout> | undefined
    const buscar = () =>
      Promise.all([carregarConfiguracao(orgId), carregarOficina(orgId)])
        .then(([cfg, oficina]) => {
          if (!ativo) return
          setDados({ orgId, cfg, oficina })
          setErro(null)
        })
        .catch((e) => ativo && setErro((e as Error).message || 'Não foi possível carregar as ordens de serviço.'))
    void buscar()
    // Ao vivo: outra pessoa move um item e o quadro acompanha.
    const canal = supabase
      .channel(`os-itens-${orgId}-${versao}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'os_itens', filter: `org_id=eq.${orgId}` }, () => {
        clearTimeout(espera)
        espera = setTimeout(() => void buscar(), 400)
      })
      .subscribe()
    return () => {
      ativo = false
      clearTimeout(espera)
      void supabase.removeChannel(canal)
    }
  }, [orgId, versao])

  const atual = dados?.orgId === orgId ? dados : null
  const recarregar = () => setVersao((v) => v + 1)
  const nomeTipo = useMemo(() => new Map(atual?.cfg.tipos.map((t) => [t.id, t.nome]) ?? []), [atual])

  const filtrados = useMemo(() => {
    if (!atual) return []
    const t = busca.trim().toLowerCase().replace(/^#/, '')
    return atual.oficina.itens.filter((i) => {
      if (tipo && i.tipo_id !== tipo) return false
      if (soParados && !atual.oficina.previsao.get(i.id)?.parado) return false
      if (!t) return true
      return textoBusca(i, atual.oficina.ordens.get(i.os_id), i.tipo_id ? nomeTipo.get(i.tipo_id) : undefined).includes(t)
    })
  }, [atual, busca, tipo, soParados, nomeTipo])

  const trocarAba = (a: Aba) => setParams(a === 'quadro' ? {} : { aba: a }, { replace: true })

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pt-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-semibold">Ordens de serviço</h1>
            <p className="text-pequeno text-texto-3">Cada item anda sozinho nas etapas. Ao mover, informe o dia em que aconteceu.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {gerencia && (
              <>
                <Botao variante="secundario" icone="config" onClick={() => navegar('/configuracoes/os')}>
                  Configurar
                </Botao>
                <Botao variante="secundario" icone="arquivo" onClick={() => setImportar(true)} disabled={!atual}>
                  Importar planilha
                </Botao>
              </>
            )}
            <Botao icone="mais" onClick={() => setNova(true)} disabled={!atual}>
              Nova OS
            </Botao>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Visão" className="flex gap-1 rounded-md bg-slate-100 p-1 text-pequeno">
            {(
              [
                ['quadro', 'Quadro'],
                ['lista', 'Lista'],
                ...(gerencia ? [['painel', 'Painel']] : []),
              ] as [Aba, string][]
            ).map(([id, rotulo]) => (
              <button
                key={id}
                role="tab"
                aria-selected={aba === id}
                onClick={() => trocarAba(id)}
                className={`shrink-0 rounded px-3 py-1.5 font-medium ${aba === id ? 'bg-superficie text-texto shadow-sm' : 'text-texto-2'}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {aba !== 'painel' && (
            <>
              <label className="relative min-w-56 flex-1 sm:max-w-xs">
                <span className="sr-only">Buscar</span>
                <Icone nome="busca" className="pointer-events-none absolute top-3 left-3 size-4 text-texto-3" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Cliente, modelo, série, NF ou nº da OS"
                  className="h-10 w-full rounded-md border border-borda bg-superficie pr-3 pl-9 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
                />
              </label>
              {!!atual?.cfg.tipos.length && (
                <select
                  aria-label="Tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="h-10 rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none"
                >
                  <option value="">Todos os tipos</option>
                  {atual.cfg.tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              )}
              {aba === 'lista' && (
                <select
                  aria-label="Situação"
                  value={situacao}
                  onChange={(e) => setSituacao(e.target.value as Situacao)}
                  className="h-10 rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none"
                >
                  <option value="abertos">Em andamento</option>
                  <option value="receber">A receber</option>
                  <option value="encerrados">Entregues e encerrados</option>
                  <option value="todos">Todos</option>
                </select>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2">
                <input type="checkbox" checked={soParados} onChange={(e) => setSoParados(e.target.checked)} className="size-4 accent-primaria" />
                Só parados
              </label>
            </>
          )}
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>

      {!atual ? (
        !erro && <p className="px-4 py-6 text-pequeno text-texto-3 lg:px-8">Carregando…</p>
      ) : aba === 'painel' ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6 lg:px-8">
          <PainelOficina orgId={orgId} versao={versao} />
        </div>
      ) : !atual.oficina.itens.length ? (
        <EstadoVazio
          icone="ferramenta"
          titulo="Nenhuma OS ainda"
          acao={<Botao icone="mais" onClick={() => setNova(true)}>Receber o primeiro equipamento</Botao>}
        >
          {gerencia ? 'Crie a primeira OS ou traga o que já está na planilha pelo botão Importar planilha.' : 'Crie a primeira OS quando um equipamento chegar.'}
        </EstadoVazio>
      ) : aba === 'quadro' ? (
        <Quadro
          etapas={atual.cfg.etapas}
          itens={filtrados}
          oficina={atual.oficina}
          nomeTipo={nomeTipo}
          arrastando={arrastando}
          sobre={sobre}
          setArrastando={setArrastando}
          setSobre={setSobre}
          aoSoltar={(e: DragEvent, etapa: EtapaOs) => {
            e.preventDefault()
            setSobre(null)
            const item = atual.oficina.itens.find((x) => x.id === e.dataTransfer.getData('text/plain'))
            if (item && item.etapa_id !== etapa.id) setMover({ item, etapa: etapa.id })
          }}
          aoAvancar={(item) => setMover({ item, etapa: '' })}
        />
      ) : (
        <Lista itens={filtrados} situacao={situacao} cfg={atual.cfg} oficina={atual.oficina} nomeTipo={nomeTipo} />
      )}

      {nova && atual && (
        <ModalOrdem orgId={orgId} cfg={atual.cfg} aoFechar={() => setNova(false)} aoSalvar={(id) => navegar(`/os/${id}`)} />
      )}
      {importar && atual && (
        <ModalImportarOs
          orgId={orgId}
          cfg={atual.cfg}
          aoFechar={() => setImportar(false)}
          aoImportar={() => {
            setImportar(false)
            recarregar()
          }}
        />
      )}
      {mover && atual && (
        <ModalMover
          itens={[mover.item]}
          etapas={atual.cfg.etapas}
          etapaInicial={mover.etapa || undefined}
          aoFechar={() => setMover(null)}
          aoSalvar={() => {
            setMover(null)
            recarregar()
          }}
        />
      )}
    </div>
  )
}

function Quadro({ etapas, itens, oficina, nomeTipo, arrastando, sobre, setArrastando, setSobre, aoSoltar, aoAvancar }: {
  etapas: EtapaOs[]
  itens: ItemOs[]
  oficina: Oficina
  nomeTipo: Map<string, string>
  arrastando: string | null
  sobre: string | null
  setArrastando: (id: string | null) => void
  setSobre: (fn: (s: string | null) => string | null) => void
  aoSoltar: (e: DragEvent, etapa: EtapaOs) => void
  aoAvancar: (item: ItemOs) => void
}) {
  const hoje = hojeIso()
  const abertos = itens.filter((i) => !i.desfecho)
  return (
    <div className="min-h-0 flex-1 overflow-x-auto px-4 pt-4 pb-6 lg:px-8">
      <div className="flex h-full gap-3">
        {etapas.map((etapa, n) => {
          // Entregue acumula: mostra só os últimos 30 dias.
          const cartoes = abertos.filter(
            (i) => i.etapa_id === etapa.id && (etapa.marco !== 'entregue' || diasEntre(i.etapa_desde, hoje) <= DIAS_ENTREGUES),
          )
          const total = cartoes.reduce((s, i) => s + (i.cobranca === 'cobrado' ? i.valor : 0), 0)
          const ultima = n === etapas.length - 1
          return (
            <section
              key={etapa.id}
              aria-label={`Etapa ${etapa.nome}`}
              onDragOver={(e) => {
                e.preventDefault()
                setSobre(() => etapa.id)
              }}
              onDragLeave={() => setSobre((s) => (s === etapa.id ? null : s))}
              onDrop={(e) => aoSoltar(e, etapa)}
              className={`flex h-full w-72 shrink-0 flex-col rounded-lg border bg-slate-100 transition-colors ${
                sobre === etapa.id && arrastando ? 'border-primaria bg-primaria-suave' : 'border-transparent'
              }`}
            >
              <header className="px-3 pt-3 pb-2">
                <p className="flex items-center justify-between gap-2 font-semibold">
                  <span className="truncate">{etapa.nome}</span>
                  <span className="rounded-full bg-superficie px-2 text-legenda font-medium text-texto-2">{cartoes.length}</span>
                </p>
                <p className="text-legenda text-texto-3">
                  {total > 0 ? moeda(total) : 'Sem valor'}
                  {etapa.marco === 'entregue' && ` · últimos ${DIAS_ENTREGUES} dias`}
                </p>
              </header>
              <ul className="relative min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {cartoes.map((i) => {
                  const o = oficina.ordens.get(i.os_id)
                  const p = oficina.previsao.get(i.id)
                  const dias = diasEntre(i.etapa_desde, hoje)
                  return (
                    <li
                      key={i.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', i.id)
                        e.dataTransfer.effectAllowed = 'move'
                        setArrastando(i.id)
                      }}
                      onDragEnd={() => {
                        setArrastando(null)
                        setSobre(() => null)
                      }}
                      className={`rounded-md border bg-superficie shadow-sm ${p?.parado ? 'border-atencao/60' : 'border-borda'} ${arrastando === i.id ? 'opacity-50' : ''}`}
                    >
                      <Link to={`/os/${i.os_id}`} className="block cursor-grab p-3 active:cursor-grabbing">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium">{i.modelo || (i.tipo_id && nomeTipo.get(i.tipo_id)) || 'Item'}</span>
                          <span className="shrink-0 text-legenda text-texto-3">OS {o?.numero}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-pequeno text-texto-3">{o?.cliente_nome ?? 'Sem cliente'}</span>
                        {(i.identificacao || i.tipo_id) && (
                          <span className="block truncate text-legenda text-texto-3">
                            {[i.tipo_id && nomeTipo.get(i.tipo_id), i.identificacao].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-legenda text-texto-3">
                          <span className={p?.parado ? 'font-medium text-atencao' : ''}>
                            {p?.parado && <Icone nome="alerta" className="mr-0.5 inline size-3.5 align-[-2px]" />}
                            {dias === 0 ? 'desde hoje' : `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`}
                          </span>
                          {i.cobranca !== 'cobrado' && <span className="rounded-sm bg-info-suave px-1 text-info">{ROTULO_COBRANCA[i.cobranca]}</span>}
                          {p && etapa.marco !== 'entregue' && p.finaliza_em > hoje && <span className="ml-auto">pronto ~{data(p.finaliza_em, true)}</span>}
                        </span>
                      </Link>
                      {!ultima && (
                        <button
                          type="button"
                          onClick={() => aoAvancar(i)}
                          className="flex w-full items-center justify-center gap-1 border-t border-borda py-1.5 text-legenda font-medium text-texto-2 hover:bg-fundo hover:text-primaria"
                        >
                          Mover <Icone nome="abaixo" className="size-3.5 -rotate-90" />
                        </button>
                      )}
                    </li>
                  )
                })}
                {!cartoes.length && <li className="px-2 py-4 text-center text-legenda text-texto-3">Nada aqui</li>}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

const situacaoDoItem = (i: ItemOs, etapa: EtapaOs | undefined) =>
  i.desfecho ? ROTULO_DESFECHO[i.desfecho] : (etapa?.nome ?? '—')

function Lista({ itens, situacao, cfg, oficina, nomeTipo }: {
  itens: ItemOs[]
  situacao: Situacao
  cfg: ConfiguracaoOs
  oficina: Oficina
  nomeTipo: Map<string, string>
}) {
  const hoje = hojeIso()
  const etapas = useMemo(() => new Map(cfg.etapas.map((e) => [e.id, e])), [cfg])
  const linhas = useMemo(() => {
    const filtro = itens.filter((i) => {
      const entregue = etapas.get(i.etapa_id)?.marco === 'entregue'
      if (situacao === 'abertos') return !i.desfecho && !entregue
      if (situacao === 'encerrados') return !!i.desfecho || entregue
      if (situacao === 'receber') return !!i.faturado_em && !i.pago_em
      return true
    })
    return filtro.sort((a, b) => {
      const oa = oficina.ordens.get(a.os_id)?.numero ?? 0
      const ob = oficina.ordens.get(b.os_id)?.numero ?? 0
      return ob - oa || a.ordem - b.ordem
    })
  }, [itens, situacao, etapas, oficina])

  function exportar() {
    const cab = ['OS', 'NF do cliente', 'OS do cliente', 'Cliente', 'Recebido em', 'Tipo', 'Modelo', 'Identificação', 'Situação', 'Na etapa desde',
      'Previsão de término', 'Valor', 'Cobrança', 'Faturado em', 'Vencimento', 'Pago em', 'Observação']
    const csv = (v: string | number | null | undefined) => {
      const t = v == null ? '' : String(v)
      return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
    }
    const corpo = linhas.map((i) => {
      const o = oficina.ordens.get(i.os_id)
      const p = oficina.previsao.get(i.id)
      return [o?.numero, o?.nf_cliente, o?.numero_cliente, o?.cliente_nome, data(o?.recebida_em), i.tipo_id ? nomeTipo.get(i.tipo_id) : '', i.modelo,
        i.identificacao, situacaoDoItem(i, etapas.get(i.etapa_id)), data(i.etapa_desde), i.desfecho ? '' : data(p?.finaliza_em),
        i.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), ROTULO_COBRANCA[i.cobranca], data(i.faturado_em), data(i.vencimento_em),
        data(i.pago_em), i.observacao].map(csv).join(';')
    })
    const blob = new Blob([BOM + [cab.join(';'), ...corpo].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ordens-de-servico-${hoje}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 pt-4 pb-6 lg:px-8">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-pequeno text-texto-3">
          {linhas.length} {linhas.length === 1 ? 'item' : 'itens'} · {moeda(linhas.reduce((s, i) => s + (i.cobranca === 'cobrado' ? i.valor : 0), 0), true)} cobrados
        </p>
        <Botao variante="secundario" tamanho="sm" icone="baixar" onClick={exportar} disabled={!linhas.length}>
          Exportar para Excel
        </Botao>
      </div>
      {!linhas.length ? (
        <div className="rounded-lg border border-borda bg-superficie">
          <EstadoVazio icone="ferramenta" titulo="Nenhum item aqui" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-pequeno">
            <thead className="bg-fundo text-left text-legenda text-texto-3 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">OS</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Recebido</th>
                <th className="px-3 py-2 font-medium">Situação</th>
                <th className="px-3 py-2 font-medium">Previsão</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 font-medium">Faturado</th>
                <th className="px-3 py-2 font-medium">Vencimento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map((i) => {
                const o = oficina.ordens.get(i.os_id)
                const p = oficina.previsao.get(i.id)
                const etapa = etapas.get(i.etapa_id)
                const vencido = i.vencimento_em && !i.pago_em && i.vencimento_em < hoje
                return (
                  <tr key={i.id} className="hover:bg-fundo">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link to={`/os/${i.os_id}`} className="font-semibold text-primaria hover:underline">
                        {o?.numero}
                      </Link>
                      {o?.nf_cliente && <span className="block text-legenda text-texto-3">NF {o.nf_cliente}</span>}
                    </td>
                    <td className="max-w-48 truncate px-3 py-2">{o?.cliente_nome ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="block max-w-56 truncate">{i.modelo || (i.tipo_id && nomeTipo.get(i.tipo_id)) || 'Item'}</span>
                      <span className="block max-w-56 truncate text-legenda text-texto-3">
                        {[i.tipo_id && nomeTipo.get(i.tipo_id), i.identificacao].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{data(o?.recebida_em)}</td>
                    <td className="px-3 py-2">
                      <span className={i.desfecho ? 'text-erro' : p?.parado ? 'font-medium text-atencao' : ''}>{situacaoDoItem(i, etapa)}</span>
                      {!i.desfecho && <span className="block text-legenda text-texto-3">desde {data(i.etapa_desde, true)}</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums text-texto-2">
                      {!i.desfecho && p && etapa?.marco !== 'entregue' && p.finaliza_em > hoje ? data(p.finaliza_em, true) : ''}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {i.cobranca === 'cobrado' ? moeda(i.valor, true) : ROTULO_COBRANCA[i.cobranca]}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{data(i.faturado_em)}</td>
                    <td className={`px-3 py-2 whitespace-nowrap tabular-nums ${vencido ? 'font-medium text-erro' : ''}`}>
                      {i.pago_em ? <span className="text-primaria">pago {data(i.pago_em, true)}</span> : data(i.vencimento_em)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
