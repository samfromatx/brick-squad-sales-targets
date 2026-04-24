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
    <div className="page-content">
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
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
              <span style={{ position: 'absolute', right: 10, top: 8, color: '#94a3b8', fontSize: 12 }}>…</span>
            )}
            {suggestions.length > 0 && !selectedCard && (
              <ul style={dropdown}>
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    onClick={() => selectCard(s.card, s.sport)}
                    style={dropdownItem}
                  >
                    <span style={{ color: '#1e293b' }}>{s.card}</span>
                    <span style={{ color: '#64748b', fontSize: 11, marginLeft: 8, textTransform: 'capitalize' }}>
                      {s.sport}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!selectedCard && query.length < 2 && (
            <p style={{ color: '#64748b', fontSize: 13 }}>
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
          <h1 style={{ fontSize: 20, color: '#1e293b', marginBottom: 20 }}>eBay Searches</h1>
          {ebayLoading
            ? <p style={{ color: '#94a3b8' }}>Loading…</p>
            : <EbaySearchList searches={ebayData?.data ?? []} />}
        </div>
      )}
    </div>
  )
}

const searchInput: React.CSSProperties = {
  width: '100%', background: '#fff', border: '1px solid #cbd5e1',
  borderRadius: 6, padding: '8px 12px', color: '#1e293b', fontSize: 14,
}

const dropdown: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
  margin: 0, padding: 0, listStyle: 'none', maxHeight: 240, overflowY: 'auto',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

const dropdownItem: React.CSSProperties = {
  padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
  borderBottom: '1px solid #f1f5f9',
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '8px 20px', fontSize: 14, fontWeight: active ? 700 : 400,
    color: active ? '#2563eb' : '#64748b',
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    marginBottom: -2,
    fontFamily: 'inherit',
  }
}
