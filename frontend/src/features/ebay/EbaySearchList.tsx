import type { EbaySearch } from '../../lib/types'

interface Props {
  searches: EbaySearch[]
}

function ebayUrl(searchText: string): string {
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchText)}&_sacat=0&LH_Sold=1&LH_Complete=1`
}

const SPORT_LABELS: Record<string, string> = { football: 'Football', basketball: 'Basketball' }
const CAT_LABELS: Record<string, string> = { graded: 'Graded', raw: 'Raw', bounce_back: 'Bounce Back' }

export function EbaySearchList({ searches }: Props) {
  if (searches.length === 0) {
    return <p style={{ color: '#64748b', fontStyle: 'italic' }}>No eBay searches saved.</p>
  }

  const grouped: Record<string, Record<string, EbaySearch[]>> = {}
  for (const s of searches) {
    const sp = s.sport
    const cat = s.category
    if (!grouped[sp]) grouped[sp] = {}
    if (!grouped[sp][cat]) grouped[sp][cat] = []
    grouped[sp][cat].push(s)
  }

  return (
    <div>
      {Object.entries(grouped).map(([sport, cats]) => (
        <section key={sport} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, color: '#cbd5e1', marginBottom: 10, borderBottom: '1px solid #1e293b', paddingBottom: 6 }}>
            {SPORT_LABELS[sport] ?? sport}
          </h2>
          {Object.entries(cats).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                {CAT_LABELS[cat] ?? cat}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((s, i) => (
                  <a
                    key={s.id ?? i}
                    href={ebayUrl(s.search_text)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={linkCard}
                  >
                    <span style={{ color: '#e2e8f0', fontWeight: 500 }}>
                      {s.rank != null && <span style={{ color: '#475569', marginRight: 6 }}>#{s.rank}</span>}
                      {s.card_name ?? s.search_text}
                    </span>
                    <span style={{ color: '#475569', fontSize: 11, marginLeft: 8 }}>
                      {s.search_text}
                    </span>
                    <span style={{ marginLeft: 'auto', color: '#2563eb', fontSize: 11 }}>eBay ↗</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

const linkCard: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  background: '#1e293b', borderRadius: 6, padding: '8px 12px',
  textDecoration: 'none', fontSize: 13,
  border: '1px solid #334155',
}
