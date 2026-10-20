import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { buscarPrimeirosPassos, type PrimeirosPassos as Passos } from '../services/plataforma'
import { Botao } from './Botao'
import { Icone } from './Icone'

type Passo = {
  chave: keyof Passos
  rotulo: string
  detalhe: string
  para: string
  /** Instruções e base: dá para deixar para depois, e o assistente monta as duas por perguntas. */
  adiavel?: boolean
}

const OBRIGATORIOS: Passo[] = [
  { chave: 'whatsapp', rotulo: 'Conectar o WhatsApp', detalhe: 'Leia o QR code com o celular da empresa.', para: '/configuracoes/whatsapp' },
  {
    chave: 'instrucoes',
    rotulo: 'Escrever as instruções do agente',
    detalhe: 'Como ele fala, o que pode prometer e quando chama a equipe.',
    para: '/configuracoes/agente',
    adiavel: true,
  },
  {
    chave: 'base',
    rotulo: 'Montar a base de conhecimento',
    detalhe: 'Pagamento, frete, prazos, perguntas frequentes: o que ele pode responder.',
    para: '/configuracoes/base',
    adiavel: true,
  },
  { chave: 'agente_ligado', rotulo: 'Ligar o agente no número', detalhe: 'Depois das instruções e da base.', para: '/configuracoes/whatsapp' },
]
const OPCIONAL: Passo = {
  chave: 'equipe',
  rotulo: 'Convidar a equipe',
  detalhe: 'Quem vai atender quando o agente chamar. Dá para fazer quando quiser.',
  para: '/configuracoes/equipe',
}
const ASSISTENTE = '/configuracoes/agente?assistente=montar'

// "Deixar para depois" fica no navegador de cada pessoa (conveniência, não regra): o passo continua pendente.
const chaveDepois = (orgId: string) => `livih.passosDepois.${orgId}`
function lerDepois(orgId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(chaveDepois(orgId)) ?? '[]')
  } catch {
    return []
  }
}
function gravarDepois(orgId: string, lista: string[]) {
  try {
    localStorage.setItem(chaveDepois(orgId), JSON.stringify(lista))
  } catch {
    // sem armazenamento (aba anônima): o passo só não fica guardado como adiado
  }
}

/**
 * Roteiro do dono de empresa nova. Some quando os passos obrigatórios estão feitos (convidar a equipe é opcional).
 * Instruções e base podem ficar para depois, com aviso de que o agente só atende com elas. `atualizar` muda quando a
 * pessoa pode ter concluído um passo (troca de seção), para reconsultar.
 */
export function PrimeirosPassos({ orgId, atualizar }: { orgId: string; atualizar?: unknown }) {
  const [dados, setDados] = useState<{ orgId: string; passos: Passos | null } | null>(null)
  const [depois, setDepois] = useState<{ orgId: string; lista: string[] }>(() => ({ orgId, lista: lerDepois(orgId) }))
  const [aberto, setAberto] = useState(false)

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
  const adiados = depois.orgId === orgId ? depois.lista : lerDepois(orgId)
  if (!passos) return null
  const feitos = OBRIGATORIOS.filter((p) => passos[p.chave]).length
  if (feitos === OBRIGATORIOS.length) return null

  const mudarDepois = (chave: string, adiar: boolean) => {
    const lista = adiar ? [...new Set([...adiados, chave])] : adiados.filter((c) => c !== chave)
    gravarDepois(orgId, lista)
    setDepois({ orgId, lista })
  }
  const pendentes = OBRIGATORIOS.filter((p) => !passos[p.chave])
  const faltamDoAgente = pendentes.filter((p) => p.adiavel)
  const adiadosPendentes = faltamDoAgente.filter((p) => adiados.includes(p.chave))
  // Tudo o que falta (fora ligar o agente, que depende delas) foi deixado para depois: vira um aviso de uma linha.
  const soAdiado =
    !aberto && adiadosPendentes.length > 0 && pendentes.every((p) => adiados.includes(p.chave) || p.chave === 'agente_ligado')
  const proximo = pendentes.find((p) => !adiados.includes(p.chave))
  const nomesFaltam = faltamDoAgente.map((p) => (p.chave === 'instrucoes' ? 'as instruções do agente' : 'a base de conhecimento'))

  if (soAdiado) {
    return (
      <section aria-label="Primeiros passos" className="flex flex-wrap items-center gap-3 rounded-lg border border-atencao/40 bg-atencao-suave px-4 py-3">
        <Icone nome="alerta" className="size-5 shrink-0 text-atencao" />
        <p className="min-w-0 flex-1 text-pequeno text-texto">
          <span className="font-semibold">O agente ainda não pode atender:</span> faltam {nomesFaltam.join(' e ')}. Dá para
          fazer agora respondendo algumas perguntas.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to={ASSISTENTE} className="inline-flex h-8 items-center rounded-md bg-primaria px-3 text-pequeno font-medium text-white hover:bg-primaria-hover">
            Montar com o assistente
          </Link>
          <Botao tamanho="sm" variante="secundario" onClick={() => setAberto(true)}>
            Ver os passos
          </Botao>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="primeiros-passos" className="rounded-lg border border-borda bg-superficie p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="primeiros-passos" className="font-semibold">
          Primeiros passos
        </h2>
        <span className="text-legenda text-texto-3">
          {feitos} de {OBRIGATORIOS.length}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="h-full rounded-full bg-destaque" style={{ width: `${(feitos / OBRIGATORIOS.length) * 100}%` }} />
      </div>
      <ol className="mt-3 space-y-1">
        {OBRIGATORIOS.map((p) => (
          <ItemPasso
            key={p.chave}
            passo={p}
            feito={!!passos[p.chave]}
            destaque={p === proximo}
            adiado={adiados.includes(p.chave)}
            bloqueado={p.chave === 'agente_ligado' && faltamDoAgente.length > 0}
            semAgente={!passos.whatsapp}
            aoAdiar={(v) => mudarDepois(p.chave, v)}
          />
        ))}
      </ol>
      {adiadosPendentes.length > 0 && (
        <p className="mt-2 rounded-md bg-atencao-suave px-3 py-2 text-legenda text-atencao">
          Sem {nomesFaltam.join(' e ')}, o agente não pode ser ligado: as conversas vão direto para a equipe.
        </p>
      )}
      <p className="mt-4 text-legenda font-semibold tracking-wide text-texto-3 uppercase">Opcional</p>
      <ol className="mt-1">
        <ItemPasso passo={OPCIONAL} feito={!!passos[OPCIONAL.chave]} opcional />
      </ol>
    </section>
  )
}

function ItemPasso({
  passo,
  feito,
  destaque = false,
  adiado = false,
  bloqueado = false,
  opcional = false,
  semAgente = false,
  aoAdiar,
}: {
  passo: Passo
  feito: boolean
  destaque?: boolean
  adiado?: boolean
  bloqueado?: boolean
  opcional?: boolean
  /** O agente nasce com o primeiro número conectado: antes disso não há onde escrever. */
  semAgente?: boolean
  aoAdiar?: (adiar: boolean) => void
}) {
  return (
    <li className={`rounded-md px-2 py-2 ${destaque ? 'bg-primaria-suave' : ''}`}>
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
            feito ? 'border-primaria bg-primaria text-white' : opcional ? 'border-dashed border-borda bg-superficie' : 'border-borda bg-superficie'
          }`}
        >
          {feito && <Icone nome="check" className="size-3" />}
        </span>
        <span className="min-w-0 flex-1">
          <Link
            to={passo.para}
            className={`flex flex-wrap items-center gap-2 text-pequeno font-medium hover:text-primaria ${feito ? 'text-texto-3 line-through' : 'text-texto'}`}
          >
            {passo.rotulo}
            <span className="sr-only">{feito ? ' (feito)' : ' (pendente)'}</span>
            {!feito && adiado && (
              <span className="rounded-sm bg-atencao-suave px-1.5 text-legenda font-normal text-atencao no-underline">Para depois</span>
            )}
          </Link>
          {!feito && (
            <span className={`block text-legenda ${bloqueado ? 'text-atencao' : 'text-texto-3'}`}>
              {bloqueado ? 'Precisa das instruções e da base antes.' : passo.detalhe}
            </span>
          )}
          {!feito && passo.adiavel && (
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-legenda">
              {semAgente ? (
                <span className="text-texto-3">Conecte o WhatsApp primeiro: o agente nasce com o número.</span>
              ) : (
                <>
                  <Link to={ASSISTENTE} className="font-medium text-primaria underline">
                    Montar com o assistente (ele pergunta, você responde)
                  </Link>
                  <Link to={passo.para} className="text-texto-2 underline">
                    Escrever eu mesmo
                  </Link>
                </>
              )}
              <button type="button" onClick={() => aoAdiar?.(!adiado)} className="text-texto-3 underline hover:text-texto">
                {adiado ? 'Retomar agora' : 'Deixar para depois'}
              </button>
            </span>
          )}
        </span>
      </div>
    </li>
  )
}
