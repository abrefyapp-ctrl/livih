import { useEffect, useMemo, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import {
  filtrarDocumentos,
  listarDocumentos,
  removerDocumento,
  tamanhoLegivel,
  TIPOS_SUGERIDOS,
  urlDocumento,
  type Documento,
} from '../services/documentos'
import { andamentoFotos, type AndamentoFotos } from '../services/fotosProdutos'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { EstadoVazio } from './EstadoVazio'
import { Icone } from './Icone'
import { ModalDocumento } from './ModalDocumento'
import { ModalFotosEmMassa } from './ModalFotosEmMassa'

/** Abre o arquivo numa aba nova com link assinado na hora (a aba abre no clique, senão o navegador bloqueia). */
async function abrir(path: string) {
  const aba = window.open('', '_blank')
  try {
    const url = await urlDocumento(path)
    if (aba) aba.location.href = url
    else window.location.href = url
  } catch {
    aba?.close()
  }
}

/**
 * Configurações → Documentos: os arquivos que o agente e a equipe enviam na conversa (vista explodida, manual,
 * catálogo...). Dono/admin cadastram; a equipe vê.
 */
export function SecaoDocumentos() {
  const { orgAtiva, modulos } = useSessao()
  const orgId = orgAtiva!.id
  const podeEditar = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [docs, setDocs] = useState<{ orgId: string; lista: Documento[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [editar, setEditar] = useState<{ atual: Documento | null } | null>(null)
  const [remover, setRemover] = useState<Documento | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [emMassa, setEmMassa] = useState(false)
  const [fotos, setFotos] = useState<AndamentoFotos | null>(null)
  const comProdutos = !!modulos?.has('erp')

  useEffect(() => {
    let ativo = true
    listarDocumentos(orgId)
      .then((lista) => ativo && (setDocs({ orgId, lista }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar os documentos.'))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  // Andamento da preparação das fotos para o reconhecimento: atualiza sozinho enquanto há foto na fila.
  useEffect(() => {
    if (!comProdutos) return
    let ativo = true
    let espera: ReturnType<typeof setTimeout> | undefined
    const buscar = () =>
      andamentoFotos(orgId)
        .then((a) => {
          if (!ativo) return
          setFotos(a)
          if (a.naFila) espera = setTimeout(buscar, 20000)
        })
        .catch(() => ativo && setFotos(null))
    void buscar()
    return () => {
      ativo = false
      clearTimeout(espera)
    }
  }, [orgId, versao, comProdutos])

  const lista = docs?.orgId === orgId ? docs.lista : null
  const tipos = useMemo(
    () => [...new Set([...(lista ?? []).map((d) => d.tipo).filter((t): t is string => !!t), ...TIPOS_SUGERIDOS])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [lista],
  )
  const tiposUsados = [...new Set((lista ?? []).map((d) => d.tipo).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const visiveis = lista ? filtrarDocumentos(lista, busca).filter((d) => !tipo || d.tipo === tipo) : []
  const ativos = lista?.filter((d) => d.ativo).length ?? 0

  async function confirmarRemocao() {
    if (!remover) return
    setSalvando(true)
    try {
      await removerDocumento(remover)
      setVersao((v) => v + 1)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
      setRemover(null)
    }
  }

  return (
    <section aria-labelledby="titulo-documentos" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-documentos" className="text-h2 font-semibold">
            Documentos
          </h2>
          <p className="max-w-xl text-pequeno text-texto-3">
            Arquivos que o agente e a equipe enviam na conversa: vista explodida, manual, catálogo, ficha técnica. O agente
            só envia o que está aqui e ativo; o resto ele passa para a equipe.
          </p>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            {comProdutos && (
              <Botao variante="secundario" icone="clipe" onClick={() => setEmMassa(true)}>
                Fotos em massa
              </Botao>
            )}
            <Botao icone="mais" onClick={() => setEditar({ atual: null })}>
              Novo documento
            </Botao>
          </div>
        )}
      </div>

      {!podeEditar && <Aviso>Só dono e admin cadastram documentos. Para enviar um, use o clipe na conversa.</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!lista ? (
        !erro && <p className="text-pequeno text-texto-3">Carregando…</p>
      ) : !lista.length ? (
        <div className="rounded-lg border border-borda bg-superficie">
          <EstadoVazio
            icone="arquivo"
            titulo="Nenhum documento ainda"
            acao={
              podeEditar && (
                <Botao icone="mais" onClick={() => setEditar({ atual: null })}>
                  Cadastrar o primeiro
                </Botao>
              )
            }
          >
            Comece pelos arquivos que os clientes mais pedem. Um título claro ("Vista explodida — grampeador 80/W-LS") ajuda
            o agente a achar.
          </EstadoVazio>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <label htmlFor="busca-documentos" className="sr-only">
              Buscar documento
            </label>
            <input
              id="busca-documentos"
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por título, produto ou palavra-chave"
              className="h-10 min-w-0 flex-1 rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
            {tiposUsados.length > 1 && (
              <>
                <label htmlFor="filtro-tipo" className="sr-only">
                  Tipo
                </label>
                <select
                  id="filtro-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="h-10 rounded-md border border-borda bg-superficie px-3 text-pequeno focus:border-primaria focus:outline-none"
                >
                  <option value="">Todos os tipos</option>
                  {tiposUsados.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          {!visiveis.length ? (
            <p className="py-6 text-center text-pequeno text-texto-3">Nenhum documento com esse filtro.</p>
          ) : (
            <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
              {visiveis.map((d) => (
                <li key={d.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
                  <Icone nome="arquivo" className="mt-0.5 size-5 shrink-0 text-texto-3" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {d.titulo}
                      {d.tipo && <span className="rounded-sm bg-fundo px-1.5 py-0.5 text-legenda font-normal text-texto-2 ring-1 ring-borda">{d.tipo}</span>}
                      {!d.ativo && (
                        <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-legenda font-normal text-texto-3">
                          Inativo — o agente não envia
                        </span>
                      )}
                    </p>
                    {d.descricao && <p className="mt-0.5 line-clamp-2 text-pequeno text-texto-3">{d.descricao}</p>}
                    <p className="mt-1 text-legenda text-texto-3">
                      {d.nome_arquivo} · {tamanhoLegivel(d.tamanho)}
                      {d.produtos.length > 0 && ` · ${d.produtos.map((p) => p.nome).join(', ')}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Botao tamanho="sm" variante="fantasma" onClick={() => void abrir(d.path)}>
                      Abrir
                    </Botao>
                    {podeEditar && (
                      <>
                        <Botao tamanho="sm" variante="secundario" onClick={() => setEditar({ atual: d })}>
                          Editar
                        </Botao>
                        <Botao tamanho="sm" variante="fantasma" icone="lixeira" onClick={() => setRemover(d)} aria-label={`Remover ${d.titulo}`} />
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-legenda text-texto-3">
            {ativos} {ativos === 1 ? 'documento ativo' : 'documentos ativos'}. Os documentos não pesam no custo do agente: ele
            só busca quando o cliente pede um arquivo.
          </p>
          {fotos && fotos.prontas + fotos.naFila + fotos.comErro > 0 && (
            <p className="text-legenda text-texto-3">
              Reconhecimento pela foto do cliente: {fotos.prontas} {fotos.prontas === 1 ? 'foto pronta' : 'fotos prontas'}
              {fotos.naFila > 0 && ` · ${fotos.naFila} sendo preparadas pela IA`}
              {fotos.comErro > 0 && (
                <span className="text-erro">
                  {' '}
                  · {fotos.comErro} com erro (foto grande demais ou arquivo ilegível: troque o arquivo no documento)
                </span>
              )}
              .
            </p>
          )}
        </>
      )}

      {editar && (
        <ModalDocumento
          orgId={orgId}
          atual={editar.atual}
          tipos={tipos}
          ligaProdutos={comProdutos}
          aoFechar={() => setEditar(null)}
          aoSalvar={() => (setEditar(null), setVersao((v) => v + 1))}
        />
      )}

      {comProdutos && podeEditar && (
        <ModalFotosEmMassa
          aberto={emMassa}
          orgId={orgId}
          existentes={lista ?? []}
          aoFechar={() => setEmMassa(false)}
          aoConcluir={() => setVersao((v) => v + 1)}
        />
      )}

      <DialogoConfirmacao
        aberto={!!remover}
        titulo="Remover documento?"
        rotuloConfirmar="Remover"
        perigo
        carregando={salvando}
        aoConfirmar={() => void confirmarRemocao()}
        aoCancelar={() => setRemover(null)}
      >
        “{remover?.titulo}” sai da biblioteca. As conversas em que ele já foi enviado continuam com o arquivo. Para só pausar,
        edite e desmarque “Ativo”.
      </DialogoConfirmacao>
    </section>
  )
}
