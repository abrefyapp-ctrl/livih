import { useEffect, useState } from 'react'
import { buscarCnpj } from '../services/clientes'
import { formatarDocumento, limparDocumento } from '../services/formato'
import { COM_TRANSPORTADORA, listarTransportadoras, MODALIDADES_FRETE, type TransportadoraNota } from '../services/nfe'
import type { FormTransporte } from '../services/transporteNota'
import { Botao } from './Botao'
import { Campo, CLASSE_CAMPO } from './ModaisOs'

// Transporte da NF-e (migration 20261111170000; JoGrampo, 11/11): quem paga o frete, a transportadora que coleta e os
// volumes. O formulário e a conversão para o envio ficam em services/transporteNota.ts.

export function SecaoTransporte({ orgId, valor, mudar }: { orgId: string; valor: FormTransporte; mudar: (f: FormTransporte) => void }) {
  const [salvas, setSalvas] = useState<TransportadoraNota[]>([])
  const [buscando, setBuscando] = useState(false)
  const [erroBusca, setErroBusca] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    listarTransportadoras(orgId)
      .then((l) => ativo && setSalvas(l))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId])

  const campo = (c: keyof Omit<FormTransporte, 'modalidade'>) => ({
    id: `transp-${c}`,
    value: valor[c],
    onChange: (e: { target: { value: string } }) => mudar({ ...valor, [c]: e.target.value }),
    className: CLASSE_CAMPO,
  })

  function escolher(documento: string) {
    const t = salvas.find((x) => x.documento === documento)
    if (!t) return
    mudar({ ...valor, ...t, documento: formatarDocumento(t.documento) })
  }

  async function buscar() {
    setBuscando(true)
    setErroBusca(null)
    try {
      const d = await buscarCnpj(valor.documento)
      const endereco = [d.logradouro, d.numero].filter(Boolean).join(', ')
      mudar({
        ...valor,
        nome: (d.razao_social || d.nome || valor.nome).slice(0, 60),
        endereco: (endereco || valor.endereco).slice(0, 60),
        municipio: d.cidade || valor.municipio,
        uf: d.uf || valor.uf,
      })
    } catch (e) {
      setErroBusca((e as Error).message)
    } finally {
      setBuscando(false)
    }
  }

  const comTransportadora = COM_TRANSPORTADORA.includes(valor.modalidade)
  const cnpjCompleto = limparDocumento(valor.documento).length === 14

  return (
    <fieldset className="space-y-3 rounded-md border border-borda p-3">
      <legend className="px-1 text-pequeno font-medium text-texto-2">Transporte</legend>

      <Campo rotulo="Frete por conta de" id="transp-modalidade">
        <select
          id="transp-modalidade"
          value={valor.modalidade}
          onChange={(e) => mudar({ ...valor, modalidade: Number(e.target.value) })}
          className={CLASSE_CAMPO}
        >
          {MODALIDADES_FRETE.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.rotulo}
            </option>
          ))}
        </select>
      </Campo>

      {comTransportadora && (
        <div className="space-y-3">
          {salvas.length > 0 && (
            <Campo rotulo="Transportadora já usada" id="transp-salva">
              <select id="transp-salva" value="" onChange={(e) => escolher(e.target.value)} className={CLASSE_CAMPO}>
                <option value="">Escolher para preencher…</option>
                {salvas.map((t) => (
                  <option key={t.documento} value={t.documento}>
                    {t.nome} · {formatarDocumento(t.documento)}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <div className="grid gap-3 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <Campo rotulo="CNPJ ou CPF da transportadora" id="transp-documento">
                <div className="flex gap-2">
                  <input
                    {...campo('documento')}
                    maxLength={18}
                    autoCapitalize="characters"
                    onBlur={() => mudar({ ...valor, documento: formatarDocumento(valor.documento) })}
                  />
                  {cnpjCompleto && (
                    <Botao variante="secundario" icone="busca" carregando={buscando} onClick={() => void buscar()} aria-label="Buscar o CNPJ na Receita">
                      Buscar
                    </Botao>
                  )}
                </div>
              </Campo>
            </div>
            <div className="sm:col-span-3">
              <Campo rotulo="Inscrição estadual" id="transp-inscricao_estadual">
                <input {...campo('inscricao_estadual')} maxLength={14} placeholder="Números ou ISENTO" />
              </Campo>
            </div>
            <div className="sm:col-span-6">
              <Campo rotulo="Nome ou razão social" id="transp-nome">
                <input {...campo('nome')} maxLength={60} />
              </Campo>
            </div>
            <div className="sm:col-span-6">
              <Campo rotulo="Endereço" id="transp-endereco">
                <input {...campo('endereco')} maxLength={60} placeholder="Rua e número" />
              </Campo>
            </div>
            <div className="sm:col-span-4">
              <Campo rotulo="Cidade" id="transp-municipio">
                <input {...campo('municipio')} maxLength={60} />
              </Campo>
            </div>
            <div className="sm:col-span-2">
              <Campo rotulo="UF" id="transp-uf">
                <input {...campo('uf')} maxLength={2} className={`${CLASSE_CAMPO} uppercase`} />
              </Campo>
            </div>
          </div>
          {erroBusca && <p className="text-legenda text-erro">{erroBusca}</p>}
        </div>
      )}

      <p className="pt-1 text-pequeno font-medium text-texto-2">Volumes</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Campo rotulo="Quantidade" id="transp-quantidade">
          <input {...campo('quantidade')} inputMode="numeric" maxLength={6} />
        </Campo>
        <Campo rotulo="Espécie" id="transp-especie">
          <input {...campo('especie')} maxLength={60} placeholder="Ex.: Caixa" />
        </Campo>
        <Campo rotulo="Marca" id="transp-marca">
          <input {...campo('marca')} maxLength={60} />
        </Campo>
        <Campo rotulo="Numeração" id="transp-numero">
          <input {...campo('numero')} maxLength={60} placeholder="Ex.: 1 a 3" />
        </Campo>
        <Campo rotulo="Peso líquido (kg)" id="transp-peso_liquido">
          <input {...campo('peso_liquido')} inputMode="decimal" maxLength={12} placeholder="0,000" />
        </Campo>
        <Campo rotulo="Peso bruto (kg)" id="transp-peso_bruto">
          <input {...campo('peso_bruto')} inputMode="decimal" maxLength={12} placeholder="0,000" />
        </Campo>
      </div>
      <p className="text-legenda text-texto-3">
        Deixe em branco o que não se aplica. Preenchendo algum dado dos volumes, a quantidade de embalagens é obrigatória.
        A transportadora fica guardada para as próximas notas.
      </p>
    </fieldset>
  )
}
