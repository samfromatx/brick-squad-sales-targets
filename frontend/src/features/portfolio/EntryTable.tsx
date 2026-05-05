import { useState } from 'react'
import type { CardMarketDataResult, PortfolioEntry } from '../../lib/types'

interface Props {
  entries: PortfolioEntry[]
  marketDataMap?: Map<string, CardMarketDataResult>
  marketDataLoading?: boolean
  onEdit: (entry: PortfolioEntry) => void
  onDelete: (id: string) => void
  onMarkSold: (entry: PortfolioEntry) => void
  onPcFilterClick?: () => void
}

type SortDir = 'asc' | 'desc'
interface SortState { key: string; dir: SortDir }

function isSold(e: PortfolioEntry): boolean {
  return e.actual_sale !== null && e.actual_sale !== undefined && e.actual_sale > 0
}

function fmt(val: number | null, opts?: { decimals?: number; prefix?: string }): string {
  if (val === null || val === undefined) return '—'
  const p = opts?.prefix ?? '$'
  const d = opts?.decimals ?? 0
  return `${p}${val.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`
}

function calcProfit(entry: PortfolioEntry): { label: string; positive: boolean | null } {
  const cost = entry.price_paid + entry.grading_cost
  if (isSold(entry)) {
    const ebay = entry.sale_venue?.toLowerCase().includes('ebay')
    const net = ebay ? (entry.actual_sale ?? 0) * (1 - 0.1325) : (entry.actual_sale ?? 0)
    const p = net - cost
    return { label: `${p >= 0 ? '+' : ''}${fmt(p, { decimals: 2 })}`, positive: p >= 0 }
  }
  if (entry.target_sell !== null) {
    const est = entry.target_sell - cost
    return { label: `~${fmt(est, { decimals: 0 })}`, positive: est >= 0 }
  }
  return { label: '—', positive: null }
}

function getSortValue(e: PortfolioEntry, key: string): string | number {
  const cost = e.price_paid + e.grading_cost
  switch (key) {
    case 'card_name':    return e.card_name.toLowerCase()
    case 'sport':        return e.sport
    case 'grade':        return e.grade.toLowerCase()
    case 'price_paid':   return e.price_paid
    case 'target_sell':  return e.target_sell ?? -Infinity
    case 'actual_sale':  return isSold(e) ? (e.actual_sale ?? 0) : -Infinity
    case 'profit': {
      if (isSold(e)) {
        const ebay = e.sale_venue?.toLowerCase().includes('ebay')
        const net = ebay ? (e.actual_sale ?? 0) * (1 - 0.1325) : (e.actual_sale ?? 0)
        return net - cost
      }
      return e.target_sell !== null ? e.target_sell - cost : -Infinity
    }
    case 'purchase_date': return e.purchase_date ?? ''
    default: return ''
  }
}

function sortEntries(entries: PortfolioEntry[], sort: SortState): PortfolioEntry[] {
  return [...entries].sort((a, b) => {
    const av = getSortValue(a, sort.key)
    const bv = getSortValue(b, sort.key)
    const cmp = (typeof av === 'number' && typeof bv === 'number') ? av - bv : String(av).localeCompare(String(bv))
    return sort.dir === 'asc' ? cmp : -cmp
  })
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span style={{ color: '#d0cec6', marginLeft: 4, fontSize: 9 }}>↕</span>
  return <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.6 }}>{dir === 'asc' ? '▲' : '▼'}</span>
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

function fmtAvg(val: number | null | undefined, loading: boolean): string {
  if (loading) return '…'
  if (val === null || val === undefined) return '—'
  return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function EntryTable({ entries, marketDataMap, marketDataLoading = false, onEdit, onDelete, onMarkSold, onPcFilterClick }: Props) {
  const [sort, setSort] = useState<SortState>({ key: 'card_name', dir: 'asc' })

  if (entries.length === 0) {
    return <p style={{ color: '#888780', fontStyle: 'italic', padding: '16px 0' }}>No entries yet. Add your first card.</p>
  }

  function handleSort(key: string) {
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }

  function th(key: string, label: string) {
    const active = sort.key === key
    return (
      <th
        onClick={() => handleSort(key)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {label}<SortIndicator active={active} dir={sort.dir} />
      </th>
    )
  }

  const sorted = sortEntries(entries, sort)

  return (
    <div className="tbl-wrap" style={{ overflow: 'auto', maxHeight: '75vh' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th
              onClick={() => handleSort('card_name')}
              style={{ cursor: 'pointer', userSelect: 'none', position: 'sticky', left: 0, top: 0, zIndex: 4, background: 'var(--bg-2)' }}
            >
              CARD<SortIndicator active={sort.key === 'card_name'} dir={sort.dir} />
            </th>
            {th('sport', 'SPORT')}
            {th('grade', 'GRADE')}
            {th('price_paid', 'PAID')}
            <th
              title="Personal Collection — click to filter"
              style={{ cursor: onPcFilterClick ? 'pointer' : undefined, userSelect: 'none' }}
              onClick={onPcFilterClick}
            >
              PC {onPcFilterClick ? '▾' : ''}
            </th>
            <th>7D AVG</th>
            <th>30D AVG</th>
            {th('target_sell', 'TARGET SELL')}
            {th('actual_sale', 'ACTUAL SALE')}
            <th>SALE VENUE</th>
            {th('profit', 'PROFIT')}
            {th('purchase_date', 'DATE')}
            <th>NOTES</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(e => {
            const sold = isSold(e)
            const { label: pl, positive } = calcProfit(e)
            const sp = SPORT_BADGE[e.sport] ?? SPORT_BADGE['football']
            const gp = gradePill(e.grade)
            const md = marketDataMap?.get(e.id)
            const avg7dMint = !marketDataLoading && md?.avg_7d != null && md.avg_7d > e.price_paid
            const avg30dMint = !marketDataLoading && md?.avg_30d != null && md.avg_30d > e.price_paid
            return (
              <tr key={e.id}>
                <td className="col-sticky" style={{ fontWeight: 500, minWidth: 180, color: '#1a1a18' }}>
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
                <td style={{ fontWeight: 500 }}>{fmt(e.price_paid, { decimals: 2 })}</td>
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
                <td style={{ color: '#52524e', backgroundColor: avg7dMint ? '#e6faf2' : undefined }}>{fmtAvg(md?.avg_7d, marketDataLoading && !(e.actual_sale !== null && e.actual_sale > 0))}</td>
                <td style={{ color: '#52524e', backgroundColor: avg30dMint ? '#e6faf2' : undefined }}>{fmtAvg(md?.avg_30d, marketDataLoading && !(e.actual_sale !== null && e.actual_sale > 0))}</td>
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
                <td style={{ color: '#52524e', fontSize: 12, maxWidth: 200, whiteSpace: 'normal' }}>{e.notes ?? '—'}</td>
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
