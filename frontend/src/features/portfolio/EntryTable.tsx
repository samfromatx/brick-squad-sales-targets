import type { PortfolioEntry } from '../../lib/types'

interface Props {
  entries: PortfolioEntry[]
  onEdit: (entry: PortfolioEntry) => void
  onDelete: (id: string) => void
  onMarkSold: (entry: PortfolioEntry) => void
}

function fmt(val: number | null, prefix = '$'): string {
  if (val === null || val === undefined) return '—'
  return `${prefix}${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function profit(entry: PortfolioEntry): string {
  const cost = entry.price_paid + entry.grading_cost
  const sale = entry.actual_sale
  if (sale === null) {
    if (entry.target_sell === null) return '—'
    const est = entry.target_sell - cost
    return `~${est >= 0 ? '+' : ''}$${est.toFixed(0)}`
  }
  const ebayVenue = entry.sale_venue?.toLowerCase().includes('ebay')
  const net = ebayVenue ? sale * (1 - 0.1325) : sale
  const p = net - cost
  return `${p >= 0 ? '+' : ''}$${p.toFixed(0)}`
}

export function EntryTable({ entries, onEdit, onDelete, onMarkSold }: Props) {
  if (entries.length === 0) {
    return <p style={{ color: '#64748b', fontStyle: 'italic' }}>No entries yet. Add your first card.</p>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #334155', textAlign: 'left' }}>
            <th style={th}>Card</th>
            <th style={th}>Sport</th>
            <th style={th}>Grade</th>
            <th style={th}>Cost</th>
            <th style={th}>Target</th>
            <th style={th}>Sold</th>
            <th style={th}>P/L</th>
            <th style={th}>Date</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => {
            const sold = e.actual_sale !== null
            const pl = profit(e)
            const plPositive = pl.startsWith('+') || pl.startsWith('~+')
            return (
              <tr key={e.id} style={{ borderBottom: '1px solid #1e293b', opacity: e.pc ? 0.6 : 1 }}>
                <td style={td}>
                  {e.card_name}
                  {e.pc && <span style={badge('#6366f1')}>PC</span>}
                  {sold && <span style={badge('#22c55e')}>SOLD</span>}
                </td>
                <td style={{ ...td, textTransform: 'capitalize' }}>{e.sport}</td>
                <td style={td}>{e.grade}</td>
                <td style={td}>{fmt(e.price_paid + e.grading_cost)}</td>
                <td style={td}>{fmt(e.target_sell)}</td>
                <td style={td}>{sold ? `${fmt(e.actual_sale)} (${e.sale_venue ?? '—'})` : '—'}</td>
                <td style={{ ...td, color: plPositive ? '#22c55e' : pl.startsWith('-') ? '#ef4444' : '#94a3b8', fontWeight: 600 }}>
                  {pl}
                </td>
                <td style={{ ...td, color: '#64748b' }}>{e.purchase_date ?? '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {!sold && (
                    <button onClick={() => onMarkSold(e)} style={actionBtn('#f59e0b')}>Sold</button>
                  )}
                  <button onClick={() => onEdit(e)} style={actionBtn('#2563eb')}>Edit</button>
                  <button onClick={() => onDelete(e.id)} style={actionBtn('#ef4444')}>Del</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '7px 10px', color: '#e2e8f0' }

function badge(color: string): React.CSSProperties {
  return {
    marginLeft: 5, fontSize: 10, padding: '1px 5px',
    background: color, color: '#fff', borderRadius: 4, verticalAlign: 'middle',
  }
}

function actionBtn(color: string): React.CSSProperties {
  return {
    marginLeft: 4, fontSize: 11, padding: '2px 8px', cursor: 'pointer',
    background: 'transparent', border: `1px solid ${color}`, color: color,
    borderRadius: 4,
  }
}
