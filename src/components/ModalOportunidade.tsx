import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  atualizarOportunidade,
  criarOportunidade,
  historicoOportunidade,
  listarContatos,
  type ContatoLista,
  type Etapa,
  type Oportunidade,
  type PassoFunil,
} from '../services/crm'
import { moeda, nomeDoContato, quandoCurto } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { useEquipe } from '../hooks/useEquipe'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { EtiquetaEtapa } from './EtiquetaEtapa'
import { Modal } from './Modal'

const paraNumero = (v: string): number | null | undefined => {
  const limpo = v.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  if (!limpo) return null
  const n = Number(limpo)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/**
 * Nova oportunidade (com `contatoFixo` ou escolhendo o contato) ou detalhe de uma existente.
 * Ganho/perdido são da equipe; perdido pede o motivo (o agente nunca fecha negócio).
 */
export function ModalOportunidade({
  aberto,
  etapas,
  oportunidade,
  contatoFixo,
  etapaInicial,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean
  etapas: Etapa[]
  oportunidade?: Oportunidade
  contatoFixo?: { id: string; nome: string }
  etapaInicial?: string
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const { orgAtiva, sessao, equipe: perfis } = useSessao()
  const equipe = useEquipe(orgAtiva?.id)
  const existente = !!oportunidade
  const abertas = etapas.filter((e) => e.tipo === 'aberta')
  const [titulo, setTitulo] = useState(oportunidade?.titulo ?? '')
  // etapaInicial também vale para uma existente: arrastar para Perdido abre aqui já na etapa, pedindo o motivo.
  const [etapaId, setEtapaId] = useState(etapaInicial ?? oportunidade?.etapa_id ?? abertas[0]?.id ?? '')
  const [valor, setValor] = useState(oportunidade?.valor_estimado != null ? String(oportunidade.valor_estimado).replace('.', ',') : '')
  const [responsavel, setResponsavel] = useState(oportunidade ? (oportunidade.responsavel_id ?? '') : (sessao?.user.id ?? ''))
  const [resumo, setResumo] = useState(oportunidade?.resumo ?? '')
  const [motivoPerda, setMotivoPerda] = useState(oportunidade?.motivo_perda ?? '')
  const [contatoId, setContatoId] = useState(contatoFixo?.id ?? oportunidade?.contato_id ?? '')
  const [busca, setBusca] = useState('')
  const [contatos, setContatos] = useState<ContatoLista[]>([])
  const [historico, setHistorico] = useState<PassoFunil[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const precisaContato = !existente && !contatoFixo
  const orgId = orgAtiva?.id
  useEffect(() => {
    if (!precisaContato || !orgId) return
    let ativo = true
    listarContatos(orgId, '')
      .then((l) => ativo && setContatos(l))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [precisaContato, orgId])

  const oportunidadeId = oportunidade?.id
  useEffect(() => {
    if (!oportunidadeId) return
    let ativo = true
    historicoOportunidade(oportunidadeId)
      .then((h) => ativo && setHistorico(h))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [oportunidadeId])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const lista = t
      ? contatos.filter((c) => `${nomeDoContato(c)} ${c.empresa ?? ''} ${c.telefone ?? ''}`.toLowerCase().includes(t))
      : contatos
    return lista.slice(0, 50)
  }, [busca, contatos])

  const etapa = etapas.find((e) => e.id === etapaId)
  const nomeEtapa = (id: string | null) => etapas.find((e) => e.id === id)?.nome ?? '—'
  const valorNum = paraNumero(valor)
  const perdido = etapa?.tipo === 'perdido'

  async function salvar(e?: FormEvent, etapaForcada?: string) {
    e?.preventDefault()
    if (!orgAtiva || valorNum === undefined) return
    const destino = etapaForcada ?? etapaId
    if (etapas.find((x) => x.id === destino)?.tipo === 'perdido' && !motivoPerda.trim()) {
      setEtapaId(destino)
      setErro('Conte em uma frase por que o negócio foi perdido.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const campos = {
        titulo: titulo.trim(),
        etapa_id: destino,
        valor_estimado: valorNum,
        responsavel_id: responsavel || null,
      }
      if (existente) {
        await atualizarOportunidade(oportunidade!.id, {
          ...campos,
          resumo: resumo.trim() || null,
          motivo_perda: etapas.find((x) => x.id === destino)?.tipo === 'perdido' ? motivoPerda.trim() : null,
        })
      } else {
        await criarOportunidade(orgAtiva.id, { ...campos, contato_id: contatoId })
      }
      aoSalvar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const ganho = etapas.find((e) => e.tipo === 'ganho')
  const perda = etapas.find((e) => e.tipo === 'perdido')

  return (
    <Modal
      aberto={aberto}
      titulo={existente ? 'Oportunidade' : 'Nova oportunidade'}
      aoFechar={aoFechar}
      largura="max-w-xl"
      rodape={
        <>
          {existente && etapa?.tipo === 'aberta' && (
            <div className="mr-auto flex gap-2">
              {ganho && (
                <Botao variante="secundario" icone="check" onClick={() => void salvar(undefined, ganho.id)} disabled={salvando}>
                  Ganho
                </Botao>
              )}
              {perda && (
                <Botao variante="fantasma" icone="fechar" onClick={() => setEtapaId(perda.id)} disabled={salvando}>
                  Perdido
                </Botao>
              )}
            </div>
          )}
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao
            type="submit"
            form="form-oportunidade"
            carregando={salvando}
            disabled={!titulo.trim() || !contatoId || !etapaId || valorNum === undefined}
          >
            {existente ? 'Salvar' : 'Criar oportunidade'}
          </Botao>
        </>
      }
    >
      <form id="form-oportunidade" onSubmit={salvar} className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        {existente && oportunidade?.contato && (
          <p className="text-pequeno">
            Cliente:{' '}
            <Link to={`/contatos/${oportunidade.contato.id}`} className="font-medium text-primaria hover:underline">
              {nomeDoContato(oportunidade.contato)}
            </Link>
          </p>
        )}
        {contatoFixo && <p className="text-pequeno">Cliente: <strong>{contatoFixo.nome}</strong></p>}

        {precisaContato && (
          <div className="space-y-1.5">
            <label htmlFor="busca-contato" className="block text-pequeno font-medium text-texto-2">
              Cliente
            </label>
            <input
              id="busca-contato"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, empresa ou telefone"
              className="block h-10 w-full rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
            <select
              aria-label="Escolha o cliente"
              size={5}
              value={contatoId}
              onChange={(e) => setContatoId(e.target.value)}
              className="block w-full rounded-md border border-borda bg-superficie p-1 text-pequeno focus:border-primaria focus:outline-none"
            >
              {filtrados.map((c) => (
                <option key={c.id} value={c.id} className="rounded px-2 py-1">
                  {nomeDoContato(c)}
                  {c.empresa ? ` · ${c.empresa}` : ''}
                </option>
              ))}
            </select>
            {!filtrados.length && <p className="text-legenda text-texto-3">Nenhum cliente encontrado. Cadastre em Contatos.</p>}
          </div>
        )}

        <CampoTexto rotulo="Título" required value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Agente de atendimento para a clínica" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="oport-etapa" className="block text-pequeno font-medium text-texto-2">
              Etapa
            </label>
            <select
              id="oport-etapa"
              value={etapaId}
              onChange={(e) => setEtapaId(e.target.value)}
              className="block h-10 w-full rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none"
            >
              {etapas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          <CampoTexto
            rotulo="Valor estimado (R$)"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            erro={valorNum === undefined ? 'Use só números, por exemplo 12.500,00.' : undefined}
          />
        </div>

        {perdido && (
          <CampoTexto
            rotulo="Por que foi perdido?"
            required
            value={motivoPerda}
            onChange={(e) => setMotivoPerda(e.target.value)}
            placeholder="Ex.: achou caro, escolheu outro fornecedor"
          />
        )}

        <div className="space-y-1.5">
          <label htmlFor="oport-responsavel" className="block text-pequeno font-medium text-texto-2">
            Responsável
          </label>
          <select
            id="oport-responsavel"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            className="block h-10 w-full rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none"
          >
            <option value="">Ninguém</option>
            {equipe.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.nome || m.email}
              </option>
            ))}
          </select>
        </div>

        {existente && (
          <div className="space-y-1.5">
            <label htmlFor="oport-resumo" className="block text-pequeno font-medium text-texto-2">
              Resumo
            </label>
            <textarea
              id="oport-resumo"
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              rows={4}
              className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none"
            />
          </div>
        )}

        {existente && historico.length > 0 && (
          <div>
            <p className="mb-2 text-pequeno font-medium text-texto-2">Histórico no funil</p>
            <ol className="space-y-1.5 border-l-2 border-borda pl-3">
              {historico.map((h) => (
                <li key={h.id} className="text-pequeno text-texto-2">
                  {h.etapa_de ? `${nomeEtapa(h.etapa_de)} → ` : 'Criada em '}
                  <strong className="font-medium">{nomeEtapa(h.etapa_para)}</strong>
                  <span className="text-texto-3">
                    {' · '}
                    {h.autor_tipo === 'bot' ? 'Agente' : ((h.autor_id && perfis.get(h.autor_id)?.nome) ?? 'Equipe')} · {quandoCurto(h.criado_em)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {existente && oportunidade?.fechada_em && etapa && etapa.tipo !== 'aberta' && (
          <p className="flex items-center gap-2 text-pequeno text-texto-3">
            <EtiquetaEtapa nome={etapa.nome} tipo={etapa.tipo} /> em {quandoCurto(oportunidade.fechada_em).toLowerCase()}
            {oportunidade.valor_estimado != null && ` · ${moeda(oportunidade.valor_estimado)}`}
          </p>
        )}
      </form>
    </Modal>
  )
}
