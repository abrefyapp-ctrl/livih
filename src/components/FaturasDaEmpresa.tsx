import { useEffect, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import { listarFaturas, type Fatura } from '../services/faturas'
import { Aviso } from './Aviso'
import { ListaFaturas } from './ListaFaturas'

/** Configurações → Plano e consumo: as faturas da empresa com o link de pagamento. Some enquanto não houver fatura. */
export function FaturasDaEmpresa({ orgId }: { orgId: string }) {
  const { modulos } = useSessao()
  const comNota = !!modulos && (modulos.has('erp') || modulos.has('os'))
  const [faturas, setFaturas] = useState<{ orgId: string; lista: Fatura[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    listarFaturas(orgId)
      .then((lista) => vivo && (setFaturas({ orgId, lista }), setErro(null)))
      .catch(() => vivo && setErro('Não foi possível carregar as faturas. Confira a internet e tente de novo.'))
    return () => {
      vivo = false
    }
  }, [orgId])

  const lista = faturas?.orgId === orgId ? faturas.lista : null
  if (erro) return <Aviso tom="erro">{erro}</Aviso>
  if (!lista?.length) return null

  return (
    <section aria-labelledby="titulo-faturas" className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
      <div>
        <h2 id="titulo-faturas" className="text-h2 font-semibold">
          Faturas
        </h2>
        <p className="text-pequeno text-texto-3">
          As faturas vencem no dia 10. A primeira e as cobranças avulsas (a diferença do anual ao subir de plano ou contratar
          módulo) vencem em outra data: confira em cada fatura. O pagamento é feito na página do Asaas,
          que faz a cobrança da Livih, por Pix, boleto ou cartão. Depois do vencimento, há multa de 2 % e juros de 1 % ao mês. O
          pagamento aparece aqui assim que é confirmado (atualize a página): Pix e cartão na hora, boleto em até 3 dias úteis.
        </p>
        {/* Cobrados desde 03/11 (migration 20261103120000) e antes sem nenhuma menção na tela (revisão de 16/11). */}
        {comNota && (
          <p className="mt-1 text-pequeno text-texto-3">
            Com a nota fiscal, também entram na fatura: cada CNPJ a mais emitindo em produção (R$ 49 por mês, a partir do
            segundo) e as notas além das 100 do mês em cada CNPJ (R$ 0,20 por nota).
          </p>
        )}
      </div>
      <ListaFaturas faturas={lista} />
    </section>
  )
}
