import { useState, type FormEvent } from 'react'
import { useSessao } from '../hooks/useSessao'
import { normalizarTelefone } from '../services/crm'
import { salvarMeusDados } from '../services/empresa'
import { formatarTelefone } from '../services/formato'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'

/** Nome e telefone de quem está logado. O telefone sai no orçamento em PDF, como contato do vendedor. */
export function MeusDados() {
  const { sessao, equipe } = useSessao()
  const eu = sessao!.user.id
  const perfil = equipe.get(eu)
  const [nome, setNome] = useState(perfil?.nome ?? '')
  const [telefone, setTelefone] = useState(formatarTelefone(perfil?.telefone))
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tom: 'erro' | 'info'; texto: string } | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const tel = normalizarTelefone(telefone)
    if (tel === undefined) return setMensagem({ tom: 'erro', texto: 'Telefone inválido. Use DDD e número.' })
    setSalvando(true)
    setMensagem(null)
    try {
      await salvarMeusDados(eu, nome.trim(), tel)
      setTelefone(formatarTelefone(tel))
      setMensagem({ tom: 'info', texto: 'Dados salvos.' })
    } catch (err) {
      setMensagem({ tom: 'erro', texto: (err as Error).message })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
      <div>
        <h3 className="font-semibold">Seus dados</h3>
        <p className="text-pequeno text-texto-3">O telefone sai nos orçamentos em PDF em que você é o responsável.</p>
      </div>
      {mensagem && <Aviso tom={mensagem.tom}>{mensagem.texto}</Aviso>}
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <CampoTexto rotulo="Nome" required maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
        <CampoTexto
          rotulo="Telefone / WhatsApp"
          inputMode="tel"
          placeholder="(41) 99999-8888"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
        />
        <Botao type="submit" variante="secundario" carregando={salvando} disabled={!nome.trim()}>
          Salvar
        </Botao>
      </div>
    </form>
  )
}
