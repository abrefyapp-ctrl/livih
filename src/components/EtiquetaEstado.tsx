import type { EstadoConversa } from '../services/atendimento'
import { Icone, type NomeIcone } from './Icone'

const ESTADOS: Record<EstadoConversa, { rotulo: string; icone: NomeIcone; cor: string }> = {
  aguardando_humano: { rotulo: 'Aguardando você', icone: 'alerta', cor: 'bg-atencao-suave text-atencao' },
  humano: { rotulo: 'Em atendimento', icone: 'usuario', cor: 'bg-info-suave text-info' },
  bot: { rotulo: 'Com o agente', icone: 'agente', cor: 'bg-primaria-suave text-primaria' },
  encerrada: { rotulo: 'Encerrada', icone: 'check', cor: 'bg-slate-100 text-texto-3' },
}

/** Estado da conversa: cor + ícone + texto (nunca só a cor). */
export function EtiquetaEstado({ estado, complemento }: { estado: EstadoConversa; complemento?: string }) {
  const e = ESTADOS[estado]
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-legenda font-medium ${e.cor}`}>
      <Icone nome={e.icone} className="size-3.5" />
      {e.rotulo}
      {complemento && <span className="font-normal">· {complemento}</span>}
    </span>
  )
}
