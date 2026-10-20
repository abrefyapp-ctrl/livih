import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  apagarCompromisso,
  atualizarCompromisso,
  avisosDaEquipe,
  criarCompromisso,
  dataInput,
  horaCurta,
  horaInput,
  juntar,
  LEMBRETES,
  ROTULO_STATUS,
  type Compromisso,
  type StatusCompromisso,
} from '../services/agenda'
import { listarContatos, listarOportunidades, type ContatoLista, type Oportunidade } from '../services/crm'
import { nomeDoContato } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { useEquipe } from '../hooks/useEquipe'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { Modal } from './Modal'

const CLASSE_CAMPO =
  'block h-10 w-full rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none'

/**
 * Novo compromisso (com horário sugerido e, se vier do perfil, o cliente já escolhido) ou edição de um existente.
 * Avisa quando o responsável já tem outro compromisso no mesmo horário, sem impedir.
 */
export function ModalCompromisso({
  compromisso,
  inicioSugerido,
  contatoFixo,
  outros,
  aoFechar,
  aoSalvar,
}: {
  compromisso?: Compromisso
  inicioSugerido?: Date
  contatoFixo?: { id: string; nome: string }
  /** Compromissos já carregados, para avisar choque de horário. */
  outros: Compromisso[]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const { orgAtiva, sessao } = useSessao()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const equipe = useEquipe(orgId)
  const existente = !!compromisso

  const base = compromisso ? new Date(compromisso.inicio) : (inicioSugerido ?? proximaMeiaHora())
  const fimBase = compromisso ? new Date(compromisso.fim) : new Date(base.getTime() + 60 * 60_000)
  const [titulo, setTitulo] = useState(compromisso?.titulo ?? '')
  const [data, setData] = useState(dataInput(base))
  const [inicio, setInicio] = useState(horaInput(base))
  const [fim, setFim] = useState(horaInput(fimBase))
  // Em modo suporte a plataforma não é da equipe: começa sem responsável.
  const [responsavel, setResponsavel] = useState(
    compromisso ? (compromisso.responsavel_id ?? '') : orgAtiva?.suporte ? '' : (sessao?.user.id ?? ''),
  )
  const [contatoId, setContatoId] = useState(contatoFixo?.id ?? compromisso?.contato_id ?? '')
  const [oportunidadeId, setOportunidadeId] = useState(compromisso?.oportunidade_id ?? '')
  const [local, setLocal] = useState(compromisso?.local ?? '')
  const [observacao, setObservacao] = useState(compromisso?.observacao ?? '')
  const [status, setStatus] = useState<StatusCompromisso>(compromisso?.status ?? 'marcado')
  // Antecedência do lembrete ('' = sem lembrete). Novo compromisso: 30 min.
  const [lembrete, setLembrete] = useState(compromisso ? String(compromisso.lembrete_minutos ?? '') : '30')
  const [avisos, setAvisos] = useState<Map<string, { celular: boolean; whatsapp: boolean }> | null>(null)
  const [busca, setBusca] = useState('')
  const [contatos, setContatos] = useState<ContatoLista[]>([])
  const [oportunidades, setOportunidades] = useState<{ contatoId: string; lista: Oportunidade[] } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const escolheContato = !contatoFixo && !existente

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
    if (!contatoId) return
    let ativo = true
    listarOportunidades(orgId, contatoId)
      .then((l) => ativo && setOportunidades({ contatoId, lista: l.filter((o) => !o.fechada_em || o.id === oportunidadeId) }))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, contatoId, oportunidadeId])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const lista = t
      ? contatos.filter((c) => `${nomeDoContato(c)} ${c.empresa ?? ''} ${c.telefone ?? ''}`.toLowerCase().includes(t))
      : contatos
    return lista.slice(0, 50)
  }, [busca, contatos])

  const listaOportunidades = contatoId && oportunidades?.contatoId === contatoId ? oportunidades.lista : []
  const inicioData = data && inicio ? juntar(data, inicio) : null
  const fimData = data && fim ? juntar(data, fim) : null
  const horarioValido = !!inicioData && !!fimData && fimData > inicioData

  const choque = useMemo(() => {
    if (!horarioValido || !responsavel || status === 'cancelado') return null
    return (
      outros.find(
        (o) =>
          o.id !== compromisso?.id &&
          o.responsavel_id === responsavel &&
          o.status !== 'cancelado' &&
          new Date(o.inicio) < fimData! &&
          new Date(o.fim) > inicioData!,
      ) ?? null
    )
  }, [outros, compromisso?.id, responsavel, status, horarioValido, inicioData, fimData])

  useEffect(() => {
    let ativo = true
    avisosDaEquipe(orgId)
      .then((a) => ativo && setAvisos(a))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId])
  // Lembrete marcado para quem não recebe por nenhum meio: avisa na hora, com o caminho para ativar.
  const meiosDoResponsavel = responsavel && lembrete ? avisos?.get(responsavel) : undefined
  const semMeio = !!meiosDoResponsavel && !meiosDoResponsavel.celular && !meiosDoResponsavel.whatsapp
  const responsavelSouEu = responsavel === sessao?.user.id
  const nomeResponsavel = equipe.find((m) => m.user_id === responsavel)?.nome || 'Essa pessoa'

  const nomeContato =
    contatoFixo?.nome ?? (compromisso?.contato ? nomeDoContato(compromisso.contato) : null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!horarioValido) {
      setErro('O fim precisa ser depois do início.')
      return
    }
    setSalvando(true)
    setErro(null)
    const dados = {
      titulo: titulo.trim(),
      inicio: inicioData!.toISOString(),
      fim: fimData!.toISOString(),
      responsavel_id: responsavel || null,
      contato_id: contatoId || null,
      oportunidade_id: oportunidadeId || null,
      local: local.trim() || null,
      observacao: observacao.trim() || null,
      status,
      lembrete_minutos: lembrete ? Number(lembrete) : null,
    }
    try {
      if (existente) await atualizarCompromisso(compromisso!.id, dados)
      else await criarCompromisso(orgId, dados)
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
      await apagarCompromisso(compromisso!.id)
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
        titulo={existente ? 'Compromisso' : 'Novo compromisso'}
        largura="max-w-xl"
        aoFechar={aoFechar}
        rodape={
          <>
            {existente && gerencia && (
              <Botao variante="fantasma" icone="lixeira" className="mr-auto" onClick={() => setApagando(true)} disabled={salvando}>
                Apagar
              </Botao>
            )}
            <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
              Fechar
            </Botao>
            <Botao type="submit" form="form-compromisso" carregando={salvando} disabled={!titulo.trim() || !horarioValido}>
              {existente ? 'Salvar' : 'Marcar'}
            </Botao>
          </>
        }
      >
        <form id="form-compromisso" onSubmit={salvar} className="space-y-4">
          <CampoTexto
            rotulo="Título"
            required
            maxLength={120}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Reunião de diagnóstico"
          />

          <div className="grid gap-4 sm:grid-cols-[1fr_7rem_7rem]">
            <CampoTexto rotulo="Data" type="date" required value={data} onChange={(e) => setData(e.target.value)} />
            <CampoTexto rotulo="Início" type="time" required value={inicio} onChange={(e) => setInicio(e.target.value)} />
            <CampoTexto rotulo="Fim" type="time" required value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="comp-responsavel" className="block text-pequeno font-medium text-texto-2">
                Responsável
              </label>
              <select id="comp-responsavel" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={CLASSE_CAMPO}>
                <option value="">Sem responsável</option>
                {equipe.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user_id === sessao?.user.id ? 'Você' : m.nome || m.email}
                  </option>
                ))}
              </select>
            </div>
            {existente && (
              <div className="space-y-1.5">
                <label htmlFor="comp-status" className="block text-pequeno font-medium text-texto-2">
                  Situação
                </label>
                <select
                  id="comp-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StatusCompromisso)}
                  className={CLASSE_CAMPO}
                >
                  {Object.entries(ROTULO_STATUS).map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="comp-lembrete" className="block text-pequeno font-medium text-texto-2">
              Lembrete para o responsável
            </label>
            <select id="comp-lembrete" value={lembrete} onChange={(e) => setLembrete(e.target.value)} className={`${CLASSE_CAMPO} sm:max-w-xs`}>
              {LEMBRETES.map(([v, r]) => (
                <option key={r} value={v ?? ''}>
                  {r}
                </option>
              ))}
            </select>
            {meiosDoResponsavel && !semMeio && (
              <p className="text-legenda text-texto-3">
                Vai por {[meiosDoResponsavel.celular && 'notificação no celular', meiosDoResponsavel.whatsapp && 'WhatsApp'].filter(Boolean).join(' e ')}.
              </p>
            )}
          </div>
          {semMeio && (
            <Aviso tom="atencao">
              {responsavelSouEu ? 'Você não vai receber' : `${nomeResponsavel} não vai receber`} este lembrete: falta ativar as
              notificações no celular (Configurações → Notificações) ou cadastrar o WhatsApp em Seus dados (Configurações →
              Equipe){responsavelSouEu ? '.' : '. Só a própria pessoa faz isso, no aparelho dela.'}
            </Aviso>
          )}

          {choque && (
            <Aviso tom="atencao">
              Essa pessoa já tem “{choque.titulo}” das {horaCurta(choque.inicio)} às {horaCurta(choque.fim)}.
            </Aviso>
          )}

          {nomeContato && contatoId ? (
            <p className="text-pequeno">
              Cliente:{' '}
              <Link to={`/contatos/${contatoId}`} className="font-medium text-primaria hover:underline">
                {nomeContato}
              </Link>
            </p>
          ) : escolheContato ? (
            <div className="space-y-1.5">
              <label htmlFor="comp-busca-contato" className="block text-pequeno font-medium text-texto-2">
                Cliente (opcional)
              </label>
              <input
                id="comp-busca-contato"
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
                  Sem cliente (compromisso interno)
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

          {contatoId && listaOportunidades.length > 0 && (
            <div className="space-y-1.5">
              <label htmlFor="comp-oportunidade" className="block text-pequeno font-medium text-texto-2">
                Oportunidade (opcional)
              </label>
              <select id="comp-oportunidade" value={oportunidadeId} onChange={(e) => setOportunidadeId(e.target.value)} className={CLASSE_CAMPO}>
                <option value="">Nenhuma</option>
                {listaOportunidades.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.titulo}
                  </option>
                ))}
              </select>
            </div>
          )}

          <CampoTexto
            rotulo="Local ou link (opcional)"
            maxLength={300}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder="Endereço, link do Meet ou telefone"
          />

          <div className="space-y-1.5">
            <label htmlFor="comp-obs" className="block text-pequeno font-medium text-texto-2">
              Observação (opcional)
            </label>
            <textarea
              id="comp-obs"
              rows={3}
              maxLength={2000}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none"
            />
          </div>

          {existente && compromisso?.origem === 'agente' && (
            <p className="text-legenda text-texto-3">Marcado pelo agente na conversa com o cliente.</p>
          )}
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </form>
      </Modal>

      <DialogoConfirmacao
        aberto={apagando}
        titulo="Apagar este compromisso?"
        rotuloConfirmar="Apagar"
        perigo
        carregando={salvando}
        aoConfirmar={() => void apagar()}
        aoCancelar={() => setApagando(false)}
      >
        Ele some da agenda sem deixar registro. Para manter o histórico, mude a situação para “Cancelado”.
      </DialogoConfirmacao>
    </>
  )
}

function proximaMeiaHora() {
  const d = new Date()
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  return d
}
