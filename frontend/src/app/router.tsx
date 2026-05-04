import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { NavBar } from './layout/NavBar'
import { AppFooter } from './layout/AppFooter'
import { RequireAuth } from './RequireAuth'
import { AuthProvider } from '../lib/authContext'
import { DashboardPage } from '../pages/DashboardPage'
import { ImportPage } from '../pages/ImportPage'
import { PortfolioPage } from '../pages/PortfolioPage'
import { SignInPage } from '../pages/SignInPage'
import { TrendPage } from '../pages/TrendPage'
import { OverviewPage } from '../pages/OverviewPage'
import { ToolsPage } from '../pages/ToolsPage'
import { EbayPage } from '../pages/EbayPage'
import { CardTargetsPage } from '../pages/CardTargetsPage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <NavBar />
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/sign-in" element={<SignInPage />} />
              <Route path="/" element={<Navigate to="/card-targets" replace />} />
              <Route path="/overview"     element={<RequireAuth><OverviewPage /></RequireAuth>} />
              <Route path="/dashboard"    element={<RequireAuth><DashboardPage /></RequireAuth>} />
              <Route path="/tools/*"      element={<RequireAuth><ToolsPage /></RequireAuth>} />
              <Route path="/ebay"         element={<RequireAuth><EbayPage /></RequireAuth>} />
              <Route path="/portfolio"    element={<RequireAuth><PortfolioPage /></RequireAuth>} />
              <Route path="/trends"       element={<RequireAuth><TrendPage /></RequireAuth>} />
              <Route path="/import"       element={<RequireAuth><ImportPage /></RequireAuth>} />
              <Route path="/card-targets" element={<RequireAuth><CardTargetsPage /></RequireAuth>} />
            </Routes>
          </main>
          <AppFooter />
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
