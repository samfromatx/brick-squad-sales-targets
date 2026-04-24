import type { Target } from '../../lib/types'

interface Props {
  targets: Target[]
}

function trendColor(pct: number | null): string {
  if (pct === null) return ''
  if (pct > 50) return '#22c55e'
  if (pct >= 0) return '#f59e0b'
  return '#ef4444'
}

function trendLabel(pct: number | null): string {
  if (pct === null) return '—'
  if (pct > 50) return 'High'
  if (pct >= 0) return 'Med'
  return 'Watch'
}

function fmt(val: number | null, prefix = '$'): string {
  if (val === null || val === undefined) return '—'
  return `${prefix}${val.toLocaleString()}`
}

export function TargetTable({ targets }: Props) {
  if (targets.length === 0) {
    return <p style={{ color: '#888', fontStyle: 'italic' }}>No targets match the current filters.</p>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #334155', textAlign: 'left' }}>
            <th style={th}>#</th>
            <th style={th}>Card</th>
            <th style={th}>Grade</th>
            <th style={th}>Target</th>
            <th style={th}>Max</th>
            <th style={th}>Sell At</th>
            <th style={th}>Trend</th>
          </tr>
        </thead>
        <tbody>
          {targets.map(t => (
            <tr key={t.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={td}>{t.rank}</td>
              <td style={td}>
                {t.card_name}
                {t.is_new && (
                  <span style={{
                    marginLeft: 6, fontSize: 10, padding: '1px 5px',
                    background: '#2563eb', color: '#fff', borderRadius: 4,
                    verticalAlign: 'middle',
                  }}>NEW</span>
                )}
              </td>
              <td style={td}>{t.grade ?? '—'}</td>
              <td style={td}>{fmt(t.target_price)}</td>
              <td style={td}>{fmt(t.max_price)}</td>
              <td style={td}>{fmt(t.sell_at)}</td>
              <td style={{ ...td, color: trendColor(t.trend_pct), fontWeight: 600 }}>
                {t.trend_pct !== null ? `${t.trend_pct > 0 ? '+' : ''}${t.trend_pct}%` : '—'}
                {' '}
                <span style={{ fontSize: 10, opacity: 0.8 }}>{trendLabel(t.trend_pct)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '8px 10px',
  fontWeight: 700,
  color: '#94a3b8',
  whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '7px 10px',
  color: '#e2e8f0',
  whiteSpace: 'nowrap',
}
