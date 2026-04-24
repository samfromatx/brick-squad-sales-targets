import { useState } from 'react'
import { EbaySearchList } from '../features/ebay/EbaySearchList'
import { useEbaySearches } from '../features/ebay/useEbaySearches'
import { TrendDetail } from '../features/trends/TrendDetail'
import { useTrendDetail, useTrendSearch } from '../features/trends/useTrends'

type Tab = 'trends' | 'ebay'

export function TrendPage() {
  const [tab, setTab] = useState<Tab>('trends')
  const [query, setQuery] = useState('')
  const [selectedCard, setSelectedCard] = useState('')
  const [selectedSport, setSelectedSport] = useState<string | undefined>(undefined)

  const { data: searchData, isFetching: searching } = useTrendSearch(query)
  const { data: detailData, isLoading: detailLoading } = useTrendDetail(selectedCard, selectedSport)
  const { data: ebayData, isLoading: ebayLoading } = useEbaySearches()

  const suggestions = searchData?.data ?? []

  function selectCard(card: string, sport: string) {
    setSelectedCard(card)
    setSelectedSport(sport)
    setQuery(card)
  }

  return (
    <div style={page}>
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #1e293b' }}>
        {(['trends', 'ebay'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>
            {t === 'trends' ? 'Trend Analysis' : 'eBay Searches'}
          </button>
        ))}
      </div>

      {tab === 'trends' && (
        <div>
          <div style={{ position: 'relative', maxWidth: 480, marginBottom: 8 }}>
            <input
              style={searchInput}
              placeholder="Search card name…"
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedCard('') }}
            />
            {searching && (
              <span style={{ position: 'absolute', right: 10, top: 8, color: '#64748b', fontSize: 12 }}>…</span>
            )}
            {suggestions.length > 0 && !selectedCard && (
              <ul style={dropdown}>
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    onClick={() => selectCard(s.card, s.sport)}
                    style={dropdownItem}
                  >
                    <span style={{ color: '#e2e8f0' }}>{s.card}</span>
                    <span style={{ color: '#475569', fontSize: 11, marginLeft: 8, textTransform: 'capitalize' }}>
                      {s.sport}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!selectedCard && query.length < 2 && (
            <p style={{ color: '#475569', fontSize: 13 }}>
              Type at least 2 characters to search.
            </p>
          )}

          {detailLoading && <p style={{ color: '#94a3b8' }}>Loading…</p>}

          {selectedCard && !detailLoading && (
            <TrendDetail data={detailData} />
          )}
        </div>
      )}

      {tab === 'ebay' && (
        <div>
          <h1 style={{ fontSize: 20, color: '#f1f5f9', marginBottom: 20 }}>eBay Searches</h1>
          {ebayLoading
            ? <p style={{ color: '#94a3b8' }}>Loading…</p>
            : <EbaySearchList searches={ebayData?.data ?? []} />}
        </div>
      )}
    </div>
  )
}

const page: React.CSSProperties = {
  maxWidth: 1100, margin: '0 auto', padding: '32px 16px',
  background: '#0f172a', minHeight: '100vh', color: '#e2e8f0',
}

const searchInput: React.CSSProperties = {
  width: '100%', background: '#1e293b', border: '1px solid #334155',
  borderRadius: 6, padding: '8px 12px', color: '#e2e8f0', fontSize: 14,
}

const dropdown: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
  background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
  margin: 0, padding: 0, listStyle: 'none', maxHeight: 240, overflowY: 'auto',
}

const dropdownItem: React.CSSProperties = {
  padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
  borderBottom: '1px solid #0f172a',
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '8px 20px', fontSize: 14, fontWeight: active ? 700 : 400,
    color: active ? '#f1f5f9' : '#64748b',
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    marginBottom: -2,
  }
}
