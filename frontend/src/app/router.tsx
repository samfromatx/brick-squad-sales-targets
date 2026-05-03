import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { NavBar } from './layout/NavBar'
import { AppFooter } from './layout/AppFooter'
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
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <NavBar />
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/card-targets" replace />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tools/*" element={<ToolsPage />} />
            <Route path="/ebay" element={<EbayPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/trends" element={<TrendPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/card-targets" element={<CardTargetsPage />} />
            <Route path="/sign-in" element={<SignInPage />} />
          </Routes>
        </main>
        <AppFooter />
      </div>
    </BrowserRouter>
  )
}
