import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { CampoTexto } from '../components/CampoTexto'
import { TelaAcesso } from '../components/TelaAcesso'

export function Login() {
  const { sessao } = useSessao()
  const local = useLocation()
  const [modo, setModo] = useState<'entrar' | 'recuperar'>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [linkEnviado, setLinkEnviado] = useState(false)

  if (sessao) {
    const destino = (local.state as { de?: string } | null)?.de ?? '/conversas'
    return <Navigate to={destino} replace />
  }

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEnviando(false)
    if (error) {
      setErro(
        error.message.includes('Invalid login')
          ? 'E-mail ou senha incorretos. Confira e tente de novo.'
          : 'Não foi possível entrar agora. Tente de novo em instantes.',
      )
    }
  }

  async function recuperar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/definir-senha`,
    })
    setEnviando(false)
    if (error) setErro('Não foi possível enviar o link agora. Tente de novo em instantes.')
    else setLinkEnviado(true)
  }

  if (modo === 'recuperar') {
    return (
      <TelaAcesso titulo="Recuperar acesso" subtitulo="Enviamos um link para você criar uma senha nova.">
        {linkEnviado ? (
          <Aviso>
            Se <strong>{email}</strong> tiver acesso ao Livih, o link chega em alguns minutos. Confira também o spam.
          </Aviso>
        ) : (
          <form onSubmit={recuperar} className="space-y-4">
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <CampoTexto rotulo="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" />
            <Botao type="submit" carregando={enviando} className="w-full">
              Enviar link
            </Botao>
          </form>
        )}
        <button
          type="button"
          onClick={() => {
            setModo('entrar')
            setErro(null)
            setLinkEnviado(false)
          }}
          className="mt-6 text-pequeno font-medium text-primaria hover:underline"
        >
          Voltar para entrar
        </button>
      </TelaAcesso>
    )
  }

  return (
    <TelaAcesso titulo="Bem-vindo(a)" subtitulo="Acesse sua conta para continuar.">
      <form onSubmit={entrar} className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <CampoTexto rotulo="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" />
        <CampoTexto rotulo="Senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        <div className="flex justify-end">
          <button type="button" onClick={() => setModo('recuperar')} className="text-pequeno font-medium text-primaria hover:underline">
            Esqueci minha senha
          </button>
        </div>
        <Botao type="submit" carregando={enviando} className="w-full">
          Entrar
        </Botao>
      </form>
      <p className="mt-8 text-legenda text-texto-3">O acesso é por convite. Peça ao administrador da sua empresa.</p>
    </TelaAcesso>
  )
}
