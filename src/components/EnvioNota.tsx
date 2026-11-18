import { useState } from 'react'
import { useDestinosNota } from '../hooks/useDestinosNota'
import { formInicial, paraEnvio, problemaEnvio, querEnviar, type FormEnvio } from '../services/envioNota'
import { formatarTelefoneLocal } from '../services/formato'
import { pedirEnvioNota, type DestinosNota, type EnvioNota } from '../services/nfe'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'

// Mandar a NF-e ao cliente pelo WhatsApp e por e-mail (docs/balcao.md, entrega 2; decisões de 27/10). Usado no
// Balcão (antes de fechar) e no bloco da nota do pedido ("Enviar ao cliente", depois).
//
// De onde vem o WhatsApp: o contato do cliente que conversou por último (vários: lista, o mais recente escolhido);
// sem contato, o telefone do cliente só se for celular; fixo deixa vazio com "Pergunte o WhatsApp ao cliente".
// De onde vem o e-mail: o do cliente; sem ele, o de um contato. E-mail corrigido: "Salvar no cadastro do cliente".

const CAMPO = 'h-9 w-full rounded-md border border-borda bg-superficie px-2 text-pequeno placeholder:text-texto-3 focus:border-primaria focus:outline-none'

export function CamposEnvio({ destinos, valor, aoMudar }: { destinos: DestinosNota | null; valor: FormEnvio; aoMudar: (f: FormEnvio) => void }) {
  const muda = (p: Partial<FormEnvio>) => aoMudar({ ...valor, ...p })
  const contatos = destinos?.contatos ?? []
  const mudouEmail = valor.email && !!destinos && valor.endereco.trim().toLowerCase() !== (destinos.email ?? '').toLowerCase()
  return (
    <div className="space-y-2 text-pequeno">
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={valor.whatsapp} onChange={(e) => muda({ whatsapp: e.target.checked })} className="size-4 accent-primaria" />
        Mandar pelo WhatsApp
      </label>
      {valor.whatsapp && (
        <div className="space-y-1.5 pl-6">
          {contatos.length > 1 && (
            <select
              aria-label="Contato do cliente"
              value={valor.contatoId ?? ''}
              onChange={(e) => {
                const c = contatos.find((x) => x.id === e.target.value)
                muda({ contatoId: c?.id ?? null, numero: c ? formatarTelefoneLocal(c.telefone) : '' })
              }}
              className={CAMPO}
            >
              {contatos.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.nome || 'Contato') + ' · ' + formatarTelefoneLocal(c.telefone)}
                </option>
              ))}
              <option value="">Outro número</option>
            </select>
          )}
          <input
            aria-label="WhatsApp do cliente"
            inputMode="tel"
            value={valor.numero}
            onChange={(e) => muda({ numero: e.target.value })}
            placeholder="(41) 99999-8888"
            className={CAMPO}
          />
          {!valor.numero.trim() && <p className="text-legenda text-atencao">Pergunte o WhatsApp ao cliente.</p>}
          {destinos && <p className="text-legenda text-texto-3">Um número novo fica ligado a este cliente.</p>}
        </div>
      )}
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={valor.email} onChange={(e) => muda({ email: e.target.checked })} className="size-4 accent-primaria" />
        Mandar por e-mail
      </label>
      {valor.email && (
        <div className="space-y-1.5 pl-6">
          <input
            aria-label="E-mail do cliente"
            type="email"
            value={valor.endereco}
            onChange={(e) => muda({ endereco: e.target.value })}
            placeholder="financeiro@cliente.com.br"
            className={CAMPO}
          />
          {mudouEmail && (
            <label className="flex cursor-pointer items-center gap-2 text-legenda text-texto-2">
              <input type="checkbox" checked={valor.salvarEmail} onChange={(e) => muda({ salvarEmail: e.target.checked })} className="size-4 accent-primaria" />
              Salvar no cadastro do cliente
            </label>
          )}
        </div>
      )}
    </div>
  )
}

const ROTULO_CANAL = { whatsapp: 'WhatsApp', email: 'E-mail' } as const

export function ListaEnvios({ envios }: { envios: EnvioNota[] }) {
  if (!envios.length) return null
  return (
    <ul className="space-y-1 text-pequeno">
      {envios.map((e) => (
        <li key={e.id} className="flex items-start gap-2">
          <Icone
            nome={e.situacao === 'erro' ? 'erro' : e.situacao === 'enviado' ? 'check' : 'relogio'}
            className={`mt-0.5 size-4 shrink-0 ${e.situacao === 'erro' ? 'text-erro' : e.situacao === 'enviado' ? 'text-primaria' : 'text-texto-3'}`}
          />
          <span className="min-w-0">
            {ROTULO_CANAL[e.canal]} {e.canal === 'whatsapp' ? formatarTelefoneLocal(e.destino) : e.destino}
            <span className="text-texto-3">
              {' · '}
              {e.situacao === 'pendente'
                ? 'sai quando a nota for autorizada'
                : e.situacao === 'enviando'
                  ? 'enviando…'
                  : (e.resultado ?? (e.situacao === 'enviado' ? 'enviado' : 'não enviado'))}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}


export function ModalEnviarNota({
  notaId,
  clienteId,
  aoFechar,
  aoEnviar,
}: {
  notaId: string
  clienteId: string | null
  aoFechar: () => void
  aoEnviar: (envios: EnvioNota[]) => void
}) {
  const { carregado, destinos } = useDestinosNota(clienteId)
  if (!carregado) return null
  return <FormModal notaId={notaId} destinos={destinos} aoFechar={aoFechar} aoEnviar={aoEnviar} />
}

function FormModal({
  notaId,
  destinos,
  aoFechar,
  aoEnviar,
}: {
  notaId: string
  destinos: DestinosNota | null
  aoFechar: () => void
  aoEnviar: (envios: EnvioNota[]) => void
}) {
  const [form, setForm] = useState<FormEnvio>(() => formInicial(destinos))
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const problema = querEnviar(form) ? problemaEnvio(form) : 'Marque o WhatsApp ou o e-mail.'

  async function enviar() {
    if (problema) return
    setEnviando(true)
    setErro(null)
    try {
      aoEnviar(await pedirEnvioNota(paraEnvio(notaId, form, destinos)))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo="Enviar a nota ao cliente"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao icone="enviar" onClick={() => void enviar()} disabled={!!problema} carregando={enviando}>
            Enviar
          </Botao>
        </>
      }
    >
      <div className="space-y-3">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <p className="text-pequeno text-texto-2">
          Vai o PDF da nota (DANFE). Pelo WhatsApp, sai pelo número da empresa e fica na conversa do cliente; o e-mail é
          mandado pela Focus e pode levar alguns minutos.
        </p>
        <CamposEnvio destinos={destinos} valor={form} aoMudar={setForm} />
        {problema && querEnviar(form) && <p className="text-legenda text-texto-3">{problema}</p>}
      </div>
    </Modal>
  )
}
