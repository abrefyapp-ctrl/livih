import { useState, type FormEvent } from 'react'
import { convidarDono } from '../services/configuracoes'
import { criarEmpresa, type Empresa, type PedidoAcesso } from '../services/plataforma'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { LinkConvite } from './LinkConvite'
import { Modal } from './Modal'

export type ModoEmpresa = { tipo: 'nova'; pedido?: PedidoAcesso } | { tipo: 'dono'; empresa: Empresa }

/**
 * Empresa nova (nome + dono) ou só o dono de uma empresa que ficou sem. Cria a empresa e depois o acesso do
 * dono; se o acesso falhar, a empresa já existe e o botão tenta só o acesso de novo.
 */
export function ModalEmpresa({
  modo,
  aoCriada,
  aoFechar,
}: {
  modo: ModoEmpresa
  /** A empresa passou a existir (antes do link do dono): marca o pedido do site, se houver. */
  aoCriada: (orgId: string) => void
  aoFechar: () => void
}) {
  const pedido = modo.tipo === 'nova' ? modo.pedido : undefined
  const [nomeEmpresa, setNomeEmpresa] = useState(modo.tipo === 'dono' ? modo.empresa.nome : (pedido?.empresa ?? ''))
  const [nomeDono, setNomeDono] = useState(pedido?.nome ?? '')
  const [email, setEmail] = useState(pedido?.email ?? '')
  const [orgId, setOrgId] = useState<string | null>(modo.tipo === 'dono' ? modo.empresa.id : null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ link: string | null; aviso?: string | null } | null>(null)

  const emailInvalido = !!email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const criada = !!orgId && modo.tipo === 'nova'

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (emailInvalido) return
    setEnviando(true)
    setErro(null)
    let id = orgId
    try {
      if (!id) {
        id = await criarEmpresa(nomeEmpresa.trim())
        setOrgId(id)
        aoCriada(id)
      }
      setResultado(await convidarDono(id, { email: email.trim(), nome: nomeDono.trim() }))
    } catch (err) {
      const msg = (err as Error).message
      setErro(id && modo.tipo === 'nova' ? `A empresa foi criada, mas o acesso do dono não: ${msg}` : msg)
    } finally {
      setEnviando(false)
    }
  }

  if (resultado) {
    return (
      <Modal aberto titulo={`${nomeEmpresa} está pronta`} aoFechar={aoFechar} rodape={<Botao onClick={aoFechar}>Concluir</Botao>}>
        {resultado.link ? (
          <LinkConvite link={resultado.link} nome={nomeDono || email} nomeOrg={nomeEmpresa} tipo="dono" />
        ) : (
          <div className="space-y-3">
            <p>
              {email} já tinha conta no Livih e agora é dono(a) da {nomeEmpresa}.
            </p>
            {resultado.aviso ? <Aviso tom="atencao">{resultado.aviso}</Aviso> : <p>Entra com a senha que já usa.</p>}
          </div>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      aberto
      titulo={modo.tipo === 'nova' ? 'Nova empresa' : `Dono da ${modo.empresa.nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={enviando}>
            {criada ? 'Fechar' : 'Cancelar'}
          </Botao>
          <Botao
            type="submit"
            form="form-empresa"
            carregando={enviando}
            disabled={!nomeEmpresa.trim() || !email.trim() || emailInvalido}
          >
            {criada ? 'Tentar o acesso de novo' : modo.tipo === 'nova' ? 'Criar empresa' : 'Gerar acesso'}
          </Botao>
        </>
      }
    >
      <form id="form-empresa" onSubmit={enviar} className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {modo.tipo === 'nova' && (
          <CampoTexto
            rotulo="Nome da empresa"
            required
            value={nomeEmpresa}
            onChange={(e) => setNomeEmpresa(e.target.value)}
            disabled={criada}
            autoComplete="off"
            placeholder="Como aparece no topo do app"
          />
        )}
        <fieldset className="space-y-4">
          <legend className="mb-1 font-semibold">Dono</legend>
          <p className="-mt-2 text-pequeno text-texto-3">
            Quem contratou. Recebe um link para criar a senha, conecta o WhatsApp, configura o agente e convida a equipe.
          </p>
          <CampoTexto rotulo="Nome" value={nomeDono} onChange={(e) => setNomeDono(e.target.value)} autoComplete="off" />
          <CampoTexto
            rotulo="E-mail"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            placeholder="dono@empresa.com.br"
            erro={emailInvalido ? 'Confira o e-mail.' : undefined}
          />
        </fieldset>
      </form>
    </Modal>
  )
}
