import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { atualizarContato, normalizarTelefone } from '../services/crm'
import { criarPedido, listarPedidos, type Pedido } from '../services/erp'
import { formatarTelefone, moeda, nomeDoContato, quandoCurto } from '../services/formato'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Modal } from './Modal'

type Contato = { id: string; nome: string | null; nome_whatsapp: string | null; telefone: string | null }

/**
 * Orçamento a partir da conversa: cria o pedido (rascunho) já com o cliente e abre. Sem nome ou telefone no
 * cadastro, pede antes (saem no PDF). Se o cliente já tem rascunho, mostra para abrir em vez de duplicar.
 */
export function ModalNovoOrcamento({ contato, aoFechar }: { contato: Contato; aoFechar: () => void }) {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const navegar = useNavigate()
  const faltaNome = !contato.nome?.trim()
  const faltaTelefone = !contato.telefone
  const faltaDados = faltaNome || faltaTelefone
  const [nome, setNome] = useState(contato.nome ?? contato.nome_whatsapp ?? '')
  const [telefone, setTelefone] = useState(formatarTelefone(contato.telefone))
  const [rascunhos, setRascunhos] = useState<Pedido[] | null>(null)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarPedidos(orgId, 'rascunho', contato.id)
      .then((l) => ativo && setRascunhos(l))
      .catch(() => ativo && setRascunhos([]))
    return () => {
      ativo = false
    }
  }, [orgId, contato.id])

  const tel = normalizarTelefone(telefone)

  async function criar(e: FormEvent) {
    e.preventDefault()
    if (faltaDados) {
      if (!nome.trim()) return setErro('Informe o nome do cliente.')
      if (!tel) return setErro('Informe o telefone do cliente com DDD.')
    }
    setCriando(true)
    setErro(null)
    try {
      if (faltaDados) await atualizarContato(contato.id, { nome: nome.trim(), telefone: tel })
      navegar(`/pedidos/${await criarPedido(orgId, contato.id)}`)
    } catch (err) {
      setErro((err as Error).message)
      setCriando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo="Novo orçamento"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={criando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-novo-orcamento" icone="mais" carregando={criando} disabled={!rascunhos}>
            {rascunhos?.length ? 'Criar outro orçamento' : 'Criar orçamento'}
          </Botao>
        </>
      }
    >
      <form id="form-novo-orcamento" onSubmit={criar} className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        {faltaDados ? (
          <>
            <p className="text-pequeno">
              O cadastro deste cliente está sem {faltaNome && faltaTelefone ? 'nome e telefone' : faltaNome ? 'nome' : 'telefone'}, que
              saem no orçamento. Complete antes de criar:
            </p>
            <CampoTexto
              rotulo="Nome do cliente"
              required
              maxLength={120}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              ajuda={faltaNome && contato.nome_whatsapp ? 'Sugestão: o nome que aparece no WhatsApp dele.' : undefined}
            />
            <CampoTexto
              rotulo="Telefone"
              required
              inputMode="tel"
              placeholder="(41) 99999-8888"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              erro={tel === undefined ? 'Telefone inválido. Use DDD e número.' : undefined}
            />
          </>
        ) : (
          <p className="text-pequeno">
            Orçamento para <strong className="font-semibold text-texto">{nomeDoContato(contato)}</strong> ·{' '}
            {formatarTelefone(contato.telefone)}. Ele abre como rascunho para você adicionar os itens.
          </p>
        )}

        {!rascunhos ? (
          <p className="text-legenda text-texto-3">Procurando orçamentos deste cliente…</p>
        ) : (
          rascunhos.length > 0 && (
            <div className="space-y-2">
              <p className="text-pequeno font-medium text-texto">Este cliente já tem orçamento em rascunho:</p>
              <ul className="divide-y divide-borda rounded-md border border-borda">
                {rascunhos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => navegar(`/pedidos/${p.id}`)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-pequeno hover:bg-fundo"
                    >
                      <span>
                        <span className="font-medium text-primaria">Orçamento #{p.numero}</span>
                        <span className="text-texto-3"> · {quandoCurto(p.criado_em).toLowerCase()}</span>
                      </span>
                      <span className="text-texto-2 tabular-nums">{moeda(Number(p.total), true)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
      </form>
    </Modal>
  )
}
