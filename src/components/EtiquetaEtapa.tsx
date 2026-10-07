import type { TipoEtapa } from '../services/crm'
import { Icone } from './Icone'

const COR: Record<TipoEtapa, string> = {
  aberta: 'bg-info-suave text-info',
  ganho: 'bg-primaria-suave text-primaria',
  perdido: 'bg-erro-suave text-erro',
}

/** Etapa do funil: em aberto (azul), ganho (verde, com ✓) ou perdido (vermelho, com ✕) — texto sempre junto. */
export function EtiquetaEtapa({ nome, tipo }: { nome: string; tipo: TipoEtapa }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-legenda font-medium ${COR[tipo]}`}>
      {tipo === 'ganho' && <Icone nome="check" className="size-3" />}
      {tipo === 'perdido' && <Icone nome="fechar" className="size-3" />}
      {nome}
    </span>
  )
}
