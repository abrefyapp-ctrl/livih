import { enviarArquivo } from './atendimento'
import { listarEquipeCompleta } from './configuracoes'
import { listarEmissoras, urlLogo, type Emissora } from './empresa'
import { buscarPedido, type ItemPedido, type Pedido } from './erp'
import { nomeArquivoOrcamento, nomeDoContato } from './formato'
import { supabase } from './supabaseClient'

/** Tudo o que o PDF precisa, já resolvido (o componente do PDF não consulta nada). */
export type DadosOrcamento = {
  pedido: Pedido
  itens: (ItemPedido & { codigo: string | null; unidade: string | null })[]
  emissora: Emissora | null
  /** Logo como data URL: o gerador de PDF não precisa buscar nada na rede. */
  logo: string | null
  /** A pessoa (contato do WhatsApp) com quem o pedido foi feito. */
  cliente: { nome: string; empresa: string | null; telefone: string | null; email: string | null } | null
  /**
   * O cadastro do cliente (docs/clientes.md): razão social, documento e endereço. Opcional: o agente monta os
   * mesmos dados no banco (agente_dados_orcamento), e pedido sem cliente sai só com o contato.
   */
  fiscal?: DadosFiscais | null
  vendedor: { nome: string; telefone: string | null; email: string | null } | null
}

export type DadosFiscais = {
  tipo: string
  nome: string
  razao_social: string | null
  documento: string | null
  inscricao_estadual: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  email: string | null
}

const CAMPOS_FISCAIS = 'tipo, nome, razao_social, documento, inscricao_estadual, logradouro, numero, complemento, bairro, cidade, uf, cep, email'

export async function comoDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob()
    return await new Promise((ok, falha) => {
      const leitor = new FileReader()
      leitor.onload = () => ok(String(leitor.result))
      leitor.onerror = falha
      leitor.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function montarOrcamento(orgId: string, pedidoId: string): Promise<DadosOrcamento> {
  const achado = await buscarPedido(pedidoId)
  if (!achado) throw new Error('Pedido não encontrado.')
  const { pedido, itens } = achado

  const idsProdutos = itens.map((i) => i.produto_id).filter((x): x is string => !!x)
  const [emissoras, equipe, contato, produtos, perfil, cliente] = await Promise.all([
    listarEmissoras(orgId),
    listarEquipeCompleta(orgId).catch(() => []),
    pedido.contato_id
      ? supabase.from('contatos').select('nome, nome_whatsapp, telefone, empresa, email').eq('id', pedido.contato_id).maybeSingle()
      : null,
    idsProdutos.length ? supabase.from('produtos').select('id, codigo, unidade').in('id', idsProdutos) : null,
    pedido.responsavel_id ? supabase.from('perfis').select('nome, telefone').eq('user_id', pedido.responsavel_id).maybeSingle() : null,
    pedido.cliente_id ? supabase.from('clientes').select(CAMPOS_FISCAIS).eq('id', pedido.cliente_id).maybeSingle() : null,
  ])

  // Pedido antigo sem emissora sai pela padrão de hoje.
  const emissora = emissoras.find((e) => e.id === pedido.emissora_id) ?? emissoras.find((e) => e.padrao) ?? null
  const logo = emissora?.logo_path ? await comoDataUrl(await urlLogo(emissora.logo_path)) : null

  const porProduto = new Map((produtos?.data ?? []).map((p) => [p.id, p]))
  const c = contato?.data
  const membro = equipe.find((m) => m.user_id === pedido.responsavel_id)

  return {
    pedido,
    itens: itens.map((i) => ({
      ...i,
      codigo: (i.produto_id && porProduto.get(i.produto_id)?.codigo) || null,
      unidade: (i.produto_id && porProduto.get(i.produto_id)?.unidade) || null,
    })),
    emissora,
    logo,
    cliente: c
      ? { nome: nomeDoContato({ nome: c.nome, nome_whatsapp: c.nome_whatsapp, telefone: c.telefone }), empresa: c.empresa, telefone: c.telefone, email: c.email }
      : null,
    fiscal: cliente?.data ?? null,
    vendedor: pedido.responsavel_id
      ? {
          nome: perfil?.data?.nome || membro?.nome || membro?.email || 'Equipe',
          telefone: perfil?.data?.telefone ?? null,
          email: membro?.email ?? null,
        }
      : null,
  }
}

// Em formato.ts (sem Supabase): o serviço livih-pdf usa o mesmo nome.
export { nomeArquivoOrcamento }

/** Gera o PDF. A biblioteca (pesada) só carrega aqui, no primeiro clique. */
export async function gerarPdfOrcamento(d: DadosOrcamento): Promise<Blob> {
  const { gerarPdf } = await import('../components/DocumentoOrcamento')
  return gerarPdf(d)
}

export type ConversaEnvio = { id: string; numero: string; oficial: boolean; janelaFechada: boolean }

/**
 * Conversa do cliente por onde o orçamento sai: a mais recente que a pessoa vê (a RLS já filtra a carteira).
 * Na API oficial, passadas 24 h da última mensagem do cliente, arquivo não sai (só modelo aprovado).
 */
export async function conversaDoCliente(contatoId: string): Promise<ConversaEnvio | null> {
  const { data, error } = await supabase
    .from('conversas')
    .select('id, canal:canais(nome, tipo)')
    .eq('contato_id', contatoId)
    .order('ultima_mensagem_em', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const canal = data.canal as unknown as { nome: string; tipo: string } | null
  const oficial = canal?.tipo === 'meta'
  let janelaFechada = false
  if (oficial) {
    const { data: ultima } = await supabase
      .from('mensagens')
      .select('criado_em')
      .eq('conversa_id', data.id)
      .eq('direcao', 'entrada')
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    janelaFechada = !ultima || Date.now() - new Date(ultima.criado_em).getTime() > 24 * 3600_000
  }
  return { id: data.id, numero: canal?.nome ?? 'WhatsApp', oficial, janelaFechada }
}

/** Gera o PDF e manda na conversa (fica no histórico imutável, como qualquer arquivo enviado). */
export async function enviarOrcamentoWhatsapp(orgId: string, conversaId: string, d: DadosOrcamento) {
  const blob = await gerarPdfOrcamento(d)
  const arquivo = new File([blob], nomeArquivoOrcamento(d), { type: 'application/pdf' })
  const tipo = d.pedido.status === 'rascunho' ? 'Orçamento' : 'Pedido'
  const empresa = d.emissora?.nome_fantasia || d.emissora?.razao_social
  await enviarArquivo(orgId, conversaId, arquivo, `${tipo} nº ${d.pedido.numero}${empresa ? ` – ${empresa}` : ''}`)
}
