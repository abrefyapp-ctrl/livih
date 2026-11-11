import type { NumeroVisivel } from '../services/atendimento'
import { CLASSE_CAMPO } from './ModaisOs'

/** Sem conversa: os números que podem abrir uma e o que o vendedor já escolheu (o dele, por padrão). */
export type SemConversa = { numeros: NumeroVisivel[]; canalId: string }

/** Texto da confirmação quando o PDF abre a conversa: por qual número vai, com a troca quando há mais de um. */
export function NumeroDeSaida({ cliente, valor, mudar }: { cliente: string; valor: SemConversa; mudar: (v: SemConversa) => void }) {
  const escolhido = valor.numeros.find((n) => n.id === valor.canalId)
  return (
    <div className="space-y-3">
      <p>
        {cliente} ainda não tem conversa na Livih. O PDF abre uma conversa nova
        {valor.numeros.length === 1 && <> pelo número {escolhido?.nome}</>}, fica no histórico dela e você assume o
        atendimento.
      </p>
      {valor.numeros.length > 1 && (
        <label className="block space-y-1.5">
          <span className="block text-pequeno font-medium text-texto-2">Enviar pelo número</span>
          <select value={valor.canalId} onChange={(e) => mudar({ ...valor, canalId: e.target.value })} className={CLASSE_CAMPO}>
            {valor.numeros.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nome}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
