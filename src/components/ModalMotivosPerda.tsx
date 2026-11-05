import { useEffect, useState } from 'react'
import { listarMotivosPerda, salvarMotivosPerda } from '../services/crm'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'

type Item = { chave: string; id?: string; nome: string; ativo: boolean }

/**
 * Oportunidades → Motivos de perda (dono e admin): a lista que aparece ao marcar um negócio como perdido e que o Painel
 * soma. Desativar tira da escolha sem perder o histórico; apagar solta as oportunidades que usavam o motivo.
 */
export function ModalMotivosPerda({ orgId, aoFechar }: { orgId: string; aoFechar: () => void }) {
  const [itens, setItens] = useState<Item[] | null>(null)
  const [apagar, setApagar] = useState<string[]>([])
  const [novo, setNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarMotivosPerda(orgId)
      .then((l) => ativo && setItens(l.map((m) => ({ chave: m.id, id: m.id, nome: m.nome, ativo: m.ativo }))))
      .catch(() => ativo && setErro('Não foi possível carregar os motivos.'))
    return () => {
      ativo = false
    }
  }, [orgId])

  const mudar = (chave: string, campos: Partial<Item>) => setItens((l) => l?.map((x) => (x.chave === chave ? { ...x, ...campos } : x)) ?? l)
  const mover = (i: number, d: -1 | 1) =>
    setItens((l) => {
      if (!l || i + d < 0 || i + d >= l.length) return l
      const n = [...l]
      ;[n[i], n[i + d]] = [n[i + d], n[i]]
      return n
    })

  function adicionar() {
    const nome = novo.trim()
    if (!nome || !itens) return
    if (itens.some((x) => x.nome.trim().toLowerCase() === nome.toLowerCase())) return setErro(`O motivo “${nome}” já está na lista.`)
    setItens([...itens, { chave: `novo-${Date.now()}`, nome, ativo: true }])
    setNovo('')
    setErro(null)
  }

  async function salvar() {
    if (!itens) return
    if (itens.some((x) => !x.nome.trim())) return setErro('Dê um nome a cada motivo, ou apague o que estiver vazio.')
    setSalvando(true)
    setErro(null)
    try {
      await salvarMotivosPerda(orgId, itens, apagar)
      aoFechar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo="Motivos de perda"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao onClick={() => void salvar()} carregando={salvando} disabled={!itens}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-pequeno text-texto-2">
          Aparecem ao marcar um negócio como perdido, e o Painel mostra quantos foram perdidos por cada um. Desativado sai da
          escolha, mas continua nos negócios antigos.
        </p>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {!itens ? (
          !erro && <p className="text-pequeno text-texto-3">Carregando…</p>
        ) : (
          <ul className="divide-y divide-borda rounded-md border border-borda">
            {itens.map((m, i) => (
              <li key={m.chave} className="flex items-center gap-2 px-2 py-1.5">
                <span className="flex flex-col">
                  <button type="button" aria-label={`Subir ${m.nome}`} onClick={() => mover(i, -1)} disabled={i === 0} className="rounded p-0.5 text-texto-3 hover:bg-fundo disabled:opacity-30">
                    <Icone nome="abaixo" className="size-3.5 rotate-180" />
                  </button>
                  <button type="button" aria-label={`Descer ${m.nome}`} onClick={() => mover(i, 1)} disabled={i === itens.length - 1} className="rounded p-0.5 text-texto-3 hover:bg-fundo disabled:opacity-30">
                    <Icone nome="abaixo" className="size-3.5" />
                  </button>
                </span>
                <label className="sr-only" htmlFor={`motivo-${m.chave}`}>
                  Nome do motivo
                </label>
                <input
                  id={`motivo-${m.chave}`}
                  value={m.nome}
                  maxLength={80}
                  onChange={(e) => mudar(m.chave, { nome: e.target.value })}
                  className={`h-9 min-w-0 flex-1 rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none ${m.ativo ? '' : 'text-texto-3'}`}
                />
                <label className="flex cursor-pointer items-center gap-1.5 text-legenda text-texto-2">
                  <input type="checkbox" checked={m.ativo} onChange={(e) => mudar(m.chave, { ativo: e.target.checked })} className="size-3.5 accent-primaria" />
                  Ativo
                </label>
                <button
                  type="button"
                  aria-label={`Apagar ${m.nome}`}
                  onClick={() => {
                    if (m.id) setApagar((a) => [...a, m.id!])
                    setItens(itens.filter((x) => x.chave !== m.chave))
                  }}
                  className="rounded-md p-1 text-texto-3 hover:bg-fundo hover:text-erro"
                >
                  <Icone nome="lixeira" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <label htmlFor="motivo-novo" className="sr-only">
            Novo motivo
          </label>
          <input
            id="motivo-novo"
            value={novo}
            maxLength={80}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                adicionar()
              }
            }}
            placeholder="Ex.: Frete caro"
            className="h-10 flex-1 rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
          <Botao variante="secundario" icone="mais" onClick={adicionar} disabled={!novo.trim() || !itens}>
            Adicionar
          </Botao>
        </div>
        {apagar.length > 0 && (
          <p className="text-legenda text-texto-3">
            Os negócios perdidos pelos motivos apagados ficam como “Sem motivo informado” no Painel. Para manter, desative em
            vez de apagar.
          </p>
        )}
      </div>
    </Modal>
  )
}
