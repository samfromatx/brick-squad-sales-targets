import type {
  AnalysisWarning,
  BounceBackSignals,
  EvModel,
  TrendAnalysisResponse,
  WindowRow,
} from '../../lib/types'

interface Props {
  card: string
  sport: string
  data: TrendAnalysisResponse
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, prefix = '$'): string {
  if (v == null) return '—'
  return `${prefix}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function fmtDec(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  return Number(v).toFixed(decimals)
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

// ── Shared styles ─────────────────────────────────────────────────────────────

const cardWrap: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  overflow: 'hidden',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
}

const cardHeaderBar: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const tbl: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

const th: React.CSSProperties = {
  background: 'var(--bg-2)',
  padding: '9px 14px',
  textAlign: 'left',
  fontWeight: 600,
  color: 'var(--ink-3)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
}

const td: React.CSSProperties = {
  padding: '10px 12px',
  color: 'var(--ink-2)',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
}

const anchorChip: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 6,
  fontSize: 10,
  fontWeight: 600,
  padding: '1px 6px',
  borderRadius: 99,
  background: '#fde68a',
  color: '#92400e',
  border: '1px solid #fbbf24',
  verticalAlign: 'middle',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HeaderCard({ card, sport, data }: { card: string; sport: string; data: TrendAnalysisResponse }) {
  const { verdict, market_confidence, primary_reason, buy_target, market_health: mh } = data

  return (
    <div style={cardWrap}>
      {/* Top: name + verdict badge */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, padding: '16px 18px', flexWrap: 'wrap',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.3px' }}>
            {card}
          </h2>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3, textTransform: 'capitalize' }}>
            {sport}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 13, fontWeight: 700, padding: '5px 14px', borderRadius: 20, color: '#fff',
            background: verdictBg(verdict),
          }}>{verdict}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '4px 11px', borderRadius: 20, color: '#fff',
            background: confidenceBg(market_confidence),
          }}>{market_confidence} confidence</span>
        </div>
      </div>

      {/* Rationale + buy target */}
      <div style={{ padding: '0 18px 14px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.65, margin: '0 0 10px' }}>
          {primary_reason}
        </p>
        {buy_target && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: '#f0fdf4', border: '1px solid #86efac',
            borderRadius: 7, padding: '8px 14px',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Buy target
            </span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#15803d', letterSpacing: '-0.5px' }}>
              {fmt(buy_target.price)}
            </span>
            <span style={{ fontSize: 11, color: '#166534' }}>
              {buy_target.grade} · {buy_target.basis}
            </span>
          </div>
        )}
      </div>

      {/* Signal strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {([
          { label: 'Trend',        value: mh.trend.direction,              color: trendColor(mh.trend.direction) },
          { label: 'Volume',       value: mh.volume.signal,
            color: mh.volume.signal === 'Accelerating' ? '#15803d'
                 : mh.volume.signal === 'Declining'    ? '#dc2626'
                 : undefined },
          { label: 'Liquidity',   value: mh.liquidity.label },
          { label: '90d Sales',   value: String(mh.liquidity.total_90d_sales) },
          { label: 'Volatility',  value: mh.volatility.label },
          { label: 'Ratio source', value: mh.trend.source_grade
              ? `${mh.trend.source_grade} ${mh.trend.source_window ?? ''}`.trim()
              : '—' },
        ] as { label: string; value: string; color?: string }[]).map(({ label, value, color }, i, arr) => (
          <div key={label} style={{
            flex: '1 1 100px', padding: '10px 14px', textAlign: 'center',
            borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>
              {label}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: color ?? 'var(--ink)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MarketTable({ data }: { data: TrendAnalysisResponse }) {
  const { market_health: mh } = data
  const trend = mh.trend
  const sourceGrade = trend.source_grade

  return (
    <div style={cardWrap}>
      <div style={cardHeaderBar}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Market Signals</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
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
  const items: { label: string; value: string; bold?: boolean; valueColor?: string }[] = [
    { label: 'Raw anchor price',             value: fmt(ev.raw_anchor) },
    { label: 'Grading cost',                 value: fmt(ev.grading_cost) },
    { label: 'Total cost basis',             value: fmt(ev.total_cost),              bold: true },
    { label: 'Gem rate',                     value: `${(ev.gem_rate * 100).toFixed(0)}%` },
    { label: 'PSA 9 anchor',                 value: fmt(ev.psa9_anchor) },
    { label: 'PSA 10 anchor',                value: fmt(ev.psa10_anchor) },
    { label: 'Expected resale (after fees)', value: fmt(ev.expected_resale_after_fees) },
    {
      label: 'Expected profit', bold: true,
      value: fmt(ev.expected_profit),
      valueColor: ev.expected_profit >= ev.profit_floor ? '#15803d' : '#dc2626',
    },
  ]

  return (
    <div style={cardWrap}>
      <div style={cardHeaderBar}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>EV Model</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Expected value of buying raw and grading</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {items.map(({ label, value, bold, valueColor }, i) => (
          <div key={label} style={{
            padding: '11px 16px', fontSize: 13,
            borderTop: i >= 2 ? '1px solid var(--border)' : 'none',
            borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
            background: bold ? 'var(--bg-2)' : 'transparent',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{label}</span>
            <span style={{ fontWeight: bold ? 700 : 500, color: valueColor ?? 'var(--ink)' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BounceBackSection({ bb }: { bb: BounceBackSignals }) {
  const signals: { key: keyof BounceBackSignals; label: string; name: string; rule: string }[] = [
    { key: 'b1_cheap',               label: 'B1', name: 'Cheap vs norm',          rule: '30d avg ≥15% below 180d avg' },
    { key: 'b2_recent_liquidity',    label: 'B2', name: 'Recent liquidity',        rule: '30d sales ≥ 2' },
    { key: 'b3_stabilizing',         label: 'B3', name: 'Stabilizing',             rule: '14d avg ≥ 97% of 30d avg' },
    { key: 'b4_recovery_not_priced', label: 'B4', name: 'Recovery not priced in',  rule: '7d avg < 90% of 180d avg' },
    { key: 'b5_market_active',       label: 'B5', name: 'Market still active',     rule: '30d sales ≥ expected run rate' },
    { key: 'b6_no_spike',            label: 'B6', name: 'No spike distortion',     rule: '180d max < 3× 180d avg' },
  ]

  const scoreBg    = bb.score >= 4 ? '#f0fdf4' : bb.score >= 3 ? '#fef9c3' : '#fee2e2'
  const scoreColor = bb.score >= 4 ? '#15803d' : bb.score >= 3 ? '#854d0e' : '#991b1b'
  const scoreBorder = bb.score >= 4 ? '#86efac' : bb.score >= 3 ? '#fde047' : '#fca5a5'

  return (
    <div style={cardWrap}>
      <div style={{ ...cardHeaderBar, gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Bounce-Back Score</div>
        <span style={{
          fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
          background: scoreBg, color: scoreColor, border: `1px solid ${scoreBorder}`,
        }}>
          {bb.score}/6{bb.qualifies ? ' · Qualifies' : ''}
        </span>
      </div>
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {signals.map(({ key, label, name, rule }) => {
          const pass = bb[key] as boolean
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 6,
              background: pass ? '#f0fdf4' : 'var(--bg-2)',
              border: `1px solid ${pass ? '#86efac' : 'var(--border)'}`,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, width: 24, textAlign: 'center',
                flexShrink: 0, color: pass ? '#15803d' : 'var(--ink-3)',
              }}>{label}</span>
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: pass ? '#15803d' : 'var(--ink-3)',
                flex: '0 0 160px',
              }}>{name}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', flex: 1 }}>{rule}</span>
              <span style={{
                fontSize: 13, fontWeight: 700,
                color: pass ? '#15803d' : '#dc2626', flexShrink: 0,
              }}>
                {pass ? '✓' : '✗'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WindowPricesTable({ rows, recGrade }: { rows: WindowRow[]; recGrade?: string }) {
  if (!rows.length) return null
  return (
    <div style={cardWrap}>
      <div style={cardHeaderBar}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Price History</div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Raw · PSA 9 · PSA 10 across time windows</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tbl}>
          <thead>
            <tr>
              {['Window', 'Raw', 'PSA 9', 'PSA 10', 'Raw/9 ratio', '10/9 ratio'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const anchor = row.is_anchor
              return (
                <tr key={row.window_days} style={{
                  borderTop: '1px solid var(--border)',
                  background: anchor ? '#fdf8f0' : i % 2 === 0 ? 'transparent' : 'var(--bg-2)',
                }}>
                  <td style={{
                    padding: '10px 14px', fontWeight: anchor ? 700 : 500,
                    color: 'var(--ink)', whiteSpace: 'nowrap',
                  }}>
                    {row.window_days}d
                    {anchor && <span style={anchorChip}>anchor</span>}
                  </td>
                  <td style={{
                    padding: '10px 14px', color: 'var(--ink-2)',
                    background: recGrade === 'Raw' ? '#f0fdf4' : undefined,
                    fontWeight: recGrade === 'Raw' ? 600 : 400,
                  }}>{fmtAvg(row.raw_avg)}</td>
                  <td style={{
                    padding: '10px 14px', color: 'var(--ink-2)',
                    background: recGrade === 'PSA 9' ? '#f0fdf4' : undefined,
                    fontWeight: recGrade === 'PSA 9' ? 600 : 400,
                  }}>{fmtAvg(row.psa9_avg)}</td>
                  <td style={{
                    padding: '10px 14px', color: 'var(--ink-2)',
                    background: recGrade === 'PSA 10' ? '#f0fdf4' : undefined,
                    fontWeight: recGrade === 'PSA 10' ? 600 : 400,
                  }}>{fmtAvg(row.psa10_avg)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink-3)', fontSize: 12 }}>
                    {fmtRatio(row.raw_psa9_ratio)}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--ink-3)', fontSize: 12 }}>
                    {fmtRatio(row.psa10_psa9_ratio)}
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

function fmtAvg(v: number | null): string {
  if (v == null) return '—'
  return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtRatio(v: number | null): string {
  if (v == null) return '—'
  return `${Number(v).toFixed(2)}×`
}

function WarningsList({ warnings }: { warnings: AnalysisWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {warnings.map((w, i) => (
        <div key={i} style={{
          fontSize: 12, lineHeight: 1.6, padding: '9px 14px', borderRadius: 7,
          ...severityStyle(w.severity),
          display: 'flex', gap: 8, alignItems: 'baseline',
        }}>
          <strong style={{ flexShrink: 0 }}>{w.code}</strong>
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function TrendAnalysisResult({ card, sport, data }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <HeaderCard card={card} sport={sport} data={data} />
      <MarketTable data={data} />
      <WindowPricesTable rows={data.window_prices} recGrade={data.buy_target?.grade} />
      {data.ev_model && <EvSection ev={data.ev_model} />}
      {data.break_even_grade && (
        <div style={{
          fontSize: 13, color: 'var(--ink-2)', padding: '8px 12px',
          background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)',
        }}>
          <span style={{ fontWeight: 600 }}>Break-even grade: </span>{data.break_even_grade}
        </div>
      )}
      {data.bounce_back && <BounceBackSection bb={data.bounce_back} />}
      <WarningsList warnings={data.warnings} />
    </div>
  )
}
