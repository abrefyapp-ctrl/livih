import { useState, type FormEvent } from 'react'
import { definirCidades, removerEquipe, salvarEquipe, type Equipe, type LugarNaEquipe } from '../services/equipes'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { DialogoConfirmacao } from './DialogoConfirmacao'

/**
 * Equipes de venda (loja, televendas, externas…): docs/equipes-origem-prospeccao.md, entrega 1. Dono e admin criam,
 * renomeiam e removem; quem é de qual equipe e quem é gestor se escolhe na lista de pessoas, logo abaixo.
 * As cidades de cada equipe (entrega 2, 13/11): o contato dessas cidades que escreve no número da empresa vai para o
 * rodízio da equipe.
 */
export function EquipesDeVenda({
  orgId,
  gerencia,
  equipes,
  lugares,
  cidades,
  aoMudar,
}: {
  orgId: string
  gerencia: boolean
  equipes: Equipe[]
  lugares: Map<string, LugarNaEquipe>
  cidades: Map<string, string[]>
  aoMudar: () => void
}) {
  const [nova, setNova] = useState('')
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null)
  const [remover, setRemover] = useState<Equipe | null>(null)
  const [editandoCidades, setEditandoCidades] = useState<{ id: string; texto: string } | null>(null)
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

  async function salvarCidades(e: FormEvent) {
    e.preventDefault()
    if (!editandoCidades) return
    // Vírgula separa as cidades; "Castro, PR" não vira uma cidade "PR".
    const lista = editandoCidades.texto
      .split(/[,;\n]/)
      .map((c) => c.trim())
      .filter((c) => c && !/^[A-Za-z]{2}$/.test(c))
    if (await executar(() => definirCidades(editandoCidades.id, lista))) setEditandoCidades(null)
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
                ) : editandoCidades?.id === eq.id ? (
                  <form onSubmit={salvarCidades} className="flex-1 space-y-2">
                    <label htmlFor={`cidades-equipe-${eq.id}`} className="block font-medium">
                      Cidades de {eq.nome}
                    </label>
                    <input
                      id={`cidades-equipe-${eq.id}`}
                      value={editandoCidades.texto}
                      onChange={(e) => setEditandoCidades({ id: eq.id, texto: e.target.value })}
                      placeholder="Ex.: Castro, Piraí do Sul"
                      autoFocus
                      className="h-8 w-full rounded-md border border-borda bg-superficie px-2 focus:border-primaria focus:outline-none"
                    />
                    <p className="text-legenda text-texto-3">
                      Separe por vírgula. Nos números da empresa que distribuem, o cliente dessas cidades vai para esta
                      equipe, a não ser que alguém já o tenha atendido no período escolhido em Distribuição dos contatos.
                    </p>
                    <div className="flex gap-2">
                      <Botao tamanho="sm" type="submit" carregando={ocupado}>
                        Salvar
                      </Botao>
                      <Botao tamanho="sm" variante="fantasma" onClick={() => setEditandoCidades(null)} disabled={ocupado}>
                        Cancelar
                      </Botao>
                    </div>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{eq.nome}</span>
                      {(cidades.get(eq.id)?.length ?? 0) > 0 ? (
                        <span className="block text-legenda text-texto-3">Cidades: {cidades.get(eq.id)!.join(', ')}</span>
                      ) : (
                        gerencia && <span className="block text-legenda text-texto-3">Sem cidades</span>
                      )}
                    </span>
                    <span className="text-texto-3">
                      {n === 1 ? '1 pessoa' : `${n} pessoas`}
                      {' · '}
                      {g === 0 ? <span className="text-atencao">sem gestor</span> : g === 1 ? '1 gestor' : `${g} gestores`}
                    </span>
                    {gerencia && (
                      <span className="flex gap-1">
                        <Botao
                          tamanho="sm"
                          variante="fantasma"
                          onClick={() => setEditandoCidades({ id: eq.id, texto: (cidades.get(eq.id) ?? []).join(', ') })}
                        >
                          Cidades
                        </Botao>
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
        As pessoas de {remover?.nome} ficam sem equipe, e o gestor deixa de ver as conversas dos vendedores dela. As cidades
        da equipe deixam de valer na distribuição. As conversas e os contatos não mudam.
      </DialogoConfirmacao>
    </section>
  )
}
