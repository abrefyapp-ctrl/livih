import { useState } from 'react'
import { Botao } from './Botao'
import { Icone } from './Icone'

/** Link de acesso (convite, dono de empresa nova ou senha nova) com botões de copiar e mandar pelo WhatsApp. */
export function LinkConvite({
  link,
  nome,
  nomeOrg,
  tipo = 'convite',
}: {
  link: string
  nome: string
  nomeOrg: string
  tipo?: 'convite' | 'senha' | 'dono'
}) {
  const [copiado, setCopiado] = useState(false)
  const primeiroNome = nome.includes('@') ? '' : nome.split(' ')[0]
  const oi = `Oi${primeiroNome ? `, ${primeiroNome}` : ''}!`
  const mensagem =
    tipo === 'senha'
      ? `${oi} Este é o link para você criar uma senha nova no Livih (vale por 24 horas): ${link}`
      : tipo === 'dono'
        ? `${oi} A conta da ${nomeOrg} no Livih está pronta. Crie sua senha por este link (vale por 24 horas) ` +
          `e siga os primeiros passos para conectar o WhatsApp e configurar o agente: ${link}`
        : `${oi} Você foi convidado(a) para atender as conversas da ${nomeOrg} no Livih. ` +
        `Crie sua senha por este link (vale por 24 horas): ${link}`

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div className="space-y-3">
      <p>
        Mande este link para {nome}. Ele vale por 24 horas e abre a tela para criar {tipo === 'senha' ? 'uma senha nova' : 'a senha'}.
        {tipo === 'senha' && ' A senha atual continua valendo até a pessoa trocar.'}
      </p>
      <div className="flex items-center gap-2 rounded-md border border-borda bg-fundo p-2">
        <Icone nome="link" className="size-4 shrink-0 text-texto-3" />
        <code className="min-w-0 flex-1 truncate text-legenda">{link}</code>
      </div>
      <div className="flex flex-wrap gap-2">
        <Botao variante="secundario" icone={copiado ? 'check' : 'copiar'} onClick={() => void copiar()}>
          {copiado ? 'Link copiado' : 'Copiar link'}
        </Botao>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primaria px-4 font-medium text-white hover:bg-primaria-hover"
        >
          <Icone nome="enviar" className="size-4" />
          Enviar pelo WhatsApp
        </a>
      </div>
    </div>
  )
}
