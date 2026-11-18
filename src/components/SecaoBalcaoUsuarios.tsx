import { useEffect, useState, type FormEvent } from 'react'
import { useSessao } from '../hooks/useSessao'
import { definirUsuarioBalcao, listarUsuariosBalcao, type UsuarioBalcao } from '../services/balcao'
import { convidarMembro, linkNovaSenha } from '../services/configuracoes'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Interruptor } from './Interruptor'
import { LinkConvite } from './LinkConvite'
import { Modal } from './Modal'

// Usuários do balcão (docs/balcao.md, decisão de 18/11): um acesso só para a área do balcão, cadastrado pelo dono ou
// admin. Não é da equipe: não conecta WhatsApp, não recebe conversas e só vê o balcão, as vendas de balcão, os
// produtos e os clientes. Aparece em Configurações → Equipe quando o módulo Balcão está ligado.

export function SecaoBalcaoUsuarios() {
  const { orgAtiva, modulos } = useSessao()
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const ligado = !!modulos && modulos.has('erp') && modulos.has('balcao')
  if (!orgAtiva || !gerencia || !ligado) return null
  return <Lista key={orgAtiva.id} orgId={orgAtiva.id} nomeOrg={orgAtiva.nome} />
}

function Lista({ orgId, nomeOrg }: { orgId: string; nomeOrg: string }) {
  const [lista, setLista] = useState<UsuarioBalcao[] | null>(null)
  const [versao, setVersao] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [linkSenha, setLinkSenha] = useState<{ nome: string; link: string } | null>(null)

  useEffect(() => {
    let ativo = true
    listarUsuariosBalcao(orgId)
      .then((l) => ativo && setLista(l))
      .catch((e) => ativo && setErro((e as Error).message))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  async function mudar(u: UsuarioBalcao, campos: { ativo?: boolean; emiteNota?: boolean }) {
    setOcupado(u.user_id)
    setErro(null)
    try {
      await definirUsuarioBalcao(orgId, u.user_id, campos)
      setVersao((v) => v + 1)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  async function novaSenha(u: UsuarioBalcao) {
    setOcupado(u.user_id)
    setErro(null)
    try {
      const link = await linkNovaSenha(orgId, u.email, true)
      if (link) setLinkSenha({ nome: u.nome, link })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <section aria-labelledby="titulo-usuarios-balcao" className="mt-6 rounded-lg border border-borda bg-superficie">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-borda px-4 py-3">
        <div className="min-w-0">
          <h2 id="titulo-usuarios-balcao" className="font-semibold">
            Usuários do balcão
          </h2>
          <p className="text-pequeno text-texto-3">
            Acesso só ao balcão, às vendas de balcão, aos produtos e aos clientes. Não atende conversas nem conecta
            WhatsApp.
          </p>
        </div>
        <Botao tamanho="sm" icone="mais" onClick={() => setNovo(true)}>
          Cadastrar usuário do balcão
        </Botao>
      </div>
      {erro && (
        <div className="px-4 pt-3">
          <Aviso tom="erro">{erro}</Aviso>
        </div>
      )}
      {!lista ? (
        <p className="px-4 py-4 text-pequeno text-texto-3">{erro ? '' : 'Carregando…'}</p>
      ) : !lista.length ? (
        <p className="px-4 py-4 text-pequeno text-texto-3">
          Nenhum usuário do balcão ainda. Cadastre quem vende no balcão: ele entra direto na tela do Balcão.
        </p>
      ) : (
        <ul className="divide-y divide-borda">
          {lista.map((u) => (
            <li key={u.user_id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${u.ativo ? '' : 'opacity-60'}`}>
              <div className="min-w-48 flex-1">
                <p className="font-medium">{u.nome}</p>
                <p className="text-legenda text-texto-3">
                  {u.email}
                  {!u.ativo && ' · sem acesso'}
                </p>
              </div>
              {u.ativo && (
                <Interruptor
                  ligado={u.emite_nota_fiscal}
                  desabilitado={ocupado === u.user_id}
                  aoMudar={(v) => void mudar(u, { emiteNota: v })}
                  title="Emite a NF-e das vendas de balcão"
                >
                  Emite nota fiscal
                </Interruptor>
              )}
              {u.ativo && (
                <Botao tamanho="sm" variante="fantasma" disabled={ocupado === u.user_id} onClick={() => void novaSenha(u)}>
                  Link de senha nova
                </Botao>
              )}
              <Botao
                tamanho="sm"
                variante={u.ativo ? 'perigoTexto' : 'secundario'}
                disabled={ocupado === u.user_id}
                onClick={() => void mudar(u, { ativo: !u.ativo })}
              >
                {u.ativo ? 'Tirar acesso' : 'Devolver acesso'}
              </Botao>
            </li>
          ))}
        </ul>
      )}

      <ModalNovoUsuario
        aberto={novo}
        orgId={orgId}
        nomeOrg={nomeOrg}
        aoFechar={() => setNovo(false)}
        aoCadastrar={() => setVersao((v) => v + 1)}
      />
      <Modal
        aberto={!!linkSenha}
        titulo="Link de senha nova"
        aoFechar={() => setLinkSenha(null)}
        rodape={<Botao onClick={() => setLinkSenha(null)}>Concluir</Botao>}
      >
        {linkSenha && <LinkConvite link={linkSenha.link} nome={linkSenha.nome} nomeOrg={nomeOrg} tipo="senha" />}
      </Modal>
    </section>
  )
}

function ModalNovoUsuario({
  aberto,
  orgId,
  nomeOrg,
  aoFechar,
  aoCadastrar,
}: {
  aberto: boolean
  orgId: string
  nomeOrg: string
  aoFechar: () => void
  aoCadastrar: () => void
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ link: string | null; aviso: string | null } | null>(null)

  function fechar() {
    setNome('')
    setEmail('')
    setErro(null)
    setResultado(null)
    aoFechar()
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    try {
      const r = await convidarMembro(orgId, { email, nome, papel: 'balcao' })
      setResultado({ link: r.link, aviso: r.aviso ?? null })
      aoCadastrar()
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
        titulo={resultado.link ? 'Usuário do balcão cadastrado' : 'Acesso ao balcão liberado'}
        aoFechar={fechar}
        rodape={<Botao onClick={fechar}>Concluir</Botao>}
      >
        {resultado.link ? (
          <LinkConvite link={resultado.link} nome={nome || email} nomeOrg={nomeOrg} tipo="balcao" />
        ) : (
          <div className="space-y-3">
            <p>{email} já tinha conta na Livih e agora entra no balcão.</p>
            {resultado.aviso ? <Aviso tom="atencao">{resultado.aviso}</Aviso> : <p>Entra com a senha que já usa.</p>}
          </div>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      aberto={aberto}
      titulo="Cadastrar usuário do balcão"
      aoFechar={fechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={fechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-usuario-balcao" carregando={enviando} disabled={!email.trim()}>
            Cadastrar
          </Botao>
        </>
      }
    >
      <form id="form-usuario-balcao" onSubmit={enviar} className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <CampoTexto rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" placeholder="Quem vende no balcão" />
        <CampoTexto
          rotulo="E-mail"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          placeholder="balcao@empresa.com.br"
        />
        <p className="text-legenda text-texto-3">
          Use um e-mail que não seja de alguém da equipe. Não enviamos e-mail: você recebe um link para mandar à pessoa.
          Para ela emitir a NF-e, ligue “Emite nota fiscal” na lista depois.
        </p>
      </form>
    </Modal>
  )
}
