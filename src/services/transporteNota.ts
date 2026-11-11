import { formatarDocumento, limparDocumento } from './formato'
import { COM_TRANSPORTADORA, type TransporteNota } from './nfe'

// Formulário do transporte da NF-e (components/TransporteNota.tsx): os campos ficam em texto enquanto a pessoa digita
// (peso com vírgula) e viram números só no envio.

export type FormTransporte = {
  modalidade: number
  documento: string
  nome: string
  inscricao_estadual: string
  endereco: string
  municipio: string
  uf: string
  quantidade: string
  especie: string
  marca: string
  numero: string
  peso_liquido: string
  peso_bruto: string
}

const peso = (n: number | null | undefined) => (n == null ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: 3 }))

/** Vem do transporte da última nota do pedido (o "Emitir de novo" depois de uma recusa); sem ela, do frete do pedido. */
export function transporteInicial(anterior: TransporteNota | null | undefined, frete: number): FormTransporte {
  const t = anterior?.transportadora
  const v = anterior?.volume
  return {
    modalidade: anterior?.modalidade ?? (frete > 0 ? 0 : 9),
    documento: t?.documento ? formatarDocumento(t.documento) : '',
    nome: t?.nome ?? '',
    inscricao_estadual: t?.inscricao_estadual ?? '',
    endereco: t?.endereco ?? '',
    municipio: t?.municipio ?? '',
    uf: t?.uf ?? '',
    quantidade: v?.quantidade != null ? String(v.quantidade) : '',
    especie: v?.especie ?? '',
    marca: v?.marca ?? '',
    numero: v?.numero ?? '',
    peso_liquido: peso(v?.peso_liquido),
    peso_bruto: peso(v?.peso_bruto),
  }
}

/** "1.234,5" ou "1234.5" → 1234.5; vazio ou inválido → null (a função da nota confere de novo). */
function numero(v: string): number | null {
  const s = v.trim()
  if (!s) return null
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function transporteParaEnvio(f: FormTransporte): TransporteNota {
  const comTransportadora = COM_TRANSPORTADORA.includes(f.modalidade) && !!(f.documento.trim() || f.nome.trim())
  const qtd = numero(f.quantidade)
  return {
    modalidade: f.modalidade,
    transportadora: comTransportadora
      ? {
          documento: limparDocumento(f.documento),
          nome: f.nome.trim(),
          inscricao_estadual: f.inscricao_estadual.trim(),
          endereco: f.endereco.trim(),
          municipio: f.municipio.trim(),
          uf: f.uf.trim().toUpperCase(),
        }
      : null,
    volume: {
      quantidade: qtd != null ? Math.round(qtd) : null,
      especie: f.especie.trim(),
      marca: f.marca.trim(),
      numero: f.numero.trim(),
      peso_liquido: numero(f.peso_liquido),
      peso_bruto: numero(f.peso_bruto),
    },
  }
}
