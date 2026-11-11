import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { GraficoTempoResposta } from '../components/GraficoTempoResposta'
import { Icone } from '../components/Icone'
import { ModalRelatorioPiloto } from '../components/ModalRelatorioPiloto'
import { useEquipe } from '../hooks/useEquipe'
import { useSessao } from '../hooks/useSessao'
import { perdasPorMotivo, type PerdaPorMotivo } from '../services/crm'
import { equipeQueGerencia, listarEquipes, listarLugares, type Equipe, type LugarNaEquipe } from '../services/equipes'
import { moeda } from '../services/formato'
import {
  buscarPendencias,
  buscarProspeccao,
  buscarResumo,
  listarNumerosAtivos,
  duracao,
  horasEconomizadas,
  MINUTOS_PADRAO,
  porcentagem,
  salvarConfig,
  type Pendencias,
  type Prospeccao,
  type Resumo,
} from '../services/painel'

const PERIODOS = [
  { dias: 7, rotulo: 'Últimos 7 dias' },
  { dias: 30, rotulo: 'Últimos 30 dias' },
  { dias: 90, rotulo: 'Últimos 90 dias' },
]

const desde = (iso: string | null) => {
  if (!iso) return 'nunca'
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000
  return h < 24 ? `há ${Math.max(1, Math.round(h))} h` : `há ${Math.round(h / 24)} dias`
}

/**
 * Painel: os números da operação no período, comparados com o período anterior (docs/painel-relatorio-piloto.md).
 * Dono/admin veem a empresa e filtram por número, equipe e vendedor; o gestor de equipe vê a equipe dele e filtra os
 * vendedores dela; atendente vê a própria carteira.
 */
export function Painel() {
  const { orgAtiva, modulos, sessao } = useSessao()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const pessoas = useEquipe(orgId)
  const [dias, setDias] = useState(7)
  const [canal, setCanal] = useState('')
  const [vendedor, setVendedor] = useState('')
  const [equipeFiltro, setEquipeFiltro] = useState('')
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [lugares, setLugares] = useState<Map<string, LugarNaEquipe>>(new Map())
  const [numeros, setNumeros] = useState<{ id: string; nome: string }[]>([])
  const [dados, setDados] = useState<{
    chave: string
    resumo: Resumo
    pendencias: Pendencias
    perdas: PerdaPorMotivo[]
    prospeccao: Prospeccao | null
  } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [relatorio, setRelatorio] = useState(false)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let ativo = true
    listarNumerosAtivos(orgId)
      .then((lista) => ativo && setNumeros(lista))
      .catch(() => undefined)
    // Equipes (migration 20261110210000); sem elas, o Painel funciona como antes.
    listarEquipes(orgId)
      .then((lista) => ativo && setEquipes(lista))
      .catch(() => undefined)
    listarLugares(orgId)
      .then((mapa) => ativo && setLugares(mapa))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId])

  // Gestor de equipe: o banco já limita os números à equipe dele; aqui só a lista de vendedores para filtrar.
  const minhaEquipe = gerencia ? new Set<string>() : equipeQueGerencia(lugares, sessao?.user.id)
  const gestor = minhaEquipe.size > 0
  const vendedoresDoFiltro = gerencia
    ? equipeFiltro
      ? pessoas.filter((m) => lugares.get(m.user_id)?.equipe_id === equipeFiltro)
      : pessoas
    : pessoas.filter((m) => minhaEquipe.has(m.user_id))

  const chave = `${orgId}|${dias}|${canal}|${vendedor}|${equipeFiltro}|${versao}`
  useEffect(() => {
    let ativo = true
    const ate = new Date()
    const de = new Date(ate.getTime() - dias * 864e5)
    const filtro = { canal: canal || null, vendedor: vendedor || null, equipe: equipeFiltro || null }
    Promise.all([
      buscarResumo(orgId, de, ate, filtro),
      buscarPendencias(orgId, filtro),
      // Perdas por motivo (migration 20261105170000); se falhar, o resto do Painel aparece igual.
      perdasPorMotivo(orgId, de, ate, filtro.vendedor, filtro.equipe).catch(() => []),
      // Contatos ativos (migration 20261111100000); se falhar, o resto do Painel aparece igual.
      buscarProspeccao(orgId, de, ate, filtro).catch(() => null),
    ])
      .then(([resumo, pendencias, perdas, prospeccao]) =>
        ativo && (setDados({ chave, resumo, pendencias, perdas, prospeccao }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar o painel.'))
    return () => {
      ativo = false
    }
  }, [orgId, dias, canal, vendedor, equipeFiltro, chave])

  const atual = dados?.chave === chave ? dados : null
  const r = atual?.resumo
  const a = r?.atual
  const ant = r?.anterior
  const minutos = r?.config?.minutos_por_resposta ?? MINUTOS_PADRAO

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-semibold">Painel</h1>
            <p className="text-pequeno text-texto-3">
              {gerencia
                ? 'Atendimento, leads e negociações da empresa.'
                : gestor
                  ? 'Atendimento, leads e negociações da sua equipe.'
                  : 'O seu atendimento, os seus leads e as suas negociações.'}{' '}
              Comparado com o período anterior.
            </p>
          </div>
          {gerencia && (
            <Botao variante="secundario" icone="arquivo" onClick={() => setRelatorio(true)}>
              Relatório de resultados
            </Botao>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Seletor rotulo="Período" valor={String(dias)} aoMudar={(v) => setDias(Number(v))}
            opcoes={PERIODOS.map((p) => [String(p.dias), p.rotulo])} />
          {numeros.length > 1 && (
            <Seletor rotulo="Número" valor={canal} aoMudar={setCanal} opcoes={[['', 'Todos os números'], ...numeros.map((n) => [n.id, n.nome] as [string, string])]} />
          )}
          {gerencia && equipes.length > 0 && (
            <Seletor rotulo="Equipe" valor={equipeFiltro} aoMudar={(v) => (setEquipeFiltro(v), setVendedor(''))}
              opcoes={[['', 'Todas as equipes'], ...equipes.map((e) => [e.id, e.nome] as [string, string])]} />
          )}
          {(gerencia || gestor) && vendedoresDoFiltro.length > 1 && (
            <Seletor rotulo="Vendedor" valor={vendedor} aoMudar={setVendedor}
              opcoes={[['', gerencia && !equipeFiltro ? 'Toda a empresa' : 'Toda a equipe'],
                ...vendedoresDoFiltro.map((m) => [m.user_id, m.nome || m.email] as [string, string])]} />
          )}
        </div>

        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {!a || !ant ? (
          !erro && <p className="text-pequeno text-texto-3">Calculando…</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Cartao
                titulo="Tempo até a primeira resposta"
                valor={duracao(a.resposta.geral.mediana_seg)}
                detalhe={`${a.resposta.geral.pct_5min ?? 0}% respondidos em até 5 min`}
                variacao={variacao(a.resposta.geral.mediana_seg, ant.resposta.geral.mediana_seg, 'menor')}
              />
              <Cartao
                titulo="Clientes sem resposta"
                valor={String(atual!.pendencias.sem_resposta.length)}
                detalhe="há mais de 1 hora, agora"
                alerta={atual!.pendencias.sem_resposta.length > 0}
              />
              <Cartao
                titulo="Leads novos"
                valor={String(a.leads.novos)}
                detalhe={`${porcentagem(a.leads.com_oportunidade, a.leads.novos) ?? 0}% viraram oportunidade`}
                variacao={variacao(a.leads.novos, ant.leads.novos, 'maior')}
              />
              <Cartao
                titulo="Oportunidades que avançaram"
                valor={String(a.funil.mudancas)}
                detalhe={`${a.funil.ganhas} ganhas · ${a.funil.perdidas} perdidas`}
                variacao={variacao(a.funil.mudancas, ant.funil.mudancas, 'maior')}
              />
            </div>

            <Secao titulo="Tempo até a primeira resposta" subtitulo="Do primeiro pedido do cliente até a primeira resposta do agente ou da equipe.">
              <div className="grid gap-3 text-pequeno sm:grid-cols-4">
                <Mini rotulo="Agente" valor={duracao(a.resposta.agente.mediana_seg)} detalhe={`${a.resposta.agente.n} respostas · ${a.resposta.agente.pct_5min ?? 0}% em 5 min`} />
                <Mini rotulo="Equipe" valor={duracao(a.resposta.equipe.mediana_seg)} detalhe={`${a.resposta.equipe.n} respostas · ${a.resposta.equipe.pct_5min ?? 0}% em 5 min`} />
                <Mini rotulo="Dentro do horário" valor={duracao(a.resposta.dentro_horario.mediana_seg)} detalhe={`${a.resposta.dentro_horario.n} pedidos`} />
                <Mini rotulo="Fora do horário" valor={duracao(a.resposta.fora_horario.mediana_seg)} detalhe={`${a.resposta.fora_horario.n} pedidos`} />
              </div>
              <GraficoTempoResposta dias={a.resposta.por_dia} />
            </Secao>

            <div className="grid gap-5 lg:grid-cols-2">
              <Secao titulo="Agente de IA">
                <div className="grid gap-3 text-pequeno sm:grid-cols-3">
                  <Mini rotulo="Conversas atendidas" valor={String(a.agente.conversas)} />
                  <Mini
                    rotulo="Resolvidas sem a equipe"
                    valor={`${porcentagem(a.agente.conversas - a.agente.passadas, a.agente.conversas) ?? 0}%`}
                    detalhe={`${a.agente.passadas} passadas à equipe`}
                  />
                  <Mini
                    rotulo="Horas economizadas"
                    valor={`${horasEconomizadas(a.agente.respostas, minutos).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`}
                    detalhe={`estimativa: ${a.agente.respostas} respostas × ${minutos.toLocaleString('pt-BR')} min`}
                  />
                </div>
                {gerencia && <MinutosPorResposta orgId={orgId} valor={minutos} aoSalvar={() => setVersao((v) => v + 1)} />}
                {a.agente.motivos.length > 0 && (
                  <div>
                    <p className="text-legenda font-semibold tracking-wide text-texto-3 uppercase">Últimos motivos de chamar a equipe</p>
                    <ul className="mt-1 space-y-1 text-pequeno text-texto-2">
                      {a.agente.motivos.map((m, i) => (
                        <li key={i} className="line-clamp-2">• {m}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Secao>

              <Secao titulo="Funil" subtitulo="Oportunidades abertas agora, por etapa.">
                <div className="grid gap-3 text-pequeno sm:grid-cols-3">
                  <Mini rotulo="Criadas no período" valor={String(a.funil.criadas)} />
                  <Mini rotulo="Ganhas" valor={String(a.funil.ganhas)} detalhe={a.funil.valor_ganho ? moeda(a.funil.valor_ganho) : undefined} />
                  <Mini rotulo="Perdidas" valor={String(a.funil.perdidas)} />
                </div>
                <Etapas etapas={a.funil.etapas} />
                {atual!.perdas.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-legenda font-semibold tracking-wide text-texto-3 uppercase">Perdas do período por motivo</p>
                    <Perdas perdas={atual!.perdas} />
                  </div>
                )}
              </Secao>
            </div>

            {modulos?.has('erp') && a.pedidos && (
              <Secao titulo="Orçamentos e pedidos">
                <div className="grid gap-3 text-pequeno sm:grid-cols-4">
                  <Mini rotulo="Orçamentos criados" valor={String(a.pedidos.criados)} detalhe={`${a.pedidos.pelo_agente} pelo agente`} />
                  <Mini rotulo="Pedidos confirmados" valor={String(a.pedidos.confirmados)} />
                  <Mini rotulo="Valor confirmado" valor={moeda(a.pedidos.valor_confirmado)} />
                </div>
              </Secao>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <Secao titulo="Clientes sem resposta" subtitulo="Escreveram há mais de 1 hora e ainda não tiveram resposta.">
                {atual!.pendencias.sem_resposta.length ? (
                  <ul className="divide-y divide-borda rounded-md border border-borda">
                    {atual!.pendencias.sem_resposta.map((p) => (
                      <li key={p.conversa_id}>
                        <Link to={`/conversas/${p.conversa_id}`} className="flex items-center gap-2 px-3 py-2 text-pequeno hover:bg-fundo">
                          <span className="min-w-0 flex-1 truncate font-medium">{p.contato ?? 'Sem nome'}</span>
                          <span className="text-legenda text-texto-3">{p.numero} · {desde(p.desde)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Tudo>Nenhum cliente esperando.</Tudo>
                )}
              </Secao>
              <Secao titulo="Oportunidades sem retorno" subtitulo="Abertas e sem mensagem nossa há mais de 3 dias.">
                {atual!.pendencias.sem_retorno.length ? (
                  <ul className="divide-y divide-borda rounded-md border border-borda">
                    {atual!.pendencias.sem_retorno.map((o) => (
                      <li key={o.oportunidade_id}>
                        <Link to={`/contatos/${o.contato_id}`} className="flex items-center gap-2 px-3 py-2 text-pequeno hover:bg-fundo">
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">{o.titulo}</span>
                            <span className="text-texto-3"> · {o.contato ?? 'Sem nome'}</span>
                          </span>
                          <span className="text-legenda text-texto-3">{o.etapa} · {desde(o.ultimo_contato)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Tudo>Todas as oportunidades abertas tiveram retorno.</Tudo>
                )}
              </Secao>
            </div>

            {atual!.prospeccao && <ContatosAtivos p={atual!.prospeccao} dias={dias} />}

            {a.vendedores && a.vendedores.length > 0 && (
              <Secao titulo="Por vendedor">
                <div className="overflow-x-auto rounded-md border border-borda">
                  <table className="w-full text-pequeno">
                    <thead className="bg-fundo text-left text-legenda text-texto-3 uppercase">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Pessoa</th>
                        <th className="px-3 py-1.5 text-right font-medium">Conversas</th>
                        <th className="px-3 py-1.5 text-right font-medium">Respostas a pedidos</th>
                        <th className="px-3 py-1.5 text-right font-medium">Tempo de resposta</th>
                        <th className="px-3 py-1.5 text-right font-medium">Oportunidades abertas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borda">
                      {a.vendedores.map((v) => (
                        <tr key={v.user_id}>
                          <td className="px-3 py-1.5">{v.nome}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{v.conversas}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{v.respostas}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{duracao(v.mediana_seg)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{v.oportunidades_abertas}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Secao>
            )}
          </>
        )}
      </div>
      {relatorio && <ModalRelatorioPiloto orgId={orgId} config={r?.config ?? null} aoFechar={() => (setRelatorio(false), setVersao((v) => v + 1))} />}
    </div>
  )
}

/**
 * Contatos ativos: o vendedor puxou a conversa com quem não falava com a empresa havia 30 dias (pedido da CEFEQ,
 * docs/equipes-origem-prospeccao.md, entrega 5). A campanha fica à parte, porque é envio em massa.
 */
function ContatosAtivos({ p, dias }: { p: Prospeccao; dias: number }) {
  const a = p.atual
  const v = variacao(a.total, p.anterior.total, 'maior')
  const porDia = (n: number) => (n / dias).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return (
    <Secao
      titulo="Contatos ativos"
      subtitulo="Mensagens que a equipe mandou primeiro, pelo celular ou pela Livih, para quem não falava com a empresa havia 30 dias. Nos primeiros 30 dias de um número na Livih, entra também quem já falava com o vendedor antes."
    >
      <div className="grid gap-3 text-pequeno sm:grid-cols-4">
        <Mini rotulo="No período" valor={String(a.total)} detalhe={`${a.hoje} hoje · ${porDia(a.total)} por dia${v ? ` · ${v.texto}` : ''}`} />
        <Mini rotulo="Responderam" valor={`${porcentagem(a.responderam, a.total) ?? 0}%`} detalhe={`${a.responderam} em até 7 dias`} />
        <Mini rotulo="Viraram oportunidade" valor={`${porcentagem(a.oportunidades, a.total) ?? 0}%`} detalhe={`${a.oportunidades} em até 30 dias`} />
        {a.campanha && a.campanha.enviadas > 0 && (
          <Mini rotulo="Campanhas (à parte)" valor={String(a.campanha.enviadas)} detalhe={`enviadas · ${a.campanha.responderam} responderam`} />
        )}
      </div>
      {a.vendedores && a.vendedores.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-borda">
          <table className="w-full text-pequeno">
            <thead className="bg-fundo text-left text-legenda text-texto-3 uppercase">
              <tr>
                <th className="px-3 py-1.5 font-medium">Pessoa</th>
                <th className="px-3 py-1.5 text-right font-medium">Hoje</th>
                <th className="px-3 py-1.5 text-right font-medium">No período</th>
                <th className="px-3 py-1.5 text-right font-medium">Por dia</th>
                <th className="px-3 py-1.5 text-right font-medium">Responderam</th>
                <th className="px-3 py-1.5 text-right font-medium">Viraram oportunidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {a.vendedores.map((x) => (
                <tr key={x.user_id}>
                  <td className="px-3 py-1.5">{x.nome}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{x.hoje}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{x.total}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{porDia(x.total)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{x.responderam}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{x.oportunidades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!!a.sem_vendedor && (
        <p className="text-legenda text-texto-3">
          {a.sem_vendedor} pelo celular de um número sem responsável (entram no total, sem vendedor). Defina o responsável do
          número em WhatsApp.
        </p>
      )}
    </Secao>
  )
}

/** Variação contra o período anterior, já dizendo se foi para melhor. */
function variacao(atual: number | null, anterior: number | null, melhor: 'maior' | 'menor') {
  if (atual == null || anterior == null || anterior === 0) return null
  const pct = Math.round(((atual - anterior) / anterior) * 100)
  if (pct === 0) return { texto: 'igual ao período anterior', bom: null }
  return { texto: `${pct > 0 ? '+' : ''}${pct}% vs. período anterior`, bom: melhor === 'maior' ? pct > 0 : pct < 0 }
}

function Seletor({ rotulo, valor, aoMudar, opcoes }: { rotulo: string; valor: string; aoMudar: (v: string) => void; opcoes: [string, string][] }) {
  return (
    <label className="flex items-center gap-2 text-pequeno text-texto-2">
      <span className="sr-only">{rotulo}</span>
      <select
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className="h-9 rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none"
      >
        {opcoes.map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </select>
    </label>
  )
}

function Cartao({ titulo, valor, detalhe, variacao: v, alerta }: {
  titulo: string
  valor: string
  detalhe?: string
  variacao?: { texto: string; bom: boolean | null } | null
  alerta?: boolean
}) {
  return (
    <div className={`rounded-lg border bg-superficie p-4 ${alerta ? 'border-atencao/50' : 'border-borda'}`}>
      <p className="text-legenda font-medium text-texto-3">{titulo}</p>
      <p className={`mt-1 text-h1 font-semibold tabular-nums ${alerta ? 'text-atencao' : 'text-texto'}`}>{valor}</p>
      {detalhe && <p className="text-legenda text-texto-2">{detalhe}</p>}
      {v && (
        <p className={`mt-1 flex items-center gap-1 text-legenda font-medium ${v.bom == null ? 'text-texto-3' : v.bom ? 'text-primaria' : 'text-erro'}`}>
          {v.bom != null && <Icone nome={v.bom ? 'check' : 'alerta'} className="size-3.5" />}
          {v.texto}
        </p>
      )}
    </div>
  )
}

function Mini({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div>
      <p className="text-legenda text-texto-3">{rotulo}</p>
      <p className="font-semibold tabular-nums">{valor}</p>
      {detalhe && <p className="text-legenda text-texto-3">{detalhe}</p>}
    </div>
  )
}

function Secao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
      <div>
        <h2 className="font-semibold">{titulo}</h2>
        {subtitulo && <p className="text-legenda text-texto-3">{subtitulo}</p>}
      </div>
      {children}
    </section>
  )
}

function Tudo({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-pequeno text-primaria">
      <Icone nome="check" className="size-4" /> {children}
    </p>
  )
}

/** Abertas por etapa: uma série só (sem legenda), barra proporcional e o número ao lado. */
function Etapas({ etapas }: { etapas: Resumo['atual']['funil']['etapas'] }) {
  const max = Math.max(1, ...etapas.map((e) => e.abertas))
  if (!etapas.length) return null
  return (
    <ul className="space-y-1.5">
      {etapas.map((e) => (
        <li key={e.nome} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-pequeno">
          <span className="truncate text-texto-2">{e.nome}</span>
          <span className="h-3 rounded-sm bg-fundo">
            <span className="block h-3 rounded-r-sm" style={{ width: `${(e.abertas / max) * 100}%`, background: '#0d9488' }} />
          </span>
          <span className="w-24 text-right tabular-nums">
            {e.abertas}
            {e.valor > 0 && <span className="text-legenda text-texto-3"> · {moeda(e.valor)}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Perdas({ perdas }: { perdas: PerdaPorMotivo[] }) {
  const max = Math.max(1, ...perdas.map((p) => p.quantidade))
  return (
    <ul className="space-y-1.5">
      {perdas.map((p) => (
        <li key={p.motivo} className="grid grid-cols-[9rem_1fr_auto] items-center gap-2 text-pequeno">
          <span className="truncate text-texto-2" title={p.motivo}>{p.motivo}</span>
          <span className="h-3 rounded-sm bg-fundo">
            <span className="block h-3 rounded-r-sm bg-erro/70" style={{ width: `${(p.quantidade / max) * 100}%` }} />
          </span>
          <span className="w-24 text-right tabular-nums">
            {p.quantidade}
            {p.valor > 0 && <span className="text-legenda text-texto-3"> · {moeda(p.valor)}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function MinutosPorResposta({ orgId, valor, aoSalvar }: { orgId: string; valor: number; aoSalvar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(String(valor).replace('.', ','))
  const numero = Number(texto.replace(',', '.'))
  if (!editando)
    return (
      <button type="button" onClick={() => setEditando(true)} className="text-legenda text-texto-3 underline hover:text-texto">
        Ajustar o tempo por resposta da estimativa
      </button>
    )
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!(numero > 0 && numero <= 60)) return
        await salvarConfig(orgId, { minutos_por_resposta: numero })
        setEditando(false)
        aoSalvar()
      }}
      className="flex items-center gap-2 text-pequeno"
    >
      <label htmlFor="min-resposta" className="text-texto-2">
        Cada resposta do agente economiza
      </label>
      <input
        id="min-resposta"
        inputMode="decimal"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="h-8 w-16 rounded-md border border-borda px-2 text-right"
      />
      <span className="text-texto-2">min</span>
      <Botao tamanho="sm" type="submit" disabled={!(numero > 0 && numero <= 60)}>
        Salvar
      </Botao>
    </form>
  )
}
