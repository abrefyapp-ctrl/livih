import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ConversaLista, EstadoConversa } from '../services/atendimento'
import { formatarTelefone, haQuanto, nomeDoContato, quandoCurto } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { Avatar } from './Avatar'
import { Aviso } from './Aviso'
import { EstadoVazio } from './EstadoVazio'
import { Icone } from './Icone'
import { ABAS } from '../services/abas'

const VAZIO: Record<EstadoConversa, { titulo: string; texto: string }> = {
  aguardando_humano: {
    titulo: 'Ninguém esperando por você',
    texto: 'Quando o agente pedir ajuda (lead quente, orçamento, reclamação), a conversa aparece aqui.',
  },
  humano: { titulo: 'Nenhuma conversa em atendimento', texto: 'Conversas que alguém da equipe assumiu ficam aqui.' },
  bot: { titulo: 'O agente não está atendendo ninguém agora', texto: 'Novas conversas começam com o agente.' },
  encerrada: { titulo: 'Nenhuma conversa encerrada', texto: 'Conversas encerradas ficam aqui por consulta.' },
}

type Props = {
  aba: EstadoConversa
  aoTrocarAba: (aba: EstadoConversa) => void
  conversas: ConversaLista[]
  contagem: Record<EstadoConversa, number>
  carregando: boolean
  erro: string | null
  aoTentarDeNovo: () => void
  selecionada?: string
  numeros: { id: string; nome: string }[]
  numero?: string
  aoTrocarNumero: (id: string | undefined) => void
}

export function ListaConversas({
  aba,
  aoTrocarAba,
  conversas,
  contagem,
  carregando,
  erro,
  aoTentarDeNovo,
  selecionada,
  numeros,
  numero,
  aoTrocarNumero,
}: Props) {
  // Com um número só, o nome do número em cada conversa é ruído.
  const variosNumeros = numeros.length > 1
  const { sessao, equipe } = useSessao()
  const [busca, setBusca] = useState('')
  const [soMinhas, setSoMinhas] = useState(false)
  const eu = sessao?.user.id

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    return conversas.filter((c) => {
      if (aba === 'humano' && soMinhas && c.atribuida_a !== eu) return false
      if (!termo) return true
      const nome = nomeDoContato(c.contato).toLowerCase()
      return nome.includes(termo) || (!!digitos && (c.contato?.telefone ?? '').includes(digitos))
    })
  }, [conversas, busca, aba, soMinhas, eu])

  return (
    <section aria-label="Conversas" className="flex h-full min-h-0 flex-col bg-superficie">
      <div className="space-y-3 border-b border-borda p-3">
        <div role="tablist" aria-label="Filtrar por situação" className="grid grid-cols-4 gap-1">
          {ABAS.map((a) => {
            const ativa = a.estado === aba
            const n = contagem[a.estado]
            return (
              <button
                key={a.estado}
                role="tab"
                aria-selected={ativa}
                onClick={() => aoTrocarAba(a.estado)}
                className={`flex h-8 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-legenda font-medium transition-colors ${
                  ativa ? 'bg-primaria-suave text-primaria' : 'text-texto-2 hover:bg-fundo'
                }`}
              >
                <span className="truncate">{a.rotulo}</span>
                {a.estado !== 'encerrada' && n > 0 && (
                  <span
                    className={`shrink-0 rounded-full px-1.5 text-legenda font-semibold ${
                      a.estado === 'aguardando_humano' ? 'bg-atencao text-white' : 'bg-slate-100 text-texto-2'
                    }`}
                  >
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {variosNumeros && (
          <label className="relative block">
            <span className="sr-only">Número de WhatsApp</span>
            <select
              value={numero ?? ''}
              onChange={(e) => aoTrocarNumero(e.target.value || undefined)}
              className="h-9 w-full appearance-none rounded-md border border-borda bg-superficie pr-8 pl-3 text-pequeno focus:border-primaria focus:outline-none"
            >
              <option value="">Todos os números</option>
              {numeros.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                </option>
              ))}
            </select>
            <Icone nome="abaixo" className="pointer-events-none absolute top-2.5 right-2.5 size-4 text-texto-3" />
          </label>
        )}
        <label className="relative block">
          <span className="sr-only">Buscar por nome ou telefone</span>
          <Icone nome="busca" className="pointer-events-none absolute top-2.5 left-3 size-4 text-texto-3" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="h-9 w-full rounded-md border border-borda bg-superficie pr-3 pl-9 text-pequeno placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
        </label>
        {aba === 'humano' && (
          <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2">
            <input
              type="checkbox"
              checked={soMinhas}
              onChange={(e) => setSoMinhas(e.target.checked)}
              className="size-4 accent-primaria"
            />
            Só as que estão comigo
          </label>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {erro ? (
          <div className="p-3">
            <Aviso
              tom="erro"
              acao={
                <button onClick={aoTentarDeNovo} className="font-semibold underline">
                  Tentar de novo
                </button>
              }
            >
              {erro}
            </Aviso>
          </div>
        ) : carregando ? (
          <ul aria-busy="true" aria-label="Carregando conversas">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex gap-3 border-b border-borda px-4 py-3">
                <span className="size-10 animate-pulse rounded-full bg-slate-100" />
                <span className="flex-1 space-y-2 py-1">
                  <span className="block h-3 w-2/3 animate-pulse rounded-sm bg-slate-100" />
                  <span className="block h-3 w-full animate-pulse rounded-sm bg-slate-100" />
                </span>
              </li>
            ))}
          </ul>
        ) : !visiveis.length ? (
          busca || soMinhas ? (
            <EstadoVazio icone="busca" titulo="Nada encontrado">
              Nenhuma conversa nesta aba com esse filtro.
            </EstadoVazio>
          ) : (
            <EstadoVazio icone="conversas" titulo={VAZIO[aba].titulo}>
              {VAZIO[aba].texto}
            </EstadoVazio>
          )
        ) : (
          <ul>
            {visiveis.map((c) => {
              const nome = nomeDoContato(c.contato)
              const ativa = c.id === selecionada
              const atendente = c.atribuida_a ? equipe.get(c.atribuida_a)?.nome : undefined
              return (
                <li key={c.id}>
                  <Link
                    to={`/conversas/${c.id}?${new URLSearchParams({ aba, ...(numero ? { numero } : {}) })}`}
                    aria-current={ativa ? 'true' : undefined}
                    className={`flex gap-3 border-b border-l-2 border-b-borda px-4 py-3 transition-colors ${
                      ativa ? 'border-l-primaria bg-primaria-suave' : 'border-l-transparent hover:bg-fundo'
                    }`}
                  >
                    <Avatar nome={nome} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`truncate ${c.nao_lidas ? 'font-semibold text-texto' : 'font-medium text-texto'}`}>
                          {nome}
                        </span>
                        <time className="ml-auto shrink-0 text-legenda text-texto-3" dateTime={c.ultima_mensagem_em ?? ''}>
                          {quandoCurto(c.ultima_mensagem_em)}
                        </time>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`truncate text-pequeno ${c.nao_lidas ? 'text-texto-2' : 'text-texto-3'}`}>
                          {c.ultima_mensagem_resumo || formatarTelefone(c.contato?.telefone)}
                        </span>
                        {c.nao_lidas > 0 && (
                          <span
                            aria-label={`${c.nao_lidas} não lidas`}
                            className="ml-auto shrink-0 rounded-full bg-primaria px-1.5 text-legenda font-semibold text-white"
                          >
                            {c.nao_lidas}
                          </span>
                        )}
                      </span>
                      {variosNumeros && c.canal && !numero && (
                        <span className="mt-1 flex items-center gap-1 text-legenda text-texto-3">
                          <Icone nome="telefone" className="size-3.5 shrink-0" />
                          <span className="truncate">{c.canal.nome}</span>
                        </span>
                      )}
                      {aba === 'aguardando_humano' && (
                        <span className="mt-1 flex items-center gap-1 text-legenda text-atencao">
                          <Icone nome="alerta" className="size-3.5 shrink-0" />
                          <span className="truncate">
                            {c.motivo_humano ? `${c.motivo_humano} · ` : ''}
                            {haQuanto(c.ultima_mensagem_em)}
                          </span>
                        </span>
                      )}
                      {aba === 'humano' && (
                        <span className="mt-1 flex items-center gap-1 text-legenda text-texto-3">
                          <Icone nome="usuario" className="size-3.5" />
                          {c.atribuida_a === eu ? 'Com você' : (atendente ?? 'Com a equipe')}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
