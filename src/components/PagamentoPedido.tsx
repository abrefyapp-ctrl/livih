import { useEffect, useState } from 'react'
import { atualizarPedido, type Pedido } from '../services/erp'
import {
  PRAZOS_PRONTOS,
  ROTULO_FORMA,
  lerPrazos,
  listarParcelasPedido,
  rotuloPrazos,
  type FormaPagamento,
  type ParcelaPedido,
  type Situacao,
} from '../services/financeiro'
import { moeda } from '../services/formato'
import { data } from '../services/os'
import { EtiquetaSituacao } from './ModaisFinanceiro'

/**
 * Forma e prazos do pagamento (docs/financeiro.md, entrega 2). No rascunho se escolhe; ao confirmar, viram as parcelas
 * a receber do financeiro, que aparecem aqui com a situação de cada uma.
 */
export function PagamentoPedido({ pedido, editavel, aoMudar, aoErro }: {
  pedido: Pedido
  editavel: boolean
  aoMudar: () => void
  aoErro: (m: string | null) => void
}) {
  const prazos = pedido.pagamento_prazos ?? [0]
  const pronto = PRAZOS_PRONTOS.find((p) => p.prazos.join('/') === prazos.join('/'))
  const [outro, setOutro] = useState(!pronto)
  const [texto, setTexto] = useState(prazos.join('/'))
  const [erroPrazo, setErroPrazo] = useState<string | null>(null)
  const [parcelas, setParcelas] = useState<{ chave: string; lista: ParcelaPedido[] } | null>(null)
  const confirmado = pedido.status !== 'rascunho' && pedido.status !== 'cancelado'
  const chave = `${pedido.id}|${pedido.status}|${pedido.total}|${prazos.join('/')}`

  useEffect(() => {
    if (!confirmado) return
    let ativo = true
    listarParcelasPedido(pedido.id)
      .then((lista) => ativo && setParcelas({ chave, lista }))
      .catch(() => ativo && setParcelas({ chave, lista: [] }))
    return () => {
      ativo = false
    }
  }, [pedido.id, confirmado, chave])

  async function salvar(dados: Parameters<typeof atualizarPedido>[1]) {
    aoErro(null)
    try {
      await atualizarPedido(pedido.id, dados)
      aoMudar()
    } catch (e) {
      aoErro((e as Error).message)
    }
  }

  function salvarOutro() {
    const dias = lerPrazos(texto)
    if (!dias) return setErroPrazo('Escreva os dias de cada parcela em ordem, separados por barra. Ex.: 30/60/90.')
    setErroPrazo(null)
    if (dias.join('/') !== prazos.join('/')) void salvar({ pagamento_prazos: dias })
  }

  // Previsão das parcelas no rascunho: o total dividido, os centavos que sobram na última (a mesma conta do banco).
  const total = Number(pedido.total)
  const centavos = Math.round(total * 100)
  const base = Math.floor(centavos / prazos.length)
  const lista = parcelas?.chave === chave ? parcelas.lista : null
  const rotulo = 'block text-pequeno font-medium text-texto-2'
  const caixa = 'block h-10 w-full rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none disabled:bg-fundo disabled:text-texto-2'

  return (
    <section aria-labelledby="titulo-pagamento" className="rounded-lg border border-borda bg-superficie">
      <h2 id="titulo-pagamento" className="border-b border-borda px-4 py-3 font-semibold">
        Pagamento
      </h2>
      <div className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="pag-forma" className={rotulo}>
              Forma
            </label>
            <select
              id="pag-forma"
              value={pedido.pagamento_forma ?? ''}
              disabled={!editavel}
              onChange={(e) => void salvar({ pagamento_forma: e.target.value || null })}
              className={caixa}
            >
              <option value="">Não definida</option>
              {Object.entries(ROTULO_FORMA).map(([id, r]) => (
                <option key={id} value={id}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pag-prazos" className={rotulo}>
              Parcelas
            </label>
            {editavel ? (
              <select
                id="pag-prazos"
                value={outro ? 'outro' : prazos.join('/')}
                onChange={(e) => {
                  if (e.target.value === 'outro') return setOutro(true)
                  setOutro(false)
                  setErroPrazo(null)
                  void salvar({ pagamento_prazos: e.target.value.split('/').map(Number) })
                }}
                className={caixa}
              >
                {PRAZOS_PRONTOS.map((p) => (
                  <option key={p.rotulo} value={p.prazos.join('/')}>
                    {p.rotulo}
                  </option>
                ))}
                <option value="outro">Outros prazos…</option>
              </select>
            ) : (
              <p id="pag-prazos" className="flex h-10 items-center text-pequeno">
                {rotuloPrazos(pedido.pagamento_prazos)}
              </p>
            )}
          </div>
        </div>
        {editavel && outro && (
          <div className="space-y-1.5">
            <label htmlFor="pag-outro" className={rotulo}>
              Dias de cada parcela, depois da confirmação
            </label>
            <input
              id="pag-outro"
              value={texto}
              placeholder="Ex.: 15/45/75"
              onChange={(e) => setTexto(e.target.value)}
              onBlur={salvarOutro}
              className={caixa}
            />
            {erroPrazo && <p className="text-legenda text-erro">{erroPrazo}</p>}
          </div>
        )}

        {confirmado ? (
          lista === null ? (
            <p className="text-pequeno text-texto-3">Carregando as parcelas…</p>
          ) : !lista.length ? (
            <p className="text-pequeno text-texto-3">
              Este pedido foi confirmado antes do financeiro e não tem parcelas a receber.
            </p>
          ) : (
            <ul className="divide-y divide-borda rounded-md border border-borda text-pequeno">
              {lista.map((p) => (
                <li key={p.parcela} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="w-12 text-texto-3 tabular-nums">
                    {p.parcela}/{p.parcelas}
                  </span>
                  <span className="flex-1 tabular-nums">vence {data(p.vencimento)}</span>
                  <EtiquetaSituacao situacao={p.situacao as Situacao} emParte={Number(p.valor_pago) > 0} />
                  <span className="w-24 text-right font-medium tabular-nums">{moeda(Number(p.valor), true)}</span>
                </li>
              ))}
            </ul>
          )
        ) : (
          pedido.status === 'rascunho' &&
          total > 0 && (
            <p className="text-legenda text-texto-3">
              Ao confirmar, vira {prazos.length === 1 ? 'uma conta' : `${prazos.length} parcelas`} a receber no financeiro
              {prazos.length > 1 && ` de ${moeda(base / 100, true)}`}
              {prazos.length > 1 && base * prazos.length !== centavos && ' (os centavos que sobram vão na última)'}
              {prazos.length === 1 && prazos[0] === 0 ? ', vencendo no dia da confirmação.' : ', contando os dias a partir da confirmação.'}
            </p>
          )
        )}
        {pedido.pagamento_forma && (
          <p className="text-legenda text-texto-3">A nota fiscal deste pedido já sai com a forma {ROTULO_FORMA[pedido.pagamento_forma as FormaPagamento].toLowerCase()}.</p>
        )}
      </div>
    </section>
  )
}
