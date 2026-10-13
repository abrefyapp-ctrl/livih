import { ROTULO_STATUS, type StatusPedido } from '../services/erp'

const COR: Record<StatusPedido, string> = {
  rascunho: 'bg-slate-100 text-texto-2',
  confirmado: 'bg-info-suave text-info',
  separando: 'bg-atencao-suave text-atencao',
  enviado: 'bg-primaria-suave text-primaria',
  entregue: 'bg-primaria text-white',
  cancelado: 'bg-erro-suave text-erro',
}

export function EtiquetaPedido({ status }: { status: StatusPedido }) {
  return <span className={`inline-flex rounded-sm px-1.5 py-0.5 text-legenda font-medium ${COR[status]}`}>{ROTULO_STATUS[status]}</span>
}
