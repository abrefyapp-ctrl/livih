import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listarNumerosVisiveis } from '../services/atendimento'
import { ROTULO_FONTE, type FonteVariavel, type VariavelCampanha } from '../services/campanhas'
import { buscarFollowup, CONFIG_PADRAO, salvarFollowup, type ConfigFollowup } from '../services/followup'
import { listarModelos, partesDe, variaveisDe, type Modelo } from '../services/modelos'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Icone } from './Icone'

const CLASSE_SELECT = 'h-9 rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none'
const HORAS = [4, 12, 24, 48, 72]
const DIAS = [2, 3, 5, 7, 14]
const INTERVALOS = [1, 2, 3, 5, 7]

/** Modelo que serve para a retomada: aprovado, sem mídia nem variável no cabeçalho. */
const usavel = (m: Modelo) => {
  const cab = m.components.find((c) => c.type === 'HEADER')
  return m.status === 'APPROVED' && m.category !== 'AUTHENTICATION' && (!cab || (cab.format === 'TEXT' && !/\{\{/.test(cab.text ?? '')))
}

/** Um caso da retomada: liga/desliga e o tempo de espera. */
function Caso({
  rotulo,
  ajuda,
  valor,
  opcoes,
  unidade,
  padrao,
  aoMudar,
}: {
  rotulo: string
  ajuda: string
  valor: number | null
  opcoes: number[]
  unidade: 'horas' | 'dias'
  padrao: number
  aoMudar: (v: number | null) => void
}) {
  return (
    <div className="flex flex-wrap items-start gap-3 py-2.5">
      <input
        type="checkbox"
        checked={valor != null}
        onChange={(e) => aoMudar(e.target.checked ? padrao : null)}
        aria-label={rotulo}
        className="mt-0.5 size-4 shrink-0 accent-primaria"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-pequeno font-medium text-texto">{rotulo}</span>
        <span className="block text-legenda text-texto-3">{ajuda}</span>
      </span>
      {valor != null && (
        <label className="flex items-center gap-1.5 text-legenda text-texto-2">
          depois de
          <select value={valor} onChange={(e) => aoMudar(Number(e.target.value))} className={CLASSE_SELECT}>
            {[...new Set([...opcoes, valor])].sort((a, b) => a - b).map((n) => (
              <option key={n} value={n}>
                {n} {unidade === 'horas' ? (n === 1 ? 'hora' : 'horas') : n === 1 ? 'dia' : 'dias'}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

/**
 * Retomada do cliente pelo agente (docs/crm-acompanhamento.md, entrega 2): liga, escolhe os casos e o tempo de cada
 * um, o intervalo da 2ª tentativa e, para número da API oficial, o modelo aprovado de fora das 24 horas. Salva à
 * parte do resto do agente.
 */
export function SecaoFollowup({ podeEditar }: { podeEditar: boolean }) {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const [salvo, setSalvo] = useState<{ orgId: string; cfg: ConfigFollowup } | null>(null)
  const [cfg, setCfg] = useState<ConfigFollowup>(CONFIG_PADRAO)
  const [oficial, setOficial] = useState<{ canalId: string; modelos: Modelo[] | null; erro: string | null } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    let ativo = true
    buscarFollowup(orgId)
      .then((c) => {
        if (!ativo) return
        setSalvo({ orgId, cfg: c })
        setCfg(c)
      })
      .catch(() => ativo && setErro('Não foi possível carregar a retomada.'))
    listarNumerosVisiveis(orgId)
      .then((n) => {
        const meta = n.find((x) => x.tipo === 'meta')
        if (!ativo || !meta) return
        setOficial({ canalId: meta.id, modelos: null, erro: null })
        listarModelos(orgId, meta.id)
          .then((l) => ativo && setOficial({ canalId: meta.id, modelos: l.filter(usavel), erro: null }))
          .catch((e) => ativo && setOficial({ canalId: meta.id, modelos: [], erro: (e as Error).message }))
      })
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId])

  if (!salvo || salvo.orgId !== orgId) return erro ? <Aviso tom="erro">{erro}</Aviso> : null

  const alterado = JSON.stringify(cfg) !== JSON.stringify(salvo.cfg)
  const mudar = (c: Partial<ConfigFollowup>) => {
    setCfg((x) => ({ ...x, ...c }))
    setOk(false)
  }
  const modeloAtual = oficial?.modelos?.find((m) => m.name === cfg.modelo?.nome) ?? null
  const numerosVar = cfg.modelo ? variaveisDe(cfg.modelo.corpo) : []
  const variaveisOk = !cfg.modelo || cfg.modelo.variaveis.every((v) => v.fonte !== 'fixo' || v.valor?.trim())

  function escolherModelo(nome: string) {
    const m = oficial?.modelos?.find((x) => x.name === nome)
    if (!m) return mudar({ modelo: null })
    const p = partesDe(m)
    // {{1}} costuma ser o nome do cliente e {{2}} o nome da empresa (como no modelo pronto "Retomar a conversa").
    const variaveis: VariavelCampanha[] = variaveisDe(p.corpo).map((_, i) =>
      i === 0 ? { fonte: 'nome', padrao: 'cliente' } : { fonte: 'fixo', valor: i === 1 ? (orgAtiva?.nome ?? '') : '' },
    )
    mudar({
      modelo: { nome: m.name, idioma: m.language, categoria: m.category, cabecalho: p.cabecalho, corpo: p.corpo, rodape: p.rodape, variaveis },
    })
  }

  function mudarVariavel(i: number, v: VariavelCampanha) {
    if (!cfg.modelo) return
    mudar({ modelo: { ...cfg.modelo, variaveis: cfg.modelo.variaveis.map((x, j) => (j === i ? v : x)) } })
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    try {
      await salvarFollowup(orgId, cfg)
      setSalvo({ orgId, cfg })
      setOk(true)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section aria-labelledby="titulo-followup" className="space-y-4 rounded-lg border border-borda bg-superficie p-4">
      <div>
        <h3 id="titulo-followup" className="text-h3 font-semibold">
          Retomar o cliente que parou de responder
        </h3>
        <p className="text-pequeno text-texto-3">
          O agente escreve sozinho ao cliente que sumiu, no tom dele e sem pressão, e não manda se a conversa já tinha
          terminado. São no máximo 2 tentativas; sem resposta, vira tarefa para o vendedor. As retomadas aparecem em{' '}
          <Link to="/tarefas" className="font-medium text-primaria hover:underline">
            Tarefas
          </Link>
          , onde dá para cancelar.
        </p>
      </div>

      <fieldset disabled={!podeEditar} className="space-y-4">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input type="checkbox" checked={cfg.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} className="size-4 accent-primaria" />
          <span className="text-pequeno font-medium text-texto">Ligar a retomada pelo agente</span>
        </label>

        {cfg.ativo && (
          <>
            <div className="divide-y divide-borda rounded-md border border-borda px-3">
              <Caso
                rotulo="Orçamento sem resposta"
                ajuda="O PDF do orçamento foi enviado e o cliente não respondeu."
                valor={cfg.orcamento_horas}
                opcoes={HORAS}
                unidade="horas"
                padrao={24}
                aoMudar={(v) => mudar({ orcamento_horas: v })}
              />
              <Caso
                rotulo="Conversa parada"
                ajuda="A última mensagem foi nossa e o cliente não respondeu."
                valor={cfg.conversa_horas}
                opcoes={HORAS}
                unidade="horas"
                padrao={24}
                aoMudar={(v) => mudar({ conversa_horas: v })}
              />
              <Caso
                rotulo="Oportunidade parada"
                ajuda="Oportunidade aberta sem nenhuma mensagem, de nenhum lado."
                valor={cfg.oportunidade_dias}
                opcoes={DIAS}
                unidade="dias"
                padrao={3}
                aoMudar={(v) => mudar({ oportunidade_dias: v })}
              />
              <label className="flex cursor-pointer items-start gap-3 py-2.5">
                <input
                  type="checkbox"
                  checked={cfg.pedido_cliente}
                  onChange={(e) => mudar({ pedido_cliente: e.target.checked })}
                  className="mt-0.5 size-4 shrink-0 accent-primaria"
                />
                <span>
                  <span className="block text-pequeno font-medium text-texto">Quando o cliente pedir para falar depois</span>
                  <span className="block text-legenda text-texto-3">
                    “Me chama semana que vem”: o agente marca a data e retoma nela. Desligado, vira tarefa para a equipe.
                  </span>
                </span>
              </label>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={cfg.equipe}
                onChange={(e) => mudar({ equipe: e.target.checked })}
                className="mt-0.5 size-4 shrink-0 accent-primaria"
              />
              <span>
                <span className="block text-pequeno font-medium text-texto">Também nas conversas atendidas pela equipe</span>
                <span className="block text-legenda text-texto-3">
                  Quando a última mensagem foi de um vendedor. Ele recebe um aviso no celular, e a resposta do cliente vai
                  para ele.
                </span>
              </span>
            </label>

            <label className="flex flex-wrap items-center gap-2 text-pequeno text-texto-2">
              2ª tentativa, se o cliente não responder à 1ª:
              <select value={cfg.intervalo_dias} onChange={(e) => mudar({ intervalo_dias: Number(e.target.value) })} className={CLASSE_SELECT}>
                {INTERVALOS.map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'dia' : 'dias'} depois
                  </option>
                ))}
              </select>
            </label>

            {oficial && (
              <div className="space-y-2 rounded-md border border-borda p-3">
                <p className="text-pequeno font-medium text-texto">Número da API oficial: depois de 24 horas sem o cliente escrever</p>
                <p className="text-legenda text-texto-3">
                  O WhatsApp só deixa enviar um modelo aprovado, cobrado pela Meta da sua empresa. Sem modelo, a retomada
                  vira tarefa para o vendedor. O modelo pronto “Retomar a conversa” está em{' '}
                  <Link to="/configuracoes/modelos" className="font-medium text-primaria hover:underline">
                    Modelos
                  </Link>
                  .
                </p>
                {oficial.erro && <Aviso tom="erro">{oficial.erro}</Aviso>}
                {oficial.modelos === null ? (
                  <p className="text-legenda text-texto-3">Carregando modelos…</p>
                ) : (
                  <select
                    aria-label="Modelo de retomada"
                    value={cfg.modelo?.nome ?? ''}
                    onChange={(e) => escolherModelo(e.target.value)}
                    className={`${CLASSE_SELECT} w-full max-w-md`}
                  >
                    <option value="">Sem modelo (vira tarefa para o vendedor)</option>
                    {cfg.modelo && !modeloAtual && <option value={cfg.modelo.nome}>{cfg.modelo.nome}</option>}
                    {oficial.modelos.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
                {cfg.modelo && (
                  <>
                    <p className="rounded-md bg-fundo p-2 text-legenda whitespace-pre-line text-texto-2">{cfg.modelo.corpo}</p>
                    {numerosVar.map((n, i) => {
                      const v = cfg.modelo!.variaveis[i] ?? { fonte: 'fixo' as FonteVariavel, valor: '' }
                      return (
                        <div key={n} className="grid gap-2 sm:grid-cols-[6rem_12rem_1fr] sm:items-end">
                          <span className="text-legenda font-medium text-texto-2">{`{{${n}}}`}</span>
                          <select
                            aria-label={`Variável ${n}`}
                            value={v.fonte}
                            onChange={(e) => mudarVariavel(i, { fonte: e.target.value as FonteVariavel, valor: '' })}
                            className={CLASSE_SELECT}
                          >
                            {(Object.keys(ROTULO_FONTE) as FonteVariavel[]).map((f) => (
                              <option key={f} value={f}>
                                {ROTULO_FONTE[f]}
                              </option>
                            ))}
                          </select>
                          {v.fonte === 'fixo' ? (
                            <CampoTexto rotulo="Texto" value={v.valor ?? ''} maxLength={200} onChange={(e) => mudarVariavel(i, { ...v, valor: e.target.value })} />
                          ) : (
                            <CampoTexto
                              rotulo={v.fonte === 'nome' ? 'Se o contato não tiver nome' : 'Se não tiver empresa'}
                              value={v.padrao ?? ''}
                              maxLength={200}
                              placeholder={v.fonte === 'nome' ? 'cliente' : 'sua empresa'}
                              onChange={(e) => mudarVariavel(i, { ...v, padrao: e.target.value })}
                            />
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </fieldset>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {podeEditar && (alterado || ok) && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {ok && !alterado && (
            <span className="mr-auto flex items-center gap-1 text-pequeno text-primaria">
              <Icone nome="check" className="size-4" />
              {cfg.ativo ? 'Salvo. Vale para o que parar de andar a partir de agora.' : 'Salvo. A retomada está desligada.'}
            </span>
          )}
          {alterado && (
            <>
              <Botao variante="secundario" onClick={() => (setCfg(salvo.cfg), setErro(null))} disabled={salvando}>
                Descartar
              </Botao>
              <Botao onClick={() => void salvar()} carregando={salvando} disabled={!variaveisOk}>
                Salvar a retomada
              </Botao>
            </>
          )}
        </div>
      )}
    </section>
  )
}
