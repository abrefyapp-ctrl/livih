import { useState, type FormEvent } from 'react'
import {
  buscarCep,
  buscarCnpj,
  documentoValido,
  formatarCep,
  formatarDocumento,
  salvarCliente,
  type Cliente,
  type DadosBusca,
  type TipoCliente,
} from '../services/clientes'
import { useSessao } from '../hooks/useSessao'
import { useEquipe } from '../hooks/useEquipe'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Modal } from './Modal'

type Campos = {
  tipo: TipoCliente
  nome: string
  razao_social: string
  documento: string
  inscricao_estadual: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  email: string
  telefone: string
  observacoes: string
  responsavel: string
  ativo: boolean
}

const deCliente = (c: Cliente): Campos => ({
  tipo: c.tipo as TipoCliente,
  nome: c.nome,
  razao_social: c.razao_social ?? '',
  documento: formatarDocumento(c.documento),
  inscricao_estadual: c.inscricao_estadual ?? '',
  cep: formatarCep(c.cep),
  logradouro: c.logradouro ?? '',
  numero: c.numero ?? '',
  complemento: c.complemento ?? '',
  bairro: c.bairro ?? '',
  cidade: c.cidade ?? '',
  uf: c.uf ?? '',
  email: c.email ?? '',
  telefone: c.telefone ?? '',
  observacoes: c.observacoes ?? '',
  responsavel: c.responsavel_id ?? '',
  ativo: c.ativo,
})

/**
 * Criar ou editar cliente (lista, perfil e a partir do contato). CNPJ válido busca razão social e endereço na
 * BrasilAPI; o CEP busca o endereço. A inscrição estadual não vem da busca.
 */
export function ModalCliente({
  inicial,
  sugestao,
  aoFechar,
  aoSalvar,
}: {
  inicial?: Cliente | null
  /** Cliente novo a partir do contato: o texto de empresa e o e-mail dele. */
  sugestao?: { nome?: string | null; email?: string | null }
  aoFechar: () => void
  aoSalvar: (id: string) => void
}) {
  const { orgAtiva, sessao } = useSessao()
  const equipe = useEquipe(orgAtiva?.id)
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [c, setC] = useState<Campos>(() =>
    inicial
      ? deCliente(inicial)
      : {
          tipo: 'pj', nome: sugestao?.nome?.trim() ?? '', razao_social: '', documento: '', inscricao_estadual: '', cep: '',
          logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', email: sugestao?.email?.trim() ?? '',
          telefone: '', observacoes: '', responsavel: orgAtiva?.suporte ? '' : (sessao?.user.id ?? ''), ativo: true,
        },
  )
  const [salvando, setSalvando] = useState(false)
  const [buscando, setBuscando] = useState<'cnpj' | 'cep' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [avisoBusca, setAvisoBusca] = useState<string | null>(null)

  const muda = (campos: Partial<Campos>) => setC((v) => ({ ...v, ...campos }))
  const docDigitos = c.documento.replace(/\D/g, '')
  const docInvalido = !!docDigitos && !documentoValido(c.tipo, docDigitos)
  const cepInvalido = !!c.cep.trim() && c.cep.replace(/\D/g, '').length !== 8
  const ufInvalida = !!c.uf.trim() && !/^[A-Za-z]{2}$/.test(c.uf.trim())
  const emailInvalido = !!c.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())

  /** Preenche só o que está vazio: o que a pessoa já digitou fica. */
  function preencher(d: DadosBusca) {
    setC((v) => {
      const novo = { ...v }
      for (const [k, valor] of Object.entries(d) as [keyof DadosBusca, string | null | undefined][]) {
        if (valor && !String(v[k] ?? '').trim()) novo[k] = k === 'cep' ? formatarCep(valor) : valor
      }
      return novo
    })
  }

  async function consultar(tipo: 'cnpj' | 'cep') {
    setBuscando(tipo)
    setAvisoBusca(null)
    try {
      preencher(tipo === 'cnpj' ? await buscarCnpj(docDigitos) : await buscarCep(c.cep))
    } catch (e) {
      setAvisoBusca((e as Error).message)
    } finally {
      setBuscando(null)
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!orgAtiva || docInvalido || cepInvalido || ufInvalida || emailInvalido) return
    setSalvando(true)
    setErro(null)
    const vazio = (s: string) => s.trim() || null
    try {
      const id = await salvarCliente(orgAtiva.id, inicial?.id ?? null, {
        tipo: c.tipo,
        nome: c.nome.trim(),
        razao_social: c.tipo === 'pj' ? vazio(c.razao_social) : null,
        documento: docDigitos || null,
        inscricao_estadual: c.tipo === 'pj' ? vazio(c.inscricao_estadual) : null,
        cep: c.cep.replace(/\D/g, '') || null,
        logradouro: vazio(c.logradouro),
        numero: vazio(c.numero),
        complemento: vazio(c.complemento),
        bairro: vazio(c.bairro),
        cidade: vazio(c.cidade),
        uf: c.uf.trim().toUpperCase() || null,
        email: vazio(c.email),
        telefone: vazio(c.telefone),
        observacoes: vazio(c.observacoes),
        ativo: c.ativo,
        // Só dono e admin mexem na carteira; para os outros, o banco põe quem criou.
        ...(gerencia ? { responsavel_id: c.responsavel || null } : {}),
      })
      aoSalvar(id)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const pj = c.tipo === 'pj'

  return (
    <Modal
      aberto
      titulo={inicial ? 'Editar cliente' : 'Novo cliente'}
      aoFechar={aoFechar}
      largura="max-w-2xl"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao
            type="submit"
            form="form-cliente"
            carregando={salvando}
            disabled={!c.nome.trim() || docInvalido || cepInvalido || ufInvalida || emailInvalido}
          >
            {inicial ? 'Salvar cliente' : 'Criar cliente'}
          </Botao>
        </>
      }
    >
      <form id="form-cliente" onSubmit={salvar} className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}

        <fieldset className="flex gap-2">
          <legend className="sr-only">Tipo de cliente</legend>
          {(['pj', 'pf'] as const).map((t) => (
            <label
              key={t}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-pequeno ring-1 ring-inset ${
                c.tipo === t ? 'bg-primaria-suave font-medium text-primaria ring-primaria' : 'ring-borda'
              }`}
            >
              <input type="radio" name="tipo-cliente" className="sr-only" checked={c.tipo === t} onChange={() => muda({ tipo: t })} />
              {t === 'pj' ? 'Empresa (CNPJ)' : 'Pessoa física (CPF)'}
            </label>
          ))}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <CampoTexto
            rotulo={pj ? 'CNPJ (opcional)' : 'CPF (opcional)'}
            inputMode="numeric"
            value={c.documento}
            onChange={(e) => muda({ documento: e.target.value })}
            onBlur={() => !docInvalido && docDigitos && muda({ documento: formatarDocumento(docDigitos) })}
            placeholder={pj ? '00.000.000/0000-00' : '000.000.000-00'}
            erro={docInvalido ? `${pj ? 'CNPJ' : 'CPF'} inválido: confira os números.` : undefined}
          />
          {pj && (
            <Botao
              variante="secundario"
              icone="busca"
              onClick={() => void consultar('cnpj')}
              carregando={buscando === 'cnpj'}
              disabled={!docDigitos || docInvalido}
            >
              Buscar dados
            </Botao>
          )}
        </div>
        {avisoBusca && <Aviso tom="atencao">{avisoBusca}</Aviso>}

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            rotulo={pj ? 'Nome fantasia' : 'Nome'}
            required
            maxLength={200}
            value={c.nome}
            onChange={(e) => muda({ nome: e.target.value })}
            ajuda={pj ? 'Como a equipe chama o cliente.' : undefined}
          />
          {pj && (
            <CampoTexto
              rotulo="Razão social"
              maxLength={200}
              value={c.razao_social}
              onChange={(e) => muda({ razao_social: e.target.value })}
              ajuda="Vai no orçamento e na nota."
            />
          )}
        </div>
        {pj && (
          <CampoTexto
            rotulo="Inscrição estadual (opcional)"
            maxLength={30}
            value={c.inscricao_estadual}
            onChange={(e) => muda({ inscricao_estadual: e.target.value })}
            placeholder="Número ou ISENTO"
            className="sm:max-w-xs"
          />
        )}

        <div className="space-y-3 rounded-md border border-borda p-3">
          <p className="text-pequeno font-medium text-texto-2">Endereço de faturamento</p>
          <div className="grid gap-3 sm:grid-cols-[10rem_auto] sm:items-end">
            <CampoTexto
              rotulo="CEP"
              inputMode="numeric"
              value={c.cep}
              onChange={(e) => muda({ cep: e.target.value })}
              placeholder="00000-000"
              erro={cepInvalido ? '8 números' : undefined}
            />
            <Botao
              variante="secundario"
              tamanho="sm"
              icone="busca"
              onClick={() => void consultar('cep')}
              carregando={buscando === 'cep'}
              disabled={c.cep.replace(/\D/g, '').length !== 8}
              className="justify-self-start"
            >
              Buscar CEP
            </Botao>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
            <CampoTexto rotulo="Rua" maxLength={200} value={c.logradouro} onChange={(e) => muda({ logradouro: e.target.value })} />
            <CampoTexto rotulo="Número" maxLength={20} value={c.numero} onChange={(e) => muda({ numero: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoTexto rotulo="Complemento" maxLength={100} value={c.complemento} onChange={(e) => muda({ complemento: e.target.value })} />
            <CampoTexto rotulo="Bairro" maxLength={100} value={c.bairro} onChange={(e) => muda({ bairro: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_5rem]">
            <CampoTexto rotulo="Cidade" maxLength={100} value={c.cidade} onChange={(e) => muda({ cidade: e.target.value })} />
            <CampoTexto
              rotulo="UF"
              maxLength={2}
              value={c.uf}
              onChange={(e) => muda({ uf: e.target.value.toUpperCase() })}
              erro={ufInvalida ? '2 letras' : undefined}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            rotulo="E-mail (opcional)"
            type="email"
            maxLength={200}
            value={c.email}
            onChange={(e) => muda({ email: e.target.value })}
            ajuda="Para orçamento e nota. Os WhatsApps ficam nos contatos."
            erro={emailInvalido ? 'Confira o e-mail.' : undefined}
          />
          <CampoTexto rotulo="Telefone fixo (opcional)" maxLength={30} value={c.telefone} onChange={(e) => muda({ telefone: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cliente-responsavel" className="block text-pequeno font-medium text-texto-2">
            Vendedor responsável
          </label>
          <select
            id="cliente-responsavel"
            value={c.responsavel}
            onChange={(e) => muda({ responsavel: e.target.value })}
            disabled={!gerencia}
            className="block h-10 w-full rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none disabled:bg-fundo disabled:text-texto-3"
          >
            <option value="">Ninguém (cliente da empresa)</option>
            {equipe.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.nome || m.email}
              </option>
            ))}
          </select>
          <p className="text-legenda text-texto-3">
            {gerencia ? 'Define a carteira: o vendedor vê os clientes dele.' : 'Só dono e admin trocam o vendedor responsável.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cliente-obs" className="block text-pequeno font-medium text-texto-2">
            Observações (opcional)
          </label>
          <textarea
            id="cliente-obs"
            rows={2}
            maxLength={2000}
            value={c.observacoes}
            onChange={(e) => muda({ observacoes: e.target.value })}
            placeholder="Ex.: entrega só pela manhã; pagamento combinado em 28 dias."
            className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
        </div>

        {inicial && (
          <label className="flex items-center gap-2 text-pequeno text-texto-2">
            <input type="checkbox" checked={c.ativo} onChange={(e) => muda({ ativo: e.target.checked })} className="size-4 accent-primaria" />
            Ativo (inativo some das buscas de cliente)
          </label>
        )}
      </form>
    </Modal>
  )
}
