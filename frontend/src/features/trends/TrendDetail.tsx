interface GradeRow {
  grade: string
  price_change_pct: number | null
  price_change_dollar: number | null
  starting_price: number | null
  last_sale: number | null
  avg: number | null
  min_sale: number | null
  max_sale: number | null
  num_sales: number | null
}

interface Window {
  window_days: number
  grades: GradeRow[]
}

interface DetailData {
  card: string
  sport: string | null
  windows: Window[]
}

interface Props {
  data: unknown
}

function fmt(v: number | null, prefix = '$'): string {
  if (v == null) return '—'
  return `${prefix}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function fmtPct(v: number | null): string {
  if (v == null) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

function pctColor(v: number | null): string {
  if (v == null) return '#94a3b8'
  return Number(v) >= 0 ? '#22c55e' : '#ef4444'
}

export function TrendDetail({ data }: Props) {
  const detail = data as DetailData
  if (!detail?.windows?.length) {
    return <p style={{ color: '#64748b', fontStyle: 'italic' }}>No trend data found for this card.</p>
  }

  return (
    <div style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 16, color: '#f1f5f9', marginBottom: 4 }}>{detail.card}</h2>
      {detail.sport && (
        <p style={{ color: '#64748b', fontSize: 12, marginBottom: 16, textTransform: 'capitalize' }}>
          {detail.sport}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {detail.windows.map(w => (
          <div key={w.window_days}>
            <h3 style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>
              {w.window_days}d window
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155' }}>
                    {['Grade', 'Change', '$ Chg', 'Start', 'Last', 'Avg', 'Min', 'Max', '# Sales'].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {w.grades.map((g, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={td}>{g.grade}</td>
                      <td style={{ ...td, color: pctColor(g.price_change_pct), fontWeight: 600 }}>
                        {fmtPct(g.price_change_pct)}
                      </td>
                      <td style={{ ...td, color: pctColor(g.price_change_dollar) }}>
                        {fmt(g.price_change_dollar)}
                      </td>
                      <td style={td}>{fmt(g.starting_price)}</td>
                      <td style={td}>{fmt(g.last_sale)}</td>
                      <td style={td}>{fmt(g.avg)}</td>
                      <td style={td}>{fmt(g.min_sale)}</td>
                      <td style={td}>{fmt(g.max_sale)}</td>
                      <td style={td}>{g.num_sales ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '6px 10px', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap', textAlign: 'left' }
const td: React.CSSProperties = { padding: '6px 10px', color: '#e2e8f0', whiteSpace: 'nowrap' }
