import { useEffect, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import { moeda } from '../services/formato'
import { buscarSituacaoTroca, trocarPlano, type PlanoOpcao, type ResultadoTroca, type SituacaoTroca } from '../services/plano'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { DialogoConfirmacao } from './DialogoConfirmacao'

const numero = new Intl.NumberFormat('pt-BR')
const reais = (v: number | null | undefined) => moeda(v == null ? null : Number(v), true)
const dia = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
const numeros = (n: number) => (n === 1 ? '1 número de WhatsApp' : `${n} números de WhatsApp`)

/**
 * Plano e consumo: o dono troca de plano (decisões de 02/11). Subir vale na hora, com a diferença proporcional dos dias
 * que faltam na próxima fatura; descer vale no dia 1 seguinte. Antes de confirmar, a prévia do banco diz o que acontece.
 */
export function TrocaDePlano({ orgId, aoTrocar }: { orgId: string; aoTrocar: () => void }) {
  const suporte = !!useSessao().orgAtiva?.suporte
  const [situacao, setSituacao] = useState<{ orgId: string; s: SituacaoTroca } | null>(null)
  const [versao, setVersao] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [previa, setPrevia] = useState<{ plano: PlanoOpcao; r: ResultadoTroca } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let ativo = true
    buscarSituacaoTroca(orgId)
      .then((s) => ativo && (setSituacao({ orgId, s }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar os planos. Confira a internet e tente de novo.'))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  const s = situacao?.orgId === orgId ? situacao.s : null
  if (!s) return erro ? <Aviso tom="erro">{erro}</Aviso> : null

  const proximo = s.planos.find((p) => p.codigo === s.plano_proximo)
  const atual = s.planos.find((p) => p.codigo === s.plano)
  // Dono de verdade: a equipe da plataforma, no modo suporte, troca pela tela Empresas (imediata e sem ajuste).
  const dono = s.eh_dono

  async function verPrevia(plano: PlanoOpcao) {
    setOcupado(true)
    setErro(null)
    setSucesso(null)
    try {
      setPrevia({ plano, r: await trocarPlano(orgId, plano.codigo, false) })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar(plano: string, mensagem: (r: ResultadoTroca) => string) {
    setOcupado(true)
    setErro(null)
    try {
      const r = await trocarPlano(orgId, plano, true)
      setSucesso(mensagem(r))
      setPrevia(null)
      setVersao((v) => v + 1)
      aoTrocar()
    } catch (e) {
      setErro((e as Error).message)
      setPrevia(null)
    } finally {
      setOcupado(false)
    }
  }

  const mensagemFeito = (r: ResultadoTroca) =>
    r.tipo === 'subir'
      ? `Pronto: a empresa já está no plano ${r.plano}.`
      : r.tipo === 'descer'
        ? `Troca agendada: o plano ${r.plano} começa em ${dia(r.vale_em!)}.`
        : `Troca cancelada: a empresa continua no plano ${r.plano}.`

  return (
    <div className="space-y-3 border-t border-borda pt-4">
      <div>
        <p className="font-medium">Trocar de plano</p>
        <p className="text-legenda text-texto-3">
          Ao subir, o plano novo vale na hora: a franquia a mais deste mês e a diferença na próxima fatura são proporcionais aos
          dias que faltam. Ao descer, o plano novo começa no dia 1º do mês seguinte, sem devolução deste mês.
        </p>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {sucesso && <Aviso>{sucesso}</Aviso>}
      {!s.pode_trocar && s.motivo && <Aviso>{s.motivo}</Aviso>}
      {s.pode_trocar && !dono && (
        <p className="text-pequeno text-texto-3">
          {suporte
            ? 'No modo suporte, troque o plano pela tela Empresas (botão Plano).'
            : 'Só o dono da empresa troca o plano. Se precisar trocar, fale com o dono.'}
        </p>
      )}

      {proximo && (
        <Aviso tom="atencao">
          <span className="block">
            O plano {proximo.nome} começa em {dia(s.vale_em)}. Até lá, continua o plano {atual?.nome ?? 'atual'}, mas número novo de
            WhatsApp já segue o limite do {proximo.nome}.
          </span>
          {dono && s.pode_trocar && atual && (
            <Botao
              tamanho="sm"
              variante="secundario"
              className="mt-2"
              carregando={ocupado}
              onClick={() => void confirmar(atual.codigo, mensagemFeito)}
            >
              Manter o plano {atual.nome}
            </Botao>
          )}
        </Aviso>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {s.planos.map((p) => {
          const ehAtual = p.codigo === s.plano
          const sobe = Number(p.preco_mensal) > Number(atual?.preco_mensal ?? 0)
          return (
            <li
              key={p.codigo}
              className={`space-y-2 rounded-md border p-3 ${ehAtual ? 'border-primaria bg-primaria-suave' : 'border-borda'}`}
            >
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{p.nome}</span>
                <span className="tabular-nums">{reais(p.preco_mensal)}/mês</span>
              </p>
              <p className="text-legenda text-texto-2">
                {numero.format(p.atendimentos)} atendimentos do agente · {numeros(p.numeros_whatsapp)}
              </p>
              {ehAtual ? (
                <p className="text-legenda font-medium text-primaria">Plano atual</p>
              ) : p.codigo === s.plano_proximo ? (
                <p className="text-legenda font-medium text-atencao">Começa em {dia(s.vale_em)}</p>
              ) : (
                dono &&
                s.pode_trocar && (
                  <Botao tamanho="sm" variante="secundario" disabled={ocupado} onClick={() => void verPrevia(p)}>
                    {sobe ? `Subir para o ${p.nome}` : `Descer para o ${p.nome}`}
                  </Botao>
                )
              )}
            </li>
          )
        })}
      </ul>

      <DialogoConfirmacao
        aberto={!!previa}
        titulo={previa?.r.tipo === 'subir' ? `Subir para o plano ${previa.plano.nome}?` : `Descer para o plano ${previa?.plano.nome ?? ''}?`}
        rotuloConfirmar={previa?.r.tipo === 'subir' ? 'Subir agora' : 'Agendar a troca'}
        carregando={ocupado}
        aoConfirmar={() => previa && void confirmar(previa.plano.codigo, mensagemFeito)}
        aoCancelar={() => setPrevia(null)}
      >
        {previa?.r.tipo === 'subir' ? (
          <>
            O plano {previa.plano.nome} vale agora, com {numeros(previa.plano.numeros_whatsapp)}.{' '}
            {previa.r.limite_mes != null &&
              `Neste mês, o limite de atendimentos do agente passa a ${numero.format(previa.r.limite_mes)}: a franquia a mais é proporcional aos dias que faltam. `}
            A partir do mês que vem, são {numero.format(previa.plano.atendimentos)} atendimentos por mês, e a mensalidade do plano passa a{' '}
            {reais(previa.plano.preco_mensal)}.{' '}
            {Number(previa.r.valor) > 0
              ? `Na próxima fatura entra também a diferença deste mês: ${reais(previa.r.valor)} (${previa.r.dias} dos ${previa.r.dias_mes} dias do mês, contando hoje).`
              : previa.r.teste_gratis
                ? 'Como a empresa está no teste grátis, não há diferença a pagar.'
                : 'A fatura deste mês ainda vai sair, já com o plano novo.'}
          </>
        ) : previa ? (
          <>
            O plano {previa.plano.nome} começa em {dia(previa.r.vale_em!)}, com {numero.format(previa.plano.atendimentos)} atendimentos
            do agente por mês e {numeros(previa.plano.numeros_whatsapp)}, por {reais(previa.plano.preco_mensal)}/mês. Até lá, continua o
            plano {atual?.nome ?? 'atual'}, sem devolução da diferença deste mês. A partir de agora, número novo de WhatsApp já
            segue o limite do {previa.plano.nome}.
          </>
        ) : null}
      </DialogoConfirmacao>
    </div>
  )
}
