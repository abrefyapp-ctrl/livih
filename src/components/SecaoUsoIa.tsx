import { useEffect, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import { buscarUsoIaDaEmpresa, mesAtual, nomeDoMes, type UsoIaMes } from '../services/usoIa'
import { Aviso } from './Aviso'
import { EstadoVazio } from './EstadoVazio'

const numero = new Intl.NumberFormat('pt-BR')
const minutos = (s: number | null) => {
  const m = Math.round(Number(s ?? 0) / 60)
  return m < 1 && Number(s ?? 0) > 0 ? 'menos de 1 min' : `${numero.format(m)} min`
}

/** Configurações → Uso da IA: quanto o agente atendeu e quantos áudios foram transcritos, por mês. */
export function SecaoUsoIa() {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [uso, setUso] = useState<{ orgId: string; meses: UsoIaMes[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!gerencia) return
    let ativo = true
    buscarUsoIaDaEmpresa(orgId)
      .then((meses) => ativo && (setUso({ orgId, meses }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar o uso da IA.'))
    return () => {
      ativo = false
    }
  }, [orgId, gerencia])

  if (!gerencia) {
    return <Aviso>Só o dono e os administradores da empresa veem o uso da IA.</Aviso>
  }

  const meses = uso?.orgId === orgId ? uso.meses : null
  const atual = meses?.find((m) => m.mes === mesAtual()) ?? null
  const anteriores = meses?.filter((m) => m.mes !== mesAtual()) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-h2 font-semibold">Uso da IA em {nomeDoMes(mesAtual())}</h2>
        <p className="mt-1 text-pequeno text-texto-2">
          Conta as conversas em que o agente respondeu e os áudios transcritos. Os números são atualizados a cada poucos minutos.
        </p>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!meses ? (
        !erro && <p className="text-pequeno text-texto-3">Carregando…</p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Indicador rotulo="Conversas atendidas pelo agente" valor={numero.format(atual?.conversas_com_agente ?? 0)} />
            <Indicador rotulo="Respostas do agente" valor={numero.format(atual?.respostas_agente ?? 0)} />
            <Indicador
              rotulo="Áudios transcritos"
              valor={numero.format(atual?.audios_transcritos ?? 0)}
              detalhe={atual?.audios_transcritos ? minutos(atual.segundos_audio) : undefined}
            />
          </dl>

          {anteriores.length > 0 ? (
            <section aria-labelledby="meses-anteriores">
              <h3 id="meses-anteriores" className="mb-2 font-semibold">Meses anteriores</h3>
              <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
                <table className="w-full text-pequeno">
                  <thead className="text-left text-legenda text-texto-3">
                    <tr className="border-b border-borda">
                      <th scope="col" className="px-4 py-2 font-medium">Mês</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Conversas com o agente</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Respostas</th>
                      <th scope="col" className="px-4 py-2 text-right font-medium">Áudios</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {anteriores.map((m) => (
                      <tr key={m.mes}>
                        <th scope="row" className="px-4 py-2 text-left font-medium capitalize">{nomeDoMes(m.mes!)}</th>
                        <td className="px-4 py-2 text-right tabular-nums">{numero.format(m.conversas_com_agente ?? 0)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{numero.format(m.respostas_agente ?? 0)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{numero.format(m.audios_transcritos ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            !atual && (
              <EstadoVazio icone="agente" titulo="Nenhum uso ainda">
                Quando o agente começar a responder ou um áudio for transcrito, o consumo aparece aqui.
              </EstadoVazio>
            )
          )}
        </>
      )}
    </div>
  )
}

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-borda bg-superficie p-4">
      <dt className="text-pequeno text-texto-2">{rotulo}</dt>
      <dd className="mt-1 text-h1 font-semibold tabular-nums">
        {valor}
        {detalhe && <span className="ml-2 text-pequeno font-normal text-texto-3">{detalhe}</span>}
      </dd>
    </div>
  )
}
