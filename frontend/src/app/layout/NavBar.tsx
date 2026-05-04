import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { signOut } from '../../lib/auth'
import { useAuth } from '../../lib/authContext'

const NAV_TABS = [
  { to: '/card-targets', label: 'Card Targets' },
  { to: '/trends',       label: 'Card Analysis' },
  { to: '/overview',     label: 'Playbook' },
  { to: '/portfolio',    label: 'My Portfolio' },
]

export function NavBar() {
  const { session } = useAuth()
  const email = session?.user.email ?? null
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/sign-in')
  }

  return (
    <header style={headerWrap}>
      {/* Top bar — 48px */}
      <div style={topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NavLink to="/card-targets" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <span style={logoMark}>BS</span>
            <span style={logoText}>Brick Squad</span>
          </NavLink>
        </div>

        {/* Desktop right side */}
        <div className="nav-desktop-only" style={{ alignItems: 'center', gap: 10 }}>
          {email && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{email}</span>}
          {email && (
            <button onClick={() => void handleSignOut()} style={signOutBtn}>Sign out</button>
          )}
        </div>

        {/* Hamburger — mobile only */}
        <button
          className="nav-mobile-only"
          onClick={() => setMenuOpen(o => !o)}
          style={hamburgerBtn}
          aria-label="Menu"
        >
          <span style={hamburgerLine(menuOpen, 0)} />
          <span style={hamburgerLine(menuOpen, 1)} />
          <span style={hamburgerLine(menuOpen, 2)} />
        </button>
      </div>

      {/* Desktop tab row */}
      <nav className="nav-desktop-only nav-tab-row" style={tabRow}>
        {NAV_TABS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => tabStyle(isActive)}
          >
            {({ isActive }) => (
              <>
                {label}
                {isActive && <span style={tabUnderline} />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div style={mobileMenu}>
          {NAV_TABS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              style={({ isActive }) => mobileLinkStyle(isActive)}
            >
              {label}
            </NavLink>
          ))}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--ink-3)' }}>
            {email ?? ''}
          </div>
          <button
            onClick={() => { setMenuOpen(false); void handleSignOut() }}
            style={mobileSignOut}
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  )
}

const headerWrap: React.CSSProperties = {
  background: 'var(--bg)',
  borderBottom: '1px solid var(--border)',
  position: 'sticky',
  top: 0,
  zIndex: 100,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

const topBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 20px',
  height: 48,
}

const logoMark: React.CSSProperties = {
  width: 28,
  height: 28,
  background: 'var(--brand)',
  color: '#fff',
  borderRadius: 6,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '-0.5px',
  flexShrink: 0,
  lineHeight: 1,
}

const logoText: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  color: 'var(--ink)',
  letterSpacing: '-0.3px',
}

const signOutBtn: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--ink-3)',
  background: 'none',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '4px 10px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const hamburgerBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '4px',
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  width: 28,
}

function hamburgerLine(open: boolean, idx: number): React.CSSProperties {
  return {
    display: 'block',
    height: 2,
    background: 'var(--ink-2)',
    borderRadius: 2,
    transition: 'transform 0.2s, opacity 0.2s',
    transformOrigin: 'center',
    ...(open && idx === 0 ? { transform: 'translateY(7px) rotate(45deg)' } : {}),
    ...(open && idx === 1 ? { opacity: 0 } : {}),
    ...(open && idx === 2 ? { transform: 'translateY(-7px) rotate(-45deg)' } : {}),
  }
}

const tabRow: React.CSSProperties = {
  gap: 0,
  padding: '0 16px',
  borderTop: '1px solid var(--border)',
}

function tabStyle(isActive: boolean): React.CSSProperties {
  return {
    position: 'relative',
    display: 'inline-block',
    padding: '9px 14px',
    fontSize: 13,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? 'var(--brand)' : 'var(--ink-3)',
    textDecoration: 'none',
    letterSpacing: isActive ? '-0.1px' : '0',
    transition: 'color 0.15s',
    whiteSpace: 'nowrap',
    lineHeight: 1,
    marginBottom: -1,
  }
}

const tabUnderline: React.CSSProperties = {
  position: 'absolute',
  bottom: -1,
  left: 14,
  right: 14,
  height: 2,
  background: 'var(--brand)',
  borderRadius: '2px 2px 0 0',
  display: 'block',
}

const mobileMenu: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg)',
  borderTop: '1px solid var(--border)',
  padding: '4px 0 12px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
}

function mobileLinkStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '11px 16px',
    fontSize: 14,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? 'var(--brand)' : 'var(--ink)',
    background: isActive ? '#fff5f3' : 'none',
    textDecoration: 'none',
  }
}

const mobileSignOut: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 16px',
  fontSize: 13,
  color: 'var(--ink-3)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
