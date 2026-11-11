import { useEffect, useState, type FormEvent } from 'react'
import {
  definirOrigemDoNumero,
  listarRegrasOrigem,
  ORIGENS_SUGERIDAS,
  removerRegraOrigem,
  salvarRegraOrigem,
  type RegraOrigem,
} from '../services/origem'
import { Aviso } from './Aviso'
import { Botao } from './Botao'

// Origem do lead (migration 20261111140000, docs/equipes-origem-prospeccao.md entrega 3): a configuração fica na
// seção WhatsApp, junto dos números. Só dono e admin veem estes controles (o banco confere de novo).

const ID_SUGESTOES = 'origens-sugeridas'

/** Lista de sugestões dos campos de origem: uma só na seção (o id não pode repetir na página). */
export function SugestoesDeOrigem() {
  return (
    <datalist id={ID_SUGESTOES}>
      {ORIGENS_SUGERIDAS.map((o) => (
        <option key={o} value={o} />
      ))}
    </datalist>
  )
}

const CLASSE_CAMPO = 'h-8 rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none'

/** Origem de quem escreve neste número (ex.: o número do Google Ads). */
export function OrigemDoNumero({ canalId, origem, aoSalvar }: { canalId: string; origem: string; aoSalvar: () => void }) {
  const [texto, setTexto] = useState(origem)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const mudou = texto.trim() !== origem

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro(null)
    try {
      await definirOrigemDoNumero(canalId, texto)
      aoSalvar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-1.5">
      <label htmlFor={`origem-${canalId}`} className="block text-pequeno font-medium text-texto">
        Origem dos contatos deste número
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`origem-${canalId}`}
          list={ID_SUGESTOES}
          value={texto}
          maxLength={60}
          placeholder="Ex.: Google Ads"
          onChange={(e) => setTexto(e.target.value)}
          className={`${CLASSE_CAMPO} w-56`}
        />
        {mudou && (
          <Botao tamanho="sm" type="submit" carregando={salvando}>
            Salvar
          </Botao>
        )}
      </div>
      <p className="text-legenda text-texto-3">
        Quem escrever neste número depois de 30 dias sem falar com a empresa entra com esta origem no Painel. Deixe em
        branco se o número não tem uma origem só.
      </p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </form>
  )
}

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

  return (
    <section aria-labelledby="titulo-regras-origem" className="space-y-3 rounded-lg border border-borda bg-superficie p-4">
      <div>
        <h3 id="titulo-regras-origem" className="font-semibold">
          Origem pela mensagem pronta
        </h3>
        <p className="text-legenda text-texto-3">
          Quando o botão do site ou de um anúncio abre o WhatsApp com uma mensagem pronta, cadastre aqui um trecho dela.
          Quem chegar com esse texto entra com a origem escolhida, em qualquer número. A regra vale mais que a origem do
          número.
        </p>
      </div>

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
            list={ID_SUGESTOES}
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
    </section>
  )
}
