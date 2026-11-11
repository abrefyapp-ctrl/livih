/** Rodapé institucional, em todas as telas. */
export function RodapeF7() {
  return (
    // No celular, uma linha curta: as duas linhas de antes tiravam espaço da tela em todas as páginas (revisão de 11/11).
    <footer className="shrink-0 border-t border-borda bg-superficie px-4 py-1 text-center text-legenda text-texto-3 sm:py-1.5 sm:text-pequeno">
      Livih é um produto{' '}
      <a href="https://www.f7tech.com.br" target="_blank" rel="noopener noreferrer" className="underline hover:text-texto-2">
        F7 Tech
      </a>
      <span className="hidden sm:inline"> · www.f7tech.com.br · CNPJ 62.213.016/0001-30</span>
    </footer>
  )
}
