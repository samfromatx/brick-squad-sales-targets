import type {
  AnalysisWarning,
  BounceBackSignals,
  EvModel,
  TrendAnalysisResponse,
} from '../../lib/types'

interface Props {
  card: string
  sport: string
  data: TrendAnalysisResponse
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, prefix = '$'): string {
  if (v == null) return '—'
  return `${prefix}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function fmtDec(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  return Number(v).toFixed(decimals)
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${(Number(v) * 100).toFixed(1)}%`
}

function trendColor(direction: string): string {
  if (direction.includes('uptrend')) return '#16a34a'
  if (direction.includes('downtrend')) return '#dc2626'
  if (direction === 'Stable') return '#6b7280'
  return '#94a3b8'
}

function confidenceBg(conf: string): string {
  if (conf === 'High')   return '#16a34a'
  if (conf === 'Medium') return '#b45309'
  return '#dc2626'
}

function verdictBg(verdict: string): string {
  if (verdict.startsWith('Buy')) return '#16a34a'
  if (verdict === 'Pass')        return '#6b7280'
  return '#b45309'
}

function severityStyle(severity: AnalysisWarning['severity']): React.CSSProperties {
  if (severity === 'high')   return { background: '#fcebeb', border: '1px solid #f09595', color: '#a32d2d', borderLeft: '4px solid #dc2626' }
  if (severity === 'medium') return { background: '#faeeda', border: '1px solid #fac775', color: '#633806', borderLeft: '4px solid #f59e0b' }
  return { background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--ink-2)', borderLeft: '4px solid #d1d5db' }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SignalStrip({ data }: { data: TrendAnalysisResponse }) {
  const { market_health: mh, buy_target } = data
  const isBuy = data.verdict.startsWith('Buy')

  return (
    <div style={stripWrap}>
      <StatCell label="Trend" value={mh.trend.direction} color={trendColor(mh.trend.direction)} />
      <StatCell label="Volume" value={mh.volume.signal} />
      <StatCell label="Liquidity" value={mh.liquidity.label} />
      <StatCell label="90d Sales" value={String(mh.liquidity.total_90d_sales)} />
      {buy_target && <StatCell label="Buy Target" value={fmt(buy_target.price)} color="#15803d" />}
      <div style={{ ...stripCell, alignItems: 'center', justifyContent: 'center' }}>
        <span style={isBuy ? chipBuy : chipWatch}>{isBuy ? 'Buy' : 'Watch'}</span>
      </div>
    </div>
  )
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={stripCell}>
      <div style={stripLbl}>{label}</div>
      <div style={{ ...stripVal, color: color ?? 'var(--ink)' }}>{value}</div>
    </div>
  )
}

function VerdictBlock({ data }: { data: TrendAnalysisResponse }) {
  const { verdict, market_confidence, primary_reason, buy_target } = data
  return (
    <div style={verdictWrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ ...verdictBadge, background: verdictBg(verdict) }}>{verdict}</span>
        <span style={{ ...confBadge, background: confidenceBg(market_confidence) }}>
          {market_confidence} confidence
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: buy_target ? 10 : 0 }}>
        {primary_reason}
      </p>
      {buy_target && (
        <div style={suggestedBuy}>
          <span style={{ fontWeight: 700, color: '#15803d', fontSize: 13 }}>
            {buy_target.grade}: {fmt(buy_target.price)}
          </span>
          <span style={{ color: '#166534', fontSize: 12, marginLeft: 8 }}>
            {buy_target.basis}
          </span>
        </div>
      )}
    </div>
  )
}

function MarketTable({ data }: { data: TrendAnalysisResponse }) {
  const { market_health: mh } = data
  const trend = mh.trend
  const sourceGrade = trend.source_grade

  return (
    <div style={sectionWrap}>
      <SectionTitle>Market Signals</SectionTitle>
      <div style={tblWrap}>
        <table style={tbl}>
          <thead>
            <tr>
              {['Signal', 'Value', 'Detail'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <DataRow label="Trend" value={trend.direction} detail={
              trend.ratio != null
                ? `${fmtDec(trend.ratio)}× ratio · source: ${sourceGrade ?? '—'}`
                : undefined
            } valueColor={trendColor(trend.direction)} />
            <DataRow label="Volume" value={mh.volume.signal} detail={
              mh.volume.change_pct != null
                ? `${(mh.volume.change_pct * 100).toFixed(1)}% change`
                : undefined
            } />
            <DataRow label="Liquidity" value={mh.liquidity.label} detail={`${mh.liquidity.total_90d_sales} sales (90d all grades)`} />
            <DataRow label="Volatility" value={mh.volatility.label} detail={
              mh.volatility.ratio != null ? `spread ratio ${fmtDec(mh.volatility.ratio)}` : undefined
            } />
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DataRow({ label, value, detail, valueColor }: { label: string; value: string; detail?: string; valueColor?: string }) {
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td style={td}><span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{label}</span></td>
      <td style={{ ...td, fontWeight: 600, color: valueColor ?? 'var(--ink)' }}>{value}</td>
      <td style={{ ...td, color: 'var(--ink-3)', fontSize: 12 }}>{detail ?? '—'}</td>
    </tr>
  )
}

function EvSection({ ev }: { ev: EvModel }) {
  const o = ev.estimated_outcomes
  return (
    <div style={sectionWrap}>
      <SectionTitle>EV Model</SectionTitle>
      <div style={tblWrap}>
        <table style={tbl}>
          <tbody>
            <EvRow label="Raw anchor" value={fmt(ev.raw_anchor)} />
            <EvRow label="Grading cost" value={fmt(ev.grading_cost)} />
            <EvRow label="Total cost basis" value={fmt(ev.total_cost)} bold />
            <EvRow label="PSA 9 anchor" value={fmt(ev.psa9_anchor)} />
            <EvRow label="PSA 10 anchor" value={fmt(ev.psa10_anchor)} />
            <EvRow
              label={
                <>
                  Gem rate
                  {ev.gem_rate_source === 'sport_fallback' && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: '#b45309', fontWeight: 400 }}>(!) sport fallback</span>
                  )}
                </>
              }
              value={`${(ev.gem_rate * 100).toFixed(0)}%`}
            />
            <EvRow label={`PSA 10 (${fmtPct(o.psa10)}) · PSA 9 (${fmtPct(o.psa9)}) · lower (${fmtPct(o.psa8_or_lower)})`} value="" />
            <EvRow label="Expected resale after fees" value={fmt(ev.expected_resale_after_fees)} />
            <EvRow
              label="Expected profit"
              value={fmt(ev.expected_profit)}
              bold
              color={ev.expected_profit >= ev.profit_floor ? '#16a34a' : '#dc2626'}
            />
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EvRow({ label, value, bold, color }: { label: React.ReactNode; value: string; bold?: boolean; color?: string }) {
  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td style={{ ...td, color: 'var(--ink-2)', fontSize: 12 }}>{label}</td>
      <td style={{ ...td, fontWeight: bold ? 700 : 400, color: color ?? 'var(--ink)', textAlign: 'right' }}>{value}</td>
    </tr>
  )
}

function BounceBackSection({ bb }: { bb: BounceBackSignals }) {
  const signals: { key: keyof BounceBackSignals; label: string; rule: string }[] = [
    { key: 'b1_cheap',              label: 'B1 — Pullback vs norm',          rule: '30d avg ≥ 15% below 180d avg' },
    { key: 'b2_recent_liquidity',   label: 'B2 — Recent liquidity',          rule: '30d sales ≥ 2' },
    { key: 'b3_stabilizing',        label: 'B3 — Stabilizing',               rule: '14d avg ≥ 97% of 30d avg' },
    { key: 'b4_recovery_not_priced',label: 'B4 — Recovery not priced in',    rule: '7d avg < 90% of 180d avg' },
    { key: 'b5_market_active',      label: 'B5 — Market still active',       rule: '30d sales ≥ expected run rate' },
    { key: 'b6_no_spike',           label: 'B6 — No spike distortion',       rule: '180d max < 3× 180d avg' },
  ]

  return (
    <div style={sectionWrap}>
      <SectionTitle>
        Bounce Back Score — {bb.score}/6
        {bb.qualifies && <span style={{ ...chipBuy, marginLeft: 8 }}>Qualifies</span>}
      </SectionTitle>
      <div style={tblWrap}>
        <table style={tbl}>
          <thead>
            <tr>
              {['Signal', 'Rule', 'Result'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {signals.map(({ key, label, rule }) => {
              const pass = bb[key] as boolean
              return (
                <tr key={key} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontWeight: 500 }}>{label}</td>
                  <td style={{ ...td, color: 'var(--ink-3)', fontSize: 12 }}>{rule}</td>
                  <td style={{ ...td, fontWeight: 600, color: pass ? '#16a34a' : '#dc2626' }}>
                    {pass ? '✓ Pass' : '✗ Fail'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WarningsList({ warnings }: { warnings: AnalysisWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div style={sectionWrap}>
      <SectionTitle>Warnings</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {warnings.map((w, i) => (
          <div key={i} style={{ ...severityStyle(w.severity), borderRadius: 6, padding: '8px 12px', fontSize: 12, lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600 }}>{w.code}</span> — {w.message}
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 13, fontWeight: 600, color: 'var(--ink)',
      borderLeft: '3px solid var(--brand)', paddingLeft: 10,
      marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function TrendAnalysisResult({ card, sport, data }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Card header */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>{card}</h2>
        <span style={{ fontSize: 12, color: 'var(--ink-3)', textTransform: 'capitalize' }}>{sport}</span>
      </div>

      {/* Signal strip */}
      <SignalStrip data={data} />

      {/* Verdict */}
      <VerdictBlock data={data} />

      {/* Market signals table */}
      <MarketTable data={data} />

      {/* EV model */}
      {data.ev_model && <EvSection ev={data.ev_model} />}

      {/* Break-even */}
      {data.break_even_grade && (
        <div style={{ fontSize: 13, color: 'var(--ink-2)', padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 600 }}>Break-even grade: </span>{data.break_even_grade}
        </div>
      )}

      {/* Bounce back */}
      {data.bounce_back && data.bounce_back.qualifies && (
        <BounceBackSection bb={data.bounce_back} />
      )}

      {/* Warnings */}
      <WarningsList warnings={data.warnings} />
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const stripWrap: React.CSSProperties = {
  display: 'flex',
  background: '#fff',
  border: '1px solid var(--border)',
  borderRadius: 8,
  overflow: 'hidden',
}

const stripCell: React.CSSProperties = {
  flex: 1,
  textAlign: 'center',
  padding: '8px 6px',
  borderRight: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const stripLbl: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--ink-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
}

const stripVal: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--ink)',
}

const chipBuy: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 600,
  padding: '2px 7px',
  borderRadius: 99,
  border: '1px solid var(--green-border)',
  background: 'var(--green-bg)',
  color: 'var(--green-text)',
}

const chipWatch: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 600,
  padding: '2px 7px',
  borderRadius: 99,
  border: '1px solid var(--amber-border)',
  background: 'var(--amber-bg)',
  color: 'var(--amber-text)',
}

const verdictWrap: React.CSSProperties = {
  background: '#fff',
  border: '1px solid var(--border)',
  borderLeft: '4px solid var(--brand)',
  borderRadius: 8,
  padding: '14px 16px',
}

const verdictBadge: React.CSSProperties = {
  display: 'inline-block',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  padding: '4px 12px',
  borderRadius: 20,
  letterSpacing: '0.3px',
}

const confBadge: React.CSSProperties = {
  display: 'inline-block',
  color: '#fff',
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 10px',
  borderRadius: 20,
}

const suggestedBuy: React.CSSProperties = {
  background: '#f0fdf4',
  border: '1px solid #86efac',
  borderRadius: 6,
  padding: '8px 12px',
  display: 'flex',
  alignItems: 'baseline',
  gap: 4,
  flexWrap: 'wrap',
}

const sectionWrap: React.CSSProperties = {}

const tblWrap: React.CSSProperties = {
  overflowX: 'auto',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: '#fff',
  boxShadow: '0 1px 3px rgba(0,0,0,.06)',
}

const tbl: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

const th: React.CSSProperties = {
  background: 'var(--bg-2)',
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
  color: 'var(--ink-3)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '10px 12px',
  color: 'var(--ink-2)',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
}
