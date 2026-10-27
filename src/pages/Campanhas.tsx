import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import {
  acaoCampanha,
  listarCampanhas,
  ROTULO_STATUS,
  type Campanha,
  type Resumo,
  type StatusCampanha,
} from '../services/campanhas'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { DialogoConfirmacao } from '../components/DialogoConfirmacao'
import { EstadoVazio } from '../components/EstadoVazio'
import { ModalNovaCampanha } from '../components/ModalNovaCampanha'

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const pct = (n: number, de: number) => (de ? `${Math.round((n / de) * 100)}%` : '—')

function Numeros({ r }: { r: Resumo | null }) {
  if (!r) return <span className="text-texto-3">—</span>
  const itens: [string, string][] = [
    ['Enviadas', `${r.enviadas} de ${r.total - r.puladas}`],
    ['Entregues', `${r.entregues} (${pct(r.entregues, r.enviadas)})`],
    ['Lidas', `${r.lidas} (${pct(r.lidas, r.enviadas)})`],
    ['Respostas', `${r.respostas} (${pct(r.respostas, r.enviadas)})`],
    ['Orçamentos', String(r.orcamentos)],
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-pequeno sm:grid-cols-5">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo}>
          <dt className="text-legenda text-texto-3">{rotulo}</dt>
          <dd className="font-medium text-texto tabular-nums">{valor}</dd>
        </div>
      ))}
      {r.erros > 0 && <p className="col-span-full text-legenda text-erro">{r.erros} não foram entregues (número inválido ou sem WhatsApp).</p>}
    </dl>
  )
}

/** Campanhas de divulgação pela API oficial (docs/campanhas.md). Só dono e admin. */
export function Campanhas() {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [dados, setDados] = useState<{ orgId: string; lista: { campanha: Campanha; resumo: Resumo | null }[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [nova, setNova] = useState(false)
  const [versao, setVersao] = useState(0)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState<Campanha | null>(null)

  const lista = dados?.orgId === orgId ? dados.lista : null
  const emAndamento = !!lista?.some((l) => l.campanha.status === 'enviando' || l.campanha.status === 'agendada')

  useEffect(() => {
    if (!gerencia) return
    let ativo = true
    listarCampanhas(orgId)
      .then((l) => ativo && (setDados({ orgId, lista: l }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar as campanhas.'))
    return () => {
      ativo = false
    }
  }, [orgId, gerencia, versao])

  // Enquanto alguma campanha envia, os números andam: atualiza a cada 30 s.
  useEffect(() => {
    if (!emAndamento) return
    const t = setInterval(() => setVersao((v) => v + 1), 30_000)
    return () => clearInterval(t)
  }, [emAndamento])

  if (!gerencia) return <Navigate to="/conversas" replace />

  async function acao(id: string, a: 'pausar' | 'retomar' | 'cancelar') {
    setOcupado(id)
    setErro(null)
    try {
      await acaoCampanha(id, a)
      setVersao((v) => v + 1)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-semibold">Campanhas</h1>
            <p className="text-pequeno text-texto-3">
              Divulgação pelo WhatsApp oficial para os seus contatos, com modelo aprovado pela Meta. As respostas caem nas conversas.
            </p>
          </div>
          <Botao icone="mais" onClick={() => setNova(true)}>
            Nova campanha
          </Botao>
        </div>

        {erro && <Aviso tom="erro">{erro}</Aviso>}

        <div className="overflow-hidden rounded-lg border border-borda bg-superficie">
          {!lista ? (
            <p className="p-5 text-pequeno text-texto-3" aria-busy="true">
              Carregando campanhas…
            </p>
          ) : !lista.length ? (
            <EstadoVazio icone="enviar" titulo="Nenhuma campanha ainda"
              acao={<Botao icone="mais" onClick={() => setNova(true)}>Criar a primeira</Botao>}>
              Escolha quem recebe (por etiqueta, etapa do funil, vendedor ou tempo sem conversa), um modelo de Marketing aprovado e
              quando enviar.
            </EstadoVazio>
          ) : (
            <ul className="divide-y divide-borda">
              {lista.map(({ campanha: c, resumo }) => {
                const st = ROTULO_STATUS[c.status as StatusCampanha]
                return (
                  <li key={c.id} className="space-y-3 px-4 py-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={`rounded-sm px-1.5 py-0.5 text-legenda font-medium ${st?.cor ?? ''}`}>{st?.texto ?? c.status}</span>
                      <span className="font-medium text-texto">{c.nome}</span>
                      <span className="text-legenda text-texto-3">
                        {c.status === 'agendada' ? `começa ${quando(c.agendada_para)}` : `criada ${quando(c.criado_em)}`} ·{' '}
                        {(c.modelo as { nome?: string } | null)?.nome ?? ''} · até {c.limite_dia}/dia
                      </span>
                      <span className="ml-auto flex gap-2">
                        {(c.status === 'agendada' || c.status === 'enviando') && (
                          <Botao tamanho="sm" variante="secundario" carregando={ocupado === c.id} onClick={() => void acao(c.id, 'pausar')}>
                            Pausar
                          </Botao>
                        )}
                        {c.status === 'pausada' && (
                          <Botao tamanho="sm" variante="secundario" carregando={ocupado === c.id} onClick={() => void acao(c.id, 'retomar')}>
                            Retomar
                          </Botao>
                        )}
                        {(c.status === 'agendada' || c.status === 'enviando' || c.status === 'pausada') && (
                          <Botao tamanho="sm" variante="secundario" disabled={ocupado === c.id}
                            onClick={() => setCancelando(c)}>
                            Cancelar
                          </Botao>
                        )}
                      </span>
                    </div>
                    <Numeros r={resumo} />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
      <DialogoConfirmacao aberto={!!cancelando} titulo="Cancelar a campanha?" rotuloConfirmar="Cancelar campanha" perigo
        carregando={!!cancelando && ocupado === cancelando.id}
        aoConfirmar={() => cancelando && void acao(cancelando.id, 'cancelar').then(() => setCancelando(null))}
        aoCancelar={() => setCancelando(null)}>
        “{cancelando?.nome}”: quem ainda não recebeu não recebe mais. O que já foi enviado continua nas conversas.
      </DialogoConfirmacao>
      <ModalNovaCampanha aberto={nova} aoFechar={() => setNova(false)} aoCriar={() => setVersao((v) => v + 1)} />
    </div>
  )
}
