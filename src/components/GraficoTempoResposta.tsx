import { useState } from 'react'
import { duracao, type Periodo } from '../services/painel'

// Cores validadas (scripts/validate_palette.js da skill de dataviz, modo claro): verde-azulado e roxo passam em
// croma, separação para daltonismo (ΔE 21) e contraste ≥ 3:1. O verde da marca (#0f766e) lê como cinza num gráfico.
export const COR_AGENTE = '#0d9488'
export const COR_EQUIPE = '#7c3aed'

type Dia = Periodo['resposta']['por_dia'][number]

const ALTURA = 180
const MARGEM = { topo: 12, base: 24, esq: 40, dir: 8 }

/** Escala "bonita" do eixo em minutos: 1, 2, 5, 10, 15, 30, 60... */
function topoEixo(maxMin: number): number {
  for (const v of [1, 2, 5, 10, 15, 30, 60, 120, 240, 480, 1440]) if (maxMin <= v) return v
  return Math.ceil(maxMin / 1440) * 1440
}

const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Mediana do tempo até a primeira resposta por dia, agente × equipe (barras agrupadas, um eixo em minutos).
 * Passar o mouse mostra os dois valores e os pedidos do dia; "Ver tabela" mostra os números.
 */
export function GraficoTempoResposta({ dias }: { dias: Dia[] }) {
  const [foco, setFoco] = useState<number | null>(null)
  const [tabela, setTabela] = useState(false)
  if (!dias.length) return <p className="py-8 text-center text-pequeno text-texto-3">Nenhum pedido de cliente no período.</p>

  const valores = dias.flatMap((d) => [d.agente_mediana_seg, d.equipe_mediana_seg]).filter((v): v is number => v != null)
  const topo = topoEixo(Math.max(1, ...valores) / 60)
  const largura = Math.max(320, dias.length * 28 + MARGEM.esq + MARGEM.dir)
  const area = { w: largura - MARGEM.esq - MARGEM.dir, h: ALTURA - MARGEM.topo - MARGEM.base }
  const passo = area.w / dias.length
  const barra = Math.max(3, Math.min(14, (passo - 6) / 2))
  const y = (seg: number) => MARGEM.topo + area.h - (Math.min(seg / 60, topo) / topo) * area.h
  const marcas = [0, topo / 2, topo]
  const rotular = dias.length <= 14 ? 1 : Math.ceil(dias.length / 10)
  const d = foco != null ? dias[foco] : null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-legenda text-texto-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: COR_AGENTE }} aria-hidden /> Agente
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: COR_EQUIPE }} aria-hidden /> Equipe
        </span>
        <span className="text-texto-3">mediana por dia, em minutos</span>
        <button type="button" onClick={() => setTabela((t) => !t)} className="ml-auto text-texto-3 underline hover:text-texto">
          {tabela ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>

      {tabela ? (
        <div className="max-h-64 overflow-auto rounded-md border border-borda">
          <table className="w-full text-pequeno">
            <thead className="sticky top-0 bg-superficie text-left text-legenda text-texto-3 uppercase">
              <tr>
                <th className="px-3 py-1.5 font-medium">Dia</th>
                <th className="px-3 py-1.5 text-right font-medium">Pedidos</th>
                <th className="px-3 py-1.5 text-right font-medium">Agente</th>
                <th className="px-3 py-1.5 text-right font-medium">Equipe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {dias.map((x) => (
                <tr key={x.dia}>
                  <td className="px-3 py-1.5">{diaCurto(x.dia)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{x.pedidos}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{duracao(x.agente_mediana_seg)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{duracao(x.equipe_mediana_seg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <svg
            width={largura}
            height={ALTURA}
            role="img"
            aria-label="Mediana do tempo até a primeira resposta por dia, agente e equipe"
            className="block"
            onMouseLeave={() => setFoco(null)}
          >
            {marcas.map((m) => (
              <g key={m}>
                <line x1={MARGEM.esq} x2={largura - MARGEM.dir} y1={y(m * 60)} y2={y(m * 60)} stroke="#e2e8f0" strokeWidth={1} />
                <text x={MARGEM.esq - 6} y={y(m * 60) + 3} textAnchor="end" fontSize={10} fill="#64748b">
                  {m.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                </text>
              </g>
            ))}
            {dias.map((x, i) => {
              const cx = MARGEM.esq + passo * i + passo / 2
              const barras: [number | null, string][] = [
                [x.agente_mediana_seg, COR_AGENTE],
                [x.equipe_mediana_seg, COR_EQUIPE],
              ]
              return (
                <g key={x.dia} opacity={foco == null || foco === i ? 1 : 0.45}>
                  {/* Alvo maior que as barras: a coluna inteira do dia. */}
                  <rect
                    x={MARGEM.esq + passo * i}
                    y={MARGEM.topo}
                    width={passo}
                    height={area.h}
                    fill="transparent"
                    onMouseEnter={() => setFoco(i)}
                    onFocus={() => setFoco(i)}
                    tabIndex={0}
                    aria-label={`${diaCurto(x.dia)}: agente ${duracao(x.agente_mediana_seg)}, equipe ${duracao(x.equipe_mediana_seg)}`}
                  />
                  {barras.map(([seg, cor], k) => {
                    if (seg == null) return null
                    const altura = Math.max(2, y(0) - y(seg))
                    const bx = cx - barra - 1 + k * (barra + 2)
                    const r = Math.min(4, barra / 2, altura)
                    // Topo arredondado, base reta no eixo.
                    const caminho = `M${bx},${y(0)} V${y(0) - altura + r} Q${bx},${y(0) - altura} ${bx + r},${y(0) - altura} H${bx + barra - r} Q${bx + barra},${y(0) - altura} ${bx + barra},${y(0) - altura + r} V${y(0)} Z`
                    return <path key={k} d={caminho} fill={cor} pointerEvents="none" />
                  })}
                  {i % rotular === 0 && (
                    <text x={cx} y={ALTURA - 8} textAnchor="middle" fontSize={10} fill="#64748b">
                      {diaCurto(x.dia)}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
          {d && foco != null && (
            <div
              className="pointer-events-none absolute top-0 rounded-md bg-superficie px-2.5 py-1.5 text-legenda shadow-md ring-1 ring-borda"
              style={{ left: Math.min(MARGEM.esq + passo * foco + passo, largura - 150) }}
            >
              <p className="font-semibold text-texto">{diaCurto(d.dia)} · {d.pedidos} pedidos</p>
              <p className="flex items-center gap-1.5 text-texto-2">
                <span className="size-2 rounded-sm" style={{ background: COR_AGENTE }} aria-hidden /> Agente: {duracao(d.agente_mediana_seg)}
              </p>
              <p className="flex items-center gap-1.5 text-texto-2">
                <span className="size-2 rounded-sm" style={{ background: COR_EQUIPE }} aria-hidden /> Equipe: {duracao(d.equipe_mediana_seg)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
