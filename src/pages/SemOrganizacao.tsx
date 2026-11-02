import { useSessao } from '../hooks/useSessao'
import type { Organizacao } from '../services/atendimento'
import { Botao } from '../components/Botao'
import { DadosCobranca } from '../components/DadosCobranca'
import { FaturasDaEmpresa } from '../components/FaturasDaEmpresa'
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
  // Suspensa por fatura em atraso: dono e administradores pagam e corrigem os dados daqui (o banco libera as faturas e
  // os dados de cobrança mesmo com a empresa suspensa); o pagamento confirmado reativa sozinho.
  const emAtraso = suspensas.find((o) => o.motivo_suspensao === 'inadimplencia' && (o.papel === 'dono' || o.papel === 'admin'))
  if (emAtraso) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
          <Logo />
          <div className="space-y-2">
            <h1 className="text-h1 font-semibold">Acesso suspenso por fatura em atraso</h1>
            <p className="text-pequeno text-texto-2">
              Pague a fatura vencida da empresa {emAtraso.nome} abaixo (ou as faturas, se houver mais de uma). O acesso volta sozinho
              quando o pagamento é confirmado: Pix e cartão na hora, boleto em até 3 dias úteis. Depois, atualize esta página para
              entrar. Enquanto isso, o agente não responde, a equipe não consegue entrar e as mensagens que chegarem não entram na
              Livih. Nada foi apagado.
            </p>
          </div>
          <FaturasDaEmpresa orgId={emAtraso.id} />
          <section className="rounded-lg border border-borda bg-superficie p-4">
            <DadosCobranca orgId={emAtraso.id} podeEditar={emAtraso.papel === 'dono'} />
          </section>
          <p className="text-pequeno text-texto-3">Dúvida sobre a fatura? Fale com a equipe da Livih.</p>
          {botaoSair}
        </div>
      </div>
    )
  }
  if (suspensas.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <Logo />
        <EstadoVazio icone="empresa" titulo={`O acesso da ${suspensas[0].nome} está suspenso`} acao={botaoSair}>
          As conversas, os contatos e as configurações continuam guardados. Para voltar a usar a Livih, fale com o
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
