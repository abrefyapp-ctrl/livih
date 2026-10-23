import { useCallback, useEffect, useState } from 'react'
import { escutarParaRecarregar } from '../services/aoVivo'
import {
  contarPorEstado,
  listarConversas,
  type ConversaLista,
  type EstadoConversa,
} from '../services/atendimento'

const ZERO: Record<EstadoConversa, number> = { aguardando_humano: 0, humano: 0, bot: 0, encerrada: 0 }

type Dados = { chave: string; conversas: ConversaLista[]; erro: string | null }

/**
 * Conversas de uma aba + contagem por estado, ao vivo: qualquer mudança em `conversas` da
 * organização (mensagem nova, alguém assumiu, agente chamou a equipe) recarrega a lista.
 */
export function useConversas(orgId: string | undefined, estado: EstadoConversa, canalId?: string) {
  const chave = `${orgId}|${estado}|${canalId ?? ''}`
  const [dados, setDados] = useState<Dados | null>(null)
  const [contagem, setContagem] = useState(ZERO)
  const [versao, setVersao] = useState(0) // "tentar de novo" pede uma nova busca

  useEffect(() => {
    if (!orgId) return
    let ativo = true
    const buscar = () =>
      Promise.all([listarConversas(orgId, estado, canalId), contarPorEstado(orgId, canalId)])
        .then(([lista, cont]) => {
          if (!ativo) return // resposta velha (trocou de aba no meio)
          setDados({ chave, conversas: lista, erro: null })
          setContagem(cont)
        })
        .catch(() => ativo && setDados({ chave, conversas: [], erro: 'Não foi possível carregar as conversas.' }))
    void buscar()
    const parar = escutarParaRecarregar(`conversas-${chave}-${versao}`, 'conversas', `org_id=eq.${orgId}`, () => void buscar())
    return () => {
      ativo = false
      parar()
    }
  }, [orgId, estado, canalId, chave, versao])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])
  const atual = dados?.chave === chave ? dados : null
  return {
    conversas: atual?.conversas ?? [],
    contagem,
    carregando: !atual,
    erro: atual?.erro ?? null,
    recarregar,
  }
}

/** Só o número de conversas aguardando humano, para o menu — ao vivo. */
export function useContagemAguardando(orgId: string | undefined) {
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!orgId) return
    let ativo = true
    const contar = () =>
      contarPorEstado(orgId)
        .then((c) => ativo && setTotal(c.aguardando_humano))
        .catch(() => undefined)
    void contar()
    const parar = escutarParaRecarregar(`aguardando-${orgId}`, 'conversas', `org_id=eq.${orgId}`, () => void contar())
    return () => {
      ativo = false
      parar()
    }
  }, [orgId])

  return total
}
