import { useEffect, useState, type FormEvent } from 'react'
import { useSessao } from '../hooks/useSessao'
import {
  codigoNumero,
  criarNumero,
  desconectarNumero,
  editarNumero,
  iniciarNumero,
  ligarAgenteNoNumero,
  listarEquipeCompleta,
  listarNumeros,
  qrNumero,
  removerNumero,
  type MembroEquipe,
  type NumeroWhatsapp,
} from '../services/configuracoes'
import { formatarTelefone, haQuanto, quandoCurto } from '../services/formato'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { EstadoVazio } from './EstadoVazio'
import { Icone } from './Icone'
import { Modal } from './Modal'

type Edicao = { id: string | null; nome: string; responsavel_id: string }
type Confirmacao = { tipo: 'desconectar' | 'remover'; numero: NumeroWhatsapp }

function Ponto({ cor }: { cor: string }) {
  return <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${cor}`} />
}

function Situacao({ n }: { n: NumeroWhatsapp }) {
  const s = n.status_conexao
  if (s === 'WORKING')
    return (
      <p className="flex gap-2 text-pequeno">
        <Ponto cor="bg-destaque" />
        <span>
          Conectado{n.numero_conectado && ` · ${formatarTelefone(n.numero_conectado)}`}
          {n.conectado_em && <span className="text-texto-3"> · desde {quandoCurto(n.conectado_em).toLowerCase()}</span>}
        </span>
      </p>
    )
  if (s === 'SCAN_QR_CODE')
    return (
      <p className="flex gap-2 text-pequeno">
        <Ponto cor="bg-atencao" /> Aguardando o celular ser conectado
      </p>
    )
  if (s === 'STARTING')
    return (
      <p className="flex gap-2 text-pequeno">
        <Ponto cor="bg-atencao" /> Iniciando a conexão…
      </p>
    )
  if (s === 'INACESSIVEL')
    return (
      <p className="flex gap-2 text-pequeno">
        <Ponto cor="bg-erro" /> Servidor do WhatsApp fora do ar. Se continuar, avise o suporte da Livih.
      </p>
    )
  return (
    <p className="flex gap-2 text-pequeno">
      <Ponto cor="bg-erro" />
      {n.desconectado_em
        ? `Desconectado pela equipe ${haQuanto(n.desconectado_em)}`
        : n.caiu_em
          ? `Caiu ${haQuanto(n.caiu_em)}. Ninguém recebe as mensagens deste número.`
          : 'Não conectado'}
    </p>
  )
}

export function SecaoWhatsapp() {
  const { orgAtiva, sessao } = useSessao()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const eu = sessao?.user.id
  const [numeros, setNumeros] = useState<{ orgId: string; lista: NumeroWhatsapp[] } | null>(null)
  const [equipe, setEquipe] = useState<MembroEquipe[]>([])
  const [versao, setVersao] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [pareando, setPareando] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)

  const lista = numeros?.orgId === orgId ? numeros.lista : null
  const recarregar = () => setVersao((v) => v + 1)

  // Pareando, o estado muda em segundos; tudo conectado, basta conferir de vez em quando.
  useEffect(() => {
    let ativo = true
    let espera: ReturnType<typeof setTimeout>
    const ler = () =>
      listarNumeros(orgId)
        .then((l) => {
          if (!ativo) return
          setNumeros({ orgId, lista: l })
          setErro(null)
          espera = setTimeout(ler, l.every((n) => n.status_conexao === 'WORKING') ? 30_000 : 5_000)
        })
        .catch((e) => {
          if (!ativo) return
          setErro((e as Error).message)
          espera = setTimeout(ler, 15_000)
        })
    void ler()
    return () => {
      ativo = false
      clearTimeout(espera)
    }
  }, [orgId, versao])

  useEffect(() => {
    if (!gerencia) return
    let ativo = true
    listarEquipeCompleta(orgId)
      .then((e) => ativo && setEquipe(e.filter((m) => m.ativo)))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [orgId, gerencia])

  const nomeDe = (userId: string) => {
    const m = equipe.find((x) => x.user_id === userId)
    return userId === eu ? 'você' : (m?.nome ?? m?.email ?? 'um vendedor')
  }

  async function executar(id: string, fn: () => Promise<unknown>) {
    setOcupado(id)
    setErro(null)
    try {
      await fn()
      recarregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(null)
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!edicao) return
    const responsavel = edicao.responsavel_id || null
    await executar('edicao', async () => {
      if (edicao.id) await editarNumero(edicao.id, { nome: edicao.nome.trim(), responsavel_id: responsavel })
      else {
        const { canal } = await criarNumero(orgId, edicao.nome.trim(), responsavel)
        setPareando(canal.id)
      }
      setEdicao(null)
    })
  }

  return (
    <section aria-labelledby="titulo-whatsapp" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-whatsapp" className="text-h2 font-semibold">
            WhatsApp
          </h2>
          <p className="max-w-xl text-pequeno text-texto-3">
            O número da empresa é visto por toda a equipe. O número de um vendedor só por ele, pelo dono e pelos admins.
          </p>
        </div>
        {gerencia && (
          <Botao icone="mais" onClick={() => setEdicao({ id: null, nome: '', responsavel_id: '' })}>
            Adicionar número
          </Botao>
        )}
      </div>

      {!gerencia && <Aviso>Só dono e admin conectam, desconectam e mudam os números. Se um cair, avise um deles.</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!lista ? (
        <p className="text-pequeno text-texto-3" aria-busy="true">
          Consultando o WhatsApp…
        </p>
      ) : !lista.length ? (
        <div className="rounded-lg border border-borda bg-superficie">
          <EstadoVazio
            icone="telefone"
            titulo="Nenhum número conectado"
            acao={
              gerencia && (
                <Botao icone="telefone" onClick={() => setEdicao({ id: null, nome: 'Número da empresa', responsavel_id: '' })}>
                  Conectar o número da empresa
                </Botao>
              )
            }
          >
            Conecte o celular da empresa para o agente começar a atender. Use um número só para isso.
          </EstadoVazio>
        </div>
      ) : (
        <ul className="space-y-3">
          {lista.map((n) => {
            const conectado = n.status_conexao === 'WORKING'
            return (
              <li key={n.id} className="rounded-lg border border-borda bg-superficie">
                <div className="flex flex-wrap items-start gap-4 p-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium">{n.nome}</p>
                    <p className="text-legenda text-texto-3">
                      {n.responsavel_id ? `Número de ${nomeDe(n.responsavel_id)} · só ele(a), dono e admin veem as conversas` : 'Número da empresa · toda a equipe vê'}
                    </p>
                    <Situacao n={n} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {gerencia ? (
                      <label className="flex cursor-pointer items-center gap-2 text-pequeno text-texto-2" title="Agente de IA neste número">
                        <span className="relative inline-flex items-center">
                          <input
                            type="checkbox"
                            role="switch"
                            checked={n.agente_ativo}
                            disabled={ocupado === n.id}
                            onChange={(e) => void executar(n.id, () => ligarAgenteNoNumero(n.id, e.target.checked))}
                            className="peer sr-only"
                          />
                          <span className="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-primaria peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-destaque" />
                          <span className="absolute left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
                        </span>
                        Agente {n.agente_ativo ? 'ligado' : 'desligado'}
                      </label>
                    ) : (
                      <span className="text-pequeno text-texto-3">Agente {n.agente_ativo ? 'ligado' : 'desligado'}</span>
                    )}
                  </div>
                </div>

                {gerencia && (
                  <div className="flex flex-wrap gap-2 border-t border-borda px-4 py-3">
                    {!conectado && (
                      <Botao
                        tamanho="sm"
                        icone="telefone"
                        carregando={ocupado === n.id}
                        onClick={() =>
                          void executar(n.id, async () => {
                            await iniciarNumero(orgId, n.id)
                            setPareando(n.id)
                          })
                        }
                      >
                        Conectar celular
                      </Botao>
                    )}
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      onClick={() => setEdicao({ id: n.id, nome: n.nome, responsavel_id: n.responsavel_id ?? '' })}
                    >
                      Editar
                    </Botao>
                    {conectado && (
                      <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmacao({ tipo: 'desconectar', numero: n })}>
                        Desconectar
                      </Botao>
                    )}
                    <Botao tamanho="sm" variante="fantasma" icone="lixeira" onClick={() => setConfirmacao({ tipo: 'remover', numero: n })}>
                      Remover
                    </Botao>
                  </div>
                )}

                {gerencia && pareando === n.id && n.status_conexao === 'SCAN_QR_CODE' && (
                  <div className="border-t border-borda p-4">
                    <Pareamento orgId={orgId} canalId={n.id} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        aberto={!!edicao}
        titulo={edicao?.id ? 'Editar número' : 'Adicionar número'}
        aoFechar={() => setEdicao(null)}
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setEdicao(null)} disabled={ocupado === 'edicao'}>
              Cancelar
            </Botao>
            <Botao type="submit" form="form-numero" carregando={ocupado === 'edicao'} disabled={!edicao?.nome.trim()}>
              {edicao?.id ? 'Salvar' : 'Adicionar e conectar'}
            </Botao>
          </>
        }
      >
        {edicao && (
          <form id="form-numero" onSubmit={salvar} className="space-y-4">
            <CampoTexto
              rotulo="Nome do número"
              required
              value={edicao.nome}
              onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
              placeholder="Ex.: Comercial – Ana"
            />
            <div className="space-y-1.5">
              <label htmlFor="responsavel" className="block text-pequeno font-medium text-texto-2">
                De quem é este número
              </label>
              <select
                id="responsavel"
                value={edicao.responsavel_id}
                onChange={(e) => setEdicao({ ...edicao, responsavel_id: e.target.value })}
                className="block h-10 w-full rounded-md border border-borda bg-superficie px-3 focus:border-primaria focus:outline-none"
              >
                <option value="">Da empresa — toda a equipe vê</option>
                {equipe.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    De {m.nome || m.email} — só ele(a), dono e admin veem
                  </option>
                ))}
              </select>
            </div>
            {!edicao.id && (
              <p className="text-legenda text-texto-3">
                O agente começa desligado neste número. Ele usa as mesmas instruções e a mesma base da empresa.
              </p>
            )}
          </form>
        )}
      </Modal>

      <DialogoConfirmacao
        aberto={!!confirmacao}
        titulo={confirmacao?.tipo === 'remover' ? 'Remover este número?' : 'Desconectar este número?'}
        rotuloConfirmar={confirmacao?.tipo === 'remover' ? 'Remover número' : 'Desconectar'}
        perigo
        carregando={!!confirmacao && ocupado === confirmacao.numero.id}
        aoConfirmar={() =>
          confirmacao &&
          void executar(confirmacao.numero.id, async () => {
            if (confirmacao.tipo === 'remover') await removerNumero(orgId, confirmacao.numero.id)
            else await desconectarNumero(orgId, confirmacao.numero.id)
            setConfirmacao(null)
          })
        }
        aoCancelar={() => setConfirmacao(null)}
      >
        {confirmacao?.tipo === 'remover'
          ? `“${confirmacao.numero.nome}” sai da Livih. As conversas antigas continuam no histórico, mas nada novo entra ou sai por ele.`
          : `Nada entra ou sai por “${confirmacao?.numero.nome}” até alguém conectar o celular de novo.`}
      </DialogoConfirmacao>
    </section>
  )
}

/** QR code (renovado sozinho) ou código de 8 dígitos para quem está no próprio celular. */
function Pareamento({ orgId, canalId }: { orgId: string; canalId: string }) {
  const [modo, setModo] = useState<'qr' | 'codigo'>('qr')
  const [qr, setQr] = useState<string | null>(null)
  const [telefone, setTelefone] = useState('')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (modo !== 'qr') return
    let ativo = true
    let espera: ReturnType<typeof setTimeout>
    const buscar = () =>
      qrNumero(orgId, canalId)
        .then((r) => ativo && setQr(r.imagem))
        .catch(() => undefined)
        .finally(() => {
          if (ativo) espera = setTimeout(buscar, 15_000) // o WhatsApp troca o QR a cada ~20 s
        })
    void buscar()
    return () => {
      ativo = false
      clearTimeout(espera)
    }
  }, [orgId, canalId, modo])

  async function gerarCodigo() {
    setGerando(true)
    setErro(null)
    try {
      setCodigo((await codigoNumero(orgId, canalId, telefone)).codigo)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Forma de conectar" className="inline-flex rounded-md bg-slate-100 p-1 text-pequeno">
        {(
          [
            ['qr', 'Ler QR code'],
            ['codigo', 'Usar código'],
          ] as const
        ).map(([m, rotulo]) => (
          <button
            key={m}
            role="tab"
            aria-selected={modo === m}
            onClick={() => setModo(m)}
            className={`rounded px-3 py-1.5 font-medium ${modo === m ? 'bg-superficie text-texto shadow-sm' : 'text-texto-2'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {modo === 'qr' ? (
        <div className="flex flex-wrap gap-6">
          <div className="flex size-64 items-center justify-center rounded-lg ring-1 ring-borda">
            {qr ? (
              <img src={qr} alt="QR code para conectar o WhatsApp" className="size-60" />
            ) : (
              <span className="size-6 animate-spin rounded-full border-2 border-texto-3 border-t-transparent" />
            )}
          </div>
          <ol className="max-w-xs list-decimal space-y-2 pl-5 text-pequeno text-texto-2">
            <li>No celular deste número, abra o WhatsApp.</li>
            <li>
              Toque em <strong>⋮</strong> (Android) ou <strong>Configurações</strong> (iPhone) →{' '}
              <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong>.
            </li>
            <li>Aponte a câmera para o código. Ele se renova sozinho.</li>
          </ol>
        </div>
      ) : (
        <div className="max-w-md space-y-3">
          <p className="text-pequeno text-texto-2">Para quem está com esta tela aberta no próprio celular do número.</p>
          <div className="flex items-end gap-2">
            <CampoTexto
              rotulo="Número do celular"
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(41) 99999-8888"
              className="flex-1"
            />
            <Botao onClick={() => void gerarCodigo()} carregando={gerando} disabled={!telefone.trim()}>
              Gerar código
            </Botao>
          </div>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          {codigo && (
            <>
              <p className="rounded-lg bg-fundo py-4 text-center font-mono text-h1 font-semibold tracking-widest">{codigo}</p>
              <p className="flex gap-2 text-pequeno text-texto-2">
                <Icone nome="telefone" className="mt-0.5 size-4 shrink-0" />
                No WhatsApp: Dispositivos conectados → Conectar dispositivo → Conectar com número de telefone → digite o código.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
