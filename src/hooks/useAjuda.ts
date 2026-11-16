import { createContext, useContext } from 'react'

// Painel da Ajuda ao lado da tela (16/11, pedido do usuário): ler o manual e fazer os passos sem trocar de aba.
// O Layout guarda o estado; qualquer tela abre o painel já num manual ("Como usar" das Campanhas).

export type PainelAjuda = {
  aberta: boolean
  /** Manual aberto (id de src/ajuda/manuais.ts); nulo = a lista dos manuais. */
  manual: string | null
  abrir: (manual?: string | null) => void
  fechar: () => void
}

// Fora do Layout (não deveria acontecer), abre a Ajuda em outra aba, como antes.
export const AjudaContexto = createContext<PainelAjuda>({
  aberta: false,
  manual: null,
  abrir: (manual) => void window.open(manual ? `/ajuda/${manual}` : '/ajuda', '_blank', 'noopener'),
  fechar: () => undefined,
})

export const useAjuda = () => useContext(AjudaContexto)
