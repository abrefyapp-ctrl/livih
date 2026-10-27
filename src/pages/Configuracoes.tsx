import { NavLink, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { PrimeirosPassos } from '../components/PrimeirosPassos'
import { Icone, type NomeIcone } from '../components/Icone'
import { CLASSE_CAMPO } from '../components/ModaisOs'
import { SecaoAgente } from '../components/SecaoAgente'
import { SecaoBase } from '../components/SecaoBase'
import { SecaoDocumentos } from '../components/SecaoDocumentos'
import { SecaoEmpresa } from '../components/SecaoEmpresa'
import { SecaoEquipe } from '../components/SecaoEquipe'
import { SecaoModelos } from '../components/SecaoModelos'
import { SecaoNotificacoes } from '../components/SecaoNotificacoes'
import { SecaoOrdensServico } from '../components/SecaoOrdensServico'
import { SecaoUsoIa } from '../components/SecaoUsoIa'
import { SecaoWhatsapp } from '../components/SecaoWhatsapp'

type Grupo = 'Empresa' | 'WhatsApp' | 'Agente' | 'Módulos'

// Agrupadas e todas à vista: as abas em linha escondiam as últimas atrás de uma rolagem lateral sem barra (27/10).
const SECOES: { id: string; rotulo: string; icone: NomeIcone; grupo: Grupo; modulo?: string }[] = [
  { id: 'equipe', rotulo: 'Equipe', icone: 'equipe', grupo: 'Empresa' },
  { id: 'empresa', rotulo: 'Empresa', icone: 'empresa', grupo: 'Empresa' },
  { id: 'notificacoes', rotulo: 'Notificações', icone: 'sino', grupo: 'Empresa' },
  { id: 'whatsapp', rotulo: 'WhatsApp', icone: 'telefone', grupo: 'WhatsApp' },
  // Modelos só existem na API oficial (liberada para todas as empresas em 26/10).
  { id: 'modelos', rotulo: 'Modelos', icone: 'arquivo', grupo: 'WhatsApp' },
  { id: 'agente', rotulo: 'Agente', icone: 'agente', grupo: 'Agente' },
  { id: 'base', rotulo: 'Base de conhecimento', icone: 'livro', grupo: 'Agente' },
  { id: 'documentos', rotulo: 'Documentos', icone: 'arquivo', grupo: 'Agente' },
  { id: 'uso', rotulo: 'Uso da IA', icone: 'painel', grupo: 'Agente' },
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
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 pt-6 lg:px-8">
        <h1 className="text-h1 font-semibold">Configurações</h1>
        {gerencia && orgAtiva && (
          <div className="mt-4">
            <PrimeirosPassos orgId={orgAtiva.id} atualizar={secao} />
          </div>
        )}

        {/* Celular e tablet: uma lista de escolha, que deixa claro que há outras seções. */}
        <div className="mt-4 lg:hidden">
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

        <div className="lg:mt-6 lg:grid lg:grid-cols-[13rem_1fr] lg:gap-8">
          {/* Computador: menu lateral com todas as seções. */}
          <nav aria-label="Seções" className="hidden lg:block">
            <div className="sticky top-6 space-y-4">
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

          <div className="min-w-0 py-6 lg:pt-0">
            {secao === 'equipe' && <SecaoEquipe />}
            {secao === 'empresa' && <SecaoEmpresa />}
            {secao === 'whatsapp' && <SecaoWhatsapp />}
            {secao === 'modelos' && <SecaoModelos />}
            {secao === 'agente' && <SecaoAgente />}
            {secao === 'base' && <SecaoBase />}
            {secao === 'documentos' && <SecaoDocumentos />}
            {secao === 'uso' && <SecaoUsoIa />}
            {secao === 'notificacoes' && <SecaoNotificacoes />}
            {secao === 'os' && <SecaoOrdensServico />}
          </div>
        </div>
      </div>
    </div>
  )
}
