import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { buscarConversa, listarNumerosVisiveis, type EstadoConversa } from '../services/atendimento'
import { useConversas } from '../hooks/useConversas'
import { useSessao } from '../hooks/useSessao'
import { ListaConversas } from '../components/ListaConversas'
import { ehAba } from '../services/abas'
import { PainelConversa } from '../components/PainelConversa'
import { PainelContato } from '../components/PainelContato'
import { EstadoVazio } from '../components/EstadoVazio'
import { Icone } from '../components/Icone'

/**
 * ≥1280: lista + conversa + contato. 768–1279: lista + conversa (contato em gaveta).
 * <768: lista OU conversa — a conversa tem rota própria e botão de voltar.
 */
export function Conversas() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { orgAtiva } = useSessao()
  const parametro = params.get('aba')
  const aba: EstadoConversa = ehAba(parametro) ? parametro : 'aguardando_humano'
  const numero = params.get('numero') ?? undefined
  const { conversas, contagem, carregando, erro, recarregar } = useConversas(orgAtiva?.id, aba, numero)
  const [numeros, setNumeros] = useState<{ orgId: string; lista: { id: string; nome: string }[] } | null>(null)
  const orgId = orgAtiva?.id
  useEffect(() => {
    if (!orgId) return
    let ativo = true
    listarNumerosVisiveis(orgId)
      .then((lista) => ativo && setNumeros({ orgId, lista }))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId])
  const listaNumeros = numeros !== null && numeros.orgId === orgId ? numeros.lista : []
  // Troca um filtro na URL mantendo os outros (aba e número andam juntos).
  const trocarFiltro = (chave: 'aba' | 'numero', valor: string | undefined, substituir = false) =>
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual)
        if (valor) novo.set(chave, valor)
        else novo.delete(chave)
        return novo
      },
      { replace: substituir },
    )
  const [contatoAberto, setContatoAberto] = useState(() => window.matchMedia('(min-width: 1280px)').matches)

  // Sem aba escolhida e ninguém aguardando: abre onde há trabalho.
  useEffect(() => {
    if (parametro || carregando || contagem.aguardando_humano > 0) return
    const proxima = contagem.humano > 0 ? 'humano' : contagem.bot > 0 ? 'bot' : null
    if (proxima)
      setParams(
        (atual) => {
          const novo = new URLSearchParams(atual)
          novo.set('aba', proxima)
          return novo
        },
        { replace: true },
      )
  }, [parametro, carregando, contagem, setParams])

  const voltarPara = `/conversas?${new URLSearchParams({ aba, ...(numero ? { numero } : {}) })}`

  return (
    <div className="flex h-full min-h-0">
      <div className={`h-full w-full shrink-0 border-r border-borda md:w-80 lg:w-96 ${id ? 'hidden md:block' : ''}`}>
        <ListaConversas
          aba={aba}
          aoTrocarAba={(a) => trocarFiltro('aba', a)}
          numeros={listaNumeros}
          numero={numero}
          aoTrocarNumero={(n) => trocarFiltro('numero', n)}
          conversas={conversas}
          contagem={contagem}
          carregando={carregando}
          erro={erro}
          aoTentarDeNovo={recarregar}
          selecionada={id}
        />
      </div>

      <div className={`min-w-0 flex-1 ${id ? '' : 'hidden md:block'}`}>
        {id ? (
          <PainelConversa
            key={id}
            conversaId={id}
            voltarPara={voltarPara}
            contatoAberto={contatoAberto}
            aoAlternarContato={() => setContatoAberto((v) => !v)}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-fundo">
            <EstadoVazio icone="conversas" titulo="Escolha uma conversa">
              As que precisam de você estão na aba Aguardando.
            </EstadoVazio>
          </div>
        )}
      </div>

      {id && contatoAberto && (
        <>
          {/* gaveta sobre o conteúdo abaixo de 1280px; coluna fixa acima */}
          <button
            aria-label="Fechar dados do contato"
            onClick={() => setContatoAberto(false)}
            className="fixed inset-0 z-30 bg-navy-900/30 xl:hidden"
          />
          <aside
            aria-label="Dados do contato"
            className="fixed inset-y-0 right-0 z-40 w-80 max-w-full overflow-y-auto border-l border-borda bg-superficie shadow-xl xl:static xl:z-auto xl:shadow-none"
          >
            <div className="flex justify-end p-2 xl:hidden">
              <button
                onClick={() => setContatoAberto(false)}
                aria-label="Fechar dados do contato"
                className="rounded-md p-2 text-texto-2 hover:bg-fundo"
              >
                <Icone nome="fechar" />
              </button>
            </div>
            <ContatoDaConversa key={id} conversaId={id} />
          </aside>
        </>
      )}
    </div>
  )
}

function ContatoDaConversa({ conversaId }: { conversaId: string }) {
  const [contatoId, setContatoId] = useState<string | null>(null)
  useEffect(() => {
    let ativo = true
    buscarConversa(conversaId)
      .then((c) => ativo && setContatoId(c?.contato?.id ?? null))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [conversaId])
  if (!contatoId) return <p className="p-5 text-pequeno text-texto-3">Carregando contato…</p>
  return <PainelContato contatoId={contatoId} conversaId={conversaId} />
}
