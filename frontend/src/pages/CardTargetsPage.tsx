import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  CardTargetResult,
  SupportedTargetSport,
} from '../lib/types'


// ── Strength badge ─────────────────────────────────────────────────────────

const STRENGTH_COLORS: Record<string, { bg: string; color: string }> = {
  'Strong Buy Target': { bg: '#dcfce7', color: '#166534' },
  'Buy Target':        { bg: '#dbeafe', color: '#1e40af' },
  'Value Target':      { bg: '#ede9fe', color: '#5b21b6' },
  'Watchlist Target':  { bg: '#fef9c3', color: '#854d0e' },
  'Avoid / Overheated':{ bg: '#fee2e2', color: '#991b1b' },
}

function StrengthBadge({ strength }: { strength: string }) {
  const c = STRENGTH_COLORS[strength] ?? { bg: '#f3f4f6', color: '#374151' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
      background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }}>
      {strength}
    </span>
  )
}

// ── Warning badge ──────────────────────────────────────────────────────────

const WARNING_COLORS: Record<string, string> = {
  STALE_DATA:          '#dc2626',
  LOW_CONFIDENCE:      '#d97706',
  STRONG_DOWNTREND:    '#dc2626',
  PRICE_ABOVE_TARGET:  '#d97706',
  PLAYER_NEEDS_REVIEW: '#6b7280',
  LOW_PLAYER_SCORE:    '#6b7280',
}

function WarningPill({ code, message }: { code: string; message: string }) {
  const color = WARNING_COLORS[code] ?? '#6b7280'
  return (
    <span title={message} style={{
      fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
      background: `${color}18`, color, border: `1px solid ${color}40`,
      whiteSpace: 'nowrap',
    }}>
      {code}
    </span>
  )
}

// ── Price cell ─────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined) {
  if (v == null) return '—'
  return `$${v.toFixed(0)}`
}

function fmtScore(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toFixed(1)
}

// ── Row detail panel ───────────────────────────────────────────────────────

function DetailPanel({ row, onClose }: { row: CardTargetResult; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const s = row.scores

  return (
    <div style={overlayStyle}>
      <div ref={ref} style={panelStyle}>
        <div style={panelHeader}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a18' }}>{row.card}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {row.player_name} · {row.sport}
            </div>
          </div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <div style={panelBody}>
          {/* Recommendation */}
          <div style={sectionBox}>
            <div style={sectionLabel}>Recommendation</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <StrengthBadge strength={row.recommendation_strength} />
              {row.strategy_type && (
                <span style={{ fontSize: 11, color: '#6b7280', padding: '2px 7px', border: '1px solid #e5e7eb', borderRadius: 4 }}>
                  {row.strategy_type}
                </span>
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: '#1a1a18' }}>
              {row.recommendation}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
              Market confidence: <strong>{row.market_confidence}</strong>
            </div>
          </div>

          {/* Score breakdown */}
          <div style={sectionBox}>
            <div style={sectionLabel}>Score Breakdown</div>
            <div style={scoreGrid}>
              {[
                ['Market', s.market_score, 30],
                ['Value',  s.value_score,  35],
                ['Timing', s.timing_score, 15],
                ['Player', s.player_score, 20],
              ].map(([label, val, max]) => (
                <div key={String(label)} style={scoreItem}>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a18' }}>{Number(val).toFixed(1)}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>/ {max}</div>
                </div>
              ))}
              <div style={scoreItem}>
                <div style={{ fontSize: 11, color: '#dc2626' }}>Risk −</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>{s.risk_penalty.toFixed(1)}</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>/ 30</div>
              </div>
              <div style={{ ...scoreItem, background: '#1a1a18', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#d1d5db' }}>Total</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{s.target_score.toFixed(1)}</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>/ 100</div>
              </div>
            </div>
          </div>

          {/* Price series */}
          <div style={sectionBox}>
            <div style={sectionLabel}>Prices — {row.recommended_grade}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
              <thead>
                <tr>
                  {['7d', '14d', '30d', '90d', '180d'].map(w => (
                    <th key={w} style={thStyle}>{w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[row.avg_7d, row.avg_14d, row.avg_30d, row.avg_90d, row.avg_180d].map((v, i) => (
                    <td key={i} style={tdStyle}>{fmt(v)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Grade comparison */}
          <div style={sectionBox}>
            <div style={sectionLabel}>30d Avg by Grade</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {[
                ['Raw', row.raw_avg_30d],
                ['PSA 9', row.psa9_avg_30d],
                ['PSA 10', row.psa10_avg_30d],
              ].map(([grade, val]) => (
                <div key={String(grade)} style={{
                  flex: 1, background: row.recommended_grade === grade ? '#f0f9ff' : '#f9fafb',
                  border: `1px solid ${row.recommended_grade === grade ? '#bae6fd' : '#e5e7eb'}`,
                  borderRadius: 6, padding: '8px 10px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>{grade}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a18' }}>{fmt(val as number | null)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Market signals */}
          <div style={sectionBox}>
            <div style={sectionLabel}>Market Signals</div>
            <div style={signalGrid}>
              {[
                ['Liquidity',   row.liquidity_label],
                ['Trend',       row.trend_label],
                ['Volume',      row.volume_signal],
                ['Volatility',  row.volatility_label],
                ['90d sales',   row.total_90d_sales != null ? String(row.total_90d_sales) : null],
              ].map(([label, val]) => val && (
                <div key={String(label)} style={signalItem}>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{label}: </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#1a1a18' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Justification */}
          {row.justification.length > 0 && (
            <div style={sectionBox}>
              <div style={sectionLabel}>Why</div>
              <ul style={{ margin: '6px 0 0', padding: '0 0 0 16px' }}>
                {row.justification.map((b, i) => (
                  <li key={i} style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {row.warnings.length > 0 && (
            <div style={sectionBox}>
              <div style={sectionLabel}>Warnings</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {row.warnings.map((w, i) => (
                  <WarningPill key={i} code={w.code} message={w.message} />
                ))}
              </div>
              <div style={{ marginTop: 8 }}>
                {row.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>
                    <strong>{w.code}:</strong> {w.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

type ViewTab = 'buy' | 'watchlist' | 'overheated'

export function CardTargetsPage() {
  const [sport, setSport]       = useState<SupportedTargetSport>('football')
  const [view, setView]         = useState<ViewTab>('buy')
  const [search, setSearch]     = useState('')
  const [minPrice, setMinPrice] = useState<string>('10')
  const [maxPrice, setMaxPrice] = useState<string>('200')
  const [selected, setSelected] = useState<CardTargetResult | null>(null)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['card-targets', sport, view, debouncedSearch, minPrice, maxPrice],
    queryFn: () => api.getCardTargets({
      sport,
      view,
      min_price: minPrice ? Number(minPrice) : undefined,
      max_price: maxPrice ? Number(maxPrice) : undefined,
      q: debouncedSearch || undefined,
      limit: 100,
    }),
  })

  const rows = data?.data ?? []
  const total = data?.total ?? 0

  return (
    <div className="page-content">
      {/* Header */}
      <div style={pageHeader}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a18' }}>Card Targets</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
            Top buy opportunities ranked by risk-adjusted score
          </p>
        </div>
        <a
          href="https://github.com/samfromatx/brick-squad-sales-targets/actions/workflows/recalculate-card-targets.yml"
          target="_blank"
          rel="noopener noreferrer"
          style={recalcBtn}
        >
          ⟳ Recalculate
        </a>
      </div>

      {/* Sport tabs */}
      <div style={tabRow}>
        {(['football', 'basketball'] as SupportedTargetSport[]).map((s) => (
          <button
            key={s}
            onClick={() => setSport(s)}
            style={sportTab(sport === s)}
          >
            {s === 'football' ? '🏈 Football' : '🏀 Basketball'}
          </button>
        ))}
      </div>

      {/* View + filters */}
      <div style={filterBar}>
        <div style={viewTabs}>
          {([
            ['buy', 'Buy Targets'],
            ['watchlist', 'Watchlist'],
            ['overheated', 'Overheated'],
          ] as [ViewTab, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} style={viewTab(view === v)}>
              {label}
            </button>
          ))}
        </div>

        <div style={filterRight}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search card or player…"
            style={searchInput}
          />
          <div style={priceRange}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>$</span>
            <input
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              style={priceInput}
              placeholder="10"
            />
            <span style={{ fontSize: 12, color: '#9ca3af' }}>–</span>
            <input
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              style={priceInput}
              placeholder="200"
            />
          </div>
        </div>
      </div>

      {/* Count */}
      {!isLoading && (
        <div style={{ fontSize: 12, color: '#9ca3af', padding: '6px 20px' }}>
          {total} result{total !== 1 ? 's' : ''}
        </div>
      )}

      {/* Table */}
      {isLoading && (
        <div style={emptyState}>
          <div style={spinner} />
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 12 }}>Loading targets…</p>
        </div>
      )}

      {isError && (
        <div style={errBox}>Failed to load card targets.</div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div style={emptyState}>
          <p style={{ color: '#6b7280', fontSize: 13 }}>
            No targets found. Try a different view or run a recalculation.
          </p>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {['#', 'Card', 'Player', 'Buy', 'Target', 'Current', '7d', '14d', '30d', 'Score', 'Strength', 'Strategy', 'Why'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.card}-${row.recommended_grade}`}
                  onClick={() => setSelected(row)}
                  style={trStyle(selected?.card === row.card && selected?.recommended_grade === row.recommended_grade)}
                >
                  <td style={{ ...tdStyle, color: '#9ca3af', width: 32 }}>{row.rank}</td>
                  <td style={{ ...tdStyle, maxWidth: 220, fontWeight: 500 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.card}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: '#6b7280', maxWidth: 120 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.player_name || '—'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.recommended_grade}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#059669', whiteSpace: 'nowrap' }}>{fmt(row.target_buy_price)}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: currentPriceColor(row) }}>{fmt(row.current_price)}</td>
                  <td style={tdStyle}>{fmt(row.avg_7d)}</td>
                  <td style={tdStyle}>{fmt(row.avg_14d)}</td>
                  <td style={tdStyle}>{fmt(row.avg_30d)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: scoreColor(row.scores.target_score) }}>
                    {fmtScore(row.scores.target_score)}
                  </td>
                  <td style={tdStyle}><StrengthBadge strength={row.recommendation_strength} /></td>
                  <td style={{ ...tdStyle, fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {row.strategy_type ?? '—'}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 200, color: '#374151' }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {row.justification[0] ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <DetailPanel row={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function currentPriceColor(row: CardTargetResult): string {
  if (row.current_price == null || row.target_buy_price == null) return '#374151'
  return row.current_price <= row.target_buy_price ? '#059669' : '#dc2626'
}

function scoreColor(score: number): string {
  if (score >= 80) return '#166534'
  if (score >= 70) return '#1e40af'
  if (score >= 60) return '#854d0e'
  return '#6b7280'
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Styles ─────────────────────────────────────────────────────────────────

const pageHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '20px 20px 12px',
}

const recalcBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#fff',
  background: '#E8593C',
  border: 'none',
  borderRadius: 6,
  padding: '7px 14px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}


const tabRow: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  padding: '0 20px',
  borderBottom: '1px solid #e5e7eb',
}

const filterBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  padding: '10px 20px',
  borderBottom: '1px solid #f3f4f6',
}

const viewTabs: React.CSSProperties = {
  display: 'flex',
  gap: 2,
}

const filterRight: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
}

const searchInput: React.CSSProperties = {
  fontSize: 12,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '5px 10px',
  width: 200,
  outline: 'none',
}

const priceRange: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

const priceInput: React.CSSProperties = {
  width: 54,
  fontSize: 12,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '5px 6px',
  outline: 'none',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 12,
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: '#6b7280',
  background: '#f9fafb',
  borderBottom: '1px solid #e5e7eb',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '9px 10px',
  borderBottom: '1px solid #f3f4f6',
  fontSize: 12,
  color: '#1a1a18',
  verticalAlign: 'middle',
}

const emptyState: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '60px 24px',
}

const spinner: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '3px solid #e5e7eb',
  borderTopColor: '#E8593C',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
}

const errBox: React.CSSProperties = {
  margin: '20px',
  padding: '12px 16px',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: 6,
  fontSize: 13,
  color: '#991b1b',
}

// Detail panel
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.35)',
  zIndex: 200,
  display: 'flex',
  justifyContent: 'flex-end',
}

const panelStyle: React.CSSProperties = {
  width: 420,
  maxWidth: '100vw',
  height: '100vh',
  overflowY: 'auto',
  background: '#fff',
  boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
  display: 'flex',
  flexDirection: 'column',
}

const panelHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '16px 16px 12px',
  borderBottom: '1px solid #e5e7eb',
  position: 'sticky',
  top: 0,
  background: '#fff',
  zIndex: 1,
}

const panelBody: React.CSSProperties = {
  padding: '12px 16px 32px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 16,
  color: '#9ca3af',
  cursor: 'pointer',
  padding: '2px 6px',
  lineHeight: 1,
}

const sectionBox: React.CSSProperties = {
  background: '#f9fafb',
  borderRadius: 8,
  padding: '10px 12px',
  border: '1px solid #f3f4f6',
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const scoreGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 6,
  marginTop: 8,
}

const scoreItem: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '8px 10px',
  textAlign: 'center',
}

const signalGrid: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginTop: 6,
}

const signalItem: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 4,
  padding: '3px 8px',
}

function sportTab(active: boolean): React.CSSProperties {
  return {
    padding: '9px 16px',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? '#E8593C' : '#6b7280',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #E8593C' : '2px solid transparent',
    cursor: 'pointer',
    marginBottom: -1,
  }
}

function viewTab(active: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    color: active ? '#1a1a18' : '#6b7280',
    background: active ? '#f3f4f6' : 'none',
    border: '1px solid',
    borderColor: active ? '#d1d5db' : 'transparent',
    borderRadius: 6,
    cursor: 'pointer',
  }
}

function trStyle(active: boolean): React.CSSProperties {
  return {
    cursor: 'pointer',
    background: active ? '#eff6ff' : 'transparent',
    transition: 'background 0.1s',
  }
}
