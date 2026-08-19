// src/lib/reports/exportReport.ts
// Exportação de relatório via CSS print (sem dependências extras)
// O navegador gera o PDF via "Salvar como PDF" no diálogo de impressão.
//
// Para export programático (sem diálogo), instale:
//   npm install jspdf html2canvas
// e use a função exportToPdfProgrammatic abaixo.

// ─────────────────────────────────────────────────────────────────────────────
// CSS de impressão injetado dinamicamente
// ─────────────────────────────────────────────────────────────────────────────

const PRINT_STYLE_ID = 'report-print-styles'

function injectPrintStyles() {
  if (document.getElementById(PRINT_STYLE_ID)) return

  const style = document.createElement('style')
  style.id = PRINT_STYLE_ID
  style.textContent = `
    @media print {
      /* Oculta tudo exceto o conteúdo do relatório */
      body > *:not(#report-print-root) { display: none !important; }
      #report-print-root { display: block !important; }

      /* Reset de layout para impressão */
      #report-print-root {
        position: fixed;
        top: 0; left: 0;
        width: 100%;
        background: white;
        padding: 24px;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 12px;
        color: #111;
      }

      /* Evita quebras dentro de cards/tabelas */
      .report-card, tr { break-inside: avoid; }

      /* Cabeçalhos de página */
      .report-section-title {
        font-size: 14px;
        font-weight: 700;
        margin: 16px 0 8px;
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 4px;
      }

      /* Gráficos — força tamanho fixo para impressão */
      .recharts-wrapper {
        max-width: 100% !important;
      }

      /* Remove sombras e borders arredondadas para PDF limpo */
      * { box-shadow: none !important; }
    }
  `
  document.head.appendChild(style)
}

// ─────────────────────────────────────────────────────────────────────────────
// Função principal: abre diálogo de impressão
// ─────────────────────────────────────────────────────────────────────────────

export function printReport(reportTitle?: string) {
  if (reportTitle) {
    const prev = document.title
    document.title = reportTitle
    window.print()
    document.title = prev
  } else {
    window.print()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exportação para CSV
// ─────────────────────────────────────────────────────────────────────────────

export function exportToCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; label: string }[],
  filename = 'relatorio.csv',
) {
  if (!rows.length) return

  const header = columns.map(c => `"${c.label}"`).join(',')
  const body = rows.map(row =>
    columns.map(c => {
      const val = row[c.key]
      if (val === null || val === undefined) return ''
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }).join(',')
  )

  const csv = [header, ...body].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }) // BOM para Excel
  const url  = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────────────────────
// Colunas padrão para CSV de tickets
// ─────────────────────────────────────────────────────────────────────────────

export const TICKET_CSV_COLUMNS = [
  { key: 'ticket_number' as const, label: 'Nº Ticket' },
  { key: 'status'        as const, label: 'Status' },
  { key: 'priority'      as const, label: 'Prioridade' },
  { key: 'subject'       as const, label: 'Assunto' },
  { key: 'category_name' as const, label: 'Categoria' },
  { key: 'agent_name'    as const, label: 'Agente' },
  { key: 'created_at'    as const, label: 'Criado em' },
  { key: 'resolved_at'   as const, label: 'Resolvido em' },
  { key: 'sla_status'    as const, label: 'Status SLA' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Formatadores de tempo
// ─────────────────────────────────────────────────────────────────────────────

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60)   return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h < 24)        return m > 0 ? `${h}h ${m}min` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`
}
