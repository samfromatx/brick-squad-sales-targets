import type { PortfolioEntry } from '../../lib/types'

interface Props {
  entries: PortfolioEntry[]
  onEdit: (entry: PortfolioEntry) => void
  onDelete: (id: string) => void
  onMarkSold: (entry: PortfolioEntry) => void
}

function fmt(val: number | null, opts?: { decimals?: number; prefix?: string }): string {
  if (val === null || val === undefined) return '—'
  const p = opts?.prefix ?? '$'
  const d = opts?.decimals ?? 0
  return `${p}${val.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`
}

function calcProfit(entry: PortfolioEntry): { label: string; positive: boolean | null } {
  const cost = entry.price_paid + entry.grading_cost
  if (entry.actual_sale !== null) {
    const ebay = entry.sale_venue?.toLowerCase().includes('ebay')
    const net = ebay ? entry.actual_sale * (1 - 0.1325) : entry.actual_sale
    const p = net - cost
    return { label: `${p >= 0 ? '+' : ''}${fmt(p, { decimals: 2 })}`, positive: p >= 0 }
  }
  if (entry.target_sell !== null) {
    const est = entry.target_sell - cost
    return { label: `~${fmt(est, { decimals: 0 })}`, positive: est >= 0 }
  }
  return { label: '—', positive: null }
}

const SPORT_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  football:   { bg: '#faeeda', text: '#92400e', label: '🏈 FB' },
  basketball: { bg: '#e6f1fb', text: '#1e40af', label: '🏀 BB' },
}

function gradePill(grade: string) {
  const g = grade.toUpperCase()
  if (g.includes('PSA 10') || g.includes('PSA10')) return { bg: '#fef3c7', text: '#b45309' }
  if (g.includes('PSA 9')  || g.includes('PSA9'))  return { bg: '#dbeafe', text: '#1d4ed8' }
  return { bg: '#f1f5f9', text: '#475569' }
}

export function EntryTable({ entries, onEdit, onDelete, onMarkSold }: Props) {
  if (entries.length === 0) {
    return <p style={{ color: '#94a3b8', fontStyle: 'italic', padding: '16px 0' }}>No entries yet. Add your first card.</p>
  }

  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>CARD</th>
            <th>SPORT</th>
            <th>GRADE</th>
            <th>7D AVG</th>
            <th>30D AVG</th>
            <th>TARGET SELL</th>
            <th>ACTUAL SALE</th>
            <th>SALE VENUE</th>
            <th>PROFIT</th>
            <th>DATE</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => {
            const sold = e.actual_sale !== null
            const { label: pl, positive } = calcProfit(e)
            const sp = SPORT_BADGE[e.sport] ?? SPORT_BADGE['football']
            const gp = gradePill(e.grade)
            return (
              <tr key={e.id} style={{ opacity: e.pc ? 0.65 : 1 }}>
                <td style={{ fontWeight: 500, minWidth: 180 }}>
                  {e.card_name}
                  {e.pc && <span className="pill" style={{ marginLeft: 6, background: '#ede9fe', color: '#7c3aed', fontSize: 10 }}>PC</span>}
                  {sold && <span className="pill" style={{ marginLeft: 6, background: '#dcfce7', color: '#15803d', fontSize: 10 }}>SOLD</span>}
                </td>
                <td>
                  <span className="pill" style={{ background: sp.bg, color: sp.text, fontSize: 11 }}>
                    {sp.label}
                  </span>
                </td>
                <td>
                  <span className="pill" style={{ background: gp.bg, color: gp.text }}>
                    {e.grade}
                  </span>
                </td>
                <td style={{ color: '#94a3b8' }}>—</td>
                <td style={{ color: '#94a3b8' }}>—</td>
                <td>{fmt(e.target_sell, { decimals: 2 })}</td>
                <td>{sold ? fmt(e.actual_sale, { decimals: 2 }) : '—'}</td>
                <td style={{ color: '#64748b' }}>{e.sale_venue ?? '—'}</td>
                <td style={{
                  fontWeight: 600,
                  color: positive === true ? '#16a34a' : positive === false ? '#dc2626' : '#94a3b8',
                }}>
                  {pl}
                </td>
                <td style={{ color: '#94a3b8', fontSize: 12 }}>{e.purchase_date ?? '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!sold && (
                    <button onClick={() => onMarkSold(e)} className="btn-ghost" style={{ color: '#d97706' }}>Sold</button>
                  )}
                  <button onClick={() => onEdit(e)} className="btn-ghost" style={{ color: '#2563eb' }}>Edit</button>
                  <button onClick={() => onDelete(e.id)} className="btn-ghost" style={{ color: '#dc2626' }}>Del</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
