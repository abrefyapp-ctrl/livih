import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { nomeDoContato } from '../services/formato'
import { atualizarTarefa, prazo, quandoTarefa, tarefasDoContato, type Tarefa } from '../services/tarefas'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { ModalTarefa } from './ModalTarefa'

/**
 * Uma tarefa em lista: caixa para concluir, o quê, quando (vermelho se atrasada), cliente e responsável. Clicar no
 * texto abre a tarefa.
 */
export function LinhaTarefa({
  tarefa,
  mostrarCliente = true,
  aoAbrir,
  aoMudar,
}: {
  tarefa: Tarefa
  mostrarCliente?: boolean
  aoAbrir: () => void
  aoMudar: () => void
}) {
  const { sessao, equipe } = useSessao()
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const aberta = tarefa.status === 'aberta'
  const situacao = aberta ? prazo(tarefa.vence_em) : null
  const doAgente = tarefa.executor === 'agente'
  const resp = doAgente
    ? 'Agente'
    : tarefa.responsavel_id
      ? tarefa.responsavel_id === sessao?.user.id
        ? 'Você'
        : (equipe.get(tarefa.responsavel_id)?.nome ?? 'Equipe')
      : 'Sem responsável'

  async function alternar() {
    setSalvando(true)
    setErro(null)
    try {
      await atualizarTarefa(tarefa.id, { status: aberta ? 'feita' : 'aberta' })
      aoMudar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex items-start gap-3 py-2.5">
      <input
        type="checkbox"
        checked={!aberta}
        disabled={salvando || tarefa.status === 'cancelada'}
        onChange={() => void alternar()}
        aria-label={aberta ? `Concluir: ${tarefa.titulo}` : `Reabrir: ${tarefa.titulo}`}
        className="mt-1 size-4 shrink-0 accent-primaria"
      />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={aoAbrir} className="block w-full text-left">
          <span className={`block font-medium ${aberta ? 'text-texto' : 'text-texto-3 line-through'}`}>
            {doAgente && <Icone nome="agente" className="mr-1 inline size-4 align-[-2px] text-primaria" />}
            {tarefa.titulo}
          </span>
          <span className="mt-0.5 flex flex-wrap gap-x-2 text-legenda text-texto-3">
            <span className={situacao === 'atrasada' ? 'font-semibold text-erro' : situacao === 'hoje' ? 'font-medium text-texto-2' : ''}>
              {situacao === 'atrasada' && 'Atrasada · '}
              {quandoTarefa(tarefa.vence_em)}
            </span>
            {tarefa.status === 'cancelada' && <span>Cancelada</span>}
            <span>{resp}</span>
            {tarefa.oportunidade && <span className="truncate">{tarefa.oportunidade.titulo}</span>}
          </span>
        </button>
        {!aberta && tarefa.resultado && <p className="text-legenda text-texto-3">{tarefa.resultado}</p>}
        {mostrarCliente && tarefa.contato && (
          <Link to={`/contatos/${tarefa.contato.id}`} className="text-legenda text-primaria hover:underline">
            {nomeDoContato(tarefa.contato)}
          </Link>
        )}
        {erro && <p className="mt-1 text-legenda text-erro">{erro}</p>}
      </div>
    </div>
  )
}

/**
 * Tarefas de um contato (perfil, painel da conversa) ou de uma oportunidade: as abertas, as últimas concluídas e
 * "Nova tarefa" já ligada a eles. O conteúdo vem sem moldura: quem usa põe no bloco dele.
 */
export function TarefasDoContato({
  contato,
  oportunidade,
  conversaId,
}: {
  contato: { id: string; nome: string }
  oportunidade?: { id: string; titulo: string }
  conversaId?: string
}) {
  const [dados, setDados] = useState<{ chave: string; abertas: Tarefa[]; concluidas: Tarefa[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [abrir, setAbrir] = useState<Tarefa | 'nova' | null>(null)
  const [verConcluidas, setVerConcluidas] = useState(false)

  const chave = `${contato.id}:${oportunidade?.id ?? ''}:${versao}`
  useEffect(() => {
    let ativo = true
    tarefasDoContato(contato.id, oportunidade?.id)
      .then((r) => {
        if (!ativo) return
        setDados({ chave, ...r })
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar as tarefas.'))
    return () => {
      ativo = false
    }
  }, [contato.id, oportunidade?.id, chave])

  const atual = dados?.chave === chave ? dados : null
  const recarregar = () => setVersao((v) => v + 1)

  return (
    <div className="space-y-2">
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!atual ? (
        !erro && <p className="text-pequeno text-texto-3">Carregando…</p>
      ) : atual.abertas.length ? (
        <ul className="divide-y divide-borda">
          {atual.abertas.map((t) => (
            <li key={t.id}>
              <LinhaTarefa tarefa={t} mostrarCliente={false} aoAbrir={() => setAbrir(t)} aoMudar={recarregar} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-pequeno text-texto-3">
          {oportunidade ? 'Sem próximo passo marcado.' : 'Nenhuma tarefa a fazer.'} Marque o que fazer e quando, com lembrete.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Botao tamanho="sm" variante="secundario" icone="mais" onClick={() => setAbrir('nova')}>
          Nova tarefa
        </Botao>
        {!!atual?.concluidas.length && (
          <button type="button" onClick={() => setVerConcluidas((v) => !v)} className="text-legenda text-texto-3 hover:text-texto-2">
            {verConcluidas ? 'Esconder as concluídas' : `Ver as concluídas (${atual.concluidas.length})`}
          </button>
        )}
      </div>
      {verConcluidas && atual && (
        <ul className="divide-y divide-borda">
          {atual.concluidas.map((t) => (
            <li key={t.id}>
              <LinhaTarefa tarefa={t} mostrarCliente={false} aoAbrir={() => setAbrir(t)} aoMudar={recarregar} />
            </li>
          ))}
        </ul>
      )}

      {abrir && (
        <ModalTarefa
          tarefa={abrir === 'nova' ? undefined : abrir}
          contatoFixo={contato}
          oportunidadeFixa={oportunidade}
          conversaId={conversaId}
          aoFechar={() => setAbrir(null)}
          aoSalvar={() => {
            setAbrir(null)
            recarregar()
          }}
        />
      )}
    </div>
  )
}
