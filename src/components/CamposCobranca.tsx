import { buscarCep } from '../services/empresa'
import type { DadosCobranca } from '../services/cobranca'
import { CLASSE_CAMPO, Campo } from './ModaisOs'

/**
 * Campos dos dados de cobrança (quem paga a Livih), controlados por quem usa: criação da empresa, janela Plano da
 * plataforma e Plano e consumo do dono. O CEP preenche rua, bairro, cidade e UF que estiverem vazios.
 */
export function CamposCobranca({ dados, mudar, desabilitado = false, prefixo }: {
  dados: DadosCobranca
  mudar: (d: DadosCobranca) => void
  desabilitado?: boolean
  /** Para os ids dos campos não repetirem quando houver mais de um formulário na tela. */
  prefixo: string
}) {
  const campo = (c: keyof DadosCobranca) => ({
    id: `${prefixo}-${c}`,
    value: dados[c],
    disabled: desabilitado,
    onChange: (e: { target: { value: string } }) => mudar({ ...dados, [c]: e.target.value }),
    className: CLASSE_CAMPO,
  })

  async function completarPeloCep() {
    const end = await buscarCep(dados.cep)
    if (!end) return
    mudar({
      ...dados,
      logradouro: dados.logradouro || end.logradouro,
      bairro: dados.bairro || end.bairro,
      cidade: dados.cidade || end.cidade,
      uf: dados.uf || end.uf,
    })
  }

  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <div className="sm:col-span-6">
        <Campo rotulo="Nome ou razão social" id={`${prefixo}-nome`}>
          <input {...campo('nome')} maxLength={200} autoComplete="organization" />
        </Campo>
      </div>
      <div className="sm:col-span-3">
        <Campo rotulo="CNPJ ou CPF" id={`${prefixo}-documento`}>
          {/* CNPJ pode ter letras (Receita, desde 07/2026): teclado de texto, em maiúsculas. */}
          <input {...campo('documento')} maxLength={18} autoCapitalize="characters" />
        </Campo>
      </div>
      <div className="sm:col-span-3">
        <Campo rotulo="Telefone (opcional)" id={`${prefixo}-telefone`}>
          <input {...campo('telefone')} maxLength={20} inputMode="tel" autoComplete="tel" placeholder="(41) 99999-9999" />
        </Campo>
      </div>
      <div className="sm:col-span-6">
        <Campo rotulo="E-mail de cobrança" id={`${prefixo}-email`} ajuda="E-mail de quem cuida dos pagamentos da empresa.">
          <input {...campo('email')} type="email" maxLength={200} autoComplete="email" inputMode="email" />
        </Campo>
      </div>
      <div className="sm:col-span-2">
        <Campo rotulo="CEP" id={`${prefixo}-cep`}>
          <input {...campo('cep')} maxLength={9} inputMode="numeric" autoComplete="postal-code" onBlur={() => void completarPeloCep()} />
        </Campo>
      </div>
      <div className="sm:col-span-4">
        <Campo rotulo="Rua" id={`${prefixo}-logradouro`}>
          <input {...campo('logradouro')} maxLength={200} autoComplete="address-line1" />
        </Campo>
      </div>
      <div className="sm:col-span-2">
        <Campo rotulo="Número" id={`${prefixo}-numero`}>
          <input {...campo('numero')} maxLength={20} />
        </Campo>
      </div>
      <div className="sm:col-span-4">
        <Campo rotulo="Complemento (opcional)" id={`${prefixo}-complemento`}>
          <input {...campo('complemento')} maxLength={100} autoComplete="address-line2" />
        </Campo>
      </div>
      <div className="sm:col-span-2">
        <Campo rotulo="Bairro" id={`${prefixo}-bairro`}>
          <input {...campo('bairro')} maxLength={100} />
        </Campo>
      </div>
      <div className="sm:col-span-3">
        <Campo rotulo="Cidade" id={`${prefixo}-cidade`}>
          <input {...campo('cidade')} maxLength={100} autoComplete="address-level2" />
        </Campo>
      </div>
      <div className="sm:col-span-1">
        <Campo rotulo="UF" id={`${prefixo}-uf`}>
          <input {...campo('uf')} maxLength={2} autoComplete="address-level1" className={`${CLASSE_CAMPO} uppercase`} />
        </Campo>
      </div>
    </div>
  )
}
