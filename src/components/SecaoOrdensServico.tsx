import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { lerNumero, moeda } from '../services/formato'
import { ModalEscolherCliente } from './ClienteDoContato'
import {
  carregarConfiguracao,
  carregarOficina,
  definirPrazoCliente,
  desativarServico,
  desativarTipo,
  listarPrazosClientes,
  ROTULO_MARCO,
  salvarConfig,
  salvarEtapas,
  salvarServico,
  salvarTipo,
  type CampoTipo,
  type ConfiguracaoOs,
  type Marco,
  type PrazoCliente,
  type ServicoOs,
  type TipoItem,
} from '../services/os'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Icone } from './Icone'
import { Campo, CLASSE_CAMPO } from './ModaisOs'
import { Modal } from './Modal'

/** Configurações → Ordens de serviço (dono e admin): etapas, prazos, tipos de item e tabela de serviços. */
export function SecaoOrdensServico() {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [dados, setDados] = useState<{ orgId: string; cfg: ConfiguracaoOs; abertosPorEtapa: Map<string, number>; prazos: PrazoCliente[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let ativo = true
    Promise.all([carregarConfiguracao(orgId), carregarOficina(orgId), listarPrazosClientes(orgId)])
      .then(([cfg, oficina, prazos]) => {
        if (!ativo) return
        const abertosPorEtapa = new Map<string, number>()
        oficina.itens.forEach((i) => abertosPorEtapa.set(i.etapa_id, (abertosPorEtapa.get(i.etapa_id) ?? 0) + 1))
        setDados({ orgId, cfg, abertosPorEtapa, prazos })
        setErro(null)
      })
      .catch((e) => ativo && setErro((e as Error).message || 'Não foi possível carregar a configuração.'))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  const atual = dados?.orgId === orgId ? dados : null
  const recarregar = () => setVersao((v) => v + 1)

  if (!gerencia) return <Aviso>Só dono e admin mudam a configuração das ordens de serviço.</Aviso>
  if (erro) return <Aviso tom="erro">{erro}</Aviso>
  if (!atual) return <p className="text-pequeno text-texto-3">Carregando…</p>

  return (
    <div className="space-y-6">
      <Etapas key={`e${versao}`} orgId={orgId} cfg={atual.cfg} itensPorEtapa={atual.abertosPorEtapa} aoSalvar={recarregar} />
      <Prazos key={`p${versao}`} orgId={orgId} cfg={atual.cfg} prazos={atual.prazos} aoSalvar={recarregar} />
      <Tipos orgId={orgId} cfg={atual.cfg} aoSalvar={recarregar} />
      <Servicos orgId={orgId} cfg={atual.cfg} aoSalvar={recarregar} />
    </div>
  )
}

function Bloco({ titulo, descricao, children, acao }: { titulo: string; descricao: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{titulo}</h2>
          <p className="text-pequeno text-texto-3">{descricao}</p>
        </div>
        {acao}
      </div>
      {children}
    </section>
  )
}

// ---- etapas ----

type LinhaEtapa = { chave: string; id: string | null; nome: string; marco: Marco | ''; prazo: string }

function Etapas({ orgId, cfg, itensPorEtapa, aoSalvar }: { orgId: string; cfg: ConfiguracaoOs; itensPorEtapa: Map<string, number>; aoSalvar: () => void }) {
  const [linhas, setLinhas] = useState<LinhaEtapa[]>(() =>
    cfg.etapas.map((e) => ({ chave: e.id, id: e.id, nome: e.nome, marco: e.marco ?? '', prazo: e.prazo_padrao_dias == null ? '' : String(e.prazo_padrao_dias) })),
  )
  const [mover, setMover] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  const ficam = linhas.filter((l) => l.id)
  const removidas = cfg.etapas.filter((e) => !linhas.some((l) => l.id === e.id) && (itensPorEtapa.get(e.id) ?? 0) > 0)
  const destinoDe = (id: string) => (ficam.some((l) => l.id === mover[id]) ? mover[id] : (ficam[0]?.id ?? ''))
  const marcosUsados = linhas.map((l) => l.marco).filter(Boolean)
  const repetido = marcosUsados.length !== new Set(marcosUsados).size
  const prazoInvalido = linhas.some((l) => l.prazo && !(Number.isInteger(Number(l.prazo)) && Number(l.prazo) >= 0 && Number(l.prazo) <= 365))
  const incompleto = linhas.some((l) => !l.nome.trim()) || linhas.length < 2 || repetido || prazoInvalido || (removidas.length > 0 && !ficam.length)

  const trocar = (i: number, j: number) => {
    const l = [...linhas]
    ;[l[i], l[j]] = [l[j], l[i]]
    setLinhas(l)
  }
  const mudar = (chave: string, campo: Partial<LinhaEtapa>) => {
    setSalvo(false)
    setLinhas(linhas.map((x) => (x.chave === chave ? { ...x, ...campo } : x)))
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      await salvarEtapas(
        orgId,
        linhas.map((l) => ({ id: l.id, nome: l.nome.trim(), marco: l.marco || null, prazo_padrao_dias: l.prazo ? Number(l.prazo) : null })),
        Object.fromEntries(removidas.map((r) => [r.id, destinoDe(r.id)])),
      )
      setSalvo(true)
      aoSalvar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Bloco
      titulo="Etapas"
      descricao="Os nomes do seu processo, na ordem do quadro. O marco diz ao Livih o que a etapa significa (para o painel e a previsão); o prazo padrão é o tempo normal da etapa até haver histórico."
    >
      <form onSubmit={salvar} className="space-y-3">
        <div className="hidden grid-cols-[1.5rem_1fr_11rem_6rem_6.5rem] gap-2 text-legenda text-texto-3 sm:grid">
          <span />
          <span>Nome</span>
          <span>Marco</span>
          <span>Prazo (dias)</span>
          <span />
        </div>
        <ol className="space-y-2">
          {linhas.map((l, i) => (
            <li key={l.chave} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 sm:grid-cols-[1.5rem_1fr_11rem_6rem_6.5rem]">
              <span className="text-right text-legenda text-texto-3">{i + 1}</span>
              <input aria-label={`Nome da etapa ${i + 1}`} value={l.nome} maxLength={40} required onChange={(e) => mudar(l.chave, { nome: e.target.value })} className={CLASSE_CAMPO} />
              <select
                aria-label={`Marco da etapa ${i + 1}`}
                value={l.marco}
                onChange={(e) => mudar(l.chave, { marco: e.target.value as Marco | '' })}
                className={`${CLASSE_CAMPO} col-start-2 sm:col-start-auto`}
              >
                <option value="">Sem marco</option>
                {(Object.keys(ROTULO_MARCO) as Marco[]).map((m) => (
                  <option key={m} value={m}>
                    {ROTULO_MARCO[m]}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Prazo padrão da etapa ${i + 1}, em dias`}
                inputMode="numeric"
                value={l.prazo}
                placeholder="—"
                onChange={(e) => mudar(l.chave, { prazo: e.target.value.replace(/\D/g, '') })}
                className={`${CLASSE_CAMPO} col-start-2 sm:col-start-auto`}
              />
              <span className="col-start-3 row-start-1 flex sm:col-start-auto sm:row-start-auto">
                <button type="button" onClick={() => trocar(i, i - 1)} disabled={i === 0} aria-label={`Subir ${l.nome || 'etapa'}`}
                  className="flex size-9 items-center justify-center rounded-md text-texto-3 hover:bg-slate-100 hover:text-texto disabled:invisible">
                  <Icone nome="abaixo" className="size-4 rotate-180" />
                </button>
                <button type="button" onClick={() => trocar(i, i + 1)} disabled={i === linhas.length - 1} aria-label={`Descer ${l.nome || 'etapa'}`}
                  className="flex size-9 items-center justify-center rounded-md text-texto-3 hover:bg-slate-100 hover:text-texto disabled:invisible">
                  <Icone nome="abaixo" className="size-4" />
                </button>
                <button type="button" onClick={() => setLinhas(linhas.filter((x) => x.chave !== l.chave))} disabled={linhas.length <= 2} aria-label={`Remover ${l.nome || 'etapa'}`}
                  className="flex size-9 items-center justify-center rounded-md text-texto-3 hover:bg-erro-suave hover:text-erro disabled:invisible">
                  <Icone nome="lixeira" className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ol>
        {linhas.length < 15 && (
          <button
            type="button"
            onClick={() => setLinhas([...linhas, { chave: crypto.randomUUID(), id: null, nome: '', marco: '', prazo: '' }])}
            className="ml-8 text-pequeno font-medium text-primaria hover:underline"
          >
            + Etapa
          </button>
        )}
        {repetido && <p className="text-legenda text-atencao">Cada marco só pode estar em uma etapa.</p>}
        {!linhas.some((l) => l.marco === 'finalizado') && (
          <p className="text-legenda text-texto-3">Sem o marco Finalizado, a previsão conta até a última etapa.</p>
        )}
        {removidas.length > 0 && (
          <div className="space-y-2 rounded-md bg-atencao-suave p-3 text-pequeno">
            <p className="text-atencao">As etapas removidas têm itens. Escolha para onde eles vão (a mudança entra no histórico com a data de hoje):</p>
            {removidas.map((r) => (
              <label key={r.id} className="flex flex-wrap items-center gap-2 text-texto-2">
                {itensPorEtapa.get(r.id)} de “{r.nome}” para
                <select value={destinoDe(r.id)} onChange={(e) => setMover({ ...mover, [r.id]: e.target.value })}
                  className="h-9 rounded-md border border-borda bg-superficie px-2 focus:border-primaria focus:outline-none">
                  {ficam.map((l) => (
                    <option key={l.id} value={l.id!}>
                      {l.nome || 'etapa'}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div className="flex items-center gap-3">
          <Botao type="submit" carregando={salvando} disabled={incompleto}>
            Salvar etapas
          </Botao>
          {salvo && <span className="text-pequeno text-primaria">Salvo.</span>}
        </div>
      </form>
    </Bloco>
  )
}

// ---- prazos ----

function Prazos({ orgId, cfg, prazos, aoSalvar }: { orgId: string; cfg: ConfiguracaoOs; prazos: PrazoCliente[]; aoSalvar: () => void }) {
  const [padrao, setPadrao] = useState(String(cfg.config.prazo_pagamento_dias))
  const [fator, setFator] = useState(String(cfg.config.alerta_fator).replace('.', ','))
  const [novoCliente, setNovoCliente] = useState<{ id: string; nome: string } | null>(null)
  const [escolher, setEscolher] = useState(false)
  const [novoPrazo, setNovoPrazo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)

  const nPadrao = Number(padrao)
  const nFator = lerNumero(fator)
  const valido = Number.isInteger(nPadrao) && nPadrao >= 0 && nPadrao <= 365 && nFator != null && nFator >= 1 && nFator <= 10

  async function executar(acao: () => Promise<void>) {
    setSalvando(true)
    setErro(null)
    setSalvo(false)
    try {
      await acao()
      setSalvo(true)
      aoSalvar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Bloco titulo="Prazos" descricao="O vencimento de cada faturamento é a data + o prazo do cliente. Item parado é o que passa do tempo normal da etapa vezes o fator.">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void executar(() => salvarConfig(orgId, { prazo_pagamento_dias: nPadrao, alerta_fator: nFator! }))
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <CampoTexto rotulo="Prazo de pagamento padrão (dias)" inputMode="numeric" value={padrao} onChange={(e) => setPadrao(e.target.value.replace(/\D/g, ''))} className="w-56" />
        <CampoTexto rotulo="Parado a partir de (× o normal)" inputMode="decimal" value={fator} onChange={(e) => setFator(e.target.value)} className="w-56" />
        <Botao type="submit" carregando={salvando} disabled={!valido}>
          Salvar
        </Botao>
        {salvo && <span className="pb-2 text-pequeno text-primaria">Salvo.</span>}
      </form>

      <div className="space-y-2">
        <p className="text-pequeno font-medium text-texto-2">Clientes com prazo diferente</p>
        {prazos.length > 0 && (
          <ul className="divide-y divide-borda rounded-md border border-borda text-pequeno">
            {prazos.map((p) => (
              <li key={p.cliente_id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{p.cliente?.nome ?? 'Cliente'}</span>
                <span className="tabular-nums">{p.prazo_pagamento_dias} dias</span>
                <button type="button" onClick={() => void executar(() => definirPrazoCliente(orgId, p.cliente_id, null))} aria-label="Voltar ao prazo padrão"
                  className="rounded-md p-1.5 text-texto-3 hover:bg-erro-suave hover:text-erro">
                  <Icone nome="lixeira" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Campo rotulo="Cliente" id="prazo-cliente">
            <button id="prazo-cliente" type="button" onClick={() => setEscolher(true)} className={`${CLASSE_CAMPO} w-72 truncate text-left`}>
              {novoCliente?.nome ?? <span className="text-texto-3">Escolha…</span>}
            </button>
          </Campo>
          <CampoTexto rotulo="Dias" inputMode="numeric" value={novoPrazo} onChange={(e) => setNovoPrazo(e.target.value.replace(/\D/g, ''))} className="w-24" />
          <Botao
            variante="secundario"
            disabled={!novoCliente || !novoPrazo || Number(novoPrazo) > 365 || salvando}
            onClick={() =>
              void executar(async () => {
                await definirPrazoCliente(orgId, novoCliente!.id, Number(novoPrazo))
                setNovoCliente(null)
                setNovoPrazo('')
              })
            }
          >
            Adicionar
          </Botao>
        </div>
        <p className="text-legenda text-texto-3">Pelo cadastro de Clientes. OS sem cliente usa o prazo padrão.</p>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {escolher && (
        <ModalEscolherCliente
          orgId={orgId}
          aoFechar={() => setEscolher(false)}
          aoEscolher={(id, c) => {
            setNovoCliente({ id, nome: c.nome })
            setEscolher(false)
          }}
        />
      )}
    </Bloco>
  )
}

// ---- tipos de item ----

function Tipos({ orgId, cfg, aoSalvar }: { orgId: string; cfg: ConfiguracaoOs; aoSalvar: () => void }) {
  const [editando, setEditando] = useState<TipoItem | 'novo' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  return (
    <Bloco
      titulo="Tipos de item"
      descricao="Motor, bomba, ferramenta, celular… Cada tipo diz como se chama a identificação (nº de série, IMEI, placa) e pode ter campos próprios."
      acao={<Botao tamanho="sm" icone="mais" variante="secundario" onClick={() => setEditando('novo')}>Tipo</Botao>}
    >
      {cfg.tipos.length ? (
        <ul className="divide-y divide-borda rounded-md border border-borda text-pequeno">
          {cfg.tipos.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2">
              <button type="button" onClick={() => setEditando(t)} className="min-w-0 flex-1 text-left hover:text-primaria">
                <span className="font-medium">{t.nome}</span>
                <span className="text-texto-3">
                  {' '}
                  · {t.rotulo_identificacao}
                  {t.campos.length > 0 && ` · ${t.campos.map((c) => c.rotulo).join(', ')}`}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remover ${t.nome}`}
                onClick={() => desativarTipo(t.id).then(aoSalvar, (e: Error) => setErro(e.message))}
                className="rounded-md p-1.5 text-texto-3 hover:bg-erro-suave hover:text-erro"
              >
                <Icone nome="lixeira" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-pequeno text-texto-3">Nenhum tipo ainda. Sem tipo, todo item usa "Nº de série".</p>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {editando && (
        <ModalTipo
          orgId={orgId}
          cfg={cfg}
          tipo={editando === 'novo' ? null : editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null)
            aoSalvar()
          }}
        />
      )}
    </Bloco>
  )
}

type LinhaCampo = CampoTipo & { opcoesTexto: string }

const chaveDe = (rotulo: string) =>
  rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'campo'

function ModalTipo({ orgId, cfg, tipo, aoFechar, aoSalvar }: { orgId: string; cfg: ConfiguracaoOs; tipo: TipoItem | null; aoFechar: () => void; aoSalvar: () => void }) {
  const [nome, setNome] = useState(tipo?.nome ?? '')
  const [rotulo, setRotulo] = useState(tipo?.rotulo_identificacao ?? 'Nº de série')
  const [servico, setServico] = useState(tipo?.servico_padrao_id ?? '')
  const [campos, setCampos] = useState<LinhaCampo[]>(() => (tipo?.campos ?? []).map((c) => ({ ...c, opcoesTexto: (c.opcoes ?? []).join(', ') })))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const rotulos = campos.map((c) => c.rotulo.trim().toLowerCase())
  const invalido = !nome.trim() || !rotulo.trim() || rotulos.some((r) => !r) || new Set(rotulos).size !== rotulos.length

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      await salvarTipo(orgId, tipo?.id ?? null, {
        nome: nome.trim(),
        rotulo_identificacao: rotulo.trim(),
        servico_padrao_id: servico || null,
        // A chave fica a mesma depois de criada: renomear o rótulo não perde o que os itens já têm.
        campos: campos.map(({ opcoesTexto, ...c }) => ({
          chave: c.chave || chaveDe(c.rotulo),
          rotulo: c.rotulo.trim(),
          tipo: c.tipo,
          obrigatorio: !!c.obrigatorio,
          ...(c.tipo === 'lista' ? { opcoes: opcoesTexto.split(',').map((o) => o.trim()).filter(Boolean) } : {}),
        })),
      })
      aoSalvar()
    } catch (e) {
      setErro((e as Error).message)
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo={tipo ? `Tipo: ${tipo.nome}` : 'Novo tipo de item'}
      largura="max-w-xl"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-tipo" carregando={salvando} disabled={invalido}>
            Salvar
          </Botao>
        </>
      }
    >
      <form id="form-tipo" onSubmit={salvar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTexto rotulo="Nome" value={nome} maxLength={60} required onChange={(e) => setNome(e.target.value)} placeholder="Motor" />
          <CampoTexto rotulo="Nome da identificação" value={rotulo} maxLength={40} required onChange={(e) => setRotulo(e.target.value)} />
        </div>
        {cfg.servicos.length > 0 && (
          <Campo rotulo="Serviço padrão" id="tipo-servico" ajuda="O valor do item novo vem dele (dá para trocar no item).">
            <select id="tipo-servico" value={servico} onChange={(e) => setServico(e.target.value)} className={CLASSE_CAMPO}>
              <option value="">Nenhum</option>
              {cfg.servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} · {moeda(Number(s.preco), true)}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <fieldset className="space-y-2">
          <legend className="text-pequeno font-medium text-texto-2">Campos extras</legend>
          {campos.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_8rem_auto_auto] items-center gap-2">
              <input aria-label={`Nome do campo ${i + 1}`} value={c.rotulo} maxLength={40} placeholder="Tensão"
                onChange={(e) => setCampos(campos.map((x, j) => (j === i ? { ...x, rotulo: e.target.value } : x)))} className={CLASSE_CAMPO} />
              <select aria-label={`Tipo do campo ${i + 1}`} value={c.tipo}
                onChange={(e) => setCampos(campos.map((x, j) => (j === i ? { ...x, tipo: e.target.value as CampoTipo['tipo'] } : x)))} className={CLASSE_CAMPO}>
                <option value="texto">Texto</option>
                <option value="numero">Número</option>
                <option value="data">Data</option>
                <option value="lista">Lista</option>
              </select>
              <label className="flex items-center gap-1 text-legenda text-texto-2">
                <input type="checkbox" checked={!!c.obrigatorio} className="size-4 accent-primaria"
                  onChange={(e) => setCampos(campos.map((x, j) => (j === i ? { ...x, obrigatorio: e.target.checked } : x)))} />
                Obrigatório
              </label>
              <button type="button" aria-label={`Remover campo ${i + 1}`} onClick={() => setCampos(campos.filter((_, j) => j !== i))}
                className="rounded-md p-1.5 text-texto-3 hover:bg-erro-suave hover:text-erro">
                <Icone nome="lixeira" className="size-4" />
              </button>
              {c.tipo === 'lista' && (
                <input aria-label={`Opções do campo ${i + 1}`} value={c.opcoesTexto} placeholder="Opções separadas por vírgula: 220V, 380V"
                  onChange={(e) => setCampos(campos.map((x, j) => (j === i ? { ...x, opcoesTexto: e.target.value } : x)))} className={`${CLASSE_CAMPO} col-span-4`} />
              )}
            </div>
          ))}
          {campos.length < 20 && (
            <button type="button" onClick={() => setCampos([...campos, { chave: '', rotulo: '', tipo: 'texto', opcoesTexto: '' }])}
              className="text-pequeno font-medium text-primaria hover:underline">
              + Campo
            </button>
          )}
        </fieldset>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Modal>
  )
}

// ---- tabela de serviços ----

function Servicos({ orgId, cfg, aoSalvar }: { orgId: string; cfg: ConfiguracaoOs; aoSalvar: () => void }) {
  const [editando, setEditando] = useState<ServicoOs | 'novo' | null>(null)
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const abrir = (s: ServicoOs | 'novo') => {
    setEditando(s)
    setCodigo(s === 'novo' ? '' : (s.codigo ?? ''))
    setNome(s === 'novo' ? '' : s.nome)
    setPreco(s === 'novo' ? '' : String(s.preco).replace('.', ','))
    setErro(null)
  }
  const valor = lerNumero(preco)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!editando) return
    setSalvando(true)
    setErro(null)
    try {
      await salvarServico(orgId, editando === 'novo' ? null : editando.id, { codigo: codigo.trim() || null, nome: nome.trim(), preco: valor ?? 0 })
      setEditando(null)
      aoSalvar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Bloco
      titulo="Tabela de serviços"
      descricao="O preço padrão de cada serviço (ex.: reparo de spindle R$ 150). Escolher o serviço no item preenche o valor, que pode ser trocado caso a caso."
      acao={<Botao tamanho="sm" icone="mais" variante="secundario" onClick={() => abrir('novo')}>Serviço</Botao>}
    >
      {cfg.servicos.length ? (
        <ul className="divide-y divide-borda rounded-md border border-borda text-pequeno">
          {cfg.servicos.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-3 py-2">
              <button type="button" onClick={() => abrir(s)} className="min-w-0 flex-1 text-left hover:text-primaria">
                {s.codigo && <span className="text-texto-3">{s.codigo} · </span>}
                <span className="font-medium">{s.nome}</span>
              </button>
              <span className="tabular-nums">{moeda(Number(s.preco), true)}</span>
              <button type="button" aria-label={`Remover ${s.nome}`} onClick={() => desativarServico(s.id).then(aoSalvar, (e: Error) => setErro(e.message))}
                className="rounded-md p-1.5 text-texto-3 hover:bg-erro-suave hover:text-erro">
                <Icone nome="lixeira" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-pequeno text-texto-3">Nenhum serviço ainda.</p>
      )}
      {erro && !editando && <Aviso tom="erro">{erro}</Aviso>}
      {editando && (
        <Modal
          aberto
          titulo={editando === 'novo' ? 'Novo serviço' : 'Editar serviço'}
          aoFechar={() => setEditando(null)}
          rodape={
            <>
              <Botao variante="secundario" onClick={() => setEditando(null)} disabled={salvando}>
                Cancelar
              </Botao>
              <Botao type="submit" form="form-servico" carregando={salvando} disabled={!nome.trim() || valor === undefined || (valor ?? 0) < 0}>
                Salvar
              </Botao>
            </>
          }
        >
          <form id="form-servico" onSubmit={salvar} className="space-y-3">
            <CampoTexto rotulo="Nome" value={nome} maxLength={200} required onChange={(e) => setNome(e.target.value)} placeholder="Reparo spindle SJ ZT" />
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoTexto rotulo="Código (opcional)" value={codigo} maxLength={60} onChange={(e) => setCodigo(e.target.value)} />
              <CampoTexto rotulo="Preço (R$)" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />
            </div>
            {erro && <Aviso tom="erro">{erro}</Aviso>}
          </form>
        </Modal>
      )}
    </Bloco>
  )
}
