import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatarDocumento, listarClientes, type ClienteLista } from '../services/clientes'
import { quandoCurto } from '../services/formato'
import { useSessao } from '../hooks/useSessao'
import { Avatar } from '../components/Avatar'
import { Aviso } from '../components/Aviso'
import { Botao } from '../components/Botao'
import { EstadoVazio } from '../components/EstadoVazio'
import { Icone } from '../components/Icone'
import { ModalCliente } from '../components/ModalCliente'
import { ModalImportarClientes } from '../components/ModalImportarClientes'

const local = (c: ClienteLista) => [c.cidade, c.uf].filter(Boolean).join('/')
const contatos = (c: ClienteLista) => c.contatos[0]?.count ?? 0

/** Clientes (docs/clientes.md): quem compra, com o cadastro fiscal; os contatos do WhatsApp ficam ligados a eles. */
export function Clientes() {
  const { orgAtiva, sessao, equipe, modulos } = useSessao()
  const orgId = orgAtiva!.id
  const eu = sessao?.user.id
  const comPedidos = !!modulos?.has('erp')
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [soMeus, setSoMeus] = useState(false)
  const [inativos, setInativos] = useState(false)
  const [dados, setDados] = useState<{ chave: string; lista: ClienteLista[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [versao, setVersao] = useState(0)
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 300)
    return () => clearTimeout(t)
  }, [busca])

  const chave = `${orgId}|${buscaAplicada}|${comPedidos}|${versao}`
  useEffect(() => {
    let ativo = true
    listarClientes(orgId, buscaAplicada, comPedidos)
      .then((lista) => ativo && (setDados({ chave, lista }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar os clientes.'))
    return () => {
      ativo = false
    }
  }, [orgId, buscaAplicada, comPedidos, chave])

  const lista = useMemo(() => {
    const todos = dados?.chave === chave ? dados.lista : null
    return todos?.filter((c) => (inativos || c.ativo) && (!soMeus || c.responsavel_id === eu)) ?? null
  }, [dados, chave, soMeus, inativos, eu])
  const filtrando = !!buscaAplicada || soMeus

  const responsavel = (id: string | null) => (id ? (id === eu ? 'Você' : (equipe.get(id)?.nome ?? '—')) : '—')

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1 font-semibold">Clientes</h1>
            <p className="text-pequeno text-texto-3">Quem compra: empresa (CNPJ) ou pessoa (CPF), com os contatos do WhatsApp ligados.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {gerencia && (
              <Botao variante="secundario" icone="arquivo" onClick={() => setImportando(true)}>
                Importar planilha
              </Botao>
            )}
            <Botao icone="mais" onClick={() => setNovo(true)}>
              Novo cliente
            </Botao>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-64 flex-1 sm:max-w-md">
            <span className="sr-only">Buscar clientes</span>
            <Icone nome="busca" className="pointer-events-none absolute top-3 left-3 size-4 text-texto-3" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, razão social, CNPJ/CPF ou cidade"
              className="h-10 w-full rounded-md border border-borda bg-superficie pr-3 pl-9 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2">
            <input type="checkbox" checked={soMeus} onChange={(e) => setSoMeus(e.target.checked)} className="size-4 accent-primaria" />
            Só os meus
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2">
            <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} className="size-4 accent-primaria" />
            Mostrar inativos
          </label>
          {lista && (
            <span className="ml-auto text-legenda text-texto-3">
              {lista.length} {lista.length === 1 ? 'cliente' : 'clientes'}
              {dados?.lista.length === 500 && ' (refine a busca para ver outros)'}
            </span>
          )}
        </div>

        {erro && <Aviso tom="erro">{erro}</Aviso>}

        <div className="overflow-hidden rounded-lg border border-borda bg-superficie">
          {!lista ? (
            <p className="p-5 text-pequeno text-texto-3" aria-busy="true">
              Carregando clientes…
            </p>
          ) : !lista.length ? (
            <EstadoVazio
              icone="empresa"
              titulo={filtrando ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
              acao={!filtrando && <Botao icone="mais" onClick={() => setNovo(true)}>Cadastrar cliente</Botao>}
            >
              {filtrando
                ? 'Tente outro termo ou tire o filtro.'
                : 'Cadastre as empresas que compram de você. Com o CNPJ, a razão social e o endereço vêm sozinhos.'}
            </EstadoVazio>
          ) : (
            <>
              <table className="hidden w-full text-left text-pequeno md:table">
                <thead className="bg-fundo text-legenda text-texto-3">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 font-medium">CNPJ/CPF</th>
                    <th className="px-4 py-2.5 font-medium">Cidade</th>
                    <th className="px-4 py-2.5 text-right font-medium">Contatos</th>
                    {comPedidos && <th className="px-4 py-2.5 font-medium">Último pedido</th>}
                    <th className="px-4 py-2.5 font-medium">Responsável</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {lista.map((c) => (
                    <tr key={c.id} onClick={() => navegar(`/clientes/${c.id}`)} className={`cursor-pointer hover:bg-fundo ${c.ativo ? '' : 'opacity-60'}`}>
                      <td className="px-4 py-3">
                        <Link to={`/clientes/${c.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                          <Avatar nome={c.nome} tamanho="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-texto">{c.nome}</span>
                            {c.razao_social && c.razao_social !== c.nome && (
                              <span className="block truncate text-legenda text-texto-3">{c.razao_social}</span>
                            )}
                            {!c.ativo && <span className="text-legenda text-texto-3">Inativo</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-texto-2 tabular-nums">{formatarDocumento(c.documento) || '—'}</td>
                      <td className="px-4 py-3 text-texto-2">{local(c) || '—'}</td>
                      <td className="px-4 py-3 text-right text-texto-2 tabular-nums">{contatos(c)}</td>
                      {comPedidos && (
                        <td className="px-4 py-3 text-texto-2">
                          {c.pedidos[0] ? `#${c.pedidos[0].numero} · ${quandoCurto(c.pedidos[0].criado_em)}` : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-texto-2">{responsavel(c.responsavel_id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul className="divide-y divide-borda md:hidden">
                {lista.map((c) => (
                  <li key={c.id}>
                    <Link to={`/clientes/${c.id}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-fundo ${c.ativo ? '' : 'opacity-60'}`}>
                      <Avatar nome={c.nome} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.nome}</span>
                        <span className="block truncate text-pequeno text-texto-3">
                          {[formatarDocumento(c.documento), local(c)].filter(Boolean).join(' · ') || 'Sem CNPJ/CPF'}
                        </span>
                      </span>
                      <span className="text-legenda text-texto-3">
                        {contatos(c)} {contatos(c) === 1 ? 'contato' : 'contatos'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {importando && (
        <ModalImportarClientes
          orgId={orgId}
          aoFechar={() => setImportando(false)}
          aoImportar={() => {
            setImportando(false)
            setVersao((v) => v + 1)
          }}
        />
      )}
      {novo && (
        <ModalCliente
          aoFechar={() => setNovo(false)}
          aoSalvar={(id) => {
            setNovo(false)
            navegar(`/clientes/${id}`)
          }}
        />
      )}
    </div>
  )
}
