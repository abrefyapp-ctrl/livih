import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { atualizarOportunidade, listarEtapas, listarOportunidades, type Etapa, type Oportunidade } from '../services/crm'
import { haQuanto, moeda, nomeDoContato } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { Avatar } from '../components/Avatar'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { EstadoVazio } from '../components/EstadoVazio'
import { Icone } from '../components/Icone'
import { ModalOportunidade } from '../components/ModalOportunidade'

const DIAS_FECHADAS = 30

type Abertura = { oportunidade?: Oportunidade; etapaInicial?: string }

/**
 * Funil em kanban. Arrastar o cartão muda a etapa (Perdido abre a janela pedindo o motivo); quem não usa
 * mouse abre o cartão e escolhe a etapa. Ganho e Perdido mostram só os fechados nos últimos 30 dias.
 */
export function Oportunidades() {
  const { orgAtiva, sessao, equipe } = useSessao()
  const orgId = orgAtiva!.id
  const eu = sessao?.user.id
  const [dados, setDados] = useState<{ orgId: string; etapas: Etapa[]; lista: Oportunidade[]; corte: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [busca, setBusca] = useState('')
  const [soMinhas, setSoMinhas] = useState(false)
  const [abertura, setAbertura] = useState<Abertura | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    Promise.all([listarEtapas(orgId), listarOportunidades(orgId)])
      .then(([etapas, lista]) => {
        if (!ativo) return
        // Fechadas há mais de 30 dias saem do quadro; o corte é fixado quando os dados chegam.
        setDados({ orgId, etapas, lista, corte: Date.now() - DIAS_FECHADAS * 86_400_000 })
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar o funil.'))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  const atual = dados?.orgId === orgId ? dados : null
  const recarregar = () => setVersao((v) => v + 1)

  const visiveis = useMemo(() => {
    if (!atual) return []
    const t = busca.trim().toLowerCase()
    return atual.lista.filter((o) => {
      if (soMinhas && o.responsavel_id !== eu) return false
      if (o.fechada_em && new Date(o.fechada_em).getTime() < atual.corte) return false
      if (!t) return true
      return `${o.titulo} ${nomeDoContato(o.contato)}`.toLowerCase().includes(t)
    })
  }, [atual, busca, soMinhas, eu])

  async function mover(o: Oportunidade, etapa: Etapa) {
    if (o.etapa_id === etapa.id || !atual) return
    if (etapa.tipo === 'perdido') {
      setAbertura({ oportunidade: o, etapaInicial: etapa.id })
      return
    }
    // Otimista: o cartão já aparece na coluna nova; se o banco recusar, volta.
    setDados({ ...atual, lista: atual.lista.map((x) => (x.id === o.id ? { ...x, etapa_id: etapa.id } : x)) })
    try {
      await atualizarOportunidade(o.id, { etapa_id: etapa.id, motivo_perda: null })
      recarregar()
    } catch (e) {
      setErro((e as Error).message)
      recarregar()
    }
  }

  function soltar(e: DragEvent, etapa: Etapa) {
    e.preventDefault()
    setSobre(null)
    const o = atual?.lista.find((x) => x.id === e.dataTransfer.getData('text/plain'))
    if (o) void mover(o, etapa)
  }

  const nomeResp = (id: string | null) => (id ? (id === eu ? 'Você' : (equipe.get(id)?.nome ?? 'Equipe')) : null)

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 px-4 pt-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-semibold">Oportunidades</h1>
            <p className="text-pequeno text-texto-3">Arraste os cartões entre as etapas. O agente cria e avança; ganho e perdido são da equipe.</p>
          </div>
          <Botao icone="mais" onClick={() => setAbertura({})} disabled={!atual?.etapas.length}>
            Nova oportunidade
          </Botao>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-64 flex-1 sm:max-w-sm">
            <span className="sr-only">Buscar oportunidades</span>
            <Icone nome="busca" className="pointer-events-none absolute top-3 left-3 size-4 text-texto-3" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título ou cliente"
              className="h-10 w-full rounded-md border border-borda bg-superficie pr-3 pl-9 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2">
            <input type="checkbox" checked={soMinhas} onChange={(e) => setSoMinhas(e.target.checked)} className="size-4 accent-primaria" />
            Só as minhas
          </label>
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>

      {!atual ? (
        <p className="px-4 py-6 text-pequeno text-texto-3 lg:px-8">Carregando funil…</p>
      ) : !atual.lista.length ? (
        <EstadoVazio
          icone="funil"
          titulo="Nenhuma oportunidade ainda"
          acao={<Botao icone="mais" onClick={() => setAbertura({})}>Criar a primeira</Botao>}
        >
          O agente cria oportunidades quando percebe interesse na conversa. Você também pode criar à mão.
        </EstadoVazio>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto px-4 pt-4 pb-6 lg:px-8">
          <div className="flex h-full gap-3">
            {atual.etapas.map((etapa) => {
              const cartoes = visiveis.filter((o) => o.etapa_id === etapa.id)
              const total = cartoes.reduce((s, o) => s + (o.valor_estimado ?? 0), 0)
              return (
                <section
                  key={etapa.id}
                  aria-label={`Etapa ${etapa.nome}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setSobre(etapa.id)
                  }}
                  onDragLeave={() => setSobre((s) => (s === etapa.id ? null : s))}
                  onDrop={(e) => soltar(e, etapa)}
                  className={`flex h-full w-72 shrink-0 flex-col rounded-lg border bg-slate-100 transition-colors ${
                    sobre === etapa.id && arrastando ? 'border-primaria bg-primaria-suave' : 'border-transparent'
                  }`}
                >
                  <header className="px-3 pt-3 pb-2">
                    <p className="flex items-center justify-between gap-2 font-semibold">
                      <span className="flex items-center gap-1.5">
                        {etapa.tipo === 'ganho' && <Icone nome="check" className="size-4 text-primaria" />}
                        {etapa.tipo === 'perdido' && <Icone nome="fechar" className="size-4 text-erro" />}
                        {etapa.nome}
                      </span>
                      <span className="rounded-full bg-superficie px-2 text-legenda font-medium text-texto-2">{cartoes.length}</span>
                    </p>
                    <p className="text-legenda text-texto-3">
                      {total > 0 ? moeda(total) : 'Sem valor'}
                      {etapa.tipo !== 'aberta' && ` · últimos ${DIAS_FECHADAS} dias`}
                    </p>
                  </header>
                  <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                    {cartoes.map((o) => {
                      const resp = nomeResp(o.responsavel_id)
                      return (
                        <li
                          key={o.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', o.id)
                            e.dataTransfer.effectAllowed = 'move'
                            setArrastando(o.id)
                          }}
                          onDragEnd={() => {
                            setArrastando(null)
                            setSobre(null)
                          }}
                          className={`rounded-md border border-borda bg-superficie shadow-sm ${arrastando === o.id ? 'opacity-50' : ''}`}
                        >
                          <button onClick={() => setAbertura({ oportunidade: o })} className="block w-full cursor-grab p-3 text-left active:cursor-grabbing">
                            <span className="block font-medium">{o.titulo}</span>
                            <span className="mt-0.5 block truncate text-pequeno text-texto-3">{nomeDoContato(o.contato)}</span>
                            <span className="mt-2 flex items-center gap-2 text-legenda text-texto-3">
                              {o.valor_estimado != null && <span className="font-medium text-texto-2">{moeda(o.valor_estimado)}</span>}
                              <span className="ml-auto">{haQuanto(o.atualizado_em)}</span>
                              {resp && <Avatar nome={resp} tamanho="sm" />}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                    {!cartoes.length && <li className="px-2 py-4 text-center text-legenda text-texto-3">Nada aqui</li>}
                  </ul>
                  {etapa.tipo === 'aberta' && (
                    <button
                      onClick={() => setAbertura({ etapaInicial: etapa.id })}
                      className="m-2 mt-0 flex items-center justify-center gap-1 rounded-md py-2 text-pequeno text-texto-2 hover:bg-superficie"
                    >
                      <Icone nome="mais" className="size-4" /> Adicionar
                    </button>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      )}

      {abertura && atual && (
        <ModalOportunidade
          aberto
          etapas={atual.etapas}
          oportunidade={abertura.oportunidade}
          etapaInicial={abertura.etapaInicial}
          aoFechar={() => setAbertura(null)}
          aoSalvar={() => {
            setAbertura(null)
            recarregar()
          }}
        />
      )}
    </div>
  )
}
