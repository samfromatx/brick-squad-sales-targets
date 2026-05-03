import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TrendAnalysisResult } from '../features/trends/TrendAnalysisResult'
import { useTrendAnalysis, useTrendSearch } from '../features/trends/useTrends'
import type { Sport } from '../lib/types'

// ── Inline search bar ──────────────────────────────────────────────────────

function TrendSearchBar() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [sport, setSport]               = useState<Sport>((params.get('sport') as Sport) ?? 'football')
  const [query, setQuery]               = useState(params.get('card') ?? '')
  const [debouncedQ, setDebouncedQ]     = useState('')
  const [selectedCard, setSelectedCard] = useState(params.get('card') ?? '')
  const [open, setOpen]                 = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: results, isError: searchError } = useTrendSearch(debouncedQ, sport)

  const handleSportChange = useCallback((s: Sport) => {
    setSport(s)
    setQuery('')
    setSelectedCard('')
    setDebouncedQ('')
    setOpen(false)
  }, [])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setSelectedCard('')
    setOpen(true)
  }

  function handleSelect(card: string) {
    setSelectedCard(card)
    setQuery(card)
    setOpen(false)
    navigate(`/trends?${new URLSearchParams({ card, sport }).toString()}`)
  }

  function handleAnalyze() {
    if (!selectedCard) return
    navigate(`/trends?${new URLSearchParams({ card: selectedCard, sport }).toString()}`)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && selectedCard) handleAnalyze()
  }

  function handleClear() {
    setQuery('')
    setSelectedCard('')
    setDebouncedQ('')
    setOpen(false)
    navigate('/trends')
  }

  const showDropdown = open && (results?.length ?? 0) > 0 && !selectedCard

  return (
    <div style={{
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px', marginBottom: 28,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)', marginBottom: 10 }}>
        Card Trend Analysis
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* Search input */}
        <div ref={wrapRef} style={{ position: 'relative', flex: '1 1 200px' }}>
          <input
            value={query}
            onChange={handleInputChange}
            onFocus={() => { if (results?.length) setOpen(true) }}
            onKeyDown={handleKeyDown}
            placeholder="Search card name…"
            style={{
              width: '100%', padding: '8px 12px', fontSize: 13,
              border: searchError ? '1px solid #ef4444' : '1px solid var(--border-2)',
              borderRadius: 6, outline: 'none', background: 'var(--bg)',
              color: 'var(--ink)', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          {searchError && debouncedQ && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6,
              padding: '6px 12px', fontSize: 12, color: '#dc2626', marginTop: 2,
            }}>
              Search unavailable — check connection
            </div>
          )}
          {showDropdown && (
            <ul style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 6, margin: '3px 0 0', padding: 0, listStyle: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 160, overflowY: 'auto',
            }}>
              {results!.map((r, i) => (
                <li
                  key={i}
                  onMouseDown={() => handleSelect(r.card)}
                  style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--bg-3)', color: 'var(--ink)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  {r.card}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sport toggles */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['football', 'basketball'] as Sport[]).map(s => (
            <button
              key={s}
              onClick={() => handleSportChange(s)}
              title={s.charAt(0).toUpperCase() + s.slice(1)}
              style={{
                padding: '8px 12px', borderRadius: 6,
                border: '1px solid var(--border)',
                background: sport === s ? 'var(--navy)' : 'var(--bg)',
                fontSize: 16, cursor: 'pointer', transition: 'all 0.15s', lineHeight: 1,
              }}
            >
              {s === 'football' ? '🏈' : '🏀'}
            </button>
          ))}
        </div>

        {/* Clear */}
        {(query || params.get('card')) && (
          <button
            onClick={handleClear}
            style={{
              padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--ink-2)', fontSize: 13,
              fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Clear
          </button>
        )}

        {/* Analyze */}
        <button
          onClick={handleAnalyze}
          disabled={!selectedCard}
          style={{
            padding: '8px 18px', borderRadius: 6, border: 'none',
            background: selectedCard ? 'var(--brand)' : 'var(--bg-3)',
            color: selectedCard ? '#fff' : 'var(--ink-3)',
            fontSize: 13, fontWeight: 600, cursor: selectedCard ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >
          Analyze
        </button>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export function TrendPage() {
  const [params] = useSearchParams()
  const card  = params.get('card')  ?? ''
  const sport = (params.get('sport') ?? 'football') as Sport

  const { data, isLoading, isError, error } = useTrendAnalysis(card, sport)
  const err = error as (Error & { status?: number }) | null

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px' }}>
      <TrendSearchBar />

      {!card && (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--ink-3)', fontSize: 13 }}>
          Use the search above to find a card, then click <strong>Analyze</strong>.
        </div>
      )}

      {card && isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px' }}>
          <div style={{
            width: 28, height: 28,
            border: '3px solid var(--border)', borderTopColor: 'var(--brand)',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 12 }}>Analyzing market data…</p>
        </div>
      )}

      {card && isError && (
        <div style={{
          margin: '0', padding: '12px 16px',
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 6, fontSize: 13, color: '#991b1b',
        }}>
          {err?.status === 404
            ? 'No market data found for this card.'
            : 'Analysis failed — please try again.'}
        </div>
      )}

      {card && data && !isLoading && (
        <TrendAnalysisResult card={card} sport={sport} data={data} />
      )}
    </div>
  )
}
