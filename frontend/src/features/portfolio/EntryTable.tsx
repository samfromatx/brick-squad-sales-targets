import type { PortfolioEntry } from '../../lib/types'

interface Props {
  entries: PortfolioEntry[]
  onEdit: (entry: PortfolioEntry) => void
  onDelete: (id: string) => void
  onMarkSold: (entry: PortfolioEntry) => void
  onPcFilterClick?: () => void
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

const SPORT_BADGE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  football:   { bg: '#faeeda', text: '#633806', border: '#fac775', label: '🏈 FB' },
  basketball: { bg: '#e6f1fb', text: '#0c447c', border: '#85b7eb', label: '🏀 BB' },
}

function gradePill(grade: string) {
  const g = grade.toUpperCase()
  if (g.includes('PSA 10') || g.includes('PSA10')) return { bg: '#eaf3de', text: '#3b6d11', border: '#97c459' }
  if (g.includes('PSA 9')  || g.includes('PSA9'))  return { bg: '#e6f1fb', text: '#0c447c', border: '#85b7eb' }
  return { bg: '#faeeda', text: '#633806', border: '#fac775' }
}

export function EntryTable({ entries, onEdit, onDelete, onMarkSold, onPcFilterClick }: Props) {
  if (entries.length === 0) {
    return <p style={{ color: '#888780', fontStyle: 'italic', padding: '16px 0' }}>No entries yet. Add your first card.</p>
  }

  return (
    <div className="tbl-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>CARD</th>
            <th>SPORT</th>
            <th>GRADE</th>
            <th
              title="Personal Collection — click to filter"
              style={{ cursor: onPcFilterClick ? 'pointer' : undefined, userSelect: 'none' }}
              onClick={onPcFilterClick}
            >
              PC {onPcFilterClick ? '▾' : ''}
            </th>
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
              <tr key={e.id} style={{ opacity: e.pc ? 0.75 : 1 }}>
                <td style={{ fontWeight: 500, minWidth: 180, color: '#1a1a18' }}>
                  {e.card_name}
                  {sold && <span className="pill" style={{ marginLeft: 6, background: '#eaf3de', color: '#3b6d11', borderColor: '#97c459', fontSize: 10 }}>SOLD</span>}
                </td>
                <td>
                  <span className="pill" style={{ background: sp.bg, color: sp.text, borderColor: sp.border }}>
                    {sp.label}
                  </span>
                </td>
                <td>
                  <span className="pill" style={{ background: gp.bg, color: gp.text, borderColor: gp.border }}>
                    {e.grade}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  {e.pc && (
                    <span
                      className="pill"
                      style={{ background: '#ede9fe', color: '#7c3aed', borderColor: '#c4b5fd', fontSize: 11, cursor: onPcFilterClick ? 'pointer' : undefined }}
                      onClick={onPcFilterClick}
                      title="Personal Collection"
                    >
                      🎴 PC
                    </span>
                  )}
                </td>
                <td style={{ color: '#888780' }}>—</td>
                <td style={{ color: '#888780' }}>—</td>
                <td>{fmt(e.target_sell, { decimals: 2 })}</td>
                <td>{sold ? fmt(e.actual_sale, { decimals: 2 }) : '—'}</td>
                <td style={{ color: '#52524e' }}>{e.sale_venue ?? '—'}</td>
                <td style={{
                  fontWeight: 600,
                  color: positive === true ? '#3b6d11' : positive === false ? '#a32d2d' : '#888780',
                }}>
                  {pl}
                </td>
                <td style={{ color: '#888780', fontSize: 12 }}>{e.purchase_date ?? '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!sold && (
                    <button onClick={() => onMarkSold(e)} className="btn-ghost" style={{ color: '#633806' }}>Sold</button>
                  )}
                  <button onClick={() => onEdit(e)} className="btn-ghost" style={{ color: '#0c447c' }}>Edit</button>
                  <button onClick={() => onDelete(e.id)} className="btn-ghost" style={{ color: '#a32d2d' }}>Del</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
