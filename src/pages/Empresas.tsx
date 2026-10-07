import { useEffect, useMemo, useState } from 'react'
import { convidarDono, linkNovaSenha } from '../services/configuracoes'
import { haQuanto } from '../services/formato'
import {
  decidirPedido,
  definirStatusEmpresa,
  listarEmpresas,
  listarPedidosPendentes,
  type Empresa,
  type PedidoAcesso,
} from '../services/plataforma'
import { useSessao } from '../hooks/useSessao'
import { Avatar } from '../components/Avatar'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { DialogoConfirmacao } from '../components/DialogoConfirmacao'
import { EstadoVazio } from '../components/EstadoVazio'
import { Icone } from '../components/Icone'
import { LinkConvite } from '../components/LinkConvite'
import { Modal } from '../components/Modal'
import { ModalEmpresa, type ModoEmpresa } from '../components/ModalEmpresa'
import { NaoEncontrada } from './NaoEncontrada'

type LinkGerado = { link: string; nome: string; nomeOrg: string; tipo: 'dono' | 'senha' }

const desde = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Painel da equipe F7: empresas clientes, acesso do dono, suspender/reativar e pedidos vindos do site. */
export function Empresas() {
  const { adminPlataforma, sessao } = useSessao()
  const [dados, setDados] = useState<{ empresas: Empresa[]; pedidos: PedidoAcesso[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState<ModoEmpresa | null>(null)
  const [suspender, setSuspender] = useState<Empresa | null>(null)
  const [recusar, setRecusar] = useState<PedidoAcesso | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [linkGerado, setLinkGerado] = useState<LinkGerado | null>(null)

  useEffect(() => {
    if (!adminPlataforma) return
    let ativo = true
    Promise.all([listarEmpresas(), listarPedidosPendentes()])
      .then(([empresas, pedidos]) => {
        if (!ativo) return
        setDados({ empresas, pedidos })
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar as empresas.'))
    return () => {
      ativo = false
    }
  }, [adminPlataforma, versao])

  const recarregar = () => setVersao((v) => v + 1)

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const lista = dados?.empresas ?? []
    return t ? lista.filter((e) => `${e.nome} ${e.dono_nome ?? ''} ${e.dono_email ?? ''}`.toLowerCase().includes(t)) : lista
  }, [dados, busca])

  if (!adminPlataforma) return <NaoEncontrada />

  const empresas = dados?.empresas ?? []
  const ativas = empresas.filter((e) => e.status === 'ativa').length
  const semAcesso = empresas.filter((e) => !e.dono_email || !e.dono_senha_definida).length

  async function acessoDoDono(e: Empresa) {
    if (!e.dono_email) {
      setModal({ tipo: 'dono', empresa: e })
      return
    }
    setOcupado(e.id)
    setErro(null)
    try {
      const nome = e.dono_nome || e.dono_email
      if (e.dono_senha_definida) {
        const link = await linkNovaSenha(e.id, e.dono_email)
        if (link) setLinkGerado({ link, nome, nomeOrg: e.nome, tipo: 'senha' })
      } else {
        const r = await convidarDono(e.id, { email: e.dono_email, nome: e.dono_nome ?? '' })
        if (r.link) setLinkGerado({ link: r.link, nome, nomeOrg: e.nome, tipo: 'dono' })
        else if (r.aviso) setErro(r.aviso)
      }
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  async function mudarStatus(e: Empresa, status: 'ativa' | 'suspensa') {
    setOcupado(e.id)
    setErro(null)
    try {
      await definirStatusEmpresa(e.id, status)
      setSuspender(null)
      recarregar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  async function marcarPedido(p: PedidoAcesso, decisao: { status: 'aprovado'; orgId: string } | { status: 'recusado' }) {
    try {
      await decidirPedido(p.id, decisao, sessao!.user.id)
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-semibold">Empresas</h1>
            <p className="text-pequeno text-texto-3">Clientes da Livih. Só a equipe da plataforma vê esta tela.</p>
          </div>
          <Botao icone="mais" onClick={() => setModal({ tipo: 'nova' })}>
            Nova empresa
          </Botao>
        </div>

        {erro && <Aviso tom="erro">{erro}</Aviso>}

        {!!dados?.pedidos.length && (
          <section aria-labelledby="pedidos" className="rounded-lg border border-atencao/30 bg-atencao-suave">
            <h2 id="pedidos" className="flex items-center gap-2 px-4 pt-3 font-semibold">
              <Icone nome="alerta" className="size-4 text-atencao" />
              {plural(dados.pedidos.length, 'pedido de acesso pelo site', 'pedidos de acesso pelo site')}
            </h2>
            <ul className="divide-y divide-atencao/20">
              {dados.pedidos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-medium">
                      {p.empresa} <span className="font-normal text-texto-3">· {haQuanto(p.criado_em)}</span>
                    </p>
                    <p className="text-pequeno text-texto-2">
                      {p.nome} · {p.email}
                      {p.telefone && ` · ${p.telefone}`}
                    </p>
                    {p.mensagem && <p className="text-pequeno text-texto-3">“{p.mensagem}”</p>}
                  </div>
                  <div className="flex gap-2">
                    <Botao tamanho="sm" variante="secundario" onClick={() => setRecusar(p)}>
                      Recusar
                    </Botao>
                    <Botao tamanho="sm" onClick={() => setModal({ tipo: 'nova', pedido: p })}>
                      Criar empresa
                    </Botao>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {dados && (
          <p className="text-pequeno text-texto-2">
            {plural(ativas, 'empresa ativa', 'empresas ativas')}
            {empresas.length > ativas && ` · ${plural(empresas.length - ativas, 'suspensa', 'suspensas')}`}
            {semAcesso > 0 && ` · ${plural(semAcesso, 'dono ainda sem acesso', 'donos ainda sem acesso')}`}
          </p>
        )}

        <label className="relative block sm:max-w-sm">
          <span className="sr-only">Buscar empresas</span>
          <Icone nome="busca" className="pointer-events-none absolute top-3 left-3 size-4 text-texto-3" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por empresa ou dono"
            className="h-10 w-full rounded-md border border-borda bg-superficie pr-3 pl-9 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
        </label>

        {!dados ? (
          !erro && <p className="text-pequeno text-texto-3">Carregando empresas…</p>
        ) : !visiveis.length ? (
          <EstadoVazio icone="empresa" titulo={busca ? 'Nada encontrado' : 'Nenhuma empresa ainda'}>
            {busca ? 'Nenhuma empresa com esse nome ou dono.' : 'Crie a primeira empresa e mande o link de acesso para o dono.'}
          </EstadoVazio>
        ) : (
          <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
            {visiveis.map((e) => {
              const suspensa = e.status !== 'ativa'
              return (
                <li key={e.id} className="grid gap-x-4 gap-y-2 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto] lg:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar nome={e.nome} tamanho="sm" tom="organizacao" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        <span className="truncate">{e.nome}</span>
                        {suspensa && (
                          <span className="rounded-sm bg-erro-suave px-1.5 py-0.5 text-legenda font-medium text-erro">Suspensa</span>
                        )}
                      </p>
                      <p className="text-legenda text-texto-3">Desde {desde(e.criado_em)}</p>
                    </div>
                  </div>

                  <div className="min-w-0 text-pequeno">
                    {e.dono_email ? (
                      <>
                        <p className="truncate text-texto-2">{e.dono_nome || e.dono_email}</p>
                        {e.dono_senha_definida ? (
                          <p className="truncate text-legenda text-texto-3">{e.dono_email}</p>
                        ) : (
                          <p className="flex items-center gap-1 text-legenda font-medium text-atencao">
                            <Icone nome="relogio" className="size-3" /> Ainda não criou a senha
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="flex items-center gap-1 font-medium text-atencao">
                        <Icone nome="alerta" className="size-4" /> Sem dono
                      </p>
                    )}
                  </div>

                  <div className="text-pequeno text-texto-2">
                    <p>
                      {e.numeros ? `${e.numeros_conectados} de ${plural(e.numeros, 'número conectado', 'números conectados')}` : 'Nenhum WhatsApp'}
                    </p>
                    <p className="text-legenda text-texto-3">
                      {plural(e.conversas_30d, 'conversa', 'conversas')} em 30 dias
                      {e.ultima_mensagem_em && ` · última ${haQuanto(e.ultima_mensagem_em)}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Botao tamanho="sm" variante="secundario" icone="link" carregando={ocupado === e.id && !suspender} onClick={() => void acessoDoDono(e)}>
                      {!e.dono_email ? 'Definir dono' : e.dono_senha_definida ? 'Senha do dono' : 'Link do dono'}
                    </Botao>
                    {suspensa ? (
                      <Botao tamanho="sm" variante="secundario" onClick={() => void mudarStatus(e, 'ativa')} disabled={ocupado === e.id}>
                        Reativar
                      </Botao>
                    ) : (
                      <Botao tamanho="sm" variante="fantasma" onClick={() => setSuspender(e)}>
                        Suspender
                      </Botao>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {modal && (
        <ModalEmpresa
          modo={modal}
          aoCriada={(orgId) => {
            if (modal.tipo === 'nova' && modal.pedido) void marcarPedido(modal.pedido, { status: 'aprovado', orgId })
          }}
          aoFechar={() => {
            setModal(null)
            recarregar()
          }}
        />
      )}

      <Modal
        aberto={!!linkGerado}
        titulo={linkGerado?.tipo === 'senha' ? 'Link para senha nova' : 'Link de acesso do dono'}
        aoFechar={() => setLinkGerado(null)}
        rodape={<Botao onClick={() => setLinkGerado(null)}>Concluir</Botao>}
      >
        {linkGerado && <LinkConvite {...linkGerado} />}
      </Modal>

      <DialogoConfirmacao
        aberto={!!suspender}
        titulo={`Suspender ${suspender?.nome ?? ''}?`}
        rotuloConfirmar="Suspender"
        perigo
        carregando={!!suspender && ocupado === suspender.id}
        aoConfirmar={() => suspender && void mudarStatus(suspender, 'suspensa')}
        aoCancelar={() => setSuspender(null)}
      >
        A equipe da empresa perde o acesso e o agente para de responder. As mensagens que chegarem continuam sendo guardadas e
        nada é apagado. Dá para reativar depois.
      </DialogoConfirmacao>

      <DialogoConfirmacao
        aberto={!!recusar}
        titulo="Recusar o pedido?"
        rotuloConfirmar="Recusar"
        aoConfirmar={() => {
          if (recusar) void marcarPedido(recusar, { status: 'recusado' }).then(recarregar)
          setRecusar(null)
        }}
        aoCancelar={() => setRecusar(null)}
      >
        O pedido da {recusar?.empresa} sai da lista. Ninguém é avisado automaticamente.
      </DialogoConfirmacao>
    </div>
  )
}
