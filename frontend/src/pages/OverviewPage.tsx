import { useState } from 'react'

// ─── Buy Decision Guide ──────────────────────────────────────────────────────

interface CriteriaItem {
  icon: '✓' | '✗' | '!'
  text: string
}

interface GradeColumn {
  title: string
  sub: string
  variant: 'raw' | 'psa9' | 'psa10'
  criteria: CriteriaItem[]
}

const GRADE_COLUMNS: GradeColumn[] = [
  {
    title: 'Buy Raw',
    sub: 'Grade it yourself',
    variant: 'raw',
    criteria: [
      { icon: '✓', text: 'Raw <40% of PSA 9 value' },
      { icon: '✓', text: 'Card near-perfect condition' },
      { icon: '✓', text: 'Sell window 3+ months out' },
      { icon: '!', text: '40–60% ratio — must be perfect' },
      { icon: '✗', text: 'Raw >60% of PSA 9 — buy the slab' },
      { icon: '✗', text: 'Sell window <10 weeks out' },
    ],
  },
  {
    title: 'Buy PSA 9',
    sub: 'Football default',
    variant: 'psa9',
    criteria: [
      { icon: '✓', text: '10/9 ratio under 2×' },
      { icon: '✓', text: 'Ratio compressing over time' },
      { icon: '✓', text: 'Pop growing fast' },
      { icon: '✓', text: 'Need quick liquidity' },
      { icon: '✓', text: 'Both rising but 9 rising faster' },
      { icon: '!', text: 'Both falling — 10s drop harder' },
    ],
  },
  {
    title: 'Buy PSA 10',
    sub: 'Basketball default',
    variant: 'psa10',
    criteria: [
      { icon: '✓', text: 'Ratio expanding + pop slow' },
      { icon: '✓', text: 'Both rising, 10 rising faster' },
      { icon: '✓', text: 'Ratio 5×+ with gem <20%' },
      { icon: '✓', text: 'Card is $300+ value' },
      { icon: '!', text: 'Ratio expanding + pop fast = fakeout' },
      { icon: '✗', text: 'Ratio 2–3× with fast-growing pop' },
    ],
  },
]

const ICON_COLOR: Record<string, string> = {
  '✓': '#16a34a',
  '✗': '#dc2626',
  '!': '#d97706',
}

const COL_BORDER: Record<GradeColumn['variant'], string> = {
  raw:   '#94a3b8',
  psa9:  '#2563eb',
  psa10: '#d97706',
}

function BuyDecisionGuide() {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 12 }}>
        What to buy — raw, PSA 9, or PSA 10?
      </div>

      {/* Sport defaults row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#faeeda', border: '1px solid #f5d0a9', borderRadius: 8, padding: '8px 14px' }}>
          <span style={{ fontWeight: 700, color: '#92400e' }}>🏈 Football</span>
          <span style={{ fontSize: 12, color: '#92400e', opacity: 0.7 }}>lower gem rates</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginLeft: 4 }}>Default: PSA 9</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#e6f1fb', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 14px' }}>
          <span style={{ fontWeight: 700, color: '#1e40af' }}>🏀 Basketball</span>
          <span style={{ fontSize: 12, color: '#1e40af', opacity: 0.7 }}>deeper 10 market</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1e40af', marginLeft: 4 }}>Default: PSA 10</span>
        </div>
      </div>

      {/* 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {GRADE_COLUMNS.map(col => (
          <div key={col.variant} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, borderTop: `3px solid ${COL_BORDER[col.variant]}`, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{col.title}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{col.sub}</div>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {col.criteria.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
                  <span style={{ color: ICON_COLOR[item.icon], fontWeight: 700, flexShrink: 0, width: 14 }}>{item.icon}</span>
                  <span style={{ color: '#334155' }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── PSA 9 vs 10 Reference ──────────────────────────────────────────────────

interface RatioRow {
  trend: string
  pop: string
  meaning: string
  verdict: 'psa9' | 'psa10' | 'avoid'
}

const RATIO_ROWS: RatioRow[] = [
  { trend: 'Expanding',   pop: 'Slow', meaning: 'Genuine scarcity — premium is real',          verdict: 'psa10' },
  { trend: 'Expanding',   pop: 'Fast', meaning: 'Fakeout — supply will catch up',               verdict: 'psa9'  },
  { trend: 'Compressing', pop: 'Any',  meaning: '10 premium fading — market saturating',        verdict: 'psa9'  },
  { trend: 'Both rising', pop: 'Slow', meaning: '10 rising faster = momentum + scarcity',       verdict: 'psa10' },
  { trend: 'Both rising', pop: 'Fast', meaning: '9 rising faster = value hunters moving down',  verdict: 'psa9'  },
  { trend: 'Both falling',pop: 'Any',  meaning: '10s lose liquidity first in corrections',      verdict: 'psa9'  },
  { trend: 'Both cooling',pop: 'Fast', meaning: 'Both grades losing value — exit or pass',      verdict: 'avoid' },
]

const VERDICT_PILL: Record<RatioRow['verdict'], { label: string; bg: string; color: string }> = {
  psa10: { label: 'Buy PSA 10', bg: '#fef3c7', color: '#b45309' },
  psa9:  { label: 'Buy PSA 9',  bg: '#dbeafe', color: '#1d4ed8' },
  avoid: { label: 'Avoid both', bg: '#f1f5f9', color: '#475569' },
}

interface MatrixCell {
  label: string
  note: string
  bg: string
  color: string
}

const MATRIX: { rowLabel: string; rowSub: string; cells: MatrixCell[] }[] = [
  {
    rowLabel: 'Mult <1.5×', rowSub: 'thin premium',
    cells: [
      { label: 'Buy PSA 9',  note: 'Premium too thin',     bg: '#dbeafe', color: '#1d4ed8' },
      { label: 'Buy PSA 9',  note: 'No reason to pay up',  bg: '#dbeafe', color: '#1d4ed8' },
      { label: 'Buy PSA 9',  note: 'Easy gem, thin premium', bg: '#dbeafe', color: '#1d4ed8' },
    ],
  },
  {
    rowLabel: 'Mult 1.5–3.5×', rowSub: 'healthy premium',
    cells: [
      { label: 'Strong PSA 10', note: 'Low pop, durable premium', bg: '#dcfce7', color: '#15803d' },
      { label: 'Run EV model',  note: 'Use trend signals',        bg: '#fef9c3', color: '#854d0e' },
      { label: 'Buy PSA 9',     note: 'High gem will compress 10', bg: '#dbeafe', color: '#1d4ed8' },
    ],
  },
  {
    rowLabel: 'Mult >3.5×', rowSub: 'large premium',
    cells: [
      { label: 'PSA 10 — scarcity real', note: 'Low pop + high premium',  bg: '#fef3c7', color: '#b45309' },
      { label: 'Caution — fragile',      note: 'Pop could grow fast',      bg: '#fee2e2', color: '#b91c1c' },
      { label: 'Avoid PSA 10',           note: 'High gem floods supply',   bg: '#f1f5f9', color: '#475569' },
    ],
  },
]

const GEM_COLS = ['Gem <15%\n10s are scarce', 'Gem 15–35%\nmoderate supply', 'Gem >35%\n10s are common']

function PsaReference() {
  const [tab, setTab] = useState<'trend' | 'matrix'>('trend')

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 12 }}>
        PSA 9 vs 10 reference
      </div>

      {/* Tab toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['trend', 'matrix'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pill-btn${tab === t ? ' active' : ''}`}
          >
            {t === 'trend' ? 'Ratio trend signals' : 'Gem × multiplier matrix'}
          </button>
        ))}
      </div>

      {tab === 'trend' && (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>RATIO TREND</th>
                <th>POP REPORT</th>
                <th>WHAT IT MEANS</th>
                <th>VERDICT</th>
              </tr>
            </thead>
            <tbody>
              {RATIO_ROWS.map((row, i) => {
                const v = VERDICT_PILL[row.verdict]
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{row.trend}</td>
                    <td style={{ color: '#64748b' }}>{row.pop}</td>
                    <td style={{ color: '#334155' }}>{row.meaning}</td>
                    <td>
                      <span style={{ background: v.bg, color: v.color, borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {v.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'matrix' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b', fontWeight: 600 }}></th>
                {GEM_COLS.map((col, i) => (
                  <th key={i} style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b', fontWeight: 600, whiteSpace: 'pre-line' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row, ri) => (
                <tr key={ri}>
                  <td style={{ padding: '12px 14px', border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    <div style={{ color: '#1e293b' }}>{row.rowLabel}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{row.rowSub}</div>
                  </td>
                  {row.cells.map((cell, ci) => (
                    <td key={ci} style={{ padding: '12px 14px', border: '1px solid #e2e8f0', textAlign: 'center', verticalAlign: 'middle' }}>
                      <span style={{ background: cell.bg, color: cell.color, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600, display: 'inline-block', marginBottom: 4 }}>
                        {cell.label}
                      </span>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{cell.note}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ─── Selling Window Timeline ─────────────────────────────────────────────────

interface TimelineEvent {
  event: string
  timing: string
  action: string
  status: 'past' | 'now' | 'future'
}

const TIMELINE: TimelineEvent[] = [
  {
    event: 'NBA Playoffs + NFL Draft',
    timing: 'Apr–May 2026',
    action: 'Buy graded now to sell into these windows — grading too slow to catch this',
    status: 'past',
  },
  {
    event: 'FIFA World Cup',
    timing: 'Jun 11 – Jul 19 · ~10 weeks out',
    action: 'Buy now — list late May, peak sell June–July',
    status: 'now',
  },
  {
    event: 'NFL Training Camp + Season',
    timing: 'Jul–Sep 2026',
    action: 'Raw-to-grade optimal window — cards return just in time',
    status: 'future',
  },
  {
    event: 'NBA Season Start',
    timing: 'Oct 2026',
    action: 'Raw-to-grade cards ready — list into opening week hype',
    status: 'future',
  },
  {
    event: 'NFL Playoffs + NBA All-Star',
    timing: 'Jan–Feb 2027',
    action: 'Sell winners and risers',
    status: 'future',
  },
]

const DOT_COLOR: Record<TimelineEvent['status'], string> = {
  past:   '#94a3b8',
  now:    '#16a34a',
  future: '#2563eb',
}

const ACTION_COLOR: Record<TimelineEvent['status'], string> = {
  past:   '#94a3b8',
  now:    '#15803d',
  future: '#1e40af',
}

function SellingWindow() {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 16 }}>
        Selling window — cards graded now return June–Aug
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {TIMELINE.map((ev, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, paddingBottom: 20, position: 'relative' }}>
            {/* Dot + vertical line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: DOT_COLOR[ev.status],
                flexShrink: 0, marginTop: 3,
              }} />
              {i < TIMELINE.length - 1 && (
                <div style={{ width: 2, flex: 1, background: '#e2e8f0', marginTop: 4 }} />
              )}
            </div>

            {/* Content */}
            <div style={{ paddingBottom: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{ev.event}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{ev.timing}</div>
              <div style={{ fontSize: 13, color: ACTION_COLOR[ev.status], marginTop: 4 }}>{ev.action}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function OverviewPage() {
  return (
    <div className="page-content">
      <BuyDecisionGuide />
      <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '8px 0 32px' }} />
      <PsaReference />
      <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '8px 0 32px' }} />
      <SellingWindow />
    </div>
  )
}
