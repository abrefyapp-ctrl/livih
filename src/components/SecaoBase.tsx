import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { listarBase, removerConteudo, salvarConteudo, type ConteudoBase } from '../services/configuracoes'
import { quandoCurto } from '../services/formato'
import { alertas, type Alerta } from '../services/saudeAgente'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { EstadoVazio } from './EstadoVazio'
import { Modal } from './Modal'

// Selo ao lado do item, com o alerta da Saúde do agente (o detalhe e o conserto ficam em Configurações → Agente).
const SELO: Record<Alerta['codigo'], string> = {
  A1: 'Parece catálogo',
  A2: 'Repete outro conteúdo',
  A3: 'Tem separadores',
  A4: 'Muito longo',
  A5: 'Trechos repetidos',
  A6: '',
}

type Edicao = { id: string | null; titulo: string; conteudo: string; ativo: boolean }

export function SecaoBase() {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const podeEditar = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [base, setBase] = useState<{ orgId: string; lista: ConteudoBase[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [remover, setRemover] = useState<ConteudoBase | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroEdicao, setErroEdicao] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarBase(orgId)
      .then((lista) => ativo && (setBase({ orgId, lista }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar a base de conhecimento.'))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  const lista = base?.orgId === orgId ? base.lista : null
  const ativos = lista?.filter((c) => c.ativo) ?? []
  const totalCaracteres = ativos.reduce((s, c) => s + c.conteudo.length, 0)
  const selos = new Map<string, string[]>()
  for (const a of lista ? alertas(null, lista) : []) {
    if (a.alvo?.tipo !== 'base' || !SELO[a.codigo]) continue
    const atuais = selos.get(a.alvo.id) ?? []
    if (!atuais.includes(SELO[a.codigo])) selos.set(a.alvo.id, [...atuais, SELO[a.codigo]])
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!edicao) return
    setSalvando(true)
    setErroEdicao(null)
    try {
      await salvarConteudo(orgId, edicao.id, {
        titulo: edicao.titulo.trim(),
        conteudo: edicao.conteudo.trim(),
        ativo: edicao.ativo,
      })
      setEdicao(null)
      setVersao((v) => v + 1)
    } catch (err) {
      setErroEdicao((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function confirmarRemocao() {
    if (!remover) return
    setSalvando(true)
    try {
      await removerConteudo(remover.id)
      setVersao((v) => v + 1)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
      setRemover(null)
    }
  }

  return (
    <section aria-labelledby="titulo-base" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-base" className="text-h2 font-semibold">
            Base de conhecimento
          </h2>
          <p className="max-w-xl text-pequeno text-texto-3">
            O que o agente consulta para responder: serviços, preços, prazos, perguntas frequentes. Só os conteúdos
            ativos entram.
          </p>
        </div>
        {podeEditar && (
          <Botao icone="mais" onClick={() => setEdicao({ id: null, titulo: '', conteudo: '', ativo: true })}>
            Novo conteúdo
          </Botao>
        )}
      </div>

      {!podeEditar && <Aviso>Só dono e admin alteram a base de conhecimento.</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!lista ? (
        <p className="text-pequeno text-texto-3">Carregando…</p>
      ) : !lista.length ? (
        <div className="rounded-lg border border-borda bg-superficie">
          <EstadoVazio
            icone="livro"
            titulo="A base está vazia"
            acao={
              podeEditar && (
                <Botao icone="mais" onClick={() => setEdicao({ id: null, titulo: '', conteudo: '', ativo: true })}>
                  Escrever o primeiro conteúdo
                </Botao>
              )
            }
          >
            Sem base, o agente só sabe o que está nas instruções dele.
          </EstadoVazio>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
            {lista.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {c.titulo}
                    {!c.ativo && (
                      <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-legenda font-normal text-texto-3">
                        Inativo — o agente não lê
                      </span>
                    )}
                    {selos.get(c.id)?.map((s) => (
                      <span key={s} className="rounded-sm bg-atencao-suave px-1.5 py-0.5 text-legenda font-normal text-atencao">
                        {s}
                      </span>
                    ))}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-pequeno text-texto-3">{c.conteudo}</p>
                  <p className="mt-1 text-legenda text-texto-3">
                    {c.conteudo.length.toLocaleString('pt-BR')} caracteres · atualizado {quandoCurto(c.atualizado_em).toLowerCase()}
                  </p>
                </div>
                {podeEditar && (
                  <div className="flex gap-1">
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      onClick={() => setEdicao({ id: c.id, titulo: c.titulo, conteudo: c.conteudo, ativo: c.ativo })}
                    >
                      Editar
                    </Botao>
                    <Botao tamanho="sm" variante="fantasma" icone="lixeira" onClick={() => setRemover(c)} aria-label={`Remover ${c.titulo}`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="text-legenda text-texto-3">
            {ativos.length} {ativos.length === 1 ? 'conteúdo ativo' : 'conteúdos ativos'} ·{' '}
            {totalCaracteres.toLocaleString('pt-BR')} caracteres que o agente lê a cada mensagem.
            {totalCaracteres > 30000 && ' Uma base muito grande deixa as respostas mais lentas e caras.'}
            {podeEditar && (
              <>
                {' '}
                <Link to="/configuracoes/agente" className="font-medium text-primaria underline">
                  Ver a Saúde do agente
                </Link>
                {selos.size > 0 && ` (${selos.size} ${selos.size === 1 ? 'conteúdo com alerta' : 'conteúdos com alerta'})`}.
              </>
            )}
          </p>
        </>
      )}

      <Modal
        aberto={!!edicao}
        titulo={edicao?.id ? 'Editar conteúdo' : 'Novo conteúdo'}
        aoFechar={() => (setEdicao(null), setErroEdicao(null))}
        largura="max-w-2xl"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setEdicao(null)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao
              type="submit"
              form="form-base"
              carregando={salvando}
              disabled={!edicao?.titulo.trim() || !edicao?.conteudo.trim()}
            >
              Salvar conteúdo
            </Botao>
          </>
        }
      >
        {edicao && (
          <form id="form-base" onSubmit={salvar} className="space-y-4">
            {erroEdicao && <Aviso tom="erro">{erroEdicao}</Aviso>}
            <CampoTexto
              rotulo="Título"
              required
              value={edicao.titulo}
              onChange={(e) => setEdicao({ ...edicao, titulo: e.target.value })}
              placeholder="Ex.: Planos e preços"
            />
            <div className="space-y-1.5">
              <label htmlFor="conteudo-base" className="block text-pequeno font-medium text-texto-2">
                Conteúdo
              </label>
              <textarea
                id="conteudo-base"
                required
                value={edicao.conteudo}
                onChange={(e) => setEdicao({ ...edicao, conteudo: e.target.value })}
                rows={14}
                className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno leading-relaxed focus:border-primaria focus:outline-none"
              />
              <p className="text-legenda text-texto-3">Escreva como explicaria para alguém novo na equipe. Listas e tópicos funcionam bem.</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2">
              <input
                type="checkbox"
                checked={edicao.ativo}
                onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })}
                className="size-4 accent-primaria"
              />
              Ativo (o agente lê este conteúdo)
            </label>
          </form>
        )}
      </Modal>

      <DialogoConfirmacao
        aberto={!!remover}
        titulo="Remover conteúdo?"
        rotuloConfirmar="Remover"
        perigo
        carregando={salvando}
        aoConfirmar={() => void confirmarRemocao()}
        aoCancelar={() => setRemover(null)}
      >
        “{remover?.titulo}” sai da base e o agente deixa de usar. Para só pausar, edite e desmarque “Ativo”.
      </DialogoConfirmacao>
    </section>
  )
}
