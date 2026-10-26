import { useState } from 'react'
import { FOCUS_RESPONSAVEL_TECNICO } from '../services/nfe'
import { Icone } from './Icone'

/** Como credenciar o emissor (a Focus NFe) na SEFAZ; ver FOCUS_RESPONSAVEL_TECNICO em services/nfe. */
export function CredenciamentoSefaz({ uf }: { uf?: string | null }) {
  const [copiado, setCopiado] = useState(false)
  const outroEstado = !!uf && uf !== 'PR'

  async function copiar() {
    try {
      await navigator.clipboard.writeText(FOCUS_RESPONSAVEL_TECNICO.cnpj.replace(/\D/g, ''))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem permissão de área de transferência: o CNPJ continua visível para copiar à mão.
    }
  }

  return (
    <div className="space-y-2 text-pequeno text-texto-2">
      <p>
        A SEFAZ precisa saber qual sistema emite as notas deste CNPJ. As notas do Livih saem pela{' '}
        <span className="font-medium text-texto">{FOCUS_RESPONSAVEL_TECNICO.razao}</span>, CNPJ{' '}
        <span className="font-medium text-texto">{FOCUS_RESPONSAVEL_TECNICO.cnpj}</span>
        <button type="button" onClick={() => void copiar()} title="Copiar o CNPJ"
          className="ml-1 inline-flex items-center gap-1 rounded-sm px-1 align-middle text-legenda text-primaria hover:bg-primaria-suave">
          <Icone nome={copiado ? 'check' : 'copiar'} className="size-3.5" />
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
        . É uma vez só por CNPJ, e quem costuma fazer é o contador.
      </p>
      {outroEstado ? (
        <p>
          No portal da SEFAZ do seu estado, autorize esse CNPJ como sistema emissor (responsável técnico) da sua empresa. Se não
          souber onde fica, mande esta mensagem ao contador.
        </p>
      ) : (
        <>
          {!uf && <p>No Paraná, o caminho é:</p>}
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Entre no portal da{' '}
              <a href="https://receita.pr.gov.br/login" target="_blank" rel="noreferrer" className="font-medium text-primaria underline">
                Receita/PR
              </a>{' '}
              com o login da empresa (ou do contador).
            </li>
            <li>
              Vá em <span className="font-medium text-texto">UPD → Autorização de Uso → Cadastro de Autorização de Uso</span>.
            </li>
            <li>Informe o CNPJ da Focus e escolha o sistema que aparecer para ele (deve ser {FOCUS_RESPONSAVEL_TECNICO.sistema}).</li>
            <li>Informe o CAD/ICMS da empresa, marque o modelo 55 (NF-e) e conclua.</li>
          </ol>
          {!uf && <p>Em outro estado, faça o equivalente no portal da SEFAZ do estado.</p>}
        </>
      )}
      <p>
        Depois, avise o suporte do Livih: a Focus NFe precisa aceitar a vinculação do lado dela. Com o aceite, emita de
        novo.
      </p>
    </div>
  )
}
