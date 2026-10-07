import { Link } from 'react-router-dom'
import { EstadoVazio } from '../components/EstadoVazio'

export function NaoEncontrada() {
  return (
    <div className="flex h-full items-center justify-center">
      <EstadoVazio
        icone="busca"
        titulo="Página não encontrada"
        acao={
          <Link to="/conversas" className="font-medium text-primaria underline">
            Ir para as conversas
          </Link>
        }
      >
        O endereço pode estar errado ou a página mudou de lugar.
      </EstadoVazio>
    </div>
  )
}
