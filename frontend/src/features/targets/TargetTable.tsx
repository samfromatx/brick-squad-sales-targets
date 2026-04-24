import { useState } from 'react'
import type { Category, Target } from '../../lib/types'

interface Props {
  targets: Target[]
  category: Category
}

type SortDir = 'asc' | 'desc'

interface SortState {
  key: string
  dir: SortDir
}

function gradePillClass(grade: string | null): string {
  if (!grade) return 'pill pill-raw'
  const g = grade.toUpperCase()
  if (g.includes('PSA 10') || g.includes('PSA10')) return 'pill pill-psa10'
  if (g.includes('PSA 9') || g.includes('PSA9'))   return 'pill pill-psa9'
  return 'pill pill-raw'
}

function signalClass(pct: number | null): string {
  if (pct === null || pct < 0) return 'pill pill-monitor'
  if (pct > 50) return 'pill pill-buy'
  return 'pill pill-watch'
}

function signalLabel(pct: number | null): string {
  if (pct === null || pct < 0) return 'Monitor'
  if (pct > 50) return 'Buy'
  return 'Watch'
}

function signalOrder(pct: number | null): number {
  if (pct === null || pct < 0) return 0
  if (pct > 50) return 2
  return 1
}

function trendClass(pct: number | null): string {
  if (pct === null) return 'trend-flat'
  return pct >= 0 ? 'trend-up' : 'trend-down'
}

function volClass(vol: string | null): string {
  if (!vol) return 'pill pill-monitor'
  const v = vol.toLowerCase()
  if (v === 'high') return 'pill pill-buy'
  if (v === 'med' || v === 'medium') return 'pill pill-watch'
  return 'pill pill-monitor'
}

function volOrder(vol: string | null): number {
  if (!vol) return 0
  const v = vol.toLowerCase()
  if (v === 'high') return 3
  if (v === 'med' || v === 'medium') return 2
  return 1
}

function fmt(val: number | null, prefix = '$'): string {
  if (val === null || val === undefined) return '—'
  return `${prefix}${val.toLocaleString()}`
}

function fmtPct(val: number | null): string {
  if (val === null || val === undefined) return '—'
  return `${val}%`
}

function getValue(t: Target, key: string): number | string {
  switch (key) {
    case 'rank':       return t.rank
    case 'card_name':  return t.card_name.toLowerCase()
    case 'grade':      return t.grade?.toLowerCase() ?? ''
    case 'target_price': return t.target_price ?? -Infinity
    case 'trend_pct':  return t.trend_pct ?? -Infinity
    case 'sell_at':    return t.sell_at ?? -Infinity
    case 'vol':        return volOrder(t.vol)
    case 'signal':     return signalOrder(t.trend_pct)
    case 'est_psa9':   return t.raw_metrics?.est_psa9 ?? -Infinity
    case 'est_psa10':  return t.raw_metrics?.est_psa10 ?? -Infinity
    case 'gem_rate':   return t.raw_metrics?.gem_rate ?? -Infinity
    case 'roi':        return t.raw_metrics?.roi ?? -Infinity
    case 'rationale':  return t.rationale?.toLowerCase() ?? ''
    default:           return ''
  }
}

function sortTargets(targets: Target[], sort: SortState): Target[] {
  return [...targets].sort((a, b) => {
    const av = getValue(a, sort.key)
    const bv = getValue(b, sort.key)
    let cmp = 0
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv
    } else {
      cmp = String(av).localeCompare(String(bv))
    }
    return sort.dir === 'asc' ? cmp : -cmp
  })
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span style={{ color: '#cbd5e1', marginLeft: 4 }}>↕</span>
  return <span style={{ marginLeft: 4 }}>{dir === 'asc' ? '▲' : '▼'}</span>
}

export function TargetTable({ targets, category }: Props) {
  const [sort, setSort] = useState<SortState>({ key: 'rank', dir: 'asc' })

  if (targets.length === 0) {
    return <p style={{ color: '#94a3b8', fontStyle: 'italic', padding: '16px 0' }}>No targets match the current filters.</p>
  }

  const isRaw = category === 'raw'
  const sorted = sortTargets(targets, sort)

  function handleSort(key: string) {
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }

  function th(key: string, label: string, style?: React.CSSProperties) {
    const active = sort.key === key
    return (
      <th
        key={key}
        onClick={() => handleSort(key)}
        style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}
      >
        {label}<SortIndicator active={active} dir={sort.dir} />
      </th>
    )
  }

  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <table className="data-table">
        <thead>
          <tr>
            {th('rank', '#')}
            {th('card_name', 'CARD')}
            <th>TYPE</th>
            {th('grade', 'GRADE')}
            {th('target_price', 'BUY TARGET')}
            {th('trend_pct', 'TREND')}
            {th('sell_at', 'SELL AT')}
            {th('vol', 'VOL')}
            {isRaw && <>
              {th('est_psa9', 'EST PSA 9')}
              {th('est_psa10', 'EST PSA 10')}
              {th('gem_rate', 'GEM RATE')}
              {th('roi', 'ROI')}
            </>}
            {th('rationale', 'RATIONALE')}
            {th('signal', 'SIGNAL')}
          </tr>
        </thead>
        <tbody>
          {sorted.map(t => (
            <tr key={t.id}>
              <td style={{ color: '#94a3b8', width: 36 }}>{t.rank}</td>
              <td style={{ fontWeight: 500, maxWidth: 200 }}>
                <span style={{ whiteSpace: 'nowrap' }}>
                  {t.card_name}
                  {t.is_new && (
                    <span className="pill pill-new" style={{ marginLeft: 6, fontSize: 10 }}>NEW</span>
                  )}
                </span>
              </td>
              <td>
                <span className={t.category === 'graded' ? 'pill pill-graded' : 'pill pill-raw'}>
                  {t.category === 'graded' ? 'Graded' : 'Raw'}
                </span>
              </td>
              <td>
                <span className={gradePillClass(t.grade)}>
                  {t.grade ?? '—'}
                </span>
              </td>
              <td style={{ fontWeight: 500 }}>{fmt(t.target_price)}</td>
              <td>
                <span className={trendClass(t.trend_pct)}>
                  {t.trend_pct !== null ? `${t.trend_pct > 0 ? '+' : ''}${t.trend_pct}%` : '—'}
                </span>
              </td>
              <td>{fmt(t.sell_at)}</td>
              <td>
                {t.vol
                  ? <span className={volClass(t.vol)}>{t.vol}</span>
                  : <span style={{ color: '#94a3b8' }}>—</span>
                }
              </td>
              {isRaw && <>
                <td>{fmt(t.raw_metrics?.est_psa9 ?? null)}</td>
                <td>{fmt(t.raw_metrics?.est_psa10 ?? null)}</td>
                <td>{fmtPct(t.raw_metrics?.gem_rate ?? null)}</td>
                <td>
                  {t.raw_metrics?.roi !== null && t.raw_metrics?.roi !== undefined
                    ? <span className={t.raw_metrics.roi >= 0 ? 'trend-up' : 'trend-down'}>{fmtPct(t.raw_metrics.roi)}</span>
                    : '—'
                  }
                </td>
              </>}
              <td style={{ maxWidth: 220, color: '#475569', fontSize: 12 }}>
                {t.rationale ?? '—'}
              </td>
              <td>
                <span className={signalClass(t.trend_pct)}>{signalLabel(t.trend_pct)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
