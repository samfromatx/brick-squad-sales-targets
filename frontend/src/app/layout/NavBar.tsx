import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase, signOut } from '../../lib/auth'

const TAB_LINKS = [
  { to: '/overview',   label: 'Overview' },
  { to: '/dashboard',  label: '🏈 Targets' },
  { to: '/tools',      label: '🔧 Tools' },
  { to: '/ebay',       label: '🛒 eBay' },
]

export function NavBar() {
  const [email, setEmail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <header style={headerWrap}>
      {/* Top bar */}
      <div style={topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={logo}>🏀🏈 Brick Squad — Investment Target List</span>
          <div className="nav-top-actions">
            <NavLink to="/portfolio" style={myPortfolioBtn}>My Portfolio</NavLink>
            <NavLink to="/import" style={importBtn}>Import JSON</NavLink>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="nav-top-user">
            {email && <span style={{ fontSize: 12, color: '#64748b' }}>{email}</span>}
            {email && (
              <button onClick={handleSignOut} style={signOutBtn}>Sign Out</button>
            )}
          </div>
          {/* Hamburger — shown on mobile via CSS */}
          <button
            className="nav-hamburger"
            onClick={() => setMenuOpen(o => !o)}
            style={hamburgerBtn}
            aria-label="Toggle navigation menu"
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Desktop tab nav */}
      <nav className="nav-tab-row" style={tabNav}>
        {TAB_LINKS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => tabStyle(isActive)}
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div style={mobileMenuWrap}>
          {TAB_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              style={({ isActive }) => mobileLink(isActive)}
            >
              {label}
            </NavLink>
          ))}
          <div style={{ borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />
          <NavLink to="/portfolio" onClick={() => setMenuOpen(false)} style={() => mobileLink(false)}>
            My Portfolio
          </NavLink>
          <NavLink to="/import" onClick={() => setMenuOpen(false)} style={() => mobileLink(false)}>
            Import JSON
          </NavLink>
          {email && (
            <>
              <div style={{ borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />
              <span style={{ padding: '8px 20px', fontSize: 12, color: '#64748b', display: 'block' }}>{email}</span>
              <button
                onClick={() => { setMenuOpen(false); void handleSignOut() }}
                style={mobileSignOutBtn}
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      )}
    </header>
  )
}

const headerWrap: React.CSSProperties = {
  background: '#fff',
  borderBottom: '1px solid #e2e8f0',
  position: 'sticky',
  top: 0,
  zIndex: 100,
}

const topBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 20px',
  borderBottom: '1px solid #f1f5f9',
}

const logo: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 15,
  color: '#1e293b',
}

const myPortfolioBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: '#475569',
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  padding: '4px 10px',
  textDecoration: 'none',
  cursor: 'pointer',
}

const importBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#fff',
  background: '#2563eb',
  border: 'none',
  borderRadius: 6,
  padding: '4px 12px',
  textDecoration: 'none',
  cursor: 'pointer',
}

const signOutBtn: React.CSSProperties = {
  fontSize: 12,
  color: '#64748b',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 6px',
}

const tabNav: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  padding: '0 20px',
}

const hamburgerBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 20,
  cursor: 'pointer',
  color: '#475569',
  padding: '4px 6px',
  lineHeight: 1,
}

const mobileMenuWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: '#fff',
  borderTop: '1px solid #e2e8f0',
  padding: '8px 0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

function mobileLink(isActive: boolean): React.CSSProperties {
  return {
    display: 'block',
    padding: '10px 20px',
    fontSize: 14,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#2563eb' : '#1e293b',
    textDecoration: 'none',
    background: isActive ? '#eff6ff' : 'transparent',
  }
}

const mobileSignOutBtn: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 20px',
  fontSize: 14,
  color: '#64748b',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

function tabStyle(isActive: boolean): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#2563eb' : '#64748b',
    textDecoration: 'none',
    borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
    transition: 'color 0.1s, border-color 0.1s',
  }
}
