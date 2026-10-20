import { useState, type FormEvent } from 'react'
import { logoPadrao } from '../services/empresa'
import { buscarRelatorio, salvarConfig, type ConfigPainel } from '../services/painel'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { Modal } from './Modal'
import { VisualizadorPdf } from './VisualizadorPdf'

/**
 * Painel → Relatório do piloto: confere o início do piloto e o "antes" contado no diagnóstico, gera o PDF (primeira
 * semana × última) e mostra na tela para baixar.
 */
export function ModalRelatorioPiloto({ orgId, config, aoFechar }: { orgId: string; config: ConfigPainel | null; aoFechar: () => void }) {
  const [inicio, setInicio] = useState(config?.piloto_inicio ?? '')
  const [antes, setAntes] = useState(config?.antes_tempo_resposta_min != null ? String(config.antes_tempo_resposta_min).replace('.', ',') : '')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pdf, setPdf] = useState<{ blob: Blob; nome: string } | null>(null)

  const antesNum = antes.trim() ? Number(antes.replace(',', '.')) : null
  const antesInvalido = antesNum != null && !(antesNum >= 0)

  async function gerar(e: FormEvent) {
    e.preventDefault()
    if (antesInvalido) return
    setGerando(true)
    setErro(null)
    try {
      await salvarConfig(orgId, { piloto_inicio: inicio || null, antes_tempo_resposta_min: antesNum })
      const [relatorio, logo] = await Promise.all([buscarRelatorio(orgId), logoPadrao(orgId).catch(() => null)])
      const { gerarPdfRelatorio } = await import('./DocumentoRelatorio')
      const blob = await gerarPdfRelatorio(relatorio, logo)
      const nome = `Relatorio-piloto-${relatorio.empresa.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-')}.pdf`
      setPdf({ blob, nome })
    } catch {
      setErro('Não foi possível gerar o relatório. Tente de novo.')
    } finally {
      setGerando(false)
    }
  }

  function baixar() {
    if (!pdf) return
    const url = URL.createObjectURL(pdf.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = pdf.nome
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <>
      <Modal
        aberto={!pdf}
        titulo="Relatório do piloto"
        aoFechar={aoFechar}
        rodape={
          <>
            <Botao variante="secundario" onClick={aoFechar} disabled={gerando}>
              Cancelar
            </Botao>
            <Botao type="submit" form="form-relatorio" icone="arquivo" carregando={gerando} disabled={antesInvalido}>
              Gerar PDF
            </Botao>
          </>
        }
      >
        <form id="form-relatorio" onSubmit={gerar} className="space-y-4">
          <p className="text-pequeno text-texto-2">
            Compara a primeira semana do piloto com a última: tempo de resposta, leads acompanhados, avanço no funil e o
            trabalho do agente. Para a reunião de fechamento e para o estudo de caso.
          </p>
          <CampoTexto
            rotulo="Início do piloto"
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            ajuda="Vazio: a data em que o primeiro número foi conectado."
          />
          <CampoTexto
            rotulo="Antes da Livih: tempo até a primeira resposta, em minutos (opcional)"
            inputMode="decimal"
            value={antes}
            onChange={(e) => setAntes(e.target.value)}
            placeholder="Ex.: 45"
            ajuda="O que a empresa contou no diagnóstico. Sai no relatório marcado como informado pela empresa."
            erro={antesInvalido ? 'Informe um número de minutos.' : undefined}
          />
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </form>
      </Modal>
      <VisualizadorPdf
        aberto={!!pdf}
        titulo="Relatório do piloto"
        arquivo={pdf?.blob ?? null}
        aoFechar={() => setPdf(null)}
        acoes={
          <Botao icone="baixar" onClick={baixar}>
            Baixar PDF
          </Botao>
        }
      />
    </>
  )
}
