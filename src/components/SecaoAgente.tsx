import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSessao } from '../hooks/useSessao'
import { buscarAgente, salvarAgente, type Agente } from '../services/configuracoes'
import { formatarTelefone } from '../services/formato'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { CampoTexto } from './CampoTexto'
import { EstadoVazio } from './EstadoVazio'
import { erroDoHorario, horarioDoBanco, horarioParaBanco, type Horario } from '../services/horario'
import { HorarioAtendimento } from './HorarioAtendimento'
import { Icone } from './Icone'
import { ModalAssistente } from './ModalAssistente'
import { ModalSimulador } from './ModalSimulador'
import { SecaoSaudeAgente } from './SecaoSaudeAgente'

type Formulario = {
  prompt: string
  saudacao: string
  horario: Horario
  foraHorario: string
  casos: string[]
  telefone: string
}

const casosDe = (a: Agente): string[] => {
  const r = a.regras_humano as { casos?: unknown } | null
  return Array.isArray(r?.casos) ? r.casos.filter((c): c is string => typeof c === 'string') : []
}

const paraFormulario = (a: Agente): Formulario => ({
  prompt: a.prompt,
  saudacao: a.saudacao ?? '',
  horario: horarioDoBanco(a.horario),
  foraHorario: a.mensagem_fora_horario ?? '',
  casos: casosDe(a),
  telefone: a.telefone_alerta ? formatarTelefone(a.telefone_alerta) : '',
})

/** (41) 99999-8888 → 5541999998888; vazio → null; inválido → undefined. */
function normalizarTelefone(v: string): string | null | undefined {
  const d = v.replace(/\D/g, '')
  if (!d) return null
  if (d.length === 10 || d.length === 11) return `55${d}`
  if (d.length >= 12 && d.length <= 15) return d
  return undefined
}

export function SecaoAgente() {
  const { orgAtiva } = useSessao()
  const orgId = orgAtiva!.id
  const podeEditar = orgAtiva?.papel === 'dono' || orgAtiva?.papel === 'admin'
  const [agente, setAgente] = useState<{ orgId: string; dado: Agente | null } | null>(null)
  const [form, setForm] = useState<Formulario | null>(null)
  const [novoCaso, setNovoCaso] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [testando, setTestando] = useState(false)
  const [assistente, setAssistente] = useState(false)
  // Sobe quando o assistente aplica ou desfaz: recarrega o agente e a Saúde.
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let ativo = true
    buscarAgente(orgId)
      .then((a) => {
        if (!ativo) return
        setAgente({ orgId, dado: a })
        setForm(a ? paraFormulario(a) : null)
      })
      .catch(() => ativo && setErro('Não foi possível carregar o agente.'))
    return () => {
      ativo = false
    }
  }, [orgId, versao])

  const atual = agente?.orgId === orgId ? agente : null
  if (erro && !atual) return <Aviso tom="erro">{erro}</Aviso>
  if (!atual) return <p className="text-pequeno text-texto-3">Carregando agente…</p>
  if (!atual.dado || !form) {
    return (
      <EstadoVazio icone="agente" titulo="Nenhum agente configurado">
        O agente nasce junto com o canal de WhatsApp. Fale com o suporte da Livih para conectar o número.
      </EstadoVazio>
    )
  }

  const original = paraFormulario(atual.dado)
  const alterado = JSON.stringify(form) !== JSON.stringify(original)
  const telefone = normalizarTelefone(form.telefone)
  const telefoneInvalido = telefone === undefined
  const invalido = telefoneInvalido || !!erroDoHorario(form.horario)

  const mudar = (campos: Partial<Formulario>) => {
    setForm((f) => (f ? { ...f, ...campos } : f))
    setSalvo(false)
  }

  async function salvar() {
    if (!atual?.dado || !form || invalido) return
    setSalvando(true)
    setErro(null)
    try {
      const campos = {
        prompt: form.prompt,
        saudacao: form.saudacao.trim() || null,
        horario: horarioParaBanco(form.horario),
        mensagem_fora_horario: form.foraHorario.trim() || null,
        telefone_alerta: telefone ?? null,
        regras_humano: { ...((atual.dado.regras_humano as object) ?? {}), casos: form.casos },
      }
      await salvarAgente(atual.dado.id, campos)
      setAgente({ orgId, dado: { ...atual.dado, ...campos } })
      setSalvo(true)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  function adicionarCaso() {
    const c = novoCaso.trim()
    if (!c || form?.casos.includes(c)) return
    mudar({ casos: [...(form?.casos ?? []), c] })
    setNovoCaso('')
  }

  return (
    <section aria-labelledby="titulo-agente" className="space-y-6 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-agente" className="text-h2 font-semibold">
            Agente
          </h2>
          <p className="text-pequeno text-texto-3">Como o agente de IA atende o WhatsApp de {orgAtiva?.nome}.</p>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <Botao variante="secundario" icone="agente" onClick={() => setAssistente(true)} disabled={alterado}>
              Assistente
            </Botao>
            <Botao variante="secundario" icone="conversas" onClick={() => setTestando(true)}>
              Testar agente
            </Botao>
          </div>
        )}
      </div>
      {podeEditar && assistente && (
        <ModalAssistente agente={atual.dado} aoFechar={() => setAssistente(false)} aoAplicado={() => setVersao((v) => v + 1)} />
      )}
      {podeEditar && (
        <ModalSimulador
          aberto={testando}
          aoFechar={() => setTestando(false)}
          rascunho={alterado ? { prompt: form.prompt, casos: form.casos } : null}
        />
      )}

      {!podeEditar && <Aviso>Só dono e admin alteram o agente. Você está vendo as configurações atuais.</Aviso>}

      {podeEditar && (
        <SecaoSaudeAgente
          key={versao}
          agente={atual.dado}
          formAlterado={alterado}
          aoAlterarAgente={(campos) => {
            // Conserto do cartão (limpar separadores): o formulário estava igual ao salvo, então acompanha.
            const dado = { ...atual.dado!, ...campos }
            setAgente({ orgId, dado })
            setForm(paraFormulario(dado))
            setSalvo(false)
          }}
        />
      )}

      <fieldset disabled={!podeEditar} className="space-y-6">
        <Aviso>
          Estas instruções valem para todos os números da empresa. Ligar ou desligar o agente em cada número é em{' '}
          <Link to="/configuracoes/whatsapp" className="font-semibold underline">
            WhatsApp
          </Link>
          . Com o agente desligado, as conversas novas vão direto para Aguardando você.
        </Aviso>

        <div className="space-y-1.5">
          <label htmlFor="prompt" className="block text-pequeno font-medium text-texto-2">
            Instruções do agente
          </label>
          <p className="text-legenda text-texto-3">
            Quem ele é, o que a empresa faz, o tom de voz e o que pode ou não prometer. A base de conhecimento entra
            junto automaticamente.
          </p>
          <textarea
            id="prompt"
            value={form.prompt}
            onChange={(e) => mudar({ prompt: e.target.value })}
            rows={16}
            className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 font-mono text-pequeno leading-relaxed focus:border-primaria focus:outline-none"
          />
          <p className="text-right text-legenda text-texto-3">{form.prompt.length.toLocaleString('pt-BR')} caracteres</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="saudacao" className="block text-pequeno font-medium text-texto-2">
            Saudação
          </label>
          <p className="text-legenda text-texto-3">
            Enviada exatamente assim na primeira resposta de cada conversa (ou quando o cliente volta depois de 12 horas
            sem resposta). Em seguida o agente continua: se o cliente já disse o que precisa, ele responde; se foi só um
            “oi”, a saudação basta. Deixe vazio para o agente cumprimentar do jeito dele.
          </p>
          <textarea
            id="saudacao"
            value={form.saudacao}
            onChange={(e) => mudar({ saudacao: e.target.value })}
            rows={2}
            placeholder="Ex.: Olá! Agradecemos seu contato. Como podemos ajudar?"
            className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno placeholder:text-texto-3 focus:border-primaria focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          <p className="text-pequeno font-medium text-texto-2">Horário de atendimento da equipe</p>
          <p className="text-legenda text-texto-3">
            O agente atende a qualquer hora. Fora deste horário, ele avisa que a equipe retorna depois e continua
            ajudando o cliente. Horário de Brasília.
          </p>
          <HorarioAtendimento valor={form.horario} onChange={(horario) => mudar({ horario })} />
        </div>

        {!form.horario.vinteQuatro && (
          <div className="space-y-1.5">
            <label htmlFor="fora-horario" className="block text-pequeno font-medium text-texto-2">
              Aviso fora do horário
            </label>
            <p className="text-legenda text-texto-3">
              Opcional. O agente usa como base para avisar, uma vez na conversa, que a equipe está fora do horário.
            </p>
            <textarea
              id="fora-horario"
              value={form.foraHorario}
              onChange={(e) => mudar({ foraHorario: e.target.value })}
              rows={2}
              placeholder="Ex.: Nossa equipe atende de segunda a sexta, das 8h às 18h. Já deixo tudo anotado para eles."
              className="block w-full rounded-md border border-borda bg-superficie px-3 py-2 text-pequeno placeholder:text-texto-3 focus:border-primaria focus:outline-none"
            />
          </div>
        )}

        <div className="space-y-2">
          <p className="text-pequeno font-medium text-texto-2">Quando chamar a equipe</p>
          <p className="text-legenda text-texto-3">
            Além destes casos, o agente sempre chama a equipe se o cliente pedir para falar com uma pessoa ou se perceber
            que está falando com outro robô.
          </p>
          {form.casos.length > 0 && (
            <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
              {form.casos.map((c) => (
                <li key={c} className="flex items-center gap-3 px-3 py-2 text-pequeno">
                  <span className="flex-1">{c}</span>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => mudar({ casos: form.casos.filter((x) => x !== c) })}
                      aria-label={`Remover: ${c}`}
                      className="rounded-md p-1 text-texto-3 hover:bg-fundo hover:text-erro"
                    >
                      <Icone nome="fechar" className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {podeEditar && (
            <div className="flex gap-2">
              <label htmlFor="novo-caso" className="sr-only">
                Novo caso
              </label>
              <input
                id="novo-caso"
                value={novoCaso}
                onChange={(e) => setNovoCaso(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    adicionarCaso()
                  }
                }}
                placeholder="Ex.: cliente pediu orçamento"
                className="h-10 flex-1 rounded-md border border-borda bg-superficie px-3 placeholder:text-texto-3 focus:border-primaria focus:outline-none"
              />
              <Botao variante="secundario" icone="mais" onClick={adicionarCaso} disabled={!novoCaso.trim()}>
                Adicionar
              </Botao>
            </div>
          )}
        </div>

        <CampoTexto
          rotulo="WhatsApp para alertas"
          inputMode="tel"
          value={form.telefone}
          onChange={(e) => mudar({ telefone: e.target.value })}
          placeholder="(41) 99999-8888"
          ajuda="Recebe uma mensagem sempre que o agente chamar a equipe. Deixe vazio para não avisar."
          erro={telefoneInvalido ? 'Informe DDD + número, por exemplo (41) 99999-8888.' : undefined}
          className="max-w-sm"
        />
      </fieldset>

      {podeEditar && (alterado || salvo || erro) && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-borda bg-superficie px-4 py-3 lg:-mx-8 lg:px-8">
          {erro && <span className="mr-auto text-pequeno text-erro">{erro}</span>}
          {salvo && !alterado && (
            <span className="mr-auto flex items-center gap-1 text-pequeno text-primaria">
              <Icone nome="check" className="size-4" /> Alterações salvas. Valem a partir da próxima mensagem.
            </span>
          )}
          {alterado && (
            <>
              <Botao variante="secundario" onClick={() => (setForm(original), setErro(null))} disabled={salvando}>
                Descartar
              </Botao>
              <Botao onClick={() => void salvar()} carregando={salvando} disabled={invalido}>
                Salvar alterações
              </Botao>
            </>
          )}
        </div>
      )}
    </section>
  )
}
