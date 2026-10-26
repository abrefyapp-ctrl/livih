import { useEffect, useState, type FormEvent } from 'react'
import { listarEmissoras, type Emissora } from '../services/empresa'
import type { Pedido } from '../services/erp'
import { formatarCnpj, moeda } from '../services/formato'
import {
  emitirNota,
  emitirNotaServico,
  FaltaParaEmitir,
  FORMAS_PAGAMENTO,
  NOME_MODELO,
  notaDaOs,
  notaDoPedido,
  notasDoCliente,
  podeEmitirNota,
  rejeicaoCredenciamento,
  PRESENCAS,
  urlArquivoNota,
  type NotaFiscal,
} from '../services/nfe'
import { Aviso } from './Aviso'
import { CredenciamentoSefaz } from './CredenciamentoSefaz'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Campo, CLASSE_CAMPO } from './ModaisOs'
import { Modal } from './Modal'

// Nota fiscal (docs/nfe.md e docs/nfse.md): o bloco que aparece no pedido (NF-e ou NFS-e), na OS (NFS-e) e no perfil
// do cliente (notas dele e a nota de serviço avulsa). Emitir: dono, admin e quem tem "Emite nota fiscal".

export type Alvo =
  | { tipo: 'pedido'; pedido: Pedido }
  | { tipo: 'os'; osId: string; numero: number }
  | { tipo: 'cliente'; clienteId: string; nome: string }

const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

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

function Situacao({ nota }: { nota: NotaFiscal }) {
  const nome = NOME_MODELO[nota.modelo]
  const teste = nota.ambiente === 'homologacao'
  if (nota.status === 'processando') {
    return (
      <p className="flex items-center gap-2 text-pequeno text-texto-2" role="status">
        <span className="size-4 animate-spin rounded-full border-2 border-primaria border-t-transparent" />
        {nome}: enviando à {nota.modelo === 'nfse' ? 'prefeitura' : 'SEFAZ'}… costuma levar de segundos a poucos minutos.
      </p>
    )
  }
  if (nota.status === 'rejeitada' && nota.modelo === 'nfe' && rejeicaoCredenciamento(nota.mensagem)) {
    return (
      <Aviso tom="erro">
        <span className="font-medium">A NF-e não foi autorizada: a SEFAZ ainda não reconhece o sistema emissor deste CNPJ.</span>{' '}
        <span className="text-legenda">({nota.mensagem})</span>
        <div className="mt-2"><CredenciamentoSefaz /></div>
      </Aviso>
    )
  }
  if (nota.status === 'rejeitada') {
    return (
      <Aviso tom="erro">
        <span className="font-medium">A {nome} não foi autorizada.</span> {nota.mensagem ?? 'Sem detalhe.'} Corrija e emita de novo.
      </Aviso>
    )
  }
  if (nota.status === 'cancelada') {
    return (
      <p className="text-pequeno text-texto-2">
        {nome} {nota.numero != null && `nº ${nota.numero} `}cancelada{nota.cancelada_em && ` em ${new Date(nota.cancelada_em).toLocaleDateString('pt-BR')}`}.
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-pequeno">
        <span className="font-medium text-primaria">{nome} autorizada</span>
        {nota.numero != null && ` · nº ${nota.numero}`}
        {nota.serie != null && ` · série ${nota.serie}`}
        {` · ${moeda(Number(nota.valor), true)}`}
        {teste && <span className="text-atencao"> · TESTE (homologação, sem valor fiscal)</span>}
      </p>
      {nota.chave && <p className="text-legenda break-all text-texto-3 tabular-nums">Chave: {nota.chave.replace(/(\d{4})(?=\d)/g, '$1 ')}</p>}
      {nota.mensagem && <Aviso tom="atencao">{nota.mensagem}</Aviso>}
      <div className="flex flex-wrap gap-2">
        {nota.danfe_path && (
          <Botao tamanho="sm" variante="secundario" icone="baixar" onClick={() => void abrir(nota.danfe_path!)}>
            {nota.modelo === 'nfse' ? 'Baixar PDF (DANFSe)' : 'Baixar DANFE'}
          </Botao>
        )}
        {nota.xml_path && (
          <Botao tamanho="sm" variante="secundario" icone="baixar" onClick={() => void abrir(nota.xml_path!)}>
            Baixar XML
          </Botao>
        )}
      </div>
    </div>
  )
}

/** Bloco "Nota fiscal" do pedido ou da OS: a nota mais recente, acompanhar e emitir. */
export function BlocoNota({ orgId, alvo }: { orgId: string; alvo: Extract<Alvo, { tipo: 'pedido' | 'os' }> }) {
  const chave = alvo.tipo === 'pedido' ? alvo.pedido.id : alvo.osId
  const [nota, setNota] = useState<{ chave: string; nota: NotaFiscal | null } | null>(null)
  const [pode, setPode] = useState(false)
  const [emitindo, setEmitindo] = useState(false)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let ativo = true
    Promise.all([alvo.tipo === 'pedido' ? notaDoPedido(chave) : notaDaOs(chave), podeEmitirNota(orgId)])
      .then(([n, p]) => ativo && (setNota({ chave, nota: n }), setPode(p)))
      .catch(() => ativo && setNota({ chave, nota: null }))
    return () => {
      ativo = false
    }
  }, [chave, alvo.tipo, orgId, versao])

  const atual = nota?.chave === chave ? nota.nota : undefined
  // Enquanto processa, confere de novo a cada 4 segundos.
  useEffect(() => {
    if (atual?.status !== 'processando') return
    const t = setTimeout(() => setVersao((v) => v + 1), 4000)
    return () => clearTimeout(t)
  }, [atual])

  if (atual === undefined) return null
  if (!atual && !pode) return null
  const status = alvo.tipo === 'pedido' ? alvo.pedido.status : null
  const livre = !atual || atual.status === 'rejeitada' || atual.status === 'cancelada'
  const podeEmitir = pode && livre && status !== 'rascunho' && status !== 'cancelado'

  return (
    <section className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Nota fiscal</h2>
        {podeEmitir && (
          <Botao tamanho="sm" icone="nota" onClick={() => setEmitindo(true)}>
            {atual ? 'Emitir de novo' : alvo.tipo === 'os' ? 'Emitir NFS-e' : 'Emitir nota'}
          </Botao>
        )}
      </div>
      {atual ? (
        <Situacao nota={atual} />
      ) : (
        <p className="text-pequeno text-texto-3">
          {status === 'rascunho' ? 'Confirme o pedido para emitir a nota.' : status === 'cancelado' ? 'Pedido cancelado.' : 'Nenhuma nota emitida.'}
        </p>
      )}
      {emitindo && <ModalEmitirNota orgId={orgId} alvo={alvo} aoFechar={() => setEmitindo(false)} aoEmitir={() => (setEmitindo(false), setVersao((v) => v + 1))} />}
    </section>
  )
}

/** Perfil do cliente: as notas dele e a nota de serviço avulsa. */
export function NotasDoCliente({ orgId, clienteId, nome }: { orgId: string; clienteId: string; nome: string }) {
  const [notas, setNotas] = useState<{ clienteId: string; lista: NotaFiscal[] } | null>(null)
  const [pode, setPode] = useState(false)
  const [emitindo, setEmitindo] = useState(false)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let ativo = true
    Promise.all([notasDoCliente(clienteId), podeEmitirNota(orgId)])
      .then(([lista, p]) => ativo && (setNotas({ clienteId, lista }), setPode(p)))
      .catch(() => ativo && setNotas({ clienteId, lista: [] }))
    return () => {
      ativo = false
    }
  }, [clienteId, orgId, versao])

  const lista = notas?.clienteId === clienteId ? notas.lista : null
  useEffect(() => {
    if (!lista?.some((n) => n.status === 'processando')) return
    const t = setTimeout(() => setVersao((v) => v + 1), 4000)
    return () => clearTimeout(t)
  }, [lista])
  if (!lista || (!lista.length && !pode)) return null

  return (
    <section className="rounded-lg border border-borda bg-superficie">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-3">
        <h2 className="font-semibold">Notas fiscais</h2>
        {pode && (
          <Botao tamanho="sm" variante="secundario" icone="nota" onClick={() => setEmitindo(true)}>
            Nota de serviço avulsa
          </Botao>
        )}
      </div>
      <div className="space-y-3 p-4">
        {lista.length ? (
          lista.map((n) => (
            <div key={n.id} className="space-y-1 border-b border-borda pb-3 last:border-0 last:pb-0">
              <p className="text-legenda text-texto-3">
                {new Date(n.criado_em).toLocaleDateString('pt-BR')}
                {n.descricao && ` · ${n.descricao.slice(0, 80)}${n.descricao.length > 80 ? '…' : ''}`}
              </p>
              <Situacao nota={n} />
            </div>
          ))
        ) : (
          <p className="text-pequeno text-texto-3">Nenhuma nota para este cliente ainda.</p>
        )}
      </div>
      {emitindo && (
        <ModalEmitirNota
          orgId={orgId}
          alvo={{ tipo: 'cliente', clienteId, nome }}
          aoFechar={() => setEmitindo(false)}
          aoEmitir={() => (setEmitindo(false), setVersao((v) => v + 1))}
        />
      )}
    </section>
  )
}

function ModalEmitirNota({ orgId, alvo, aoFechar, aoEmitir }: { orgId: string; alvo: Alvo; aoFechar: () => void; aoEmitir: () => void }) {
  const [modelo, setModelo] = useState<'nfe' | 'nfse'>(alvo.tipo === 'pedido' ? 'nfe' : 'nfse')
  const [emissoras, setEmissoras] = useState<Emissora[] | null>(null)
  const [emissora, setEmissora] = useState('')
  const [forma, setForma] = useState('15')
  const [aPrazo, setAPrazo] = useState(false)
  const [presenca, setPresenca] = useState(9)
  const [informacoes, setInformacoes] = useState('')
  // null = ainda não mexeu: na avulsa, vale a descrição padrão do CNPJ.
  const [descricaoDigitada, setDescricao] = useState<string | null>(null)
  const [valor, setValor] = useState('')
  const [competencia, setCompetencia] = useState(hoje())
  const [issRetido, setIssRetido] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<{ mensagem: string; faltando: string[] } | null>(null)
  const emissoraDoAlvo = alvo.tipo === 'pedido' ? alvo.pedido.emissora_id : null

  useEffect(() => {
    let ativo = true
    listarEmissoras(orgId)
      .then((l) => ativo && setEmissoras(l))
      .catch(() => ativo && setEmissoras([]))
    return () => {
      ativo = false
    }
  }, [orgId])

  // CNPJs que emitem o modelo escolhido; vem o do pedido, se servir, senão o primeiro.
  const prontas = (emissoras ?? []).filter((e) => e.nfe_status === 'pronta' && (modelo === 'nfe' || e.nfse_habilitada_focus))
  const escolhida = prontas.find((e) => e.id === emissora) ?? prontas.find((e) => e.id === emissoraDoAlvo) ?? prontas[0]
  const descricao = descricaoDigitada ?? (alvo.tipo === 'cliente' ? (escolhida?.nfse_descricao_padrao ?? '') : '')
  const valorNum = Number(valor.replace(/\./g, '').replace(',', '.'))
  const invalido = !escolhida || (alvo.tipo === 'cliente' && (!(valorNum > 0) || !descricao.trim()))

  async function emitir(ev: FormEvent) {
    ev.preventDefault()
    if (invalido) return
    setEnviando(true)
    setErro(null)
    try {
      if (modelo === 'nfe' && alvo.tipo === 'pedido') {
        await emitirNota({ pedido_id: alvo.pedido.id, emissora_id: escolhida!.id, forma_pagamento: forma, a_prazo: aPrazo, presenca, informacoes })
      } else {
        await emitirNotaServico({
          ...(alvo.tipo === 'pedido' ? { pedido_id: alvo.pedido.id } : alvo.tipo === 'os' ? { os_id: alvo.osId } : { cliente_id: alvo.clienteId, valor: valorNum }),
          emissora_id: escolhida!.id, descricao, data_competencia: competencia, iss_retido: issRetido, informacoes,
        })
      }
      aoEmitir()
    } catch (e) {
      setErro({ mensagem: (e as Error).message, faltando: e instanceof FaltaParaEmitir ? e.faltando : [] })
      setEnviando(false)
    }
  }

  const titulo =
    alvo.tipo === 'pedido' ? `Emitir nota · pedido #${alvo.pedido.numero}` : alvo.tipo === 'os' ? `Emitir NFS-e · OS nº ${alvo.numero}` : `Nota de serviço · ${alvo.nome}`

  return (
    <Modal
      aberto
      titulo={titulo}
      largura="max-w-xl"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-emitir-nota" carregando={enviando} disabled={invalido}>
            {escolhida?.nfe_ambiente === 'producao' ? `Emitir ${NOME_MODELO[modelo]}` : `Emitir ${NOME_MODELO[modelo]} de teste`}
          </Botao>
        </>
      }
    >
      <form id="form-emitir-nota" onSubmit={emitir} className="space-y-4">
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

        {alvo.tipo === 'pedido' && (
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Tipo de nota</legend>
            {(['nfe', 'nfse'] as const).map((m) => (
              <label key={m}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-pequeno ring-1 ring-inset ${
                  modelo === m ? 'bg-primaria-suave font-medium text-primaria ring-primaria' : 'ring-borda'
                }`}>
                <input type="radio" name="modelo-nota" className="sr-only" checked={modelo === m} onChange={() => setModelo(m)} />
                {m === 'nfe' ? 'NF-e (venda de mercadoria)' : 'NFS-e (serviço)'}
              </label>
            ))}
          </fieldset>
        )}

        {emissoras && !prontas.length ? (
          <Aviso tom="atencao">
            {modelo === 'nfse'
              ? 'Nenhum CNPJ está com a nota de serviço ativa. Configure em Configurações → Empresa → Nota fiscal.'
              : 'Nenhum CNPJ está pronto para emitir. Configure em Configurações → Empresa → Nota fiscal.'}
          </Aviso>
        ) : (
          <Campo rotulo="CNPJ que emite" id="nota-cnpj">
            <select id="nota-cnpj" value={escolhida?.id ?? ''} onChange={(e) => setEmissora(e.target.value)} className={CLASSE_CAMPO} disabled={!emissoras}>
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
        {escolhida?.nfe_ambiente === 'homologacao' && <p className="text-legenda text-atencao">Este CNPJ está em teste (homologação): a nota sai sem valor fiscal.</p>}

        {modelo === 'nfe' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Forma de pagamento" id="nota-forma">
                <select id="nota-forma" value={forma} onChange={(e) => setForma(e.target.value)} className={CLASSE_CAMPO}>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f.valor} value={f.valor}>{f.rotulo}</option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Como foi a venda" id="nota-presenca">
                <select id="nota-presenca" value={presenca} onChange={(e) => setPresenca(Number(e.target.value))} className={CLASSE_CAMPO}>
                  {PRESENCAS.map((p) => (
                    <option key={p.valor} value={p.valor}>{p.rotulo}</option>
                  ))}
                </select>
              </Campo>
            </div>
            <label className="flex items-center gap-2 text-pequeno text-texto-2">
              <input type="checkbox" checked={aPrazo} onChange={(e) => setAPrazo(e.target.checked)} className="size-4 accent-primaria" />
              Pagamento a prazo
            </label>
          </>
        ) : (
          <>
            <Campo
              rotulo="Descrição do serviço"
              id="nota-descricao"
              ajuda={alvo.tipo === 'cliente' ? 'Sai na nota como o serviço prestado.' : 'Vazio: o Livih monta pelos itens. Até 1.000 caracteres.'}
            >
              <textarea id="nota-descricao" rows={3} maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)}
                className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none" />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              {alvo.tipo === 'cliente' && (
                <CampoTexto rotulo="Valor do serviço (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
              )}
              <CampoTexto rotulo="Competência" type="date" value={competencia} max={hoje()} onChange={(e) => setCompetencia(e.target.value)} ajuda="Quando o serviço foi prestado." />
            </div>
            <label className="flex items-center gap-2 text-pequeno text-texto-2">
              <input type="checkbox" checked={issRetido} onChange={(e) => setIssRetido(e.target.checked)} className="size-4 accent-primaria" />
              ISS retido pelo tomador (o cliente recolhe o ISS)
            </label>
          </>
        )}

        <Campo rotulo="Informações adicionais (opcional)" id="nota-info">
          <textarea id="nota-info" rows={2} maxLength={2000} value={informacoes} onChange={(e) => setInformacoes(e.target.value)}
            className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none" />
        </Campo>
      </form>
    </Modal>
  )
}
