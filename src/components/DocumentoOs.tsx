/* eslint-disable react-refresh/only-export-components -- carregado sob demanda (import dinâmico), sem fast refresh */
// PDF da ordem de serviço (@react-pdf/renderer), no mesmo layout do orçamento do pedido: cabeçalho, rodapé e estilos
// vêm de DocumentoOrcamento. Carregado só sob demanda (services/orcamentoOs.ts).
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { formatarTelefone, moeda as moedaTela } from '../services/formato'
import type { DadosPdfOs } from '../services/orcamentoOs'
import { Cabecalho, ClientePdf, data, juntar, Rodape, s } from './DocumentoOrcamento'

const moeda = (v: number) => moedaTela(v, true)
const COBRANCA = { cobrado: '', garantia: 'Garantia', cortesia: 'Cortesia' } as const

const os = StyleSheet.create({
  cN: { width: '6%', paddingRight: 6 },
  cItem: { width: '54%', paddingRight: 6 },
  cServico: { width: '24%', paddingRight: 6 },
  cValor: { width: '16%', textAlign: 'right' },
  detalhe: { color: '#616e7c', fontSize: 8 },
  dados: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  dado: { width: '17%' },
})

function Documento({ d }: { d: DadosPdfOs }) {
  const e = d.emissora
  const titulo = `${d.tipo} · OS nº ${d.ordem.numero}`
  const total = d.itens.reduce((t, i) => t + (i.cobranca === 'cobrado' ? i.valor : 0), 0)
  const r = d.responsavel

  return (
    <Document title={titulo} author={e?.nome_fantasia || e?.razao_social || undefined} creator="Livih" producer="Livih">
      <Page size="A4" style={s.pagina}>
        <Cabecalho d={d} titulo={titulo} />

        <View style={s.faixa}>
          <Text style={s.titulo}>{titulo}</Text>
          <View style={s.datas}>
            <Text>Emitido em {data(new Date().toISOString())}</Text>
          </View>
        </View>

        <View style={os.dados}>
          {(d.cliente || d.fiscal) && (
            <View style={{ width: '36%' }}>
              <ClientePdf cliente={d.cliente} fiscal={d.fiscal} />
            </View>
          )}
          <View style={os.dado}>
            <Text style={s.rotulo}>Recebido em</Text>
            <Text>{data(d.ordem.recebida_em)}</Text>
          </View>
          {d.ordem.nf_cliente && (
            <View style={os.dado}>
              <Text style={s.rotulo}>NF do cliente</Text>
              <Text>{d.ordem.nf_cliente}</Text>
            </View>
          )}
          {d.ordem.numero_cliente && (
            <View style={os.dado}>
              <Text style={s.rotulo}>Sua OS / pedido</Text>
              <Text>{d.ordem.numero_cliente}</Text>
            </View>
          )}
        </View>

        <View style={s.tabela}>
          <View style={s.linhaCab} fixed>
            <Text style={[s.cab, os.cN]}>#</Text>
            <Text style={[s.cab, os.cItem]}>Equipamento</Text>
            <Text style={[s.cab, os.cServico]}>Serviço</Text>
            <Text style={[s.cab, os.cValor]}>Valor</Text>
          </View>
          {d.itens.map((i, n) => (
            <View key={i.id} style={s.linha} wrap={false}>
              <Text style={[os.cN, s.suave]}>{n + 1}</Text>
              <View style={os.cItem}>
                <Text style={s.negrito}>{i.titulo}</Text>
                {i.detalhes.length > 0 && <Text style={os.detalhe}>{i.detalhes.join(' · ')}</Text>}
                {i.observacao && <Text style={os.detalhe}>{i.observacao}</Text>}
              </View>
              <Text style={os.cServico}>{i.servico ?? ''}</Text>
              <Text style={[os.cValor, s.negrito]}>{i.cobranca === 'cobrado' ? moeda(i.valor) : COBRANCA[i.cobranca]}</Text>
            </View>
          ))}
        </View>

        <View style={s.totais} wrap={false}>
          <View style={s.total}>
            <Text>Total</Text>
            <Text>{moeda(total)}</Text>
          </View>
        </View>

        <View style={s.condicoes}>
          <View style={s.condicao} wrap={false}>
            <Text style={s.rotulo}>Condições de pagamento</Text>
            <Text>{d.prazoPagamento ? `${d.prazoPagamento} dias após o faturamento` : 'À vista, no faturamento'}</Text>
          </View>
          {d.ordem.observacao && (
            <View style={s.condicao} wrap={false}>
              <Text style={s.rotulo}>Observação</Text>
              <Text>{d.ordem.observacao}</Text>
            </View>
          )}
          {r && (
            <View style={s.condicao} wrap={false}>
              <Text style={s.rotulo}>Atendimento</Text>
              <Text style={s.negrito}>{r.nome}</Text>
              {(r.telefone || r.email) && <Text style={s.suave}>{juntar([formatarTelefone(r.telefone), r.email])}</Text>}
            </View>
          )}
        </View>

        <Rodape d={d} titulo={titulo} />
      </Page>
    </Document>
  )
}

export async function gerarPdfOrdem(d: DadosPdfOs): Promise<Blob> {
  return pdf(<Documento d={d} />).toBlob()
}
