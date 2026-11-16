import { useMemo, useState } from 'react'
import {
  convidarMembro,
  definirRecebeContatos,
  mensagemDoLink,
  listarEquipeCompleta,
  type MembroEquipe,
} from '../services/configuracoes'
import { definirEquipeDaPessoa, definirTelefoneDaPessoa, salvarEquipe, type Equipe } from '../services/equipes'
import { Aviso } from './Aviso'
import { Botao } from './Botao'
import { Icone } from './Icone'
import { Modal } from './Modal'

// Convite de várias pessoas de uma vez, colando as linhas da planilha (16/11, implantação da CEFEQ: 25 vendedores e
// 6 gestores; um convite por vez levava a tarde). A Livih não manda e-mail: cada linha sai com o link pronto para
// mandar pelo WhatsApp da pessoa. Equipe que não existe é criada; quem já está na equipe só muda de equipe.

type Papel = 'atendente' | 'admin'
type Linha = {
  n: number
  nome: string
  email: string
  telefone: string | null
  telefoneInvalido: boolean
  equipe: string
  gestor: boolean
  papel: Papel
  erro: string | null
  jaAtivo: boolean
}
type Resultado = { linha: Linha; link: string | null; nota: string; erro: boolean }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
const SIM = new Set(['sim', 's', 'x', 'yes', '1', 'gestor', 'gestora', 'gerente', 'verdadeiro'])

/** Celular brasileiro para o wa.me: só dígitos, com o 55. Nulo quando não dá para saber o número. */
function telefoneWhatsapp(bruto: string): string | null {
  let d = bruto.replace(/\D/g, '').replace(/^0+/, '')
  if (d.length === 10 || d.length === 11) d = '55' + d
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d : null
}

/** Colunas pelo cabeçalho (se a primeira linha tiver "e-mail"); senão, na ordem Nome, E-mail, Telefone, Equipe, Gestor. */
function lerPlanilha(texto: string, membros: MembroEquipe[]): Linha[] {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim())
  if (!linhas.length) return []
  const sep = texto.includes('\t') ? '\t' : texto.includes(';') ? ';' : ','
  const celulas = linhas.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')))
  const cab = celulas[0].map(semAcento)
  const temCabecalho = cab.some((c) => c.includes('mail'))
  const col = (testes: string[], padrao: number) => {
    if (!temCabecalho) return padrao
    return cab.findIndex((c) => testes.some((t) => c.includes(t)))
  }
  const iEmail = col(['mail'], 1)
  const iNome = col(['nome'], 0)
  const iTel = col(['telefone', 'celular', 'whatsapp', 'fone'], 2)
  const iEquipe = col(['equipe', 'loja', 'setor', 'canal'], 3)
  const iGestor = col(['gestor', 'gerente'], 4)
  const iPapel = col(['papel', 'acesso'], -1)
  const pega = (c: string[], i: number) => (i >= 0 ? (c[i] ?? '').trim() : '')

  const ativos = new Set(membros.filter((m) => m.ativo && m.senha_definida).map((m) => m.email.toLowerCase()))
  const vistos = new Set<string>()
  return celulas.slice(temCabecalho ? 1 : 0).map((c, i) => {
    const email = pega(c, iEmail).toLowerCase()
    const telBruto = pega(c, iTel)
    const telefone = telBruto ? telefoneWhatsapp(telBruto) : null
    let erro: string | null = null
    if (!EMAIL.test(email)) erro = email ? 'E-mail inválido' : 'Sem e-mail'
    else if (vistos.has(email)) erro = 'E-mail repetido na lista'
    vistos.add(email)
    return {
      n: i + 1,
      nome: pega(c, iNome),
      email,
      telefone,
      telefoneInvalido: !!telBruto && !telefone,
      equipe: pega(c, iEquipe),
      // Gestor só vale para atendente, como na janela Editar (admin já vê a empresa toda; revisão de 16/11).
      gestor: SIM.has(semAcento(pega(c, iGestor))) && !semAcento(pega(c, iPapel)).startsWith('admin'),
      papel: semAcento(pega(c, iPapel)).startsWith('admin') ? 'admin' : 'atendente',
      erro,
      jaAtivo: ativos.has(email),
    }
  })
}

export function ConviteEmLote({
  aberto,
  orgId,
  nomeOrg,
  membros,
  equipes,
  aoFechar,
  aoConvidar,
}: {
  aberto: boolean
  orgId: string
  nomeOrg: string
  membros: MembroEquipe[]
  equipes: Equipe[]
  aoFechar: () => void
  aoConvidar: () => void
}) {
  const [texto, setTexto] = useState('')
  const [recebe, setRecebe] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [resultados, setResultados] = useState<Resultado[] | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  const linhas = useMemo(() => lerPlanilha(texto, membros), [texto, membros])
  const validas = linhas.filter((l) => !l.erro)
  const equipePorNome = useMemo(() => new Map(equipes.map((e) => [semAcento(e.nome), e])), [equipes])
  const equipesNovas = [...new Set(validas.map((l) => l.equipe).filter((e) => e && !equipePorNome.has(semAcento(e))))]
  const gestorSemEquipe = validas.filter((l) => l.gestor && !l.equipe).length

  function fechar() {
    if (progresso) return
    setTexto('')
    setRecebe(false)
    setErro(null)
    setResultados(null)
    setCopiado(null)
    aoFechar()
  }

  async function convidar() {
    setErro(null)
    const saida: Resultado[] = []
    try {
      // 1. Equipes que ainda não existem (pelo nome, sem acento e sem maiúsculas).
      const idEquipe = new Map([...equipePorNome].map(([k, e]) => [k, e.id]))
      for (const nome of equipesNovas) {
        setProgresso(`Criando a equipe ${nome}…`)
        idEquipe.set(semAcento(nome), await salvarEquipe(orgId, null, nome))
      }
      // 2. Convites, um por vez (cada um cria a conta e devolve o link).
      for (const [i, l] of validas.entries()) {
        setProgresso(`Convidando ${i + 1} de ${validas.length}…`)
        if (l.jaAtivo) {
          saida.push({ linha: l, link: null, nota: 'Já estava na equipe', erro: false })
          continue
        }
        try {
          const r = await convidarMembro(orgId, { email: l.email, nome: l.nome, papel: l.papel })
          saida.push({
            linha: l,
            link: r.link,
            nota: r.link ? 'Convite criado' : (r.aviso ?? 'Já tinha conta na Livih: entra com a senha dela'),
            erro: false,
          })
        } catch (e) {
          saida.push({ linha: l, link: null, nota: (e as Error).message, erro: true })
        }
      }
      // 3. Equipe, gestor, "Recebe contatos novos" e telefone, com o id de cada pessoa já na empresa.
      setProgresso('Colocando cada pessoa na equipe…')
      const idPorEmail = new Map((await listarEquipeCompleta(orgId)).map((m) => [m.email.toLowerCase(), m.user_id]))
      for (const r of saida) {
        const id = idPorEmail.get(r.linha.email)
        if (!id || r.erro) continue
        const extras: string[] = []
        try {
          if (r.linha.equipe) {
            await definirEquipeDaPessoa(orgId, id, idEquipe.get(semAcento(r.linha.equipe)) ?? null, r.linha.gestor)
            extras.push(r.linha.gestor ? `gestor da ${r.linha.equipe}` : r.linha.equipe)
          }
          if (recebe && !r.linha.gestor) {
            await definirRecebeContatos(orgId, id, true)
            extras.push('recebe contatos novos')
          }
        } catch (e) {
          r.erro = true
          extras.push(`não entrou na equipe: ${(e as Error).message}`)
        }
        // Telefone para os alertas (16/11): só em quem ainda não tem; o que a pessoa preencheu fica.
        if (r.linha.telefone) {
          try {
            if (await definirTelefoneDaPessoa(orgId, id, r.linha.telefone)) extras.push('telefone salvo para os alertas')
          } catch {
            extras.push('telefone não salvo: a pessoa cadastra em Seus dados')
          }
        }
        if (extras.length) r.nota += ` · ${extras.join(', ')}`
      }
    } catch (e) {
      setErro(`${(e as Error).message} O que já foi feito aparece abaixo; confira a lista da equipe antes de tentar de novo.`)
    } finally {
      setProgresso(null)
      setResultados(saida)
      aoConvidar()
    }
  }

  async function copiar(chave: string, conteudo: string) {
    try {
      await navigator.clipboard.writeText(conteudo)
      setCopiado(chave)
    } catch {
      setCopiado(null)
    }
  }

  if (resultados) {
    const comLink = resultados.filter((r) => r.link)
    const tabela = comLink.map((r) => [r.linha.nome || r.linha.email, r.linha.telefone ?? '', r.link].join('\t')).join('\n')
    return (
      <Modal aberto={aberto} titulo="Convites criados" largura="max-w-4xl" aoFechar={fechar} rodape={<Botao onClick={fechar}>Concluir</Botao>}>
        <div className="space-y-3">
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <p className="text-pequeno text-texto-2">
            Mande o link para cada pessoa. <strong>Cada link vale por 24 horas</strong>; depois, gere outro na lista da equipe
            (Editar → Novo link).
          </p>
          {comLink.length > 1 && (
            <Botao variante="secundario" tamanho="sm" icone={copiado === 'tudo' ? 'check' : 'copiar'} onClick={() => void copiar('tudo', tabela)}>
              {copiado === 'tudo' ? 'Copiado: cole na planilha' : 'Copiar nome, telefone e link de todos'}
            </Botao>
          )}
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {resultados.map((r) => (
              <li key={r.linha.n} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.linha.nome || r.linha.email}</p>
                  <p className={`text-legenda ${r.erro ? 'text-erro' : 'text-texto-3'}`}>{r.nota}</p>
                </div>
                {r.link && (
                  <div className="flex gap-2">
                    <Botao
                      variante="secundario"
                      tamanho="sm"
                      icone={copiado === r.linha.email ? 'check' : 'copiar'}
                      onClick={() => void copiar(r.linha.email, r.link!)}
                    >
                      {copiado === r.linha.email ? 'Copiado' : 'Copiar link'}
                    </Botao>
                    <a
                      href={`https://wa.me/${r.linha.telefone ?? ''}?text=${encodeURIComponent(
                        mensagemDoLink(r.link, r.linha.nome || r.linha.email, nomeOrg),
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primaria px-3 text-pequeno font-medium text-white hover:bg-primaria-hover"
                    >
                      <Icone nome="enviar" className="size-4" />
                      {r.linha.telefone ? 'WhatsApp' : 'WhatsApp (escolher contato)'}
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    )
  }

  const aConvidar = validas.filter((l) => !l.jaAtivo).length
  return (
    <Modal
      aberto={aberto}
      titulo="Convidar várias pessoas"
      largura="max-w-4xl"
      aoFechar={fechar}
      rodape={
        <>
          <Botao variante="secundario" onClick={fechar} disabled={!!progresso}>
            Cancelar
          </Botao>
          <Botao onClick={() => void convidar()} carregando={!!progresso} disabled={!validas.length}>
            {progresso ?? (aConvidar ? `Convidar ${aConvidar} ${aConvidar === 1 ? 'pessoa' : 'pessoas'}` : 'Atualizar as equipes')}
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="planilha-convite" className="text-pequeno font-medium text-texto-2">
            Cole as linhas da planilha
          </label>
          <p className="text-legenda text-texto-3">
            Selecione as colunas no Excel ou no Google Planilhas, copie e cole aqui. Com a linha de títulos, a ordem das colunas
            não importa (Nome, E-mail, Telefone, Equipe, Gestor e Papel). Sem ela, use a ordem: Nome, E-mail, Telefone, Equipe,
            Gestor (sim ou não).
          </p>
          <textarea
            id="planilha-convite"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              setResultados(null)
            }}
            rows={6}
            spellCheck={false}
            placeholder={'Nome\tE-mail\tTelefone\tEquipe\tGestor\nAna Souza\tana@empresa.com.br\t(42) 99999-1234\tTelevendas\tnão'}
            disabled={!!progresso}
            className="block w-full rounded-md border border-borda bg-superficie p-3 font-mono text-legenda focus:border-primaria focus:outline-none"
          />
        </div>

        {linhas.length > 0 && (
          <>
            <div className="max-h-72 overflow-auto rounded-lg border border-borda">
              <table className="w-full text-left text-pequeno">
                <thead className="sticky top-0 bg-fundo text-legenda text-texto-3">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Nome</th>
                    <th className="px-3 py-1.5 font-medium">E-mail</th>
                    <th className="px-3 py-1.5 font-medium">Telefone</th>
                    <th className="px-3 py-1.5 font-medium">Equipe</th>
                    <th className="px-3 py-1.5 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {linhas.map((l) => (
                    <tr key={l.n} className={l.erro ? 'bg-erro-suave' : ''}>
                      <td className="px-3 py-1.5">{l.nome || <span className="text-texto-3">sem nome</span>}</td>
                      <td className="px-3 py-1.5">{l.email}</td>
                      <td className="px-3 py-1.5">
                        {l.telefoneInvalido ? <span className="text-atencao">não reconhecido</span> : l.telefone ? `+${l.telefone}` : '—'}
                      </td>
                      <td className="px-3 py-1.5">
                        {l.equipe || '—'}
                        {l.gestor && l.equipe && <span className="text-texto-3"> · gestor</span>}
                        {l.papel === 'admin' && <span className="text-texto-3"> · admin</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        {l.erro ? (
                          <span className="text-erro">{l.erro}</span>
                        ) : l.jaAtivo ? (
                          <span className="text-texto-3">Já está na equipe</span>
                        ) : (
                          'Convidar'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-1 text-pequeno text-texto-2">
              {linhas.length - validas.length > 0 && (
                <li className="text-erro">
                  {linhas.length - validas.length} {linhas.length - validas.length === 1 ? 'linha fica' : 'linhas ficam'} de fora
                  (em vermelho). Corrija na planilha e cole de novo, se quiser.
                </li>
              )}
              {equipesNovas.length > 0 && <li>Equipes que serão criadas: {equipesNovas.join(', ')}.</li>}
              {gestorSemEquipe > 0 && (
                <li className="text-atencao">
                  {gestorSemEquipe} marcado(s) como gestor sem equipe: só vira gestor quem tem a equipe na linha.
                </li>
              )}
              {linhas.some((l) => l.telefoneInvalido) && (
                <li className="text-atencao">Telefone não reconhecido: o link sai assim mesmo, e você escolhe o contato no WhatsApp.</li>
              )}
            </ul>
          </>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-borda p-3">
          <input type="checkbox" checked={recebe} onChange={(e) => setRecebe(e.target.checked)} className="mt-1 accent-primaria" />
          <span>
            <span className="block font-medium">Marcar "Recebe contatos novos" em quem não é gestor</span>
            <span className="text-pequeno text-texto-3">
              Para os vendedores que atendem os clientes que escrevem nos números da empresa que distribuem. Dá para mudar
              pessoa por pessoa depois.
            </span>
          </span>
        </label>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Modal>
  )
}
