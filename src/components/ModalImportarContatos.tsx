import { useState } from 'react'
import { importarContatos, type ResultadoImportacaoContatos } from '../services/crm'
import { formatarTelefone } from '../services/formato'
import { baixarArquivo, modeloPlanilhaContatos, planilhaParaContatos, type LeituraContatos } from '../services/planilhaContatos'
import { textoDoArquivo } from '../services/planilhaOs'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Modal } from './Modal'

/**
 * Contatos → Importar planilha (dono e admin; docs/crm-acompanhamento.md, entrega 4): baixa o modelo, lê o CSV, mostra
 * a prévia e importa numa transação só. O banco acha pelo celular, atualiza só o que veio preenchido e soma as etiquetas.
 */
export function ModalImportarContatos({ orgId, aoFechar, aoImportar }: { orgId: string; aoFechar: () => void; aoImportar: () => void }) {
  const [leitura, setLeitura] = useState<(LeituraContatos & { arquivo: string }) | null>(null)
  const [importando, setImportando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<ResultadoImportacaoContatos | null>(null)

  async function ler(f: File | undefined) {
    setErro(null)
    setLeitura(null)
    if (!f) return
    if (!/\.(csv|txt)$/i.test(f.name)) return setErro('Envie a planilha em CSV (no Excel: Arquivo → Salvar como → CSV).')
    const l = planilhaParaContatos(await textoDoArquivo(f))
    if (!l.reconhecidas.some((r) => r.coluna === 'Celular (WhatsApp)')) {
      return setErro('Não achei a coluna do celular. Confira o cabeçalho (a primeira linha) ou use o modelo.')
    }
    setLeitura({ ...l, arquivo: f.name })
  }

  async function confirmar() {
    if (!leitura?.linhas.length) return
    setImportando(true)
    setErro(null)
    try {
      setFeito(await importarContatos(orgId, leitura.linhas))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setImportando(false)
    }
  }

  const n = leitura?.linhas.length ?? 0

  return (
    <Modal
      aberto
      titulo="Importar contatos"
      largura="max-w-2xl"
      aoFechar={aoFechar}
      rodape={
        feito ? (
          <Botao onClick={aoImportar}>Ver os contatos</Botao>
        ) : (
          <>
            <Botao variante="secundario" onClick={aoFechar} disabled={importando}>
              Cancelar
            </Botao>
            <Botao onClick={() => void confirmar()} carregando={importando} disabled={!n}>
              Importar {n ? `${n} ${n === 1 ? 'contato' : 'contatos'}` : ''}
            </Botao>
          </>
        )
      }
    >
      {feito ? (
        <div className="space-y-3">
          <Aviso tom="info">
            {feito.criados} {feito.criados === 1 ? 'contato novo' : 'contatos novos'} e {feito.atualizados}{' '}
            {feito.atualizados === 1 ? 'atualizado' : 'atualizados'}. Quem veio sem vendedor fica com a equipe toda; se o
            número da empresa distribui contatos, ele entra no rodízio quando escrever.
          </Aviso>
          {feito.avisos.length > 0 && (
            <div className="space-y-1">
              <p className="text-pequeno font-medium text-texto-2">O que ficou de fora</p>
              <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-legenda text-texto-3">
                {feito.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-pequeno">
            Uma linha por contato. O contato que já existe é achado pelo <strong>celular</strong> e só muda no que vier
            preenchido; as etiquetas da planilha são somadas às que ele já tem. Na coluna <strong>Vendedor</strong>, use o
            e-mail de alguém da equipe para pôr o contato na carteira dele.
          </p>
          <p className="text-legenda text-texto-3">
            Importe só quem é cliente ou já falou com a empresa. Mandar mensagem para quem não autorizou leva a bloqueios no
            WhatsApp.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Botao variante="secundario" tamanho="sm" icone="baixar" onClick={() => baixarArquivo('modelo-contatos.csv', modeloPlanilhaContatos())}>
              Baixar modelo
            </Botao>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primaria px-3 py-1.5 text-pequeno font-medium text-white hover:bg-primaria-hover">
              Escolher planilha (CSV)
              <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => void ler(e.target.files?.[0])} />
            </label>
          </div>
          <p className="text-legenda text-texto-3">
            No Excel: Arquivo → Salvar como → CSV. As colunas são reconhecidas pelo nome (Nome, Celular ou WhatsApp, E-mail,
            Empresa, Etiquetas, Vendedor), em qualquer ordem. Celular com DDD; o 55 do Brasil entra sozinho.
          </p>
          {erro && <Aviso tom="erro">{erro}</Aviso>}

          {leitura && (
            <div className="space-y-3">
              <p className="text-pequeno">
                <strong>{leitura.arquivo}</strong>: {n} {n === 1 ? 'contato' : 'contatos'}
                {leitura.semCelular > 0 &&
                  ` (${leitura.semCelular} ${leitura.semCelular === 1 ? 'linha sem celular ficou' : 'linhas sem celular ficaram'} de fora)`}
                .
              </p>
              <p className="text-legenda text-texto-3">
                Colunas: {leitura.reconhecidas.map((r) => `${r.cabecalho} → ${r.coluna}`).join(' · ')}
                {leitura.ignoradas.length > 0 && `. Não usadas: ${leitura.ignoradas.join(', ')}`}
              </p>
              <div className="max-h-[40vh] overflow-auto rounded-md border border-borda">
                <table className="w-full text-left text-legenda">
                  <thead className="sticky top-0 bg-fundo text-texto-3">
                    <tr>
                      <th className="px-3 py-2 font-medium">Contato</th>
                      <th className="px-3 py-2 font-medium">Celular</th>
                      <th className="px-3 py-2 font-medium">Etiquetas</th>
                      <th className="px-3 py-2 font-medium">Vendedor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {leitura.linhas.slice(0, 50).map((l, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">
                          <span className="block font-medium text-texto">{l.nome ?? '—'}</span>
                          {l.empresa && <span className="block text-texto-3">{l.empresa}</span>}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{formatarTelefone(l.telefone) || l.telefone}</td>
                        <td className="px-3 py-1.5">{l.etiquetas ?? '—'}</td>
                        <td className="px-3 py-1.5">{l.vendedor ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {n > 50 && <p className="text-legenda text-texto-3">Mostrando os 50 primeiros.</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
