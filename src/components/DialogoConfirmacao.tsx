import type { ReactNode } from 'react'
import { Botao } from './Botao'
import { Modal } from './Modal'

export function DialogoConfirmacao({
  aberto,
  titulo,
  children,
  rotuloConfirmar,
  perigo = false,
  carregando = false,
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean
  titulo: string
  children: ReactNode
  rotuloConfirmar: string
  perigo?: boolean
  carregando?: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
}) {
  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      aoFechar={aoCancelar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoCancelar} disabled={carregando}>
            Cancelar
          </Botao>
          <Botao variante={perigo ? 'perigo' : 'primario'} onClick={aoConfirmar} carregando={carregando}>
            {rotuloConfirmar}
          </Botao>
        </>
      }
    >
      {children}
    </Modal>
  )
}
