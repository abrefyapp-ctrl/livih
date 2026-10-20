import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { CampoTexto } from '../components/CampoTexto'
import { TelaAcesso } from '../components/TelaAcesso'

const MOTIVOS_FRACA: Record<string, string> = {
  length: 'é curta demais',
  characters: 'precisa misturar letras, números e símbolos',
  pwned: 'apareceu em vazamentos de senhas na internet',
}

/**
 * Antes tudo virava "peça um link novo", o que não resolve senha repetida ou fraca (20/10: alguém no "esqueci minha
 * senha" foi recusado e não soube por quê). Cada motivo com o que fazer.
 */
function motivoDoErro(error: { code?: string; message: string } & { reasons?: string[] }): string {
  switch (error.code) {
    case 'same_password':
      return 'Essa já é a sua senha atual. Escolha uma diferente, ou, se lembrou dela, é só entrar com ela.'
    case 'weak_password': {
      const motivos = (error.reasons ?? []).map((r) => MOTIVOS_FRACA[r]).filter(Boolean)
      return `Senha fraca${motivos.length ? `: ${motivos.join(' e ')}` : ''}. Escolha outra.`
    }
    case 'session_not_found':
    case 'session_expired':
    case 'bad_jwt':
    case 'reauthentication_needed':
      return 'Este link expirou. Na tela de entrar, use “Esqueci minha senha” para receber outro.'
    default:
      return `Não foi possível salvar a senha (${error.message}). Peça um link novo e tente de novo.`
  }
}

/** Destino do link de convite e de "esqueci minha senha": o Supabase já abriu a sessão pelo link. */
export function DefinirSenha() {
  const { sessao } = useSessao()
  const navegar = useNavigate()
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const curta = senha.length > 0 && senha.length < 8
  const diferente = confirmacao.length > 0 && confirmacao !== senha

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (senha.length < 8 || senha !== confirmacao) return
    setEnviando(true)
    setErro(null)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) setErro(motivoDoErro(error))
    else navegar('/conversas', { replace: true })
  }

  if (sessao === undefined) return null

  return (
    <TelaAcesso titulo="Crie sua senha" subtitulo="Use pelo menos 8 caracteres.">
      {!sessao ? (
        <Aviso tom="erro">
          Este link expirou ou já foi usado. Na tela de entrar, use “Esqueci minha senha” para receber outro.
        </Aviso>
      ) : (
        <form onSubmit={salvar} className="space-y-4">
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <CampoTexto
            rotulo="Nova senha"
            type="password"
            autoComplete="new-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            erro={curta ? 'A senha precisa ter pelo menos 8 caracteres.' : undefined}
          />
          <CampoTexto
            rotulo="Repita a senha"
            type="password"
            autoComplete="new-password"
            required
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            erro={diferente ? 'As duas senhas não são iguais.' : undefined}
          />
          <Botao type="submit" carregando={enviando} disabled={senha.length < 8 || senha !== confirmacao} className="w-full">
            Salvar senha e entrar
          </Botao>
        </form>
      )}
    </TelaAcesso>
  )
}
