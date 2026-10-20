import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './styles/global.css'
import { ProvedorSessao } from './components/ProvedorSessao'
import { RotaProtegida } from './components/RotaProtegida'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { DefinirSenha } from './pages/DefinirSenha'
import { Conversas } from './pages/Conversas'
import { Painel } from './pages/Painel'
import { NaoEncontrada } from './pages/NaoEncontrada'
import { Configuracoes } from './pages/Configuracoes'
import { Contatos } from './pages/Contatos'
import { ContatoPerfil } from './pages/ContatoPerfil'
import { Agenda } from './pages/Agenda'
import { Oportunidades } from './pages/Oportunidades'
import { PedidoDetalhe } from './pages/PedidoDetalhe'
import { Pedidos } from './pages/Pedidos'
import { Produtos } from './pages/Produtos'
import { Empresas } from './pages/Empresas'
import { registrarServiceWorker } from './pwa'

registrarServiceWorker()

// Depois de um deploy, os arquivos antigos (chunks com hash) somem: uma aba aberta antes dele falha ao carregar
// telas e o PDF sob demanda. Recarrega uma vez para pegar a versão nova (a trava evita loop se o erro for outro).
window.addEventListener('vite:preloadError', (e) => {
  try {
    const ultima = Number(sessionStorage.getItem('livih-recarga-versao') ?? 0)
    if (Date.now() - ultima < 30_000) return
    sessionStorage.setItem('livih-recarga-versao', String(Date.now()))
  } catch {
    return
  }
  e.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorSessao>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/definir-senha" element={<DefinirSenha />} />
          <Route
            element={
              <RotaProtegida>
                <Layout />
              </RotaProtegida>
            }
          >
            <Route index element={<Navigate to="/conversas" replace />} />
            <Route path="conversas/:id?" element={<Conversas />} />
            <Route path="painel" element={<Painel />} />
            <Route path="contatos" element={<Contatos />} />
            <Route path="contatos/:id" element={<ContatoPerfil />} />
            <Route path="oportunidades" element={<Oportunidades />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="pedidos" element={<Pedidos />} />
            <Route path="pedidos/:id" element={<PedidoDetalhe />} />
            <Route path="produtos" element={<Produtos />} />
            <Route path="configuracoes/:secao?" element={<Configuracoes />} />
            <Route path="empresas" element={<Empresas />} />
            <Route path="*" element={<NaoEncontrada />} />
          </Route>
        </Routes>
      </ProvedorSessao>
    </BrowserRouter>
  </StrictMode>,
)
