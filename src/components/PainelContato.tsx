import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  buscarContato,
  criarNota,
  listarNotas,
  listarOportunidades,
  type Contato,
  type Nota,
  type Oportunidade,
} from '../services/atendimento'
import { formatarTelefone, moeda, nomeDoContato, quandoCurto } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { Avatar } from './Avatar'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone, type NomeIcone } from './Icone'

function Linha({ icone, children }: { icone: NomeIcone; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-pequeno text-texto-2">
      <Icone nome={icone} className="mt-0.5 size-4 shrink-0 text-texto-3" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-t border-borda px-5 py-4">
      <h3 className="mb-3 text-legenda font-semibold tracking-wide text-texto-3 uppercase">{titulo}</h3>
      {children}
    </section>
  )
}

const COR_ETAPA = { aberta: 'bg-info-suave text-info', ganho: 'bg-primaria-suave text-primaria', perdido: 'bg-erro-suave text-erro' }

export function PainelContato({ contatoId, conversaId }: { contatoId: string; conversaId: string }) {
  const { orgAtiva, equipe } = useSessao()
  const [contato, setContato] = useState<Contato | null>(null)
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([])
  const [notas, setNotas] = useState<Nota[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroNota, setErroNota] = useState<string | null>(null)

  const carregarNotas = useCallback(() => listarNotas(contatoId).then(setNotas), [contatoId])

  useEffect(() => {
    let ativo = true
    Promise.all([buscarContato(contatoId), listarOportunidades(contatoId), listarNotas(contatoId)])
      .then(([c, o, n]) => {
        if (!ativo) return
        setContato(c)
        setOportunidades(o)
        setNotas(n)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os dados do contato.'))
    return () => {
      ativo = false
    }
  }, [contatoId])

  async function salvarNota() {
    if (!orgAtiva || !texto.trim()) return
    setSalvando(true)
    setErroNota(null)
    try {
      await criarNota(orgAtiva.id, contatoId, conversaId, texto.trim())
      setTexto('')
      await carregarNotas()
    } catch {
      setErroNota('A nota não foi salva. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  if (erro) return <div className="p-4"><Aviso tom="erro">{erro}</Aviso></div>
  if (!contato) return <div className="p-5 text-pequeno text-texto-3">Carregando contato…</div>

  const nome = nomeDoContato(contato)

  return (
    <div className="pb-6">
      <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
        <Avatar nome={nome} tamanho="lg" />
        <div>
          <p className="text-h2 font-semibold">{nome}</p>
          {contato.nome_whatsapp && contato.nome_whatsapp !== nome && (
            <p className="text-pequeno text-texto-3">No WhatsApp: {contato.nome_whatsapp}</p>
          )}
        </div>
      </div>

      <Secao titulo="Contato">
        <ul className="space-y-2">
          <Linha icone="telefone">{formatarTelefone(contato.telefone)}</Linha>
          {contato.email && <Linha icone="email">{contato.email}</Linha>}
          {contato.empresa && <Linha icone="empresa">{contato.empresa}</Linha>}
          {contato.origem && <Linha icone="funil">Origem: {contato.origem}</Linha>}
        </ul>
        {contato.tags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1" aria-label="Tags">
            {contato.tags.map((t) => (
              <li key={t} className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-legenda text-texto-2">
                {t}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Oportunidades">
        {oportunidades.length ? (
          <ul className="space-y-3">
            {oportunidades.map((o) => (
              <li key={o.id} className="rounded-md border border-borda p-3">
                <p className="font-medium">{o.titulo}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-legenda">
                  {o.etapa && (
                    <span className={`rounded-sm px-1.5 py-0.5 font-medium ${COR_ETAPA[o.etapa.tipo]}`}>{o.etapa.nome}</span>
                  )}
                  {o.valor_estimado != null && <span className="text-texto-2">{moeda(o.valor_estimado)}</span>}
                </p>
                {o.resumo && <p className="mt-2 text-pequeno text-texto-3">{o.resumo}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-pequeno text-texto-3">Nenhuma oportunidade. O agente cria quando identifica interesse.</p>
        )}
      </Secao>

      <Secao titulo="Notas da equipe">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void salvarNota()
          }}
          className="space-y-2"
        >
          <label htmlFor="nova-nota" className="sr-only">
            Nova nota
          </label>
          <textarea
            id="nova-nota"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            placeholder="Anote algo que a equipe precisa saber"
            className="block w-full resize-none rounded-md border border-borda px-3 py-2 text-pequeno placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
          {erroNota && <Aviso tom="erro">{erroNota}</Aviso>}
          <Botao type="submit" variante="secundario" tamanho="sm" icone="nota" carregando={salvando} disabled={!texto.trim()}>
            Salvar nota
          </Botao>
        </form>
        {notas.length > 0 && (
          <ul className="mt-4 space-y-3">
            {notas.map((n) => (
              <li key={n.id} className="text-pequeno">
                <p className="break-words whitespace-pre-wrap text-texto-2">{n.texto}</p>
                <p className="mt-0.5 text-legenda text-texto-3">
                  {n.autor_tipo === 'bot' ? 'Agente' : ((n.autor_id && equipe.get(n.autor_id)?.nome) ?? 'Equipe')} ·{' '}
                  {quandoCurto(n.criado_em)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  )
}
