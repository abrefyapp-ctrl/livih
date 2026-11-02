import { useEffect, useState, type FormEvent } from 'react'
import { moeda } from '../services/formato'
import { darCortesia, definirPlano, listarPlanos, type ConsumoEmpresa, type Plano } from '../services/plano'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CLASSE_CAMPO, Campo } from './ModaisOs'
import { Modal } from './Modal'

const numero = new Intl.NumberFormat('pt-BR')

function rotuloPlano(p: Plano) {
  if (p.atendimentos == null) return `${p.nome} (sem limite)`
  return `${p.nome} · ${moeda(Number(p.preco_mensal), true)} · ${numero.format(p.atendimentos)} atendimentos`
}

/** Painel da plataforma: plano da empresa (franquia do agente) e atendimentos de cortesia no mês. */
export function ModalPlano({ empresa, consumo, aoFechar }: {
  empresa: { id: string; nome: string }
  consumo: ConsumoEmpresa | undefined
  aoFechar: (mudou: boolean) => void
}) {
  const [planos, setPlanos] = useState<Plano[] | null>(null)
  const [plano, setPlano] = useState(consumo?.plano ?? 'interno')
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [mudou, setMudou] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarPlanos()
      .then((l) => ativo && setPlanos(l))
      .catch(() => ativo && setErro('Não foi possível carregar os planos. Feche a janela e abra de novo.'))
    return () => {
      ativo = false
    }
  }, [])

  async function executar(acao: () => Promise<void>, ok: string) {
    setSalvando(true)
    setErro(null)
    setAviso(null)
    try {
      await acao()
      setMudou(true)
      setAviso(ok)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  function salvarPlano() {
    const nome = planos?.find((p) => p.codigo === plano)?.nome ?? plano
    void executar(() => definirPlano(empresa.id, plano), `Plano trocado para ${nome}.`)
  }

  function salvarCortesia(e: FormEvent) {
    e.preventDefault()
    const n = Number(quantidade)
    if (!Number.isInteger(n) || n < 1) {
      setErro('Informe a quantidade de atendimentos: um número inteiro de 1 a 10.000.')
      return
    }
    void executar(async () => {
      await darCortesia(empresa.id, n, motivo)
      setQuantidade('')
      setMotivo('')
    }, `${numero.format(n)} atendimentos de cortesia somados ao limite deste mês.`)
  }

  return (
    <Modal
      aberto
      titulo={`Plano de ${empresa.nome}`}
      aoFechar={() => aoFechar(mudou)}
      rodape={
        <Botao variante="secundario" onClick={() => aoFechar(mudou)}>
          Fechar
        </Botao>
      }
    >
      <div className="space-y-5">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {aviso && <Aviso>{aviso}</Aviso>}

        {consumo && consumo.limite != null && (
          <p className="text-pequeno text-texto-2">
            Este mês: {numero.format(consumo.usados ?? 0)} de {numero.format(consumo.limite)} atendimentos
            {!!consumo.excedentes && ` · ${numero.format(consumo.excedentes)} a mais`}
            {` · ao acabar: ${consumo.escolha === 'parar' ? 'conversas novas vão para a equipe' : 'o agente continua (excedente a cobrar)'}`}
          </p>
        )}

        <div className="space-y-2">
          <Campo rotulo="Plano" id="plano-empresa" ajuda="A troca vale na hora e conta o que a empresa já usou desde o dia 1. Se o novo limite já estiver perto do fim ou acabado, o dono recebe o aviso na hora. A cobrança ainda é feita à parte.">
            <select
              id="plano-empresa"
              value={plano}
              onChange={(e) => setPlano(e.target.value)}
              disabled={!planos || salvando}
              className={CLASSE_CAMPO}
            >
              {(planos ?? []).map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {rotuloPlano(p)}
                </option>
              ))}
            </select>
          </Campo>
          <Botao onClick={salvarPlano} carregando={salvando} disabled={!planos || plano === (consumo?.plano ?? 'interno')}>
            Salvar plano
          </Botao>
        </div>

        <form onSubmit={salvarCortesia} className="space-y-3 border-t border-borda pt-4">
          <p className="font-medium">Atendimentos de cortesia</p>
          <p className="text-pequeno text-texto-3">Entram no limite deste mês, sem cobrança, e não passam para o mês seguinte. O motivo fica registrado.</p>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <Campo rotulo="Quantidade" id="cortesia-qtd">
              <input
                id="cortesia-qtd"
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className={CLASSE_CAMPO}
              />
            </Campo>
            <Campo rotulo="Motivo" id="cortesia-motivo">
              <input
                id="cortesia-motivo"
                value={motivo}
                maxLength={300}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: instabilidade no dia 12"
                className={CLASSE_CAMPO}
              />
            </Campo>
          </div>
          <Botao type="submit" variante="secundario" carregando={salvando} disabled={!quantidade || !motivo.trim()}>
            Dar cortesia
          </Botao>
        </form>
      </div>
    </Modal>
  )
}
