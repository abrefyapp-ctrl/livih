import { useCallback, useEffect, useState } from 'react'
import {
  ativarNotificacoes,
  desativarNotificacoes,
  enviarNotificacaoTeste,
  estadoNotificacoes,
  type EstadoNotificacoes,
} from '../services/notificacoes'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'

type Acao = 'ativar' | 'desativar' | 'testar'

/** Configurações → Notificações: liga ou desliga as notificações push neste aparelho. */
export function SecaoNotificacoes() {
  const [estado, setEstado] = useState<EstadoNotificacoes | null>(null)
  const [acao, setAcao] = useState<Acao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [recarregar, setRecarregar] = useState(0)

  useEffect(() => {
    let ativo = true
    estadoNotificacoes().then((e) => ativo && setEstado(e))
    return () => {
      ativo = false
    }
  }, [recarregar])

  const executar = useCallback(async (qual: Acao) => {
    setAcao(qual)
    setErro(null)
    setAviso(null)
    try {
      if (qual === 'ativar') {
        const e = await ativarNotificacoes()
        if (e) setErro(e)
        else setAviso('Pronto. Use "Enviar teste" para conferir.')
      } else if (qual === 'desativar') {
        await desativarNotificacoes()
      } else {
        const e = await enviarNotificacaoTeste()
        if (e) setErro(e)
        else setAviso('Teste enviado. A notificação deve aparecer em alguns segundos.')
      }
    } catch {
      setErro('Não foi possível concluir. Tente de novo.')
    } finally {
      setAcao(null)
      setRecarregar((n) => n + 1)
    }
  }, [])

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-h2 font-semibold">Notificações neste aparelho</h2>
        <p className="mt-1 text-pequeno text-texto-3">
          Avisamos no celular ou no computador quando um cliente aguarda a equipe e quando chega mensagem numa conversa que está com
          você. Vale só para este aparelho: ative em cada um que você usa.
        </p>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {aviso && <Aviso>{aviso}</Aviso>}

      <div className="rounded-lg border border-borda bg-superficie p-5">
        {estado === null ? (
          <p className="text-pequeno text-texto-3">Verificando…</p>
        ) : estado === 'ativas' ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 font-medium text-primaria">
              <Icone nome="check" className="size-5" /> Notificações ativas neste aparelho
            </p>
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" icone="sino" carregando={acao === 'testar'} onClick={() => void executar('testar')}>
                Enviar teste
              </Botao>
              <Botao variante="fantasma" carregando={acao === 'desativar'} onClick={() => void executar('desativar')}>
                Desativar neste aparelho
              </Botao>
            </div>
          </div>
        ) : estado === 'desativadas' ? (
          <div className="space-y-3">
            <p className="text-pequeno text-texto-2">O navegador vai pedir sua permissão para mostrar notificações.</p>
            <Botao icone="sino" carregando={acao === 'ativar'} onClick={() => void executar('ativar')}>
              Ativar notificações
            </Botao>
          </div>
        ) : estado === 'instalar_ios' ? (
          <p className="text-pequeno text-texto-2">
            No iPhone, as notificações só funcionam com o Livih instalado na tela inicial. Use o botão <strong>Instalar app</strong> no
            topo, abra o Livih pelo ícone e ative aqui.
          </p>
        ) : estado === 'bloqueadas' ? (
          <p className="text-pequeno text-texto-2">
            As notificações estão bloqueadas para o Livih neste navegador. Libere nas permissões do site (o ícone ao lado do endereço) ou,
            no celular, nas configurações de notificação do aparelho, e recarregue a página.
          </p>
        ) : estado === 'sem_service_worker' ? (
          <p className="text-pequeno text-texto-2">As notificações funcionam só na versão publicada do Livih.</p>
        ) : (
          <p className="text-pequeno text-texto-2">Este navegador não aceita notificações. Use o Chrome, o Edge ou o Safari atualizados.</p>
        )}
      </div>
    </section>
  )
}
