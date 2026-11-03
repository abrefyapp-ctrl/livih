import { useEffect, useState, type FormEvent } from 'react'
import { lerNumero, moeda } from '../services/formato'
import {
  buscarContrato,
  cancelarFatura,
  definirContrato,
  encerrarAnual,
  gerarFatura,
  listarFaturas,
  reenviarFatura,
  type Contrato,
  type EncerramentoAnual,
  type Fatura,
} from '../services/faturas'
import { mesAtual } from '../services/usoIa'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { ListaFaturas } from './ListaFaturas'
import { CLASSE_CAMPO, Campo } from './ModaisOs'

const dataBr = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
const somarMeses = (iso: string, n: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 10)

/**
 * Janela Plano (plataforma): liga a cobrança da empresa, o mês da primeira fatura e o preço combinado, se houver;
 * gera a fatura do mês na hora (início no meio do mês ou teste no sandbox) e mostra as faturas.
 */
export function CobrancaEmpresa({ orgId, aoMudar }: { orgId: string; aoMudar: () => void }) {
  const [dados, setDados] = useState<{ contrato: Contrato | null; faturas: Fatura[] } | null>(null)
  const [ativo, setAtivo] = useState(false)
  const [inicio, setInicio] = useState(mesAtual().slice(0, 7))
  const [valorFixo, setValorFixo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [cancelar, setCancelar] = useState<Fatura | null>(null)
  const [encerrar, setEncerrar] = useState<EncerramentoAnual | null>(null)

  useEffect(() => {
    let vivo = true
    Promise.all([buscarContrato(orgId), listarFaturas(orgId)])
      .then(([contrato, faturas]) => {
        if (!vivo) return
        setDados({ contrato, faturas })
        if (contrato) {
          setAtivo(contrato.ativo)
          setInicio(contrato.inicio.slice(0, 7))
          setValorFixo(contrato.valor_fixo == null ? '' : String(contrato.valor_fixo).replace('.', ','))
          setMotivo(contrato.motivo_valor ?? '')
        }
      })
      .catch(() => vivo && setErro('Não foi possível carregar a cobrança. Feche a janela e abra de novo.'))
    return () => {
      vivo = false
    }
  }, [orgId, versao])

  async function executar(acao: () => Promise<void>, ok: string) {
    setSalvando(true)
    setErro(null)
    setAviso(null)
    try {
      await acao()
      setAviso(ok)
      setVersao((v) => v + 1)
      aoMudar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  function salvar(e: FormEvent) {
    e.preventDefault()
    const fixo = valorFixo.trim() ? lerNumero(valorFixo) : null
    if (fixo === undefined) {
      setErro('Valor combinado inválido. Use só números, como 150,00.')
      return
    }
    const ok = !ativo
      ? 'Cobrança desligada: esta empresa não recebe novas faturas. As que já foram geradas continuam no Asaas.'
      : inicio === mesAtual().slice(0, 7)
        ? 'Cobrança ligada. O fechamento deste mês já passou: use "Gerar a fatura deste mês agora". As próximas saem no dia 1, com vencimento no dia 10.'
        : 'Cobrança ligada. A fatura sai no dia 1 de cada mês, com vencimento no dia 10.'
    void executar(() => definirContrato(orgId, { ativo, inicio: `${inicio}-01`, valorFixo: fixo ?? null, motivo }), ok)
  }

  // Cancelada e avulsa não contam: o banco libera o mês para outra fatura (faturas_uma_por_mes).
  const faturaDoMes = dados?.faturas.some((f) => f.competencia === mesAtual() && f.tipo === 'mes' && f.status !== 'cancelada')
  const contrato = dados?.contrato

  async function calcularEncerramento() {
    setSalvando(true)
    setErro(null)
    setAviso(null)
    try {
      setEncerrar(await encerrarAnual(orgId, false))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold">Cobrança</p>
        <p className="text-pequeno text-texto-3">
          A fatura sai no dia 1, com vencimento no dia 10: plano e módulos do mês, mais os atendimentos a mais e os pacotes do mês
          anterior. Gerada depois do dia 7, vence em 3 dias. Abaixo de R$ 5, não é gerada.
        </p>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {aviso && <Aviso>{aviso}</Aviso>}
      {!dados ? (
        !erro && <p className="text-pequeno text-texto-3">Carregando…</p>
      ) : (
        <>
          <form onSubmit={salvar} className="space-y-3">
            <label className="flex items-center gap-2 text-pequeno font-medium">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="accent-primaria" />
              Cobrar esta empresa
            </label>
            <div className="grid gap-3 sm:grid-cols-[10rem_8rem_1fr]">
              <Campo rotulo="Primeira fatura" id={`inicio-${orgId}`}>
                <input id={`inicio-${orgId}`} type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} className={CLASSE_CAMPO} />
              </Campo>
              <Campo rotulo="Valor combinado" id={`fixo-${orgId}`}>
                <input
                  id={`fixo-${orgId}`}
                  value={valorFixo}
                  onChange={(e) => setValorFixo(e.target.value)}
                  inputMode="decimal"
                  placeholder="Pela tabela"
                  className={CLASSE_CAMPO}
                />
              </Campo>
              <Campo rotulo="Motivo do valor combinado" id={`motivo-${orgId}`}>
                <input
                  id={`motivo-${orgId}`}
                  value={motivo}
                  maxLength={300}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={!valorFixo.trim()}
                  placeholder="Ex.: acordo de lançamento"
                  className={CLASSE_CAMPO}
                />
              </Campo>
            </div>
            <p className="text-legenda text-texto-3">
              O valor combinado entra no lugar do plano e dos módulos. Os atendimentos a mais e os pacotes continuam somando. O
              cliente vê só "Plano e módulos (valor combinado)"; o motivo fica no registro interno.
            </p>
            <div className="flex flex-wrap gap-2">
              <Botao type="submit" variante="secundario" carregando={salvando}>
                Salvar cobrança
              </Botao>
              {dados.contrato?.ativo && !faturaDoMes && (
                <Botao
                  variante="secundario"
                  onClick={() => void executar(() => gerarFatura(orgId), 'Fatura deste mês gerada. O link de pagamento fica pronto em alguns segundos: feche e abra a janela para ver.')}
                  disabled={salvando}
                >
                  Gerar a fatura deste mês agora
                </Botao>
              )}
            </div>
          </form>
          {contrato?.ciclo === 'anual' && contrato.anual_inicio && (
            <div className="space-y-2 rounded-md border border-borda p-3">
              <p className="text-pequeno">
                <span className="font-medium">Plano anual</span> desde {dataBr(contrato.anual_inicio)}, renova em{' '}
                {dataBr(somarMeses(contrato.anual_inicio, 12))}
                {contrato.anual_parcelas > 1 ? `, no cartão em ${contrato.anual_parcelas}x` : ', à vista'}
                {contrato.ciclo_proximo === 'mensal' && '. O dono pediu para voltar ao mensal na renovação'}.
              </p>
              <Botao tamanho="sm" variante="secundario" onClick={() => void calcularEncerramento()} disabled={salvando}>
                Encerrar o anual
              </Botao>
            </div>
          )}
          {contrato?.ciclo === 'mensal' && contrato.ciclo_proximo === 'anual' && contrato.ciclo_proximo_em && (
            <p className="text-pequeno text-texto-2">
              O dono escolheu o plano anual a partir de {dataBr(contrato.ciclo_proximo_em)}
              {contrato.anual_parcelas > 1 ? `, no cartão em ${contrato.anual_parcelas}x` : ', à vista'}.
            </p>
          )}
          {dados.faturas.length > 0 && (
            <ListaFaturas
              faturas={dados.faturas}
              acoes={{
                ocupado: salvando,
                reenviar: (f) =>
                  void executar(() => reenviarFatura(f.id), 'Fatura enviada de novo. O link fica pronto em alguns segundos: feche e abra a janela para ver.'),
                cancelar: setCancelar,
              }}
            />
          )}
          <DialogoConfirmacao
            aberto={!!cancelar}
            titulo="Cancelar esta fatura?"
            rotuloConfirmar="Cancelar fatura"
            perigo
            carregando={salvando}
            aoConfirmar={() => {
              const f = cancelar
              setCancelar(null)
              if (f) void executar(() => cancelarFatura(f.id), 'Fatura cancelada. Se já tinha link, a cobrança é apagada no Asaas em alguns segundos.')
            }}
            aoCancelar={() => setCancelar(null)}
          >
            A cobrança deixa de valer e o mês fica livre para uma fatura nova. Use para teste no sandbox ou cobrança feita por engano.
          </DialogoConfirmacao>
          <DialogoConfirmacao
            aberto={!!encerrar}
            titulo="Encerrar o plano anual?"
            rotuloConfirmar="Encerrar e desligar a cobrança"
            perigo
            carregando={salvando}
            aoConfirmar={() => {
              setEncerrar(null)
              void executar(
                () => encerrarAnual(orgId, true).then(() => undefined),
                'Anual encerrado e cobrança desligada. Se houver devolução, faça no painel do Asaas, na cobrança paga.',
              )
            }}
            aoCancelar={() => setEncerrar(null)}
          >
            {encerrar && (
              <>
                Pago no ano: {moeda(Number(encerrar.pago), true)}. Meses usados, contando este: {encerrar.meses_usados}.{' '}
                {Number(encerrar.pago) <= 0
                  ? 'Nada foi pago neste ano: não há devolução. Se a fatura anual estiver em aberto, cancele-a na lista de faturas desta janela.'
                  : encerrar.integral
                    ? `Pago há até 7 dias: a devolução é integral, ${moeda(Number(encerrar.devolver), true)}.`
                    : encerrar.meses_usados >= 10
                      ? 'Do 10º mês em diante, não há devolução.'
                      : `Devolução: ${moeda(Number(encerrar.devolver), true)} (o pago menos ${encerrar.meses_usados} × ${moeda(Number(encerrar.mensal), true)}, o preço mensal de hoje do plano e dos módulos).`}{' '}
                A empresa volta ao mensal com a cobrança desligada; a devolução é feita à mão no painel do Asaas. Para cortar o acesso,
                suspenda a empresa na tela Empresas.
              </>
            )}
          </DialogoConfirmacao>
        </>
      )}
    </div>
  )
}
