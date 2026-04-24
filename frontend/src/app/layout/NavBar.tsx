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
    navigate('/sign-in')
  }

  return (
    <header style={headerWrap}>
      {/* Top bar */}
      <div style={topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={logo}>🏀🏈 Brick Squad — Investment Target List</span>
          <NavLink to="/portfolio" style={myPortfolioBtn}>My Portfolio</NavLink>
          <NavLink to="/import" style={importBtn}>Import JSON</NavLink>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {email && <span style={{ fontSize: 12, color: '#64748b' }}>{email}</span>}
          {email && (
            <button onClick={handleSignOut} style={signOutBtn}>Sign Out</button>
          )}
        </div>
      </div>

      {/* Tab nav */}
      <nav style={tabNav}>
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
