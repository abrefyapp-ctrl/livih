import type { Mensagem } from '../services/atendimento'
import { hora } from '../services/formato'
import { Icone, type NomeIcone } from './Icone'
import { TextoWhatsapp } from './TextoWhatsapp'

const MIDIA: Partial<Record<Mensagem['tipo'], string>> = {
  imagem: 'Imagem',
  video: 'Vídeo',
  documento: 'Documento',
  figurinha: 'Figurinha',
  localizacao: 'Localização',
  contato: 'Contato compartilhado',
  outro: 'Mensagem sem texto',
}

const ENTREGA: Record<Mensagem['status_entrega'], { icone: NomeIcone; rotulo: string } | null> = {
  recebida: null,
  pendente: { icone: 'relogio', rotulo: 'Enviando' },
  enviada: { icone: 'check', rotulo: 'Enviada' },
  entregue: { icone: 'checkDuplo', rotulo: 'Entregue' },
  lida: { icone: 'checkDuplo', rotulo: 'Lida' },
  erro: { icone: 'erro', rotulo: 'Não enviada' },
}

function Conteudo({ m }: { m: Mensagem }) {
  if (m.tipo === 'texto') {
    return (
      <p className="break-words whitespace-pre-wrap">
        <TextoWhatsapp texto={m.texto ?? ''} />
      </p>
    )
  }

  if (m.tipo === 'audio') {
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-1 text-legenda font-medium opacity-80">
          <Icone nome="microfone" className="size-3.5" />
          {m.transcricao ? 'Áudio · transcrição' : 'Áudio'}
        </p>
        <p className="break-words whitespace-pre-wrap">
          {m.transcricao ?? <span className="italic opacity-80">Áudio sem transcrição.</span>}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-legenda font-medium opacity-80">
        <Icone nome="arquivo" className="size-3.5" />
        {MIDIA[m.tipo]}
      </p>
      {m.texto && (
        <p className="break-words whitespace-pre-wrap">
          <TextoWhatsapp texto={m.texto} />
        </p>
      )}
    </div>
  )
}

/**
 * Cliente à esquerda; agente e equipe à direita. Agente em verde suave com rótulo, equipe em verde
 * escuro — dá para saber quem falou sem depender só da cor.
 */
export function BalaoMensagem({ m, nomeAutor }: { m: Mensagem; nomeAutor?: string }) {
  if (m.autor_tipo === 'sistema') {
    return (
      <p className="mx-auto max-w-md rounded-full bg-slate-100 px-3 py-1 text-center text-legenda text-texto-3">
        {m.texto}
      </p>
    )
  }

  const saida = m.direcao === 'saida'
  const bot = m.autor_tipo === 'bot'
  const entrega = saida ? ENTREGA[m.status_entrega] : null
  const cor = !saida
    ? 'bg-superficie text-texto ring-1 ring-borda'
    : bot
      ? 'bg-primaria-suave text-texto ring-1 ring-verde-100'
      : 'bg-primaria text-white'

  return (
    <div className={`flex ${saida ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 sm:max-w-[70%] ${cor}`}>
        {saida && (
          <p className={`mb-0.5 flex items-center gap-1 text-legenda font-semibold ${bot ? 'text-primaria' : 'text-verde-100'}`}>
            {bot && <Icone nome="agente" className="size-3.5" />}
            {bot ? 'Agente' : (nomeAutor ?? 'Equipe')}
          </p>
        )}
        <Conteudo m={m} />
        <p
          className={`mt-1 flex items-center justify-end gap-1 text-legenda ${
            saida && !bot ? 'text-verde-100' : 'text-texto-3'
          }`}
        >
          <time dateTime={m.criado_em}>{hora(m.criado_em)}</time>
          {entrega && (
            <span className="inline-flex items-center gap-0.5" title={entrega.rotulo}>
              <Icone nome={entrega.icone} className="size-3.5" />
              <span className={m.status_entrega === 'erro' ? 'font-medium' : 'sr-only'}>{entrega.rotulo}</span>
            </span>
          )}
        </p>
        {m.status_entrega === 'erro' && m.erro && (
          <p className="mt-1 rounded-sm bg-erro-suave px-2 py-1 text-legenda text-erro">
            {m.erro}. O sistema tenta de novo automaticamente.
          </p>
        )}
      </div>
    </div>
  )
}
