import type { ComponentType } from 'react'
import type { NomeIcone } from '../components/Icone'
import { ManualBalcao, SECOES_BALCAO } from './ManualBalcao'
import { ManualCampanhas, SECOES_CAMPANHAS } from './ManualCampanhas'
import { ManualEmpresa, SECOES_EMPRESA } from './ManualEmpresa'
import { ManualEquipe, SECOES_EQUIPE } from './ManualEquipe'
import { ManualNotificacoes, SECOES_NOTIFICACOES } from './ManualNotificacoes'
import { ManualModelos, SECOES_MODELOS } from './ManualModelos'
import { ManualPlano, SECOES_PLANO } from './ManualPlano'
import { ManualRespostas, SECOES_RESPOSTAS } from './ManualRespostas'
import { ManualWhatsapp, SECOES_WHATSAPP } from './ManualWhatsapp'

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
    id: 'balcao',
    titulo: 'Balcão',
    resumo: 'Venda de loja numa tela: produto, cliente, pagamento, NF-e com impressão e envio da nota ao cliente.',
    icone: 'caixa',
    secoes: SECOES_BALCAO,
    Conteudo: ManualBalcao,
    para: 'Quem vende no balcão, dono e admin',
    atualizado: '18/11/2026',
  },
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
    id: 'whatsapp',
    titulo: 'WhatsApp',
    resumo: 'Conectar os números (pelo celular ou pela API oficial), ligar o agente, distribuir os contatos e a origem.',
    icone: 'telefone',
    secoes: SECOES_WHATSAPP,
    Conteudo: ManualWhatsapp,
    para: 'Dono e admin',
    atualizado: '16/11/2026',
  },
  {
    id: 'modelos',
    titulo: 'Modelos de mensagem',
    resumo: 'Criar os modelos que a Meta aprova, para escrever ao cliente depois de 24 horas e nas campanhas.',
    icone: 'arquivo',
    secoes: SECOES_MODELOS,
    Conteudo: ManualModelos,
    para: 'Toda a equipe',
    atualizado: '16/11/2026',
  },
  {
    id: 'respostas',
    titulo: 'Respostas rápidas',
    resumo: 'Mensagens prontas para usar na conversa com "/", como chave Pix, prazo e endereço.',
    icone: 'raio',
    secoes: SECOES_RESPOSTAS,
    Conteudo: ManualRespostas,
    para: 'Toda a equipe',
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
