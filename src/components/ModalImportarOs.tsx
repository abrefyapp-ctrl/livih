import { useState } from 'react'
import { moeda } from '../services/formato'
import { data, importar, type ConfiguracaoOs } from '../services/os'
import { modeloPlanilha, planilhaParaOs, textoDoArquivo, type LeituraOs } from '../services/planilhaOs'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Modal } from './Modal'

/**
 * Traz o que está na planilha: baixa o modelo (com as etapas da empresa), lê o CSV, mostra a prévia e importa tudo
 * numa transação só (o banco agrupa as OS e grava o histórico com as datas da planilha).
 */
export function ModalImportarOs({ orgId, cfg, aoFechar, aoImportar }: {
  orgId: string
  cfg: ConfiguracaoOs
  aoFechar: () => void
  aoImportar: () => void
}) {
  const [leitura, setLeitura] = useState<(LeituraOs & { arquivo: string }) | null>(null)
  const [importando, setImportando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<{ ordens: number; itens: number; clientes_criados: number } | null>(null)

  function baixarModelo() {
    const blob = new Blob([modeloPlanilha(cfg.etapas)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'modelo-ordens-de-servico.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function ler(f: File | undefined) {
    setErro(null)
    setLeitura(null)
    if (!f) return
    if (!/\.(csv|txt)$/i.test(f.name)) return setErro('Envie a planilha em CSV (no Excel: Arquivo → Salvar como → CSV).')
    setLeitura({ ...planilhaParaOs(await textoDoArquivo(f), cfg.etapas), arquivo: f.name })
  }

  async function confirmar() {
    if (!leitura?.linhas.length) return
    setImportando(true)
    setErro(null)
    try {
      setFeito(await importar(orgId, leitura.linhas))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setImportando(false)
    }
  }

  const ordens = leitura
    ? new Set(leitura.linhas.map((l) => [l.cliente?.toLowerCase(), l.nf_cliente, l.numero_cliente, l.recebida_em].join('|'))).size
    : 0

  return (
    <Modal
      aberto
      titulo="Importar planilha"
      largura="max-w-2xl"
      aoFechar={feito ? aoImportar : aoFechar}
      rodape={
        feito ? (
          <Botao onClick={aoImportar}>Ver as ordens</Botao>
        ) : (
          <>
            <Botao variante="secundario" onClick={aoFechar} disabled={importando}>
              Cancelar
            </Botao>
            <Botao onClick={() => void confirmar()} carregando={importando} disabled={!leitura?.linhas.length}>
              Importar {leitura?.linhas.length ? `${leitura.linhas.length} itens` : ''}
            </Botao>
          </>
        )
      }
    >
      {feito ? (
        <Aviso tom="info">
          Importados {feito.itens} itens em {feito.ordens} ordens de serviço. As datas da planilha entraram no histórico de cada item.
          {feito.clientes_criados > 0 &&
            ` ${feito.clientes_criados} ${feito.clientes_criados === 1 ? 'cliente novo foi cadastrado' : 'clientes novos foram cadastrados'} em Clientes (confira o CNPJ e o endereço lá).`}
          {' '}Cada OS ficou ligada ao cliente pelo CNPJ/CPF ou pelo nome.
        </Aviso>
      ) : (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-pequeno">
            <li>
              Baixe o{' '}
              <button type="button" onClick={baixarModelo} className="font-medium text-primaria hover:underline">
                modelo da planilha
              </button>{' '}
              (já com as suas etapas: uma coluna por etapa, com a data em que o item chegou nela).
            </li>
            <li>Uma linha por item. Itens com o mesmo cliente, NF, OS do cliente e recebimento viram uma OS só.</li>
            <li>No Excel, salve como CSV e envie aqui. Nada é gravado antes de você confirmar.</li>
          </ol>
          <label className="block">
            <span className="sr-only">Planilha em CSV</span>
            <input
              type="file"
              accept=".csv,.txt,text/csv"
              onChange={(e) => void ler(e.target.files?.[0])}
              className="block w-full text-pequeno file:mr-3 file:rounded-md file:border-0 file:bg-primaria-suave file:px-3 file:py-2 file:font-medium file:text-primaria"
            />
          </label>

          {leitura && (
            <div className="space-y-3">
              <p className="text-pequeno">
                <strong>{leitura.linhas.length}</strong> itens em <strong>{ordens}</strong> ordens ·{' '}
                {moeda(leitura.linhas.reduce((s, l) => s + (l.valor ?? 0), 0), true)}
                {leitura.colunasEtapas.length > 0 && <span className="text-texto-3"> · etapas lidas: {leitura.colunasEtapas.join(', ')}</span>}
              </p>
              {leitura.ignoradas.length > 0 && (
                <p className="text-legenda text-texto-3">Colunas não usadas: {leitura.ignoradas.join(', ')}.</p>
              )}
              {leitura.erros.length > 0 && (
                <Aviso tom="atencao">
                  {leitura.erros.length} linhas ficam de fora:
                  <ul className="mt-1 max-h-28 list-disc overflow-y-auto pl-5">
                    {leitura.erros.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </Aviso>
              )}
              {leitura.linhas.length > 0 && (
                <div className="max-h-56 overflow-auto rounded-md border border-borda">
                  <table className="w-full text-legenda">
                    <thead className="sticky top-0 bg-fundo text-left text-texto-3">
                      <tr>
                        <th className="px-2 py-1 font-medium">Recebido</th>
                        <th className="px-2 py-1 font-medium">Cliente</th>
                        <th className="px-2 py-1 font-medium">Item</th>
                        <th className="px-2 py-1 font-medium">Etapas</th>
                        <th className="px-2 py-1 font-medium">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borda">
                      {leitura.linhas.slice(0, 100).map((l, n) => (
                        <tr key={n}>
                          <td className="px-2 py-1 whitespace-nowrap">{data(l.recebida_em)}</td>
                          <td className="max-w-32 truncate px-2 py-1">{l.cliente ?? '—'}</td>
                          <td className="max-w-40 truncate px-2 py-1">{[l.tipo, l.modelo, l.identificacao].filter(Boolean).join(' · ')}</td>
                          <td className="px-2 py-1">{l.etapas.length}</td>
                          <td className="px-2 py-1 whitespace-nowrap">
                            {l.desfecho ? 'encerrado' : l.cobranca !== 'cobrado' ? l.cobranca : l.faturado_em ? `faturado ${data(l.faturado_em, true)}` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </div>
      )}
    </Modal>
  )
}
