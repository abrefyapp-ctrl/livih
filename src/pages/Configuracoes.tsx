import { NavLink, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { CabecalhoPagina } from '../components/CabecalhoPagina'
import { PrimeirosPassos } from '../components/PrimeirosPassos'
import { Icone, type NomeIcone } from '../components/Icone'
import { CLASSE_CAMPO } from '../components/ModaisOs'
import { SecaoAgente } from '../components/SecaoAgente'
import { SecaoAvisosPedido } from '../components/SecaoAvisosPedido'
import { SecaoBase } from '../components/SecaoBase'
import { SecaoDocumentos } from '../components/SecaoDocumentos'
import { SecaoEmpresa } from '../components/SecaoEmpresa'
import { SecaoEquipe } from '../components/SecaoEquipe'
import { SecaoModelos } from '../components/SecaoModelos'
import { SecaoNotificacoes } from '../components/SecaoNotificacoes'
import { SecaoOrdensServico } from '../components/SecaoOrdensServico'
import { SecaoRespostas } from '../components/SecaoRespostas'
import { SecaoUsoIa } from '../components/SecaoUsoIa'
import { SecaoWhatsapp } from '../components/SecaoWhatsapp'

type Grupo = 'Empresa' | 'WhatsApp' | 'Agente' | 'Módulos'

// Agrupadas e todas à vista: as abas em linha escondiam as últimas atrás de uma rolagem lateral sem barra (27/10).
const SECOES: { id: string; rotulo: string; icone: NomeIcone; grupo: Grupo; modulo?: string }[] = [
  { id: 'equipe', rotulo: 'Equipe', icone: 'equipe', grupo: 'Empresa' },
  { id: 'empresa', rotulo: 'Empresa', icone: 'empresa', grupo: 'Empresa' },
  { id: 'notificacoes', rotulo: 'Notificações', icone: 'sino', grupo: 'Empresa' },
  // O plano mora na mesma seção do uso da IA (id 'uso' mantido: os avisos de franquia apontam para /configuracoes/uso).
  { id: 'uso', rotulo: 'Plano e consumo', icone: 'painel', grupo: 'Empresa' },
  { id: 'whatsapp', rotulo: 'WhatsApp', icone: 'telefone', grupo: 'WhatsApp' },
  // Modelos só existem na API oficial (liberada para todas as empresas em 26/10).
  { id: 'modelos', rotulo: 'Modelos', icone: 'arquivo', grupo: 'WhatsApp' },
  { id: 'respostas', rotulo: 'Respostas rápidas', icone: 'raio', grupo: 'WhatsApp' },
  { id: 'agente', rotulo: 'Agente', icone: 'agente', grupo: 'Agente' },
  { id: 'base', rotulo: 'Base de conhecimento', icone: 'livro', grupo: 'Agente' },
  { id: 'documentos', rotulo: 'Documentos', icone: 'arquivo', grupo: 'Agente' },
  { id: 'pedidos', rotulo: 'Aviso de pedidos', icone: 'pedido', grupo: 'Módulos', modulo: 'erp' },
  { id: 'os', rotulo: 'Ordens de serviço', icone: 'ferramenta', grupo: 'Módulos', modulo: 'os' },
]
const GRUPOS: Grupo[] = ['Empresa', 'WhatsApp', 'Agente', 'Módulos']

export function Configuracoes() {
  const { secao } = useParams()
  const navegar = useNavigate()
  const { orgAtiva, modulos } = useSessao()
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const secoes = SECOES.filter((s) => !s.modulo || modulos?.has(s.modulo))
  // Seção de módulo: espera os módulos carregarem antes de mandar embora.
  if (!modulos && SECOES.some((s) => s.id === secao && s.modulo)) return null
  if (!secoes.some((s) => s.id === secao)) return <Navigate to="/configuracoes/equipe" replace />

  return (
    // Tela larga (13/11): barra de título no alto, menu encostado à esquerda com rolagem própria e o conteúdo usando a
    // largura que sobra. Antes tudo ficava numa coluna central de 1.152 px, com vazio dos dois lados no monitor largo.
    <div className="relative flex h-full flex-col">
      <CabecalhoPagina
        titulo="Configurações"
        descricao={`Como ${orgAtiva?.nome ?? 'a empresa'} usa a Livih: equipe, números de WhatsApp, agente e módulos.`}
      />

      <div className="flex min-h-0 flex-1">
        {/* Computador: menu lateral com todas as seções. */}
        <nav aria-label="Seções" className="hidden w-56 shrink-0 overflow-y-auto border-r border-borda bg-superficie px-2 py-4 lg:block">
          <div className="space-y-4">
            {GRUPOS.map((g) => {
              const doGrupo = secoes.filter((s) => s.grupo === g)
              if (!doGrupo.length) return null
              return (
                <div key={g} role="group" aria-label={g} className="space-y-0.5">
                  <p className="px-3 pb-1 text-legenda font-semibold tracking-wide text-texto-3 uppercase">{g}</p>
                  {doGrupo.map((s) => (
                    <NavLink
                      key={s.id}
                      to={`/configuracoes/${s.id}`}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-md px-3 py-2 text-pequeno font-medium transition-colors ${
                          isActive ? 'bg-primaria-suave text-primaria' : 'text-texto-2 hover:bg-fundo hover:text-texto'
                        }`
                      }
                    >
                      <Icone nome={s.icone} className="size-4" />
                      {s.rotulo}
                    </NavLink>
                  ))}
                </div>
              )
            })}
          </div>
        </nav>

        {/* scrollbar-gutter: a barra de rolagem aparecia só nas seções longas e empurrava a tela ~7 px (11/11). */}
        <div className="min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="max-w-7xl space-y-4 px-4 py-6 lg:px-8">
            {gerencia && orgAtiva && <PrimeirosPassos orgId={orgAtiva.id} atualizar={secao} />}

            {/* Celular e tablet: uma lista de escolha, que deixa claro que há outras seções. */}
            <div className="lg:hidden">
              <label htmlFor="secao-config" className="sr-only">
                Seção
              </label>
              <select id="secao-config" value={secao} onChange={(e) => navegar(`/configuracoes/${e.target.value}`)} className={CLASSE_CAMPO}>
                {GRUPOS.map((g) => {
                  const doGrupo = secoes.filter((s) => s.grupo === g)
                  return doGrupo.length ? (
                    <optgroup key={g} label={g}>
                      {doGrupo.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.rotulo}
                        </option>
                      ))}
                    </optgroup>
                  ) : null
                })}
              </select>
            </div>

            <div className="min-w-0">
              {secao === 'equipe' && <SecaoEquipe />}
              {secao === 'empresa' && <SecaoEmpresa />}
              {secao === 'whatsapp' && <SecaoWhatsapp />}
              {secao === 'modelos' && <SecaoModelos />}
              {secao === 'respostas' && <SecaoRespostas />}
              {secao === 'agente' && <SecaoAgente />}
              {secao === 'base' && <SecaoBase />}
              {secao === 'documentos' && <SecaoDocumentos />}
              {secao === 'uso' && <SecaoUsoIa />}
              {secao === 'notificacoes' && <SecaoNotificacoes />}
              {secao === 'pedidos' && <SecaoAvisosPedido />}
              {secao === 'os' && <SecaoOrdensServico />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
