import { useEffect, useState } from 'react'
import { urlArquivo, type Mensagem } from '../services/atendimento'
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

/** Arquivo guardado no Livih (enviado pela equipe): imagem e vídeo aparecem; o resto vira link de baixar. */
function Arquivo({ m, saida }: { m: Mensagem; saida: boolean }) {
  const [url, setUrl] = useState<{ path: string; url: string | null } | null>(null)
  useEffect(() => {
    let ativo = true
    urlArquivo(m.midia_path!)
      .then((u) => ativo && setUrl({ path: m.midia_path!, url: u }))
      .catch(() => ativo && setUrl({ path: m.midia_path!, url: null }))
    return () => {
      ativo = false
    }
  }, [m.midia_path])
  const link = url?.path === m.midia_path ? url.url : undefined
  const nome = m.midia_nome ?? 'arquivo'

  if (link && m.tipo === 'imagem')
    return (
      <a href={link} target="_blank" rel="noreferrer" className="block">
        <img src={link} alt={nome} className="max-h-64 rounded-md object-contain" />
      </a>
    )
  if (link && m.tipo === 'video') return <video src={link} controls preload="metadata" className="max-h-64 rounded-md" />

  return (
    <a
      href={link ?? undefined}
      target="_blank"
      rel="noreferrer"
      download={nome}
      aria-disabled={!link}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${saida ? 'bg-white/10 hover:bg-white/20' : 'bg-fundo hover:bg-slate-100'}`}
    >
      <Icone nome="arquivo" className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium">{nome}</span>
      <Icone nome="baixar" className="size-4 shrink-0 opacity-80" />
      <span className="sr-only">{link === null ? 'Arquivo indisponível' : 'Baixar'}</span>
    </a>
  )
}

function Conteudo({ m }: { m: Mensagem }) {
  if (m.midia_path) {
    return (
      <div className="space-y-1">
        <Arquivo m={m} saida={m.direcao === 'saida' && m.autor_tipo !== 'bot'} />
        {m.texto && (
          <p className="break-words whitespace-pre-wrap">
            <TextoWhatsapp texto={m.texto} />
          </p>
        )}
      </div>
    )
  }

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
            {m.modelo && <span className="font-normal opacity-90">· modelo</span>}
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
