import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { useContagemAguardando } from '../hooks/useConversas'
import { useNumerosCaidos } from '../hooks/useNumerosCaidos'
import { Avatar } from './Avatar'
import { LogoOrganizacao } from './LogoOrganizacao'
import { Icone, type NomeIcone } from './Icone'
import { Logo } from './Logo'
import { Modal } from './Modal'
import { useInstalarApp } from '../pwa'

type ItemMenu = { para: string; rotulo: string; icone: NomeIcone; contador?: number }
/** Bloco do menu: rótulo pequeno em cima (no menu só de ícones vira uma linha); bloco vazio não aparece. */
type GrupoMenu = { rotulo?: string; itens: ItemMenu[] }

/**
 * Casca da aplicação. Desktop (lg+): barra lateral com rótulos. Tablet (md): só ícones.
 * Celular: barra lateral vira gaveta aberta pelo botão de menu.
 */
export function Layout() {
  const { orgAtiva, organizacoes, trocarOrganizacao, sessao, equipe, sair, adminPlataforma, modulos, sairDoSuporte } = useSessao()
  const navegar = useNavigate()
  const aguardando = useContagemAguardando(orgAtiva?.id)
  const caidos = useNumerosCaidos(orgAtiva?.id)
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [gaveta, setGaveta] = useState(false)
  const app = useInstalarApp()
  const [ajudaIos, setAjudaIos] = useState(false)

  // Título da aba avisa quem está em outra aba.
  useEffect(() => {
    document.title = aguardando ? `(${aguardando}) Livih` : 'Livih'
  }, [aguardando])

  // Por tarefa: o dia a dia em cima, vendas, operação (módulos) e, no pé, o que se ajusta de vez em quando.
  const grupos: GrupoMenu[] = [
    {
      itens: [
        { para: '/painel', rotulo: 'Painel', icone: 'grafico' },
        { para: '/conversas', rotulo: 'Conversas', icone: 'conversas', contador: aguardando },
      ],
    },
    {
      rotulo: 'Vendas',
      itens: [
        { para: '/oportunidades', rotulo: 'Oportunidades', icone: 'funil' },
        { para: '/contatos', rotulo: 'Contatos', icone: 'usuario' },
        { para: '/clientes', rotulo: 'Clientes', icone: 'empresa' },
        ...(modulos?.has('agenda') ? [{ para: '/agenda', rotulo: 'Agenda', icone: 'calendario' as const }] : []),
      ],
    },
    {
      rotulo: 'Operação',
      itens: [
        ...(modulos?.has('erp')
          ? [
              { para: '/pedidos', rotulo: 'Pedidos', icone: 'pedido' as const },
              { para: '/produtos', rotulo: 'Produtos', icone: 'caixa' as const },
            ]
          : []),
        ...(modulos?.has('os') ? [{ para: '/os', rotulo: 'Ordens de serviço', icone: 'ferramenta' as const }] : []),
      ],
    },
  ]
  const rodape: ItemMenu[] = [
    { para: '/configuracoes', rotulo: 'Configurações', icone: 'config' },
    ...(adminPlataforma ? [{ para: '/empresas', rotulo: 'Empresas', icone: 'painel' as const }] : []),
  ]

  const userId = sessao?.user.id
  const meuNome = (userId && equipe.get(userId)?.nome) || sessao?.user.email || ''

  const link = (item: ItemMenu, compacto: boolean) => (
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
  )

  const menu = (compacto: boolean) => (
    <nav aria-label="Principal" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
      {grupos
        .filter((g) => g.itens.length)
        .map((g, n) => (
          <div key={g.rotulo ?? n} role="group" aria-label={g.rotulo} className="flex flex-col gap-1">
            {g.rotulo &&
              (compacto ? (
                <hr className="mx-2 my-2 border-borda" />
              ) : (
                <p className="px-3 pt-4 pb-1 text-legenda font-semibold tracking-wide text-texto-3 uppercase">{g.rotulo}</p>
              ))}
            {g.itens.map((item) => link(item, compacto))}
          </div>
        ))}
      <div className="mt-auto flex flex-col gap-1 border-t border-borda pt-3">{rodape.map((item) => link(item, compacto))}</div>
    </nav>
  )

  // A casca tem a altura da janela e nunca rola: cada tela rola por dentro (h-full + overflow-y-auto). Sem isso,
  // ao chegar no fim de uma lista interna a rolagem passava para a página inteira.
  // `relative` é o que segura os elementos absolutos (ex.: textos sr-only dos balões): sem um ancestral
  // posicionado eles são colocados em relação à página, o overflow-hidden não os corta e esticam a página.
  return (
    <div className="relative flex h-full overflow-hidden">
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
        <div className="flex min-h-0 flex-1 flex-col lg:hidden">{menu(true)}</div>
        <div className="hidden min-h-0 flex-1 flex-col lg:flex">{menu(false)}</div>
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
              <LogoOrganizacao orgId={orgAtiva.id} nome={orgAtiva.nome} />
              {/* Em modo suporte a empresa não está na lista: só o nome (sai-se pela faixa de suporte). */}
              {organizacoes.length > 1 && !orgAtiva.suporte ? (
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
            {(app.pronto || app.ios) && (
              <button
                onClick={() => (app.pronto ? void app.instalar() : setAjudaIos(true))}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-pequeno font-medium text-primaria hover:bg-primaria-suave"
              >
                <Icone nome="instalar" className="size-4" />
                <span className="hidden sm:inline">Instalar app</span>
                <span className="sr-only sm:hidden">Instalar app</span>
              </button>
            )}
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

        {orgAtiva?.suporte && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-atencao/30 bg-atencao-suave px-4 py-2 text-pequeno text-texto lg:px-6"
          >
            <Icone nome="olho" className="size-4 shrink-0 text-atencao" />
            <span className="font-semibold">Modo suporte: {orgAtiva.nome}.</span>
            <span className="text-texto-2">
              Você está dentro da empresa como equipe da plataforma. O que fizer aqui (responder, editar) fica com o seu nome.
            </span>
            <button
              type="button"
              onClick={() => {
                sairDoSuporte()
                navegar('/empresas')
              }}
              className="ml-auto font-semibold text-atencao underline"
            >
              Sair do modo suporte
            </button>
          </div>
        )}

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

        <Modal aberto={ajudaIos} titulo="Instalar o Livih no iPhone" aoFechar={() => setAjudaIos(false)}>
          <ol className="list-decimal space-y-2 pl-5 text-pequeno text-texto-2">
            <li>Abra o Livih no <strong>Safari</strong>.</li>
            <li>
              Toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima).
            </li>
            <li>
              Escolha <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.
            </li>
          </ol>
          <p className="mt-3 text-legenda text-texto-3">O ícone do Livih aparece na tela inicial e abre como um app, sem a barra do navegador.</p>
        </Modal>
      </div>
    </div>
  )
}
