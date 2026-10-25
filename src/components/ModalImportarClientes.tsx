import { useState } from 'react'
import { formatarDocumento, importarClientes, type ResultadoImportacao } from '../services/clientes'
import { modeloPlanilhaClientes, planilhaParaClientes, type LeituraClientes } from '../services/planilhaClientes'
import { textoDoArquivo } from '../services/planilhaOs'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Modal } from './Modal'

/**
 * Clientes → Importar planilha (dono e admin): baixa o modelo, lê o CSV, mostra a prévia e importa numa transação só.
 * O banco acha pelo CNPJ/CPF, atualiza só o que veio preenchido, cria o resto e liga os celulares aos contatos.
 */
export function ModalImportarClientes({ orgId, aoFechar, aoImportar }: { orgId: string; aoFechar: () => void; aoImportar: () => void }) {
  const [leitura, setLeitura] = useState<(LeituraClientes & { arquivo: string }) | null>(null)
  const [importando, setImportando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<ResultadoImportacao | null>(null)

  function baixarModelo() {
    const blob = new Blob([modeloPlanilhaClientes()], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'modelo-clientes.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function ler(f: File | undefined) {
    setErro(null)
    setLeitura(null)
    if (!f) return
    if (!/\.(csv|txt)$/i.test(f.name)) return setErro('Envie a planilha em CSV (no Excel: Arquivo → Salvar como → CSV).')
    const l = planilhaParaClientes(await textoDoArquivo(f))
    if (!l.reconhecidas.some((r) => ['Nome fantasia', 'Razão social', 'CNPJ/CPF'].includes(r.coluna))) {
      return setErro('Não achei a coluna do nome nem a do CNPJ/CPF. Confira o cabeçalho (a primeira linha) ou use o modelo.')
    }
    setLeitura({ ...l, arquivo: f.name })
  }

  async function confirmar() {
    if (!leitura?.linhas.length) return
    setImportando(true)
    setErro(null)
    try {
      setFeito(await importarClientes(orgId, leitura.linhas))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setImportando(false)
    }
  }

  return (
    <Modal
      aberto
      titulo="Importar clientes"
      largura="max-w-2xl"
      aoFechar={aoFechar}
      rodape={
        feito ? (
          <Botao onClick={aoImportar}>Ver os clientes</Botao>
        ) : (
          <>
            <Botao variante="secundario" onClick={aoFechar} disabled={importando}>
              Cancelar
            </Botao>
            <Botao onClick={() => void confirmar()} carregando={importando} disabled={!leitura?.linhas.length}>
              Importar {leitura?.linhas.length ? `${leitura.linhas.length} ${leitura.linhas.length === 1 ? 'cliente' : 'clientes'}` : ''}
            </Botao>
          </>
        )
      }
    >
      {feito ? (
        <div className="space-y-3">
          <Aviso tom="info">
            {feito.criados} {feito.criados === 1 ? 'cliente novo' : 'clientes novos'} e {feito.atualizados}{' '}
            {feito.atualizados === 1 ? 'atualizado' : 'atualizados'}.
            {feito.contatos_criados + feito.contatos_ligados > 0 &&
              ` Celulares: ${feito.contatos_criados} ${feito.contatos_criados === 1 ? 'contato criado' : 'contatos criados'} e ${feito.contatos_ligados} ${feito.contatos_ligados === 1 ? 'contato existente ligado' : 'contatos existentes ligados'}.`}{' '}
            Os novos ficam sem vendedor responsável (a equipe toda vê); dono e admin podem definir no cadastro.
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
            Uma linha por cliente. O cliente que já existe é achado pelo <strong>CNPJ/CPF</strong> (sem documento, pelo nome) e só
            muda no que vier preenchido; o resto é cadastrado. Se a linha tiver <strong>celular</strong>, ele vira um contato do
            WhatsApp ligado ao cliente.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Botao variante="secundario" tamanho="sm" icone="baixar" onClick={baixarModelo}>
              Baixar modelo
            </Botao>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primaria px-3 py-1.5 text-pequeno font-medium text-white hover:bg-primaria-hover">
              Escolher planilha (CSV)
              <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => void ler(e.target.files?.[0])} />
            </label>
          </div>
          <p className="text-legenda text-texto-3">
            No Excel: Arquivo → Salvar como → CSV. As colunas são reconhecidas pelo nome (CNPJ, Razão social, Fantasia, Cidade, UF,
            CEP, E-mail, Celular…), em qualquer ordem.
          </p>
          {erro && <Aviso tom="erro">{erro}</Aviso>}

          {leitura && (
            <div className="space-y-3">
              <p className="text-pequeno">
                <strong>{leitura.arquivo}</strong>: {leitura.linhas.length} {leitura.linhas.length === 1 ? 'cliente' : 'clientes'}
                {leitura.vazias > 0 && ` (${leitura.vazias} ${leitura.vazias === 1 ? 'linha sem nome nem documento ficou' : 'linhas sem nome nem documento ficaram'} de fora)`}.
              </p>
              <p className="text-legenda text-texto-3">
                Colunas: {leitura.reconhecidas.map((r) => `${r.cabecalho} → ${r.coluna}`).join(' · ')}
                {leitura.ignoradas.length > 0 && `. Não usadas: ${leitura.ignoradas.join(', ')}`}
              </p>
              <div className="max-h-[40vh] overflow-auto rounded-md border border-borda">
                <table className="w-full text-left text-legenda">
                  <thead className="sticky top-0 bg-fundo text-texto-3">
                    <tr>
                      <th className="px-3 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 font-medium">CNPJ/CPF</th>
                      <th className="px-3 py-2 font-medium">Cidade</th>
                      <th className="px-3 py-2 font-medium">Celular</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {leitura.linhas.slice(0, 50).map((l, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">
                          <span className="block font-medium text-texto">{l.nome ?? l.razao_social}</span>
                          {l.nome && l.razao_social && l.razao_social !== l.nome && <span className="block text-texto-3">{l.razao_social}</span>}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{formatarDocumento(l.documento) || '—'}</td>
                        <td className="px-3 py-1.5">{[l.cidade, l.uf].filter(Boolean).join('/') || '—'}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{l.celular ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {leitura.linhas.length > 50 && <p className="text-legenda text-texto-3">Mostrando as 50 primeiras.</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
