import { useBootstrap } from '../targets/useBootstrap'
import type { PortfolioEntry, Target } from '../../lib/types'

// ─── Signal from trend_pct ────────────────────────────────────────────────────

type Signal = 'Buy' | 'Watch' | 'Monitor'

function signalFromPct(pct: number | null): Signal {
  if (pct === null || pct < 0) return 'Monitor'
  if (pct > 50) return 'Buy'
  return 'Watch'
}

function signalPillStyle(sig: Signal): React.CSSProperties {
  if (sig === 'Buy')     return { background: '#dcfce7', color: '#15803d' }
  if (sig === 'Watch')   return { background: '#fef3c7', color: '#92400e' }
  return                        { background: '#f1f5f9', color: '#475569' }
}

const SIGNAL_ORDER: Record<Signal, number> = { Buy: 0, Watch: 1, Monitor: 2 }

// ─── Cross-reference helpers ──────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function buildTargetMap(targets: Target[]): Map<string, Target> {
  const map = new Map<string, Target>()
  for (const t of targets) {
    map.set(normalise(t.card_name), t)
  }
  return map
}

function matchTarget(entry: PortfolioEntry, map: Map<string, Target>): Target | null {
  return map.get(normalise(entry.card_name)) ?? null
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmt(val: number | null): string {
  if (val === null || val === undefined) return '—'
  return `$${val.toLocaleString()}`
}

// ─── Sport badge ──────────────────────────────────────────────────────────────

const SPORT_BADGE: Record<string, React.CSSProperties> = {
  football:   { background: '#faeeda', color: '#92400e' },
  basketball: { background: '#e6f1fb', color: '#1e40af' },
}
const SPORT_EMOJI: Record<string, string> = {
  football: '🏈', basketball: '🏀',
}

// ─── Row ─────────────────────────────────────────────────────────────────────

interface EnrichedEntry {
  entry: PortfolioEntry
  matched: Target | null
  signal: Signal
  trend_pct: number | null
}

function Row({ row, index }: { row: EnrichedEntry; index: number }) {
  const { entry, signal, trend_pct } = row
  const sportStyle = SPORT_BADGE[entry.sport.toLowerCase()] ?? { background: '#f1f5f9', color: '#334155' }
  const sportEmoji = SPORT_EMOJI[entry.sport.toLowerCase()] ?? ''

  return (
    <tr>
      <td style={{ color: '#94a3b8', width: 36 }}>{index + 1}</td>
      <td style={{ fontWeight: 500, maxWidth: 220 }}>
        <span style={{ whiteSpace: 'nowrap' }}>{entry.card_name}</span>
      </td>
      <td>
        <span className="pill" style={{ ...sportStyle, fontSize: 11, padding: '2px 8px' }}>
          {sportEmoji} {entry.sport.charAt(0).toUpperCase() + entry.sport.slice(1)}
        </span>
      </td>
      <td>
        <span className={gradePillClass(entry.grade)}>{entry.grade || '—'}</span>
      </td>
      <td style={{ fontWeight: 500, color: '#16a34a' }}>
        {fmt(entry.price_paid + (entry.grading_cost ?? 0))}
      </td>
      <td style={{ fontWeight: 500, color: '#2563eb' }}>
        {fmt(entry.target_sell)}
      </td>
      <td>
        {trend_pct !== null ? (
          <span style={{ color: trend_pct >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
            {trend_pct > 0 ? '+' : ''}{trend_pct}%
          </span>
        ) : (
          <span style={{ color: '#94a3b8' }}>—</span>
        )}
      </td>
      <td>
        <span className="pill" style={{ ...signalPillStyle(signal), fontSize: 12, padding: '2px 10px', fontWeight: 600 }}>
          {signal}
        </span>
      </td>
    </tr>
  )
}

function gradePillClass(grade: string): string {
  if (!grade) return 'pill pill-raw'
  const g = grade.toUpperCase()
  if (g.includes('PSA 10') || g.includes('PSA10')) return 'pill pill-psa10'
  if (g.includes('PSA 9')  || g.includes('PSA9'))  return 'pill pill-psa9'
  return 'pill pill-raw'
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReadyToSellTable() {
  const { data, isLoading, isError, error } = useBootstrap()

  if (isLoading) return <p style={{ color: '#94a3b8' }}>Loading portfolio…</p>
  if (isError) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return <p style={{ color: '#dc2626' }}>Failed to load: {msg}</p>
  }

  const targets    = data?.data.targets ?? []
  const entries    = data?.data.portfolio_entries ?? []
  const targetMap  = buildTargetMap(targets)

  // Unsold entries only (actual_sale is null)
  const unsold = entries.filter(e => e.actual_sale === null && !e.pc)

  // Enrich with matched target trend/signal
  const enriched: EnrichedEntry[] = unsold.map(entry => {
    const matched   = matchTarget(entry, targetMap)
    const trend_pct = matched?.trend_pct ?? null
    const signal    = signalFromPct(trend_pct)
    return { entry, matched, signal, trend_pct }
  })

  // Sort: Buy first, then Watch, then Monitor; within each group by card name
  enriched.sort((a, b) => {
    const sd = SIGNAL_ORDER[a.signal] - SIGNAL_ORDER[b.signal]
    if (sd !== 0) return sd
    return a.entry.card_name.localeCompare(b.entry.card_name)
  })

  const buyCount     = enriched.filter(r => r.signal === 'Buy').length
  const watchCount   = enriched.filter(r => r.signal === 'Watch').length
  const totalCost    = unsold.reduce((s, e) => s + e.price_paid + (e.grading_cost ?? 0), 0)
  const avgUpside    = (() => {
    const withTarget = enriched.filter(r => r.entry.target_sell !== null)
    if (!withTarget.length) return null
    const ups = withTarget.map(r => {
      const cost = r.entry.price_paid + (r.entry.grading_cost ?? 0)
      const sell = r.entry.target_sell!
      return ((sell - cost) / cost) * 100
    })
    return Math.round(ups.reduce((s, v) => s + v, 0) / ups.length)
  })()

  const kpis = [
    { label: 'Total Unsold', value: unsold.length,                   sub: 'in portfolio',        color: '#2563eb' },
    { label: 'Buy Signal',   value: buyCount,                        sub: 'momentum targets',    color: '#16a34a' },
    { label: 'Watching',     value: watchCount,                      sub: 'building momentum',   color: '#d97706' },
    { label: 'Avg Upside',   value: avgUpside !== null ? `${avgUpside}%` : '—', sub: 'to target sell', color: '#7c3aed' },
  ]

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {kpis.map(k => (
          <div key={k.label} className="kpi-card" style={{ borderTop: `3px solid ${k.color}` }}>
            <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {enriched.length === 0 ? (
        <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No unsold portfolio entries found.</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>CARD</th>
                <th>SPORT</th>
                <th>GRADE</th>
                <th>BUY</th>
                <th>SELL TARGET</th>
                <th>TREND</th>
                <th>SIGNAL</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((row, i) => (
                <Row key={row.entry.id} row={row} index={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
