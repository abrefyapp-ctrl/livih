import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSessao } from '../hooks/useSessao'
import { listarNumerosVisiveis, type NumeroVisivel } from '../services/atendimento'
import {
  criarCampanha,
  listarEtiquetas,
  previaPublico,
  ROTULO_FONTE,
  type FiltrosCampanha,
  type FonteVariavel,
  type VariavelCampanha,
} from '../services/campanhas'
import { listarEtapas, type Etapa } from '../services/crm'
import { listarModelos, partesDe, variaveisDe, type Modelo } from '../services/modelos'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Campo, CLASSE_CAMPO } from './ModaisOs'
import { Modal } from './Modal'
import { PreviaModelo } from './PreviaModelo'

/** Modelo que a campanha consegue enviar: aprovado, de Marketing, sem imagem/vídeo/documento nem variável no cabeçalho. */
const enviavel = (m: Modelo) => {
  const cab = m.components.find((c) => c.type === 'HEADER')
  return m.status === 'APPROVED' && m.category === 'MARKETING' && (!cab || (cab.format === 'TEXT' && !/\{\{/.test(cab.text ?? '')))
}

const alternar = (lista: string[], valor: string) => (lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor])

function Chip({ ativo, children, aoClicar }: { ativo: boolean; children: string; aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      className={`rounded-full border px-2.5 py-1 text-legenda ${
        ativo ? 'border-primaria bg-primaria-suave text-primaria' : 'border-borda text-texto-2 hover:bg-fundo'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Nova campanha (docs/campanhas.md): número da API oficial, público por filtros, modelo de Marketing com as variáveis
 * e quando enviar. A lista de destinatários é tirada ao criar.
 */
export function ModalNovaCampanha({ aberto, aoFechar, aoCriar }: { aberto: boolean; aoFechar: () => void; aoCriar: () => void }) {
  const { orgAtiva, equipe } = useSessao()
  const orgId = orgAtiva!.id
  const [numeros, setNumeros] = useState<NumeroVisivel[] | null>(null)
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [nome, setNome] = useState('')
  const [canalId, setCanalId] = useState('')
  const [filtros, setFiltros] = useState<Required<Pick<FiltrosCampanha, 'tags' | 'etapas' | 'responsaveis'>> & FiltrosCampanha>({
    tags: [],
    etapas: [],
    responsaveis: [],
    com_cliente: null,
    inativos_dias: null,
  })
  const [publico, setPublico] = useState<{ chave: string; total: number; descadastrados: number; amostra: string[] } | null>(null)
  const [modelos, setModelos] = useState<{ canalId: string; lista: Modelo[] } | null>(null)
  const [erroModelos, setErroModelos] = useState<string | null>(null)
  const [modeloId, setModeloId] = useState('')
  const [variaveis, setVariaveis] = useState<VariavelCampanha[]>([])
  const [quando, setQuando] = useState<'agora' | 'agendar'>('agora')
  const [agendadaPara, setAgendadaPara] = useState('')
  const [limite, setLimite] = useState('250')
  const [consentimento, setConsentimento] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    let ativo = true
    Promise.all([listarNumerosVisiveis(orgId), listarEtiquetas(orgId), listarEtapas(orgId)])
      .then(([n, t, e]) => {
        if (!ativo) return
        const oficiais = n.filter((x) => x.tipo === 'meta')
        setNumeros(oficiais)
        setCanalId((atual) => atual || oficiais[0]?.id || '')
        setEtiquetas(t)
        setEtapas(e.filter((x) => x.tipo === 'aberta'))
      })
      .catch(() => ativo && setErro('Não foi possível carregar os dados da campanha.'))
    return () => {
      ativo = false
    }
  }, [aberto, orgId])

  // Prévia do público a cada mudança de filtro (com uma pausa curta para não consultar a cada clique).
  const chaveFiltros = JSON.stringify(filtros)
  useEffect(() => {
    if (!aberto) return
    let ativo = true
    const t = setTimeout(() => {
      previaPublico(orgId, JSON.parse(chaveFiltros) as FiltrosCampanha)
        .then((p) => ativo && setPublico({ chave: chaveFiltros, ...p }))
        .catch(() => ativo && setPublico(null))
    }, 300)
    return () => {
      ativo = false
      clearTimeout(t)
    }
  }, [aberto, orgId, chaveFiltros])

  useEffect(() => {
    if (!aberto || !canalId) return
    let ativo = true
    listarModelos(orgId, canalId)
      .then((l) => ativo && (setModelos({ canalId, lista: l.filter(enviavel) }), setErroModelos(null)))
      .catch((e) => ativo && setErroModelos((e as Error).message))
    return () => {
      ativo = false
    }
  }, [aberto, orgId, canalId])

  const listaModelos = modelos?.canalId === canalId ? modelos.lista : null
  const modelo = listaModelos?.find((m) => m.id === modeloId) ?? null
  const partes = modelo ? partesDe(modelo) : null
  const numerosVar = partes ? variaveisDe(partes.corpo) : []
  const membros = useMemo(() => [...equipe.entries()].map(([id, p]) => ({ id, nome: p.nome ?? 'Sem nome' })), [equipe])
  const total = publico?.chave === chaveFiltros ? publico.total : null
  const limiteNum = Number(limite)
  const exemplo = publico?.amostra[0] ?? 'Maria'
  const valoresPrevia = numerosVar.map((_, i) => {
    const v = variaveis[i]
    return !v ? '' : v.fonte === 'fixo' ? (v.valor ?? '') : v.fonte === 'nome' ? exemplo : `Empresa de ${exemplo}`
  })
  const variaveisOk = numerosVar.every((_, i) => variaveis[i] && (variaveis[i].fonte !== 'fixo' || variaveis[i].valor?.trim()))
  const pronto =
    !!nome.trim() && !!canalId && !!modelo && variaveisOk && !!total && consentimento &&
    Number.isInteger(limiteNum) && limiteNum >= 1 && (quando === 'agora' || !!agendadaPara)

  function escolherModelo(id: string) {
    setModeloId(id)
    const m = listaModelos?.find((x) => x.id === id)
    // A primeira variável costuma ser o nome do cliente.
    setVariaveis(m ? variaveisDe(partesDe(m).corpo).map((_, i) => (i === 0 ? { fonte: 'nome' } : { fonte: 'fixo', valor: '' })) : [])
  }

  function fechar() {
    setNome('')
    setModeloId('')
    setVariaveis([])
    setConsentimento(false)
    setQuando('agora')
    setAgendadaPara('')
    setErro(null)
    aoFechar()
  }

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (!pronto || !modelo || !partes) return
    setSalvando(true)
    setErro(null)
    try {
      await criarCampanha(orgId, {
        nome: nome.trim(),
        canal_id: canalId,
        modelo: {
          nome: modelo.name,
          idioma: modelo.language,
          categoria: modelo.category,
          cabecalho: partes.cabecalho,
          corpo: partes.corpo,
          rodape: partes.rodape,
          variaveis: numerosVar.map((_, i) =>
            variaveis[i].fonte === 'fixo' ? { fonte: 'fixo', valor: variaveis[i].valor!.trim() } : { fonte: variaveis[i].fonte },
          ),
        },
        filtros,
        agendada_para: quando === 'agendar' ? new Date(agendadaPara).toISOString() : null,
        limite_dia: limiteNum,
        consentimento,
      })
      aoCriar()
      fechar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      titulo="Nova campanha"
      aoFechar={fechar}
      largura="max-w-2xl"
      rodape={
        <>
          <Botao variante="secundario" onClick={fechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-campanha" carregando={salvando} disabled={!pronto}>
            {quando === 'agora' ? `Enviar para ${total ?? 0} contatos` : 'Agendar campanha'}
          </Botao>
        </>
      }
    >
      <form id="form-campanha" onSubmit={criar} className="space-y-6">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {numeros && !numeros.length && (
          <Aviso tom="atencao">
            Campanhas saem só por número conectado pela API oficial do WhatsApp. Conecte em Configurações → WhatsApp →
            Conectar pela API oficial.
          </Aviso>
        )}

        <fieldset className="space-y-3">
          <legend className="mb-1 font-semibold text-texto">Campanha</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoTexto rotulo="Nome (só para a equipe)" value={nome} maxLength={120} onChange={(ev) => setNome(ev.target.value)}
              placeholder="Ex.: Reposição de grampos – novembro" />
            <Campo rotulo="Número que envia" id="campanha-numero">
              <select id="campanha-numero" value={canalId} onChange={(ev) => (setCanalId(ev.target.value), setModeloId(''), setVariaveis([]))}
                className={CLASSE_CAMPO} disabled={!numeros?.length}>
                {(numeros ?? []).map((n) => (
                  <option key={n.id} value={n.id}>{n.nome}</option>
                ))}
              </select>
            </Campo>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 font-semibold text-texto">Público</legend>
          {etiquetas.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-pequeno font-medium text-texto-2">Etiquetas (qualquer uma)</p>
              <div className="flex flex-wrap gap-1.5">
                {etiquetas.map((t) => (
                  <Chip key={t} ativo={filtros.tags.includes(t)} aoClicar={() => setFiltros((f) => ({ ...f, tags: alternar(f.tags, t) }))}>{t}</Chip>
                ))}
              </div>
            </div>
          )}
          {etapas.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-pequeno font-medium text-texto-2">Com oportunidade aberta na etapa</p>
              <div className="flex flex-wrap gap-1.5">
                {etapas.map((e) => (
                  <Chip key={e.id} ativo={filtros.etapas.includes(e.id)} aoClicar={() => setFiltros((f) => ({ ...f, etapas: alternar(f.etapas, e.id) }))}>{e.nome}</Chip>
                ))}
              </div>
            </div>
          )}
          {membros.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-pequeno font-medium text-texto-2">Da carteira de</p>
              <div className="flex flex-wrap gap-1.5">
                {membros.map((m) => (
                  <Chip key={m.id} ativo={filtros.responsaveis.includes(m.id)}
                    aoClicar={() => setFiltros((f) => ({ ...f, responsaveis: alternar(f.responsaveis, m.id) }))}>{m.nome}</Chip>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Cliente do cadastro" id="campanha-cliente">
              <select id="campanha-cliente" className={CLASSE_CAMPO}
                value={filtros.com_cliente == null ? '' : String(filtros.com_cliente)}
                onChange={(ev) => setFiltros((f) => ({ ...f, com_cliente: ev.target.value === '' ? null : ev.target.value === 'true' }))}>
                <option value="">Todos os contatos</option>
                <option value="true">Só ligados a um cliente</option>
                <option value="false">Só sem cliente</option>
              </select>
            </Campo>
            <CampoTexto rotulo="Sem conversa há pelo menos (dias)" inputMode="numeric" maxLength={4} placeholder="Ex.: 60"
              value={filtros.inativos_dias != null ? String(filtros.inativos_dias) : ''}
              onChange={(ev) => {
                const v = ev.target.value.replace(/\D/g, '')
                setFiltros((f) => ({ ...f, inativos_dias: v ? Number(v) : null }))
              }} />
          </div>
          <p className="rounded-md bg-fundo px-3 py-2 text-pequeno text-texto-2" aria-live="polite">
            {total == null ? (
              'Contando os contatos…'
            ) : (
              <>
                <span className="font-semibold text-texto">{total} {total === 1 ? 'contato' : 'contatos'}</span>
                {publico?.amostra.length ? ` (ex.: ${publico.amostra.slice(0, 3).join(', ')})` : ''}.
                {!!publico?.descadastrados && ` ${publico.descadastrados} pediram para não receber e ficam de fora.`}
              </>
            )}
          </p>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 font-semibold text-texto">Mensagem</legend>
          {erroModelos && <Aviso tom="erro">{erroModelos}</Aviso>}
          {listaModelos && !listaModelos.length ? (
            <Aviso>
              Nenhum modelo de Marketing aprovado neste número. Crie em Configurações → Modelos (categoria Marketing) e espere a
              aprovação da Meta.
            </Aviso>
          ) : (
            <Campo rotulo="Modelo aprovado (Marketing)" id="campanha-modelo">
              <select id="campanha-modelo" value={modeloId} onChange={(ev) => escolherModelo(ev.target.value)} className={CLASSE_CAMPO}
                disabled={!listaModelos}>
                <option value="">{listaModelos ? 'Escolha o modelo' : 'Carregando modelos…'}</option>
                {(listaModelos ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </Campo>
          )}
          {partes && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                {numerosVar.map((n, i) => (
                  <div key={n} className="space-y-1.5">
                    <Campo rotulo={`Variável {{${n}}}`} id={`campanha-var-${n}`}>
                      <select id={`campanha-var-${n}`} className={CLASSE_CAMPO} value={variaveis[i]?.fonte ?? 'fixo'}
                        onChange={(ev) => setVariaveis((vs) => vs.map((v, j) => (j === i ? { fonte: ev.target.value as FonteVariavel, valor: '' } : v)))}>
                        {(Object.keys(ROTULO_FONTE) as FonteVariavel[]).map((f) => (
                          <option key={f} value={f}>{ROTULO_FONTE[f]}</option>
                        ))}
                      </select>
                    </Campo>
                    {variaveis[i]?.fonte === 'fixo' && (
                      <CampoTexto rotulo="Texto" value={variaveis[i].valor ?? ''} maxLength={200}
                        onChange={(ev) => setVariaveis((vs) => vs.map((v, j) => (j === i ? { ...v, valor: ev.target.value } : v)))} />
                    )}
                  </div>
                ))}
                {!numerosVar.length && <p className="text-pequeno text-texto-3">Este modelo não tem variáveis.</p>}
              </div>
              <div className="space-y-1.5">
                <p className="text-pequeno font-medium text-texto-2">Como chega (exemplo: {exemplo})</p>
                <PreviaModelo cabecalho={partes.cabecalho} corpo={partes.corpo} rodape={partes.rodape} botoes={partes.botoes} valores={valoresPrevia} />
              </div>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 font-semibold text-texto">Envio</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Quando" id="campanha-quando">
              <select id="campanha-quando" value={quando} onChange={(ev) => setQuando(ev.target.value as 'agora' | 'agendar')} className={CLASSE_CAMPO}>
                <option value="agora">Começar agora</option>
                <option value="agendar">Agendar</option>
              </select>
            </Campo>
            {quando === 'agendar' ? (
              <CampoTexto rotulo="Data e hora" type="datetime-local" value={agendadaPara} onChange={(ev) => setAgendadaPara(ev.target.value)} />
            ) : (
              <span />
            )}
            <CampoTexto rotulo="Limite por dia neste número" inputMode="numeric" maxLength={6} value={limite}
              onChange={(ev) => setLimite(ev.target.value.replace(/\D/g, ''))}
              ajuda="O número começa com um limite da Meta para mensagens iniciadas pela empresa, que sobe com o uso. O que passar fica para o dia seguinte." />
          </div>
          <p className="text-legenda text-texto-3">
            Sai aos poucos (até 20 por minuto). A Meta cobra da empresa cada mensagem de marketing entregue, na conta do WhatsApp
            dela. As respostas caem nas conversas, e o agente atende. Quem responder SAIR não recebe mais campanhas.
          </p>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-borda p-3">
            <input type="checkbox" checked={consentimento} onChange={(ev) => setConsentimento(ev.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-primaria" />
            <span className="text-pequeno text-texto">
              Confirmo que estes contatos autorizaram receber mensagens da empresa pelo WhatsApp. Mensagem para quem não
              autorizou gera bloqueios e denúncias, e a Meta reduz o limite do número.
            </span>
          </label>
        </fieldset>
      </form>
    </Modal>
  )
}
