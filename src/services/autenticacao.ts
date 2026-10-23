import type { AuthError, Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// Login, sessão e senha (Supabase Auth). As telas tratam o erro: cada uma tem a sua mensagem.

/** Sessão salva no aparelho e as mudanças seguintes (entrar, sair, renovar). Devolve a função que para de ouvir. */
export function acompanharSessao(aoMudar: (sessao: Session | null) => void): () => void {
  void supabase.auth.getSession().then(({ data }) => aoMudar(data.session))
  const { data } = supabase.auth.onAuthStateChange((_evento, nova) => aoMudar(nova))
  return () => data.subscription.unsubscribe()
}

export async function entrar(email: string, senha: string): Promise<AuthError | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
  return error
}

/** Manda o link para criar senha nova, que abre /definir-senha. */
export async function pedirNovaSenha(email: string): Promise<AuthError | null> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/definir-senha`,
  })
  return error
}

export async function definirSenha(senha: string): Promise<AuthError | null> {
  const { error } = await supabase.auth.updateUser({ password: senha })
  return error
}

export async function encerrarSessao() {
  await supabase.auth.signOut()
}
