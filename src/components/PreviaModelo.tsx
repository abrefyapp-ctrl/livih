import { TextoWhatsapp } from './TextoWhatsapp'

/** Como o modelo chega no WhatsApp, com os valores (ou exemplos) no lugar das variáveis. */
export function PreviaModelo({
  cabecalho,
  corpo,
  rodape,
  botoes,
  valores,
}: {
  cabecalho: string
  corpo: string
  rodape: string
  botoes: string[]
  valores: string[]
}) {
  const texto = corpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (marca, n) => valores[Number(n) - 1]?.trim() || marca)
  const listaBotoes = botoes.filter((b) => b.trim())
  return (
    <div className="rounded-lg bg-[#efeae2] p-3">
      <div className="max-w-xs overflow-hidden rounded-lg bg-white text-pequeno shadow-sm">
        <div className="space-y-1 px-3 py-2">
          {cabecalho.trim() && <p className="font-semibold">{cabecalho}</p>}
          <p className="break-words whitespace-pre-wrap">
            {texto.trim() ? <TextoWhatsapp texto={texto} /> : <span className="text-texto-3">O texto da mensagem aparece aqui.</span>}
          </p>
          {rodape.trim() && <p className="text-legenda text-texto-3">{rodape}</p>}
        </div>
        {listaBotoes.map((b, i) => (
          <p key={i} className="border-t border-borda py-2 text-center font-medium text-info">
            {b}
          </p>
        ))}
      </div>
    </div>
  )
}
