import { useState } from 'react'
import { useBootstrap } from '../features/targets/useBootstrap'
import { TargetFilters } from '../features/targets/TargetFilters'
import { TargetTable } from '../features/targets/TargetTable'
import type { Category, Sport, Target } from '../lib/types'

type TypeFilter = '' | 'graded' | 'raw'

const CATEGORY_LABELS: Record<string, string> = {
  graded: 'Graded',
  raw: 'Raw',
  bounce_back: 'Bounce Back',
}

const SPORT_BADGE: Record<Sport, React.CSSProperties> = {
  football:   { background: '#faeeda', color: '#633806', border: '1px solid #fac775' },
  basketball: { background: '#e6f1fb', color: '#0c447c', border: '1px solid #85b7eb' },
}
const SPORT_EMOJI: Record<Sport, string> = { football: '🏈', basketball: '🏀' }

function defaultGrade(targets: Target[], sport: Sport, category: Category): string {
  const row = targets.find(t => t.sport === sport && t.category === category && t.grade)
  if (!row?.grade) return ''
  const g = row.grade.toUpperCase()
  if (g.includes('PSA 10')) return 'Default: PSA 10'
  if (g.includes('PSA 9'))  return 'Default: PSA 9'
  return ''
}

function groupTargets(targets: Target[], sport: Sport | '', typeFilter: TypeFilter) {
  const filtered = targets.filter(t => {
    if (sport && t.sport !== sport) return false
    // typeFilter '' = show graded + raw (not bounce_back, which lives in Tools)
    // typeFilter 'graded' | 'raw' = show only that category
    if (typeFilter === '') return t.category === 'graded' || t.category === 'raw'
    return t.category === typeFilter
  })
  const groups: Record<string, Record<string, Target[]>> = {}
  for (const t of filtered) {
    if (!groups[t.category]) groups[t.category] = {}
    if (!groups[t.category][t.sport]) groups[t.category][t.sport] = []
    groups[t.category][t.sport].push(t)
  }
  return groups
}

export function DashboardPage() {
  const { data, isLoading, isError, error } = useBootstrap()
  const [sport, setSport] = useState<Sport | ''>('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('')

  if (isLoading) return <div className="page-content"><p style={{ color: '#888780' }}>Loading targets…</p></div>
  if (isError) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return <div className="page-content"><p style={{ color: '#a32d2d' }}>Failed to load: {msg}</p></div>
  }

  const targets = data?.data.targets ?? []
  const lastUpdated = data?.last_updated

  const visibleTargets = targets.filter(t => t.category === 'graded' || t.category === 'raw')
  const buyNow  = visibleTargets.filter(t => t.trend_pct !== null && t.trend_pct > 50).length
  const watch   = visibleTargets.filter(t => t.trend_pct !== null && t.trend_pct >= 0 && t.trend_pct <= 50).length
  const monitor = visibleTargets.filter(t => t.trend_pct === null || t.trend_pct < 0).length

  const kpis = [
    { label: 'Total',   value: visibleTargets.length, sub: 'targets',  color: '#85b7eb' },
    { label: 'Buy Now', value: buyNow,                sub: 'trending', color: '#22c55e' },
    { label: 'Watch',   value: watch,                 sub: 'building', color: '#f59e0b' },
    { label: 'Monitor', value: monitor,               sub: 'cooling',  color: '#d1d5db' },
  ]

  const groups = groupTargets(targets, sport, typeFilter)

  return (
    <div className="page-content">
      {lastUpdated && (
        <p style={{ fontSize: 12, color: '#888780', marginBottom: 16 }}>
          Updated {lastUpdated}
        </p>
      )}

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {kpis.map(k => (
          <div key={k.label} className="kpi-card" style={{ borderTop: `3px solid ${k.color}` }}>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <TargetFilters
        sport={sport}
        typeFilter={typeFilter}
        onSport={setSport}
        onTypeFilter={setTypeFilter}
      />

      {/* Target sections */}
      {Object.entries(groups).length === 0 && (
        <p style={{ color: '#888780', fontStyle: 'italic' }}>No targets match the current filters.</p>
      )}

      {(['graded', 'raw'] as Category[]).map(cat => {
        const sportGroups = groups[cat]
        if (!sportGroups) return null
        return (
          <section key={cat} style={{ marginBottom: 40 }}>
            <h2 className="section-title">{CATEGORY_LABELS[cat]} Targets</h2>
            {(['football', 'basketball'] as Sport[]).map(sp => {
              const rows = sportGroups[sp]
              if (!rows?.length) return null
              const def = defaultGrade(rows, sp, cat)
              return (
                <div key={sp} style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span className="pill" style={{ ...SPORT_BADGE[sp], fontSize: 11, padding: '3px 12px' }}>
                      {SPORT_EMOJI[sp]} {sp === 'football' ? 'Football' : 'Basketball'}
                    </span>
                    {def && <span style={{ fontSize: 12, color: '#888780' }}>{def}</span>}
                  </div>
                  <TargetTable targets={rows} category={cat} />
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
