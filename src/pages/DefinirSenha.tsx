import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { CampoTexto } from '../components/CampoTexto'
import { TelaAcesso } from '../components/TelaAcesso'

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
    if (error) setErro('Não foi possível salvar a senha. Peça um link novo e tente de novo.')
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
