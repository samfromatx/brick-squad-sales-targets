import { useEbaySearches } from '../features/ebay/useEbaySearches'
import type { Sport, Category } from '../lib/types'

const SECTION_ORDER: { sport: Sport; category: Category; label: string }[] = [
  { sport: 'football',   category: 'graded',      label: 'Football — Graded' },
  { sport: 'football',   category: 'raw',          label: 'Football — Raw' },
  { sport: 'basketball', category: 'graded',       label: 'Basketball — Graded' },
  { sport: 'basketball', category: 'raw',          label: 'Basketball — Raw' },
  { sport: 'football',   category: 'bounce_back',  label: 'Bounce Back' },
]

const SPORT_BADGE: Record<Sport, React.CSSProperties> = {
  football:   { background: '#faeeda', color: '#92400e' },
  basketball: { background: '#e6f1fb', color: '#1e40af' },
}
const SPORT_EMOJI: Record<Sport, string> = { football: '🏈', basketball: '🏀' }

export function EbayPage() {
  const { data, isLoading, isError } = useEbaySearches()
  const searches = data?.data ?? []

  if (isLoading) return <div className="page-content"><p style={{ color: '#94a3b8' }}>Loading…</p></div>
  if (isError)   return <div className="page-content"><p style={{ color: '#dc2626' }}>Failed to load eBay searches.</p></div>

  return (
    <div className="page-content">
      {SECTION_ORDER.map(({ sport, category, label }) => {
        const rows = searches
          .filter(s => s.sport === sport && s.category === category)
          .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
        if (rows.length === 0) return null

        return (
          <section key={`${sport}-${category}`} style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #e2e8f0' }}>
              <span className="pill" style={SPORT_BADGE[sport]}>
                {SPORT_EMOJI[sport]} {label}
              </span>
            </div>
            <table className="data-table" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>CARD</th>
                  <th>COPY</th>
                  <th>ACTIVE</th>
                  <th>SOLD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => {
                  const query = encodeURIComponent(s.search_text)
                  const base = `https://www.ebay.com/sch/i.html?_nkw=${query}`
                  return (
                    <tr key={s.id ?? i}>
                      <td style={{ color: '#94a3b8' }}>{s.rank ?? i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{s.card_name ?? s.search_text}</td>
                      <td>
                        <button
                          className="btn-ghost"
                          onClick={() => navigator.clipboard.writeText(s.search_text)}
                        >
                          Copy
                        </button>
                      </td>
                      <td>
                        <a href={`${base}&LH_ItemCondition=3`} target="_blank" rel="noreferrer"
                          style={{ color: '#2563eb', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}>
                          Active ↗
                        </a>
                      </td>
                      <td>
                        <a href={`${base}&LH_Complete=1&LH_Sold=1`} target="_blank" rel="noreferrer"
                          style={{ color: '#64748b', fontSize: 12, textDecoration: 'none' }}>
                          Sold ↗
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
