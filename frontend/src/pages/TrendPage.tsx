import { useSearchParams } from 'react-router-dom'
import { TrendAnalysisResult } from '../features/trends/TrendAnalysisResult'
import { useTrendAnalysis } from '../features/trends/useTrends'
import type { Sport } from '../lib/types'

export function TrendPage() {
  const [params] = useSearchParams()
  const card  = params.get('card')  ?? ''
  const sport = (params.get('sport') ?? 'football') as Sport

  const { data, isLoading, isError, error } = useTrendAnalysis(card, sport)

  const err = error as (Error & { status?: number }) | null

  if (!card) {
    return (
      <div className="page-content">
        <div style={emptyState}>
          <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>
            Use the search bar above to find a card and click <strong>Analyze</strong>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content">
      {isLoading && (
        <div style={emptyState}>
          <div style={spinner} />
          <p style={{ color: 'var(--ink-3)', fontSize: 13, marginTop: 12 }}>Analyzing market data…</p>
        </div>
      )}

      {isError && (
        <div style={errBox}>
          {err?.status === 404
            ? 'No market data found for this card.'
            : 'Analysis failed — please try again.'}
        </div>
      )}

      {data && !isLoading && (
        <TrendAnalysisResult card={card} sport={sport} data={data} />
      )}
    </div>
  )
}

const emptyState: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '60px 24px',
  textAlign: 'center',
}

const spinner: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '3px solid var(--border)',
  borderTopColor: 'var(--brand)',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
}

const errBox: React.CSSProperties = {
  background: '#fcebeb',
  border: '1px solid #f09595',
  borderLeft: '4px solid #dc2626',
  borderRadius: 8,
  padding: '12px 16px',
  fontSize: 13,
  color: '#a32d2d',
  maxWidth: 480,
}
