import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { BounceBackTable } from '../features/bounceback/BounceBackTable'
import { CardShowTable } from '../features/cardshow/CardShowTable'
import { ReadyToSellTable } from '../features/readytosell/ReadyToSellTable'

const SUB_TABS = [
  { to: '/tools/bounce-back',   label: 'Bounce Back'   },
  { to: '/tools/ready-to-sell', label: 'Ready to Sell' },
  { to: '/tools/card-show',     label: 'Card Show'     },
]

export function ToolsPage() {
  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 20px', display: 'flex', gap: 0 }}>
        {SUB_TABS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'inline-block',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#2563eb' : '#64748b',
              textDecoration: 'none',
              borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
            })}
          >
            {label}
          </NavLink>
        ))}
      </div>
      <div className="page-content">
        <Routes>
          <Route index element={<Navigate to="bounce-back" replace />} />
          <Route path="bounce-back"   element={<BounceBackTable />} />
          <Route path="ready-to-sell" element={<ReadyToSellTable />} />
          <Route path="card-show"     element={<CardShowTable />} />
        </Routes>
      </div>
    </div>
  )
}
