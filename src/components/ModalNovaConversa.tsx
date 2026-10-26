import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { iniciarConversa, listarNumerosVisiveis, type NumeroVisivel } from '../services/atendimento'
import { agendaDoCelular } from '../services/configuracoes'
import { normalizarTelefone } from '../services/crm'
import { formatarTelefone } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Icone } from './Icone'
import { Modal } from './Modal'

type Escolhido = { nome: string; telefone: string }
type Agenda = { canalId: string; contatos: Escolhido[] } | { canalId: string; erro: string }

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Prospecção ativa: o vendedor escolhe alguém da agenda do celular do número dele (ou digita o número) e começa
 * a conversa pela Livih. Na API oficial a primeira mensagem é um modelo: a conversa abre e o modelo sai de lá.
 */
export function ModalNovaConversa({
  inicial,
  aoFechar,
  aoIniciar,
}: {
  inicial?: Escolhido
  aoFechar: () => void
  aoIniciar: (conversaId: string, precisaModelo: boolean) => void
}) {
  const { orgAtiva, sessao } = useSessao()
  const orgId = orgAtiva!.id
  const eu = sessao?.user.id
  const [numeros, setNumeros] = useState<NumeroVisivel[] | null>(null)
  const [canalEscolhido, setCanalEscolhido] = useState<string | null>(null)
  const [modo, setModo] = useState<'agenda' | 'digitar'>(inicial ? 'digitar' : 'agenda')
  const [agenda, setAgenda] = useState<Agenda | null>(null)
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState<Escolhido | null>(inicial ?? null)
  const [telefone, setTelefone] = useState(inicial ? formatarTelefone(inicial.telefone) : '')
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarNumerosVisiveis(orgId)
      .then((l) => ativo && setNumeros(l))
      .catch(() => ativo && setErro('Não foi possível carregar os números.'))
    return () => {
      ativo = false
    }
  }, [orgId])

  // Padrão: o número do próprio vendedor; senão o primeiro que ele vê.
  const canalId = canalEscolhido ?? numeros?.find((n) => n.responsavel_id === eu)?.id ?? numeros?.[0]?.id ?? null
  const canal = numeros?.find((n) => n.id === canalId) ?? null
  const oficial = canal?.tipo === 'meta'
  const usaAgenda = !inicial && modo === 'agenda' && !oficial

  useEffect(() => {
    if (!canalId || !usaAgenda) return
    let ativo = true
    agendaDoCelular(orgId, canalId)
      .then((contatos) => ativo && setAgenda({ canalId, contatos }))
      .catch((e) => ativo && setAgenda({ canalId, erro: (e as Error).message }))
    return () => {
      ativo = false
    }
  }, [orgId, canalId, usaAgenda])

  const agendaAtual = agenda?.canalId === canalId ? agenda : null
  const filtrados = useMemo(() => {
    if (!agendaAtual || 'erro' in agendaAtual) return []
    const t = semAcento(busca.trim())
    const dig = busca.replace(/\D/g, '')
    const l = t ? agendaAtual.contatos.filter((c) => semAcento(c.nome).includes(t) || (dig.length >= 4 && c.telefone.includes(dig))) : agendaAtual.contatos
    return l.slice(0, 80)
  }, [agendaAtual, busca])

  const destino: Escolhido | null =
    usaAgenda ? escolhido : (() => {
      const t = normalizarTelefone(telefone)
      return t ? { telefone: t, nome: nome.trim() } : null
    })()

  async function iniciar(e: FormEvent) {
    e.preventDefault()
    if (!canalId || !destino) {
      setErro(usaAgenda ? 'Escolha um contato da agenda.' : 'Informe um número de celular com DDD.')
      return
    }
    setEnviando(true)
    setErro(null)
    try {
      const id = await iniciarConversa(canalId, destino.telefone, destino.nome || null, oficial ? null : texto.trim() || null)
      aoIniciar(id, oficial)
    } catch (e) {
      setErro((e as Error).message)
      setEnviando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo="Nova conversa"
      largura="max-w-xl"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-nova-conversa" icone={oficial ? 'conversas' : 'enviar'} carregando={enviando} disabled={!destino || !canalId}>
            {oficial ? 'Abrir e escolher o modelo' : texto.trim() ? 'Enviar' : 'Abrir conversa'}
          </Botao>
        </>
      }
    >
      <form id="form-nova-conversa" onSubmit={iniciar} className="space-y-4">
        {numeros && numeros.length > 1 && (
          <div className="space-y-1.5">
            <label htmlFor="nova-numero" className="block text-pequeno font-medium text-texto-2">
              Enviar pelo número
            </label>
            <select
              id="nova-numero"
              value={canalId ?? ''}
              onChange={(e) => {
                setCanalEscolhido(e.target.value)
                setEscolhido(null)
              }}
              className="block h-10 w-full rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none"
            >
              {numeros.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                  {n.tipo === 'meta' ? ' · API oficial' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {numeros && !numeros.length && <Aviso tom="atencao">Nenhum número de WhatsApp conectado para você.</Aviso>}

        {!inicial && !oficial && (
          <div role="tablist" aria-label="Para quem" className="inline-flex rounded-md bg-slate-100 p-1 text-pequeno">
            {(
              [
                ['agenda', 'Agenda do celular'],
                ['digitar', 'Digitar número'],
              ] as const
            ).map(([m, rotulo]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={modo === m}
                onClick={() => setModo(m)}
                className={`rounded px-3 py-1.5 font-medium ${modo === m ? 'bg-superficie text-texto shadow-sm' : 'text-texto-2'}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        )}

        {usaAgenda ? (
          escolhido ? (
            <div className="flex items-center justify-between gap-3 rounded-md bg-primaria-suave px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{escolhido.nome}</span>
                <span className="text-pequeno text-texto-2">{formatarTelefone(escolhido.telefone)}</span>
              </span>
              <Botao tamanho="sm" variante="fantasma" onClick={() => setEscolhido(null)}>
                Trocar
              </Botao>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="relative block">
                <span className="sr-only">Buscar na agenda</span>
                <Icone nome="busca" className="pointer-events-none absolute top-3 left-3 size-4 text-texto-3" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou número"
                  autoFocus
                  className="h-10 w-full rounded-md border border-borda bg-superficie pr-3 pl-9 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
                />
              </label>
              {!agendaAtual ? (
                <p className="text-pequeno text-texto-3" aria-busy="true">
                  Lendo a agenda do celular…
                </p>
              ) : 'erro' in agendaAtual ? (
                <Aviso tom="erro">{agendaAtual.erro}</Aviso>
              ) : (
                <>
                  <ul className="max-h-64 divide-y divide-borda overflow-y-auto rounded-md border border-borda">
                    {filtrados.map((c) => (
                      <li key={c.telefone}>
                        <button
                          type="button"
                          onClick={() => setEscolhido(c)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-fundo"
                        >
                          <span className="min-w-0 truncate">{c.nome}</span>
                          <span className="shrink-0 text-pequeno text-texto-3 tabular-nums">{formatarTelefone(c.telefone)}</span>
                        </button>
                      </li>
                    ))}
                    {!filtrados.length && <li className="px-3 py-3 text-pequeno text-texto-3">Ninguém com esse nome na agenda.</li>}
                  </ul>
                  <p className="text-legenda text-texto-3">
                    {agendaAtual.contatos.length} contatos salvos no celular deste número.
                  </p>
                </>
              )}
            </div>
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              rotulo="Celular com DDD"
              inputMode="tel"
              required
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(41) 99999-8888"
              disabled={!!inicial}
            />
            <CampoTexto rotulo="Nome (opcional)" value={nome} onChange={(e) => setNome(e.target.value)} disabled={!!inicial} />
          </div>
        )}

        {oficial ? (
          <Aviso>
            Na API oficial, a primeira mensagem para quem não escreveu nas últimas 24 horas precisa ser um modelo aprovado. A conversa abre e
            você escolhe o modelo lá. O envio é cobrado pela Meta da empresa.
          </Aviso>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="nova-texto" className="block text-pequeno font-medium text-texto-2">
              Mensagem
            </label>
            <textarea
              id="nova-texto"
              rows={4}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={destino?.nome ? `Olá, ${destino.nome.split(' ')[0]}! Tudo bem?` : 'Olá! Tudo bem?'}
              className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none"
            />
            <p className="text-legenda text-texto-3">
              A conversa fica em atendimento com você e o agente não responde por cima. Prospecção em massa pode bloquear o número no
              WhatsApp: escreva para quem você conhece.
            </p>
          </div>
        )}

        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Modal>
  )
}
