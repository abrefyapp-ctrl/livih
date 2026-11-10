import { useState, type FormEvent } from 'react'
import { removerEquipe, salvarEquipe, type Equipe, type LugarNaEquipe } from '../services/equipes'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { DialogoConfirmacao } from './DialogoConfirmacao'

/**
 * Equipes de venda (loja, televendas, externas…): docs/equipes-origem-prospeccao.md, entrega 1. Dono e admin criam,
 * renomeiam e removem; quem é de qual equipe e quem é gestor se escolhe na lista de pessoas, logo abaixo.
 */
export function EquipesDeVenda({
  orgId,
  gerencia,
  equipes,
  lugares,
  aoMudar,
}: {
  orgId: string
  gerencia: boolean
  equipes: Equipe[]
  lugares: Map<string, LugarNaEquipe>
  aoMudar: () => void
}) {
  const [nova, setNova] = useState('')
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null)
  const [remover, setRemover] = useState<Equipe | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const pessoas = (id: string) => [...lugares.values()].filter((l) => l.equipe_id === id && l.ativo)
  const gestores = (id: string) => pessoas(id).filter((l) => l.gestor).length

  async function executar(acao: () => Promise<unknown>) {
    setOcupado(true)
    setErro(null)
    try {
      await acao()
      aoMudar()
      return true
    } catch (e) {
      setErro((e as Error).message)
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (await executar(() => salvarEquipe(orgId, null, nova))) setNova('')
  }

  async function renomear(e: FormEvent) {
    e.preventDefault()
    if (editando && (await executar(() => salvarEquipe(orgId, editando.id, editando.nome)))) setEditando(null)
  }

  if (!gerencia && !equipes.length) return null

  return (
    <section aria-labelledby="titulo-equipes-venda" className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
      <div>
        <h3 id="titulo-equipes-venda" className="font-semibold">
          Equipes de venda
        </h3>
        <p className="text-pequeno text-texto-3">
          Separe as pessoas por loja ou canal de venda. O gestor da equipe vê as conversas, os contatos e o Painel de quem é
          da equipe dele e liga ou desliga o agente nos números dos vendedores. Não mexe nas configurações.
        </p>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {equipes.length > 0 && (
        <ul className="divide-y divide-borda rounded-md border border-borda">
          {equipes.map((eq) => {
            const n = pessoas(eq.id).length
            const g = gestores(eq.id)
            return (
              <li key={eq.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-pequeno">
                {editando?.id === eq.id ? (
                  <form onSubmit={renomear} className="flex flex-1 flex-wrap gap-2">
                    <label htmlFor={`nome-equipe-${eq.id}`} className="sr-only">
                      Nome da equipe
                    </label>
                    <input
                      id={`nome-equipe-${eq.id}`}
                      value={editando.nome}
                      onChange={(e) => setEditando({ id: eq.id, nome: e.target.value })}
                      maxLength={60}
                      autoFocus
                      className="h-8 min-w-0 flex-1 rounded-md border border-borda bg-superficie px-2 focus:border-primaria focus:outline-none"
                    />
                    <Botao tamanho="sm" type="submit" carregando={ocupado} disabled={!editando.nome.trim()}>
                      Salvar
                    </Botao>
                    <Botao tamanho="sm" variante="fantasma" onClick={() => setEditando(null)} disabled={ocupado}>
                      Cancelar
                    </Botao>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 font-medium">{eq.nome}</span>
                    <span className="text-texto-3">
                      {n === 1 ? '1 pessoa' : `${n} pessoas`}
                      {' · '}
                      {g === 0 ? <span className="text-atencao">sem gestor</span> : g === 1 ? '1 gestor' : `${g} gestores`}
                    </span>
                    {gerencia && (
                      <span className="flex gap-1">
                        <Botao tamanho="sm" variante="fantasma" onClick={() => setEditando({ id: eq.id, nome: eq.nome })}>
                          Renomear
                        </Botao>
                        <Botao tamanho="sm" variante="fantasma" onClick={() => setRemover(eq)}>
                          Remover
                        </Botao>
                      </span>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {gerencia && (
        <form onSubmit={criar} className="flex flex-wrap gap-2">
          <label htmlFor="nova-equipe" className="sr-only">
            Nome da nova equipe
          </label>
          <input
            id="nova-equipe"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            maxLength={60}
            placeholder="Ex.: Loja Castro, Televendas"
            className="h-10 min-w-0 flex-1 rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
          <Botao type="submit" variante="secundario" icone="mais" carregando={ocupado && !editando} disabled={!nova.trim()}>
            Criar equipe
          </Botao>
        </form>
      )}

      <DialogoConfirmacao
        aberto={!!remover}
        titulo="Remover a equipe?"
        rotuloConfirmar="Remover"
        perigo
        carregando={ocupado}
        aoConfirmar={() => remover && void executar(() => removerEquipe(remover.id)).then(() => setRemover(null))}
        aoCancelar={() => setRemover(null)}
      >
        As pessoas de {remover?.nome} ficam sem equipe, e o gestor deixa de ver as conversas dos vendedores dela. As conversas e
        os contatos não mudam.
      </DialogoConfirmacao>
    </section>
  )
}
