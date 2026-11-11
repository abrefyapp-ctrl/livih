import { useEffect, useState, type FormEvent } from 'react'
import { useSessao } from '../hooks/useSessao'
import {
  alterarMembro,
  convidarMembro,
  definirAlertaEstoque,
  definirRecebeContatos,
  linkNovaSenha,
  listarEquipeCompleta,
  listarAlertaEstoque,
  listarRecebeContatos,
  type MembroEquipe,
  type Papel,
} from '../services/configuracoes'
import { quandoCurto } from '../services/formato'
import { definirVeTodosClientes, listarVeTodosClientes } from '../services/clientes'
import { definirEmiteNotaFiscal, listarEmiteNotaFiscal } from '../services/nfe'
import { definirFinanceiro, listarFinanceiro } from '../services/financeiro'
import { definirEquipeDaPessoa, listarEquipes, listarLugares, type Equipe, type LugarNaEquipe } from '../services/equipes'
import { Avatar } from './Avatar'
import { EquipesDeVenda } from './EquipesDeVenda'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { Icone } from './Icone'
import { LinkConvite } from './LinkConvite'
import { Modal } from './Modal'
import { CLASSE_CAMPO } from './ModaisOs'

const PAPEIS: Record<Papel, { rotulo: string; descricao: string }> = {
  dono: { rotulo: 'Dono', descricao: 'Tudo, inclusive a equipe.' },
  admin: { rotulo: 'Admin', descricao: 'Atende e configura o agente e a base de conhecimento.' },
  atendente: { rotulo: 'Atendente', descricao: 'Atende as conversas.' },
}

const CLASSE_FILTRO = 'h-9 rounded-md border border-borda bg-superficie px-3 text-pequeno focus:border-primaria focus:outline-none'

/** Busca e filtro só aparecem a partir daqui: numa equipe pequena, são ruído. */
const MINIMO_PARA_FILTRAR = 6

const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function Situacao({ m }: { m: MembroEquipe }) {
  if (!m.ativo) return <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-legenda text-texto-3">Desativado</span>
  if (!m.senha_definida)
    return <span className="rounded-sm bg-atencao-suave px-1.5 py-0.5 text-legenda text-atencao">Convite pendente</span>
  return <span className="rounded-sm bg-primaria-suave px-1.5 py-0.5 text-legenda text-primaria">Ativo</span>
}

export function SecaoEquipe() {
  const { orgAtiva, sessao, modulos } = useSessao()
  const orgId = orgAtiva!.id
  const souDono = orgAtiva?.papel === 'dono'
  const eu = sessao?.user.id
  const [equipe, setEquipe] = useState<{ orgId: string; lista: MembroEquipe[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [convidando, setConvidando] = useState(false)
  const [desativar, setDesativar] = useState<MembroEquipe | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)
  const [novoLink, setNovoLink] = useState<{ nome: string; link: string; tipo: 'convite' | 'senha' } | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('')

  // "Vê todos os clientes" (docs/clientes.md): dono e admin ligam para quem atende no balcão, faturamento etc.
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [veTodos, setVeTodos] = useState<Set<string>>(new Set())
  // "Emite nota fiscal" (docs/nfe.md): desligada por padrão; dono e admin ligam.
  const [emiteNota, setEmiteNota] = useState<Set<string>>(new Set())
  // "Financeiro" (docs/financeiro.md): só aparece com o ERP ou as OS ligados, que é quando o financeiro existe.
  const comFinanceiro = !!modulos && (modulos.has('erp') || modulos.has('os'))
  const [financeiro, setFinanceiro] = useState<Set<string>>(new Set())
  // "Recebe contatos novos" (docs/crm-acompanhamento.md, entrega 3): rodízio dos números da empresa que distribuem.
  const [recebe, setRecebe] = useState<Set<string>>(new Set())
  // "Alerta de estoque" (06/11): quem cuida das compras recebe o aviso de produto abaixo do mínimo.
  const comErp = !!modulos?.has('erp')
  const [alertaEstoque, setAlertaEstoque] = useState<Set<string>>(new Set())
  // Equipes de venda e gestor (docs/equipes-origem-prospeccao.md, entrega 1).
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [lugares, setLugares] = useState<Map<string, LugarNaEquipe>>(new Map())

  useEffect(() => {
    let ativo = true
    listarEquipes(orgId)
      .then((l) => ativo && setEquipes(l))
      .catch(() => ativo && setEquipes([]))
    listarLugares(orgId)
      .then((l) => ativo && setLugares(l))
      .catch(() => ativo && setLugares(new Map()))
    listarEquipeCompleta(orgId)
      .then((lista) => ativo && (setEquipe({ orgId, lista }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar a equipe.'))
    listarVeTodosClientes(orgId)
      .then((s) => ativo && setVeTodos(s))
      .catch(() => ativo && setVeTodos(new Set()))
    listarEmiteNotaFiscal(orgId)
      .then((s) => ativo && setEmiteNota(s))
      .catch(() => ativo && setEmiteNota(new Set()))
    listarFinanceiro(orgId)
      .then((s) => ativo && setFinanceiro(s))
      .catch(() => ativo && setFinanceiro(new Set()))
    listarRecebeContatos(orgId)
      .then((s) => ativo && setRecebe(s))
      .catch(() => ativo && setRecebe(new Set()))
    listarAlertaEstoque(orgId)
      .then((s) => ativo && setAlertaEstoque(s))
      .catch(() => ativo && setAlertaEstoque(new Set()))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  async function alternarEmiteNota(m: MembroEquipe) {
    setSalvando(m.user_id)
    setErroAcao(null)
    try {
      await definirEmiteNotaFiscal(orgId, m.user_id, !emiteNota.has(m.user_id))
      recarregar()
    } catch (e) {
      setErroAcao((e as Error).message)
    } finally {
      setSalvando(null)
    }
  }

  async function alternarFinanceiro(m: MembroEquipe) {
    setSalvando(m.user_id)
    setErroAcao(null)
    try {
      await definirFinanceiro(orgId, m.user_id, !financeiro.has(m.user_id))
      recarregar()
    } catch (e) {
      setErroAcao((e as Error).message)
    } finally {
      setSalvando(null)
    }
  }

  async function alternarRecebe(m: MembroEquipe) {
    setSalvando(m.user_id)
    setErroAcao(null)
    try {
      await definirRecebeContatos(orgId, m.user_id, !recebe.has(m.user_id))
      recarregar()
    } catch (e) {
      setErroAcao((e as Error).message)
    } finally {
      setSalvando(null)
    }
  }

  async function alternarAlertaEstoque(m: MembroEquipe) {
    setSalvando(m.user_id)
    setErroAcao(null)
    try {
      await definirAlertaEstoque(orgId, m.user_id, !alertaEstoque.has(m.user_id))
      recarregar()
    } catch (e) {
      setErroAcao((e as Error).message)
    } finally {
      setSalvando(null)
    }
  }

  async function mudarEquipe(m: MembroEquipe, equipeId: string | null, gestor: boolean) {
    setSalvando(m.user_id)
    setErroAcao(null)
    try {
      await definirEquipeDaPessoa(orgId, m.user_id, equipeId, gestor)
      recarregar()
    } catch (e) {
      setErroAcao((e as Error).message)
    } finally {
      setSalvando(null)
    }
  }

  async function alternarVeTodos(m: MembroEquipe) {
    setSalvando(m.user_id)
    setErroAcao(null)
    try {
      await definirVeTodosClientes(orgId, m.user_id, !veTodos.has(m.user_id))
      recarregar()
    } catch (e) {
      setErroAcao((e as Error).message)
    } finally {
      setSalvando(null)
    }
  }

  const lista = equipe?.orgId === orgId ? equipe.lista : null
  const recarregar = () => setVersao((v) => v + 1)

  // Convite pendente → link novo de convite; já tem senha (esqueceu) → link para criar senha nova.
  async function gerarNovoLink(m: MembroEquipe) {
    setSalvando(m.user_id)
    setErroAcao(null)
    try {
      const nome = m.nome || m.email
      if (m.senha_definida) {
        const link = await linkNovaSenha(orgId, m.email)
        if (link) setNovoLink({ nome, link, tipo: 'senha' })
      } else {
        const r = await convidarMembro(orgId, { email: m.email, nome: m.nome ?? '', papel: m.papel === 'admin' ? 'admin' : 'atendente' })
        if (r.link) setNovoLink({ nome, link: r.link, tipo: 'convite' })
        else setErroAcao(r.aviso ?? `${nome} já criou a senha. Basta entrar com ela.`)
      }
      recarregar()
    } catch (e) {
      setErroAcao((e as Error).message)
    } finally {
      setSalvando(null)
    }
  }

  async function alterar(m: MembroEquipe, campos: { papel?: Papel; ativo?: boolean }) {
    setSalvando(m.user_id)
    setErroAcao(null)
    try {
      await alterarMembro(orgId, m.user_id, campos)
      recarregar()
    } catch (e) {
      setErroAcao((e as Error).message)
    } finally {
      setSalvando(null)
      setDesativar(null)
    }
  }

  // Uma linha por pessoa, com o que ela pode como etiquetas, e as opções na janela "Editar" (revisão de 11/11): as 6
  // caixas de marcar de cada linha ficavam desalinhadas, e a CEFEQ terá 32 pessoas em 6 equipes.
  const nomeEquipe = (id: string | null | undefined) => (id ? equipes.find((e) => e.id === id)?.nome : undefined)
  function etiquetas(m: MembroEquipe) {
    const lugar = lugares.get(m.user_id)
    const e: string[] = []
    const eq = nomeEquipe(lugar?.equipe_id)
    if (eq) e.push(lugar?.gestor ? `${eq} · gestor` : eq)
    if (!m.ativo) return e
    if (recebe.has(m.user_id)) e.push('Recebe contatos novos')
    if (m.papel === 'atendente' && veTodos.has(m.user_id)) e.push('Vê todos os clientes')
    if (m.papel === 'atendente' && emiteNota.has(m.user_id)) e.push('Emite nota fiscal')
    if (comFinanceiro && m.papel === 'atendente' && financeiro.has(m.user_id)) e.push('Financeiro')
    if (comErp && alertaEstoque.has(m.user_id)) e.push('Alerta de estoque')
    return e
  }

  const termo = semAcento(busca.trim())
  const filtradas = (lista ?? []).filter((m) => {
    const equipeId = lugares.get(m.user_id)?.equipe_id ?? null
    if (filtro === 'desativados' && m.ativo) return false
    if (filtro === 'sem-equipe' && (equipeId || !m.ativo)) return false
    if (filtro.startsWith('equipe:') && equipeId !== filtro.slice(7)) return false
    return !termo || semAcento(`${m.nome ?? ''} ${m.email}`).includes(termo)
  })
  // Sem busca nem filtro, e com equipes criadas: agrupadas por equipe, quem saiu no fim.
  const agrupar = equipes.length > 0 && !termo && !filtro
  const grupos: { titulo: string | null; pessoas: MembroEquipe[] }[] = agrupar
    ? [
        ...equipes.map((eq) => ({
          titulo: eq.nome,
          pessoas: filtradas.filter((m) => m.ativo && lugares.get(m.user_id)?.equipe_id === eq.id),
        })),
        { titulo: 'Sem equipe', pessoas: filtradas.filter((m) => m.ativo && !lugares.get(m.user_id)?.equipe_id) },
        { titulo: 'Desativados', pessoas: filtradas.filter((m) => !m.ativo) },
      ].filter((g) => g.pessoas.length)
    : [{ titulo: null, pessoas: filtradas }]
  const desativados = (lista ?? []).filter((m) => !m.ativo).length
  const filtrando = !!termo || !!filtro
  const editada = editando ? (lista?.find((m) => m.user_id === editando) ?? null) : null

  function linha(m: MembroEquipe) {
    const nome = m.nome || m.email
    const tags = etiquetas(m)
    return (
      <li key={m.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
        <Avatar nome={nome} />
        {/* Largura mínima: no celular, papel e Editar descem para a linha de baixo em vez de espremer o texto. */}
        <div className="min-w-[12rem] flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span className="truncate">{nome}</span>
            {m.user_id === eu && <span className="text-legenda font-normal text-texto-3">(você)</span>}
            <Situacao m={m} />
          </p>
          <p className="truncate text-pequeno text-texto-3">
            {m.email}
            {m.ultimo_acesso && ` · último acesso ${quandoCurto(m.ultimo_acesso).toLowerCase()}`}
          </p>
          {tags.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {tags.map((t) => (
                <Etiqueta key={t}>{t}</Etiqueta>
              ))}
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-pequeno text-texto-2">{PAPEIS[m.papel].rotulo}</span>
          {gerencia && m.ativo && (
            <Botao tamanho="sm" variante="secundario" onClick={() => (setErroAcao(null), setEditando(m.user_id))}>
              Editar
            </Botao>
          )}
          {souDono && !m.ativo && m.user_id !== eu && (
            <Botao tamanho="sm" variante="secundario" carregando={salvando === m.user_id} onClick={() => void alterar(m, { ativo: true })}>
              Reativar
            </Botao>
          )}
        </div>
      </li>
    )
  }

  return (
    <section aria-labelledby="titulo-equipe" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-equipe" className="text-h2 font-semibold">
            Equipe
          </h2>
          <p className="text-pequeno text-texto-3">
            Quem atende as conversas de {orgAtiva?.nome}. Para mudar o seu nome e telefone, clique no seu nome no alto da
            tela.
          </p>
        </div>
        {souDono && (
          <Botao icone="mais" onClick={() => setConvidando(true)}>
            Convidar pessoa
          </Botao>
        )}
      </div>

      {!souDono && <Aviso>Só o dono da organização convida pessoas e muda papéis.</Aviso>}
      {erroAcao && !editada && <Aviso tom="erro">{erroAcao}</Aviso>}
      {erro && (
        <Aviso tom="erro" acao={<button onClick={recarregar} className="font-semibold underline">Tentar de novo</button>}>
          {erro}
        </Aviso>
      )}

      {/* Antes da lista: com muitas pessoas, ficava lá embaixo. */}
      <EquipesDeVenda orgId={orgId} gerencia={gerencia} equipes={equipes} lugares={lugares} aoMudar={recarregar} />

      <div className="space-y-3">
        {lista && lista.length >= MINIMO_PARA_FILTRAR && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 sm:max-w-xs">
              <span className="sr-only">Buscar pessoa</span>
              <Icone nome="busca" className="pointer-events-none absolute top-2.5 left-3 size-4 text-texto-3" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou e-mail"
                className={`${CLASSE_FILTRO} w-full pl-9`}
              />
            </label>
            <label>
              <span className="sr-only">Mostrar</span>
              <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={CLASSE_FILTRO}>
                <option value="">Todas as pessoas</option>
                {equipes.map((eq) => (
                  <option key={eq.id} value={`equipe:${eq.id}`}>
                    {eq.nome}
                  </option>
                ))}
                {equipes.length > 0 && <option value="sem-equipe">Sem equipe</option>}
                {desativados > 0 && <option value="desativados">Desativados ({desativados})</option>}
              </select>
            </label>
            <p className="text-pequeno text-texto-3" aria-live="polite">
              {filtrando ? `${filtradas.length} de ${lista.length} pessoas` : `${lista.length} pessoas`}
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-borda bg-superficie">
          {!lista ? (
            <p className="p-5 text-pequeno text-texto-3" aria-busy="true">
              Carregando equipe…
            </p>
          ) : !filtradas.length ? (
            <p className="p-5 text-pequeno text-texto-3">
              Ninguém com esse filtro.{' '}
              <button
                onClick={() => {
                  setBusca('')
                  setFiltro('')
                }}
                className="font-medium text-primaria underline"
              >
                Mostrar todos
              </button>
            </p>
          ) : (
            grupos.map((g) => (
              <div key={g.titulo ?? 'todas'} role={g.titulo ? 'group' : undefined} aria-label={g.titulo ?? undefined}>
                {g.titulo && (
                  <p className="border-b border-borda bg-fundo px-4 py-1.5 text-legenda font-semibold tracking-wide text-texto-3 uppercase [&:not(:first-child)]:border-t">
                    {g.titulo} · {g.pessoas.length}
                  </p>
                )}
                <ul className="divide-y divide-borda">{g.pessoas.map(linha)}</ul>
              </div>
            ))
          )}
        </div>
      </div>

      <dl className="grid gap-2 text-pequeno text-texto-3 sm:grid-cols-3">
        {(Object.keys(PAPEIS) as Papel[]).map((p) => (
          <div key={p}>
            <dt className="font-medium text-texto-2">{PAPEIS[p].rotulo}</dt>
            <dd>{PAPEIS[p].descricao}</dd>
          </div>
        ))}
      </dl>

      <Modal
        aberto={!!editada}
        titulo={editada ? `Editar ${editada.nome || editada.email}` : 'Editar pessoa'}
        largura="max-w-xl"
        aoFechar={() => setEditando(null)}
        rodape={<Botao onClick={() => setEditando(null)}>Concluir</Botao>}
      >
        {editada && (
          <EdicaoPessoa
            m={editada}
            eu={eu}
            souDono={souDono}
            ocupado={salvando === editada.user_id}
            erro={erroAcao}
            equipes={equipes}
            lugar={lugares.get(editada.user_id)}
            opcoes={[
              {
                rotulo: 'Recebe contatos novos',
                descricao: 'Entra no rodízio dos contatos novos dos números da empresa que distribuem.',
                ligada: recebe.has(editada.user_id),
                alternar: alternarRecebe,
              },
              ...(editada.papel === 'atendente'
                ? [
                    {
                      rotulo: 'Vê todos os clientes',
                      descricao:
                        'Para quem atende no balcão ou cuida do faturamento: vê o cadastro de todos os clientes e vende para qualquer um. Não vê as conversas nem os negócios dos outros vendedores.',
                      ligada: veTodos.has(editada.user_id),
                      alternar: alternarVeTodos,
                    },
                    {
                      rotulo: 'Emite nota fiscal',
                      descricao: 'Emite a NF-e dos pedidos que vê. Cancelar nota continua só com dono e admin.',
                      ligada: emiteNota.has(editada.user_id),
                      alternar: alternarEmiteNota,
                    },
                    ...(comFinanceiro
                      ? [
                          {
                            rotulo: 'Financeiro',
                            descricao: 'Vê os lançamentos e dá baixa nos pagamentos, para quem cuida do caixa ou da cobrança.',
                            ligada: financeiro.has(editada.user_id),
                            alternar: alternarFinanceiro,
                          },
                        ]
                      : []),
                  ]
                : []),
              ...(comErp
                ? [
                    {
                      rotulo: 'Alerta de estoque',
                      descricao: 'Recebe no celular e no WhatsApp o aviso de produto abaixo do estoque mínimo e o resumo da manhã.',
                      ligada: alertaEstoque.has(editada.user_id),
                      alternar: alternarAlertaEstoque,
                    },
                  ]
                : []),
            ]}
            mudarPapel={(p) => void alterar(editada, { papel: p })}
            mudarEquipe={(equipeId, gestor) => void mudarEquipe(editada, equipeId, gestor)}
            novoLink={() => {
              setEditando(null)
              void gerarNovoLink(editada)
            }}
            desativar={() => {
              setEditando(null)
              setDesativar(editada)
            }}
          />
        )}
      </Modal>

      <Convite
        aberto={convidando}
        orgId={orgId}
        nomeOrg={orgAtiva?.nome ?? ''}
        aoFechar={() => setConvidando(false)}
        aoConvidar={recarregar}
      />

      <Modal
        aberto={!!novoLink}
        titulo={novoLink?.tipo === 'senha' ? 'Link para criar senha nova' : 'Novo link de convite'}
        aoFechar={() => setNovoLink(null)}
        rodape={<Botao onClick={() => setNovoLink(null)}>Concluir</Botao>}
      >
        {novoLink && <LinkConvite link={novoLink.link} nome={novoLink.nome} nomeOrg={orgAtiva?.nome ?? ''} tipo={novoLink.tipo} />}
      </Modal>

      <DialogoConfirmacao
        aberto={!!desativar}
        titulo="Desativar acesso?"
        rotuloConfirmar="Desativar"
        perigo
        carregando={!!desativar && salvando === desativar.user_id}
        aoConfirmar={() => desativar && void alterar(desativar, { ativo: false })}
        aoCancelar={() => setDesativar(null)}
      >
        {desativar?.nome || desativar?.email} deixa de ver as conversas desta organização. O histórico do que fez continua.
        Dá para reativar depois.
      </DialogoConfirmacao>
    </section>
  )
}

function Etiqueta({ children }: { children: string }) {
  return <span className="rounded-sm bg-fundo px-1.5 py-0.5 text-legenda text-texto-2 ring-1 ring-borda ring-inset">{children}</span>
}

type Opcao = { rotulo: string; descricao: string; ligada: boolean; alternar: (m: MembroEquipe) => Promise<void> }

/** Conteúdo da janela "Editar": cada mudança vale na hora, como era na linha. */
function EdicaoPessoa({
  m,
  eu,
  souDono,
  ocupado,
  erro,
  equipes,
  lugar,
  opcoes,
  mudarPapel,
  mudarEquipe,
  novoLink,
  desativar,
}: {
  m: MembroEquipe
  eu: string | undefined
  souDono: boolean
  ocupado: boolean
  erro: string | null
  equipes: Equipe[]
  lugar: LugarNaEquipe | undefined
  opcoes: Opcao[]
  mudarPapel: (p: Papel) => void
  mudarEquipe: (equipeId: string | null, gestor: boolean) => void
  novoLink: () => void
  desativar: () => void
}) {
  const editaPapel = souDono && m.user_id !== eu
  const equipeId = lugar?.equipe_id ?? null
  return (
    <div className="space-y-5">
      <p className="text-legenda text-texto-3">As mudanças valem na hora.</p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="papel-pessoa" className="block text-pequeno font-medium text-texto-2">
            Papel
          </label>
          {editaPapel ? (
            <select
              id="papel-pessoa"
              value={m.papel}
              disabled={ocupado}
              onChange={(e) => mudarPapel(e.target.value as Papel)}
              className={`${CLASSE_CAMPO} disabled:opacity-60`}
            >
              {(Object.keys(PAPEIS) as Papel[]).map((p) => (
                <option key={p} value={p}>
                  {PAPEIS[p].rotulo}
                </option>
              ))}
            </select>
          ) : (
            <p id="papel-pessoa" className="text-pequeno">
              {PAPEIS[m.papel].rotulo}
            </p>
          )}
          <p className="text-legenda text-texto-3">{PAPEIS[m.papel].descricao}</p>
        </div>

        {equipes.length > 0 && (
          <div className="space-y-1.5">
            <label htmlFor="equipe-pessoa" className="block text-pequeno font-medium text-texto-2">
              Equipe de venda
            </label>
            <select
              id="equipe-pessoa"
              value={equipeId ?? ''}
              disabled={ocupado}
              onChange={(e) => mudarEquipe(e.target.value || null, !!e.target.value && !!lugar?.gestor)}
              className={`${CLASSE_CAMPO} disabled:opacity-60`}
            >
              <option value="">Sem equipe</option>
              {equipes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
            {/* Gestor só faz sentido para atendente: dono e admin já veem tudo. */}
            {m.papel === 'atendente' && equipeId && (
              <label className="flex cursor-pointer items-center gap-2 pt-1 text-pequeno text-texto-2">
                <input
                  type="checkbox"
                  checked={!!lugar?.gestor}
                  disabled={ocupado}
                  onChange={(e) => mudarEquipe(equipeId, e.target.checked)}
                  className="size-4 accent-primaria"
                />
                Gestor da equipe
              </label>
            )}
          </div>
        )}
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 text-pequeno font-medium text-texto-2">O que a pessoa pode</legend>
        {opcoes.map((o) => (
          <label key={o.rotulo} className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={o.ligada}
              disabled={ocupado}
              onChange={() => void o.alternar(m)}
              className="mt-0.5 size-4 shrink-0 accent-primaria"
            />
            <span>
              <span className="block text-pequeno font-medium text-texto">{o.rotulo}</span>
              <span className="block text-legenda text-texto-3">{o.descricao}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {editaPapel && (
        <div className="space-y-2 border-t border-borda pt-4">
          <p className="text-pequeno font-medium text-texto-2">Acesso à Livih</p>
          <div className="flex flex-wrap gap-2">
            {(m.senha_definida || m.papel !== 'dono') && (
              <Botao tamanho="sm" variante="secundario" icone="link" onClick={novoLink}>
                {m.senha_definida ? 'Redefinir senha' : 'Novo link de convite'}
              </Botao>
            )}
            <Botao tamanho="sm" variante="perigoTexto" onClick={desativar}>
              Desativar acesso
            </Botao>
          </div>
        </div>
      )}
    </div>
  )
}

function Convite({
  aberto,
  orgId,
  nomeOrg,
  aoFechar,
  aoConvidar,
}: {
  aberto: boolean
  orgId: string
  nomeOrg: string
  aoFechar: () => void
  aoConvidar: () => void
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Exclude<Papel, 'dono'>>('atendente')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ link: string | null; aviso: string | null } | null>(null)

  function fechar() {
    setNome('')
    setEmail('')
    setPapel('atendente')
    setErro(null)
    setResultado(null)
    aoFechar()
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    try {
      const r = await convidarMembro(orgId, { email, nome, papel })
      setResultado({ link: r.link, aviso: r.aviso ?? null })
      aoConvidar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (resultado) {
    return (
      <Modal
        aberto={aberto}
        titulo={resultado.link ? 'Convite criado' : 'Adicionado à equipe'}
        aoFechar={fechar}
        rodape={<Botao onClick={fechar}>Concluir</Botao>}
      >
        {resultado.link ? (
          <LinkConvite link={resultado.link} nome={nome || email} nomeOrg={nomeOrg} />
        ) : (
          <div className="space-y-3">
            <p>{email} já tinha conta na Livih e agora está na equipe.</p>
            {resultado.aviso ? <Aviso tom="atencao">{resultado.aviso}</Aviso> : <p>Entra com a senha que já usa.</p>}
          </div>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      aberto={aberto}
      titulo="Convidar pessoa"
      aoFechar={fechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={fechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-convite" carregando={enviando} disabled={!email.trim()}>
            Criar convite
          </Botao>
        </>
      }
    >
      <form id="form-convite" onSubmit={enviar} className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <CampoTexto rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" placeholder="Como aparece para a equipe" />
        <CampoTexto rotulo="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" placeholder="pessoa@empresa.com.br" />
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-pequeno font-medium text-texto-2">Papel</legend>
          {(['atendente', 'admin'] as const).map((p) => (
            <label
              key={p}
              className={`flex cursor-pointer gap-3 rounded-md border p-3 ${papel === p ? 'border-primaria bg-primaria-suave' : 'border-borda'}`}
            >
              <input type="radio" name="papel" value={p} checked={papel === p} onChange={() => setPapel(p)} className="mt-0.5 accent-primaria" />
              <span>
                <span className="block font-medium text-texto">{PAPEIS[p].rotulo}</span>
                <span className="text-pequeno text-texto-3">{PAPEIS[p].descricao}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-legenda text-texto-3">Não enviamos e-mail: você recebe um link para mandar à pessoa.</p>
      </form>
    </Modal>
  )
}

/** Link de convite com copiar e mandar pelo WhatsApp (mensagem pronta). */
