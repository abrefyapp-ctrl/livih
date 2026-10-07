import type { ReactNode } from 'react'

// Formatação do WhatsApp: *negrito*, _itálico_, ~riscado~ e ```monoespaçado```.
// Como no app: o marcador cola no texto e fica fora de palavras — "2 * 3" e "nome_do_arquivo" seguem literais.
const PADRAO =
  /```([\s\S]+?)```|(?<![\p{L}\p{N}])(?:\*(\S(?:[^*\n]*\S)?)\*|_(\S(?:[^_\n]*\S)?)_|~(\S(?:[^~\n]*\S)?)~)(?![\p{L}\p{N}])/gu

export function TextoWhatsapp({ texto }: { texto: string }) {
  const partes: ReactNode[] = []
  let ultimo = 0
  for (const m of texto.matchAll(PADRAO)) {
    const i = m.index ?? 0
    if (i > ultimo) partes.push(texto.slice(ultimo, i))
    const [, mono, negrito, italico, riscado] = m
    if (mono !== undefined) partes.push(<code key={i} className="font-mono text-pequeno">{mono}</code>)
    else if (negrito !== undefined) partes.push(<strong key={i} className="font-semibold">{negrito}</strong>)
    else if (italico !== undefined) partes.push(<em key={i}>{italico}</em>)
    else partes.push(<s key={i}>{riscado}</s>)
    ultimo = i + m[0].length
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return <>{partes}</>
}
