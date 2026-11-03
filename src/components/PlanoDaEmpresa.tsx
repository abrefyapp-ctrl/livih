import { useEffect, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import { moeda } from '../services/formato'
import { buscarConsumoPlano, comprarPacote, definirEscolhaFranquia, type ConsumoPlano, type EscolhaFranquia } from '../services/plano'
import { nomeDoMes } from '../services/usoIa'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { TrocaDePlano } from './TrocaDePlano'

const numero = new Intl.NumberFormat('pt-BR')
const reais = (v: number | null) => moeda(v == null ? null : Number(v), true)

const ESCOLHAS: { valor: EscolhaFranquia; rotulo: string; detalhe: (c: ConsumoPlano) => string }[] = [
  { valor: 'parar', rotulo: 'Parar o agente', detalhe: () => 'As conversas novas vão para a equipe. Nada é cobrado a mais.' },
  {
    valor: 'continuar',
    rotulo: 'Continuar com o agente',
    detalhe: (c) => `Cada atendimento a mais custa ${reais(c.excedente_preco)} e entra na próxima mensalidade.`,
  },
]

/** Configurações → Plano e consumo: o plano, os atendimentos do agente no mês e o que fazer quando acabarem. */
export function PlanoDaEmpresa() {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const dono = orgAtiva?.papel === 'dono'
  const [consumo, setConsumo] = useState<{ orgId: string; c: ConsumoPlano | null } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const [confirmarPacote, setConfirmarPacote] = useState(false)
  const [sucesso, setSucesso] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    buscarConsumoPlano(orgId)
      .then((c) => ativo && (setConsumo({ orgId, c }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar o plano. Confira a internet e tente de novo.'))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  const c = consumo?.orgId === orgId ? consumo.c : null
  if (!consumo) return erro ? <Aviso tom="erro">{erro}</Aviso> : <p className="text-pequeno text-texto-3">Carregando o plano…</p>
  if (!c) return null

  if (c.limite == null) {
    return (
      <Aviso>
        A sua empresa ainda não tem um plano definido, e o agente atende sem limite de atendimentos. Para escolher o plano, fale
        com a equipe da Livih.
      </Aviso>
    )
  }

  async function escolher(escolha: EscolhaFranquia) {
    setSalvando(true)
    setErro(null)
    setSucesso(null)
    try {
      await definirEscolhaFranquia(orgId, escolha)
      setVersao((v) => v + 1)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function comprar() {
    setSalvando(true)
    setErro(null)
    try {
      const limite = await comprarPacote(orgId, c!.limite!)
      setSucesso(`Pacote comprado. O limite deste mês passou para ${numero.format(limite)} atendimentos.`)
      setConfirmarPacote(false)
      setVersao((v) => v + 1)
    } catch (e) {
      setErro((e as Error).message)
      setConfirmarPacote(false)
      setVersao((v) => v + 1)
    } finally {
      setSalvando(false)
    }
  }

  const usados = c.usados ?? 0
  const limite = c.limite
  const pct = limite > 0 ? Math.min(100, Math.round((usados * 100) / limite)) : 100
  const acabou = usados >= limite
  const corBarra = acabou ? 'bg-erro' : pct >= 80 ? 'bg-atencao' : 'bg-primaria'
  const mes = nomeDoMes(c.mes)

  return (
    <section aria-labelledby="titulo-plano" className="space-y-4 rounded-lg border border-borda bg-superficie p-4">
      <div>
        <h2 id="titulo-plano" className="text-h2 font-semibold">
          Plano {c.plano_nome}
        </h2>
        <p className="text-pequeno text-texto-2">
          {reais(c.preco_mensal)} por mês
          {c.numeros_whatsapp != null &&
            ` · ${c.numeros_whatsapp === 1 ? '1 número de WhatsApp' : `${c.numeros_whatsapp} números de WhatsApp`}`}
          {' · '}
          {numero.format(c.franquia ?? 0)} atendimentos do agente por mês
        </p>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {sucesso && <Aviso>{sucesso}</Aviso>}

      <div className="space-y-2">
        <p className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">Atendimentos do agente em {mes}</span>
          <span className="tabular-nums">
            <strong className="text-h2">{numero.format(usados)}</strong>
            <span className="text-texto-2"> de {numero.format(limite)}</span>
          </span>
        </p>
        <div
          role="progressbar"
          aria-label="Atendimentos usados no mês"
          aria-valuemin={0}
          aria-valuemax={limite}
          aria-valuenow={Math.min(usados, limite)}
          className="h-2.5 overflow-hidden rounded-full bg-slate-100"
        >
          <div className={`h-full rounded-full ${corBarra}`} style={{ width: `${pct}%` }} />
        </div>
        {!!c.creditos && (
          <p className="text-legenda text-texto-3">
            {numero.format(c.franquia ?? 0)} do plano
            {c.creditos + c.reducao_troca > 0 && ` + ${numero.format(c.creditos + c.reducao_troca)} de pacotes e cortesias`}
            {c.reducao_troca > 0 && ` − ${numero.format(c.reducao_troca)} pela troca de plano no meio do mês (a franquia a mais é proporcional aos dias)`}
            {' '}deste mês.
          </p>
        )}
        <p className="text-legenda text-texto-3">
          Um atendimento começa quando o agente responde uma conversa e dura 24 horas: tudo o que ele mandar nesse tempo,
          naquela conversa, conta como um só. Se o cliente voltar a falar depois disso, conta outro.
        </p>
      </div>

      {acabou && (
        <Aviso tom={c.escolha === 'parar' ? 'atencao' : 'info'}>
          {c.escolha === 'parar'
            ? `Os atendimentos deste mês acabaram. As conversas novas vão para a equipe, e o agente só termina os atendimentos que já começou. Ele volta a atender conversas novas no dia 1º ou quando ${dono ? 'você comprar' : 'o dono comprar'} um pacote.`
            : `Os atendimentos deste mês acabaram. O agente continua, e cada atendimento a mais custa ${reais(c.excedente_preco)} na próxima mensalidade.`}
        </Aviso>
      )}

      {(!!c.excedentes || !!c.pacotes_mes) && (
        <ul className="space-y-1 text-pequeno text-texto-2">
          {!!c.excedentes && (
            <li>
              {numero.format(c.excedentes)} {c.excedentes === 1 ? 'atendimento a mais' : 'atendimentos a mais'}:{' '}
              {reais(c.excedentes * Number(c.excedente_preco))} na próxima mensalidade.
            </li>
          )}
          {!!c.pacotes_mes && (
            <li>
              {c.pacotes_mes === 1 ? '1 pacote comprado' : `${c.pacotes_mes} pacotes comprados`} este mês:{' '}
              {reais(c.valor_pacotes_mes)} na próxima mensalidade.
            </li>
          )}
        </ul>
      )}

      <fieldset className="space-y-2" disabled={!dono || salvando}>
        <legend className="mb-1 font-medium">Quando os atendimentos do mês acabarem</legend>
        {ESCOLHAS.map((o) => (
          <label key={o.valor} className="flex cursor-pointer items-start gap-3 rounded-md border border-borda p-3 has-[:checked]:border-primaria has-[:checked]:bg-primaria-suave">
            <input
              type="radio"
              name="escolha-franquia"
              value={o.valor}
              checked={c.escolha === o.valor}
              onChange={() => void escolher(o.valor)}
              className="mt-1 accent-primaria"
            />
            <span>
              <span className="block font-medium">{o.rotulo}</span>
              <span className="block text-pequeno text-texto-2">{o.detalhe(c)}</span>
            </span>
          </label>
        ))}
        <p className="text-legenda text-texto-3">
          {dono
            ? 'Aos 80 % e quando os atendimentos acabarem, o dono e os administradores recebem um aviso: no celular, se ativaram as notificações (Configurações → Notificações), e no WhatsApp cadastrado em Seus dados (Configurações → Equipe).'
            : 'Só o dono da empresa muda esta escolha e compra pacotes.'}
        </p>
      </fieldset>

      {dono && (
        <div className="flex flex-wrap items-center gap-3 border-t border-borda pt-4">
          <Botao variante="secundario" icone="mais" onClick={() => setConfirmarPacote(true)} disabled={salvando}>
            Comprar {numero.format(c.pacote_atendimentos)} atendimentos por {reais(c.pacote_preco)}
          </Botao>
          <p className="text-legenda text-texto-3">
            Valem até o fim de {mes}. Os {reais(c.pacote_preco)} entram na próxima mensalidade.
          </p>
        </div>
      )}

      <TrocaDePlano orgId={orgId} aoTrocar={() => setVersao((v) => v + 1)} />

      <DialogoConfirmacao
        aberto={confirmarPacote}
        titulo={`Comprar ${numero.format(c.pacote_atendimentos)} atendimentos?`}
        rotuloConfirmar={`Comprar por ${reais(c.pacote_preco)}`}
        carregando={salvando}
        aoConfirmar={() => void comprar()}
        aoCancelar={() => setConfirmarPacote(false)}
      >
        O limite de {mes} passa de {numero.format(limite)} para {numero.format(limite + c.pacote_atendimentos)} atendimentos. Os{' '}
        {reais(c.pacote_preco)} entram na próxima mensalidade. Os atendimentos que sobrarem não passam para o mês seguinte.
        {acabou && c.escolha === 'parar' && ' As conversas que já passaram para a equipe continuam com ela; o agente volta a atender as conversas novas.'}
      </DialogoConfirmacao>
    </section>
  )
}
