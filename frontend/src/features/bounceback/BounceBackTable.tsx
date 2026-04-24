import { useState } from 'react'
import { useBootstrap } from '../targets/useBootstrap'
import type { BounceBackMetrics, Target } from '../../lib/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(val: number | null, prefix = '$'): string {
  if (val === null || val === undefined) return '—'
  return `${prefix}${val.toLocaleString()}`
}

function scorePillStyle(score: number | null): React.CSSProperties {
  if (score === null) return { color: '#94a3b8' }
  if (score >= 4) return { background: '#dcfce7', color: '#15803d', borderRadius: 999, padding: '2px 10px', fontWeight: 700 }
  if (score >= 3) return { background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '2px 10px', fontWeight: 700 }
  return { background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '2px 10px', fontWeight: 700 }
}

interface Signal { key: keyof BounceBackMetrics; label: string }
const SIGNALS: Signal[] = [
  { key: 's1_cheap',         label: 'S1' },
  { key: 's2_stable',        label: 'S2' },
  { key: 's3_not_priced_in', label: 'S3' },
  { key: 's4_volume',        label: 'S4' },
  { key: 's5_no_spike',      label: 'S5' },
]

function SignalDots({ bb }: { bb: BounceBackMetrics }) {
  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 }}>
      {SIGNALS.map(s => {
        const val = bb[s.key] as boolean
        const color = val ? '#16a34a' : '#dc2626'
        return (
          <span key={s.key} style={{ fontSize: 11, color, whiteSpace: 'nowrap' }}>
            {s.label}<span style={{ fontSize: 9 }}>{'●'}</span>
          </span>
        )
      })}
    </div>
  )
}

// ─── Scoring Model Panel ─────────────────────────────────────────────────────

const SIGNAL_ROWS = [
  { id: 'S1*', name: 'Cheap vs norm',             rule: '30d avg ≥15% below 180d avg',           purpose: 'Genuinely undervalued vs established range, not just below a one-time spike' },
  { id: 'S2',  name: 'Stabilizing',               rule: '14d avg ≥ 30d avg (within 3% tolerance)', purpose: 'Price has stopped falling and is leveling off or recovering' },
  { id: 'S3',  name: 'Recovery not priced in',    rule: '7d avg < 90% of 180d avg',               purpose: "The bounce hasn't already happened — room left to run" },
  { id: 'S4',  name: 'Market still active',        rule: '30d volume ≥ 25% of monthly 360d pace',  purpose: "Real buyers still transacting; card hasn't gone dead" },
  { id: 'S5',  name: 'No spike distortion',        rule: '180d max < 3× the 180d average',         purpose: 'High ceiling is real, not an outlier auction inflating the dip calculation' },
]

function ScoringModelPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 20, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left', padding: '10px 14px',
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          color: '#2563eb', fontWeight: 600, fontSize: 13,
        }}
      >
        📊 5-Signal Bounce-Back Scoring Model
        <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 12 }}>
          {open ? '▾ click to collapse' : '▸ click to expand'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 16px', borderTop: '1px solid #e2e8f0' }}>
          <p style={{ margin: '12px 0 10px', fontSize: 13, color: '#334155' }}>
            A card qualifies if it scores <strong>3 or more signals</strong> and{' '}
            <strong style={{ color: '#dc2626' }}>S1 is mandatory</strong> regardless of total score.
          </p>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ minWidth: 160 }}>SIGNAL</th>
                  <th>RULE</th>
                  <th>PURPOSE</th>
                </tr>
              </thead>
              <tbody>
                {SIGNAL_ROWS.map(row => (
                  <tr key={row.id}>
                    <td>
                      <strong style={{ color: row.id === 'S1*' ? '#dc2626' : '#1e293b' }}>{row.id}</strong>
                    </td>
                    <td style={{ fontWeight: 600 }}>{row.name}</td>
                    <td style={{ color: '#64748b' }}>{row.rule}</td>
                    <td style={{ color: '#64748b' }}>{row.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#94a3b8' }}>
            Min threshold: 3/5 (S1 + any two others) · S3 is the recovery filter — a card can look like a great dip on 30d data but already be fully recovered. Always check 7d vs 180d avg before acting.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Table row ───────────────────────────────────────────────────────────────

function BounceBackRow({ target, index }: { target: Target; index: number }) {
  const bb = target.bounce_back_metrics
  const score = bb?.score ?? null

  return (
    <tr>
      <td style={{ color: '#94a3b8', width: 36 }}>{index + 1}</td>

      {/* Card */}
      <td style={{ fontWeight: 500, minWidth: 160 }}>
        <div style={{ whiteSpace: 'nowrap' }}>
          {target.card_name}
          {target.sport === 'football'   && ' 🏈'}
          {target.sport === 'basketball' && ' 🏀'}
          {target.is_new && (
            <span className="pill pill-new" style={{ marginLeft: 6, fontSize: 10 }}>NEW</span>
          )}
        </div>
        {target.grade && (
          <div style={{ marginTop: 3 }}>
            <span className={gradePillClass(target.grade)} style={{ fontSize: 11 }}>{target.grade}</span>
          </div>
        )}
      </td>

      {/* Buy + Sell */}
      <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
        <span style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(target.target_price)}</span>
        <span style={{ color: '#94a3b8', fontSize: 11 }}> → </span>
        <span style={{ color: '#2563eb', fontWeight: 600 }}>{fmt(target.sell_at)}</span>
        {target.max_price !== null && (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>max {fmt(target.max_price)}</div>
        )}
      </td>

      {/* Trend */}
      <td style={{ textAlign: 'center' }}>
        {target.trend_pct !== null ? (
          <span style={{ color: target.trend_pct >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
            {target.trend_pct > 0 ? '+' : ''}{target.trend_pct}%
          </span>
        ) : '—'}
      </td>

      {/* Vol */}
      <td style={{ textAlign: 'center', fontSize: 13 }}>
        {target.vol ?? <span style={{ color: '#94a3b8' }}>—</span>}
      </td>

      {/* Price Avgs — not in current model, sourced from trend CSV pipeline */}
      <td style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>—</td>

      {/* Score */}
      <td style={{ textAlign: 'center', minWidth: 90 }}>
        <span style={{ fontSize: 15, ...scorePillStyle(score) }}>
          {score !== null ? `${score}/5` : '—'}
        </span>
        {bb && <SignalDots bb={bb} />}
      </td>

      {/* Rationale */}
      <td style={{ minWidth: 160, fontSize: 12, color: '#475569' }}>
        {target.rationale ?? '—'}
      </td>
    </tr>
  )
}

function gradePillClass(grade: string | null): string {
  if (!grade) return 'pill pill-raw'
  const g = grade.toUpperCase()
  if (g.includes('PSA 10') || g.includes('PSA10')) return 'pill pill-psa10'
  if (g.includes('PSA 9')  || g.includes('PSA9'))  return 'pill pill-psa9'
  return 'pill pill-raw'
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BounceBackTable() {
  const { data, isLoading, isError, error } = useBootstrap()
  const [scoringOpen, setScoringOpen] = useState(false)

  if (isLoading) return <p style={{ color: '#94a3b8' }}>Loading targets…</p>
  if (isError) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return <p style={{ color: '#dc2626' }}>Failed to load: {msg}</p>
  }

  const targets = data?.data.targets ?? []
  const rows = targets
    .filter(t => t.category === 'bounce_back')
    .sort((a, b) => a.rank - b.rank)

  const trends = rows.map(t => t.trend_pct ?? 0)
  const avgDip = rows.length > 0
    ? Math.round(trends.reduce((s, v) => s + v, 0) / trends.length)
    : 0
  const qualCount = rows.filter(t => {
    const bb = t.bounce_back_metrics
    return bb && (bb.score ?? 0) >= 3 && bb.s1_cheap
  }).length
  const newCount = rows.filter(t => t.is_new).length

  const kpis = [
    { label: 'Total Targets', value: rows.length,              sub: 'Cards in dip',       color: '#2563eb' },
    { label: 'Qualify (≥3/5)', value: qualCount,               sub: 'S1 + 2 signals met', color: '#16a34a' },
    { label: 'Avg Dip',        value: `${avgDip}%`,            sub: '30d trend',           color: '#dc2626' },
    { label: 'New This Week',  value: newCount,                sub: 'Fresh additions',     color: '#d97706' },
  ]

  return (
    <div>
      {/* Scoring model panel */}
      <ScoringModelPanel open={scoringOpen} onToggle={() => setScoringOpen(o => !o)} />

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

      {rows.length === 0 ? (
        <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No bounce-back targets available.</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>CARD</th>
                <th>BUY + SELL</th>
                <th>TREND</th>
                <th>VOL</th>
                <th>PRICE AVGS</th>
                <th>SCORE</th>
                <th>RATIONALE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <BounceBackRow key={t.id} target={t} index={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
