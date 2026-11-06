import { useState } from 'react'
import { confirmarPagamentoMeta, pagamentoPendente, type PagamentoMetaCanal } from '../services/configuracoes'
import { quandoCurto } from '../services/formato'
import { Aviso } from './Aviso'
import { Botao } from './Botao'

const LINK_COBRANCA_META = 'https://business.facebook.com/billing_hub/'

/**
 * Passo a passo para cadastrar o cartão na conta do WhatsApp Business (a Meta cobra a empresa direto; a API não diz se já
 * há cartão, por isso o "Já cadastrei"). Some quando confirmado, e volta se a Meta recusar por falta de pagamento.
 */
export function PagamentoMeta({
  canal,
  gerencia,
  aoConfirmar,
}: {
  canal: PagamentoMetaCanal
  gerencia: boolean
  aoConfirmar: () => void
}) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  if (!pagamentoPendente(canal)) return null
  const recusou = !!canal.falha_em

  async function confirmar() {
    setSalvando(true)
    setErro(null)
    try {
      await confirmarPagamentoMeta(canal.id)
      aoConfirmar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Aviso tom={recusou ? 'erro' : 'atencao'}>
      <div className="space-y-2">
        <p className="font-medium">
          {recusou
            ? `A Meta recusou mensagens deste número por falta de forma de pagamento (${quandoCurto(canal.falha_em).toLowerCase()}).`
            : 'Cadastre a forma de pagamento na Meta.'}
        </p>
        <p>
          A Meta cobra direto da sua empresa as campanhas e as mensagens por modelo fora das 24 horas. Sem cartão, elas são
          recusadas. Responder quem escreveu nas últimas 24 horas continua grátis.
        </p>
        <ol className="list-decimal space-y-0.5 pl-5">
          <li>Entre em business.facebook.com com o Facebook usado para conectar este número.</li>
          <li>Vá em Configurações → Cobrança e pagamentos.</li>
          <li>Escolha a conta do WhatsApp Business (não a de anúncios) e toque em Adicionar forma de pagamento.</li>
        </ol>
        {erro && <p className="font-medium">{erro}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a href={LINK_COBRANCA_META} target="_blank" rel="noreferrer" className="font-medium underline">
            Abrir Cobrança e pagamentos da Meta
          </a>
          {gerencia ? (
            <Botao tamanho="sm" variante="secundario" carregando={salvando} onClick={() => void confirmar()}>
              Já cadastrei
            </Botao>
          ) : (
            <span>Quem faz isso é o dono ou o admin.</span>
          )}
        </div>
      </div>
    </Aviso>
  )
}
