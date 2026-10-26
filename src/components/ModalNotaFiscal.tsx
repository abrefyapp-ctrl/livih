import { useRef, useState, type FormEvent } from 'react'
import type { Emissora } from '../services/empresa'
import { formatarCnpj, moeda } from '../services/formato'
import {
  limitePadrao,
  ORIGENS,
  REGIMES,
  REGIMES_ESPECIAIS,
  ROTULO_STATUS,
  salvarFiscal,
  sincronizarFocus,
  sugestaoFiscal,
  type CamposFiscais,
} from '../services/nfe'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Campo, CLASSE_CAMPO } from './ModaisOs'
import { Modal } from './Modal'

const COR_STATUS: Record<string, string> = {
  nao_configurada: 'bg-slate-100 text-texto-2',
  pendente: 'bg-atencao-suave text-atencao',
  pronta: 'bg-primaria-suave text-primaria',
  erro: 'bg-erro-suave text-erro',
}

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '')
const diasAte = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5) : null)

/**
 * Configurações → Empresa → CNPJ → Nota fiscal (docs/nfe.md): regime, padrões fiscais, certificado A1 e o cadastro do
 * CNPJ na Focus NFe. Dono e admin. Começa em homologação (teste); produção só depois do CNPJ pronto.
 */
export function ModalNotaFiscal({ emissora: e, aoFechar, aoSalvar }: { emissora: Emissora; aoFechar: () => void; aoSalvar: () => void }) {
  const [c, setC] = useState({
    regime: e.regime_tributario != null ? String(e.regime_tributario) : '',
    ambiente: e.nfe_ambiente,
    serie: String(e.nfe_serie),
    cfopEstadual: e.cfop_estadual ?? '',
    cfopInterestadual: e.cfop_interestadual ?? '',
    icms: e.icms_situacao ?? '',
    origem: String(e.icms_origem),
    pis: e.pis_situacao ?? '',
    cofins: e.cofins_situacao ?? '',
    limite: e.limite_faturamento != null ? String(e.limite_faturamento).replace('.', ',') : '',
    balcao: e.padrao_balcao,
    // NFS-e (docs/nfse.md)
    nfse: e.nfse_ativa,
    im: e.inscricao_municipal ?? '',
    tribNacional: e.nfse_codigo_tributacao_nacional ?? '',
    tribMunicipal: e.nfse_codigo_tributacao_municipal ?? '',
    nbs: e.nfse_codigo_nbs ?? '',
    descricaoServico: e.nfse_descricao_padrao ?? '',
    regimeEspecial: String(e.nfse_regime_especial),
    ibsCst: e.ibs_cbs_cst ?? '',
    ibsClass: e.ibs_cbs_classificacao ?? '',
    ibsOp: e.nfse_codigo_indicador_operacao ?? '',
    aliquotaSimples: e.aliquota_simples != null ? String(e.aliquota_simples).replace('.', ',') : '',
  })
  const [certificado, setCertificado] = useState<File | null>(null)
  const [senha, setSenha] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const seletor = useRef<HTMLInputElement>(null)
  const muda = (campos: Partial<typeof c>) => setC((v) => ({ ...v, ...campos }))

  const regime = c.regime ? Number(c.regime) : null
  const simples = regime === 1 || regime === 2 || regime === 4
  // Alíquota efetiva do Simples (ME/EPP): vai na NFS-e como o total aproximado dos tributos (pTotTribSN).
  const meEpp = regime === 1 || regime === 2
  const aliquotaNum = c.aliquotaSimples.trim() ? Number(c.aliquotaSimples.replace(',', '.')) : null
  const aliquotaRuim = aliquotaNum != null && !(aliquotaNum >= 0 && aliquotaNum < 100)
  const limiteNum = c.limite.trim() ? Number(c.limite.replace(/\./g, '').replace(',', '.')) : null
  const serieNum = Number(c.serie)
  const invalido =
    !regime ||
    !Number.isInteger(serieNum) || serieNum < 1 || serieNum > 889 ||
    (!!c.cfopEstadual && !/^5\d{3}$/.test(c.cfopEstadual)) ||
    (!!c.cfopInterestadual && !/^6\d{3}$/.test(c.cfopInterestadual)) ||
    (!!c.icms && !/^\d{2,3}$/.test(c.icms)) ||
    (!!c.pis && !/^\d{2}$/.test(c.pis)) ||
    (!!c.cofins && !/^\d{2}$/.test(c.cofins)) ||
    (limiteNum != null && !(limiteNum > 0)) ||
    (c.nfse && !/^\d{6}$/.test(c.tribNacional)) ||
    (!!c.tribMunicipal && !/^\d{3}$/.test(c.tribMunicipal)) ||
    (!!c.nbs && !/^\d{9}$/.test(c.nbs)) ||
    (!!c.ibsCst && !/^\d{3}$/.test(c.ibsCst)) ||
    (!!c.ibsClass && !/^\d{6}$/.test(c.ibsClass)) ||
    (!!c.ibsOp && !/^\d{6}$/.test(c.ibsOp)) ||
    aliquotaRuim ||
    (!!certificado && !senha)
  const dias = diasAte(e.certificado_validade)

  function usarSugestao() {
    const s = sugestaoFiscal(regime)
    muda({
      cfopEstadual: c.cfopEstadual || s.cfop_estadual || '',
      cfopInterestadual: c.cfopInterestadual || s.cfop_interestadual || '',
      icms: c.icms || s.icms_situacao || '',
      pis: c.pis || s.pis_situacao || '',
      cofins: c.cofins || s.cofins_situacao || '',
    })
  }

  async function salvar(ev: FormEvent) {
    ev.preventDefault()
    if (invalido) return
    setSalvando(true)
    setErro(null)
    setAviso(null)
    const campos: CamposFiscais = {
      regime_tributario: regime,
      nfe_ambiente: c.ambiente,
      nfe_serie: serieNum,
      cfop_estadual: c.cfopEstadual || null,
      cfop_interestadual: c.cfopInterestadual || null,
      icms_situacao: c.icms || null,
      icms_origem: Number(c.origem),
      pis_situacao: c.pis || null,
      cofins_situacao: c.cofins || null,
      limite_faturamento: limiteNum,
      padrao_balcao: c.balcao,
      nfse_ativa: c.nfse,
      inscricao_municipal: c.im.replace(/\D/g, '') || null,
      nfse_codigo_tributacao_nacional: c.tribNacional || null,
      nfse_codigo_tributacao_municipal: c.tribMunicipal || null,
      nfse_codigo_nbs: c.nbs || null,
      nfse_descricao_padrao: c.descricaoServico.trim() || null,
      nfse_regime_especial: Number(c.regimeEspecial),
      ibs_cbs_cst: c.ibsCst || null,
      ibs_cbs_classificacao: c.ibsClass || null,
      nfse_codigo_indicador_operacao: c.ibsOp || null,
      aliquota_simples: meEpp && aliquotaNum != null ? Math.round(aliquotaNum * 100) / 100 : null,
    }
    try {
      await salvarFiscal(e.id, campos)
      // Sempre fala com a Focus: sem certificado, ela adota o CNPJ que já foi cadastrado direto no painel da Focus
      // (ou responde que falta o certificado).
      const r = await sincronizarFocus(e.id, certificado, senha)
      setSenha('')
      setCertificado(null)
      if (r.status === 'pronta') aoSalvar()
      else setAviso(r.mensagem ?? 'Salvo. A Focus ainda não liberou a emissão para este CNPJ.')
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo={`Nota fiscal · ${e.nome_fantasia || e.razao_social}`}
      largura="max-w-2xl"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Fechar
          </Botao>
          <Botao type="submit" form="form-nfe" carregando={salvando} disabled={invalido}>
            Salvar e enviar à Focus
          </Botao>
        </>
      }
    >
      <form id="form-nfe" onSubmit={salvar} className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-borda p-3 text-pequeno">
          <span className={`rounded-sm px-1.5 py-0.5 text-legenda font-medium ${COR_STATUS[e.nfe_status] ?? ''}`}>
            {ROTULO_STATUS[e.nfe_status] ?? e.nfe_status}
          </span>
          <span className="text-texto-2">CNPJ {formatarCnpj(e.cnpj)}</span>
          {e.certificado_validade && (
            <span className={dias != null && dias <= 30 ? 'font-medium text-atencao' : 'text-texto-3'}>
              · certificado até {data(e.certificado_validade)}
              {dias != null && dias <= 30 && (dias < 0 ? ' (vencido)' : ` (vence em ${dias} dias)`)}
            </span>
          )}
          <span className="text-texto-3">· {e.nfe_ambiente === 'producao' ? 'em produção' : 'em teste (homologação)'}</span>
        </div>
        {e.nfe_erro && <Aviso tom={e.nfe_status === 'erro' ? 'erro' : 'atencao'}>{e.nfe_erro}</Aviso>}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {aviso && <Aviso tom="atencao">{aviso}</Aviso>}

        <fieldset className="space-y-3">
          <legend className="mb-1 font-semibold text-texto">Empresa</legend>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <Campo rotulo="Regime tributário" id="nfe-regime" ajuda="Se não souber, pergunte à contabilidade.">
              <select id="nfe-regime" value={c.regime} onChange={(ev) => muda({ regime: ev.target.value })} className={CLASSE_CAMPO}>
                <option value="">Escolha…</option>
                {REGIMES.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <CampoTexto rotulo="Série" inputMode="numeric" value={c.serie} onChange={(ev) => muda({ serie: ev.target.value.replace(/\D/g, '') })} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 flex flex-wrap items-center gap-2 font-semibold text-texto">
            Padrões dos itens
            <button type="button" onClick={usarSugestao} disabled={!regime} className="text-pequeno font-medium text-primaria underline disabled:opacity-50">
              usar sugestão para {simples ? 'o Simples' : regime === 3 ? 'o regime normal' : 'o regime'}
            </button>
          </legend>
          <p className="text-legenda text-texto-3">
            Valem para todos os produtos da nota. A sugestão é a mais comum para revenda de mercadoria: confirme com a
            contabilidade.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoTexto rotulo="CFOP dentro do estado" inputMode="numeric" maxLength={4} value={c.cfopEstadual} placeholder="5102"
              onChange={(ev) => muda({ cfopEstadual: ev.target.value.replace(/\D/g, '') })}
              erro={c.cfopEstadual && !/^5\d{3}$/.test(c.cfopEstadual) ? 'Começa com 5 (4 números)' : undefined} />
            <CampoTexto rotulo="CFOP para outro estado" inputMode="numeric" maxLength={4} value={c.cfopInterestadual} placeholder="6102"
              onChange={(ev) => muda({ cfopInterestadual: ev.target.value.replace(/\D/g, '') })}
              erro={c.cfopInterestadual && !/^6\d{3}$/.test(c.cfopInterestadual) ? 'Começa com 6 (4 números)' : undefined} />
            <CampoTexto rotulo={simples ? 'ICMS: CSOSN' : 'ICMS: CST'} inputMode="numeric" maxLength={3} value={c.icms}
              placeholder={simples ? '102' : '00'} onChange={(ev) => muda({ icms: ev.target.value.replace(/\D/g, '') })} />
            <Campo rotulo="Origem da mercadoria" id="nfe-origem" ajuda="O produto pode ter a dele, no cadastro.">
              <select id="nfe-origem" value={c.origem} onChange={(ev) => muda({ origem: ev.target.value })} className={CLASSE_CAMPO}>
                {ORIGENS.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <CampoTexto rotulo="PIS: CST" inputMode="numeric" maxLength={2} value={c.pis} placeholder={simples ? '49' : '01'}
              onChange={(ev) => muda({ pis: ev.target.value.replace(/\D/g, '') })} />
            <CampoTexto rotulo="COFINS: CST" inputMode="numeric" maxLength={2} value={c.cofins} placeholder={simples ? '49' : '01'}
              onChange={(ev) => muda({ cofins: ev.target.value.replace(/\D/g, '') })} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 font-semibold text-texto">Certificado digital A1</legend>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <p className="text-pequeno font-medium text-texto-2">Arquivo (.pfx ou .p12)</p>
              <input ref={seletor} type="file" accept=".pfx,.p12,application/x-pkcs12" className="hidden"
                onChange={(ev) => (setCertificado(ev.target.files?.[0] ?? null), (ev.target.value = ''))} />
              <Botao variante="secundario" tamanho="sm" icone="clipe" onClick={() => seletor.current?.click()}>
                {certificado ? certificado.name : e.certificado_validade ? 'Trocar certificado' : 'Escolher certificado'}
              </Botao>
            </div>
            {certificado && (
              <CampoTexto rotulo="Senha do certificado" type="password" autoComplete="off" value={senha}
                onChange={(ev) => setSenha(ev.target.value)} className="w-56" />
            )}
          </div>
          <p className="text-legenda text-texto-3">
            O arquivo e a senha vão direto para a Focus NFe, que assina as notas. O Livih não guarda nenhum dos dois. Se o CNPJ já
            foi cadastrado com o certificado no painel da Focus, salve sem escolher o arquivo: o Livih usa o cadastro de lá.
          </p>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 font-semibold text-texto">Nota de serviço (NFS-e)</legend>
          <label className="flex items-center gap-2 text-pequeno text-texto-2">
            <input type="checkbox" checked={c.nfse} onChange={(ev) => muda({ nfse: ev.target.checked })} className="size-4 accent-primaria" />
            Emitir nota de serviço por este CNPJ (padrão nacional)
          </label>
          {e.nfse_provedor && (
            <p className={`text-legenda ${e.nfse_provedor === 'Nacional' ? 'text-texto-3' : 'text-atencao'}`}>
              {e.cidade}: NFS-e pelo padrão {e.nfse_provedor === 'Nacional' ? 'nacional' : `da prefeitura (${e.nfse_provedor}), que o Livih ainda não emite`}
              {e.nfse_habilitada_focus ? ' · ativa na Focus' : ''}.
            </p>
          )}
          {c.nfse && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoTexto rotulo="Código de tributação nacional do ISS" inputMode="numeric" maxLength={6} value={c.tribNacional} placeholder="010101"
                  onChange={(ev) => muda({ tribNacional: ev.target.value.replace(/\D/g, '') })}
                  erro={c.tribNacional && !/^\d{6}$/.test(c.tribNacional) ? '6 números' : undefined}
                  ajuda="Identifica o serviço (ex.: 01.01.01 desenvolvimento de software). Peça à contabilidade." />
                <CampoTexto rotulo="Inscrição municipal (opcional)" maxLength={20} value={c.im} onChange={(ev) => muda({ im: ev.target.value })}
                  ajuda="O número inteiro, como no cadastro da prefeitura (ex.: 01 05 1.262.340-0), com os zeros do começo." />
                <CampoTexto rotulo="Código de tributação municipal (opcional)" inputMode="numeric" maxLength={3} value={c.tribMunicipal}
                  onChange={(ev) => muda({ tribMunicipal: ev.target.value.replace(/\D/g, '') })} />
                <CampoTexto rotulo="Código NBS (opcional)" inputMode="numeric" maxLength={9} value={c.nbs}
                  onChange={(ev) => muda({ nbs: ev.target.value.replace(/\D/g, '') })} />
                {meEpp && (
                  <CampoTexto rotulo="Alíquota efetiva do Simples (%)" inputMode="decimal" maxLength={6} value={c.aliquotaSimples} placeholder="6,00"
                    onChange={(ev) => muda({ aliquotaSimples: ev.target.value.replace(/[^\d,]/g, '') })}
                    erro={aliquotaRuim ? 'Um número entre 0 e 99,99' : undefined}
                    ajuda="A do último DAS (a contabilidade sabe). Vai na nota como o total aproximado dos tributos." />
                )}
                <Campo rotulo="Regime especial de tributação" id="nfse-regime-especial">
                  <select id="nfse-regime-especial" value={c.regimeEspecial} onChange={(ev) => muda({ regimeEspecial: ev.target.value })} className={CLASSE_CAMPO}>
                    {REGIMES_ESPECIAIS.map((r) => (
                      <option key={r.valor} value={r.valor}>{r.rotulo}</option>
                    ))}
                  </select>
                </Campo>
              </div>
              <Campo rotulo="Descrição padrão do serviço (opcional)" id="nfse-descricao" ajuda="Sugestão para a nota avulsa; na emissão dá para ajustar.">
                <textarea id="nfse-descricao" rows={2} maxLength={1000} value={c.descricaoServico} onChange={(ev) => muda({ descricaoServico: ev.target.value })}
                  className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none" />
              </Campo>
              <div className="space-y-2 rounded-md border border-borda p-3">
                <p className="text-pequeno font-medium text-texto-2">Reforma tributária (IBS/CBS), obrigatória desde 2026</p>
                <p className="text-legenda text-texto-3">
                  Os três códigos dependem do serviço (tabela de correlação da Receita entre o item da LC 116/NBS, o indicador
                  da operação e a classificação). Peça à contabilidade. Em 2026 os valores só aparecem na nota, sem recolhimento.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <CampoTexto rotulo="Indicador da operação (cIndOp)" inputMode="numeric" maxLength={6} value={c.ibsOp}
                    onChange={(ev) => muda({ ibsOp: ev.target.value.replace(/\D/g, '') })} erro={c.ibsOp && !/^\d{6}$/.test(c.ibsOp) ? '6 números' : undefined} />
                  <CampoTexto rotulo="CST do IBS/CBS" inputMode="numeric" maxLength={3} value={c.ibsCst}
                    onChange={(ev) => muda({ ibsCst: ev.target.value.replace(/\D/g, '') })} erro={c.ibsCst && !/^\d{3}$/.test(c.ibsCst) ? '3 números' : undefined} />
                  <CampoTexto rotulo="Classificação (cClassTrib)" inputMode="numeric" maxLength={6} value={c.ibsClass}
                    onChange={(ev) => muda({ ibsClass: ev.target.value.replace(/\D/g, '') })} erro={c.ibsClass && !/^\d{6}$/.test(c.ibsClass) ? '6 números' : undefined} />
                </div>
              </div>
              <p className="text-legenda text-texto-3">A alíquota do ISS não é pedida: no padrão nacional ela vem da prefeitura.</p>
            </>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 font-semibold text-texto">Ambiente e balcão</legend>
          <div className="flex flex-wrap gap-2">
            {(['homologacao', 'producao'] as const).map((a) => (
              <label key={a}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-pequeno ring-1 ring-inset ${
                  c.ambiente === a ? 'bg-primaria-suave font-medium text-primaria ring-primaria' : 'ring-borda'
                } ${a === 'producao' && e.nfe_status !== 'pronta' ? 'cursor-not-allowed opacity-50' : ''}`}>
                <input type="radio" name="nfe-ambiente" className="sr-only" checked={c.ambiente === a}
                  disabled={a === 'producao' && e.nfe_status !== 'pronta'} onChange={() => muda({ ambiente: a })} />
                {a === 'homologacao' ? 'Teste (homologação)' : 'Produção (vale de verdade)'}
              </label>
            ))}
          </div>
          <p className="text-legenda text-texto-3">
            {e.nfe_status !== 'pronta'
              ? 'Produção libera depois que o CNPJ estiver pronto na Focus.'
              : 'Emita uma nota de teste certa antes de passar para produção: em produção a nota tem valor fiscal.'}
          </p>
          <CampoTexto
            rotulo="Limite de faturamento anual (opcional)"
            inputMode="decimal"
            value={c.limite}
            onChange={(ev) => muda({ limite: ev.target.value })}
            placeholder={limitePadrao(regime) ? moeda(limitePadrao(regime)!) : 'R$'}
            ajuda={`Para o Livih sugerir qual CNPJ usar. Vazio: ${limitePadrao(regime) ? `${moeda(limitePadrao(regime)!)} (teto do regime)` : 'sem sugestão'}.`}
            className="sm:max-w-xs"
          />
          <label className="flex items-center gap-2 text-pequeno text-texto-2">
            <input type="checkbox" checked={c.balcao} onChange={(ev) => muda({ balcao: ev.target.checked })} className="size-4 accent-primaria" />
            CNPJ do balcão (vem escolhido nas vendas do balcão; os outros pedidos seguem com o CNPJ deles)
          </label>
        </fieldset>
      </form>
    </Modal>
  )
}
