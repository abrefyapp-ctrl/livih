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
import { NaoEncontrada } from './pages/NaoEncontrada'
import { Configuracoes } from './pages/Configuracoes'
import { Contatos } from './pages/Contatos'
import { ContatoPerfil } from './pages/ContatoPerfil'
import { Oportunidades } from './pages/Oportunidades'
import { Empresas } from './pages/Empresas'

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
            <Route path="contatos" element={<Contatos />} />
            <Route path="contatos/:id" element={<ContatoPerfil />} />
            <Route path="oportunidades" element={<Oportunidades />} />
            <Route path="configuracoes/:secao?" element={<Configuracoes />} />
            <Route path="empresas" element={<Empresas />} />
            <Route path="*" element={<NaoEncontrada />} />
          </Route>
        </Routes>
      </ProvedorSessao>
    </BrowserRouter>
  </StrictMode>,
)
