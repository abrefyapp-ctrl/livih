import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { useSessao } from '../hooks/useSessao'
import { normalizarTelefone } from '../services/crm'
import {
  buscarCep,
  cnpjValido,
  definirPadrao,
  formatarCnpj,
  listarEmissoras,
  removerEmissora,
  salvarEmissora,
  tirarLogo,
  trocarLogo,
  urlLogo,
  type DadosEmissora,
  type Emissora,
} from '../services/empresa'
import { formatarTelefone } from '../services/formato'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { DialogoConfirmacao } from './DialogoConfirmacao'
import { EstadoVazio } from './EstadoVazio'
import { Icone } from './Icone'
import { Modal } from './Modal'

const LIMITE_LOGO = 2 * 1024 * 1024

type Form = {
  id: string
  nova: boolean
  logo_path: string | null
  razao_social: string
  nome_fantasia: string
  cnpj: string
  inscricao_estadual: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  telefone: string
  email: string
  site: string
  validade_dias: string
  condicoes_pagamento: string
  prazo_entrega: string
  rodape: string
}

const VAZIO: Omit<Form, 'id' | 'nova' | 'logo_path'> = {
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  inscricao_estadual: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  telefone: '',
  email: '',
  site: '',
  validade_dias: '7',
  condicoes_pagamento: '',
  prazo_entrega: '',
  rodape: '',
}

function paraForm(e: Emissora): Form {
  return {
    id: e.id,
    nova: false,
    logo_path: e.logo_path,
    razao_social: e.razao_social,
    nome_fantasia: e.nome_fantasia ?? '',
    cnpj: formatarCnpj(e.cnpj),
    inscricao_estadual: e.inscricao_estadual ?? '',
    cep: e.cep ? `${e.cep.slice(0, 5)}-${e.cep.slice(5)}` : '',
    logradouro: e.logradouro ?? '',
    numero: e.numero ?? '',
    complemento: e.complemento ?? '',
    bairro: e.bairro ?? '',
    cidade: e.cidade ?? '',
    uf: e.uf ?? '',
    telefone: formatarTelefone(e.telefone),
    email: e.email ?? '',
    site: e.site ?? '',
    validade_dias: String(e.validade_dias),
    condicoes_pagamento: e.condicoes_pagamento ?? '',
    prazo_entrega: e.prazo_entrega ?? '',
    rodape: e.rodape ?? '',
  }
}

const ouNulo = (v: string) => v.trim() || null

/** Logo guardada no bucket privado: busca a URL temporária. */
function Logo({ path, className }: { path: string | null; className: string }) {
  const [url, setUrl] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!path) return
    let ativo = true
    urlLogo(path)
      .then((u) => ativo && setUrl({ path, url: u }))
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [path])
  const src = path && url?.path === path ? url.url : null
  if (!src)
    return (
      <div className={`flex items-center justify-center rounded-md bg-fundo text-texto-3 ring-1 ring-borda ${className}`}>
        <Icone nome="empresa" className="size-6" />
      </div>
    )
  return <img src={src} alt="Logo" className={`rounded-md bg-white object-contain ring-1 ring-borda ${className}`} />
}

function AreaTexto({ rotulo, ajuda, ...resto }: { rotulo: string; ajuda?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = `campo-${rotulo.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-pequeno font-medium text-texto-2">
        {rotulo}
      </label>
      <textarea
        id={id}
        rows={3}
        className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno focus:border-primaria focus:outline-none"
        {...resto}
      />
      {ajuda && <p className="text-legenda text-texto-3">{ajuda}</p>}
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-pequeno font-semibold text-texto">{titulo}</legend>
      {children}
    </fieldset>
  )
}

export function SecaoEmpresa() {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const podeEditar = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [dados, setDados] = useState<{ orgId: string; lista: Emissora[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [form, setForm] = useState<Form | null>(null)
  const [logoNova, setLogoNova] = useState<File | null>(null)
  const [tirarLogoAtual, setTirarLogoAtual] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [remover, setRemover] = useState<Emissora | null>(null)
  const seletorLogo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let ativo = true
    listarEmissoras(orgId)
      .then((lista) => ativo && (setDados({ orgId, lista }), setErro(null)))
      .catch(() => ativo && setErro('Não foi possível carregar os dados da empresa.'))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  const previaLogo = useMemo(() => (logoNova ? URL.createObjectURL(logoNova) : null), [logoNova])
  useEffect(() => () => void (previaLogo && URL.revokeObjectURL(previaLogo)), [previaLogo])

  const lista = dados?.orgId === orgId ? dados.lista : null
  const recarregar = () => setVersao((v) => v + 1)

  function abrir(f: Form) {
    setForm(f)
    setLogoNova(null)
    setTirarLogoAtual(false)
    setErroForm(null)
  }
  const abrirNova = () => abrir({ id: crypto.randomUUID(), nova: true, logo_path: null, ...VAZIO })
  const campo = (k: keyof typeof VAZIO) => ({
    value: form?.[k] ?? '',
    onChange: (e: { target: { value: string } }) => setForm((f) => f && { ...f, [k]: e.target.value }),
  })

  async function preencherCep() {
    if (!form) return
    const end = await buscarCep(form.cep)
    if (!end) return
    setForm((f) =>
      f && {
        ...f,
        logradouro: f.logradouro || end.logradouro,
        bairro: f.bairro || end.bairro,
        cidade: f.cidade || end.cidade,
        uf: f.uf || end.uf,
      },
    )
  }

  function escolherLogo(arquivo: File | undefined) {
    if (!arquivo) return
    if (!['image/png', 'image/jpeg'].includes(arquivo.type)) return setErroForm('A logo precisa ser PNG ou JPG.')
    if (arquivo.size > LIMITE_LOGO) return setErroForm('A logo pode ter até 2 MB.')
    setErroForm(null)
    setLogoNova(arquivo)
    setTirarLogoAtual(false)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    const cnpj = form.cnpj.replace(/\D/g, '')
    if (!cnpjValido(cnpj)) return setErroForm('CNPJ inválido. Confira os números.')
    const telefone = normalizarTelefone(form.telefone)
    if (telefone === undefined) return setErroForm('Telefone inválido. Use DDD e número.')
    const cep = form.cep.replace(/\D/g, '')
    if (cep && cep.length !== 8) return setErroForm('O CEP tem 8 números.')
    const uf = form.uf.trim().toUpperCase()
    if (uf && !/^[A-Z]{2}$/.test(uf)) return setErroForm('UF são duas letras (ex.: PR).')
    const validade = Number(form.validade_dias)
    if (!Number.isInteger(validade) || validade < 1 || validade > 365) return setErroForm('A validade vai de 1 a 365 dias.')

    const campos: DadosEmissora = {
      razao_social: form.razao_social.trim(),
      nome_fantasia: ouNulo(form.nome_fantasia),
      cnpj,
      inscricao_estadual: ouNulo(form.inscricao_estadual),
      cep: cep || null,
      logradouro: ouNulo(form.logradouro),
      numero: ouNulo(form.numero),
      complemento: ouNulo(form.complemento),
      bairro: ouNulo(form.bairro),
      cidade: ouNulo(form.cidade),
      uf: uf || null,
      telefone,
      email: ouNulo(form.email),
      site: ouNulo(form.site),
      validade_dias: validade,
      condicoes_pagamento: ouNulo(form.condicoes_pagamento),
      prazo_entrega: ouNulo(form.prazo_entrega),
      rodape: ouNulo(form.rodape),
    }
    setSalvando(true)
    setErroForm(null)
    try {
      await salvarEmissora(orgId, form.id, form.nova, campos)
      // Daqui em diante a empresa existe: se a logo falhar, quem tenta de novo edita (não cria outra).
      setForm((f) => f && { ...f, nova: false })
      if (logoNova) await trocarLogo(orgId, form, logoNova)
      else if (tirarLogoAtual) await tirarLogo(form)
      setForm(null)
      recarregar()
    } catch (err) {
      setErroForm((err as Error).message)
      recarregar()
    } finally {
      setSalvando(false)
    }
  }

  async function tornarPadrao(e: Emissora) {
    try {
      await definirPadrao(e.id)
      recarregar()
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  async function confirmarRemocao() {
    if (!remover) return
    setSalvando(true)
    try {
      await removerEmissora(remover)
      recarregar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
      setRemover(null)
    }
  }

  const mostrarLogo = logoNova ? previaLogo : !tirarLogoAtual ? form?.logo_path : null

  return (
    <section aria-labelledby="titulo-empresa" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-empresa" className="text-h2 font-semibold">
            Empresa
          </h2>
          <p className="max-w-xl text-pequeno text-texto-3">
            Logo e dados que saem no orçamento e no pedido em PDF. Com mais de um CNPJ, cadastre cada um: a empresa
            padrão vem marcada em todo pedido novo, e dá para trocar no pedido.
          </p>
        </div>
        {podeEditar && !!lista?.length && (
          <Botao icone="mais" variante="secundario" onClick={abrirNova}>
            Outro CNPJ
          </Botao>
        )}
      </div>

      {!podeEditar && <Aviso>Só dono e admin alteram os dados da empresa.</Aviso>}
      {erro && <Aviso tom="erro">{erro}</Aviso>}

      {!lista ? (
        <p className="text-pequeno text-texto-3">Carregando…</p>
      ) : !lista.length ? (
        <div className="rounded-lg border border-borda bg-superficie">
          <EstadoVazio
            icone="empresa"
            titulo="Dados da empresa ainda não cadastrados"
            acao={
              podeEditar && (
                <Botao icone="mais" onClick={abrirNova}>
                  Cadastrar a empresa
                </Botao>
              )
            }
          >
            Sem eles, o orçamento em PDF sai sem logo, CNPJ e endereço.
          </EstadoVazio>
        </div>
      ) : (
        <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
          {lista.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-4 px-4 py-3 sm:flex-nowrap">
              <Logo path={e.logo_path} className="size-14 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {e.nome_fantasia || e.razao_social}
                  {e.padrao && lista.length > 1 && (
                    <span className="rounded-sm bg-primaria-suave px-1.5 py-0.5 text-legenda font-normal text-primaria">
                      Padrão
                    </span>
                  )}
                </p>
                <p className="text-pequeno text-texto-3">
                  {e.nome_fantasia && `${e.razao_social} · `}CNPJ {formatarCnpj(e.cnpj)}
                </p>
                {(e.cidade || e.telefone) && (
                  <p className="text-legenda text-texto-3">
                    {[e.cidade && `${e.cidade}${e.uf ? `/${e.uf}` : ''}`, formatarTelefone(e.telefone)].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              {podeEditar && (
                <div className="flex flex-wrap gap-1">
                  {!e.padrao && (
                    <Botao tamanho="sm" variante="fantasma" onClick={() => void tornarPadrao(e)}>
                      Tornar padrão
                    </Botao>
                  )}
                  <Botao tamanho="sm" variante="secundario" onClick={() => abrir(paraForm(e))}>
                    Editar
                  </Botao>
                  <Botao
                    tamanho="sm"
                    variante="fantasma"
                    icone="lixeira"
                    onClick={() => setRemover(e)}
                    aria-label={`Remover ${e.nome_fantasia || e.razao_social}`}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        aberto={!!form}
        titulo={form?.nova ? 'Dados da empresa' : `Editar ${form?.razao_social ?? ''}`}
        aoFechar={() => !salvando && setForm(null)}
        largura="max-w-2xl"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setForm(null)} disabled={salvando}>
              Cancelar
            </Botao>
            <Botao type="submit" form="form-empresa" carregando={salvando} disabled={!form?.razao_social.trim() || !form?.cnpj.trim()}>
              Salvar
            </Botao>
          </>
        }
      >
        {form && (
          <form id="form-empresa" onSubmit={salvar} className="space-y-6">
            {erroForm && <Aviso tom="erro">{erroForm}</Aviso>}

            <Grupo titulo="Identificação">
              <div className="flex items-center gap-4">
                {logoNova && previaLogo ? (
                  <img src={previaLogo} alt="Logo nova" className="size-20 shrink-0 rounded-md bg-white object-contain ring-1 ring-borda" />
                ) : (
                  <Logo path={mostrarLogo ?? null} className="size-20 shrink-0" />
                )}
                <div className="space-y-1.5">
                  <input
                    ref={seletorLogo}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      escolherLogo(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Botao tamanho="sm" variante="secundario" onClick={() => seletorLogo.current?.click()}>
                      {mostrarLogo ? 'Trocar logo' : 'Escolher logo'}
                    </Botao>
                    {mostrarLogo && (
                      <Botao
                        tamanho="sm"
                        variante="fantasma"
                        onClick={() => (logoNova ? setLogoNova(null) : setTirarLogoAtual(true))}
                      >
                        Tirar
                      </Botao>
                    )}
                  </div>
                  <p className="text-legenda text-texto-3">PNG ou JPG, até 2 MB. Fundo transparente ou branco fica melhor.</p>
                </div>
              </div>
              <CampoTexto rotulo="Razão social" required maxLength={200} {...campo('razao_social')} />
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoTexto rotulo="Nome fantasia" maxLength={200} {...campo('nome_fantasia')} />
                <CampoTexto
                  rotulo="CNPJ"
                  required
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  {...campo('cnpj')}
                  onBlur={() => setForm((f) => f && { ...f, cnpj: formatarCnpj(f.cnpj.replace(/\D/g, '')) })}
                  erro={form.cnpj.replace(/\D/g, '').length === 14 && !cnpjValido(form.cnpj) ? 'CNPJ inválido' : undefined}
                />
                <CampoTexto rotulo="Inscrição estadual" maxLength={30} {...campo('inscricao_estadual')} />
              </div>
            </Grupo>

            <Grupo titulo="Endereço">
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <CampoTexto rotulo="CEP" inputMode="numeric" placeholder="00000-000" {...campo('cep')} onBlur={() => void preencherCep()} />
                <CampoTexto rotulo="Logradouro" maxLength={200} {...campo('logradouro')} />
              </div>
              <div className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr]">
                <CampoTexto rotulo="Número" maxLength={20} {...campo('numero')} />
                <CampoTexto rotulo="Complemento" maxLength={100} {...campo('complemento')} />
                <CampoTexto rotulo="Bairro" maxLength={100} {...campo('bairro')} />
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
                <CampoTexto rotulo="Cidade" maxLength={100} {...campo('cidade')} />
                <CampoTexto rotulo="UF" maxLength={2} {...campo('uf')} />
              </div>
            </Grupo>

            <Grupo titulo="Contato">
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoTexto rotulo="Telefone" inputMode="tel" placeholder="(41) 3333-4444" {...campo('telefone')} />
                <CampoTexto rotulo="E-mail" type="email" maxLength={200} {...campo('email')} />
              </div>
              <CampoTexto rotulo="Site" maxLength={200} placeholder="www.suaempresa.com.br" {...campo('site')} />
            </Grupo>

            <Grupo titulo="Padrões do orçamento">
              <p className="-mt-1 text-legenda text-texto-3">Vêm preenchidos em todo pedido novo; dá para mudar em cada um.</p>
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <CampoTexto rotulo="Validade (dias)" type="number" min={1} max={365} {...campo('validade_dias')} />
                <CampoTexto rotulo="Prazo de entrega" maxLength={500} placeholder="Ex.: 10 dias úteis" {...campo('prazo_entrega')} />
              </div>
              <AreaTexto
                rotulo="Condições de pagamento"
                maxLength={1000}
                placeholder="Ex.: 50% na aprovação e 50% na entrega. Pix, boleto ou cartão em até 3x."
                {...campo('condicoes_pagamento')}
              />
              <AreaTexto
                rotulo="Rodapé"
                maxLength={2000}
                ajuda="Sai no fim de todo orçamento: garantia, observações gerais, dados bancários."
                {...campo('rodape')}
              />
            </Grupo>
          </form>
        )}
      </Modal>

      <DialogoConfirmacao
        aberto={!!remover}
        titulo="Remover empresa?"
        rotuloConfirmar="Remover"
        perigo
        carregando={salvando}
        aoConfirmar={() => void confirmarRemocao()}
        aoCancelar={() => setRemover(null)}
      >
        {remover?.nome_fantasia || remover?.razao_social} (CNPJ {formatarCnpj(remover?.cnpj)}) sai da lista, junto com a logo.
        {remover?.padrao && lista && lista.length > 1 && ' Outra empresa passa a ser a padrão.'}
      </DialogoConfirmacao>
    </section>
  )
}
