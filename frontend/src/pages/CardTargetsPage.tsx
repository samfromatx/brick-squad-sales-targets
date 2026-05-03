import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { CardTargetResult, SupportedTargetSport } from '../lib/types'

// ── Grade badge ────────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: string }) {
  const g = grade.toUpperCase()
  let bg = '#fefce8', color = '#854d0e', border = '#fde047'
  if (g.includes('PSA 10')) { bg = '#f0fdf4'; color = '#15803d'; border = '#86efac' }
  else if (g.includes('PSA 9')) { bg = '#eff6ff'; color = '#1d4ed8'; border = '#93c5fd' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
      background: bg, color, border: `1px solid ${border}`, whiteSpace: 'nowrap',
    }}>
      {grade}
    </span>
  )
}

// ── Strength badge ─────────────────────────────────────────────────────────

const STRENGTH_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  'Strong Buy Target':   { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  'Buy Target':          { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  'Value Target':        { bg: '#ede9fe', color: '#6d28d9', border: '#c4b5fd' },
  'Watchlist Target':    { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
  'Avoid / Overheated':  { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
}

function StrengthBadge({ strength }: { strength: string }) {
  const s = STRENGTH_STYLE[strength] ?? { bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap', display: 'inline-block',
    }}>
      {strength}
    </span>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined) {
  if (v == null) return '—'
  return `$${Number(v).toFixed(0)}`
}

function scoreColor(score: number): string {
  if (score >= 75) return '#15803d'
  if (score >= 65) return '#1d4ed8'
  if (score >= 55) return '#b45309'
  return '#6b7280'
}

function currentPriceColor(row: CardTargetResult): string {
  if (row.current_price == null || row.target_buy_price == null) return 'var(--ink-2)'
  return row.current_price <= row.target_buy_price ? '#15803d' : '#dc2626'
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Score bar ─────────────────────────────────────────────────────────────

function ScoreBar({ label, value, max, color = '#1d4ed8', negative = false }: {
  label: string; value: number; max: number; color?: string; negative?: boolean
}) {
  const pct = Math.min(Math.abs(value) / max * 100, 100)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: negative ? '#dc2626' : 'var(--ink-3)', fontWeight: 500 }}>
          {label}{negative ? ' (penalty)' : ''}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: negative ? '#dc2626' : color }}>
          {negative ? '-' : ''}{value.toFixed(1)}<span style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 400 }}>/{max}</span>
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: negative ? '#fca5a5' : color,
          borderRadius: 3, transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  )
}

// ── Detail panel (side drawer) ─────────────────────────────────────────────

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
  const totalScore = s.target_score

  return (
    <div style={overlayStyle}>
      <div ref={ref} style={panelStyle}>
        {/* Header */}
        <div style={panelHeader}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', lineHeight: 1.3, marginBottom: 4 }}>
              {row.card}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{row.player_name}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>·</span>
              <GradeBadge grade={row.recommended_grade} />
              <StrengthBadge strength={row.recommendation_strength} />
            </div>
          </div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <div style={panelBody}>
          {/* Score summary */}
          <div style={sectionBox}>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: scoreColor(totalScore), lineHeight: 1 }}>
                  {totalScore.toFixed(0)}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 2 }}>
                  Score / 100
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <ScoreBar label="Market" value={s.market_score} max={30} color="#1d4ed8" />
                <ScoreBar label="Value"  value={s.value_score}  max={35} color="#15803d" />
                <ScoreBar label="Timing" value={s.timing_score} max={15} color="#7c3aed" />
                <ScoreBar label="Player" value={s.player_score} max={20} color="#b45309" />
                <ScoreBar label="Risk"   value={s.risk_penalty} max={30} negative />
              </div>
            </div>
          </div>

          {/* Price targets */}
          <div style={sectionBox}>
            <div style={sectionLabel}>Price Targets</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { label: 'Buy target', value: fmt(row.target_buy_price), highlight: true },
                { label: 'Current',   value: fmt(row.current_price),     valueColor: currentPriceColor(row) },
                { label: '30d avg',   value: fmt(row.avg_30d) },
              ].map(({ label, value, highlight, valueColor }) => (
                <div key={label} style={{
                  background: highlight ? '#f0fdf4' : 'var(--bg-2)',
                  border: `1px solid ${highlight ? '#86efac' : 'var(--border)'}`,
                  borderRadius: 6, padding: '8px 10px',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: valueColor ?? 'var(--ink)' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Price history */}
          <div style={sectionBox}>
            <div style={sectionLabel}>Price History</div>
            <div style={{ display: 'flex', gap: 0, background: 'var(--bg-2)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              {([['7d', row.avg_7d], ['14d', row.avg_14d], ['30d', row.avg_30d], ['90d', row.avg_90d], ['180d', row.avg_180d]] as [string, number | null][]).map(([label, val], i) => (
                <div key={label} style={{
                  flex: 1, textAlign: 'center', padding: '8px 4px',
                  borderRight: i < 4 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{fmt(val)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 30d by grade */}
          <div style={sectionBox}>
            <div style={sectionLabel}>30d Avg by Grade</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['Raw', row.raw_avg_30d], ['PSA 9', row.psa9_avg_30d], ['PSA 10', row.psa10_avg_30d]] as [string, number | null][]).map(([grade, val]) => {
                const isRec = row.recommended_grade === grade
                return (
                  <div key={grade} style={{
                    flex: 1, textAlign: 'center', padding: '8px',
                    background: isRec ? '#eff6ff' : 'var(--bg-2)',
                    border: `1px solid ${isRec ? '#93c5fd' : 'var(--border)'}`,
                    borderRadius: 6,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 3 }}>{grade}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{fmt(val)}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Market signals */}
          <div style={sectionBox}>
            <div style={sectionLabel}>Market Signals</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {([
                ['Liquidity',   row.liquidity_label],
                ['Trend',       row.trend_label],
                ['Volume',      row.volume_signal],
                ['Volatility',  row.volatility_label],
                ['Confidence',  row.market_confidence],
                ['90d sales',   row.total_90d_sales != null ? String(row.total_90d_sales) : null],
              ] as [string, string | null][]).filter(([, v]) => v).map(([label, val]) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '6px 8px', background: 'var(--bg-2)',
                  borderRadius: 5, border: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Why this card */}
          {row.justification.length > 0 && (
            <div style={sectionBox}>
              <div style={sectionLabel}>Why this card</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {row.justification.map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    <span style={{ color: '#15803d', flexShrink: 0, fontWeight: 700 }}>→</span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {row.warnings.length > 0 && (
            <div style={sectionBox}>
              <div style={sectionLabel}>Warnings</div>
              {row.warnings.map((w, i) => (
                <div key={i} style={{
                  fontSize: 12, padding: '7px 10px', borderRadius: 5, lineHeight: 1.5,
                  background: '#fef9c3', border: '1px solid #fde047', color: '#854d0e',
                  borderLeft: '3px solid #f59e0b', marginTop: 4,
                }}>
                  <strong>{w.code}:</strong> {w.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Column sort ────────────────────────────────────────────────────────────

type SortKey = 'rank' | 'card' | 'player' | 'grade' | 'target' | 'current' | 'avg30' | 'score' | 'strength'

const STRENGTH_ORDER: Record<string, number> = {
  'Strong Buy Target': 0, 'Buy Target': 1, 'Value Target': 2, 'Watchlist Target': 3, 'Avoid / Overheated': 4,
}

function sortRows(rows: CardTargetResult[], key: SortKey | null, dir: 'asc' | 'desc'): CardTargetResult[] {
  if (!key) return rows
  return [...rows].sort((a, b) => {
    let av: string | number, bv: string | number
    switch (key) {
      case 'rank':     av = a.rank;                                     bv = b.rank;                                     break
      case 'card':     av = a.card.toLowerCase();                       bv = b.card.toLowerCase();                       break
      case 'player':   av = (a.player_name ?? '').toLowerCase();        bv = (b.player_name ?? '').toLowerCase();        break
      case 'grade':    av = a.recommended_grade;                        bv = b.recommended_grade;                        break
      case 'target':   av = a.target_buy_price ?? -Infinity;            bv = b.target_buy_price ?? -Infinity;            break
      case 'current':  av = a.current_price ?? -Infinity;               bv = b.current_price ?? -Infinity;               break
      case 'avg30':    av = a.avg_30d ?? -Infinity;                     bv = b.avg_30d ?? -Infinity;                     break
      case 'score':    av = a.scores.target_score;                      bv = b.scores.target_score;                      break
      case 'strength': av = STRENGTH_ORDER[a.recommendation_strength] ?? 9; bv = STRENGTH_ORDER[b.recommendation_strength] ?? 9; break
      default:         return 0
    }
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return dir === 'asc' ? cmp : -cmp
  })
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span style={{ marginLeft: 3, fontSize: 9, color: 'var(--border-2)', opacity: 0.8 }}>↕</span>
  return <span style={{ marginLeft: 3, fontSize: 9, opacity: 0.55 }}>{dir === 'asc' ? '▲' : '▼'}</span>
}

// ── Main page ──────────────────────────────────────────────────────────────

type ViewTab = 'buy' | 'watchlist' | 'overheated'

const COL_HEADERS: { label: string; key: SortKey; width?: number }[] = [
  { label: '#',        key: 'rank',     width: 36 },
  { label: 'Card',     key: 'card' },
  { label: 'Player',   key: 'player' },
  { label: 'Grade',    key: 'grade' },
  { label: 'Target',   key: 'target' },
  { label: 'Current',  key: 'current' },
  { label: '30d',      key: 'avg30' },
  { label: 'Score',    key: 'score' },
  { label: 'Strength', key: 'strength' },
]

export function CardTargetsPage() {
  const [sport, setSport]     = useState<SupportedTargetSport>('football')
  const [view, setView]       = useState<ViewTab>('buy')
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState<CardTargetResult | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const debouncedSearch = useDebounce(search, 300)

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['card-targets', sport, view, debouncedSearch],
    queryFn: () => api.getCardTargets({
      sport,
      view,
      q: debouncedSearch || undefined,
      limit: 100,
    }),
  })

  const rawRows = data?.data ?? []
  const rows = sortRows(rawRows, sortKey, sortDir)
  const total = data?.total ?? 0

  const tdBase: React.CSSProperties = {
    padding: '9px 12px',
    color: 'var(--ink-2)',
    borderBottom: '1px solid var(--border)',
    fontSize: 13,
    verticalAlign: 'middle',
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.5px' }}>Card Targets</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>
            Risk-adjusted buy opportunities · ranked by composite score
          </p>
        </div>
        <a
          href="https://github.com/samfromatx/brick-squad-sales-targets/actions/workflows/recalculate-card-targets.yml"
          style={{
            fontSize: 12, fontWeight: 600, color: '#fff',
            background: 'var(--brand)', borderRadius: 6, padding: '7px 14px',
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          ⟳ Recalculate
        </a>
      </div>

      {/* Sport tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
        {(['football', 'basketball'] as SupportedTargetSport[]).map((s) => (
          <button
            key={s}
            onClick={() => setSport(s)}
            style={{
              padding: '9px 16px', fontSize: 13,
              fontWeight: sport === s ? 600 : 400,
              color: sport === s ? 'var(--brand)' : 'var(--ink-3)',
              background: 'none', border: 'none',
              borderBottom: sport === s ? '2px solid var(--brand)' : '2px solid transparent',
              cursor: 'pointer', marginBottom: -1, transition: 'color 0.15s',
            }}
          >
            {s === 'football' ? '🏈 Football' : '🏀 Basketball'}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 8, padding: '10px 0', marginBottom: 4,
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['buy', 'Buy Targets'], ['watchlist', 'Watchlist'], ['overheated', 'Overheated']] as [ViewTab, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 12px', fontSize: 12, borderRadius: 6,
              fontWeight: view === v ? 600 : 400,
              color: view === v ? 'var(--ink)' : 'var(--ink-3)',
              background: view === v ? 'var(--bg-3)' : 'none',
              border: `1px solid ${view === v ? 'var(--border-2)' : 'transparent'}`,
              cursor: 'pointer',
            }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search card or player…"
            style={{
              fontSize: 12, padding: '6px 10px 6px 30px',
              border: '1px solid var(--border-2)',
              borderRadius: 6, outline: 'none', width: 220,
              background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'inherit',
            }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--ink-3)' }}>⌕</span>
        </div>
      </div>

      {/* Count */}
      {!isLoading && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 }}>
          {total} result{total !== 1 ? 's' : ''}
          <span style={{ marginLeft: 8, fontSize: 11 }}>· click row to open detail panel</span>
        </div>
      )}

      {/* Loading / error / empty */}
      {isLoading && (
        <div style={emptyState}>
          <div style={spinner} />
          <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 12 }}>Loading targets…</p>
        </div>
      )}
      {isError && (
        <div style={errBox}>Failed to load card targets.</div>
      )}
      {!isLoading && !isError && rows.length === 0 && (
        <div style={emptyState}>
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>No targets found. Try a different view or run a recalculation.</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && rows.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-2)' }}>
                {COL_HEADERS.map(({ label, key, width }) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    style={{
                      padding: '10px 14px', textAlign: 'left',
                      fontSize: 11, fontWeight: 600,
                      color: sortKey === key ? 'var(--ink-2)' : 'var(--ink-3)',
                      background: sortKey === key ? 'var(--bg-3)' : 'var(--bg-2)',
                      borderBottom: '1px solid var(--border)',
                      whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.4px',
                      cursor: 'pointer', userSelect: 'none',
                      ...(width ? { width } : {}),
                    }}
                  >
                    {label}<SortIcon active={sortKey === key} dir={sortDir} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const isSelected = selected?.card === row.card && selected?.recommended_grade === row.recommended_grade
                return (
                  <tr
                    key={`${row.card}-${row.recommended_grade}`}
                    onClick={() => setSelected(s => s?.card === row.card && s?.recommended_grade === row.recommended_grade ? null : row)}
                    style={{
                      cursor: 'pointer',
                      background: isSelected ? '#fdf5f3' : 'transparent',
                      transition: 'background 0.1s',
                      borderLeft: isSelected ? '3px solid var(--brand)' : '3px solid transparent',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-2)' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ ...tdBase, color: 'var(--ink-3)', fontSize: 12 }}>{row.rank}</td>
                    <td style={{ ...tdBase, fontWeight: 500, color: 'var(--ink)', maxWidth: 260 }}>
                      <div style={{ whiteSpace: 'normal', lineHeight: 1.35, wordBreak: 'break-word' }}>{row.card}</div>
                    </td>
                    <td style={{ ...tdBase, color: 'var(--ink-3)', maxWidth: 130 }}>
                      <div style={{ whiteSpace: 'normal', lineHeight: 1.35, fontSize: 12 }}>{row.player_name || '—'}</div>
                    </td>
                    <td style={tdBase}><GradeBadge grade={row.recommended_grade} /></td>
                    <td style={{ ...tdBase, fontWeight: 700, color: '#15803d' }}>{fmt(row.target_buy_price)}</td>
                    <td style={{ ...tdBase, fontWeight: 600, color: currentPriceColor(row) }}>{fmt(row.current_price)}</td>
                    <td style={{ ...tdBase, color: 'var(--ink-2)' }}>{fmt(row.avg_30d)}</td>
                    <td style={{ ...tdBase, fontWeight: 700, color: scoreColor(row.scores.target_score) }}>
                      {row.scores.target_score.toFixed(1)}
                    </td>
                    <td style={tdBase}><StrengthBadge strength={row.recommendation_strength} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && <DetailPanel row={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const emptyState: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', padding: '60px 24px',
}

const spinner: React.CSSProperties = {
  width: 28, height: 28,
  border: '3px solid var(--border)',
  borderTopColor: 'var(--brand)',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
}

const errBox: React.CSSProperties = {
  margin: '20px', padding: '12px 16px',
  background: '#fef2f2', border: '1px solid #fecaca',
  borderRadius: 6, fontSize: 13, color: '#991b1b',
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.28)',
  zIndex: 200, display: 'flex', justifyContent: 'flex-end',
}

const panelStyle: React.CSSProperties = {
  width: 440, maxWidth: '100vw', height: '100vh',
  overflowY: 'auto', background: 'var(--bg)',
  boxShadow: '-2px 0 32px rgba(0,0,0,0.14)',
  display: 'flex', flexDirection: 'column',
}

const panelHeader: React.CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'flex-start',
  padding: '16px', borderBottom: '1px solid var(--border)',
  position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1,
}

const panelBody: React.CSSProperties = {
  padding: '16px', display: 'flex', flexDirection: 'column', gap: 16,
}

const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', fontSize: 14,
  color: 'var(--ink-3)', cursor: 'pointer', padding: '2px 6px',
  flexShrink: 0, lineHeight: 1, borderRadius: 4, fontFamily: 'inherit',
}

const sectionBox: React.CSSProperties = {
  background: 'var(--bg-2)', borderRadius: 8,
  padding: '12px 14px', border: '1px solid var(--border)',
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--ink-3)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
}
