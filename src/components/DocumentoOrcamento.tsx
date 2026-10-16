/* eslint-disable react-refresh/only-export-components -- carregado sob demanda (import dinâmico), sem fast refresh */
// PDF do orçamento/pedido (@react-pdf/renderer). Carregado só sob demanda (services/orcamento.ts).
// Fonte Helvetica embutida no leitor de PDF: cobre os acentos do português sem baixar fonte. Por isso o sinal de
// menos é "-" e não "−" (fora da tabela da Helvetica).
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
// Só formato.ts e tipos: o mesmo componente roda no navegador e no serviço livih-pdf (servidor).
import { formatarCnpj, formatarTelefone, moeda as moedaTela, quantidade } from '../services/formato'
import type { DadosOrcamento } from '../services/orcamento'

// Sem hifenização automática: em português ela quebra palavras em lugares errados ("grampea-mento").
Font.registerHyphenationCallback((palavra) => [palavra])

// No documento comercial, sempre com centavos.
const moeda = (v: number) => moedaTela(v, true)

const COR = { texto: '#1f2933', suave: '#616e7c', linha: '#d9dee3', fundo: '#f4f6f8', destaque: '#111827' }

const s = StyleSheet.create({
  // Cabeçalho compacto (logo pequena + nome) é fixo em toda página, com o espaço reservado no paddingTop. Na 1ª,
  // o cabeçalho completo sobe para dentro desse espaço (marginTop negativo) e, com fundo branco, cobre o compacto.
  // Não dá para montar o compacto só da 2ª em diante (render): imagem dentro de render não é carregada.
  pagina: { paddingTop: 80, paddingBottom: 56, paddingHorizontal: 40, fontFamily: 'Helvetica', fontSize: 9, color: COR.texto, lineHeight: 1.35 },
  topo: { marginTop: -44, minHeight: 40, backgroundColor: '#ffffff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  compacto: {
    position: 'absolute',
    top: 36,
    left: 40,
    right: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: COR.linha,
  },
  logoCompacto: { maxWidth: 80, maxHeight: 24, objectFit: 'contain' },
  nomeCompacto: { flexGrow: 1, fontSize: 10, fontFamily: 'Helvetica-Bold', color: COR.destaque },
  logo: { maxWidth: 150, maxHeight: 64, objectFit: 'contain' },
  empresa: { flexGrow: 1, alignItems: 'flex-end', textAlign: 'right' },
  empresaNome: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: COR.destaque, marginBottom: 2 },
  suave: { color: COR.suave },
  faixa: {
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: COR.fundo,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titulo: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: COR.destaque },
  datas: { alignItems: 'flex-end' },
  bloco: { marginTop: 14 },
  rotulo: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COR.suave, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  negrito: { fontFamily: 'Helvetica-Bold' },
  tabela: { marginTop: 14, borderTopWidth: 1, borderTopColor: COR.destaque },
  linhaCab: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: COR.linha },
  linha: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: COR.linha },
  cab: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COR.suave, textTransform: 'uppercase' },
  cCodigo: { width: '14%', paddingRight: 6 },
  cDescricao: { width: '38%', paddingRight: 6 },
  cQtd: { width: '10%', textAlign: 'right' },
  cUn: { width: '8%', textAlign: 'center' },
  cPreco: { width: '15%', textAlign: 'right' },
  cSubtotal: { width: '15%', textAlign: 'right' },
  totais: { marginTop: 10, marginLeft: 'auto', width: 210 },
  totalLinha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: COR.destaque,
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: COR.destaque,
  },
  condicoes: { marginTop: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  condicao: { width: '47%' },
  rodape: { marginTop: 18, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: COR.linha, color: COR.suave },
  // Texto calculado por página (render) só se posiciona certo com `top`: com `bottom`, a referência é a altura
  // do conteúdo inteiro e ele vai parar fora da folha (y negativo).
  pagina_rodape: { position: 'absolute', top: 804, left: 40, fontSize: 7.5, color: COR.suave },
})

const data = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''
const juntar = (partes: (string | null | undefined | false)[], sep = ' · ') => partes.filter(Boolean).join(sep)

function Documento({ d }: { d: DadosOrcamento }) {
  const { pedido, emissora: e, cliente, vendedor } = d
  const orcamento = pedido.status === 'rascunho'
  const titulo = `${orcamento ? 'Orçamento' : 'Pedido'} nº ${pedido.numero}`
  const endereco = e && juntar([juntar([e.logradouro, e.numero], ', '), e.complemento, e.bairro], ' - ')
  const cidade = e && juntar([juntar([e.cidade, e.uf], '/'), e.cep && `CEP ${e.cep.slice(0, 5)}-${e.cep.slice(5)}`], ' - ')
  const desconto = Number(pedido.desconto)
  const frete = Number(pedido.frete)

  return (
    <Document title={titulo} author={e?.nome_fantasia || e?.razao_social || undefined} creator="Livih" producer="Livih">
      <Page size="A4" style={s.pagina}>
        <View style={s.compacto} fixed>
          {d.logo && <Image src={d.logo} style={s.logoCompacto} />}
          <Text style={s.nomeCompacto}>{e?.nome_fantasia || e?.razao_social || ''}</Text>
          <Text style={s.suave}>{titulo}</Text>
        </View>

        <View style={s.topo}>
          {d.logo ? <Image src={d.logo} style={s.logo} /> : <View />}
          {e && (
            <View style={s.empresa}>
              <Text style={s.empresaNome}>{e.nome_fantasia || e.razao_social}</Text>
              {e.nome_fantasia && <Text>{e.razao_social}</Text>}
              <Text>{juntar([`CNPJ ${formatarCnpj(e.cnpj)}`, e.inscricao_estadual && `IE ${e.inscricao_estadual}`])}</Text>
              {!!endereco && <Text style={s.suave}>{endereco}</Text>}
              {!!cidade && <Text style={s.suave}>{cidade}</Text>}
              <Text style={s.suave}>{juntar([formatarTelefone(e.telefone), e.email, e.site])}</Text>
            </View>
          )}
        </View>

        <View style={s.faixa}>
          <Text style={s.titulo}>{titulo}</Text>
          <View style={s.datas}>
            <Text>Emitido em {data(new Date().toISOString())}</Text>
            {orcamento && pedido.validade && <Text style={s.negrito}>Válido até {data(pedido.validade)}</Text>}
          </View>
        </View>

        {cliente && (
          <View style={s.bloco}>
            <Text style={s.rotulo}>Cliente</Text>
            <Text style={s.negrito}>{cliente.nome}</Text>
            {cliente.empresa && <Text>{cliente.empresa}</Text>}
            {(cliente.telefone || cliente.email) && <Text style={s.suave}>{juntar([formatarTelefone(cliente.telefone), cliente.email])}</Text>}
          </View>
        )}

        <View style={s.tabela}>
          <View style={s.linhaCab} fixed>
            <Text style={[s.cab, s.cCodigo]}>Código</Text>
            <Text style={[s.cab, s.cDescricao]}>Descrição</Text>
            <Text style={[s.cab, s.cQtd]}>Qtd.</Text>
            <Text style={[s.cab, s.cUn]}>Un.</Text>
            <Text style={[s.cab, s.cPreco]}>Valor unit.</Text>
            <Text style={[s.cab, s.cSubtotal]}>Subtotal</Text>
          </View>
          {d.itens.map((i) => (
            <View key={i.id} style={s.linha} wrap={false}>
              <Text style={[s.cCodigo, s.suave]}>{i.codigo ?? ''}</Text>
              <Text style={s.cDescricao}>{i.descricao}</Text>
              <Text style={s.cQtd}>{quantidade(Number(i.quantidade))}</Text>
              <Text style={[s.cUn, s.suave]}>{i.unidade ?? ''}</Text>
              <Text style={s.cPreco}>{moeda(Number(i.preco_unitario))}</Text>
              <Text style={[s.cSubtotal, s.negrito]}>{moeda(Number(i.subtotal))}</Text>
            </View>
          ))}
        </View>

        <View style={s.totais} wrap={false}>
          {(desconto > 0 || frete > 0) && (
            <View style={s.totalLinha}>
              <Text style={s.suave}>Subtotal</Text>
              <Text>{moeda(Number(pedido.subtotal))}</Text>
            </View>
          )}
          {desconto > 0 && (
            <View style={s.totalLinha}>
              <Text style={s.suave}>Desconto</Text>
              <Text>- {moeda(desconto)}</Text>
            </View>
          )}
          {frete > 0 && (
            <View style={s.totalLinha}>
              <Text style={s.suave}>Frete</Text>
              <Text>{moeda(frete)}</Text>
            </View>
          )}
          <View style={s.total}>
            <Text>Total</Text>
            <Text>{moeda(Number(pedido.total))}</Text>
          </View>
        </View>

        <View style={s.condicoes}>
          {pedido.condicoes_pagamento && (
            <View style={s.condicao} wrap={false}>
              <Text style={s.rotulo}>Condições de pagamento</Text>
              <Text>{pedido.condicoes_pagamento}</Text>
            </View>
          )}
          {pedido.prazo_entrega && (
            <View style={s.condicao} wrap={false}>
              <Text style={s.rotulo}>Prazo de entrega</Text>
              <Text>{pedido.prazo_entrega}</Text>
            </View>
          )}
          {pedido.observacao && (
            <View style={s.condicao} wrap={false}>
              <Text style={s.rotulo}>Observação</Text>
              <Text>{pedido.observacao}</Text>
            </View>
          )}
          {vendedor && (
            <View style={s.condicao} wrap={false}>
              <Text style={s.rotulo}>Atendimento</Text>
              <Text style={s.negrito}>{vendedor.nome}</Text>
              {(vendedor.telefone || vendedor.email) && <Text style={s.suave}>{juntar([formatarTelefone(vendedor.telefone), vendedor.email])}</Text>}
            </View>
          )}
        </View>

        {e?.rodape && (
          <View style={s.rodape} wrap={false}>
            <Text>{e.rodape}</Text>
          </View>
        )}



        {/* Rodapé em toda página: identifica a folha solta. */}
        <Text style={[s.pagina_rodape, { width: 360 }]} fixed>
          {juntar([e?.nome_fantasia || e?.razao_social, titulo])}
        </Text>
        <Text
          style={[s.pagina_rodape, { left: 435, width: 120, textAlign: 'right' }]}
          fixed
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />
      </Page>
    </Document>
  )
}

export async function gerarPdf(d: DadosOrcamento): Promise<Blob> {
  return pdf(<Documento d={d} />).toBlob()
}
