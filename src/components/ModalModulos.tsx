import { useEffect, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import { definirFinanceiroOculto, definirModulo, lerFinanceiroOculto, listarModulos, type Modulo } from '../services/modulos'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Interruptor } from './Interruptor'
import { Modal } from './Modal'

/** Painel da plataforma: liga e desliga os módulos de uma empresa (o que ela paga à parte fica marcado). */
export function ModalModulos({ empresa, aoFechar }: { empresa: { id: string; nome: string }; aoFechar: () => void }) {
  const { recarregarModulos } = useSessao()
  const [modulos, setModulos] = useState<Modulo[] | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarModulos(empresa.id)
      .then((l) => ativo && setModulos(l))
      .catch(() => ativo && setErro('Não foi possível carregar os módulos.'))
    return () => {
      ativo = false
    }
  }, [empresa.id])

  const [oculto, setOculto] = useState<boolean | null>(null)
  useEffect(() => {
    let ativo = true
    lerFinanceiroOculto(empresa.id)
      .then((v) => ativo && setOculto(v))
      .catch(() => ativo && setErro('Não foi possível carregar a opção do Financeiro. Feche e abra de novo.'))
    return () => {
      ativo = false
    }
  }, [empresa.id])

  async function alternarFinanceiro() {
    if (oculto === null) return
    setOcupado('financeiro')
    setErro(null)
    try {
      await definirFinanceiroOculto(empresa.id, !oculto)
      setOculto(!oculto)
      recarregarModulos()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  async function alternar(m: Modulo) {
    setOcupado(m.codigo)
    setErro(null)
    try {
      await definirModulo(empresa.id, m.codigo, !m.ativo)
      setModulos((l) => l?.map((x) => (x.codigo === m.codigo ? { ...x, ativo: !m.ativo } : x)) ?? null)
      // O menu acompanha na hora (e, se for outra empresa, já fica certo quando trocar para ela).
      recarregarModulos()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <Modal
      aberto
      titulo={`Módulos de ${empresa.nome}`}
      aoFechar={aoFechar}
      rodape={
        <Botao variante="secundario" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      <div className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {!modulos ? (
          <p className="text-pequeno text-texto-3" aria-busy="true">
            Carregando…
          </p>
        ) : (
          <ul className="divide-y divide-borda">
            {modulos.map((m) => (
              <li key={m.codigo} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {m.nome}
                    {m.adicional ? (
                      <span className="rounded-sm bg-atencao-suave px-1.5 py-0.5 text-legenda font-medium text-atencao">Pacote adicional</span>
                    ) : (
                      <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-legenda font-medium text-texto-3">Todos os planos</span>
                    )}
                  </p>
                  <p className="text-pequeno text-texto-3">{m.descricao}</p>
                  {m.ativo !== m.padrao && (
                    <p className="text-legenda text-texto-3">{m.ativo ? 'Ligado só para esta empresa.' : 'Desligado só para esta empresa.'}</p>
                  )}
                </div>
                <Interruptor ligado={m.ativo} desabilitado={ocupado === m.codigo} aoMudar={() => void alternar(m)} className="shrink-0">
                  {m.ativo ? 'Ligado' : 'Desligado'}
                </Interruptor>
              </li>
            ))}
            {/* Financeiro escondido (16/11): para quem usa o ERP da Livih mas cuida do financeiro em outro sistema. */}
            {oculto !== null && (
              <li className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Esconder o Financeiro</p>
                  <p className="text-pequeno text-texto-3">
                    Para a empresa que cuida do financeiro em outro sistema. Tira o menu Financeiro e o bloco Pagamento dos
                    orçamentos. Pedidos confirmados e notas de entrada deixam de gerar lançamentos, e os desse período não
                    entram depois, se o Financeiro voltar.
                  </p>
                </div>
                <Interruptor ligado={oculto} desabilitado={ocupado === 'financeiro'} aoMudar={() => void alternarFinanceiro()} className="shrink-0">
                  {oculto ? 'Escondido' : 'Visível'}
                </Interruptor>
              </li>
            )}
          </ul>
        )}
        <p className="text-legenda text-texto-3">Desligar um módulo esconde as telas dele. Os dados já registrados continuam guardados.</p>
      </div>
    </Modal>
  )
}
