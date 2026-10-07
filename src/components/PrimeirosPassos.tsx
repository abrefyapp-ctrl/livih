import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { buscarPrimeirosPassos, type PrimeirosPassos as Passos } from '../services/plataforma'
import { Icone } from './Icone'

const PASSOS: { chave: keyof Passos; rotulo: string; detalhe: string; para: string }[] = [
  { chave: 'whatsapp', rotulo: 'Conectar o WhatsApp', detalhe: 'Leia o QR code com o celular da empresa.', para: '/configuracoes/whatsapp' },
  { chave: 'instrucoes', rotulo: 'Escrever as instruções do agente', detalhe: 'Como ele fala e quando chama a equipe.', para: '/configuracoes/agente' },
  { chave: 'base', rotulo: 'Montar a base de conhecimento', detalhe: 'Produtos, preços, horários: o que ele pode responder.', para: '/configuracoes/base' },
  { chave: 'agente_ligado', rotulo: 'Ligar o agente no número', detalhe: 'Só depois dos passos acima.', para: '/configuracoes/whatsapp' },
  { chave: 'equipe', rotulo: 'Convidar a equipe', detalhe: 'Quem vai atender quando o agente chamar.', para: '/configuracoes/equipe' },
]

/**
 * Roteiro do dono de empresa nova. Some quando tudo está feito. `atualizar` muda quando a pessoa pode ter
 * concluído um passo (troca de seção), para reconsultar.
 */
export function PrimeirosPassos({ orgId, atualizar }: { orgId: string; atualizar?: unknown }) {
  const [dados, setDados] = useState<{ orgId: string; passos: Passos | null } | null>(null)

  useEffect(() => {
    let ativo = true
    buscarPrimeirosPassos(orgId)
      .then((passos) => ativo && setDados({ orgId, passos }))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, atualizar])

  const passos = dados?.orgId === orgId ? dados.passos : null
  if (!passos) return null
  const feitos = PASSOS.filter((p) => passos[p.chave]).length
  if (feitos === PASSOS.length) return null
  const proximo = PASSOS.find((p) => !passos[p.chave])

  return (
    <section aria-labelledby="primeiros-passos" className="rounded-lg border border-borda bg-superficie p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="primeiros-passos" className="font-semibold">
          Primeiros passos
        </h2>
        <span className="text-legenda text-texto-3">
          {feitos} de {PASSOS.length}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="h-full rounded-full bg-destaque" style={{ width: `${(feitos / PASSOS.length) * 100}%` }} />
      </div>
      <ol className="mt-3 space-y-1">
        {PASSOS.map((p) => {
          const feito = passos[p.chave]
          return (
            <li key={p.chave}>
              <Link
                to={p.para}
                className={`flex items-start gap-3 rounded-md px-2 py-2 hover:bg-fundo ${p === proximo ? 'bg-primaria-suave' : ''}`}
              >
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                    feito ? 'border-primaria bg-primaria text-white' : 'border-borda bg-superficie'
                  }`}
                >
                  {feito && <Icone nome="check" className="size-3" />}
                </span>
                <span className="min-w-0">
                  <span className={`block text-pequeno font-medium ${feito ? 'text-texto-3 line-through' : 'text-texto'}`}>
                    {p.rotulo}
                    <span className="sr-only">{feito ? ' (feito)' : ' (pendente)'}</span>
                  </span>
                  {!feito && <span className="block text-legenda text-texto-3">{p.detalhe}</span>}
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
