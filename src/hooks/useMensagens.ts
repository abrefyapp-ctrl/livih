import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import { listarMensagens, type Mensagem } from '../services/atendimento'

type Estado = { conversaId: string; mensagens: Mensagem[]; erro: string | null }

function aplicar(atuais: Mensagem[], m: Mensagem): Mensagem[] {
  const i = atuais.findIndex((x) => x.id === m.id)
  if (i >= 0) {
    const copia = atuais.slice()
    copia[i] = m
    return copia
  }
  return [...atuais, m].sort((a, b) => a.criado_em.localeCompare(b.criado_em))
}

/**
 * Histórico de uma conversa; mensagens novas e mudanças de status de entrega chegam ao vivo.
 * O estado guarda de qual conversa ele é: trocar de conversa mostra "carregando" sem zerar nada à mão.
 */
export function useMensagens(conversaId: string) {
  const [estado, setEstado] = useState<Estado | null>(null)

  useEffect(() => {
    let ativo = true
    listarMensagens(conversaId)
      .then((lista) => ativo && setEstado({ conversaId, mensagens: lista, erro: null }))
      .catch(() => ativo && setEstado({ conversaId, mensagens: [], erro: 'Não foi possível carregar as mensagens.' }))

    const canal = supabase
      .channel(`mensagens-${conversaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens', filter: `conversa_id=eq.${conversaId}` },
        (evento) => {
          if (evento.eventType === 'DELETE') return
          setEstado((e) =>
            e && e.conversaId === conversaId ? { ...e, mensagens: aplicar(e.mensagens, evento.new as Mensagem) } : e,
          )
        },
      )
      .subscribe()
    return () => {
      ativo = false
      void supabase.removeChannel(canal)
    }
  }, [conversaId])

  const atual = estado?.conversaId === conversaId ? estado : null
  return { mensagens: atual?.mensagens ?? [], carregando: !atual, erro: atual?.erro ?? null }
}
