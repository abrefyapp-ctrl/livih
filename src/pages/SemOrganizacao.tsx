import { useSessao } from '../hooks/useSessao'
import { Botao } from '../components/Botao'
import { EstadoVazio } from '../components/EstadoVazio'
import { Logo } from '../components/Logo'

/** Logado, mas sem vínculo com nenhuma organização (ainda não foi convidado ou foi desativado). */
export function SemOrganizacao() {
  const { sessao, sair } = useSessao()
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <Logo />
      <EstadoVazio
        icone="empresa"
        titulo="Sua conta ainda não está em nenhuma empresa"
        acao={
          <Botao variante="secundario" icone="sair" onClick={() => void sair()}>
            Sair
          </Botao>
        }
      >
        Você entrou como {sessao?.user.email}. Peça ao administrador da sua empresa para adicionar este e-mail à equipe.
      </EstadoVazio>
    </div>
  )
}
