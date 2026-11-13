import { useState } from 'react'
import { ausenteAgora, rotuloAusencia, type LugarNaEquipe } from '../services/equipes'
import { Botao } from './Botao'

const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

/**
 * Férias, folga ou afastamento (docs/equipes-origem-prospeccao.md, entrega 2; decidido em 13/11). Separado de
 * "Recebe contatos novos", que é papel fixo: usar a mesma opção para férias fazia o gestor esquecer de religar.
 * Marcam dono e admin (qualquer pessoa) e o gestor (as pessoas da equipe dele); o banco confere.
 */
export function AusenciaPessoa({
  lugar,
  ocupado,
  aoMarcar,
}: {
  lugar: LugarNaEquipe | undefined
  ocupado: boolean
  aoMarcar: (ausente: boolean, ate: string | null) => void
}) {
  const [ate, setAte] = useState('')
  const ausente = ausenteAgora(lugar)

  return (
    <div className="space-y-2">
      <p className="text-pequeno font-medium text-texto-2">Ausência</p>
      {ausente && lugar ? (
        <>
          <p className="text-pequeno">
            <span className="font-medium text-atencao">{rotuloAusencia(lugar)}.</span> Não recebe contatos nem avisos de
            conversa aguardando. Nos números da empresa que distribuem, os clientes que escreverem vão para outra pessoa
            da equipe.
          </p>
          <Botao tamanho="sm" variante="secundario" carregando={ocupado} onClick={() => aoMarcar(false, null)}>
            Marcar que voltou
          </Botao>
        </>
      ) : (
        <>
          <p className="text-legenda text-texto-3">
            Férias, folga ou afastamento. Enquanto estiver ausente, a pessoa não recebe contatos nem avisos de conversa
            aguardando. Nos números da empresa que distribuem, os clientes que escreverem vão para outra pessoa da equipe.
            No dia seguinte à data, ela volta sozinha.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="block text-legenda text-texto-2">Último dia de ausência (opcional)</span>
              <input
                type="date"
                value={ate}
                min={hoje()}
                disabled={ocupado}
                onChange={(e) => setAte(e.target.value)}
                className="h-9 rounded-md border border-borda bg-superficie px-2 text-pequeno focus:border-primaria focus:outline-none"
              />
            </label>
            <Botao tamanho="sm" variante="secundario" carregando={ocupado} onClick={() => aoMarcar(true, ate || null)}>
              Marcar ausente
            </Botao>
          </div>
          {!ate && <p className="text-legenda text-texto-3">Sem data, fica ausente até alguém marcar que voltou.</p>}
        </>
      )}
    </div>
  )
}
