import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { NavBar } from './layout/NavBar'
import { DashboardPage } from '../pages/DashboardPage'
import { ImportPage } from '../pages/ImportPage'
import { PortfolioPage } from '../pages/PortfolioPage'
import { SignInPage } from '../pages/SignInPage'
import { TrendPage } from '../pages/TrendPage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/trends" element={<TrendPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
      </Routes>
    </BrowserRouter>
  )
}
