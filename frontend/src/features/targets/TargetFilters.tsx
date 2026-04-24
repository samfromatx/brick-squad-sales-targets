import type { Category, Sport } from '../../lib/types'

interface Props {
  sport: Sport | ''
  category: Category | ''
  onSport: (v: Sport | '') => void
  onCategory: (v: Category | '') => void
}

export function TargetFilters({ sport, category, onSport, onCategory }: Props) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
      <label>
        Sport{' '}
        <select value={sport} onChange={e => onSport(e.target.value as Sport | '')}>
          <option value="">All</option>
          <option value="football">Football</option>
          <option value="basketball">Basketball</option>
        </select>
      </label>
      <label>
        Category{' '}
        <select value={category} onChange={e => onCategory(e.target.value as Category | '')}>
          <option value="">All</option>
          <option value="graded">Graded</option>
          <option value="raw">Raw → Grade</option>
          <option value="bounce_back">Bounce Back</option>
        </select>
      </label>
    </div>
  )
}
