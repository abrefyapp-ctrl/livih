import { useEffect, useState, type FormEvent } from 'react'
import { enviarModelo } from '../services/atendimento'
import { listarModelos, partesDe, ROTULO_CATEGORIA, textoEnviado, variaveisDe, type Modelo } from '../services/modelos'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Modal } from './Modal'
import { PreviaModelo } from './PreviaModelo'

/** Escolher um modelo aprovado, preencher as variáveis e enviar pela API oficial. */
export function ModalEnviarModelo({
  aberto,
  orgId,
  canalId,
  conversaId,
  nomeContato,
  aoFechar,
}: {
  aberto: boolean
  orgId: string
  canalId: string
  conversaId: string
  nomeContato: string
  aoFechar: () => void
}) {
  const [modelos, setModelos] = useState<{ canalId: string; lista: Modelo[] } | null>(null)
  const [erroLista, setErroLista] = useState<string | null>(null)
  const [escolhido, setEscolhido] = useState<string>('')
  const [valores, setValores] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!aberto) return
    let ativo = true
    listarModelos(orgId, canalId)
      .then((l) => ativo && setModelos({ canalId, lista: l.filter((m) => m.status === 'APPROVED') }))
      .catch((e) => ativo && setErroLista((e as Error).message))
    return () => {
      ativo = false
    }
  }, [aberto, orgId, canalId])

  const lista = modelos?.canalId === canalId ? modelos.lista : null
  const modelo = lista?.find((m) => m.id === escolhido) ?? null
  const partes = modelo ? partesDe(modelo) : null
  const variaveis = partes ? variaveisDe(partes.corpo) : []
  const completo = variaveis.every((n) => valores[n - 1]?.trim())

  function escolher(id: string) {
    setEscolhido(id)
    setErro(null)
    // O nome do contato costuma ser a primeira variável: já vem preenchido, dá para trocar.
    const m = lista?.find((x) => x.id === id)
    setValores(m && variaveisDe(partesDe(m).corpo).length ? [nomeContato] : [])
  }

  function fechar() {
    setEscolhido('')
    setValores([])
    setErro(null)
    aoFechar()
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!modelo || !completo) return
    setEnviando(true)
    setErro(null)
    try {
      const parametros = variaveis.map((n) => valores[n - 1].trim())
      await enviarModelo(conversaId, modelo.name, modelo.language, parametros, textoEnviado(modelo, valores))
      fechar()
    } catch {
      setErro('O modelo não foi enviado. Confira a conexão e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      aberto={aberto}
      titulo="Enviar modelo"
      largura="max-w-2xl"
      aoFechar={fechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={fechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-enviar-modelo" icone="enviar" carregando={enviando} disabled={!modelo || !completo}>
            Enviar
          </Botao>
        </>
      }
    >
      {erroLista ? (
        <Aviso tom="erro">{erroLista}</Aviso>
      ) : !lista ? (
        <p className="text-pequeno text-texto-3" aria-busy="true">
          Consultando os modelos aprovados…
        </p>
      ) : !lista.length ? (
        <Aviso tom="atencao">
          Este número ainda não tem modelo aprovado pela Meta. Crie um em Configurações → Modelos e espere a aprovação.
        </Aviso>
      ) : (
        <form id="form-enviar-modelo" onSubmit={enviar} className="grid gap-6 md:grid-cols-[1fr_16rem]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="escolha-modelo" className="block text-pequeno font-medium text-texto-2">
                Modelo
              </label>
              <select
                id="escolha-modelo"
                required
                value={escolhido}
                onChange={(e) => escolher(e.target.value)}
                className="block h-10 w-full rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none"
              >
                <option value="" disabled>
                  Escolha um modelo aprovado
                </option>
                {lista.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {ROTULO_CATEGORIA[m.category] ?? m.category}
                  </option>
                ))}
              </select>
            </div>

            {variaveis.map((n) => (
              <CampoTexto
                key={`${escolhido}-${n}`}
                rotulo={`Variável {{${n}}}`}
                required
                value={valores[n - 1] ?? ''}
                onChange={(e) => {
                  const novos = [...valores]
                  novos[n - 1] = e.target.value
                  setValores(novos)
                }}
              />
            ))}

            {modelo && (
              <p className="text-legenda text-texto-3">
                O modelo é cobrado pela Meta por conversa iniciada. Quando {nomeContato} responder, a conversa volta a aceitar
                texto livre por 24 horas.
              </p>
            )}
            {erro && <Aviso tom="erro">{erro}</Aviso>}
          </div>

          <div className="space-y-2 md:sticky md:top-0 md:self-start">
            <p className="text-pequeno font-medium text-texto-2">Prévia</p>
            {partes ? (
              <PreviaModelo {...partes} valores={valores} />
            ) : (
              <p className="text-pequeno text-texto-3">Escolha um modelo para ver como ele chega.</p>
            )}
          </div>
        </form>
      )}
    </Modal>
  )
}
