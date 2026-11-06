import { useCallback, useEffect, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import {
  apagarRespostaRapida,
  listarRespostasRapidas,
  normalizarAtalho,
  salvarRespostaRapida,
  type RespostaRapida,
} from '../services/respostasRapidas'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { EstadoVazio } from './EstadoVazio'
import { Modal } from './Modal'

type Edicao = { id?: string; daEmpresa: boolean; atalho: string; texto: string }

/**
 * Configurações → Respostas rápidas: mensagens prontas que a equipe chama com "/" na conversa. As da empresa servem a
 * todos e só dono e admin editam; as pessoais, cada um cria as suas e só ele vê.
 */
export function SecaoRespostas() {
  const { orgAtiva, sessao } = useSessao()
  const orgId = orgAtiva?.id
  const eu = sessao?.user.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [lista, setLista] = useState<RespostaRapida[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [apagar, setApagar] = useState<RespostaRapida | null>(null)
  const [apagando, setApagando] = useState(false)

  const carregar = useCallback(() => {
    if (!orgId) return
    listarRespostasRapidas(orgId)
      .then((l) => {
        setLista(l)
        setErro(null)
      })
      .catch(() => setErro('Não foi possível carregar as respostas. Recarregue a página.'))
  }, [orgId])
  useEffect(carregar, [carregar])

  async function confirmarApagar() {
    if (!apagar) return
    setApagando(true)
    try {
      await apagarRespostaRapida(apagar.id)
      setApagar(null)
      carregar()
    } catch (e) {
      setErro((e as Error).message)
      setApagar(null)
    } finally {
      setApagando(false)
    }
  }

  const daEmpresa = lista?.filter((r) => r.usuario_id === null) ?? []
  const minhas = lista?.filter((r) => r.usuario_id !== null) ?? []

  function grupo(titulo: string, explicacao: string, itens: RespostaRapida[], editavel: boolean, vazio: string) {
    return (
      <div className="space-y-2">
        <div>
          <h3 className="font-semibold">{titulo}</h3>
          <p className="text-pequeno text-texto-3">{explicacao}</p>
        </div>
        {!itens.length ? (
          <p className="rounded-md border border-dashed border-borda px-3 py-3 text-pequeno text-texto-3">{vazio}</p>
        ) : (
          <ul className="divide-y divide-borda rounded-md border border-borda bg-superficie">
            {itens.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-pequeno font-medium">/{r.atalho}</p>
                  <p className="line-clamp-3 text-pequeno whitespace-pre-line text-texto-2">{r.texto}</p>
                </div>
                {editavel && (
                  <div className="flex shrink-0 gap-1">
                    <Botao
                      variante="fantasma"
                      tamanho="sm"
                      onClick={() => setEdicao({ id: r.id, daEmpresa: r.usuario_id === null, atalho: r.atalho, texto: r.texto })}
                    >
                      Editar
                    </Botao>
                    <Botao variante="fantasma" tamanho="sm" icone="lixeira" onClick={() => setApagar(r)}>
                      <span className="sr-only">Apagar /{r.atalho}</span>
                    </Botao>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-h2 font-semibold">Respostas rápidas</h2>
          <p className="mt-1 max-w-2xl text-pequeno text-texto-3">
            Mensagens prontas para o que a equipe responde todo dia: chave Pix, prazo de entrega, endereço. Na conversa, digite
            “/” e o atalho, ou toque no raio ao lado da caixa. A resposta entra no texto para você revisar antes de enviar.
          </p>
        </div>
        <Botao icone="mais" onClick={() => setEdicao({ daEmpresa: gerencia, atalho: '', texto: '' })} disabled={!lista}>
          Nova resposta
        </Botao>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!lista ? (
        !erro && <p className="text-pequeno text-texto-3">Carregando…</p>
      ) : !lista.length ? (
        <EstadoVazio
          icone="raio"
          titulo="Nenhuma resposta rápida ainda"
          acao={
            <Botao icone="mais" onClick={() => setEdicao({ daEmpresa: gerencia, atalho: '', texto: '' })}>
              Criar a primeira
            </Botao>
          }
        >
          Ex.: atalho <strong>pix</strong> com “Oi {'{nome}'}, a chave Pix é o nosso CNPJ: …”.
        </EstadoVazio>
      ) : (
        <>
          {grupo(
            'Da empresa',
            gerencia ? 'Toda a equipe usa. Só dono e admin criam e editam.' : 'Toda a equipe usa. Quem cria e edita é o dono ou o admin.',
            daEmpresa,
            gerencia,
            gerencia ? 'Nenhuma ainda. Crie as que toda a equipe deve usar igual.' : 'Nenhuma ainda.',
          )}
          {grupo('Minhas', 'Só você vê e usa.', minhas, true, 'Nenhuma ainda. Crie as suas, do seu jeito de escrever.')}
        </>
      )}

      {edicao && orgId && eu && (
        <ModalResposta
          orgId={orgId}
          eu={eu}
          gerencia={gerencia}
          inicial={edicao}
          aoFechar={() => setEdicao(null)}
          aoSalvar={() => {
            setEdicao(null)
            carregar()
          }}
        />
      )}

      <DialogoConfirmacao
        aberto={!!apagar}
        titulo="Apagar resposta?"
        rotuloConfirmar="Apagar"
        perigo
        carregando={apagando}
        aoConfirmar={() => void confirmarApagar()}
        aoCancelar={() => setApagar(null)}
      >
        A resposta /{apagar?.atalho} sai da lista{apagar?.usuario_id === null ? ' de toda a equipe' : ''}. As mensagens já enviadas
        não mudam.
      </DialogoConfirmacao>
    </section>
  )
}

function ModalResposta({
  orgId,
  eu,
  gerencia,
  inicial,
  aoFechar,
  aoSalvar,
}: {
  orgId: string
  eu: string
  gerencia: boolean
  inicial: Edicao
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [e, setE] = useState(inicial)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    if (!e.atalho) return setErro('Dê um atalho à resposta, ex.: pix.')
    if (!e.texto.trim()) return setErro('Escreva o texto da resposta.')
    setSalvando(true)
    setErro(null)
    try {
      await salvarRespostaRapida(orgId, { id: e.id, usuario_id: e.daEmpresa ? null : eu, atalho: e.atalho, texto: e.texto })
      aoSalvar()
    } catch (x) {
      setErro((x as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo={e.id ? 'Editar resposta' : 'Nova resposta'}
      aoFechar={aoFechar}
      largura="max-w-xl"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao onClick={() => void salvar()} carregando={salvando}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <CampoTexto
          rotulo="Atalho"
          value={e.atalho}
          maxLength={30}
          onChange={(x) => setE({ ...e, atalho: normalizarAtalho(x.target.value) })}
          placeholder="pix"
          ajuda={`Na conversa, digite /${e.atalho || 'pix'}. Só letras minúsculas, números, - e _.`}
          autoFocus
        />
        <div className="space-y-1">
          <label htmlFor="resposta-texto" className="block text-pequeno font-medium text-texto-2">
            Texto
          </label>
          <textarea
            id="resposta-texto"
            value={e.texto}
            maxLength={4096}
            rows={6}
            onChange={(x) => setE({ ...e, texto: x.target.value })}
            placeholder="Oi {nome}, a chave Pix é o nosso CNPJ: 00.000.000/0001-00."
            className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
          <p className="text-legenda text-texto-3">
            Use {'{nome}'} para o primeiro nome do cliente. Negrito e itálico como no WhatsApp: *negrito*, _itálico_.
          </p>
        </div>
        {gerencia && !e.id && (
          <fieldset className="space-y-1.5">
            <legend className="text-pequeno font-medium">Quem usa</legend>
            <label className="flex cursor-pointer items-center gap-2 text-pequeno">
              <input type="radio" name="quem" checked={e.daEmpresa} onChange={() => setE({ ...e, daEmpresa: true })} className="accent-primaria" />
              Toda a equipe
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-pequeno">
              <input type="radio" name="quem" checked={!e.daEmpresa} onChange={() => setE({ ...e, daEmpresa: false })} className="accent-primaria" />
              Só eu
            </label>
          </fieldset>
        )}
      </div>
    </Modal>
  )
}
