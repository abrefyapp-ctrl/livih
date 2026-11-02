import { useEffect, useState, type FormEvent } from 'react'
import { buscarDadosCobranca, dadosCobrancaCompletos, salvarDadosCobranca, DADOS_COBRANCA_VAZIOS, type DadosCobranca as Dados } from '../services/cobranca'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CamposCobranca } from './CamposCobranca'

/**
 * Dados de cobrança de uma empresa, para conferir e salvar: na janela Plano (plataforma) e em Plano e consumo (dono).
 * Sem dados salvos, mostra a sugestão da emissora padrão, que só vale depois de salva.
 */
export function DadosCobranca({ orgId, podeEditar, aoSalvar }: { orgId: string; podeEditar: boolean; aoSalvar?: () => void }) {
  const [dados, setDados] = useState<{ orgId: string; d: Dados; sugerido: boolean; salvos: boolean } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let ativo = true
    buscarDadosCobranca(orgId)
      .then((r) => {
        if (!ativo) return
        setDados({ orgId, d: r?.dados ?? DADOS_COBRANCA_VAZIOS, sugerido: !!r?.sugerido, salvos: !!r && !r.sugerido })
        setErro(null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar os dados de cobrança. Confira a internet e tente de novo.'))
    return () => {
      ativo = false
    }
  }, [orgId])

  const atual = dados?.orgId === orgId ? dados : null

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!atual) return
    setSalvando(true)
    setErro(null)
    setAviso(null)
    try {
      await salvarDadosCobranca(orgId, atual.d)
      setDados({ ...atual, sugerido: false, salvos: true })
      setAviso('Dados de cobrança salvos.')
      aoSalvar?.()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-3" aria-labelledby={`titulo-cobranca-${orgId}`}>
      <div>
        <p id={`titulo-cobranca-${orgId}`} className="font-semibold">
          Dados de cobrança
        </p>
        <p className="text-pequeno text-texto-3">Quem paga a Livih. A cobrança do plano vai sair com estes dados.</p>
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {aviso && <Aviso>{aviso}</Aviso>}
      {!atual ? (
        !erro && <p className="text-pequeno text-texto-3">Carregando…</p>
      ) : (
        <>
          {atual.sugerido && (
            <Aviso tom="atencao">Ainda não salvos: trouxemos os dados de Configurações → Empresa. Confira, complete o que faltar e clique em Salvar dados de cobrança.</Aviso>
          )}
          {!atual.salvos && !atual.sugerido && (
            <Aviso tom="atencao">Faltam os dados de cobrança. Preencha e salve.</Aviso>
          )}
          <CamposCobranca
            dados={atual.d}
            mudar={(d) => setDados({ ...atual, d })}
            desabilitado={!podeEditar || salvando}
            prefixo={`cobranca-${orgId}`}
          />
          {podeEditar ? (
            <div className="space-y-1">
              <Botao type="submit" variante="secundario" carregando={salvando} disabled={!dadosCobrancaCompletos(atual.d)}>
                Salvar dados de cobrança
              </Botao>
              {!dadosCobrancaCompletos(atual.d) && (
                <p className="text-legenda text-texto-3">Preencha todos os campos para salvar. Só telefone e complemento são opcionais.</p>
              )}
            </div>
          ) : (
            <p className="text-legenda text-texto-3">Só o dono da empresa muda os dados de cobrança. Se algo estiver errado, peça ao dono.</p>
          )}
        </>
      )}
    </form>
  )
}
