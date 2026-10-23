import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type { Database } from './tiposBanco'

// Tempo real (Supabase Realtime): as telas assinam as mudanças de uma tabela por aqui. Devolve a função que cancela,
// para usar direto no retorno do useEffect.

type Tabela = keyof Database['public']['Tables']
type Linha<T extends Tabela> = Database['public']['Tables'][T]['Row']
type Evento = '*' | 'INSERT' | 'UPDATE' | 'DELETE'

/**
 * Cada mudança chega em `aoMudar`. `filtro` é o do Realtime (ex.: `org_id=eq.<id>`); `nome` identifica o canal e
 * precisa ser único entre as assinaturas abertas ao mesmo tempo.
 */
export function escutar<T extends Tabela>(
  nome: string,
  tabela: T,
  filtro: string,
  aoMudar: (evento: RealtimePostgresChangesPayload<Linha<T>>) => void,
  evento: Evento = '*',
): () => void {
  const canal = supabase
    .channel(nome)
    // O tipo da biblioteca separa cada evento numa sobrecarga; aqui o evento é parâmetro.
    .on('postgres_changes' as never, { event: evento, schema: 'public', table: tabela, filter: filtro }, aoMudar)
    .subscribe()
  return () => void supabase.removeChannel(canal)
}

/** Para listas que recarregam do banco: rajadas de mudanças (várias mensagens seguidas) viram uma recarga só. */
export function escutarParaRecarregar(nome: string, tabela: Tabela, filtro: string, recarregar: () => void, espera = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const parar = escutar(nome, tabela, filtro, () => {
    clearTimeout(timer)
    timer = setTimeout(recarregar, espera)
  })
  return () => {
    clearTimeout(timer)
    parar()
  }
}
