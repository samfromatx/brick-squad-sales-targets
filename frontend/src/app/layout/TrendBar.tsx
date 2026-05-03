import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTrendSearch } from '../../features/trends/useTrends'
import type { Sport } from '../../lib/types'

const SPORTS: { value: Sport; emoji: string; label: string }[] = [
  { value: 'football',   emoji: '🏈', label: 'Football' },
  { value: 'basketball', emoji: '🏀', label: 'Basketball' },
]

export function TrendBar() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [sport, setSport]               = useState<Sport>('football')
  const [query, setQuery]               = useState('')
  const [debouncedQ, setDebouncedQ]     = useState('')
  const [selectedCard, setSelectedCard] = useState('')
  const [open, setOpen]                 = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const showClear = !!(query || params.get('card'))

  // debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300)
    return () => clearTimeout(t)
  }, [query])

  // close dropdown on outside click
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
    const qs = new URLSearchParams({ card, sport })
    navigate(`/trends?${qs.toString()}`)
  }

  function handleAnalyze() {
    if (!selectedCard) return
    const qs = new URLSearchParams({ card: selectedCard, sport })
    navigate(`/trends?${qs.toString()}`)
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
    <div style={barWrap}>
      <span style={barLabel}>Trend Analysis</span>
      <div style={controls}>
        {/* Search */}
        <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <input
            style={searchError ? { ...searchInput, borderColor: '#ef4444' } : searchInput}
            placeholder="e.g. Mahomes Prizm 2017, Wembanyama…"
            value={query}
            onChange={handleInputChange}
            onFocus={() => { if (results?.length) setOpen(true) }}
            onKeyDown={handleKeyDown}
          />
          {searchError && debouncedQ && (
            <div style={errorHint}>Search unavailable — check connection</div>
          )}
          {showDropdown && (
            <ul style={dropdown}>
              {results!.map((r, i) => (
                <li
                  key={i}
                  onMouseDown={() => handleSelect(r.card)}
                  style={dropdownItem}
                >
                  {r.card}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sport toggles */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {SPORTS.map(s => (
            <button
              key={s.value}
              onClick={() => handleSportChange(s.value)}
              title={s.label}
              style={sportBtn(sport === s.value)}
            >
              {s.emoji}
            </button>
          ))}
        </div>

        {/* Clear */}
        {showClear && (
          <button onClick={handleClear} style={clearBtn}>
            Clear
          </button>
        )}

        {/* Analyze */}
        <button
          onClick={handleAnalyze}
          disabled={!selectedCard}
          style={analyzeBtn(!selectedCard)}
        >
          Analyze
        </button>
      </div>
    </div>
  )
}

const barWrap: React.CSSProperties = {
  background: 'var(--bg-2)',
  borderBottom: '1px solid var(--border)',
  padding: '8px 20px 10px',
}

const barLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--ink-3)',
  marginBottom: 6,
}

const controls: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const searchInput: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  border: '1px solid var(--border-2)',
  borderRadius: 6,
  fontSize: 12,
  background: '#fff',
  color: 'var(--ink)',
  outline: 'none',
  fontFamily: 'inherit',
}

const dropdown: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  zIndex: 100,
  background: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,.1)',
  margin: '2px 0 0',
  padding: 0,
  listStyle: 'none',
  maxHeight: 220,
  overflowY: 'auto',
}

const errorHint: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  zIndex: 100,
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 12,
  color: '#dc2626',
  marginTop: 2,
}

const dropdownItem: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  color: '#111827',
  cursor: 'pointer',
  borderBottom: '1px solid #f3f4f6',
}

function sportBtn(active: boolean): React.CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: active ? 'var(--navy)' : '#fff',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
    transition: 'all .15s',
    flexShrink: 0,
  }
}

const clearBtn: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: '#fff',
  color: 'var(--ink-2)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  flexShrink: 0,
  fontFamily: 'inherit',
}

function analyzeBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 16px',
    borderRadius: 6,
    border: 'none',
    background: disabled ? '#f3f4f6' : 'var(--brand)',
    color: disabled ? '#9ca3af' : '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all .15s',
    flexShrink: 0,
    fontFamily: 'inherit',
  }
}
