import { useState, type FormEvent } from 'react'
import { salvarFunil, type Etapa } from '../services/crm'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'

type Linha = { chave: string; id: string | null; nome: string }

const MAX_ABERTAS = 12
const CLASSE_CAMPO =
  'block h-10 w-full min-w-0 rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none'

/**
 * Editar o funil da empresa: etapas abertas (nome, ordem, nova, remover) e os nomes de Ganho e Perdido, que
 * sempre existem. Etapa removida que tem cartões pede para onde eles vão.
 */
export function ModalEtapas({
  orgId,
  etapas,
  cartoes,
  aoFechar,
  aoSalvar,
}: {
  orgId: string
  etapas: Etapa[]
  /** Cartões por etapa (id → quantidade). */
  cartoes: Map<string, number>
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [abertas, setAbertas] = useState<Linha[]>(() =>
    etapas.filter((e) => e.tipo === 'aberta').map((e) => ({ chave: e.id, id: e.id, nome: e.nome })),
  )
  const [ganho, setGanho] = useState(() => etapas.find((e) => e.tipo === 'ganho')?.nome ?? 'Ganho')
  const [perdido, setPerdido] = useState(() => etapas.find((e) => e.tipo === 'perdido')?.nome ?? 'Perdido')
  const [mover, setMover] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Removidas com cartões: precisam de destino entre as que ficam (e já existem).
  const ficam = abertas.filter((l) => l.id)
  const removidas = etapas.filter((e) => e.tipo === 'aberta' && !abertas.some((l) => l.id === e.id) && (cartoes.get(e.id) ?? 0) > 0)
  const destinoDe = (id: string) => (ficam.some((l) => l.id === mover[id]) ? mover[id] : (ficam[0]?.id ?? ''))
  const nomeAtual = (id: string) => abertas.find((l) => l.id === id)?.nome || etapas.find((e) => e.id === id)?.nome

  function trocar(i: number, j: number) {
    const lista = [...abertas]
    ;[lista[i], lista[j]] = [lista[j], lista[i]]
    setAbertas(lista)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      await salvarFunil(
        orgId,
        abertas.map((l) => ({ id: l.id, nome: l.nome.trim() })),
        ganho.trim(),
        perdido.trim(),
        Object.fromEntries(removidas.map((r) => [r.id, destinoDe(r.id)])),
      )
      aoSalvar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const semDestino = removidas.length > 0 && !ficam.length
  const incompleto = abertas.some((l) => !l.nome.trim()) || !ganho.trim() || !perdido.trim()

  return (
    <Modal
      aberto
      titulo="Etapas do funil"
      largura="max-w-xl"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-etapas" carregando={salvando} disabled={incompleto || semDestino}>
            Salvar etapas
          </Botao>
        </>
      }
    >
      <form id="form-etapas" onSubmit={salvar} className="space-y-5">
        <p className="text-pequeno text-texto-2">
          Use os nomes do seu processo de venda. O agente passa a usar os nomes novos na próxima conversa.
        </p>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-pequeno font-medium text-texto-2">Etapas em andamento, na ordem do quadro</legend>
          <ol className="space-y-2">
            {abertas.map((l, i) => (
              <li key={l.chave} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="w-5 shrink-0 text-right text-legenda text-texto-3">
                  {i + 1}
                </span>
                <label className="sr-only" htmlFor={`etapa-${l.chave}`}>
                  Nome da etapa {i + 1}
                </label>
                <input
                  id={`etapa-${l.chave}`}
                  value={l.nome}
                  maxLength={40}
                  required
                  onChange={(e) => setAbertas(abertas.map((x) => (x.chave === l.chave ? { ...x, nome: e.target.value } : x)))}
                  className={CLASSE_CAMPO}
                />
                {l.id && (cartoes.get(l.id) ?? 0) > 0 && (
                  <span className="shrink-0 text-legenda text-texto-3" title="Oportunidades nesta etapa">
                    {cartoes.get(l.id)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => trocar(i, i - 1)}
                  disabled={i === 0}
                  aria-label={`Subir ${l.nome || 'etapa'}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-texto-3 hover:bg-slate-100 hover:text-texto disabled:invisible"
                >
                  <Icone nome="abaixo" className="size-4 rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => trocar(i, i + 1)}
                  disabled={i === abertas.length - 1}
                  aria-label={`Descer ${l.nome || 'etapa'}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-texto-3 hover:bg-slate-100 hover:text-texto disabled:invisible"
                >
                  <Icone nome="abaixo" className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setAbertas(abertas.filter((x) => x.chave !== l.chave))}
                  disabled={abertas.length === 1}
                  aria-label={`Remover ${l.nome || 'etapa'}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-texto-3 hover:bg-erro-suave hover:text-erro disabled:invisible"
                >
                  <Icone nome="lixeira" className="size-4" />
                </button>
              </li>
            ))}
          </ol>
          {abertas.length < MAX_ABERTAS && (
            <button
              type="button"
              onClick={() => setAbertas([...abertas, { chave: crypto.randomUUID(), id: null, nome: '' }])}
              className="ml-6 text-pequeno font-medium text-primaria hover:underline"
            >
              + Etapa
            </button>
          )}
        </fieldset>

        {removidas.length > 0 && (
          <div className="space-y-3 rounded-md bg-atencao-suave p-3">
            <p className="text-pequeno text-atencao">As etapas removidas têm oportunidades. Escolha para onde elas vão:</p>
            {semDestino ? (
              <p className="text-pequeno text-atencao">Mantenha pelo menos uma das etapas atuais para receber esses cartões.</p>
            ) : (
              removidas.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 text-pequeno">
                  <label htmlFor={`destino-${r.id}`} className="text-texto-2">
                    {cartoes.get(r.id)} de “{r.nome}” para
                  </label>
                  <select
                    id={`destino-${r.id}`}
                    value={destinoDe(r.id)}
                    onChange={(e) => setMover({ ...mover, [r.id]: e.target.value })}
                    className="h-9 rounded-md border border-borda bg-superficie px-2 focus:border-primaria focus:outline-none"
                  >
                    {ficam.map((l) => (
                      <option key={l.id} value={l.id!}>
                        {nomeAtual(l.id!)}
                      </option>
                    ))}
                  </select>
                </div>
              ))
            )}
          </div>
        )}

        <fieldset className="space-y-3">
          <legend className="mb-1 text-pequeno font-medium text-texto-2">Fechamento</legend>
          <p className="text-legenda text-texto-3">
            Sempre existem e ficam no fim do quadro. Só a equipe move para elas; o agente nunca fecha negócio.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="etapa-ganho" className="flex items-center gap-1.5 text-pequeno text-texto-2">
                <Icone nome="check" className="size-4 text-primaria" /> Negócio fechado
              </label>
              <input id="etapa-ganho" value={ganho} maxLength={40} required onChange={(e) => setGanho(e.target.value)} className={CLASSE_CAMPO} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="etapa-perdido" className="flex items-center gap-1.5 text-pequeno text-texto-2">
                <Icone nome="fechar" className="size-4 text-erro" /> Negócio perdido
              </label>
              <input
                id="etapa-perdido"
                value={perdido}
                maxLength={40}
                required
                onChange={(e) => setPerdido(e.target.value)}
                className={CLASSE_CAMPO}
              />
            </div>
          </div>
        </fieldset>

        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Modal>
  )
}
