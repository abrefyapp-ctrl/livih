import { listarEquipeCompleta } from './configuracoes'
import { listarEmissoras, urlLogo, type Emissora } from './empresa'
import { buscarPedido, type ItemPedido, type Pedido } from './erp'
import { nomeDoContato } from './formato'
import { supabase } from './supabaseClient'

/** Tudo o que o PDF precisa, já resolvido (o componente do PDF não consulta nada). */
export type DadosOrcamento = {
  pedido: Pedido
  itens: (ItemPedido & { codigo: string | null; unidade: string | null })[]
  emissora: Emissora | null
  /** Logo como data URL: o gerador de PDF não precisa buscar nada na rede. */
  logo: string | null
  cliente: { nome: string; empresa: string | null; telefone: string | null; email: string | null } | null
  vendedor: { nome: string; telefone: string | null; email: string | null } | null
}

async function comoDataUrl(url: string): Promise<string | null> {
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
  const [emissoras, equipe, contato, produtos, perfil] = await Promise.all([
    listarEmissoras(orgId),
    listarEquipeCompleta(orgId).catch(() => []),
    pedido.contato_id
      ? supabase.from('contatos').select('nome, nome_whatsapp, telefone, empresa, email').eq('id', pedido.contato_id).maybeSingle()
      : null,
    idsProdutos.length ? supabase.from('produtos').select('id, codigo, unidade').in('id', idsProdutos) : null,
    pedido.responsavel_id ? supabase.from('perfis').select('nome, telefone').eq('user_id', pedido.responsavel_id).maybeSingle() : null,
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
    vendedor: pedido.responsavel_id
      ? {
          nome: perfil?.data?.nome || membro?.nome || membro?.email || 'Equipe',
          telefone: perfil?.data?.telefone ?? null,
          email: membro?.email ?? null,
        }
      : null,
  }
}

/** "Orcamento-12-Maria-Silva.pdf" (sem acento nem espaço: abre bem em qualquer celular). */
export function nomeArquivoOrcamento(d: DadosOrcamento): string {
  const tipo = d.pedido.status === 'rascunho' ? 'Orcamento' : 'Pedido'
  const cliente = (d.cliente?.nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${tipo}-${d.pedido.numero}${cliente ? `-${cliente}` : ''}.pdf`
}

/** Gera o PDF. A biblioteca (pesada) só carrega aqui, no primeiro clique. */
export async function gerarPdfOrcamento(d: DadosOrcamento): Promise<Blob> {
  const { gerarPdf } = await import('../components/DocumentoOrcamento')
  return gerarPdf(d)
}
