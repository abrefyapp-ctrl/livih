import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { listarNumerosVisiveis } from '../services/atendimento'
import { listarModelos, modeloDeExemplo, partesDe, variaveisDe, type Modelo } from '../services/modelos'
import {
  buscarConfigAvisos,
  CONFIG_AVISOS_PADRAO,
  ROTULO_FONTE_AVISO,
  salvarConfigAvisos,
  SITUACOES_AVISO,
  type ConfigAvisos,
  type FonteAviso,
  type VariavelAviso,
} from '../services/pedidoAvisos'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Icone } from './Icone'

const CLASSE_SELECT = 'h-9 rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none'

/** Modelo que serve para o aviso: aprovado, sem mídia nem variável no cabeçalho (a mesma regra da retomada). */
const usavel = (m: Modelo) => {
  const cab = m.components.find((c) => c.type === 'HEADER')
  return (
    !modeloDeExemplo(m) &&
    m.status === 'APPROVED' &&
    m.category !== 'AUTHENTICATION' &&
    (!cab || (cab.format === 'TEXT' && !/\{\{/.test(cab.text ?? '')))
  )
}

/**
 * Configurações → Aviso de pedidos (módulo ERP): mensagem ao cliente quando o pedido muda de situação. Dono e admin
 * ligam, escolhem as situações e o texto; no número da API oficial, o modelo para quando passaram as 24 horas.
 */
export function SecaoAvisosPedido() {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const podeEditar = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [salvo, setSalvo] = useState<{ orgId: string; cfg: ConfigAvisos } | null>(null)
  const [cfg, setCfg] = useState<ConfigAvisos>(CONFIG_AVISOS_PADRAO)
  const [oficial, setOficial] = useState<{ modelos: Modelo[] | null; erro: string | null } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    let ativo = true
    buscarConfigAvisos(orgId)
      .then((c) => {
        if (!ativo) return
        setSalvo({ orgId, cfg: c })
        setCfg(c)
      })
      .catch(() => ativo && setErro('Não foi possível carregar o aviso de pedidos. Recarregue a página.'))
    listarNumerosVisiveis(orgId)
      .then((n) => {
        const meta = n.find((x) => x.tipo === 'meta')
        if (!ativo || !meta) return
        setOficial({ modelos: null, erro: null })
        listarModelos(orgId, meta.id)
          .then((l) => ativo && setOficial({ modelos: l.filter(usavel), erro: null }))
          .catch((e) => ativo && setOficial({ modelos: [], erro: (e as Error).message }))
      })
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId])

  if (!salvo || salvo.orgId !== orgId) return erro ? <Aviso tom="erro">{erro}</Aviso> : <p className="text-pequeno text-texto-3">Carregando…</p>

  const alterado = JSON.stringify(cfg) !== JSON.stringify(salvo.cfg)
  const mudar = (c: Partial<ConfigAvisos>) => {
    setCfg((x) => ({ ...x, ...c }))
    setOk(false)
  }
  const modeloAtual = oficial?.modelos?.find((m) => m.name === cfg.modelo?.nome) ?? null
  const numerosVar = cfg.modelo ? variaveisDe(cfg.modelo.corpo) : []
  const variaveisOk = !cfg.modelo || cfg.modelo.variaveis.every((v) => v.fonte !== 'fixo' || v.valor?.trim())
  const textosOk = cfg.situacoes.every((s) => cfg.textos[s].trim())

  function escolherModelo(nome: string) {
    const m = oficial?.modelos?.find((x) => x.name === nome)
    if (!m) return mudar({ modelo: null })
    const p = partesDe(m)
    // Como no modelo pronto "Atualização do pedido": {{1}} nome, {{2}} número do pedido, {{3}} situação.
    const padrao: VariavelAviso[] = [{ fonte: 'nome', padrao: 'cliente' }, { fonte: 'pedido' }, { fonte: 'situacao' }]
    const variaveis = variaveisDe(p.corpo).map((_, i) => padrao[i] ?? { fonte: 'fixo' as FonteAviso, valor: '' })
    mudar({
      modelo: { nome: m.name, idioma: m.language, categoria: m.category, cabecalho: p.cabecalho, corpo: p.corpo, rodape: p.rodape, variaveis },
    })
  }

  function mudarVariavel(i: number, v: VariavelAviso) {
    if (!cfg.modelo) return
    mudar({ modelo: { ...cfg.modelo, variaveis: cfg.modelo.variaveis.map((x, j) => (j === i ? v : x)) } })
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    try {
      await salvarConfigAvisos(orgId, cfg)
      setSalvo({ orgId, cfg })
      setOk(true)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-h2 font-semibold">Aviso de pedidos</h2>
        <p className="mt-1 max-w-2xl text-pequeno text-texto-3">
          Quando alguém da equipe muda a situação de um pedido, a Livih avisa o cliente pelo WhatsApp, na conversa mais recente
          dele. Mudanças feitas pelo agente não geram aviso, porque ele já está conversando com o cliente. O que aconteceu com
          cada aviso aparece na tela do pedido.
        </p>
      </div>

      {!podeEditar && <Aviso tom="info">Só o dono e o admin mudam o aviso de pedidos.</Aviso>}

      <fieldset disabled={!podeEditar} className="space-y-4 rounded-lg border border-borda bg-superficie p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={cfg.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} className="mt-1 size-4 accent-primaria" />
          <span>
            <span className="block font-medium">Avisar o cliente quando o pedido muda de situação</span>
            <span className="block text-pequeno text-texto-3">Desligado, nenhuma mensagem sai.</span>
          </span>
        </label>

        {cfg.ativo && (
          <>
            <div className="space-y-3">
              <p className="text-pequeno font-medium text-texto-2">Avisar quando o pedido fica</p>
              {SITUACOES_AVISO.map((s) => {
                const marcada = cfg.situacoes.includes(s.id)
                return (
                  <div key={s.id} className="space-y-1.5">
                    <label className="flex cursor-pointer items-center gap-2 text-pequeno">
                      <input
                        type="checkbox"
                        checked={marcada}
                        onChange={(e) =>
                          mudar({
                            situacoes: e.target.checked
                              ? SITUACOES_AVISO.map((x) => x.id).filter((x) => x === s.id || cfg.situacoes.includes(x))
                              : cfg.situacoes.filter((x) => x !== s.id),
                          })
                        }
                        className="size-4 accent-primaria"
                      />
                      <span className="font-medium">{s.rotulo}</span>
                    </label>
                    {marcada && (
                      <>
                        <label htmlFor={`aviso-${s.id}`} className="sr-only">
                          Texto do aviso de {s.rotulo.toLowerCase()}
                        </label>
                        <textarea
                          id={`aviso-${s.id}`}
                          value={cfg.textos[s.id]}
                          maxLength={1000}
                          rows={2}
                          onChange={(e) => mudar({ textos: { ...cfg.textos, [s.id]: e.target.value } })}
                          className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none"
                        />
                      </>
                    )}
                  </div>
                )
              })}
              <p className="text-legenda text-texto-3">
                Use {'{nome}'} para o primeiro nome do cliente e {'{numero}'} para o número do pedido. Cada situação avisa uma vez
                por pedido.
              </p>
            </div>

            {oficial && (
              <div className="space-y-2 rounded-md border border-borda p-3">
                <p className="text-pequeno font-medium text-texto">Número da API oficial: depois de 24 horas sem o cliente escrever</p>
                <p className="text-legenda text-texto-3">
                  O WhatsApp só deixa enviar um modelo aprovado, cobrado pela Meta da sua empresa. Sem modelo, o aviso não sai e o
                  pedido mostra o motivo. O modelo pronto “Atualização do pedido” está em{' '}
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
                    aria-label="Modelo do aviso"
                    value={cfg.modelo?.nome ?? ''}
                    onChange={(e) => escolherModelo(e.target.value)}
                    className={`${CLASSE_SELECT} w-full max-w-md`}
                  >
                    <option value="">Sem modelo (o aviso não sai depois de 24 horas)</option>
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
                      const v = cfg.modelo!.variaveis[i] ?? { fonte: 'fixo' as FonteAviso, valor: '' }
                      return (
                        <div key={n} className="grid gap-2 sm:grid-cols-[6rem_12rem_1fr] sm:items-end">
                          <span className="text-legenda font-medium text-texto-2">{`{{${n}}}`}</span>
                          <select
                            aria-label={`Variável ${n}`}
                            value={v.fonte}
                            onChange={(e) => mudarVariavel(i, { fonte: e.target.value as FonteAviso, valor: '' })}
                            className={CLASSE_SELECT}
                          >
                            {(Object.keys(ROTULO_FONTE_AVISO) as FonteAviso[]).map((f) => (
                              <option key={f} value={f}>
                                {ROTULO_FONTE_AVISO[f]}
                              </option>
                            ))}
                          </select>
                          {v.fonte === 'fixo' ? (
                            <CampoTexto rotulo="Texto" value={v.valor ?? ''} maxLength={200} onChange={(e) => mudarVariavel(i, { ...v, valor: e.target.value })} />
                          ) : v.fonte === 'nome' || v.fonte === 'empresa' ? (
                            <CampoTexto
                              rotulo={v.fonte === 'nome' ? 'Se o contato não tiver nome' : 'Se não tiver empresa'}
                              value={v.padrao ?? ''}
                              maxLength={200}
                              placeholder={v.fonte === 'nome' ? 'cliente' : 'sua empresa'}
                              onChange={(e) => mudarVariavel(i, { ...v, padrao: e.target.value })}
                            />
                          ) : (
                            <p className="text-legenda text-texto-3">
                              {v.fonte === 'pedido' ? 'Ex.: 1234' : 'Ex.: confirmado, em separação, saiu para entrega, entregue'}
                            </p>
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
              {cfg.ativo ? 'Salvo. Vale para as próximas mudanças de situação.' : 'Salvo. O aviso está desligado.'}
            </span>
          )}
          {alterado && (
            <>
              <Botao variante="secundario" onClick={() => (setCfg(salvo.cfg), setErro(null))} disabled={salvando}>
                Descartar
              </Botao>
              <Botao onClick={() => void salvar()} carregando={salvando} disabled={!variaveisOk || !textosOk}>
                Salvar
              </Botao>
            </>
          )}
        </div>
      )}
    </section>
  )
}
