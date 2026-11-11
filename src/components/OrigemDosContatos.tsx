import { useEffect, useState, type FormEvent } from 'react'
import {
  listarRegrasOrigem,
  ORIGENS_SUGERIDAS,
  removerRegraOrigem,
  salvarRegraOrigem,
  type RegraOrigem,
} from '../services/origem'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'

// Origem do lead (migration 20261111140000, docs/equipes-origem-prospeccao.md entrega 3): a configuração fica na
// seção WhatsApp; a origem de cada número, na janela "Configurar" do número. Só dono e admin veem estes controles (o
// banco confere de novo).

export const ID_SUGESTOES_ORIGEM = 'origens-sugeridas'

/** Lista de sugestões dos campos de origem: uma só na seção (o id não pode repetir na página). */
export function SugestoesDeOrigem() {
  return (
    <datalist id={ID_SUGESTOES_ORIGEM}>
      {ORIGENS_SUGERIDAS.map((o) => (
        <option key={o} value={o} />
      ))}
    </datalist>
  )
}

const CLASSE_CAMPO = 'h-8 rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none'

/** Regras pela mensagem pronta: "se a primeira mensagem tiver este texto, a origem é esta". */
export function RegrasDeOrigem({ orgId }: { orgId: string }) {
  const [lidas, setLidas] = useState<{ orgId: string; regras: RegraOrigem[] } | null>(null)
  const [versao, setVersao] = useState(0)
  const [nova, setNova] = useState({ texto: '', origem: '' })
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarRegrasOrigem(orgId)
      .then((regras) => ativo && setLidas({ orgId, regras }))
      .catch(() => ativo && setErro('Não foi possível carregar as regras de origem.'))
    return () => {
      ativo = false
    }
  }, [orgId, versao])
  const regras = lidas?.orgId === orgId ? lidas.regras : null

  async function executar(chave: string, fn: () => Promise<unknown>) {
    setOcupado(chave)
    setErro(null)
    try {
      await fn()
      setVersao((v) => v + 1)
      return true
    } catch (err) {
      setErro((err as Error).message)
      return false
    } finally {
      setOcupado(null)
    }
  }

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    if (await executar('nova', () => salvarRegraOrigem(orgId, { id: null, ...nova }))) setNova({ texto: '', origem: '' })
  }

  // Fechada por padrão e acima da lista de números: configura-se uma vez, e no fim da lista (27 números na CEFEQ) ficava
  // longe de tudo (revisão de 11/11).
  return (
    <details className="group rounded-lg border border-borda bg-superficie">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <Icone nome="abaixo" className="size-4 shrink-0 -rotate-90 text-texto-3 transition-transform group-open:rotate-0" />
        <span className="font-semibold">Origem pela mensagem pronta</span>
        <span className="text-pequeno whitespace-nowrap text-texto-3">
          {!regras ? '' : regras.length === 0 ? '· nenhuma regra' : regras.length === 1 ? '· 1 regra' : `· ${regras.length} regras`}
        </span>
      </summary>
      <div className="space-y-3 border-t border-borda px-4 py-3">
        <p className="text-legenda text-texto-3">
          Quando o botão do site ou de um anúncio abre o WhatsApp com uma mensagem pronta, cadastre aqui um trecho dela.
          Quem chegar com esse texto entra com a origem escolhida, em qualquer número. A regra vale mais que a origem do
          número.
        </p>

        {regras && regras.length > 0 && (
          <ul className="divide-y divide-borda rounded-md border border-borda">
            {regras.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-pequeno">
                <span className="min-w-0 flex-1">
                  <span className="text-texto-3">Se tiver </span>
                  <span className="font-medium">“{r.texto}”</span>
                  <span className="text-texto-3"> → </span>
                  <span className="font-medium">{r.origem}</span>
                </span>
                <Botao
                  tamanho="sm"
                  variante="fantasma"
                  icone="lixeira"
                  aria-label={`Remover a regra “${r.texto}”`}
                  carregando={ocupado === r.id}
                  onClick={() => void executar(r.id, () => removerRegraOrigem(r.id))}
                />
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={adicionar} className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-pequeno text-texto-2">
            <span className="block">Se a primeira mensagem tiver</span>
            <input
              value={nova.texto}
              maxLength={100}
              placeholder="Ex.: Olá, vim pelo site"
              onChange={(e) => setNova({ ...nova, texto: e.target.value })}
              className={`${CLASSE_CAMPO} w-64`}
            />
          </label>
          <label className="space-y-1 text-pequeno text-texto-2">
            <span className="block">a origem é</span>
            <input
              list={ID_SUGESTOES_ORIGEM}
              value={nova.origem}
              maxLength={60}
              placeholder="Ex.: Site"
              onChange={(e) => setNova({ ...nova, origem: e.target.value })}
              className={`${CLASSE_CAMPO} w-40`}
            />
          </label>
          <Botao
            tamanho="sm"
            type="submit"
            icone="mais"
            carregando={ocupado === 'nova'}
            disabled={nova.texto.trim().length < 3 || !nova.origem.trim()}
          >
            Adicionar
          </Botao>
        </form>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </details>
  )
}
