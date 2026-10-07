import { useEffect, useState } from 'react'
import { criarNota, listarNotas, type Nota } from '../services/atendimento'
import { quandoCurto } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { Aviso } from './Aviso'
import { Botao } from './Botao'

/** Notas da equipe sobre um contato (e, se vier, ligadas à conversa em que foram escritas). */
export function NotasContato({ contatoId, conversaId }: { contatoId: string; conversaId?: string }) {
  const { orgAtiva, equipe } = useSessao()
  const [notas, setNotas] = useState<{ contatoId: string; lista: Nota[] } | null>(null)
  const [versao, setVersao] = useState(0)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarNotas(contatoId)
      .then((lista) => ativo && setNotas({ contatoId, lista }))
      .catch(() => ativo && setErro('Não foi possível carregar as notas.'))
    return () => {
      ativo = false
    }
  }, [contatoId, versao])

  const lista = notas?.contatoId === contatoId ? notas.lista : []

  async function salvar() {
    if (!orgAtiva || !texto.trim()) return
    setSalvando(true)
    setErro(null)
    try {
      await criarNota(orgAtiva.id, contatoId, conversaId ?? null, texto.trim())
      setTexto('')
      setVersao((v) => v + 1)
    } catch {
      setErro('A nota não foi salva. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void salvar()
        }}
        className="space-y-2"
      >
        <label htmlFor={`nota-${contatoId}`} className="sr-only">
          Nova nota
        </label>
        <textarea
          id={`nota-${contatoId}`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          placeholder="Anote algo que a equipe precisa saber"
          className="block w-full resize-none rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno placeholder:text-texto-3 focus:border-primaria focus:outline-none"
        />
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <Botao type="submit" variante="secundario" tamanho="sm" icone="nota" carregando={salvando} disabled={!texto.trim()}>
          Salvar nota
        </Botao>
      </form>
      {lista.length > 0 && (
        <ul className="mt-4 space-y-3">
          {lista.map((n) => (
            <li key={n.id} className="text-pequeno">
              <p className="break-words whitespace-pre-wrap text-texto-2">{n.texto}</p>
              <p className="mt-0.5 text-legenda text-texto-3">
                {n.autor_tipo === 'bot' ? 'Agente' : ((n.autor_id && equipe.get(n.autor_id)?.nome) ?? 'Equipe')} · {quandoCurto(n.criado_em)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
