import { useState } from 'react'
import { definirJanelaDistribuicao } from '../services/equipes'
import { Aviso } from './Aviso'

const PERIODOS = [30, 60, 90, 180, 365]

/**
 * Como a Livih escolhe quem atende nos números da empresa que distribuem (migration 20261113120000,
 * docs/equipes-origem-prospeccao.md, entrega 2). Sem carteira: a escolha é refeita cada vez que o cliente volta.
 * Só dono e admin veem; o período do "quem mais atendeu" é o único ajuste daqui.
 */
export function DistribuicaoContatos({
  orgId,
  janela,
  falhou,
  aoMudar,
}: {
  orgId: string
  /** Nulo enquanto carrega. */
  janela: number | null
  /** Não deu para ler o período. */
  falhou: boolean
  aoMudar: () => void
}) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const opcoes = janela && !PERIODOS.includes(janela) ? [...PERIODOS, janela].sort((a, b) => a - b) : PERIODOS

  async function mudar(dias: number) {
    setSalvando(true)
    setErro(null)
    try {
      await definirJanelaDistribuicao(orgId, dias)
      aoMudar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section aria-labelledby="titulo-distribuicao" className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
      <div>
        <h3 id="titulo-distribuicao" className="font-semibold">
          Distribuição dos contatos
        </h3>
        <p className="text-pequeno text-texto-3">
          Nos números da empresa com a distribuição ligada (Configurações → WhatsApp → Configurar), a Livih escolhe quem
          atende quando o cliente escreve pela primeira vez, quando volta depois de 30 dias sem conversa ou quando quem o
          atendia está ausente. A ordem é esta:
        </p>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-pequeno text-texto-2">
        <li>quem mais atendeu esse cliente no período abaixo;</li>
        <li>
          a equipe da cidade do cliente (as cidades ficam em cada equipe, acima). Se a cidade ainda não é conhecida e o
          agente está atendendo, ele pergunta, e a Livih espera a resposta por até uns 15 minutos;
        </li>
        <li>a equipe escolhida no número;</li>
        <li>todas as pessoas marcadas com “Recebe contatos novos”, na vez de cada uma.</li>
      </ol>
      <p className="text-pequeno text-texto-3">
        Nas equipes, cada um recebe na sua vez. Quem está ausente, desativado ou sem “Recebe contatos novos” fica de fora,
        e o cliente vai para o próximo da lista, sem esperar.
      </p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {falhou && <Aviso tom="erro">Não foi possível carregar o período. Recarregue a tela.</Aviso>}
      <label className="flex flex-wrap items-center gap-2 text-pequeno">
        <span className="text-texto-2">Contar quem mais atendeu nos últimos</span>
        <select
          value={janela ?? ''}
          disabled={!janela || salvando}
          onChange={(e) => void mudar(Number(e.target.value))}
          className="h-9 rounded-md border border-borda bg-superficie px-2 focus:border-primaria focus:outline-none disabled:opacity-60"
        >
          {!janela && <option value="">…</option>}
          {opcoes.map((d) => (
            <option key={d} value={d}>
              {d} dias
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}
