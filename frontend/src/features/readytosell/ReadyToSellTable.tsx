import { useState } from 'react'
import { useMarketData } from '../portfolio/useMarketData'
import { usePortfolioEntries } from '../portfolio/usePortfolioEntries'
import type { PortfolioEntry, ReadyToSellEntry, SellVerdict } from '../../lib/types'

// ─── Domain math ──────────────────────────────────────────────────────────────

function calcCost(entry: PortfolioEntry): number {
  return entry.price_paid
}

function calcRoi(avg30d: number, cost: number): number {
  return ((avg30d * 0.87) - cost) / cost
}

function calcVerdict(roi: number, trend7d: number | null): SellVerdict {
  const t = trend7d ?? 0
  if (roi >= 0.25) return 'sell_now'
  if (roi >= 0.20 && t >= 10) return 'strong_sell'
  if (roi >= 0 || t >= 15) return 'consider'
  if (roi < 0 && t >= -5) return 'hold'
  return 'hold_wait'
}

const VERDICT_ORDER: Record<SellVerdict, number> = {
  sell_now: 1,
  strong_sell: 2,
  consider: 3,
  hold: 4,
  hold_wait: 5,
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtMoney(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(v: number | null): string {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

// ─── Pill styles ──────────────────────────────────────────────────────────────

const GRADE_PSA10: React.CSSProperties = { background: '#eaf3de', color: '#3b6d11', border: '1px solid #97c459', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600, display: 'inline-block' }
const GRADE_OTHER: React.CSSProperties = { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600, display: 'inline-block' }

function gradePill(grade: string): React.CSSProperties {
  const g = grade.toUpperCase()
  return g.includes('PSA 10') || g.includes('PSA10') ? GRADE_PSA10 : GRADE_OTHER
}

const VERDICT_STYLES: Record<SellVerdict, React.CSSProperties> = {
  sell_now:    { background: '#16a34a', color: '#fff',     border: '1px solid #16a34a', borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 700, display: 'inline-block' },
  strong_sell: { background: 'transparent', color: '#15803d', border: '1.5px solid #16a34a', borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 700, display: 'inline-block' },
  consider:    { background: 'transparent', color: '#b45309', border: '1.5px solid #d97706', borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 700, display: 'inline-block' },
  hold:        { background: 'transparent', color: '#64748b', border: '1.5px solid #94a3b8', borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 700, display: 'inline-block' },
  hold_wait:   { background: 'transparent', color: '#94a3b8', border: '1.5px solid #cbd5e1', borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 700, display: 'inline-block' },
}

const VERDICT_LABELS: Record<SellVerdict, string> = {
  sell_now: 'Sell Now',
  strong_sell: 'Strong Sell',
  consider: 'Consider',
  hold: 'Hold',
  hold_wait: 'Hold / Wait',
}

// ─── Sport badge ──────────────────────────────────────────────────────────────

type SportFilter = 'all' | 'football' | 'basketball'

const SPORT_EMOJI: Record<string, string> = { football: '🏈', basketball: '🏀' }
const SPORT_ABBR: Record<string, string>  = { football: 'FB', basketball: 'BB' }

// ─── Sort ─────────────────────────────────────────────────────────────────────

type SortCol = 'card' | 'grade' | 'cost' | 'avg_30d' | 'roi' | 'trend_7d' | 'verdict'
type SortDir = 'asc' | 'desc'

function getSortVal(row: ReadyToSellEntry, col: SortCol): number | string {
  switch (col) {
    case 'card':    return row.entry.card_name.toLowerCase()
    case 'grade':   return row.entry.grade.toLowerCase()
    case 'cost':    return row.cost
    case 'avg_30d': return row.avg_30d
    case 'roi':     return row.roi
    case 'trend_7d': return row.trend_7d_pct ?? -Infinity
    case 'verdict': return VERDICT_ORDER[row.verdict] * 1000 - row.roi
  }
}

function sortRows(rows: ReadyToSellEntry[], col: SortCol, dir: SortDir): ReadyToSellEntry[] {
  return [...rows].sort((a, b) => {
    const av = getSortVal(a, col)
    const bv = getSortVal(b, col)
    let cmp = 0
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
    else cmp = String(av).localeCompare(String(bv))
    return dir === 'asc' ? cmp : -cmp
  })
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span style={{ color: '#d0cec6', marginLeft: 4, fontSize: 9 }}>↕</span>
  return <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.6 }}>{dir === 'asc' ? '▲' : '▼'}</span>
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReadyToSellTable() {
  const { data: entriesData, isLoading: entriesLoading, isError } = usePortfolioEntries()
  const allEntries = entriesData?.data ?? []
  const { marketDataMap, isLoading: marketLoading, isError: marketError, error: marketErrorDetail } = useMarketData(allEntries)

  const [sportFilter, setSportFilter] = useState<SportFilter>('all')
  const [sortCol, setSortCol] = useState<SortCol>('verdict')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  if (entriesLoading) return <p style={{ color: '#94a3b8' }}>Loading portfolio…</p>
  if (isError) return <p style={{ color: '#dc2626' }}>Failed to load portfolio.</p>
  if (marketError) return <p style={{ color: '#dc2626' }}>Market data error: {(marketErrorDetail as Error)?.message ?? 'Unknown error'}</p>

  // Build unsold, non-pc entries
  const unsold = allEntries.filter(e => !(e.actual_sale !== null && e.actual_sale > 0) && !e.pc)

  // Compute summary stats (over all unsold, non-pc)
  const costBasis = unsold.reduce((s, e) => s + calcCost(e), 0)

  // Build ready-to-sell rows
  const readyRows: ReadyToSellEntry[] = []
  for (const entry of unsold) {
    const md = marketDataMap.get(entry.id)
    if (!md || md.match_confidence === 'none') continue
    if (md.avg_30d === null) continue
    const cost = calcCost(entry)
    if (md.avg_30d <= cost) continue
    const roi = calcRoi(md.avg_30d, cost)
    const verdict = calcVerdict(roi, md.trend_7d_pct)
    readyRows.push({
      entry,
      cost,
      avg_7d: md.avg_7d,
      avg_30d: md.avg_30d,
      trend_7d_pct: md.trend_7d_pct,
      roi,
      verdict,
    })
  }

  const profitable = readyRows.filter(r => r.roi > 0).length

  // Sport filter
  const filtered = sportFilter === 'all'
    ? readyRows
    : readyRows.filter(r => r.entry.sport === sportFilter)

  const sorted = sortRows(filtered, sortCol, sortDir)

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function th(col: SortCol, label: string) {
    return (
      <th onClick={() => handleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label}<SortIndicator active={sortCol === col} dir={sortDir} />
      </th>
    )
  }

  const kpis = [
    { label: 'CARDS HELD',    value: unsold.length,          color: '#1a1a18',  valueColor: '#1a1a18'  },
    { label: 'READY TO SELL', value: readyRows.length,       color: '#d97706',  valueColor: '#92400e'  },
    { label: 'PROFITABLE',    value: profitable,             color: '#16a34a',  valueColor: '#15803d'  },
    { label: 'COST BASIS',    value: fmtMoney(costBasis),    color: '#1a1a18',  valueColor: '#1a1a18'  },
  ]

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {kpis.map(k => (
          <div key={k.label} className="kpi-card" style={{ flex: '1 1 140px', borderTop: `3px solid ${k.color}` }}>
            <div className="kpi-value" style={{ color: k.valueColor, fontSize: '1.6rem', fontWeight: 700 }}>{k.value}</div>
            <div className="kpi-label" style={{ fontSize: 11, color: '#888780', letterSpacing: '.06em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Formula explainer */}
      <p style={{ fontSize: 12, color: '#888780', marginBottom: 18, lineHeight: 1.5 }}>
        <em>ROI = (30d avg × 0.87 − cost) ÷ cost. The 0.87 accounts for ~13% eBay fees, so a card needs to sell ~15% above your cost to break even. Cards are shown if the market price exceeds your cost paid, even if ROI is still negative after fees.</em>
      </p>

      {/* Sport filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'football', 'basketball'] as SportFilter[]).map(s => (
          <button
            key={s}
            className={`pill-btn${sportFilter === s ? ' active' : ''}`}
            onClick={() => setSportFilter(s)}
          >
            {s === 'all' ? 'All' : s === 'football' ? '🏈 Football' : '🏀 Basketball'}
          </button>
        ))}
      </div>

      {/* Empty states */}
      {allEntries.length === 0 && (
        <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>Add cards to your portfolio to see sell recommendations.</p>
      )}
      {allEntries.length > 0 && readyRows.length === 0 && !marketLoading && (
        <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No cards are currently above their purchase price.</p>
      )}

      {sorted.length > 0 && (
        <div className="tbl-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                {th('card', 'CARD')}
                {th('grade', 'GRADE')}
                {th('cost', 'COST')}
                {th('avg_30d', '30D AVG')}
                {th('roi', 'ROI')}
                {th('trend_7d', '7D TREND')}
                {th('verdict', 'VERDICT')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const sport = row.entry.sport.toLowerCase()
                const emoji = SPORT_EMOJI[sport] ?? ''
                const abbr  = SPORT_ABBR[sport] ?? sport.toUpperCase()
                const roiPositive = row.roi >= 0
                const trendPositive = (row.trend_7d_pct ?? 0) >= 0

                return (
                  <tr key={row.entry.id}>
                    <td style={{ color: '#94a3b8', width: 36 }}>{i + 1}</td>
                    <td style={{ fontWeight: 500, minWidth: 200 }}>
                      <div>{row.entry.card_name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        {emoji} {emoji} <span style={{ marginLeft: 4 }}>{abbr}</span>
                      </div>
                    </td>
                    <td>
                      <span style={gradePill(row.entry.grade)}>{row.entry.grade || '—'}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{fmtMoney(row.cost)}</td>
                    <td style={{ fontWeight: 500 }}>
                      {marketLoading ? <span style={{ color: '#cbd5e1' }}>…</span> : fmtMoney(row.avg_30d)}
                    </td>
                    <td style={{ fontWeight: 700, color: roiPositive ? '#16a34a' : '#dc2626' }}>
                      {marketLoading ? <span style={{ color: '#cbd5e1' }}>…</span> : fmtPct(row.roi * 100)}
                    </td>
                    <td style={{ color: row.trend_7d_pct === null ? '#94a3b8' : trendPositive ? '#16a34a' : '#dc2626' }}>
                      {marketLoading ? <span style={{ color: '#cbd5e1' }}>…</span> : fmtPct(row.trend_7d_pct)}
                    </td>
                    <td>
                      {marketLoading
                        ? <span style={{ color: '#cbd5e1' }}>…</span>
                        : <span style={VERDICT_STYLES[row.verdict]}>{VERDICT_LABELS[row.verdict]}</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
