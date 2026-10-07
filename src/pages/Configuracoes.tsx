import { NavLink, Navigate, useParams } from 'react-router-dom'
import { Icone, type NomeIcone } from '../components/Icone'
import { SecaoAgente } from '../components/SecaoAgente'
import { SecaoBase } from '../components/SecaoBase'
import { SecaoEquipe } from '../components/SecaoEquipe'
import { SecaoWhatsapp } from '../components/SecaoWhatsapp'

const SECOES: { id: string; rotulo: string; icone: NomeIcone }[] = [
  { id: 'equipe', rotulo: 'Equipe', icone: 'equipe' },
  { id: 'whatsapp', rotulo: 'WhatsApp', icone: 'telefone' },
  { id: 'agente', rotulo: 'Agente', icone: 'agente' },
  { id: 'base', rotulo: 'Base de conhecimento', icone: 'livro' },
]

export function Configuracoes() {
  const { secao } = useParams()
  if (!SECOES.some((s) => s.id === secao)) return <Navigate to="/configuracoes/equipe" replace />

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 pt-6 lg:px-8">
        <h1 className="text-h1 font-semibold">Configurações</h1>
        <nav aria-label="Seções" className="mt-4 flex gap-1 overflow-x-auto border-b border-borda">
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
        </div>
      </div>
    </div>
  )
}
