import type { ComponentType } from 'react'
import type { NomeIcone } from '../components/Icone'
import { ManualCampanhas, SECOES_CAMPANHAS } from './ManualCampanhas'

// Manuais da Ajuda (menu Ajuda, /ajuda/<id>). Manual novo: um componente em src/ajuda/, as imagens em
// public/ajuda/<id>/ (sem dados reais de clientes) e uma linha aqui.

export type Manual = {
  id: string
  titulo: string
  resumo: string
  icone: NomeIcone
  secoes: { id: string; titulo: string }[]
  Conteudo: ComponentType
  /** Quem usa a área (o manual aparece para todos; isto só avisa). */
  para?: string
  atualizado: string
}

export const MANUAIS: Manual[] = [
  {
    id: 'campanhas',
    titulo: 'Campanhas',
    resumo: 'Mandar uma mensagem de divulgação para um grupo de contatos pelo WhatsApp oficial.',
    icone: 'enviar',
    secoes: SECOES_CAMPANHAS,
    Conteudo: ManualCampanhas,
    para: 'Dono e admin',
    atualizado: '05/11/2026',
  },
]
