import { useNavigate } from 'react-router-dom'
import { useBootstrap } from '../../features/targets/useBootstrap'

export function AppFooter() {
  const navigate = useNavigate()
  const { data } = useBootstrap()
  const lastUpdated = data?.last_updated ?? null

  return (
    <footer style={footerWrap}>
      <span style={footerText}>Brick Squad · Investment Targets</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {lastUpdated && (
          <span style={footerText}>Updated {lastUpdated}</span>
        )}
        <button
          onClick={() => navigate('/import')}
          style={importBtn}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--ink)'
            e.currentTarget.style.borderColor = 'var(--border-2)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--ink-3)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          Import JSON
        </button>
      </div>
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

const importBtn: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ink-3)',
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 5,
  padding: '3px 10px',
  cursor: 'pointer',
  transition: 'color 0.15s, border-color 0.15s',
  fontFamily: 'inherit',
}
