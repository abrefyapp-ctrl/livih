import { moeda } from '../services/formato'
import { SITUACAO_FATURA, type Fatura, type ItemFatura } from '../services/faturas'
import { Botao } from './Botao'

const TONS = {
  neutro: 'bg-slate-100 text-texto-2',
  atencao: 'bg-atencao-suave text-atencao',
  ok: 'bg-primaria-suave text-primaria',
  erro: 'bg-erro-suave text-erro',
}
const mesAno = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
const dia = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

/**
 * Faturas da empresa com os itens e o link do Asaas. Com `acoes` (só a plataforma): o motivo técnico do problema e os
 * botões de tentar de novo e cancelar.
 */
export function ListaFaturas({ faturas, acoes }: {
  faturas: Fatura[]
  acoes?: { reenviar: (f: Fatura) => void; cancelar: (f: Fatura) => void; ocupado: boolean }
}) {
  return (
    <ul className="divide-y divide-borda rounded-lg border border-borda">
      {faturas.map((f) => {
        const s = SITUACAO_FATURA[f.status] ?? { rotulo: f.status, tom: 'neutro' as const }
        const itens = (f.itens ?? []) as ItemFatura[]
        const abrir = (f.status === 'aberta' || f.status === 'vencida') && f.link
        const cancelavel = !['paga', 'estornada', 'cancelada', 'a_cancelar', 'enviando'].includes(f.status)
        return (
          <li key={f.id} className="space-y-1 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-block font-medium first-letter:uppercase">
                {f.tipo === 'avulsa' ? `Cobrança avulsa de ${mesAno(f.competencia)}` : mesAno(f.competencia)}
              </span>
              <span className={`rounded-sm px-1.5 py-0.5 text-legenda font-medium ${TONS[s.tom]}`}>{s.rotulo}</span>
              {f.ambiente === 'sandbox' && (
                <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-legenda text-texto-3">Teste</span>
              )}
              <span className="ml-auto font-semibold tabular-nums">{moeda(Number(f.valor), true)}</span>
            </div>
            <p className="text-legenda text-texto-3">
              Vence em {dia(f.vencimento)}
              {f.parcelas > 1 && ` · no cartão em ${f.parcelas}x sem juros`}
              {f.paga_em && ` · paga em ${new Date(f.paga_em).toLocaleDateString('pt-BR')}`}
            </p>
            <ul className="text-legenda text-texto-2">
              {itens.map((i, n) => (
                <li key={n} className="flex justify-between gap-3">
                  <span>
                    {i.descricao}
                    {i.quantidade > 1 && ` (${i.quantidade})`}
                  </span>
                  <span className="tabular-nums">{moeda(Number(i.valor), true)}</span>
                </li>
              ))}
            </ul>
            {f.status === 'erro' &&
              (acoes ? (
                f.erro && <p className="text-legenda text-erro">{f.erro}</p>
              ) : (
                <p className="text-legenda text-texto-2">
                  O link de pagamento ainda não foi gerado. Confira os dados de cobrança logo abaixo e salve; a Livih tenta de novo no
                  dia seguinte.
                </p>
              ))}
            <div className="flex flex-wrap gap-2 pt-1">
              {abrir && (
                <a
                  href={f.link!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center rounded-md bg-primaria px-3 text-pequeno font-medium text-white hover:bg-primaria-hover"
                >
                  {f.parcelas > 1 ? `Abrir fatura (cartão em ${f.parcelas}x)` : 'Abrir fatura (Pix, boleto ou cartão)'}
                </a>
              )}
              {acoes && f.status === 'erro' && !f.asaas_id && (
                <Botao tamanho="sm" variante="secundario" onClick={() => acoes.reenviar(f)} disabled={acoes.ocupado}>
                  Tentar de novo
                </Botao>
              )}
              {acoes && cancelavel && (
                <Botao tamanho="sm" variante="fantasma" onClick={() => acoes.cancelar(f)} disabled={acoes.ocupado}>
                  Cancelar fatura
                </Botao>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
