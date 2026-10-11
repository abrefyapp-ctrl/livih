import { erroDoHorario, NOMES_DIAS as NOMES, type DiaAtendimento, type Horario } from '../services/horario'

const campoHora =
  'h-10 w-28 rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none disabled:bg-fundo disabled:text-texto-3'

export function HorarioAtendimento({ valor, onChange }: { valor: Horario; onChange: (h: Horario) => void }) {
  const mudarDia = (i: number, campos: Partial<DiaAtendimento>) =>
    onChange({ ...valor, dias: valor.dias.map((d, j) => (j === i ? { ...d, ...campos } : d)) })
  const erro = erroDoHorario(valor)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-pequeno" role="radiogroup" aria-label="Tipo de horário">
        <label className="flex items-center gap-2">
          <input type="radio" checked={valor.vinteQuatro} onChange={() => onChange({ ...valor, vinteQuatro: true })} />
          A equipe atende a qualquer hora
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={!valor.vinteQuatro} onChange={() => onChange({ ...valor, vinteQuatro: false })} />
          Em dias e horários definidos
        </label>
      </div>

      {!valor.vinteQuatro && (
        <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
          {valor.dias.map((d, i) => (
            <li key={NOMES[i]} className="flex flex-wrap items-center gap-3 px-3 py-2 text-pequeno">
              <label className="flex w-28 items-center gap-2 font-medium">
                <input type="checkbox" checked={d.aberto} onChange={(e) => mudarDia(i, { aberto: e.target.checked })} />
                {NOMES[i]}
              </label>
              {d.aberto ? (
                <span className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${NOMES[i]}: início`}
                    value={d.inicio}
                    onChange={(e) => mudarDia(i, { inicio: e.target.value })}
                    className={campoHora}
                  />
                  <span className="text-texto-3">às</span>
                  <input
                    type="time"
                    aria-label={`${NOMES[i]}: fim`}
                    value={d.fim}
                    onChange={(e) => mudarDia(i, { fim: e.target.value })}
                    className={campoHora}
                  />
                </span>
              ) : (
                <span className="text-texto-3">Fechado</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p role="alert" className="text-pequeno text-erro">
          {erro}
        </p>
      )}
    </div>
  )
}
