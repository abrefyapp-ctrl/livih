import type { ReactNode } from 'react'

/**
 * Barra de título das telas largas (Configurações, Empresas; 13/11): título, uma frase do que é a tela e as ações à
 * direita, presa no alto e separada do conteúdo por uma linha. Antes o título flutuava numa coluna central, e num
 * monitor largo sobrava vazio dos dois lados (referência: tela de Configurações da Exata Laser).
 */
export function CabecalhoPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="shrink-0 border-b border-borda bg-superficie px-4 py-4 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1 font-semibold">{titulo}</h1>
          {descricao && <p className="text-pequeno text-texto-3">{descricao}</p>}
        </div>
        {acoes}
      </div>
    </header>
  )
}
