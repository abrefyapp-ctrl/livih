import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { moeda } from '../services/formato'
import {
  apagarItem,
  apagarOrdem,
  buscarOrdem,
  carregarConfiguracao,
  data,
  diasEntre,
  hojeIso,
  listarPrazosClientes,
  ROTULO_COBRANCA,
  ROTULO_DESFECHO,
  todasAsEtapas,
  type ConfiguracaoOs,
  type EtapaOs,
  type ItemOs,
  type Ordem,
  type PassoOs,
} from '../services/os'
import { conversaDoCliente, type ConversaEnvio } from '../services/orcamento'
import { enviarPdfOsWhatsapp, gerarPdfOs, montarPdfOs, nomeArquivoOs, type DadosPdfOs } from '../services/orcamentoOs'
import { supabase } from '../services/supabaseClient'
import { VisualizadorPdf } from '../components/VisualizadorPdf'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { DialogoConfirmacao } from '../components/DialogoConfirmacao'
import type { ReactNode } from 'react'
import { EstadoVazio } from '../components/EstadoVazio'
import { Icone } from '../components/Icone'
import { ModalDesfecho, ModalFaturar, ModalItem, ModalMover, ModalOrdem, ModalPagamento } from '../components/ModaisOs'

type Dados = {
  id: string
  ordem: Ordem
  itens: ItemOs[]
  historico: PassoOs[]
  cfg: ConfiguracaoOs
  todas: EtapaOs[]
  prazo: number
  previsao: Map<string, { finaliza_em: string; parado: boolean }>
}
type Acao =
  | { tipo: 'mover' | 'desfecho' | 'faturar' | 'pagamento'; itens: ItemOs[] }
  | { tipo: 'item'; item?: ItemOs }
  | { tipo: 'ordem' }
  | { tipo: 'apagarItem'; item: ItemOs }
  | { tipo: 'apagarOrdem' }

export function OrdemServicoDetalhe() {
  const { id } = useParams()
  const { orgAtiva, modulos, equipe } = useSessao()
  const navegar = useNavigate()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [dados, setDados] = useState<Dados | null | undefined>(undefined)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [selecao, setSelecao] = useState<Set<string>>(new Set())
  const [acao, setAcao] = useState<Acao | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [pdf, setPdf] = useState<{ dados: DadosPdfOs | null; arquivo: Blob | null; erro: string | null } | null>(null)
  const [envio, setEnvio] = useState<ConversaEnvio | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    if (!id) return
    let ativo = true
    Promise.all([buscarOrdem(id), carregarConfiguracao(orgId), todasAsEtapas(orgId), listarPrazosClientes(orgId), supabase.rpc('os_previsao_itens', { p_org: orgId })])
      .then(([achado, cfg, todas, prazos, previsao]) => {
        if (!ativo) return
        if (!achado) return setDados(null)
        const prazo = prazos.find((p) => p.contato_id === achado.ordem.contato_id)?.prazo_pagamento_dias ?? cfg.config.prazo_pagamento_dias
        setDados({ id, ...achado, cfg, todas, prazo, previsao: new Map((previsao.data ?? []).map((p) => [p.item_id, p])) })
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar a OS.'))
    return () => {
      ativo = false
    }
  }, [id, orgId, versao])

  const atual = dados && dados.id === id ? dados : dados === null ? null : undefined
  const etapaPorId = useMemo(() => new Map(atual?.todas.map((e) => [e.id, e]) ?? []), [atual])
  const tipoPorId = useMemo(() => new Map(atual?.cfg.tipos.map((t) => [t.id, t]) ?? []), [atual])
  const recarregar = () => {
    setAcao(null)
    setSelecao(new Set())
    setVersao((v) => v + 1)
  }

  if (modulos && !modulos.has('os')) {
    return <EstadoVazio icone="ferramenta" titulo="Ordens de serviço não está ligado nesta empresa" />
  }
  if (atual === null) {
    return (
      <EstadoVazio icone="ferramenta" titulo="OS não encontrada" acao={<Link to="/os" className="text-primaria hover:underline">Voltar às ordens de serviço</Link>}>
        Ela pode ter sido apagada.
      </EstadoVazio>
    )
  }

  // PDF dos selecionados; sem seleção, dos itens que seguem no processo (encerrado não vai, a não ser que seja tudo).
  async function abrirPdf() {
    if (!atual) return
    const escolhidos = atual.itens.filter((i) => selecao.has(i.id))
    const vivos = atual.itens.filter((i) => !i.desfecho)
    const itens = escolhidos.length ? escolhidos : vivos.length ? vivos : atual.itens
    setErro(null)
    setEnviado(false)
    setPdf({ dados: null, arquivo: null, erro: null })
    try {
      const dados = await montarPdfOs(orgId, atual.ordem, itens, atual.cfg, atual.prazo)
      setPdf({ dados, arquivo: await gerarPdfOs(dados), erro: null })
    } catch {
      setPdf({ dados: null, arquivo: null, erro: 'Não foi possível gerar o PDF. Feche e tente de novo.' })
    }
  }

  function baixarPdf() {
    if (!pdf?.dados || !pdf.arquivo) return
    const url = URL.createObjectURL(pdf.arquivo)
    const a = document.createElement('a')
    a.href = url
    a.download = nomeArquivoOs(pdf.dados)
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  // Antes de confirmar, explica por que não dá (sem contato, sem conversa, janela da API oficial).
  async function pedirEnvio() {
    const contatoId = atual?.ordem.contato_id
    if (!contatoId) return setErro('O cliente desta OS não é um contato do Livih: baixe o PDF e mande por outro canal.')
    try {
      const conversa = await conversaDoCliente(contatoId)
      if (!conversa) return setErro('O cliente ainda não tem conversa no Livih. Comece uma em Conversas → Nova conversa, ou baixe o PDF.')
      if (conversa.janelaFechada)
        return setErro(
          `Faz mais de 24 horas que o cliente escreveu no número ${conversa.numero} (API oficial): só dá para retomar com um modelo aprovado. Depois que o cliente responder, o PDF pode ir.`,
        )
      setEnvio(conversa)
    } catch {
      setErro('Não foi possível achar a conversa do cliente.')
    }
  }

  async function enviarWhatsapp() {
    if (!envio || !pdf?.dados || !pdf.arquivo) return
    setEnviando(true)
    try {
      await enviarPdfOsWhatsapp(orgId, envio.id, pdf.dados, pdf.arquivo)
      setEnviado(true)
      setPdf(null)
    } catch {
      setErro('O PDF não foi enviado. Confira a conexão e tente de novo.')
    } finally {
      setEnviando(false)
      setEnvio(null)
    }
  }

  const selecionados = atual?.itens.filter((i) => selecao.has(i.id)) ?? []
  const alvo = selecionados.length ? selecionados : (atual?.itens ?? [])
  const abertos = alvo.filter((i) => !i.desfecho)
  const faturaveis = alvo.filter((i) => i.cobranca === 'cobrado' && (!i.desfecho || i.faturado_em))
  const recebiveis = alvo.filter((i) => i.faturado_em)
  const o = atual?.ordem
  const total = atual?.itens.filter((i) => i.cobranca === 'cobrado').reduce((s, i) => s + i.valor, 0) ?? 0

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 lg:px-8">
        <Link to="/os" className="inline-flex items-center gap-1 text-pequeno text-texto-2 hover:text-texto">
          <Icone nome="voltar" className="size-4" /> Ordens de serviço
        </Link>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {enviado && <Aviso>PDF enviado na conversa do cliente.</Aviso>}
        {!atual || !o ? (
          !erro && <p className="text-pequeno text-texto-3">Carregando…</p>
        ) : (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-h1 font-semibold">OS nº {o.numero}</h1>
                <p className="text-corpo text-texto-2">
                  {o.contato_id ? (
                    <Link to={`/contatos/${o.contato_id}`} className="font-medium text-primaria hover:underline">
                      {o.cliente_nome ?? 'Cliente'}
                    </Link>
                  ) : (
                    <span className="font-medium">{o.cliente_nome ?? 'Sem cliente'}</span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Botao variante="secundario" icone="arquivo" onClick={() => void abrirPdf()} disabled={!atual.itens.length}>
                  PDF{selecao.size ? ` (${selecao.size})` : ''}
                </Botao>
                <Botao variante="secundario" icone="nota" onClick={() => setAcao({ tipo: 'ordem' })}>
                  Editar
                </Botao>
                {gerencia && (
                  <Botao variante="fantasma" icone="lixeira" onClick={() => setAcao({ tipo: 'apagarOrdem' })}>
                    Apagar
                  </Botao>
                )}
              </div>
            </header>

            <dl className="grid gap-3 rounded-lg border border-borda bg-superficie p-4 text-pequeno sm:grid-cols-4">
              <Dado rotulo="Recebida em" valor={data(o.recebida_em)} />
              <Dado rotulo="NF do cliente" valor={o.nf_cliente} />
              <Dado rotulo="OS do cliente" valor={o.numero_cliente} />
              <Dado rotulo="Responsável" valor={o.responsavel_id ? (equipe.get(o.responsavel_id)?.nome ?? 'Equipe') : null} />
              <Dado rotulo="Itens" valor={String(atual.itens.length)} />
              <Dado rotulo="Total cobrado" valor={moeda(total, true)} />
              <Dado rotulo="Prazo de pagamento" valor={`${atual.prazo} dias`} />
              {o.observacao && (
                <div className="sm:col-span-4">
                  <dt className="text-legenda text-texto-3">Observação</dt>
                  <dd className="whitespace-pre-line">{o.observacao}</dd>
                </div>
              )}
            </dl>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  Itens {selecao.size > 0 && <span className="font-normal text-texto-3">· {selecao.size} selecionados</span>}
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Botao tamanho="sm" variante="secundario" onClick={() => setAcao({ tipo: 'mover', itens: abertos })} disabled={!abertos.length}>
                    Mover {selecao.size ? 'selecionados' : 'todos'}
                  </Botao>
                  {gerencia && (
                    <>
                      <Botao tamanho="sm" variante="secundario" onClick={() => setAcao({ tipo: 'faturar', itens: faturaveis })} disabled={!faturaveis.length}>
                        Faturar
                      </Botao>
                      <Botao tamanho="sm" variante="secundario" onClick={() => setAcao({ tipo: 'pagamento', itens: recebiveis })} disabled={!recebiveis.length}>
                        Pagamento recebido
                      </Botao>
                    </>
                  )}
                  <Botao tamanho="sm" icone="mais" onClick={() => setAcao({ tipo: 'item' })}>
                    Item
                  </Botao>
                </div>
              </div>

              {!atual.itens.length ? (
                <div className="rounded-lg border border-borda bg-superficie">
                  <EstadoVazio icone="ferramenta" titulo="OS sem itens">Adicione o que chegou para conserto.</EstadoVazio>
                </div>
              ) : (
                <ul className="space-y-2">
                  {atual.itens.map((i) => {
                    const etapa = etapaPorId.get(i.etapa_id)
                    const tipo = i.tipo_id ? tipoPorId.get(i.tipo_id) : undefined
                    const p = atual.previsao.get(i.id)
                    const passos = atual.historico.filter((h) => h.item_id === i.id)
                    const vencido = i.vencimento_em && !i.pago_em && i.vencimento_em < hojeIso()
                    return (
                      <li key={i.id} className={`rounded-lg border bg-superficie ${p?.parado && !i.desfecho ? 'border-atencao/60' : 'border-borda'}`}>
                        <div className="flex gap-3 p-4">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${i.modelo ?? 'item'}`}
                            checked={selecao.has(i.id)}
                            onChange={(e) => {
                              const s = new Set(selecao)
                              if (e.target.checked) s.add(i.id)
                              else s.delete(i.id)
                              setSelecao(s)
                            }}
                            className="mt-1 size-4 shrink-0 accent-primaria"
                          />
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium">{i.modelo || tipo?.nome || 'Item'}</p>
                                <p className="text-pequeno text-texto-3">
                                  {[tipo?.nome, i.identificacao && `${tipo?.rotulo_identificacao ?? 'Nº de série'} ${i.identificacao}`].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                              <div className="text-right">
                                {i.desfecho ? (
                                  <span className="inline-flex rounded-sm bg-erro-suave px-1.5 py-0.5 text-legenda font-medium text-erro">
                                    {ROTULO_DESFECHO[i.desfecho]} · {data(i.desfecho_em, true)}
                                  </span>
                                ) : (
                                  <span className={`inline-flex rounded-sm px-1.5 py-0.5 text-legenda font-medium ${p?.parado ? 'bg-atencao-suave text-atencao' : 'bg-primaria-suave text-primaria'}`}>
                                    {etapa?.nome ?? '—'} · há {diasEntre(i.etapa_desde, hojeIso())} dias
                                  </span>
                                )}
                                {!i.desfecho && p && etapa?.marco !== 'entregue' && p.finaliza_em > hojeIso() && (
                                  <p className="mt-0.5 text-legenda text-texto-3">pronto por volta de {data(p.finaliza_em)} (estimativa)</p>
                                )}
                              </div>
                            </div>

                            {tipo && tipo.campos.some((c) => i.campos[c.chave]) && (
                              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-pequeno">
                                {tipo.campos.filter((c) => i.campos[c.chave]).map((c) => (
                                  <div key={c.chave} className="flex gap-1">
                                    <dt className="text-texto-3">{c.rotulo}:</dt>
                                    <dd>{c.tipo === 'data' ? data(i.campos[c.chave]) : i.campos[c.chave]}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}

                            <p className="flex flex-wrap gap-x-4 gap-y-1 text-pequeno">
                              <span className="font-medium tabular-nums">{i.cobranca === 'cobrado' ? moeda(i.valor, true) : ROTULO_COBRANCA[i.cobranca]}</span>
                              {i.faturado_em && <span className="text-texto-2">Faturado {data(i.faturado_em)}</span>}
                              {i.vencimento_em && !i.pago_em && (
                                <span className={vencido ? 'font-medium text-erro' : 'text-texto-2'}>
                                  {vencido ? 'Venceu' : 'Vence'} {data(i.vencimento_em)}
                                </span>
                              )}
                              {i.pago_em && <span className="text-primaria">Pago {data(i.pago_em)}</span>}
                            </p>
                            {i.observacao && <p className="text-pequeno whitespace-pre-line text-texto-2">{i.observacao}</p>}

                            <div className="flex flex-wrap items-center gap-1">
                              {!i.desfecho && (
                                <Botao tamanho="sm" variante="secundario" onClick={() => setAcao({ tipo: 'mover', itens: [i] })}>
                                  Mover
                                </Botao>
                              )}
                              <Botao tamanho="sm" variante="fantasma" onClick={() => setAcao({ tipo: 'desfecho', itens: [i] })}>
                                {i.desfecho ? 'Reabrir' : 'Encerrar'}
                              </Botao>
                              <Botao tamanho="sm" variante="fantasma" onClick={() => setAcao({ tipo: 'item', item: i })}>
                                Editar
                              </Botao>
                              {gerencia && (
                                <Botao tamanho="sm" variante="fantasma" onClick={() => setAcao({ tipo: 'apagarItem', item: i })}>
                                  Apagar
                                </Botao>
                              )}
                              <button
                                type="button"
                                aria-expanded={aberto === i.id}
                                onClick={() => setAberto(aberto === i.id ? null : i.id)}
                                className="ml-auto flex items-center gap-1 text-legenda text-texto-2 hover:text-texto"
                              >
                                Histórico ({passos.length})
                                <Icone nome="abaixo" className={`size-3.5 transition-transform ${aberto === i.id ? 'rotate-180' : ''}`} />
                              </button>
                            </div>
                            {aberto === i.id && (
                              <ol className="space-y-1 border-l-2 border-borda pl-3 text-pequeno">
                                {passos.map((h, n) => {
                                  const proxima = passos[n + 1]?.data ?? (i.desfecho ? null : hojeIso())
                                  const d = proxima ? diasEntre(h.data, proxima) : null
                                  return (
                                    <li key={h.id} className="flex flex-wrap gap-x-2">
                                      <span className="w-20 tabular-nums text-texto-3">{data(h.data)}</span>
                                      <span className="font-medium">{etapaPorId.get(h.etapa_para)?.nome ?? 'Etapa removida'}</span>
                                      {d != null && <span className="text-texto-3">{d} {d === 1 ? 'dia' : 'dias'}</span>}
                                      <span className="text-legenda text-texto-3">
                                        {h.importado ? 'importado' : h.autor_id ? (equipe.get(h.autor_id)?.nome ?? '') : ''}
                                      </span>
                                    </li>
                                  )
                                })}
                              </ol>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      <VisualizadorPdf
        aberto={!!pdf}
        titulo={pdf?.dados ? `${pdf.dados.tipo} · OS nº ${pdf.dados.ordem.numero}` : 'PDF da OS'}
        arquivo={pdf?.arquivo ?? null}
        erro={pdf?.erro}
        aoFechar={() => setPdf(null)}
        acoes={
          <>
            <Botao variante="secundario" icone="baixar" disabled={!pdf?.arquivo} onClick={baixarPdf}>
              Baixar
            </Botao>
            <Botao icone="enviar" disabled={!pdf?.arquivo} onClick={() => void pedirEnvio()}>
              Enviar pelo WhatsApp
            </Botao>
          </>
        }
      />
      <DialogoConfirmacao
        aberto={!!envio}
        titulo="Enviar o PDF pelo WhatsApp?"
        rotuloConfirmar="Enviar PDF"
        carregando={enviando}
        aoConfirmar={() => void enviarWhatsapp()}
        aoCancelar={() => setEnvio(null)}
      >
        {pdf?.dados?.tipo} da OS nº {o?.numero} vai para {o?.cliente_nome ?? 'o cliente'} pelo número {envio?.numero}. Fica no histórico
        da conversa e você assume o atendimento.
      </DialogoConfirmacao>

      {atual && acao?.tipo === 'mover' && <ModalMover itens={acao.itens} etapas={atual.cfg.etapas} aoFechar={() => setAcao(null)} aoSalvar={recarregar} />}
      {atual && acao?.tipo === 'desfecho' && <ModalDesfecho itens={acao.itens} aoFechar={() => setAcao(null)} aoSalvar={recarregar} />}
      {atual && acao?.tipo === 'faturar' && <ModalFaturar itens={acao.itens} prazoDias={atual.prazo} aoFechar={() => setAcao(null)} aoSalvar={recarregar} />}
      {atual && acao?.tipo === 'pagamento' && <ModalPagamento itens={acao.itens} aoFechar={() => setAcao(null)} aoSalvar={recarregar} />}
      {atual && acao?.tipo === 'item' && (
        <ModalItem
          orgId={orgId}
          osId={atual.ordem.id}
          cfg={atual.cfg}
          item={acao.item}
          proximaOrdem={Math.max(-1, ...atual.itens.map((i) => i.ordem)) + 1}
          aoFechar={() => setAcao(null)}
          aoSalvar={recarregar}
        />
      )}
      {atual && acao?.tipo === 'ordem' && <ModalOrdem orgId={orgId} cfg={atual.cfg} ordem={atual.ordem} aoFechar={() => setAcao(null)} aoSalvar={recarregar} />}
      {atual && acao?.tipo === 'apagarItem' && (
        <Confirmar
          titulo="Apagar item?"
          rotulo="Apagar"
          aoCancelar={() => setAcao(null)}
          aoConfirmar={async () => {
            await apagarItem(acao.item.id)
            recarregar()
          }}
        >
          O item e o histórico dele somem. Para o que não foi aprovado ou não teve conserto, prefira Encerrar.
        </Confirmar>
      )}
      {atual && acao?.tipo === 'apagarOrdem' && (
        <Confirmar
          titulo={`Apagar a OS nº ${atual.ordem.numero}?`}
          rotulo="Apagar OS"
          aoCancelar={() => setAcao(null)}
          aoConfirmar={async () => {
            await apagarOrdem(atual.ordem.id)
            navegar('/os')
          }}
        >
          Os {atual.itens.length} itens e o histórico deles somem junto.
        </Confirmar>
      )}
    </div>
  )
}

/** Confirmação de apagar: espera o banco e mostra o erro sem fechar. */
function Confirmar({ titulo, rotulo, children, aoConfirmar, aoCancelar }: {
  titulo: string
  rotulo: string
  children: ReactNode
  aoConfirmar: () => Promise<void>
  aoCancelar: () => void
}) {
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  return (
    <DialogoConfirmacao
      aberto
      titulo={titulo}
      rotuloConfirmar={rotulo}
      perigo
      carregando={carregando}
      aoCancelar={aoCancelar}
      aoConfirmar={async () => {
        setCarregando(true)
        setErro(null)
        try {
          await aoConfirmar()
        } catch (e) {
          setErro((e as Error).message)
          setCarregando(false)
        }
      }}
    >
      <p>{children}</p>
      {erro && <div className="mt-3"><Aviso tom="erro">{erro}</Aviso></div>}
    </DialogoConfirmacao>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-legenda text-texto-3">{rotulo}</dt>
      <dd className="font-medium">{valor || '—'}</dd>
    </div>
  )
}
