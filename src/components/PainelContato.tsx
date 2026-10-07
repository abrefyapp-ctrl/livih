import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { buscarContato, listarOportunidades, type Contato, type Oportunidade } from '../services/atendimento'
import { formatarTelefone, moeda, nomeDoContato } from '../services/formato'
import { Avatar } from './Avatar'
import { Aviso } from './Aviso'
import { EtiquetaEtapa } from './EtiquetaEtapa'
import { Icone, type NomeIcone } from './Icone'
import { NotasContato } from './NotasContato'

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

export function PainelContato({ contatoId, conversaId }: { contatoId: string; conversaId: string }) {
  const [contato, setContato] = useState<Contato | null>(null)
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([])
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    Promise.all([buscarContato(contatoId), listarOportunidades(contatoId)])
      .then(([c, o]) => {
        if (!ativo) return
        setContato(c)
        setOportunidades(o)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os dados do contato.'))
    return () => {
      ativo = false
    }
  }, [contatoId])

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
                  {o.etapa && <EtiquetaEtapa nome={o.etapa.nome} tipo={o.etapa.tipo} />}
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
        <NotasContato contatoId={contatoId} conversaId={conversaId} />
      </Secao>

      <div className="px-5">
        <Link to={`/contatos/${contatoId}`} className="text-pequeno font-medium text-primaria hover:underline">
          Abrir perfil completo
        </Link>
      </div>
    </div>
  )
}
