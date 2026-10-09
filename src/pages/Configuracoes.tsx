import { NavLink, Navigate, useParams } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { PrimeirosPassos } from '../components/PrimeirosPassos'
import { Icone, type NomeIcone } from '../components/Icone'
import { SecaoAgente } from '../components/SecaoAgente'
import { SecaoBase } from '../components/SecaoBase'
import { SecaoEquipe } from '../components/SecaoEquipe'
import { SecaoUsoIa } from '../components/SecaoUsoIa'
import { SecaoWhatsapp } from '../components/SecaoWhatsapp'

const SECOES: { id: string; rotulo: string; icone: NomeIcone }[] = [
  { id: 'equipe', rotulo: 'Equipe', icone: 'equipe' },
  { id: 'whatsapp', rotulo: 'WhatsApp', icone: 'telefone' },
  { id: 'agente', rotulo: 'Agente', icone: 'agente' },
  { id: 'base', rotulo: 'Base de conhecimento', icone: 'livro' },
  { id: 'uso', rotulo: 'Uso da IA', icone: 'painel' },
]

export function Configuracoes() {
  const { secao } = useParams()
  const { orgAtiva } = useSessao()
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  if (!SECOES.some((s) => s.id === secao)) return <Navigate to="/configuracoes/equipe" replace />

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 pt-6 lg:px-8">
        <h1 className="text-h1 font-semibold">Configurações</h1>
        {gerencia && orgAtiva && (
          <div className="mt-4">
            <PrimeirosPassos orgId={orgAtiva.id} atualizar={secao} />
          </div>
        )}
        <nav aria-label="Seções" className="mt-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-borda [scrollbar-width:none]">
          {SECOES.map((s) => (
            <NavLink
              key={s.id}
              to={`/configuracoes/${s.id}`}
              className={({ isActive }) =>
                `-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-pequeno font-medium transition-colors ${
                  isActive ? 'border-primaria text-primaria' : 'border-transparent text-texto-2 hover:text-texto'
                }`
              }
            >
              <Icone nome={s.icone} className="size-4" />
              {s.rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="py-6">
          {secao === 'equipe' && <SecaoEquipe />}
          {secao === 'whatsapp' && <SecaoWhatsapp />}
          {secao === 'agente' && <SecaoAgente />}
          {secao === 'base' && <SecaoBase />}
          {secao === 'uso' && <SecaoUsoIa />}
        </div>
      </div>
    </div>
  )
}
