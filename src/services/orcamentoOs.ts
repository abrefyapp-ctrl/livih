import { enviarArquivo } from './atendimento'
import { listarEquipeCompleta } from './configuracoes'
import { listarEmissoras, urlLogo, type Emissora } from './empresa'
import { nomeDoContato } from './formato'
import { comoDataUrl } from './orcamento'
import type { Cobranca, ConfiguracaoOs, ItemOs, Ordem } from './os'
import { supabase } from './supabaseClient'

// PDF da ordem de serviço (docs/ordens-de-servico.md), no mesmo layout do orçamento do pedido. Gerado no navegador.

/** Tudo o que o PDF precisa, já resolvido (o componente do PDF não consulta nada). */
export type DadosPdfOs = {
  /** Orçamento enquanto nenhum item passou da aprovação do cliente; depois, Ordem de serviço. */
  tipo: 'Orçamento' | 'Ordem de serviço'
  ordem: Pick<Ordem, 'numero' | 'recebida_em' | 'nf_cliente' | 'numero_cliente' | 'observacao'>
  itens: {
    id: string
    titulo: string
    detalhes: string[]
    servico: string | null
    valor: number
    cobranca: Cobranca
    observacao: string | null
  }[]
  emissora: Emissora | null
  logo: string | null
  cliente: { nome: string; empresa: string | null; telefone: string | null; email: string | null } | null
  responsavel: { nome: string; telefone: string | null; email: string | null } | null
  prazoPagamento: number
}

export async function montarPdfOs(
  orgId: string,
  ordem: Ordem,
  itens: ItemOs[],
  cfg: ConfiguracaoOs,
  prazoPagamento: number,
): Promise<DadosPdfOs> {
  const [emissoras, equipe, contato, perfil] = await Promise.all([
    listarEmissoras(orgId),
    listarEquipeCompleta(orgId).catch(() => []),
    ordem.contato_id ? supabase.from('contatos').select('nome, nome_whatsapp, telefone, empresa, email').eq('id', ordem.contato_id).maybeSingle() : null,
    ordem.responsavel_id ? supabase.from('perfis').select('nome, telefone').eq('user_id', ordem.responsavel_id).maybeSingle() : null,
  ])
  const emissora = emissoras.find((e) => e.padrao) ?? emissoras[0] ?? null
  const logo = emissora?.logo_path ? await comoDataUrl(await urlLogo(emissora.logo_path)) : null
  const c = contato?.data
  const membro = equipe.find((m) => m.user_id === ordem.responsavel_id)

  const tipos = new Map(cfg.tipos.map((t) => [t.id, t]))
  const servicos = new Map(cfg.servicos.map((x) => [x.id, x]))
  const aprovacao = cfg.etapas.find((e) => e.marco === 'aprovacao')
  const ordemEtapa = new Map(cfg.etapas.map((e) => [e.id, e.ordem]))
  const emOrcamento = !!aprovacao && itens.every((i) => (ordemEtapa.get(i.etapa_id) ?? Infinity) <= aprovacao.ordem)

  return {
    tipo: emOrcamento ? 'Orçamento' : 'Ordem de serviço',
    ordem,
    itens: itens.map((i) => {
      const tipo = i.tipo_id ? tipos.get(i.tipo_id) : undefined
      return {
        id: i.id,
        titulo: [tipo?.nome, i.modelo].filter(Boolean).join(' ') || 'Item',
        detalhes: [
          i.identificacao ? `${tipo?.rotulo_identificacao ?? 'Nº de série'}: ${i.identificacao}` : '',
          ...(tipo?.campos ?? [])
            .filter((campo) => i.campos[campo.chave])
            .map((campo) => {
              const v = i.campos[campo.chave]
              return `${campo.rotulo}: ${campo.tipo === 'data' ? v.split('-').reverse().join('/') : v}`
            }),
        ].filter(Boolean),
        servico: (i.servico_id && servicos.get(i.servico_id)?.nome) || null,
        valor: i.valor,
        cobranca: i.cobranca,
        observacao: i.observacao,
      }
    }),
    emissora,
    logo,
    cliente: c
      ? { nome: nomeDoContato({ nome: c.nome, nome_whatsapp: c.nome_whatsapp, telefone: c.telefone }), empresa: c.empresa, telefone: c.telefone, email: c.email }
      : ordem.cliente_nome
        ? { nome: ordem.cliente_nome, empresa: null, telefone: null, email: null }
        : null,
    responsavel: ordem.responsavel_id
      ? { nome: perfil?.data?.nome || membro?.nome || membro?.email || 'Equipe', telefone: perfil?.data?.telefone ?? null, email: membro?.email ?? null }
      : null,
    prazoPagamento,
  }
}

/** "Orcamento-OS-12-Industria-Exemplo.pdf" (sem acento nem espaço: abre bem em qualquer celular). */
export function nomeArquivoOs(d: Pick<DadosPdfOs, 'tipo' | 'ordem' | 'cliente'>): string {
  const limpo = (t: string) =>
    t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')
  const cliente = limpo(d.cliente?.nome ?? '').slice(0, 40)
  return `${limpo(d.tipo)}-OS-${d.ordem.numero}${cliente ? `-${cliente}` : ''}.pdf`
}

/** Gera o PDF. A biblioteca (pesada) só carrega aqui, no primeiro clique. */
export async function gerarPdfOs(d: DadosPdfOs): Promise<Blob> {
  const { gerarPdfOrdem } = await import('../components/DocumentoOs')
  return gerarPdfOrdem(d)
}

/** Manda o PDF já gerado na conversa do cliente (fica no histórico, como qualquer arquivo enviado). */
export async function enviarPdfOsWhatsapp(orgId: string, conversaId: string, d: DadosPdfOs, pdf: Blob) {
  const empresa = d.emissora?.nome_fantasia || d.emissora?.razao_social
  const arquivo = new File([pdf], nomeArquivoOs(d), { type: 'application/pdf' })
  await enviarArquivo(orgId, conversaId, arquivo, `${d.tipo} da OS nº ${d.ordem.numero}${empresa ? ` – ${empresa}` : ''}`)
}
