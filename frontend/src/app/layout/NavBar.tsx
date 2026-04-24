import { NavLink } from 'react-router-dom'

const LINKS = [
  { to: '/dashboard', label: 'Targets' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/trends', label: 'Trends & eBay' },
  { to: '/import', label: 'Import' },
]

export function NavBar() {
  return (
    <nav style={nav}>
      <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15, marginRight: 24 }}>
        Brick Squad
      </span>
      {LINKS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          style={({ isActive }) => linkStyle(isActive)}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

const nav: React.CSSProperties = {
  background: '#0f172a', borderBottom: '1px solid #1e293b',
  padding: '0 16px', display: 'flex', alignItems: 'center',
  height: 48, gap: 4, position: 'sticky', top: 0, zIndex: 10,
}

function linkStyle(isActive: boolean): React.CSSProperties {
  return {
    color: isActive ? '#f1f5f9' : '#64748b',
    textDecoration: 'none', fontSize: 13, fontWeight: isActive ? 600 : 400,
    padding: '4px 10px', borderRadius: 4,
    background: isActive ? '#1e293b' : 'transparent',
  }
}
