import { useBootstrap } from '../../features/targets/useBootstrap'

export function AppFooter() {
  const { data } = useBootstrap()
  const lastUpdated = data?.last_updated ?? null

  return (
    <footer style={footerWrap}>
      <span style={footerText}>Brick Squad · Investment Targets</span>
      {lastUpdated && (
        <span style={footerText}>Updated {lastUpdated}</span>
      )}
    </footer>
  )
}

const footerWrap: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  background: 'var(--bg)',
  padding: '10px 20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 8,
}

const footerText: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ink-3)',
}

