import { useSessao } from '../hooks/useSessao'
import type { Organizacao } from '../services/atendimento'
import { Botao } from '../components/Botao'
import { EstadoVazio } from '../components/EstadoVazio'
import { Logo } from '../components/Logo'

/**
 * Logado, mas sem organização ativa: ainda não foi convidado, foi desativado ou a empresa está suspensa
 * (pela equipe da Livih — nada foi apagado).
 */
export function SemOrganizacao({ suspensas = [] }: { suspensas?: Organizacao[] }) {
  const { sessao, sair } = useSessao()
  const botaoSair = (
    <Botao variante="secundario" icone="sair" onClick={() => void sair()}>
      Sair
    </Botao>
  )
  if (suspensas.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <Logo />
        <EstadoVazio icone="empresa" titulo={`O acesso da ${suspensas[0].nome} está suspenso`} acao={botaoSair}>
          As conversas, os contatos e as configurações continuam guardados. Para voltar a usar o Livih, fale com o
          responsável pela sua empresa ou com a equipe da Livih.
        </EstadoVazio>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <Logo />
      <EstadoVazio
        icone="empresa"
        titulo="Sua conta ainda não está em nenhuma empresa"
        acao={botaoSair}
      >
        Você entrou como {sessao?.user.email}. Peça ao administrador da sua empresa para adicionar este e-mail à equipe.
      </EstadoVazio>
    </div>
  )
}
