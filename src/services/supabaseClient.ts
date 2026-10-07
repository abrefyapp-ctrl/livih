import { createClient } from '@supabase/supabase-js'
import type { Database } from './tiposBanco'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !chave) {
  throw new Error('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env')
}

// Só a chave pública: o que cada usuário vê é decidido pela RLS (membro da organização).
export const supabase = createClient<Database>(url, chave)
