import { useState } from 'react'
import { useBootstrap } from '../features/targets/useBootstrap'
import { TargetFilters } from '../features/targets/TargetFilters'
import { TargetTable } from '../features/targets/TargetTable'
import type { Category, Sport, Target } from '../lib/types'

const CATEGORY_LABELS: Record<string, string> = {
  graded: 'Graded',
  raw: 'Raw → Grade',
  bounce_back: 'Bounce Back',
}

const SPORT_LABELS: Record<string, string> = {
  football: 'Football',
  basketball: 'Basketball',
}

function groupTargets(targets: Target[], sport: Sport | '', category: Category | '') {
  const filtered = targets.filter(t => {
    if (sport && t.sport !== sport) return false
    if (category && t.category !== category) return false
    return true
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
  const [category, setCategory] = useState<Category | ''>('')

  if (isLoading) {
    return (
      <div style={page}>
        <p style={{ color: '#94a3b8' }}>Loading targets…</p>
      </div>
    )
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return (
      <div style={page}>
        <p style={{ color: '#ef4444' }}>Failed to load: {msg}</p>
      </div>
    )
  }

  const targets = data?.data.targets ?? []
  const groups = groupTargets(targets, sport, category)
  const lastUpdated = data?.last_updated

  return (
    <div style={page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: '#f1f5f9' }}>
          Buy Targets
          {lastUpdated && (
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 10, fontWeight: 400 }}>
              updated {lastUpdated}
            </span>
          )}
        </h1>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          {targets.length} target{targets.length !== 1 ? 's' : ''}
        </span>
      </div>

      <TargetFilters
        sport={sport}
        category={category}
        onSport={setSport}
        onCategory={setCategory}
      />

      {Object.entries(groups).length === 0 && (
        <p style={{ color: '#888', fontStyle: 'italic' }}>No targets match the current filters.</p>
      )}

      {(['graded', 'raw', 'bounce_back'] as Category[]).map(cat => {
        const sportGroups = groups[cat]
        if (!sportGroups) return null
        return (
          <section key={cat} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 12, borderBottom: '1px solid #1e293b', paddingBottom: 6 }}>
              {CATEGORY_LABELS[cat]}
            </h2>
            {(['football', 'basketball'] as Sport[]).map(sp => {
              const rows = sportGroups[sp]
              if (!rows?.length) return null
              return (
                <div key={sp} style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 13, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {SPORT_LABELS[sp]}
                  </h3>
                  <TargetTable targets={rows} />
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

const page: React.CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
  padding: '32px 16px',
  color: '#e2e8f0',
}
