import { useMemo, useRef, useState } from 'react'
import type { Produto } from '../services/erp'
import { formatarCnpj, lerNumero, moeda, quantidade } from '../services/formato'
import {
  ACEITOS_NOTA,
  lancarNota,
  lerNota,
  notaJaLancada,
  parecidos,
  sugerirDestino,
  vinculosDoFornecedor,
  type Destino,
  type ItemNota,
  type NotaLida,
} from '../services/notasEntrada'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'

const CLASSE_CAMPO =
  'block h-9 w-full rounded-md border border-borda bg-superficie px-2.5 text-pequeno placeholder:text-texto-3 focus:border-primaria focus:outline-none'

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const dataBr = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR')

const ORIGEM_SUGESTAO: Record<string, string> = {
  vinculo: 'ligado numa nota anterior deste fornecedor',
  codigo: 'mesmo código no cadastro',
  nome: 'mesmo nome no cadastro',
  escolha: 'escolhido por você',
}

export type ResumoNota = { numero: string | null; itens: number; criados: number }

/**
 * Produtos → Entrada por nota: XML, PDF ou foto da nota do fornecedor. Cada item é ligado a um produto do cadastro
 * (o vínculo fica salvo por fornecedor) ou vira produto novo sem preço; a quantidade (× fator) entra no estoque.
 */
export function ModalEntradaNota({
  orgId,
  produtos,
  aoFechar,
  aoConcluir,
}: {
  orgId: string
  produtos: Produto[]
  aoFechar: () => void
  aoConcluir: (r: ResumoNota) => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [lendo, setLendo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [lida, setLida] = useState<{ nota: NotaLida; path: string; jaLancada: string | null } | null>(null)
  const [destinos, setDestinos] = useState<Destino[]>([])
  const [qtds, setQtds] = useState<string[]>([])
  const [lancando, setLancando] = useState(false)

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id!, p])), [produtos])
  const porCodigo = useMemo(() => new Map(produtos.filter((p) => p.codigo).map((p) => [p.codigo!.toLowerCase(), p])), [produtos])

  async function abrir(f: File | undefined) {
    if (entrada.current) entrada.current.value = ''
    if (!f) return
    setErro(null)
    setLendo(f.name.toLowerCase().endsWith('.xml') ? 'Lendo o XML…' : 'A IA está lendo a nota… (leva até 1 minuto)')
    try {
      const { nota, path } = await lerNota(orgId, f)
      if (!nota.itens.length) throw new Error('Não encontrei itens nesta nota.')
      const [vinculos, jaLancada] = await Promise.all([
        nota.emitente_cnpj ? vinculosDoFornecedor(orgId, nota.emitente_cnpj) : Promise.resolve([]),
        nota.chave ? notaJaLancada(orgId, nota.chave) : Promise.resolve(null),
      ])
      const mapaV = new Map(vinculos.filter((v) => porId.has(v.produto_id)).map((v) => [v.codigo_fornecedor.toLowerCase(), v]))
      const porNome = new Map(produtos.map((p) => [normal(p.nome ?? ''), p]))
      setDestinos(nota.itens.map((i) => sugerirDestino(i, mapaV, porCodigo, porNome)))
      setQtds(nota.itens.map((i) => (i.quantidade == null ? '' : String(i.quantidade).replace('.', ','))))
      setLida({ nota, path, jaLancada })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setLendo(null)
    }
  }

  const mudar = (i: number, d: Destino) => setDestinos((ds) => ds.map((x, k) => (k === i ? d : x)))

  // Validação: quantidade > 0, produto novo com nome e código livre (nem no cadastro nem repetido entre os novos).
  const problemas = useMemo(() => {
    const p: (string | null)[] = destinos.map(() => null)
    const codigosNovos = new Map<string, number>()
    destinos.forEach((d, i) => {
      if (d.tipo === 'ignorar') return
      const q = lerNumero(qtds[i] ?? '')
      if (!q || q <= 0) p[i] = 'Informe a quantidade.'
      else if (d.tipo === 'produto' && !(d.fator > 0)) p[i] = 'O fator precisa ser maior que zero.'
      else if (d.tipo === 'novo') {
        const c = d.codigo.trim().toLowerCase()
        if (!d.nome.trim()) p[i] = 'Dê um nome ao produto novo.'
        else if (c && porCodigo.has(c)) p[i] = `O código ${d.codigo} já é de outro produto: ligue a ele ou troque o código.`
        else if (c && codigosNovos.has(c)) p[i] = `O código ${d.codigo} se repete em outro produto novo desta nota.`
        if (c) codigosNovos.set(c, i)
      }
    })
    return p
  }, [destinos, qtds, porCodigo])

  const ativos = destinos.filter((d) => d.tipo !== 'ignorar').length
  const novos = destinos.filter((d) => d.tipo === 'novo').length
  const invalido = problemas.some(Boolean)

  async function lancar() {
    if (!lida || invalido || !ativos) return
    setLancando(true)
    setErro(null)
    try {
      const itens = lida.nota.itens.map((item, i) => ({ item: { ...item, quantidade: lerNumero(qtds[i] ?? '') ?? null }, destino: destinos[i] }))
      const r = await lancarNota(orgId, lida.nota, lida.path, itens)
      aoConcluir({ numero: lida.nota.numero, itens: r.itens, criados: r.criados })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setLancando(false)
    }
  }

  const n = lida?.nota
  return (
    <Modal
      aberto
      titulo="Entrada por nota fiscal"
      largura={lida ? 'max-w-2xl' : 'max-w-md'}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={lancando}>
            Cancelar
          </Botao>
          {lida && (
            <Botao onClick={() => void lancar()} carregando={lancando} disabled={!!lida.jaLancada || invalido || !ativos}>
              Lançar {ativos} {ativos === 1 ? 'item' : 'itens'} no estoque
            </Botao>
          )}
        </>
      }
    >
      <input ref={entrada} type="file" accept={ACEITOS_NOTA} className="hidden" onChange={(e) => void abrir(e.target.files?.[0])} />
      {!lida ? (
        <div className="space-y-4">
          <p className="text-pequeno text-texto-2">
            Envie a nota do fornecedor. O XML é lido na hora; PDF (DANFE) e foto passam pela IA. Antes de lançar, você confere
            cada item: os que já existem no cadastro somam ao estoque e os que não existem viram produtos novos, sem preço de
            venda.
          </p>
          <Botao icone="arquivo" onClick={() => entrada.current?.click()} carregando={!!lendo}>
            {lendo ?? 'Escolher XML, PDF ou foto'}
          </Botao>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md border border-borda bg-fundo p-3 text-pequeno">
            <p className="font-semibold">{n!.emitente_nome ?? 'Fornecedor não identificado'}</p>
            <p className="text-texto-2">
              {[
                n!.emitente_cnpj && `CNPJ ${formatarCnpj(n!.emitente_cnpj)}`,
                `NF ${n!.numero ?? 's/n'}${n!.serie ? ` série ${n!.serie}` : ''}`,
                n!.emissao && `emitida em ${dataBr(n!.emissao)}`,
                n!.valor_total != null && `total ${moeda(n!.valor_total, true)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {lida.jaLancada && <Aviso tom="erro">Esta nota já foi lançada em {dataBr(lida.jaLancada)}. Lançar de novo duplicaria o estoque.</Aviso>}
          {n!.origem !== 'xml' && (
            <Aviso tom="atencao">
              Lida pela IA a partir {n!.origem === 'pdf' ? 'do PDF' : 'da foto'}: confira quantidades e códigos antes de lançar.
              {!n!.chave && ' A chave de acesso não ficou legível; a nota é identificada pelo fornecedor e número.'}
            </Aviso>
          )}
          <p className="text-pequeno text-texto-2">
            {n!.itens.length} {n!.itens.length === 1 ? 'item' : 'itens'}: {ativos - novos} ligados a produtos do cadastro, {novos}{' '}
            {novos === 1 ? 'produto novo' : 'produtos novos'} (entram sem preço de venda)
            {destinos.length - ativos > 0 && `, ${destinos.length - ativos} fora do lançamento`}. Confira se algum produto novo já
            existe no cadastro: ligar a ele evita produto repetido, e a próxima nota deste fornecedor já vem ligada.
          </p>

          <ul className="divide-y divide-borda rounded-md border border-borda">
            {n!.itens.map((item, i) => (
              <LinhaItem
                key={i}
                item={item}
                destino={destinos[i]}
                qtd={qtds[i] ?? ''}
                problema={problemas[i]}
                produtos={produtos}
                porId={porId}
                aoMudar={(d) => mudar(i, d)}
                aoMudarQtd={(q) => setQtds((qs) => qs.map((x, k) => (k === i ? q : x)))}
              />
            ))}
          </ul>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </div>
      )}
    </Modal>
  )
}

function LinhaItem({
  item,
  destino,
  qtd,
  problema,
  produtos,
  porId,
  aoMudar,
  aoMudarQtd,
}: {
  item: ItemNota
  destino: Destino
  qtd: string
  problema: string | null
  produtos: Produto[]
  porId: Map<string, Produto>
  aoMudar: (d: Destino) => void
  aoMudarQtd: (q: string) => void
}) {
  const [trocando, setTrocando] = useState(false)
  const sugeridos = useMemo(() => (destino.tipo === 'novo' ? parecidos(item.descricao, produtos) : []), [destino.tipo, item.descricao, produtos])
  const ligado = destino.tipo === 'produto' ? porId.get(destino.produtoId) : undefined
  const q = lerNumero(qtd) ?? 0
  const ligar = (p: Produto) => {
    aoMudar({ tipo: 'produto', produtoId: p.id!, fator: 1, origem: 'escolha' })
    setTrocando(false)
  }
  const criarNovo = () =>
    aoMudar({ tipo: 'novo', nome: item.descricao.slice(0, 200), codigo: '', unidade: (item.unidade ?? 'un').toLowerCase().slice(0, 10) })

  return (
    <li className={`space-y-2 p-3 ${destino.tipo === 'ignorar' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{item.descricao}</p>
          <p className="text-legenda text-texto-3">
            {[
              item.codigo && `cód. ${item.codigo}`,
              item.ncm && `NCM ${item.ncm}`,
              item.valor_unitario != null && `${moeda(item.valor_unitario, true)} / ${item.unidade ?? 'un'}`,
              item.valor_total != null && `total ${moeda(item.valor_total, true)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-pequeno text-texto-2">
          Qtd.
          <input
            value={qtd}
            onChange={(e) => aoMudarQtd(e.target.value)}
            inputMode="decimal"
            aria-label={`Quantidade de ${item.descricao}`}
            className={`${CLASSE_CAMPO} w-20 text-right`}
            disabled={destino.tipo === 'ignorar'}
          />
          <span className="w-8 text-texto-3">{item.unidade ?? 'un'}</span>
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="O que fazer com este item">
        {(
          [
            ['produto', 'Produto do cadastro'],
            ['novo', 'Produto novo'],
            ['ignorar', 'Não lançar'],
          ] as const
        ).map(([tipo, rotulo]) => (
          <button
            key={tipo}
            type="button"
            role="radio"
            aria-checked={destino.tipo === tipo}
            onClick={() => {
              if (tipo === destino.tipo) return
              if (tipo === 'produto') setTrocando(true)
              if (tipo === 'novo') criarNovo()
              if (tipo === 'ignorar') aoMudar({ tipo: 'ignorar' })
            }}
            className={`rounded-full px-3 py-1 text-legenda font-medium ring-1 ring-inset ${
              destino.tipo === tipo ? 'bg-primaria text-white ring-primaria' : 'text-texto-2 ring-borda hover:bg-fundo'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {(trocando || (destino.tipo === 'produto' && !ligado)) && (
        <BuscaProduto produtos={produtos} aoEscolher={ligar} aoCancelar={() => setTrocando(false)} />
      )}

      {destino.tipo === 'produto' && ligado && !trocando && (
        <div className="space-y-1.5 rounded-md bg-fundo p-2.5 text-pequeno">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              <span className="font-medium">{ligado.nome}</span>
              {ligado.codigo && <span className="text-texto-3"> · {ligado.codigo}</span>}
              <span className="block text-legenda text-texto-3">{ORIGEM_SUGESTAO[destino.origem]}</span>
            </p>
            <Botao variante="fantasma" tamanho="sm" onClick={() => setTrocando(true)}>
              Trocar
            </Botao>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-texto-2">
            <span>1 {item.unidade ?? 'un'} da nota =</span>
            <CampoFator key={destino.produtoId} fator={destino.fator} aoMudar={(fator) => aoMudar({ ...destino, fator })} />
            <span>{ligado.unidade}</span>
            <span className="ml-auto font-medium text-primaria">
              +{quantidade(q * destino.fator)} {ligado.unidade} no estoque
            </span>
          </div>
        </div>
      )}

      {destino.tipo === 'novo' && !trocando && (
        <div className="space-y-2 rounded-md bg-fundo p-2.5">
          <div className="grid gap-2 sm:grid-cols-[1fr_8rem_5rem]">
            <input
              value={destino.nome}
              onChange={(e) => aoMudar({ ...destino, nome: e.target.value })}
              maxLength={200}
              aria-label="Nome do produto novo"
              placeholder="Nome do produto"
              className={CLASSE_CAMPO}
            />
            <input
              value={destino.codigo}
              onChange={(e) => aoMudar({ ...destino, codigo: e.target.value })}
              maxLength={60}
              aria-label="Código do produto novo"
              placeholder="Código (opcional)"
              className={CLASSE_CAMPO}
            />
            <input
              value={destino.unidade}
              onChange={(e) => aoMudar({ ...destino, unidade: e.target.value })}
              maxLength={10}
              aria-label="Unidade do produto novo"
              placeholder="un"
              className={CLASSE_CAMPO}
            />
          </div>
          {sugeridos.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-legenda">
              <span className="text-atencao">Parecido no cadastro:</span>
              {sugeridos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => ligar(p)}
                  className="rounded-full px-2.5 py-0.5 text-texto-2 ring-1 ring-borda ring-inset hover:bg-superficie hover:text-primaria"
                >
                  {p.nome}
                  {p.codigo ? ` · ${p.codigo}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {problema && <p className="text-legenda text-erro">{problema}</p>}
    </li>
  )
}

/** Fator como texto enquanto digita ("1," vira 1 só no número, sem apagar a vírgula da tela). */
function CampoFator({ fator, aoMudar }: { fator: number; aoMudar: (f: number) => void }) {
  const [texto, setTexto] = useState(String(fator).replace('.', ','))
  return (
    <input
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value)
        aoMudar(lerNumero(e.target.value) ?? 0)
      }}
      inputMode="decimal"
      aria-label="Quantas unidades do produto vêm em 1 unidade da nota"
      className={`${CLASSE_CAMPO} w-20 text-right`}
    />
  )
}

function BuscaProduto({ produtos, aoEscolher, aoCancelar }: { produtos: Produto[]; aoEscolher: (p: Produto) => void; aoCancelar: () => void }) {
  const [t, setT] = useState('')
  const achados = useMemo(() => {
    const b = normal(t)
    if (b.length < 2) return []
    return produtos.filter((p) => normal(`${p.nome} ${p.codigo ?? ''}`).includes(b)).slice(0, 8)
  }, [t, produtos])
  return (
    <div className="space-y-1.5 rounded-md bg-fundo p-2.5">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Buscar produto do cadastro</span>
          <Icone nome="busca" className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-texto-3" />
          <input
            autoFocus
            type="search"
            value={t}
            onChange={(e) => setT(e.target.value)}
            placeholder="Buscar no cadastro por nome ou código"
            className={`${CLASSE_CAMPO} pl-8`}
          />
        </label>
        <Botao variante="fantasma" tamanho="sm" onClick={aoCancelar}>
          Cancelar
        </Botao>
      </div>
      {achados.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-borda bg-superficie text-pequeno">
          {achados.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => aoEscolher(p)} className="w-full px-3 py-1.5 text-left hover:bg-fundo hover:text-primaria">
                {p.nome}
                <span className="text-texto-3">
                  {p.codigo ? ` · ${p.codigo}` : ''} · {p.unidade}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {t.trim().length >= 2 && !achados.length && <p className="text-legenda text-texto-3">Nada encontrado com “{t.trim()}”.</p>}
    </div>
  )
}
