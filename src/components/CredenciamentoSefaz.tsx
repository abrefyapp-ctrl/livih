import { useState, type ReactNode } from 'react'
import { FOCUS_RESPONSAVEL_TECNICO } from '../services/nfe'
import { Icone } from './Icone'

const Passo = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <li>
    <span className="font-medium text-texto">{titulo}</span> {children}
  </li>
)

/** Como credenciar o emissor (a Focus NFe) na SEFAZ; ver FOCUS_RESPONSAVEL_TECNICO em services/nfe e docs/nfe.md. */
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

  const cnpjFocus = (
    <>
      <span className="font-medium text-texto">{FOCUS_RESPONSAVEL_TECNICO.cnpj}</span>
      <button type="button" onClick={() => void copiar()} title="Copiar o CNPJ"
        className="ml-1 inline-flex items-center gap-1 rounded-sm px-1 align-middle text-legenda text-primaria hover:bg-primaria-suave">
        <Icone nome={copiado ? 'check' : 'copiar'} className="size-3.5" />
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </>
  )

  return (
    <div className="space-y-2 text-pequeno text-texto-2">
      <p>
        A SEFAZ só aceita notas emitidas por um sistema que a própria empresa autorizou. As notas da Livih são geradas pela{' '}
        <span className="font-medium text-texto">{FOCUS_RESPONSAVEL_TECNICO.razao}</span>, nossa parceira de emissão, e é ela que
        precisa ser autorizada. É uma vez só por CNPJ, leva poucos minutos e costuma ser feito pelo contador.
      </p>
      {outroEstado ? (
        <p>
          No portal da SEFAZ do seu estado, autorize a Focus NFe (CNPJ {cnpjFocus}) como sistema emissor da sua empresa e avise
          o suporte da Livih. Se não souber onde fica, mande esta mensagem ao contador.
        </p>
      ) : (
        <>
          <p>
            {!uf && 'No Paraná: '}tenha em mãos o certificado digital da empresa (A1 ou A3), ou o acesso do contador ao portal,
            e o CNPJ da Focus NFe: {cnpjFocus}.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <Passo titulo="Entre no portal da Receita/PR.">
              Acesse{' '}
              <a href="https://receita.pr.gov.br/login" target="_blank" rel="noreferrer" className="font-medium text-primaria underline">
                receita.pr.gov.br
              </a>{' '}
              e faça login com o certificado digital da empresa.
            </Passo>
            <Passo titulo="Abra o UPD.">No menu à esquerda (role a página, se precisar), clique em UPD.</Passo>
            <Passo titulo="Peça a autorização de uso.">Clique em Autorização de Uso e depois em Cadastro de Autorização de Uso.</Passo>
            <Passo titulo="Informe o fornecedor.">Digite o CNPJ da Focus NFe e clique em Continuar.</Passo>
            <Passo titulo="Escolha o sistema e informe a sua empresa.">
              Selecione o sistema da Focus NFe que aparecer na lista, informe o CNPJ da sua empresa e clique em Continuar.
            </Passo>
            <Passo titulo="Escolha o modelo de nota.">Marque o modelo 55 (NF-e) e clique em Continuar.</Passo>
            <Passo titulo="Guarde o comprovante.">
              Quando aparecer “Solicitação concluída com êxito”, clique em Visualizar Documento e salve o arquivo.
            </Passo>
            <Passo titulo="Avise a Livih.">
              Mande o comprovante ao suporte da Livih. Nós pedimos à Focus NFe o aceite da vinculação, que ela faz no portal da
              SEFAZ-PR.
            </Passo>
            <Passo titulo="Emita de novo.">
              Depois do aceite, a SEFAZ conclui a liberação e avisamos você. Aí é só abrir a nota e clicar em Emitir de novo.
            </Passo>
          </ol>
          <p className="text-legenda text-texto-3">
            Vale para as notas de teste e as de verdade. Se a empresa já autorizou outro sistema antes, não precisa desfazer.
          </p>
          {!uf && <p>Em outro estado, faça o equivalente no portal da SEFAZ do estado e avise o suporte da Livih.</p>}
        </>
      )}
    </div>
  )
}
