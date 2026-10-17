import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { enviarDocumento, filtrarDocumentos, listarDocumentos, tamanhoLegivel, urlDocumento, type Documento } from '../services/documentos'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'

/** Na conversa: escolhe um documento da biblioteca e envia (o título vai como legenda). */
export function ModalBiblioteca({ aberto, conversaId, aoFechar }: { aberto: boolean; conversaId: string; aoFechar: () => void }) {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [docs, setDocs] = useState<{ orgId: string; lista: Documento[] } | null>(null)
  const [busca, setBusca] = useState('')
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    let ativo = true
    listarDocumentos(orgId)
      .then((lista) => ativo && setDocs({ orgId, lista: lista.filter((d) => d.ativo) }))
      .catch(() => ativo && setErro('Não foi possível carregar os documentos.'))
    return () => {
      ativo = false
    }
  }, [aberto, orgId])

  const lista = docs?.orgId === orgId ? docs.lista : null
  const visiveis = lista ? filtrarDocumentos(lista, busca) : []

  function fechar() {
    setBusca('')
    setErro(null)
    aoFechar()
  }

  async function enviar(d: Documento) {
    setEnviando(d.id)
    setErro(null)
    try {
      await enviarDocumento(orgId, conversaId, d)
      fechar()
    } catch {
      setErro(`“${d.titulo}” não foi enviado. Confira a conexão e tente de novo.`)
    } finally {
      setEnviando(null)
    }
  }

  async function abrir(d: Documento) {
    const aba = window.open('', '_blank')
    try {
      const url = await urlDocumento(d.path)
      if (aba) aba.location.href = url
    } catch {
      aba?.close()
    }
  }

  return (
    <Modal aberto={aberto} titulo="Enviar da biblioteca" aoFechar={fechar} largura="max-w-xl">
      <div className="space-y-3">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {!lista ? (
          !erro && <p className="text-pequeno text-texto-3">Carregando…</p>
        ) : !lista.length ? (
          <p className="text-pequeno text-texto-2">
            A biblioteca está vazia.{' '}
            {gerencia ? (
              <Link to="/configuracoes/documentos" onClick={fechar} className="font-medium text-primaria underline">
                Cadastre os documentos que vocês mais enviam
              </Link>
            ) : (
              'Peça ao dono ou a um admin para cadastrar os documentos que vocês mais enviam.'
            )}
          </p>
        ) : (
          <>
            <label htmlFor="busca-biblioteca" className="sr-only">
              Buscar documento
            </label>
            <input
              id="busca-biblioteca"
              type="search"
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título, produto ou palavra-chave"
              className="h-10 w-full rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
            {!visiveis.length ? (
              <p className="py-4 text-center text-pequeno text-texto-3">Nenhum documento com essa busca.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-borda overflow-y-auto rounded-md border border-borda">
                {visiveis.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Icone nome="arquivo" className="size-5 shrink-0 text-texto-3" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-pequeno font-medium">{d.titulo}</p>
                      <p className="truncate text-legenda text-texto-3">
                        {[d.tipo, tamanhoLegivel(d.tamanho), d.produtos.map((p) => p.nome).join(', ')].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Botao tamanho="sm" variante="fantasma" onClick={() => void abrir(d)}>
                      Abrir
                    </Botao>
                    <Botao tamanho="sm" icone="enviar" carregando={enviando === d.id} disabled={!!enviando} onClick={() => void enviar(d)}>
                      Enviar
                    </Botao>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-legenda text-texto-3">Ao enviar, você assume a conversa, como em qualquer mensagem.</p>
          </>
        )}
      </div>
    </Modal>
  )
}
