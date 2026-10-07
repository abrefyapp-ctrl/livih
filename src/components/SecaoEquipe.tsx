import { useEffect, useState, type FormEvent } from 'react'
import { useSessao } from '../hooks/useSessao'
import {
  alterarMembro,
  convidarMembro,
  listarEquipeCompleta,
  type MembroEquipe,
  type Papel,
} from '../services/configuracoes'
import { quandoCurto } from '../services/formato'
import { Avatar } from './Avatar'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { Icone } from './Icone'
import { Modal } from './Modal'

const PAPEIS: Record<Papel, { rotulo: string; descricao: string }> = {
  dono: { rotulo: 'Dono', descricao: 'Tudo, inclusive a equipe.' },
  admin: { rotulo: 'Admin', descricao: 'Atende e configura o agente e a base de conhecimento.' },
  atendente: { rotulo: 'Atendente', descricao: 'Atende as conversas.' },
}

function Situacao({ m }: { m: MembroEquipe }) {
  if (!m.ativo) return <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-legenda text-texto-3">Desativado</span>
  if (!m.senha_definida)
    return <span className="rounded-sm bg-atencao-suave px-1.5 py-0.5 text-legenda text-atencao">Convite pendente</span>
  return <span className="rounded-sm bg-primaria-suave px-1.5 py-0.5 text-legenda text-primaria">Ativo</span>
}

export function SecaoEquipe() {
  const { orgAtiva, sessao } = useSessao()
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

  useEffect(() => {
    let ativo = true
    listarEquipeCompleta(orgId)
      .then((lista) => ativo && (setEquipe({ orgId, lista }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar a equipe.'))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  const lista = equipe?.orgId === orgId ? equipe.lista : null
  const recarregar = () => setVersao((v) => v + 1)

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

  return (
    <section aria-labelledby="titulo-equipe" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-equipe" className="text-h2 font-semibold">
            Equipe
          </h2>
          <p className="text-pequeno text-texto-3">Quem atende as conversas de {orgAtiva?.nome}.</p>
        </div>
        {souDono && (
          <Botao icone="mais" onClick={() => setConvidando(true)}>
            Convidar pessoa
          </Botao>
        )}
      </div>

      {!souDono && <Aviso>Só o dono da organização convida pessoas e muda papéis.</Aviso>}
      {erroAcao && <Aviso tom="erro">{erroAcao}</Aviso>}
      {erro && (
        <Aviso tom="erro" acao={<button onClick={recarregar} className="font-semibold underline">Tentar de novo</button>}>
          {erro}
        </Aviso>
      )}

      <div className="overflow-hidden rounded-lg border border-borda bg-superficie">
        {!lista ? (
          <p className="p-5 text-pequeno text-texto-3" aria-busy="true">
            Carregando equipe…
          </p>
        ) : (
          <ul className="divide-y divide-borda">
            {lista.map((m) => {
              const nome = m.nome || m.email
              const editavel = souDono && m.user_id !== eu
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
                  <Avatar nome={nome} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">{nome}</span>
                      {m.user_id === eu && <span className="text-legenda font-normal text-texto-3">(você)</span>}
                      <Situacao m={m} />
                    </p>
                    <p className="truncate text-pequeno text-texto-3">
                      {m.email}
                      {m.ultimo_acesso && ` · último acesso ${quandoCurto(m.ultimo_acesso).toLowerCase()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {editavel ? (
                      <label className="relative">
                        <span className="sr-only">Papel de {nome}</span>
                        <select
                          value={m.papel}
                          disabled={salvando === m.user_id || !m.ativo}
                          onChange={(e) => void alterar(m, { papel: e.target.value as Papel })}
                          className="h-8 appearance-none rounded-md border border-borda bg-superficie pr-8 pl-3 text-pequeno disabled:opacity-60"
                        >
                          {(Object.keys(PAPEIS) as Papel[]).map((p) => (
                            <option key={p} value={p}>
                              {PAPEIS[p].rotulo}
                            </option>
                          ))}
                        </select>
                        <Icone nome="abaixo" className="pointer-events-none absolute top-2 right-2 size-4 text-texto-3" />
                      </label>
                    ) : (
                      <span className="text-pequeno text-texto-2">{PAPEIS[m.papel].rotulo}</span>
                    )}
                    {editavel &&
                      (m.ativo ? (
                        <Botao tamanho="sm" variante="fantasma" onClick={() => setDesativar(m)}>
                          Desativar
                        </Botao>
                      ) : (
                        <Botao tamanho="sm" variante="secundario" carregando={salvando === m.user_id} onClick={() => void alterar(m, { ativo: true })}>
                          Reativar
                        </Botao>
                      ))}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <dl className="grid gap-2 text-pequeno text-texto-3 sm:grid-cols-3">
        {(Object.keys(PAPEIS) as Papel[]).map((p) => (
          <div key={p}>
            <dt className="font-medium text-texto-2">{PAPEIS[p].rotulo}</dt>
            <dd>{PAPEIS[p].descricao}</dd>
          </div>
        ))}
      </dl>

      <Convite
        aberto={convidando}
        orgId={orgId}
        nomeOrg={orgAtiva?.nome ?? ''}
        aoFechar={() => setConvidando(false)}
        aoConvidar={recarregar}
      />

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
  const [resultado, setResultado] = useState<{ link: string | null } | null>(null)
  const [copiado, setCopiado] = useState(false)

  function fechar() {
    setNome('')
    setEmail('')
    setPapel('atendente')
    setErro(null)
    setResultado(null)
    setCopiado(false)
    aoFechar()
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    try {
      const link = await convidarMembro(orgId, { email, nome, papel })
      setResultado({ link })
      aoConvidar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  const mensagem = (link: string) =>
    `Oi${nome ? `, ${nome.split(' ')[0]}` : ''}! Você foi convidado(a) para atender as conversas da ${nomeOrg} no Livih. ` +
    `Crie sua senha por este link (vale por 24 horas): ${link}`

  if (resultado) {
    return (
      <Modal
        aberto={aberto}
        titulo={resultado.link ? 'Convite criado' : 'Adicionado à equipe'}
        aoFechar={fechar}
        rodape={<Botao onClick={fechar}>Concluir</Botao>}
      >
        {resultado.link ? (
          <div className="space-y-3">
            <p>Mande este link para {nome || email}. Ele vale por 24 horas e abre a tela para criar a senha.</p>
            <div className="flex items-center gap-2 rounded-md border border-borda bg-fundo p-2">
              <Icone nome="link" className="size-4 shrink-0 text-texto-3" />
              <code className="min-w-0 flex-1 truncate text-legenda">{resultado.link}</code>
            </div>
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" icone={copiado ? 'check' : 'copiar'} onClick={() => void copiar(resultado.link!)}>
                {copiado ? 'Link copiado' : 'Copiar link'}
              </Botao>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(mensagem(resultado.link))}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primaria px-4 font-medium text-white hover:bg-primaria-hover"
              >
                <Icone nome="enviar" className="size-4" />
                Enviar pelo WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <p>{email} já tinha conta no Livih e agora está na equipe. Entra com a senha que já usa.</p>
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
