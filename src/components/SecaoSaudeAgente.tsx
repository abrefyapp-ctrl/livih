import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { atualizarTextoAgente, listarBase, salvarConteudo, type Agente, type ConteudoBase } from '../services/configuracoes'
import {
  alertas,
  estimarCusto,
  faixa,
  limparCasos,
  limparSeparadores,
  medir,
  PARTE_FIXA,
  total,
  type Alerta,
  type AgenteSaude,
  type Faixa,
  type ParteId,
} from '../services/saudeAgente'
import { carregarUsoReal, type UsoReal } from '../services/saudeAgenteDados'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { Icone } from './Icone'

const casosDe = (a: Agente): string[] => {
  const r = a.regras_humano as { casos?: unknown } | null
  return Array.isArray(r?.casos) ? r.casos.filter((c): c is string => typeof c === 'string') : []
}

const mil = (n: number) => `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: n < 10_000 ? 1 : 0 })} mil`
const reais = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: v < 1 ? 3 : 2, maximumFractionDigits: v < 1 ? 3 : 2 })

const FAIXAS: Record<Faixa, { rotulo: string; cor: string; texto: string }> = {
  verde: { rotulo: 'Leve', cor: 'bg-primaria-suave text-primaria', texto: 'O agente lê pouco por resposta.' },
  amarelo: { rotulo: 'Moderado', cor: 'bg-atencao-suave text-atencao', texto: 'Dá para enxugar: veja os alertas abaixo.' },
  vermelho: { rotulo: 'Pesado', cor: 'bg-erro-suave text-erro', texto: 'Respostas mais lentas e caras. Resolva os alertas abaixo.' },
}

const CORES: Record<ParteId, string> = {
  instrucoes: 'bg-primaria',
  regras: 'bg-verde-400',
  base: 'bg-petroleo',
  fixa: 'bg-slate-300',
  historico: 'bg-slate-400',
}

type Pendente = { alerta: Alerta; tipo: 'limpar' | 'desativar' }
type Desfazer = { descricao: string; desfazer: () => Promise<void> }

/**
 * Configurações → Agente, no topo: quanto o agente lê por resposta, o consumo real e os alertas com conserto de um
 * clique (docs/saude-do-agente.md). Dono/admin e a plataforma; o R$ só aparece para a plataforma.
 */
export function SecaoSaudeAgente({
  agente,
  formAlterado,
  aoAlterarAgente,
}: {
  agente: Agente
  /** Com o formulário de baixo alterado, os consertos ficam bloqueados (senão um sobrescreve o outro). */
  formAlterado: boolean
  aoAlterarAgente: (campos: Partial<Agente>) => void
}) {
  const { orgAtiva, adminPlataforma, modulos } = useSessao()
  const orgId = orgAtiva!.id
  const [base, setBase] = useState<{ orgId: string; lista: ConteudoBase[] } | null>(null)
  const [uso, setUso] = useState<{ orgId: string; dado: UsoReal } | null>(null)
  const [versao, setVersao] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, setPendente] = useState<Pendente | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [desfazer, setDesfazer] = useState<Desfazer | null>(null)
  const [aberto, setAberto] = useState(true)

  useEffect(() => {
    let ativo = true
    listarBase(orgId)
      .then((lista) => ativo && setBase({ orgId, lista }))
      .catch(() => ativo && setErro('Não foi possível carregar a base de conhecimento.'))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  useEffect(() => {
    let ativo = true
    carregarUsoReal(orgId)
      .then((dado) => ativo && setUso({ orgId, dado }))
      .catch(() => ativo && setUso(null))
    return () => {
      ativo = false
    }
  }, [orgId])

  const lista = base?.orgId === orgId ? base.lista : null
  const real = uso?.orgId === orgId ? uso.dado : null
  if (!lista) return erro ? <Aviso tom="erro">{erro}</Aviso> : null

  const saude: AgenteSaude = { prompt: agente.prompt, casos: casosDe(agente), ativo: agente.ativo }
  // Histórico: o que sobra do lido de fato depois do configurado (limitado, porque o real é da semana e o
  // configurado é de agora). Sem consumo, o padrão.
  const configurado = total(medir(saude, lista, 0)) - PARTE_FIXA
  const historico = real?.caracteresPorChamada ? Math.min(8000, Math.max(1000, real.caracteresPorChamada - configurado - PARTE_FIXA)) : undefined
  const partes = medir(saude, lista, historico)
  const lido = total(partes)
  const f = FAIXAS[faixa(lido)]
  const avisos = alertas(saude, lista)
  const chamadas = real?.chamadas ?? 1.6
  const respostasMes = real ? (real.respostas / 7) * 30 : 0
  const porMes = (caracteres: number) =>
    real?.usdEntrada != null ? estimarCusto(caracteres, chamadas, real.usdEntrada) * respostasMes : null

  async function aplicar() {
    if (!pendente) return
    const { alerta, tipo } = pendente
    setSalvando(true)
    setErro(null)
    try {
      const alvo = alerta.alvo
      if (tipo === 'limpar' && alvo?.tipo === 'prompt') {
        const anterior = agente.prompt
        await atualizarTextoAgente(agente.id, { prompt: limparSeparadores(anterior).texto })
        aoAlterarAgente({ prompt: limparSeparadores(anterior).texto })
        setDesfazer({
          descricao: 'Separadores removidos das instruções.',
          desfazer: async () => (await atualizarTextoAgente(agente.id, { prompt: anterior }), aoAlterarAgente({ prompt: anterior })),
        })
      } else if (tipo === 'limpar' && alvo?.tipo === 'regras') {
        const anterior = agente.regras_humano
        const regras = { ...((anterior as object) ?? {}), casos: limparCasos(casosDe(agente)).casos }
        await atualizarTextoAgente(agente.id, { regras_humano: regras })
        aoAlterarAgente({ regras_humano: regras })
        setDesfazer({
          descricao: 'Separadores removidos das regras de chamar a equipe.',
          desfazer: async () => (await atualizarTextoAgente(agente.id, { regras_humano: anterior }), aoAlterarAgente({ regras_humano: anterior })),
        })
      } else if (alvo?.tipo === 'base') {
        const item = lista!.find((b) => b.id === alvo.id)
        if (!item) return
        const campos = { titulo: item.titulo, conteudo: item.conteudo, ativo: item.ativo }
        const novo = tipo === 'limpar' ? { ...campos, conteudo: limparSeparadores(item.conteudo).texto } : { ...campos, ativo: false }
        await salvarConteudo(orgId, item.id, novo)
        setDesfazer({
          descricao: tipo === 'limpar' ? `Separadores removidos de “${item.titulo}”.` : `“${item.titulo}” desativado.`,
          desfazer: async () => (await salvarConteudo(orgId, item.id, campos), setVersao((v) => v + 1)),
        })
        setVersao((v) => v + 1)
      }
      setPendente(null)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function voltar() {
    if (!desfazer) return
    setSalvando(true)
    try {
      await desfazer.desfazer()
      setDesfazer(null)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section aria-labelledby="titulo-saude" id="saude" className="rounded-lg border border-borda bg-superficie">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
      >
        <h3 id="titulo-saude" className="font-semibold">
          Saúde do agente
        </h3>
        <span className={`rounded-sm px-1.5 py-0.5 text-legenda font-semibold ${f.cor}`}>{f.rotulo}</span>
        <span className="text-pequeno text-texto-3">
          ~{mil(lido)} caracteres por leitura
          {avisos.length > 0 && ` · ${avisos.length} ${avisos.length === 1 ? 'alerta' : 'alertas'}`}
        </span>
        <Icone nome="abaixo" className={`ml-auto size-4 text-texto-3 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div className="space-y-5 border-t border-borda px-4 py-4">
          <div className="space-y-2">
            <p className="text-pequeno text-texto-2">
              A cada resposta o agente lê tudo isto (às vezes mais de uma vez, quando consulta produtos). Quanto menos,
              mais rápido e mais barato. {f.texto}
            </p>
            <div className="flex h-3 overflow-hidden rounded-full bg-fundo" aria-hidden>
              {partes.map((p) => (
                <div key={p.id} className={CORES[p.id]} style={{ width: `${(p.caracteres / lido) * 100}%` }} />
              ))}
            </div>
            <ul className="grid gap-x-4 gap-y-1 text-legenda text-texto-2 sm:grid-cols-3">
              {partes.map((p) => (
                <li key={p.id} className="flex items-center gap-1.5">
                  <span className={`size-2.5 shrink-0 rounded-sm ${CORES[p.id]}`} aria-hidden />
                  {p.rotulo}: {mil(p.caracteres)}
                </li>
              ))}
            </ul>
          </div>

          {real && real.respostas > 0 && (
            <p className="text-pequeno text-texto-2">
              <span className="font-medium text-texto">Últimos 7 dias:</span> {real.respostas.toLocaleString('pt-BR')} respostas em{' '}
              {real.conversas.toLocaleString('pt-BR')} conversas
              {real.caracteresPorChamada != null && <>, lendo de fato ~{mil(real.caracteresPorChamada)} caracteres por leitura</>}
              {' '}e {real.chamadas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} leituras por resposta.
            </p>
          )}

          {adminPlataforma && real?.usdEntrada != null && (
            <div className="rounded-md bg-fundo px-3 py-2 text-pequeno">
              <p className="text-legenda font-semibold text-texto-3 uppercase">Só a plataforma vê</p>
              <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-4">
                <Valor rotulo="Estimado por resposta" valor={reais(estimarCusto(lido, chamadas, real.usdEntrada))} />
                <Valor rotulo="Real por resposta" valor={real.custoPorResposta != null ? reais(real.custoPorResposta) : '—'} />
                <Valor rotulo="Real por conversa" valor={real.custoPorConversa != null ? reais(real.custoPorConversa) : '—'} />
                <Valor rotulo="Projeção do mês" valor={real.projecaoMes != null ? reais(real.projecaoMes) : '—'} />
              </dl>
            </div>
          )}

          {erro && <Aviso tom="erro">{erro}</Aviso>}
          {desfazer && (
            <Aviso
              acao={
                <Botao tamanho="sm" variante="secundario" onClick={() => void voltar()} carregando={salvando}>
                  Desfazer
                </Botao>
              }
            >
              {desfazer.descricao}
            </Aviso>
          )}

          {avisos.length === 0 ? (
            <p className="flex items-center gap-1.5 text-pequeno text-primaria">
              <Icone nome="check" className="size-4" /> Nenhum alerta. O agente está enxuto.
            </p>
          ) : (
            <div className="space-y-2">
              {formAlterado && <Aviso tom="atencao">Salve ou descarte as alterações abaixo antes de usar os consertos.</Aviso>}
              <ul className="divide-y divide-borda rounded-md border border-borda">
                {avisos.map((a) => {
                  const economiaMes = a.economia ? porMes(a.economia) : null
                  return (
                    <li key={a.chave} className="space-y-1.5 px-3 py-2.5">
                      <p className="flex items-start gap-1.5 font-medium">
                        <Icone nome="alerta" className="mt-0.5 size-4 shrink-0 text-atencao" />
                        {a.titulo}
                      </p>
                      <p className="text-pequeno text-texto-2">{a.mensagem}</p>
                      {a.exemplos && a.exemplos.length > 0 && (
                        <ul className="space-y-0.5 text-legenda text-texto-3">
                          {a.exemplos.map((e) => (
                            <li key={e} className="truncate">
                              “{e}”
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {a.economia > 0 && (
                          <span className="text-legenda text-texto-3">
                            Economia: até {mil(a.economia)} caracteres por leitura ({Math.max(1, Math.round((a.economia / lido) * 100))}%)
                            {adminPlataforma && economiaMes != null && ` · ~${reais(economiaMes)}/mês`}
                          </span>
                        )}
                        <span className="ml-auto flex flex-wrap gap-2">
                          <AcaoAlerta
                            alerta={a}
                            bloqueado={formAlterado || salvando}
                            temProdutos={!!modulos?.has('erp')}
                            aoPedir={(tipo) => setPendente({ alerta: a, tipo })}
                          />
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <DialogoConfirmacao
        aberto={!!pendente}
        titulo={pendente?.tipo === 'limpar' ? 'Limpar separadores?' : 'Desativar conteúdo?'}
        rotuloConfirmar={pendente?.tipo === 'limpar' ? 'Limpar' : 'Desativar'}
        carregando={salvando}
        aoConfirmar={() => void aplicar()}
        aoCancelar={() => setPendente(null)}
      >
        {pendente && <Confirmacao pendente={pendente} agente={agente} base={lista} />}
      </DialogoConfirmacao>
    </section>
  )
}

function Valor({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-legenda text-texto-3">{rotulo}</dt>
      <dd className="font-semibold">{valor}</dd>
    </div>
  )
}

function AcaoAlerta({
  alerta,
  bloqueado,
  temProdutos,
  aoPedir,
}: {
  alerta: Alerta
  bloqueado: boolean
  temProdutos: boolean
  aoPedir: (tipo: 'limpar' | 'desativar') => void
}) {
  const alvo = alerta.alvo
  if (alerta.acao === 'limpar')
    return (
      <Botao tamanho="sm" onClick={() => aoPedir('limpar')} disabled={bloqueado}>
        Limpar
      </Botao>
    )
  if (alerta.acao === 'desativar')
    return (
      <Botao tamanho="sm" onClick={() => aoPedir('desativar')} disabled={bloqueado}>
        Desativar
      </Botao>
    )
  if (alerta.acao === 'produtos')
    return (
      <>
        {temProdutos && (
          <Link to="/produtos" className="inline-flex h-8 items-center rounded-md px-3 text-pequeno font-medium text-primaria ring-1 ring-borda ring-inset hover:bg-fundo">
            Ir para Produtos
          </Link>
        )}
        <Botao tamanho="sm" variante="secundario" onClick={() => aoPedir('desativar')} disabled={bloqueado}>
          Desativar
        </Botao>
      </>
    )
  if (alerta.acao === 'editar' && alvo?.tipo !== 'base' && alvo)
    return (
      <Botao
        tamanho="sm"
        variante="secundario"
        onClick={() => {
          const campo = document.getElementById(alvo.tipo === 'prompt' ? 'prompt' : 'novo-caso')
          campo?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          campo?.focus({ preventScroll: true })
        }}
      >
        Editar
      </Botao>
    )
  if (alerta.acao === 'editar' || alvo?.tipo === 'base')
    return (
      <Link to="/configuracoes/base" className="inline-flex h-8 items-center rounded-md px-3 text-pequeno font-medium text-texto-2 ring-1 ring-borda ring-inset hover:bg-fundo">
        Abrir a base
      </Link>
    )
  return null
}

function Confirmacao({ pendente, agente, base }: { pendente: Pendente; agente: Agente; base: ConteudoBase[] }) {
  const alvo = pendente.alerta.alvo
  const item = alvo?.tipo === 'base' ? base.find((b) => b.id === alvo.id) : null
  if (pendente.tipo === 'desativar')
    return (
      <p className="text-pequeno text-texto-2">
        “{item?.titulo}” fica inativo e o agente deixa de ler ({item?.conteudo.length.toLocaleString('pt-BR')} caracteres a
        menos por leitura). Ele continua na Base de conhecimento e dá para reativar quando quiser.
      </p>
    )
  const r =
    alvo?.tipo === 'prompt'
      ? limparSeparadores(agente.prompt)
      : alvo?.tipo === 'regras'
        ? limparCasos(casosDe(agente))
        : limparSeparadores(item?.conteudo ?? '')
  const amostra = [...new Set(r.linhas)].slice(0, 3)
  return (
    <div className="space-y-2 text-pequeno text-texto-2">
      <p>
        Saem {r.linhas.length.toLocaleString('pt-BR')} linhas só de decoração ({r.removidos.toLocaleString('pt-BR')} caracteres).
        Nenhuma palavra muda. Por exemplo:
      </p>
      <pre className="overflow-x-auto rounded-md bg-fundo px-3 py-2 text-legenda">{amostra.join('\n')}</pre>
      <p>Logo depois, dá para desfazer.</p>
    </div>
  )
}
