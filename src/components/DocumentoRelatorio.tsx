/* eslint-disable react-refresh/only-export-components -- carregado sob demanda (import dinâmico), sem fast refresh */
// PDF do Relatório de resultados (antes "do piloto"; @react-pdf/renderer, mesmo jeito do orçamento): primeira semana contra a última.
// Helvetica embutida: sem "−" (fora da tabela), usa "-".
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { duracao, horasEconomizadas, porcentagem, type Periodo, type Relatorio } from '../services/painel'

Font.registerHyphenationCallback((palavra) => [palavra])

const COR = { texto: '#1f2933', suave: '#616e7c', linha: '#d9dee3', fundo: '#f4f6f8', bom: '#0f766e', ruim: '#b42318' }

const s = StyleSheet.create({
  pagina: { padding: 40, fontFamily: 'Helvetica', fontSize: 9.5, color: COR.texto, lineHeight: 1.35 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  logo: { maxWidth: 140, maxHeight: 56, objectFit: 'contain' },
  titulo: { fontSize: 18, fontFamily: 'Helvetica-Bold', lineHeight: 1.2, marginBottom: 4 },
  sub: { color: COR.suave, marginTop: 2 },
  lead: { fontSize: 11, marginBottom: 14 },
  tabela: { borderTopWidth: 1, borderColor: COR.linha },
  linha: { flexDirection: 'row', borderBottomWidth: 1, borderColor: COR.linha, paddingVertical: 4 },
  cab: { flexDirection: 'row', backgroundColor: COR.fundo, paddingVertical: 4, fontFamily: 'Helvetica-Bold', color: COR.suave, fontSize: 8.5 },
  cInd: { width: '46%', paddingHorizontal: 6 },
  cNum: { width: '18%', paddingHorizontal: 6, textAlign: 'right' },
  grupo: { marginTop: 10, marginBottom: 2, fontFamily: 'Helvetica-Bold', fontSize: 10 },
  caixa: { marginTop: 14, padding: 10, backgroundColor: COR.fundo, borderRadius: 4 },
  totais: { flexDirection: 'row', gap: 18, marginTop: 6 },
  totalValor: { fontSize: 14, fontFamily: 'Helvetica-Bold', lineHeight: 1.2, marginBottom: 2 },
  pequeno: { fontSize: 8, color: COR.suave },
  rodape: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 7.5, color: COR.suave, flexDirection: 'row', justifyContent: 'space-between' },
})

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
const pct = (v: number | null | undefined) => (v == null ? '-' : `${v}%`)
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

type Linha = { rotulo: string; a: string; b: string; delta?: { texto: string; bom: boolean | null } }

/** Variação da primeira para a última semana, dizendo se melhorou. */
function delta(a: number | null | undefined, b: number | null | undefined, melhor: 'maior' | 'menor', unidade: 'pct' | 'pp' = 'pct') {
  if (a == null || b == null) return undefined
  if (unidade === 'pp') {
    const d = Math.round(b - a)
    return d === 0 ? { texto: 'igual', bom: null } : { texto: `${d > 0 ? '+' : ''}${d} p.p.`, bom: melhor === 'maior' ? d > 0 : d < 0 }
  }
  if (a === 0) return undefined
  const d = Math.round(((b - a) / a) * 100)
  return d === 0 ? { texto: 'igual', bom: null } : { texto: `${d > 0 ? '+' : ''}${d}%`, bom: melhor === 'maior' ? d > 0 : d < 0 }
}

function linhas(p: Periodo, u: Periodo | null, minutos: number): { grupo: string; itens: Linha[] }[] {
  const v = (f: (x: Periodo) => string) => (u ? f(u) : '-')
  const acompanhados = (x: Periodo) => porcentagem(x.leads.com_oportunidade, x.leads.novos)
  const resolvidas = (x: Periodo) => porcentagem(x.agente.conversas - x.agente.passadas, x.agente.conversas)
  return [
    {
      grupo: 'Tempo de resposta',
      itens: [
        { rotulo: 'Pedidos de clientes', a: String(p.resposta.pedidos), b: v((x) => String(x.resposta.pedidos)) },
        {
          rotulo: 'Tempo até a primeira resposta (mediana)',
          a: duracao(p.resposta.geral.mediana_seg),
          b: v((x) => duracao(x.resposta.geral.mediana_seg)),
          delta: delta(p.resposta.geral.mediana_seg, u?.resposta.geral.mediana_seg, 'menor'),
        },
        {
          rotulo: 'Respondidos em até 5 minutos',
          a: pct(p.resposta.geral.pct_5min),
          b: v((x) => pct(x.resposta.geral.pct_5min)),
          delta: delta(p.resposta.geral.pct_5min, u?.resposta.geral.pct_5min, 'maior', 'pp'),
        },
        { rotulo: 'Resposta do agente (mediana)', a: duracao(p.resposta.agente.mediana_seg), b: v((x) => duracao(x.resposta.agente.mediana_seg)) },
        { rotulo: 'Resposta da equipe (mediana)', a: duracao(p.resposta.equipe.mediana_seg), b: v((x) => duracao(x.resposta.equipe.mediana_seg)) },
        { rotulo: 'Clientes que ficaram sem resposta', a: String(p.resposta.sem_resposta), b: v((x) => String(x.resposta.sem_resposta)) },
      ],
    },
    {
      grupo: 'Acompanhamento dos leads',
      itens: [
        { rotulo: 'Leads novos', a: String(p.leads.novos), b: v((x) => String(x.leads.novos)) },
        {
          rotulo: 'Leads que viraram oportunidade',
          a: pct(acompanhados(p)),
          b: v((x) => pct(acompanhados(x))),
          delta: delta(acompanhados(p), u ? acompanhados(u) : null, 'maior', 'pp'),
        },
      ],
    },
    {
      grupo: 'Negociações',
      itens: [
        { rotulo: 'Oportunidades criadas', a: String(p.funil.criadas), b: v((x) => String(x.funil.criadas)) },
        { rotulo: 'Avanços de etapa no funil', a: String(p.funil.mudancas), b: v((x) => String(x.funil.mudancas)) },
        { rotulo: 'Oportunidades ganhas', a: String(p.funil.ganhas), b: v((x) => String(x.funil.ganhas)) },
      ],
    },
    {
      grupo: 'Agente de IA',
      itens: [
        { rotulo: 'Conversas atendidas pelo agente', a: String(p.agente.conversas), b: v((x) => String(x.agente.conversas)) },
        { rotulo: 'Resolvidas sem passar para a equipe', a: pct(resolvidas(p)), b: v((x) => pct(resolvidas(x))) },
        {
          rotulo: `Horas economizadas (estimativa: ${num(minutos)} min por resposta)`,
          a: `${num(horasEconomizadas(p.agente.respostas, minutos))} h`,
          b: v((x) => `${num(horasEconomizadas(x.agente.respostas, minutos))} h`),
        },
      ],
    },
  ]
}

function Documento({ r, logo }: { r: Relatorio; logo: string | null }) {
  const minutos = r.config?.minutos_por_resposta ?? 2
  const u = r.ultima_semana
  const antes = r.config?.antes_tempo_resposta_min
  const lead = u
    ? `Na última semana, o tempo até a primeira resposta foi ${duracao(u.resposta.geral.mediana_seg)}, contra ${duracao(r.primeira_semana.resposta.geral.mediana_seg)} na primeira semana de uso.`
    : `São ${r.dias} dias de uso: ainda não há uma última semana separada da primeira para comparar.`
  return (
    <Document title={`Resultados com a Livih - ${r.empresa}`} author="Livih">
      <Page size="A4" style={s.pagina}>
        <View style={s.topo}>
          <View>
            <Text style={s.titulo}>Resultados com a Livih</Text>
            <Text style={s.sub}>
              {r.empresa} · {data(r.inicio)} a {data(r.fim)} ({r.dias} dias)
            </Text>
          </View>
          {logo ? <Image src={logo} style={s.logo} /> : <View />}
        </View>

        <Text style={s.lead}>{lead}</Text>
        {antes != null && (
          <Text style={[s.pequeno, { marginBottom: 10, fontSize: 9 }]}>
            Antes da Livih, segundo a empresa: cerca de {num(antes)} min até a primeira resposta.
          </Text>
        )}

        <View style={s.tabela}>
          <View style={s.cab}>
            <Text style={s.cInd}>Indicador</Text>
            <Text style={s.cNum}>Primeira semana</Text>
            <Text style={s.cNum}>Última semana</Text>
            <Text style={s.cNum}>Variação</Text>
          </View>
          {linhas(r.primeira_semana, u, minutos).map((g) => (
            <View key={g.grupo} wrap={false}>
              <Text style={s.grupo}>{g.grupo}</Text>
              {g.itens.map((l) => (
                <View key={l.rotulo} style={s.linha}>
                  <Text style={s.cInd}>{l.rotulo}</Text>
                  <Text style={s.cNum}>{l.a}</Text>
                  <Text style={s.cNum}>{l.b}</Text>
                  <Text style={[s.cNum, { color: l.delta?.bom == null ? COR.suave : l.delta.bom ? COR.bom : COR.ruim }]}>
                    {l.delta?.texto ?? ''}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <View style={s.caixa} wrap={false}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>Todo o período</Text>
          <View style={s.totais}>
            <View>
              <Text style={s.totalValor}>{r.total.resposta.pedidos}</Text>
              <Text style={s.pequeno}>pedidos de clientes</Text>
            </View>
            <View>
              <Text style={s.totalValor}>{duracao(r.total.resposta.geral.mediana_seg)}</Text>
              <Text style={s.pequeno}>até a primeira resposta</Text>
            </View>
            <View>
              <Text style={s.totalValor}>{r.total.agente.conversas}</Text>
              <Text style={s.pequeno}>conversas com o agente</Text>
            </View>
            <View>
              <Text style={s.totalValor}>{num(horasEconomizadas(r.total.agente.respostas, minutos))} h</Text>
              <Text style={s.pequeno}>economizadas (estimativa)</Text>
            </View>
            <View>
              <Text style={s.totalValor}>{r.total.funil.criadas}</Text>
              <Text style={s.pequeno}>oportunidades criadas</Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 14 }} wrap={false}>
          <Text style={[s.pequeno, { fontFamily: 'Helvetica-Bold' }]}>Como medimos</Text>
          <Text style={s.pequeno}>
            Pedido é a mensagem do cliente que abre uma conversa ou volta a ela depois de uma resposta nossa. O tempo
            vai até a primeira resposta do agente ou da equipe (não contam mensagens automáticas do celular). A mediana
            é o tempo do meio: metade dos pedidos foi respondida mais rápido. "Sem resposta" são pedidos sem resposta
            há mais de 1 hora. Horas economizadas são uma estimativa: respostas do agente vezes o tempo que a equipe
            levaria em cada uma.
          </Text>
        </View>

        <View style={s.rodape} fixed>
          <Text>Livih · livih.com.br</Text>
          <Text>Gerado em {data(new Date().toISOString())}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function gerarPdfRelatorio(r: Relatorio, logo: string | null): Promise<Blob> {
  return pdf(<Documento r={r} logo={logo} />).toBlob()
}
