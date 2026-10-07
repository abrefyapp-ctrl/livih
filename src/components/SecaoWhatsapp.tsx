import { useEffect, useState } from 'react'
import { useSessao } from '../hooks/useSessao'
import {
  codigoWhatsapp,
  desconectarWhatsapp,
  iniciarWhatsapp,
  qrWhatsapp,
  statusWhatsapp,
  type CanalConexao,
} from '../services/configuracoes'
import { formatarTelefone, haQuanto, quandoCurto } from '../services/formato'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { EstadoVazio } from './EstadoVazio'
import { Icone } from './Icone'

type Leitura = { orgId: string; canal: CanalConexao | null }

function Ponto({ cor }: { cor: string }) {
  return <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${cor}`} />
}

export function SecaoWhatsapp() {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const gerencia = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [leitura, setLeitura] = useState<Leitura | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [acao, setAcao] = useState<'iniciar' | 'desconectar' | null>(null)
  const [confirmarSaida, setConfirmarSaida] = useState(false)

  const canal = leitura?.orgId === orgId ? leitura.canal : undefined
  const status = canal?.status_conexao ?? null

  // Pareando, o estado muda em segundos; conectado, basta conferir de vez em quando.
  useEffect(() => {
    let ativo = true
    let espera: ReturnType<typeof setTimeout>
    const ler = () =>
      statusWhatsapp(orgId)
        .then((r) => {
          if (!ativo) return
          setLeitura({ orgId, canal: r.canal })
          setErro(null)
          espera = setTimeout(ler, r.canal?.status_conexao === 'WORKING' ? 30_000 : 5_000)
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
  }, [orgId])

  async function executar(tipo: 'iniciar' | 'desconectar') {
    setAcao(tipo)
    setErro(null)
    try {
      const r = tipo === 'iniciar' ? await iniciarWhatsapp(orgId) : await desconectarWhatsapp(orgId)
      setLeitura({ orgId, canal: r.canal })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setAcao(null)
      setConfirmarSaida(false)
    }
  }

  return (
    <section aria-labelledby="titulo-whatsapp" className="space-y-4">
      <div>
        <h2 id="titulo-whatsapp" className="text-h2 font-semibold">
          WhatsApp
        </h2>
        <p className="text-pequeno text-texto-3">O número da empresa por onde o agente e a equipe conversam com os clientes.</p>
      </div>

      {!gerencia && <Aviso>Só dono e admin conectam ou desconectam o número. Se ele cair, avise um deles.</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      <div className="rounded-lg border border-borda bg-superficie p-5">
        {canal === undefined ? (
          <p className="text-pequeno text-texto-3" aria-busy="true">
            Consultando o WhatsApp…
          </p>
        ) : canal === null ? (
          <EstadoVazio
            icone="telefone"
            titulo="Nenhum número conectado"
            acao={
              gerencia && (
                <Botao icone="telefone" carregando={acao === 'iniciar'} onClick={() => void executar('iniciar')}>
                  Conectar WhatsApp
                </Botao>
              )
            }
          >
            Conecte o celular da empresa para o agente começar a atender. Use um número só para isso.
          </EstadoVazio>
        ) : status === 'WORKING' ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <Ponto cor="bg-destaque" />
              <div>
                <p className="font-medium">Conectado{canal.numero_conectado && ` · ${formatarTelefone(canal.numero_conectado)}`}</p>
                {canal.conectado_em && (
                  <p className="text-pequeno text-texto-3">Desde {quandoCurto(canal.conectado_em).toLowerCase()}</p>
                )}
              </div>
            </div>
            {gerencia && (
              <Botao variante="secundario" tamanho="sm" onClick={() => setConfirmarSaida(true)}>
                Desconectar
              </Botao>
            )}
          </div>
        ) : status === 'SCAN_QR_CODE' ? (
          gerencia ? (
            <Pareamento orgId={orgId} />
          ) : (
            <div className="flex gap-3">
              <Ponto cor="bg-atencao" />
              <p>Aguardando alguém conectar o celular da empresa.</p>
            </div>
          )
        ) : status === 'STARTING' ? (
          <p className="flex items-center gap-2 text-pequeno text-texto-2">
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Iniciando a conexão…
          </p>
        ) : status === 'INACESSIVEL' ? (
          <div className="flex gap-3">
            <Ponto cor="bg-erro" />
            <div>
              <p className="font-medium">Servidor do WhatsApp fora do ar</p>
              <p className="text-pequeno text-texto-3">Não se resolve pelo celular. Se continuar assim por mais de alguns minutos, avise o suporte da Livih.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <Ponto cor="bg-erro" />
              <div>
                <p className="font-medium">Desconectado</p>
                <p className="text-pequeno text-texto-3">
                  {canal.desconectado_em
                    ? `Desconectado pela equipe ${haQuanto(canal.desconectado_em)}.`
                    : canal.caiu_em
                      ? `Caiu ${haQuanto(canal.caiu_em)}. Enquanto isso, ninguém recebe as mensagens.`
                      : 'O número não está conectado.'}
                </p>
              </div>
            </div>
            {gerencia && (
              <Botao icone="telefone" carregando={acao === 'iniciar'} onClick={() => void executar('iniciar')}>
                Conectar celular
              </Botao>
            )}
          </div>
        )}
      </div>

      <DialogoConfirmacao
        aberto={confirmarSaida}
        titulo="Desconectar o WhatsApp?"
        rotuloConfirmar="Desconectar"
        perigo
        carregando={acao === 'desconectar'}
        aoConfirmar={() => void executar('desconectar')}
        aoCancelar={() => setConfirmarSaida(false)}
      >
        O agente e a equipe param de receber e enviar mensagens por este número até alguém conectar o celular de novo.
      </DialogoConfirmacao>
    </section>
  )
}

/** QR code (renovado sozinho) ou código de 8 dígitos para quem está no próprio celular da empresa. */
function Pareamento({ orgId }: { orgId: string }) {
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
      qrWhatsapp(orgId)
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
  }, [orgId, modo])

  async function gerarCodigo() {
    setGerando(true)
    setErro(null)
    try {
      setCodigo((await codigoWhatsapp(orgId, telefone)).codigo)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Ponto cor="bg-atencao" />
        <p className="font-medium">Aguardando o celular da empresa</p>
      </div>
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
            <li>No celular da empresa, abra o WhatsApp.</li>
            <li>
              Toque em <strong>⋮</strong> (Android) ou <strong>Configurações</strong> (iPhone) →{' '}
              <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong>.
            </li>
            <li>Aponte a câmera para o código. Ele se renova sozinho.</li>
          </ol>
        </div>
      ) : (
        <div className="max-w-md space-y-3">
          <p className="text-pequeno text-texto-2">Para quem está com esta tela aberta no próprio celular da empresa.</p>
          <div className="flex items-end gap-2">
            <CampoTexto
              rotulo="Número do celular da empresa"
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
