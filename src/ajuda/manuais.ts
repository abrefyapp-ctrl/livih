import type { ComponentType } from 'react'
import type { NomeIcone } from '../components/Icone'
import { ManualCampanhas, SECOES_CAMPANHAS } from './ManualCampanhas'
import { ManualEmpresa, SECOES_EMPRESA } from './ManualEmpresa'
import { ManualEquipe, SECOES_EQUIPE } from './ManualEquipe'
import { ManualNotificacoes, SECOES_NOTIFICACOES } from './ManualNotificacoes'
import { ManualPlano, SECOES_PLANO } from './ManualPlano'

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

// Os de Configurações abrem também pelo "Como usar" do cabeçalho de cada tela (src/pages/Configuracoes.tsx).
export const MANUAIS: Manual[] = [
  {
    id: 'equipe',
    titulo: 'Equipe',
    resumo: 'Convidar pessoas, papéis, equipes de venda, distribuição dos contatos e ausência.',
    icone: 'equipe',
    secoes: SECOES_EQUIPE,
    Conteudo: ManualEquipe,
    para: 'Dono e admin',
    atualizado: '16/11/2026',
  },
  {
    id: 'empresa',
    titulo: 'Empresa e nota fiscal',
    resumo: 'Dados da empresa, logo, padrões do orçamento, mais de um CNPJ e a configuração da nota fiscal.',
    icone: 'empresa',
    secoes: SECOES_EMPRESA,
    Conteudo: ManualEmpresa,
    para: 'Dono e admin',
    atualizado: '16/11/2026',
  },
  {
    id: 'notificacoes',
    titulo: 'Notificações',
    resumo: 'Receber no celular e no computador os avisos de cliente aguardando, lembretes e alertas.',
    icone: 'sino',
    secoes: SECOES_NOTIFICACOES,
    Conteudo: ManualNotificacoes,
    para: 'Toda a equipe',
    atualizado: '16/11/2026',
  },
  {
    id: 'plano',
    titulo: 'Plano e consumo',
    resumo: 'Atendimentos do mês, o que fazer quando acabam, trocar de plano, módulos e faturas.',
    icone: 'painel',
    secoes: SECOES_PLANO,
    Conteudo: ManualPlano,
    para: 'Dono e admin',
    atualizado: '16/11/2026',
  },
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
