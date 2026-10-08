import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { useContagemAguardando } from '../hooks/useConversas'
import { useNumerosCaidos } from '../hooks/useNumerosCaidos'
import { Avatar } from './Avatar'
import { Icone, type NomeIcone } from './Icone'
import { Logo } from './Logo'

type ItemMenu = { para: string; rotulo: string; icone: NomeIcone; contador?: number }

/**
 * Casca da aplicação. Desktop (lg+): barra lateral com rótulos. Tablet (md): só ícones.
 * Celular: barra lateral vira gaveta aberta pelo botão de menu.
 */
export function Layout() {
  const { orgAtiva, organizacoes, trocarOrganizacao, sessao, equipe, sair, adminPlataforma } = useSessao()
  const aguardando = useContagemAguardando(orgAtiva?.id)
  const caidos = useNumerosCaidos(orgAtiva?.id)
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [gaveta, setGaveta] = useState(false)

  // Título da aba avisa quem está em outra aba.
  useEffect(() => {
    document.title = aguardando ? `(${aguardando}) Livih` : 'Livih'
  }, [aguardando])

  const itens: ItemMenu[] = [
    { para: '/conversas', rotulo: 'Conversas', icone: 'conversas', contador: aguardando },
    { para: '/contatos', rotulo: 'Contatos', icone: 'usuario' },
    { para: '/oportunidades', rotulo: 'Oportunidades', icone: 'funil' },
    { para: '/configuracoes', rotulo: 'Configurações', icone: 'config' },
    ...(adminPlataforma ? [{ para: '/empresas', rotulo: 'Empresas', icone: 'empresa' as const }] : []),
  ]

  const userId = sessao?.user.id
  const meuNome = (userId && equipe.get(userId)?.nome) || sessao?.user.email || ''

  const menu = (compacto: boolean) => (
    <nav aria-label="Principal" className="flex flex-col gap-1 p-3">
      {itens.map((item) => (
        <NavLink
          key={item.para}
          to={item.para}
          title={compacto ? item.rotulo : undefined}
          onClick={() => setGaveta(false)}
          className={({ isActive }) =>
            `relative flex h-10 items-center gap-3 rounded-md px-3 font-medium transition-colors ${
              isActive ? 'bg-primaria-suave text-primaria' : 'text-texto-2 hover:bg-fundo hover:text-texto'
            } ${compacto ? 'justify-center px-0' : ''}`
          }
        >
          <Icone nome={item.icone} />
          {!compacto && <span className="flex-1">{item.rotulo}</span>}
          {!!item.contador && (
            <span
              aria-label={`${item.contador} aguardando`}
              className={`rounded-full bg-atencao px-1.5 text-legenda font-semibold text-white ${
                compacto ? 'absolute top-1 right-1' : ''
              }`}
            >
              {item.contador}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )

  // A casca tem a altura da janela e nunca rola: cada tela rola por dentro (h-full + overflow-y-auto). Sem isso,
  // ao chegar no fim de uma lista interna a rolagem passava para a página inteira.
  return (
    <div className="flex h-full overflow-hidden">
      {/* barra lateral: tablet (compacta) e desktop */}
      <aside className="hidden shrink-0 flex-col border-r border-borda bg-superficie md:flex md:w-16 lg:w-60">
        <div className="flex h-16 items-center px-4 lg:px-5">
          <span className="lg:hidden">
            <Logo comNome={false} />
          </span>
          <span className="hidden lg:inline-flex">
            <Logo />
          </span>
        </div>
        <div className="lg:hidden">{menu(true)}</div>
        <div className="hidden lg:block">{menu(false)}</div>
      </aside>

      {/* gaveta no celular */}
      {gaveta && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button aria-label="Fechar menu" className="absolute inset-0 bg-navy-900/40" onClick={() => setGaveta(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-superficie shadow-xl">
            <div className="flex h-16 items-center justify-between px-5">
              <Logo />
              <button
                aria-label="Fechar menu"
                onClick={() => setGaveta(false)}
                className="rounded-md p-2 text-texto-2 hover:bg-fundo"
              >
                <Icone nome="fechar" />
              </button>
            </div>
            {menu(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-borda bg-superficie px-4 lg:px-6">
          <button
            aria-label="Abrir menu"
            onClick={() => setGaveta(true)}
            className="-ml-2 rounded-md p-2 text-texto-2 hover:bg-fundo md:hidden"
          >
            <Icone nome="menu" />
          </button>

          {orgAtiva && (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar nome={orgAtiva.nome} tamanho="sm" tom="organizacao" />
              {organizacoes.length > 1 ? (
                <label className="relative flex min-w-0 items-center">
                  <span className="sr-only">Organização</span>
                  <select
                    value={orgAtiva.id}
                    onChange={(e) => trocarOrganizacao(e.target.value)}
                    className="min-w-0 cursor-pointer appearance-none truncate rounded-md bg-transparent py-1 pr-7 pl-1 font-semibold text-texto hover:bg-fundo"
                  >
                    {organizacoes.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                        {o.status !== 'ativa' && ' (suspensa)'}
                      </option>
                    ))}
                  </select>
                  <Icone nome="abaixo" className="pointer-events-none absolute right-1 size-4 text-texto-3" />
                </label>
              ) : (
                <span className="truncate font-semibold">{orgAtiva.nome}</span>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-2 sm:flex">
              <Avatar nome={meuNome || '?'} tamanho="sm" />
              <span className="max-w-48 truncate text-pequeno font-medium text-texto-2">{meuNome}</span>
            </span>
            <button
              onClick={() => void sair()}
              aria-label="Sair"
              title="Sair"
              className="rounded-md p-2 text-texto-3 hover:bg-fundo hover:text-texto"
            >
              <Icone nome="sair" />
            </button>
          </div>
        </header>

        {caidos.length > 0 && (
          <div role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-erro px-4 py-2 text-pequeno text-white lg:px-6">
            <Icone nome="alerta" className="size-4 shrink-0" />
            <span className="font-semibold">
              {caidos.length === 1 ? `O WhatsApp “${caidos[0]}” está desconectado.` : `${caidos.length} números de WhatsApp estão desconectados.`}
            </span>
            <span>Nenhuma mensagem entra ou sai por ele até reconectar.</span>
            {gerencia ? (
              <Link to="/configuracoes/whatsapp" className="font-semibold underline">
                Reconectar
              </Link>
            ) : (
              <span>Avise um administrador.</span>
            )}
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
