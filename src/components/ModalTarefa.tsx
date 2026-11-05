import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { avisosDaEquipe, dataInput, horaInput, juntar } from '../services/agenda'
import { listarContatos, listarOportunidades, type ContatoLista, type Oportunidade } from '../services/crm'
import { nomeDoContato } from '../services/formato'
import {
  apagarTarefa,
  atualizarTarefa,
  criarTarefa,
  LEMBRETES_TAREFA,
  sugestoesDeQuando,
  type SituacaoTarefa,
  type Tarefa,
} from '../services/tarefas'
import { useSessao } from '../hooks/useSessao'
import { useEquipe } from '../hooks/useEquipe'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { Modal } from './Modal'

const CLASSE_CAMPO =
  'block h-10 w-full rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none'

const SITUACOES: [SituacaoTarefa, string][] = [
  ['aberta', 'A fazer'],
  ['feita', 'Feita'],
  ['cancelada', 'Cancelada'],
]

/**
 * Nova tarefa (com o contato, a oportunidade ou a conversa já escolhidos, se vier de lá) ou edição de uma existente.
 * O próximo passo com o cliente: o quê, quando, quem e o lembrete.
 */
export function ModalTarefa({
  tarefa,
  contatoFixo,
  oportunidadeFixa,
  conversaId,
  aoFechar,
  aoSalvar,
}: {
  tarefa?: Tarefa
  contatoFixo?: { id: string; nome: string }
  oportunidadeFixa?: { id: string; titulo: string }
  conversaId?: string
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const { orgAtiva, sessao } = useSessao()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const equipe = useEquipe(orgId)
  const existente = !!tarefa
  const sugestoes = useMemo(() => sugestoesDeQuando(), [])

  const base = tarefa ? new Date(tarefa.vence_em) : sugestoes[1].quando
  const [titulo, setTitulo] = useState(tarefa?.titulo ?? '')
  const [data, setData] = useState(dataInput(base))
  const [hora, setHora] = useState(horaInput(base))
  const [responsavel, setResponsavel] = useState(
    tarefa ? (tarefa.responsavel_id ?? '') : orgAtiva?.suporte ? '' : (sessao?.user.id ?? ''),
  )
  const [contatoId, setContatoId] = useState(contatoFixo?.id ?? tarefa?.contato_id ?? '')
  const [oportunidadeId, setOportunidadeId] = useState(oportunidadeFixa?.id ?? tarefa?.oportunidade_id ?? '')
  const [observacao, setObservacao] = useState(tarefa?.observacao ?? '')
  const [situacao, setSituacao] = useState<SituacaoTarefa>((tarefa?.status as SituacaoTarefa | undefined) ?? 'aberta')
  const [lembrete, setLembrete] = useState(tarefa ? String(tarefa.lembrete_minutos ?? '') : '0')
  const [avisos, setAvisos] = useState<Map<string, { celular: boolean; whatsapp: boolean }> | null>(null)
  const [busca, setBusca] = useState('')
  const [contatos, setContatos] = useState<ContatoLista[]>([])
  const [oportunidades, setOportunidades] = useState<{ contatoId: string; lista: Oportunidade[] } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const escolheContato = !contatoFixo && !existente
  const doAgente = tarefa?.executor === 'agente'
  const podeApagar = existente && (gerencia || tarefa?.criado_por === sessao?.user.id)

  useEffect(() => {
    if (!escolheContato) return
    let ativo = true
    listarContatos(orgId, '')
      .then((l) => ativo && setContatos(l))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, escolheContato])

  useEffect(() => {
    if (!contatoId || oportunidadeFixa) return
    let ativo = true
    listarOportunidades(orgId, contatoId)
      .then((l) => ativo && setOportunidades({ contatoId, lista: l.filter((o) => !o.fechada_em || o.id === oportunidadeId) }))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, contatoId, oportunidadeId, oportunidadeFixa])

  useEffect(() => {
    let ativo = true
    avisosDaEquipe(orgId)
      .then((a) => ativo && setAvisos(a))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const lista = t
      ? contatos.filter((c) => `${nomeDoContato(c)} ${c.empresa ?? ''} ${c.telefone ?? ''}`.toLowerCase().includes(t))
      : contatos
    return lista.slice(0, 50)
  }, [busca, contatos])

  const listaOportunidades = oportunidades && contatoId && oportunidades.contatoId === contatoId ? oportunidades.lista : []
  const quando = data && hora ? juntar(data, hora) : null
  const meios = responsavel && lembrete !== '' ? avisos?.get(responsavel) : undefined
  const semMeio = !!meios && !meios.celular && !meios.whatsapp
  const responsavelSouEu = responsavel === sessao?.user.id
  const nomeResponsavel = equipe.find((m) => m.user_id === responsavel)?.nome || 'Essa pessoa'
  const nomeContato = contatoFixo?.nome ?? (tarefa?.contato ? nomeDoContato(tarefa.contato) : null)

  function escolherSugestao(d: Date) {
    setData(dataInput(d))
    setHora(horaInput(d))
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!quando || Number.isNaN(quando.getTime())) {
      setErro('Escolha a data e a hora.')
      return
    }
    setSalvando(true)
    setErro(null)
    const dados = {
      titulo: titulo.trim(),
      vence_em: quando.toISOString(),
      responsavel_id: responsavel || null,
      contato_id: contatoId || null,
      oportunidade_id: oportunidadeId || null,
      observacao: observacao.trim() || null,
      lembrete_minutos: lembrete === '' ? null : Number(lembrete),
    }
    try {
      if (existente) await atualizarTarefa(tarefa!.id, { ...dados, status: situacao })
      else await criarTarefa(orgId, { ...dados, conversa_id: conversaId ?? null })
      aoSalvar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function apagar() {
    setSalvando(true)
    try {
      await apagarTarefa(tarefa!.id)
      aoSalvar()
    } catch (e) {
      setErro((e as Error).message)
      setApagando(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Modal
        aberto={!apagando}
        titulo={existente ? (doAgente ? 'Retomada do agente' : 'Tarefa') : 'Nova tarefa'}
        largura="max-w-xl"
        aoFechar={aoFechar}
        rodape={
          <>
            {podeApagar && (
              <Botao variante="fantasma" icone="lixeira" className="mr-auto" onClick={() => setApagando(true)} disabled={salvando}>
                Apagar
              </Botao>
            )}
            <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
              Fechar
            </Botao>
            <Botao type="submit" form="form-tarefa" carregando={salvando} disabled={!titulo.trim() || !data || !hora}>
              {existente ? 'Salvar' : 'Criar tarefa'}
            </Botao>
          </>
        }
      >
        <form id="form-tarefa" onSubmit={salvar} className="space-y-4">
          <CampoTexto
            rotulo="O que fazer"
            required
            maxLength={200}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Ligar para saber se aprovou o orçamento"
          />

          <div className="space-y-2">
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <CampoTexto rotulo="Quando" type="date" required value={data} onChange={(e) => setData(e.target.value)} />
              <CampoTexto rotulo="Hora" type="time" required value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
            {!existente && (
              <div className="flex flex-wrap gap-1.5">
                {sugestoes.map((s) => (
                  <button
                    key={s.rotulo}
                    type="button"
                    onClick={() => escolherSugestao(s.quando)}
                    className="rounded-full border border-borda px-2.5 py-1 text-legenda text-texto-2 hover:border-primaria hover:text-primaria"
                  >
                    {s.rotulo}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {!doAgente && (
              <div className="space-y-1.5">
                <label htmlFor="tarefa-responsavel" className="block text-pequeno font-medium text-texto-2">
                  Responsável
                </label>
                <select id="tarefa-responsavel" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={CLASSE_CAMPO}>
                  <option value="">Sem responsável</option>
                  {equipe.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user_id === sessao?.user.id ? 'Você' : m.nome || m.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {existente && (
              <div className="space-y-1.5">
                <label htmlFor="tarefa-situacao" className="block text-pequeno font-medium text-texto-2">
                  Situação
                </label>
                <select
                  id="tarefa-situacao"
                  value={situacao}
                  onChange={(e) => setSituacao(e.target.value as SituacaoTarefa)}
                  className={CLASSE_CAMPO}
                >
                  {SITUACOES.map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {!doAgente && (
            <div className="space-y-1.5">
              <label htmlFor="tarefa-lembrete" className="block text-pequeno font-medium text-texto-2">
                Lembrete para o responsável
              </label>
              <select id="tarefa-lembrete" value={lembrete} onChange={(e) => setLembrete(e.target.value)} className={`${CLASSE_CAMPO} sm:max-w-xs`}>
                {LEMBRETES_TAREFA.map(([v, r]) => (
                  <option key={r} value={v ?? ''}>
                    {r}
                  </option>
                ))}
              </select>
              {meios && !semMeio && (
                <p className="text-legenda text-texto-3">
                  Vai por {[meios.celular && 'notificação no celular', meios.whatsapp && 'WhatsApp'].filter(Boolean).join(' e ')}.
                </p>
              )}
            </div>
          )}
          {semMeio && (
            <Aviso tom="atencao">
              {responsavelSouEu ? 'Você não vai receber' : `${nomeResponsavel} não vai receber`} este lembrete: falta ativar as
              notificações no celular (Configurações → Notificações) ou cadastrar o WhatsApp em Seus dados (Configurações →
              Equipe){responsavelSouEu ? '.' : '. Só a própria pessoa faz isso, no aparelho dela.'}
            </Aviso>
          )}

          {nomeContato && contatoId ? (
            <p className="text-pequeno">
              Cliente:{' '}
              <Link to={`/contatos/${contatoId}`} className="font-medium text-primaria hover:underline">
                {nomeContato}
              </Link>
              {oportunidadeFixa && <span className="text-texto-3"> · {oportunidadeFixa.titulo}</span>}
            </p>
          ) : escolheContato ? (
            <div className="space-y-1.5">
              <label htmlFor="tarefa-busca-contato" className="block text-pequeno font-medium text-texto-2">
                Cliente (opcional)
              </label>
              <input
                id="tarefa-busca-contato"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, empresa ou telefone"
                className={CLASSE_CAMPO}
              />
              <select
                aria-label="Escolha o cliente"
                size={4}
                value={contatoId}
                onChange={(e) => {
                  setContatoId(e.target.value)
                  setOportunidadeId('')
                }}
                className="block w-full rounded-md border border-borda bg-superficie p-1 text-pequeno focus:border-primaria focus:outline-none"
              >
                <option value="" className="rounded px-2 py-1 text-texto-3">
                  Sem cliente (tarefa interna)
                </option>
                {filtrados.map((c) => (
                  <option key={c.id} value={c.id} className="rounded px-2 py-1">
                    {nomeDoContato(c)}
                    {c.empresa ? ` · ${c.empresa}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {contatoId && !oportunidadeFixa && listaOportunidades.length > 0 && (
            <div className="space-y-1.5">
              <label htmlFor="tarefa-oportunidade" className="block text-pequeno font-medium text-texto-2">
                Oportunidade (opcional)
              </label>
              <select id="tarefa-oportunidade" value={oportunidadeId} onChange={(e) => setOportunidadeId(e.target.value)} className={CLASSE_CAMPO}>
                <option value="">Nenhuma</option>
                {listaOportunidades.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.titulo}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="tarefa-obs" className="block text-pequeno font-medium text-texto-2">
              Observação (opcional)
            </label>
            <textarea
              id="tarefa-obs"
              rows={3}
              maxLength={2000}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none"
            />
          </div>

          {existente && tarefa?.resultado && <p className="text-legenda text-texto-3">Resultado: {tarefa.resultado}</p>}
          {doAgente && (
            <p className="text-legenda text-texto-3">
              O agente escreve ao cliente nesta hora, no horário de atendimento. Para não mandar, mude a situação para “Cancelada”.
            </p>
          )}
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </form>
      </Modal>

      <DialogoConfirmacao
        aberto={apagando}
        titulo="Apagar esta tarefa?"
        rotuloConfirmar="Apagar"
        perigo
        carregando={salvando}
        aoConfirmar={() => void apagar()}
        aoCancelar={() => setApagando(false)}
      >
        Ela some sem deixar registro. Para manter o histórico, mude a situação para “Cancelada”.
      </DialogoConfirmacao>
    </>
  )
}
