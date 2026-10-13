import { useEffect, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import { definirModulo, listarModulos, type Modulo } from '../services/modulos'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Modal } from './Modal'

/** Painel da plataforma: liga e desliga os módulos de uma empresa (o que ela paga à parte fica marcado). */
export function ModalModulos({ empresa, aoFechar }: { empresa: { id: string; nome: string }; aoFechar: () => void }) {
  const { orgAtiva, recarregarModulos } = useSessao()
  const [modulos, setModulos] = useState<Modulo[] | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarModulos(empresa.id)
      .then((l) => ativo && setModulos(l))
      .catch(() => ativo && setErro('Não foi possível carregar os módulos.'))
    return () => {
      ativo = false
    }
  }, [empresa.id])

  async function alternar(m: Modulo) {
    setOcupado(m.codigo)
    setErro(null)
    try {
      await definirModulo(empresa.id, m.codigo, !m.ativo)
      setModulos((l) => l?.map((x) => (x.codigo === m.codigo ? { ...x, ativo: !m.ativo } : x)) ?? null)
      // Se a empresa mexida é a que está aberta, o menu acompanha na hora.
      if (orgAtiva?.id === empresa.id) recarregarModulos()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <Modal
      aberto
      titulo={`Módulos de ${empresa.nome}`}
      aoFechar={aoFechar}
      rodape={
        <Botao variante="secundario" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      <div className="space-y-4">
        {erro && <Aviso tom="erro">{erro}</Aviso>}
        {!modulos ? (
          <p className="text-pequeno text-texto-3" aria-busy="true">
            Carregando…
          </p>
        ) : (
          <ul className="divide-y divide-borda">
            {modulos.map((m) => (
              <li key={m.codigo} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {m.nome}
                    {m.adicional ? (
                      <span className="rounded-sm bg-atencao-suave px-1.5 py-0.5 text-legenda font-medium text-atencao">Pacote adicional</span>
                    ) : (
                      <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-legenda font-medium text-texto-3">Todos os planos</span>
                    )}
                  </p>
                  <p className="text-pequeno text-texto-3">{m.descricao}</p>
                  {m.ativo !== m.padrao && (
                    <p className="text-legenda text-texto-3">{m.ativo ? 'Ligado só para esta empresa.' : 'Desligado só para esta empresa.'}</p>
                  )}
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-pequeno text-texto-2">
                  <span className="relative inline-flex items-center">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={m.ativo}
                      disabled={ocupado === m.codigo}
                      onChange={() => void alternar(m)}
                      className="peer sr-only"
                    />
                    <span className="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-primaria peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-destaque" />
                    <span className="absolute left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
                  </span>
                  {m.ativo ? 'Ligado' : 'Desligado'}
                </label>
              </li>
            ))}
          </ul>
        )}
        <p className="text-legenda text-texto-3">Desligar um módulo esconde as telas dele. Os dados já registrados continuam guardados.</p>
      </div>
    </Modal>
  )
}
