import type { Sport } from '../../lib/types'

type TypeFilter = '' | 'graded' | 'raw'

interface Props {
  sport: Sport | ''
  typeFilter: TypeFilter
  onSport: (v: Sport | '') => void
  onTypeFilter: (v: TypeFilter) => void
}

const SPORTS: { value: Sport; label: string; emoji: string }[] = [
  { value: 'football',   label: 'Football',   emoji: '🏈' },
  { value: 'basketball', label: 'Basketball', emoji: '🏀' },
]

const TYPES: { value: TypeFilter; label: string }[] = [
  { value: '',       label: 'All'    },
  { value: 'graded', label: 'Graded' },
  { value: 'raw',    label: 'Raw'    },
]

export function TargetFilters({ sport, typeFilter, onSport, onTypeFilter }: Props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
      {/* Sport pills — always badge-colored, thicker border when selected */}
      <div style={{ display: 'flex', gap: 6 }}>
        {SPORTS.map(s => (
          <button
            key={s.value}
            className={`pill-btn sport-${s.value}${sport === s.value ? ' selected' : ''}`}
            onClick={() => onSport(sport === s.value ? '' : s.value)}
          >
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      {/* Type pills */}
      <div style={{ display: 'flex', gap: 6 }}>
        {TYPES.map(t => (
          <button
            key={t.value}
            className={`pill-btn${typeFilter === t.value ? ' active' : ''}`}
            onClick={() => onTypeFilter(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
