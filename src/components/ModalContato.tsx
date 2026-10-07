import { useState, type FormEvent } from 'react'
import { atualizarContato, criarContato, normalizarTelefone, type DadosContato } from '../services/crm'
import { formatarTelefone } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { useEquipe } from '../hooks/useEquipe'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Modal } from './Modal'

type Inicial = Partial<DadosContato> & { id?: string }

/** Criar ou editar contato. Ao criar, o responsável padrão é quem está criando (fica na carteira dele). */
export function ModalContato({
  aberto,
  inicial,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean
  inicial?: Inicial
  aoFechar: () => void
  aoSalvar: (id: string) => void
}) {
  const { orgAtiva, sessao } = useSessao()
  const equipe = useEquipe(orgAtiva?.id)
  const editando = !!inicial?.id
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [telefone, setTelefone] = useState(inicial?.telefone ? formatarTelefone(inicial.telefone) : '')
  const [empresa, setEmpresa] = useState(inicial?.empresa ?? '')
  const [email, setEmail] = useState(inicial?.email ?? '')
  const [responsavel, setResponsavel] = useState(editando ? (inicial?.responsavel_id ?? '') : (sessao?.user.id ?? ''))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const tel = normalizarTelefone(telefone)
  const telInvalido = tel === undefined
  const emailInvalido = !!email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!orgAtiva || telInvalido || emailInvalido) return
    setSalvando(true)
    setErro(null)
    const dados: DadosContato = {
      nome: nome.trim() || null,
      telefone: tel ?? null,
      empresa: empresa.trim() || null,
      email: email.trim() || null,
      responsavel_id: responsavel || null,
    }
    try {
      if (editando) {
        await atualizarContato(inicial!.id!, dados)
        aoSalvar(inicial!.id!)
      } else {
        aoSalvar(await criarContato(orgAtiva.id, dados))
      }
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      titulo={editando ? 'Editar contato' : 'Novo contato'}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-contato" carregando={salvando} disabled={!nome.trim() || (!editando && !tel) || telInvalido || emailInvalido}>
            {editando ? 'Salvar contato' : 'Criar contato'}
          </Botao>
        </>
      }
    >
      <form id="form-contato" onSubmit={salvar} className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <CampoTexto rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
        <CampoTexto
          rotulo="WhatsApp"
          required={!editando}
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          placeholder="(41) 99999-8888"
          erro={telInvalido ? 'Informe DDD + número, por exemplo (41) 99999-8888.' : undefined}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto rotulo="Empresa" value={empresa} onChange={(e) => setEmpresa(e.target.value)} autoComplete="off" />
          <CampoTexto
            rotulo="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            erro={emailInvalido ? 'Confira o e-mail.' : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="contato-responsavel" className="block text-pequeno font-medium text-texto-2">
            Responsável
          </label>
          <select
            id="contato-responsavel"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            className="block h-10 w-full rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none"
          >
            <option value="">Ninguém (cliente da empresa)</option>
            {equipe.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.nome || m.email}
              </option>
            ))}
          </select>
          <p className="text-legenda text-texto-3">O responsável e quem atende as conversas desse cliente veem o contato.</p>
        </div>
      </form>
    </Modal>
  )
}
