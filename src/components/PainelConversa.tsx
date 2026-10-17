import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import {
  assumirConversa,
  buscarConversa,
  devolverAoAgente,
  encerrarConversa,
  enviarArquivo,
  enviarMensagem,
  marcarComoLida,
  type ConversaLista,
  type Mensagem,
} from '../services/atendimento'
import { formatarTelefone, mesmoDia, nomeDoContato, rotuloDia } from '../services/formato'
import { useMensagens } from '../hooks/useMensagens'
import { useSessao } from '../hooks/useSessao'
import { Avatar } from './Avatar'
import { Aviso } from './Aviso'
import { BalaoMensagem } from './BalaoMensagem'
import { Botao } from './Botao'
import { Compositor } from './Compositor'
import { ModalNovoOrcamento } from './ModalNovoOrcamento'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { EstadoVazio } from './EstadoVazio'
import { EtiquetaEstado } from './EtiquetaEstado'
import { Icone } from './Icone'
import { ModalBiblioteca } from './ModalBiblioteca'
import { ModalEnviarModelo } from './ModalEnviarModelo'

type Acao = 'assumir' | 'devolver' | 'encerrar'

/** Hora atual, renovada a cada minuto (para a janela de 24 h fechar sozinha com a tela aberta). */
function useAgora() {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return agora
}

export function PainelConversa({
  conversaId,
  voltarPara,
  contatoAberto,
  aoAlternarContato,
}: {
  conversaId: string
  voltarPara: string
  contatoAberto: boolean
  aoAlternarContato: () => void
}) {
  const { sessao, equipe, orgAtiva, modulos } = useSessao()
  const [novoOrcamento, setNovoOrcamento] = useState(false)
  const [biblioteca, setBiblioteca] = useState(false)
  const eu = sessao?.user.id
  const [conversa, setConversa] = useState<ConversaLista | null | undefined>(undefined)
  const [confirmar, setConfirmar] = useState<Acao | null>(null)
  const [executando, setExecutando] = useState<Acao | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  // Vindo de "Nova conversa" num número da API oficial: a janela de modelo já abre.
  const [params] = useSearchParams()
  const [enviandoModelo, setEnviandoModelo] = useState(() => params.get('modelo') === '1')
  const agora = useAgora()
  const { mensagens, carregando, erro } = useMensagens(conversaId)
  const rolagem = useRef<HTMLDivElement>(null)
  const noFim = useRef(true)

  // Conversa: carrega e acompanha mudanças de estado feitas por outra pessoa ou pelo agente.
  useEffect(() => {
    let ativo = true
    buscarConversa(conversaId)
      .then((c) => ativo && setConversa(c))
      .catch(() => ativo && setConversa(null))
    const canal = supabase
      .channel(`conversa-${conversaId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversas', filter: `id=eq.${conversaId}` }, (e) =>
        setConversa((atual) => (atual ? { ...atual, ...(e.new as Partial<ConversaLista>), contato: atual.contato } : atual)),
      )
      .subscribe()
    return () => {
      ativo = false
      void supabase.removeChannel(canal)
    }
  }, [conversaId])

  // Abriu a conversa = leu.
  const naoLidas = conversa?.nao_lidas ?? 0
  useEffect(() => {
    if (naoLidas > 0) void marcarComoLida(conversaId).catch(() => undefined)
  }, [conversaId, naoLidas, mensagens.length])

  // Rola para o fim ao abrir e quando chega mensagem — a não ser que a pessoa tenha subido para ler.
  useLayoutEffect(() => {
    const el = rolagem.current
    if (el && noFim.current) el.scrollTop = el.scrollHeight
  }, [mensagens])

  if (conversa === undefined) {
    return <div className="flex h-full items-center justify-center text-pequeno text-texto-3">Carregando conversa…</div>
  }
  if (conversa === null) {
    return (
      <EstadoVazio icone="conversas" titulo="Conversa não encontrada" acao={<Link to={voltarPara} className="font-medium text-primaria underline">Voltar para a lista</Link>}>
        Ela pode ter sido removida ou você não tem acesso a esta organização.
      </EstadoVazio>
    )
  }

  const nome = nomeDoContato(conversa.contato)
  const estado = conversa.estado
  const minha = estado === 'humano' && conversa.atribuida_a === eu
  const atendente = (conversa.atribuida_a && equipe.get(conversa.atribuida_a)?.nome) || undefined

  async function executar(acao: Acao) {
    if (!eu) return
    setExecutando(acao)
    setErroAcao(null)
    try {
      if (acao === 'assumir') {
        await assumirConversa(conversaId, eu)
        setConversa((c) => c && { ...c, estado: 'humano', atribuida_a: eu })
      } else if (acao === 'devolver') {
        await devolverAoAgente(conversaId)
        setConversa((c) => c && { ...c, estado: 'bot', atribuida_a: null, motivo_humano: null })
      } else {
        await encerrarConversa(conversaId)
        setConversa((c) => c && { ...c, estado: 'encerrada', atribuida_a: null })
      }
      setConfirmar(null)
    } catch {
      setErroAcao('Não foi possível concluir a ação. Tente de novo.')
      setConfirmar(null)
    } finally {
      setExecutando(null)
    }
  }

  const dica =
    estado === 'encerrada'
      ? 'Esta conversa está encerrada. Ao enviar, ela volta a ficar em atendimento com você.'
      : !minha
        ? 'Ao enviar, você assume a conversa e o agente para de responder.'
        : undefined

  // API oficial: 24 h depois da última mensagem do cliente, só modelo aprovado é entregue.
  const oficial = conversa?.canal?.tipo === 'meta'
  const ultimaEntrada = oficial ? mensagens.findLast((m) => m.direcao === 'entrada') : undefined
  const janelaFechada =
    oficial && !carregando && (!ultimaEntrada || agora - new Date(ultimaEntrada.criado_em).getTime() > 24 * 3600_000)
  const botaoModelo = oficial && (
    <Botao variante="secundario" icone="arquivo" onClick={() => setEnviandoModelo(true)}>
      <span className={janelaFechada ? '' : 'sr-only'}>Enviar modelo</span>
    </Botao>
  )

  const nomeAutor = (m: Mensagem) =>
    m.automatica
      ? 'Automática do celular'
      : m.autor_id === eu
        ? 'Você'
        : m.autor_id
          ? (equipe.get(m.autor_id)?.nome ?? 'Equipe')
          : 'Pelo celular'

  return (
    <section aria-label={`Conversa com ${nome}`} className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-borda bg-superficie px-4 py-3">
        <Link to={voltarPara} aria-label="Voltar para a lista" className="-ml-2 rounded-md p-2 text-texto-2 hover:bg-fundo md:hidden">
          <Icone nome="voltar" />
        </Link>
        <Avatar nome={nome} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{nome}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-legenda text-texto-3">
            <span>{formatarTelefone(conversa.contato?.telefone)}</span>
            {conversa.canal && <span>· via {conversa.canal.nome}</span>}
            <EtiquetaEstado estado={estado} complemento={estado === 'humano' ? (minha ? 'você' : atendente) : undefined} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(estado === 'bot' || estado === 'aguardando_humano' || (estado === 'humano' && !minha)) && (
            <Botao tamanho="sm" icone="usuario" variante={estado === 'humano' ? 'secundario' : 'primario'} carregando={executando === 'assumir'} onClick={() => void executar('assumir')}>
              Assumir conversa
            </Botao>
          )}
          {(estado === 'aguardando_humano' || estado === 'humano') && !conversa.contato?.sem_agente && (
            <Botao tamanho="sm" variante="secundario" icone="agente" onClick={() => setConfirmar('devolver')}>
              Devolver ao agente
            </Botao>
          )}
          {modulos?.has('erp') && conversa.contato && (
            <Botao tamanho="sm" variante="secundario" icone="pedido" onClick={() => setNovoOrcamento(true)}>
              Orçamento
            </Botao>
          )}
          {estado !== 'encerrada' && (
            <Botao tamanho="sm" variante="fantasma" icone="check" onClick={() => setConfirmar('encerrar')}>
              Encerrar
            </Botao>
          )}
          <button
            onClick={aoAlternarContato}
            aria-label={contatoAberto ? 'Fechar dados do contato' : 'Ver dados do contato'}
            aria-pressed={contatoAberto}
            title="Dados do contato"
            className={`rounded-md p-2 hover:bg-fundo ${contatoAberto ? 'text-primaria' : 'text-texto-2'}`}
          >
            <Icone nome="painel" />
          </button>
        </div>
      </header>

      {(erroAcao || estado === 'aguardando_humano' || estado === 'encerrada') && (
        <div className="space-y-2 border-b border-borda bg-superficie px-4 py-2">
          {erroAcao && <Aviso tom="erro">{erroAcao}</Aviso>}
          {estado === 'aguardando_humano' && (
            <Aviso tom="atencao">
              <strong className="font-semibold">O agente chamou a equipe</strong>
              {conversa.motivo_humano ? `: ${conversa.motivo_humano}` : '.'} Ele não responde mais até alguém assumir ou devolver.
            </Aviso>
          )}
          {estado === 'encerrada' && (
            <Aviso>Conversa encerrada. Se o cliente escrever de novo, o agente volta a atender.</Aviso>
          )}
        </div>
      )}

      <div
        ref={rolagem}
        onScroll={(e) => {
          const el = e.currentTarget
          noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-fundo px-4 py-4"
        aria-live="polite"
        aria-busy={carregando}
      >
        {erro ? (
          <Aviso tom="erro">{erro}</Aviso>
        ) : carregando ? (
          <p className="py-8 text-center text-pequeno text-texto-3">Carregando mensagens…</p>
        ) : !mensagens.length ? (
          <EstadoVazio icone="conversas" titulo="Sem mensagens ainda" />
        ) : (
          <ol className="mx-auto flex max-w-3xl flex-col gap-2">
            {mensagens.map((m, i) => (
              <Fragment key={m.id}>
                {(i === 0 || !mesmoDia(mensagens[i - 1].criado_em, m.criado_em)) && (
                  <li className="sticky top-0 z-10 py-2 text-center" aria-hidden="false">
                    <span className="rounded-full bg-superficie px-3 py-1 text-legenda font-medium text-texto-3 shadow-sm ring-1 ring-borda">
                      {rotuloDia(m.criado_em)}
                    </span>
                  </li>
                )}
                <li>
                  <BalaoMensagem m={m} nomeAutor={m.autor_tipo === 'atendente' ? nomeAutor(m) : undefined} />
                </li>
              </Fragment>
            ))}
          </ol>
        )}
      </div>

      <Compositor
        dica={dica}
        aoEnviar={(t) => enviarMensagem(conversaId, t)}
        aoEnviarArquivo={orgAtiva ? (f, legenda) => enviarArquivo(orgAtiva.id, conversaId, f, legenda) : undefined}
        aoAbrirBiblioteca={orgAtiva ? () => setBiblioteca(true) : undefined}
        acao={botaoModelo}
        bloqueio={
          janelaFechada &&
          `Faz mais de 24 horas que ${nome} escreveu. Pela API oficial do WhatsApp, só dá para retomar com um modelo aprovado.`
        }
      />
      {orgAtiva && <ModalBiblioteca aberto={biblioteca} conversaId={conversaId} aoFechar={() => setBiblioteca(false)} />}
      {novoOrcamento && conversa.contato && (
        <ModalNovoOrcamento contato={conversa.contato} aoFechar={() => setNovoOrcamento(false)} />
      )}
      {oficial && conversa?.canal && orgAtiva && (
        <ModalEnviarModelo
          aberto={enviandoModelo}
          orgId={orgAtiva.id}
          canalId={conversa.canal.id}
          conversaId={conversaId}
          nomeContato={nome}
          aoFechar={() => setEnviandoModelo(false)}
        />
      )}

      <DialogoConfirmacao
        aberto={confirmar === 'devolver'}
        titulo="Devolver ao agente?"
        rotuloConfirmar="Devolver ao agente"
        carregando={executando === 'devolver'}
        aoConfirmar={() => void executar('devolver')}
        aoCancelar={() => setConfirmar(null)}
      >
        O agente volta a responder {nome} sozinho a partir da próxima mensagem.
      </DialogoConfirmacao>
      <DialogoConfirmacao
        aberto={confirmar === 'encerrar'}
        titulo="Encerrar conversa?"
        rotuloConfirmar="Encerrar conversa"
        carregando={executando === 'encerrar'}
        aoConfirmar={() => void executar('encerrar')}
        aoCancelar={() => setConfirmar(null)}
      >
        A conversa sai da fila. Nada é apagado, e se {nome} escrever de novo, o agente volta a atender.
      </DialogoConfirmacao>
    </section>
  )
}
