import { useEffect, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import { moeda } from '../services/formato'
import {
  buscarSituacaoTroca,
  contratarModulo,
  escolherCiclo,
  trocarPlano,
  type ModuloOpcao,
  type PlanoOpcao,
  type ResultadoCiclo,
  type ResultadoModulo,
  type ResultadoTroca,
  type SituacaoTroca,
} from '../services/plano'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { DialogoConfirmacao } from './DialogoConfirmacao'

const numero = new Intl.NumberFormat('pt-BR')
const reais = (v: number | null | undefined) => moeda(v == null ? null : Number(v), true)
const dia = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
const mesAno = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
/** Último mês do ano que renova em `renova` (renova em 01/11/2027 → 10/2027). */
const ultimoMes = (renova: string) => mesAno(new Date(Date.UTC(+renova.slice(0, 4), +renova.slice(5, 7) - 2, 1)).toISOString().slice(0, 10))
const numeros = (n: number) => (n === 1 ? '1 número de WhatsApp' : `${n} números de WhatsApp`)
const formaDePagamento = (parcelas: number, total?: number) =>
  parcelas > 1
    ? `no cartão em ${parcelas}x sem juros${total ? ` de ${reais(Math.round((total * 100) / parcelas) / 100)}` : ''}`
    : 'à vista (Pix, boleto ou cartão)'

type Previa =
  | { tipo: 'plano'; plano: PlanoOpcao; r: ResultadoTroca }
  | { tipo: 'ciclo'; r: ResultadoCiclo; parcelas: number }
  | { tipo: 'modulo'; modulo: ModuloOpcao; ligar: boolean; r: ResultadoModulo }

/**
 * Plano e consumo: o dono troca o plano, escolhe mensal ou anual e contrata os módulos (decisões de 02/11). Subir e
 * ligar valem na hora; descer e desligar, no dia 1 seguinte (no anual, na renovação). Antes de confirmar, a prévia do
 * banco diz o que acontece e quanto custa.
 */
export function TrocaDePlano({ orgId, aoTrocar }: { orgId: string; aoTrocar: () => void }) {
  const { orgAtiva, recarregarModulos } = useSessao()
  const suporte = !!orgAtiva?.suporte
  const [situacao, setSituacao] = useState<{ orgId: string; s: SituacaoTroca } | null>(null)
  const [versao, setVersao] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
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
  const anual = s.ciclo === 'anual'
  // Dono de verdade: a equipe da plataforma, no modo suporte, troca pela tela Empresas (imediata e sem ajuste).
  const dono = s.eh_dono
  const pode = dono && s.pode_trocar

  async function verPrevia(carregar: () => Promise<Previa>) {
    setOcupado(true)
    setErro(null)
    setSucesso(null)
    try {
      setPrevia(await carregar())
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function executar(acao: () => Promise<string>, modulos = false) {
    setOcupado(true)
    setErro(null)
    setSucesso(null)
    try {
      setSucesso(await acao())
      setPrevia(null)
      setVersao((v) => v + 1)
      aoTrocar()
      if (modulos) recarregarModulos()
    } catch (e) {
      setErro((e as Error).message)
      setPrevia(null)
    } finally {
      setOcupado(false)
    }
  }

  const feitoPlano = (r: ResultadoTroca) =>
    r.tipo === 'subir'
      ? `Pronto: a empresa já está no plano ${r.plano}.${r.anual && Number(r.valor) > 0 ? ' A cobrança da diferença aparece em Faturas, nesta página, em alguns segundos (atualize a página).' : ''}`
      : r.tipo === 'descer'
        ? `Troca agendada: o plano ${r.plano} começa em ${dia(r.vale_em!)}.`
        : `Troca cancelada: a empresa continua no plano ${r.plano}.`
  const feitoCiclo = (r: ResultadoCiclo) =>
    r.tipo === 'anual'
      ? `Pronto: o plano anual começa em ${dia(r.vale_em!)}, e a fatura do ano sai nesse dia.`
      : r.tipo === 'parcelas'
        ? 'Forma de pagamento salva: vale para a próxima fatura anual.'
        : r.tipo === 'mensal'
          ? r.agora
            ? 'Pronto: a empresa voltou ao plano mensal.'
            : `Troca agendada: a empresa volta ao plano mensal em ${dia(r.vale_em!)}.`
          : r.tipo === 'cancelar'
            ? `Pronto: a empresa continua no plano ${r.ciclo}.`
            : 'A forma de pagamento continua a mesma.'
  const feitoModulo = (r: ResultadoModulo) =>
    r.tipo === 'ligar'
      ? `Pronto: o módulo ${r.modulo} está ligado e já aparece no menu.`
      : r.tipo === 'manter'
        ? `Pronto: o desligamento foi cancelado e o módulo ${r.modulo} continua ligado.`
        : r.agora
          ? `O módulo ${r.modulo} foi desligado.`
          : `Desligamento agendado: o módulo ${r.modulo} desliga em ${dia(r.vale_em!)}.`

  function confirmarPrevia() {
    if (!previa) return
    if (previa.tipo === 'plano') void executar(async () => feitoPlano(await trocarPlano(orgId, previa.plano.codigo, true)))
    else if (previa.tipo === 'ciclo')
      void executar(async () => feitoCiclo(await escolherCiclo(orgId, previa.r.ciclo, previa.parcelas, true)))
    else void executar(async () => feitoModulo(await contratarModulo(orgId, previa.modulo.codigo, previa.ligar, true)), true)
  }

  // Preço do plano no ciclo que vale (ou vai valer) para a empresa.
  const cicloDosPrecos = s.ciclo_proximo ?? s.ciclo
  const preco = (mensal: number, anualValor: number) =>
    cicloDosPrecos === 'anual' ? `${reais(anualValor)}/ano` : `${reais(mensal)}/mês`

  return (
    <div className="space-y-4 border-t border-borda pt-4">
      <div>
        <p className="font-medium">Plano, forma de pagamento e módulos</p>
        <p className="text-legenda text-texto-3">
          {anual
            ? 'Subir de plano vale na hora. A franquia a mais deste mês é proporcional aos dias que faltam, e sai uma cobrança da diferença do anual até a renovação. Descer de plano e desligar módulos valem só na renovação, sem devolução.'
            : 'Subir de plano vale na hora. A franquia a mais deste mês e a diferença na próxima fatura são proporcionais aos dias que faltam. Descer de plano e desligar módulos valem no dia 1 do mês seguinte, sem devolução deste mês.'}
        </p>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {sucesso && <Aviso>{sucesso}</Aviso>}
      {!s.pode_trocar && s.motivo && <Aviso>{s.motivo}</Aviso>}
      {s.pode_trocar && !dono && (
        <p className="text-pequeno text-texto-3">
          {suporte
            ? 'No modo suporte, troque o plano e os módulos pela tela Empresas (botões Plano e Módulos).'
            : 'Só o dono da empresa troca o plano e contrata módulos. Se precisar trocar, fale com o dono.'}
        </p>
      )}

      {/* Mensal ou anual */}
      <div className="space-y-2">
        <p className="text-pequeno font-medium">Mensal ou anual</p>
        {anual && s.anual_inicio && s.renova_em && (
          <p className="text-pequeno text-texto-2">
            Plano anual de {mesAno(s.anual_inicio)} a {ultimoMes(s.renova_em)},{' '}
            {formaDePagamento(s.anual_parcelas)}. Renova sozinho em {dia(s.renova_em)}, pelo preço de tabela, com aviso 15 dias antes.
          </p>
        )}
        {s.ciclo_proximo && s.ciclo_proximo_em && (
          <Aviso tom="atencao">
            <span className="block">
              {s.ciclo_proximo === 'anual'
                ? `O plano anual começa em ${dia(s.ciclo_proximo_em)}, ${formaDePagamento(s.anual_parcelas)}. A fatura do ano sai nesse dia.`
                : `A empresa volta ao plano mensal em ${dia(s.ciclo_proximo_em)}, quando o anual termina.`}
            </span>
            {pode && (
              <Botao
                tamanho="sm"
                variante="secundario"
                className="mt-2"
                carregando={ocupado}
                onClick={() => void executar(async () => feitoCiclo(await escolherCiclo(orgId, s.ciclo, s.anual_parcelas, true)))}
              >
                {s.ciclo === 'anual' ? 'Continuar no anual' : 'Continuar no mensal'}
              </Botao>
            )}
          </Aviso>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {(['mensal', 'anual'] as const).map((ciclo) => {
            const ehAtual = s.ciclo === ciclo
            return (
              <li
                key={ciclo}
                className={`space-y-2 rounded-md border p-3 ${ehAtual ? 'border-primaria bg-primaria-suave' : 'border-borda'}`}
              >
                <p className="font-semibold">{ciclo === 'mensal' ? 'Mensal' : 'Anual: pague 10 meses e use 12'}</p>
                <p className="text-legenda text-texto-2">
                  {ciclo === 'mensal'
                    ? 'Uma fatura por mês, com vencimento no dia 10.'
                    : 'Uma fatura a cada 12 meses, à vista ou no cartão em até 12x sem juros. Atendimentos a mais e pacotes continuam na fatura de cada mês.'}
                  {atual && ` Plano ${atual.nome}: ${ciclo === 'mensal' ? `${reais(atual.preco_mensal)}/mês` : `${reais(atual.preco_anual)}/ano`}.`}
                </p>
                {ehAtual ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-legenda font-medium text-primaria">Atual</p>
                    {ciclo === 'anual' && pode && (
                      <Botao
                        tamanho="sm"
                        variante="secundario"
                        disabled={ocupado}
                        onClick={() =>
                          void verPrevia(async () => ({
                            tipo: 'ciclo',
                            parcelas: s.anual_parcelas,
                            r: await escolherCiclo(orgId, 'anual', s.anual_parcelas, false),
                          }))
                        }
                      >
                        Mudar a forma de pagamento
                      </Botao>
                    )}
                  </div>
                ) : (
                  pode &&
                  s.ciclo_proximo !== ciclo && (
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      disabled={ocupado}
                      onClick={() =>
                        void verPrevia(async () => ({
                          tipo: 'ciclo',
                          parcelas: s.anual_parcelas,
                          r: await escolherCiclo(orgId, ciclo, s.anual_parcelas, false),
                        }))
                      }
                    >
                      {ciclo === 'anual' ? 'Passar para o anual' : 'Voltar ao mensal'}
                    </Botao>
                  )
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* Planos */}
      <div className="space-y-2">
        <p className="text-pequeno font-medium">Planos</p>
        {proximo && (
          <Aviso tom="atencao">
            <span className="block">
              O plano {proximo.nome} começa em {dia(s.vale_em)}. Até lá, continua o plano {atual?.nome ?? 'atual'}, mas, para conectar
              um número novo de WhatsApp, já vale o limite do {proximo.nome}.
            </span>
            {pode && atual && (
              <Botao
                tamanho="sm"
                variante="secundario"
                className="mt-2"
                carregando={ocupado}
                onClick={() => void executar(async () => feitoPlano(await trocarPlano(orgId, atual.codigo, true)))}
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
                  <span className="tabular-nums">{preco(p.preco_mensal, p.preco_anual)}</span>
                </p>
                <p className="text-legenda text-texto-2">
                  {numero.format(p.atendimentos)} atendimentos do agente por mês · {numeros(p.numeros_whatsapp)}
                  {!p.permite_modulos && ' · sem ERP nem Ordens de serviço'}
                </p>
                {ehAtual ? (
                  <p className="text-legenda font-medium text-primaria">Plano atual</p>
                ) : p.codigo === s.plano_proximo ? (
                  <p className="text-legenda font-medium text-atencao">Começa em {dia(s.vale_em)}</p>
                ) : (
                  pode && (
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      disabled={ocupado}
                      onClick={() =>
                        void verPrevia(async () => ({ tipo: 'plano', plano: p, r: await trocarPlano(orgId, p.codigo, false) }))
                      }
                    >
                      {sobe ? `Subir para o ${p.nome}` : `Descer para o ${p.nome}`}
                    </Botao>
                  )
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* Módulos */}
      {s.modulos.length > 0 && (
        <div className="space-y-2">
          <div>
            <p className="text-pequeno font-medium">Módulos</p>
            <p className="text-legenda text-texto-3">
              A nota fiscal vem com o ERP (NF-e) e com as Ordens de serviço (NFS-e). Os dois juntos saem por{' '}
              {cicloDosPrecos === 'anual' ? `${reais(s.juntos.anual)}/ano` : `${reais(s.juntos.mensal)}/mês`}.
              {atual && !atual.permite_modulos && ` O plano ${atual.nome} não tem módulos: para contratar, suba para o Start ou um plano acima.`}
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {s.modulos.map((m) => (
              <li
                key={m.codigo}
                className={`space-y-2 rounded-md border p-3 ${m.ativo ? 'border-primaria bg-primaria-suave' : 'border-borda'}`}
              >
                <p className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{m.nome}</span>
                  <span className="tabular-nums">{preco(m.preco_mensal, m.preco_anual)}</span>
                </p>
                <p className="text-legenda text-texto-2">{m.descricao}</p>
                {m.ativo && m.desliga_em ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-legenda font-medium text-atencao">Desliga em {dia(m.desliga_em)}</p>
                    {pode && (
                      <Botao
                        tamanho="sm"
                        variante="secundario"
                        carregando={ocupado}
                        onClick={() => void executar(async () => feitoModulo(await contratarModulo(orgId, m.codigo, true, true)), true)}
                      >
                        Manter o módulo
                      </Botao>
                    )}
                  </div>
                ) : m.ativo ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-legenda font-medium text-primaria">Contratado</p>
                    {pode && (
                      <Botao
                        tamanho="sm"
                        variante="secundario"
                        disabled={ocupado}
                        onClick={() =>
                          void verPrevia(async () => ({
                            tipo: 'modulo',
                            modulo: m,
                            ligar: false,
                            r: await contratarModulo(orgId, m.codigo, false, false),
                          }))
                        }
                      >
                        Desligar
                      </Botao>
                    )}
                  </div>
                ) : (
                  pode &&
                  atual?.permite_modulos && (
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      disabled={ocupado}
                      onClick={() =>
                        void verPrevia(async () => ({
                          tipo: 'modulo',
                          modulo: m,
                          ligar: true,
                          r: await contratarModulo(orgId, m.codigo, true, false),
                        }))
                      }
                    >
                      Contratar
                    </Botao>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <DialogoConfirmacao
        aberto={!!previa}
        titulo={tituloDaPrevia(previa)}
        rotuloConfirmar={rotuloDaPrevia(previa)}
        carregando={ocupado}
        aoConfirmar={confirmarPrevia}
        aoCancelar={() => setPrevia(null)}
      >
        {previa?.tipo === 'plano' && <TextoPlano previa={previa} atual={atual} />}
        {previa?.tipo === 'ciclo' && (
          <TextoCiclo previa={previa} renovaEm={s.renova_em} aoMudarParcelas={(parcelas) => setPrevia({ ...previa, parcelas })} />
        )}
        {previa?.tipo === 'modulo' && <TextoModulo previa={previa} />}
      </DialogoConfirmacao>
    </div>
  )
}

function tituloDaPrevia(p: Previa | null) {
  if (!p) return ''
  if (p.tipo === 'plano') return p.r.tipo === 'subir' ? `Subir para o plano ${p.plano.nome}?` : `Descer para o plano ${p.plano.nome}?`
  if (p.tipo === 'ciclo')
    return p.r.ciclo === 'mensal' ? 'Voltar ao plano mensal?' : p.r.tipo === 'anual' ? 'Passar para o plano anual?' : 'Mudar a forma de pagamento?'
  return p.ligar ? `Contratar o módulo ${p.modulo.nome}?` : `Desligar o módulo ${p.modulo.nome}?`
}

function rotuloDaPrevia(p: Previa | null) {
  if (!p) return ''
  if (p.tipo === 'plano') return p.r.tipo === 'subir' ? 'Subir agora' : 'Agendar a troca'
  if (p.tipo === 'ciclo') return p.r.ciclo === 'mensal' ? 'Voltar ao mensal' : p.r.tipo === 'anual' ? 'Passar para o anual' : 'Salvar'
  return p.ligar ? 'Contratar agora' : p.r.agora ? 'Desligar agora' : 'Agendar o desligamento'
}

function TextoPlano({ previa, atual }: { previa: Extract<Previa, { tipo: 'plano' }>; atual?: PlanoOpcao }) {
  const { plano, r } = previa
  if (r.tipo !== 'subir') {
    return (
      <>
        O plano {plano.nome} começa em {dia(r.vale_em!)}
        {r.anual ? ', na renovação do anual' : ''}, com {numero.format(plano.atendimentos)} atendimentos do agente por mês e{' '}
        {numeros(plano.numeros_whatsapp)}. Até lá, continua o plano {atual?.nome ?? 'atual'}, sem devolução da diferença
        {r.anual ? ' do ano' : ' deste mês'}. A partir de agora, para conectar um número novo de WhatsApp, já vale o limite do {plano.nome}.
      </>
    )
  }
  const valor = Number(r.valor)
  return (
    <>
      O plano {plano.nome} vale agora, com {numeros(plano.numeros_whatsapp)}.{' '}
      {r.limite_mes != null &&
        `Neste mês, o limite de atendimentos do agente passa a ${numero.format(r.limite_mes)}: a franquia a mais é proporcional aos dias que faltam. `}
      A partir do mês que vem, são {numero.format(plano.atendimentos)} atendimentos por mês.{' '}
      {r.anual
        ? valor > 0
          ? `Hoje sai uma cobrança de ${reais(valor)}: a diferença do plano anual ${r.meses === 1 ? 'pelo último mês antes da renovação' : `pelos ${r.meses} meses que faltam até a renovação`}, em ${dia(r.renova_em!)}. Ela vence em 3 dias e aparece em Faturas, nesta página.`
          : r.teste_gratis
            ? 'Como a empresa está no teste grátis, não há diferença a pagar.'
            : 'A fatura do ano ainda vai sair, já com o plano novo.'
        : valor > 0
          ? `A mensalidade do plano passa a ${reais(plano.preco_mensal)}, e na próxima fatura entra também a diferença deste mês: ${reais(valor)} (${r.dias} dos ${r.dias_mes} dias do mês, contando hoje).`
          : r.teste_gratis
            ? `A mensalidade do plano passa a ${reais(plano.preco_mensal)}. Como a empresa está no teste grátis, não há diferença a pagar.`
            : `A mensalidade do plano passa a ${reais(plano.preco_mensal)}. A fatura deste mês ainda vai sair, já com o plano novo.`}
    </>
  )
}

function TextoCiclo({ previa, renovaEm, aoMudarParcelas }: {
  previa: Extract<Previa, { tipo: 'ciclo' }>
  renovaEm: string | null
  aoMudarParcelas: (parcelas: number) => void
}) {
  const { r, parcelas } = previa
  if (r.ciclo === 'mensal') {
    return r.agora ? (
      <>A fatura do ano ainda não saiu: a empresa volta ao plano mensal agora, e as próximas faturas saem por mês.</>
    ) : (
      <>
        O plano anual continua até o fim do período já pago. A partir de {dia(r.vale_em!)}, a empresa paga por mês, com vencimento
        no dia 10. Para cancelar o anual antes, com devolução, fale com a equipe da Livih.
      </>
    )
  }
  const total = Number(r.valor ?? 0)
  return (
    <span className="block space-y-3">
      {r.tipo === 'anual' ? (
        <>
          <span className="block">
            O plano anual começa em {dia(r.vale_em!)}: {reais(total)} pelo ano (plano {r.plano}
            {total > Number(r.valor_plano) ? ' e módulos contratados' : ''}), o mesmo que 10 mensalidades. A fatura do ano sai nesse
            dia, com vencimento no dia 10.
          </span>
          <span className="block">
            Atendimentos a mais e pacotes continuam na fatura de cada mês. O anual renova sozinho a cada 12 meses, pelo preço de
            tabela, com aviso 15 dias antes. Descer de plano e desligar módulos passam a valer só na renovação. Se cancelar, a
            devolução é integral até 7 dias depois do pagamento; depois, devolvemos o pago menos os meses usados a preço mensal.
          </span>
        </>
      ) : (
        <span className="block">
          A forma de pagamento vale para a próxima fatura anual{renovaEm ? `, na renovação em ${dia(renovaEm)}` : ''}.
          {r.tipo === 'cancelar' && ` Isso também cancela a volta ao mensal: o anual renova${renovaEm ? ` em ${dia(renovaEm)}` : ''}.`}
        </span>
      )}
      <label className="block text-pequeno font-medium" htmlFor="parcelas-anual">
        Forma de pagamento
        <select
          id="parcelas-anual"
          value={parcelas}
          onChange={(e) => aoMudarParcelas(Number(e.target.value))}
          className="mt-1 block w-full rounded-md border border-borda bg-superficie px-3 py-2 font-normal"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n === 1 ? 'À vista: Pix, boleto ou cartão' : `Cartão de crédito em ${n}x sem juros${total ? ` de ${reais(Math.round((total * 100) / n) / 100)}` : ''}`}
            </option>
          ))}
        </select>
      </label>
    </span>
  )
}

function TextoModulo({ previa }: { previa: Extract<Previa, { tipo: 'modulo' }> }) {
  const { modulo, ligar, r } = previa
  if (!ligar) {
    return (
      <>
        {r.agora
          ? 'Como a empresa está no teste grátis, o módulo desliga agora.'
          : `O módulo continua ligado até ${dia(r.vale_em!)}, quando desliga, sem devolução.`}
        {r.sem_nota && ' Sem o ERP e sem as Ordens de serviço, a empresa deixa de emitir nota fiscal; as notas já emitidas continuam visíveis.'}{' '}
        Nada é apagado: se ligar o módulo de novo, está tudo lá.
      </>
    )
  }
  const valor = Number(r.valor)
  return (
    <>
      O módulo {modulo.nome} fica ligado agora.{' '}
      {r.anual
        ? valor > 0
          ? `Hoje sai uma cobrança de ${reais(valor)}: a diferença do anual ${r.meses === 1 ? 'pelo último mês antes da renovação' : `pelos ${r.meses} meses que faltam até a renovação`}, em ${dia(r.renova_em!)}. Ela vence em 3 dias e aparece em Faturas, nesta página. `
          : r.teste_gratis
            ? 'Como a empresa está no teste grátis, não há nada a pagar agora. '
            : 'A fatura do ano ainda vai sair, já com o módulo. '
        : valor > 0
          ? `Na próxima fatura entra a diferença deste mês: ${reais(valor)} (${r.dias} dos ${r.dias_mes} dias do mês, contando hoje). `
          : r.teste_gratis
            ? 'Como a empresa está no teste grátis, não há nada a pagar agora. '
            : 'A fatura deste mês ainda vai sair, já com o módulo. '}
      Os módulos passam a {reais(r.total_modulos)} {r.anual ? 'por ano' : 'por mês'}
      {Number(r.diferenca) < Number(r.anual ? modulo.preco_anual : modulo.preco_mensal) && ' (com o desconto dos dois juntos)'}. Se ainda
      não configurou a nota fiscal, faça isso em Configurações → Empresa, no CNPJ, botão Nota fiscal (certificado digital A1 e dados
      fiscais).
    </>
  )
}
