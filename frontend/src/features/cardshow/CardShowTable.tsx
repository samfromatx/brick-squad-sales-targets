import { useBootstrap } from '../targets/useBootstrap'
import type { Sport, Target } from '../../lib/types'

const SPORT_BADGE: Record<Sport, React.CSSProperties> = {
  football:   { background: '#faeeda', color: '#92400e' },
  basketball: { background: '#e6f1fb', color: '#1e40af' },
}
const SPORT_EMOJI: Record<Sport, string> = { football: '🏈', basketball: '🏀' }
const SPORT_LABEL: Record<Sport, string> = { football: 'Football', basketball: 'Basketball' }

function gradePillClass(grade: string | null): string {
  if (!grade) return 'pill pill-raw'
  const g = grade.toUpperCase()
  if (g.includes('PSA 10') || g.includes('PSA10')) return 'pill pill-psa10'
  if (g.includes('PSA 9')  || g.includes('PSA9'))  return 'pill pill-psa9'
  return 'pill pill-raw'
}

function fmt(val: number | null): string {
  if (val === null || val === undefined) return '—'
  return `$${val.toLocaleString()}`
}

function upside(target: Target): { dollars: number | null; pct: number | null } {
  if (target.sell_at === null || target.target_price === null || target.target_price === 0) {
    return { dollars: null, pct: null }
  }
  const dollars = target.sell_at - target.target_price
  const pct = Math.round((dollars / target.target_price) * 100)
  return { dollars, pct }
}

function UpsideCell({ target }: { target: Target }) {
  const { dollars, pct } = upside(target)
  if (dollars === null || pct === null) return <td style={{ color: '#94a3b8' }}>—</td>
  const positive = dollars >= 0
  const color = positive ? '#16a34a' : '#dc2626'
  const sign  = positive ? '+' : ''
  return (
    <td>
      <span style={{ color, fontWeight: 600 }}>
        {sign}{fmt(dollars)} ({sign}{pct}%)
      </span>
    </td>
  )
}

function CardShowSection({ sport, rows }: { sport: Sport; rows: Target[] }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 10 }}>
        <span className="pill" style={{ ...SPORT_BADGE[sport], fontSize: 12, padding: '4px 12px' }}>
          {SPORT_EMOJI[sport]} {SPORT_LABEL[sport]} — Card Show Targets
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 10 }}>
          Buy all of these in person if priced right
        </span>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>CARD</th>
              <th>GRADE</th>
              <th>BUY UNDER</th>
              <th>SELL AT</th>
              <th>UPSIDE</th>
              <th>RATIONALE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id}>
                <td style={{ color: '#94a3b8', width: 36 }}>{i + 1}</td>
                <td style={{ fontWeight: 500, maxWidth: 200 }}>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {t.card_name}
                    {t.is_new && (
                      <span className="pill pill-new" style={{ marginLeft: 6, fontSize: 10 }}>NEW</span>
                    )}
                  </span>
                </td>
                <td>
                  <span className={gradePillClass(t.grade)}>
                    {t.grade ?? '—'}
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>{fmt(t.target_price)}</td>
                <td>{fmt(t.sell_at)}</td>
                <UpsideCell target={t} />
                <td style={{ maxWidth: 260, fontSize: 12, color: '#475569' }}>
                  {t.rationale ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function CardShowTable() {
  const { data, isLoading, isError, error } = useBootstrap()

  if (isLoading) return <p style={{ color: '#94a3b8' }}>Loading targets…</p>
  if (isError) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return <p style={{ color: '#dc2626' }}>Failed to load: {msg}</p>
  }

  const targets = data?.data.targets ?? []

  // Card Show shows graded targets only, ordered by rank
  const graded = targets
    .filter(t => t.category === 'graded')
    .sort((a, b) => a.rank - b.rank)

  const byFootball   = graded.filter(t => t.sport === 'football')
  const byBasketball = graded.filter(t => t.sport === 'basketball')

  if (graded.length === 0) {
    return <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No graded targets available.</p>
  }

  return (
    <div>
      {byFootball.length > 0   && <CardShowSection sport="football"   rows={byFootball}   />}
      {byBasketball.length > 0 && <CardShowSection sport="basketball" rows={byBasketball} />}
    </div>
  )
}
