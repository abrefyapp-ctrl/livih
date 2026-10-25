import { useEffect, useState, type FormEvent } from 'react'
import { listarEmissoras, type Emissora } from '../services/empresa'
import type { Pedido } from '../services/erp'
import { formatarCnpj } from '../services/formato'
import {
  emitirNota,
  FaltaParaEmitir,
  FORMAS_PAGAMENTO,
  notaDoPedido,
  podeEmitirNota,
  PRESENCAS,
  urlArquivoNota,
  type NotaFiscal,
} from '../services/nfe'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Campo, CLASSE_CAMPO } from './ModaisOs'
import { Modal } from './Modal'

/** Abre o arquivo numa aba nova com link assinado na hora (a aba abre no clique, senão o navegador bloqueia). */
async function abrir(path: string) {
  const aba = window.open('', '_blank')
  try {
    const url = await urlArquivoNota(path)
    if (aba) aba.location.href = url
    else window.location.href = url
  } catch {
    aba?.close()
  }
}

/**
 * Nota fiscal do pedido (docs/nfe.md): emitir (pedido confirmado, quem tem "Emite nota fiscal"), acompanhar a SEFAZ e
 * baixar DANFE e XML (cópia guardada no Livih). Vale para pedido de qualquer canal.
 */
export function NotaFiscalPedido({ orgId, pedido }: { orgId: string; pedido: Pedido }) {
  const [nota, setNota] = useState<{ pedidoId: string; nota: NotaFiscal | null } | null>(null)
  const [pode, setPode] = useState(false)
  const [emitindo, setEmitindo] = useState(false)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let ativo = true
    const pedidoId = pedido.id
    Promise.all([notaDoPedido(pedidoId), podeEmitirNota(orgId)])
      .then(([n, p]) => ativo && (setNota({ pedidoId, nota: n }), setPode(p)))
      .catch(() => ativo && setNota({ pedidoId, nota: null }))
    return () => {
      ativo = false
    }
  }, [pedido.id, orgId, versao])

  const atual = nota?.pedidoId === pedido.id ? nota.nota : undefined
  // Enquanto a SEFAZ processa, confere de novo a cada 4 segundos.
  useEffect(() => {
    if (atual?.status !== 'processando') return
    const t = setTimeout(() => setVersao((v) => v + 1), 4000)
    return () => clearTimeout(t)
  }, [atual])

  if (atual === undefined) return null
  if (!atual && !pode) return null
  const podeEmitir = pode && pedido.status !== 'rascunho' && pedido.status !== 'cancelado' && (!atual || atual.status === 'rejeitada' || atual.status === 'cancelada')
  const teste = atual?.ambiente === 'homologacao'

  return (
    <section className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Nota fiscal</h2>
        {podeEmitir && (
          <Botao tamanho="sm" icone="nota" onClick={() => setEmitindo(true)}>
            {atual ? 'Emitir de novo' : 'Emitir NF-e'}
          </Botao>
        )}
      </div>

      {!atual ? (
        <p className="text-pequeno text-texto-3">
          {pedido.status === 'rascunho' ? 'Confirme o pedido para emitir a NF-e.' : pedido.status === 'cancelado' ? 'Pedido cancelado.' : 'Nenhuma nota emitida para este pedido.'}
        </p>
      ) : atual.status === 'processando' ? (
        <p className="flex items-center gap-2 text-pequeno text-texto-2" role="status">
          <span className="size-4 animate-spin rounded-full border-2 border-primaria border-t-transparent" />
          Enviando à SEFAZ… costuma levar de alguns segundos a poucos minutos.
        </p>
      ) : atual.status === 'autorizada' ? (
        <div className="space-y-2">
          <p className="text-pequeno">
            <span className="font-medium text-primaria">NF-e autorizada</span>
            {atual.numero != null && ` · nº ${atual.numero}`}
            {atual.serie != null && ` · série ${atual.serie}`}
            {teste && <span className="text-atencao"> · TESTE (homologação, sem valor fiscal)</span>}
          </p>
          {atual.chave && <p className="text-legenda break-all text-texto-3 tabular-nums">Chave: {atual.chave.replace(/(\d{4})(?=\d)/g, '$1 ')}</p>}
          {atual.mensagem && <Aviso tom="atencao">{atual.mensagem}</Aviso>}
          <div className="flex flex-wrap gap-2">
            {atual.danfe_path && (
              <Botao tamanho="sm" variante="secundario" icone="baixar" onClick={() => void abrir(atual.danfe_path!)}>
                Baixar DANFE
              </Botao>
            )}
            {atual.xml_path && (
              <Botao tamanho="sm" variante="secundario" icone="baixar" onClick={() => void abrir(atual.xml_path!)}>
                Baixar XML
              </Botao>
            )}
          </div>
        </div>
      ) : atual.status === 'rejeitada' ? (
        <Aviso tom="erro">
          <span className="font-medium">A nota não foi autorizada.</span> {atual.mensagem ?? 'Sem detalhe da SEFAZ.'} Corrija e emita de novo.
        </Aviso>
      ) : (
        <p className="text-pequeno text-texto-2">
          NF-e {atual.numero != null && `nº ${atual.numero} `}cancelada{atual.cancelada_em && ` em ${new Date(atual.cancelada_em).toLocaleDateString('pt-BR')}`}.
        </p>
      )}

      {emitindo && (
        <ModalEmitir
          orgId={orgId}
          pedido={pedido}
          aoFechar={() => setEmitindo(false)}
          aoEmitir={() => (setEmitindo(false), setVersao((v) => v + 1))}
        />
      )}
    </section>
  )
}

function ModalEmitir({ orgId, pedido, aoFechar, aoEmitir }: { orgId: string; pedido: Pedido; aoFechar: () => void; aoEmitir: () => void }) {
  const [emissoras, setEmissoras] = useState<Emissora[] | null>(null)
  const [emissora, setEmissora] = useState('')
  const [forma, setForma] = useState('15')
  const [aPrazo, setAPrazo] = useState(false)
  const [presenca, setPresenca] = useState(9)
  const [informacoes, setInformacoes] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<{ mensagem: string; faltando: string[] } | null>(null)

  useEffect(() => {
    let ativo = true
    listarEmissoras(orgId)
      .then((l) => {
        if (!ativo) return
        setEmissoras(l)
        // O CNPJ do pedido, se estiver pronto; senão o primeiro pronto.
        const prontas = l.filter((e) => e.nfe_status === 'pronta')
        setEmissora((prontas.find((e) => e.id === pedido.emissora_id) ?? prontas[0])?.id ?? '')
      })
      .catch(() => ativo && setEmissoras([]))
    return () => {
      ativo = false
    }
  }, [orgId, pedido.emissora_id])

  const prontas = emissoras?.filter((e) => e.nfe_status === 'pronta') ?? []
  const escolhida = prontas.find((e) => e.id === emissora)

  async function emitir(ev: FormEvent) {
    ev.preventDefault()
    setEnviando(true)
    setErro(null)
    try {
      await emitirNota({ pedido_id: pedido.id, emissora_id: emissora, forma_pagamento: forma, a_prazo: aPrazo, presenca, informacoes })
      aoEmitir()
    } catch (e) {
      setErro({ mensagem: (e as Error).message, faltando: e instanceof FaltaParaEmitir ? e.faltando : [] })
      setEnviando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo={`Emitir NF-e · pedido #${pedido.numero}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-emitir" carregando={enviando} disabled={!escolhida}>
            {escolhida?.nfe_ambiente === 'producao' ? 'Emitir nota' : 'Emitir nota de teste'}
          </Botao>
        </>
      }
    >
      <form id="form-emitir" onSubmit={emitir} className="space-y-4">
        {erro && (
          <Aviso tom="erro">
            <span className="font-medium">{erro.mensagem}</span>
            {erro.faltando.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {erro.faltando.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </Aviso>
        )}
        {emissoras && !prontas.length ? (
          <Aviso tom="atencao">Nenhum CNPJ está pronto para emitir. Configure em Configurações → Empresa → Nota fiscal.</Aviso>
        ) : (
          <Campo rotulo="CNPJ que emite" id="nfe-cnpj">
            <select id="nfe-cnpj" value={emissora} onChange={(e) => setEmissora(e.target.value)} className={CLASSE_CAMPO} disabled={!emissoras}>
              {!emissoras && <option>Carregando…</option>}
              {prontas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome_fantasia || e.razao_social} · {formatarCnpj(e.cnpj)}
                  {e.nfe_ambiente === 'homologacao' ? ' · teste' : ''}
                  {e.padrao_balcao ? ' · balcão' : ''}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {escolhida?.nfe_ambiente === 'homologacao' && (
          <p className="text-legenda text-atencao">Este CNPJ está em teste (homologação): a nota sai sem valor fiscal.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Forma de pagamento" id="nfe-forma">
            <select id="nfe-forma" value={forma} onChange={(e) => setForma(e.target.value)} className={CLASSE_CAMPO}>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Como foi a venda" id="nfe-presenca">
            <select id="nfe-presenca" value={presenca} onChange={(e) => setPresenca(Number(e.target.value))} className={CLASSE_CAMPO}>
              {PRESENCAS.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-pequeno text-texto-2">
          <input type="checkbox" checked={aPrazo} onChange={(e) => setAPrazo(e.target.checked)} className="size-4 accent-primaria" />
          Pagamento a prazo
        </label>
        <Campo rotulo="Informações adicionais (opcional)" id="nfe-info" ajuda={`Saem no rodapé da nota. O nº do pedido (#${pedido.numero}) já vai.`}>
          <textarea id="nfe-info" rows={2} maxLength={2000} value={informacoes} onChange={(e) => setInformacoes(e.target.value)}
            className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none" />
        </Campo>
      </form>
    </Modal>
  )
}
