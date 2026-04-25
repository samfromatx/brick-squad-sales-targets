import { getAccessToken, refreshAccessToken } from './auth'
import type {
  EbaySearch,
  ExportSnapshot,
  PaginatedResponse,
  PortfolioAllocation,
  PortfolioEntry,
  PortfolioEntryCreate,
  PortfolioEntryUpdate,
  Target,
  TrendAnalysisResponse,
  TrendSearchResult,
} from './types'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? ''

class ApiClient {
  private async request<T>(
    path: string,
    options: RequestInit = {},
    retry = true,
  ): Promise<T> {
    const token = await getAccessToken()

    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })

    if (response.status === 401 && retry) {
      const newToken = await refreshAccessToken()
      if (!newToken) {
        window.location.href = '/sign-in'
        throw new Error('Session expired')
      }
      return this.request<T>(path, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${newToken}` },
      }, false)
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw Object.assign(new Error(body?.error?.message ?? response.statusText), {
        status: response.status,
        body,
      })
    }

    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  getBootstrap(): Promise<ExportSnapshot> {
    return this.request<ExportSnapshot>('/api/v1/bootstrap')
  }

  // ── Targets ────────────────────────────────────────────────────────────────

  getTargets(params?: { sport?: string; category?: string }): Promise<{ data: Target[] }> {
    const qs = new URLSearchParams()
    if (params?.sport) qs.set('sport', params.sport)
    if (params?.category) qs.set('category', params.category)
    const query = qs.toString() ? `?${qs.toString()}` : ''
    return this.request<{ data: Target[] }>(`/api/v1/targets${query}`)
  }

  getTarget(id: string): Promise<Target> {
    return this.request<Target>(`/api/v1/targets/${id}`)
  }

  // ── Portfolio allocations ──────────────────────────────────────────────────

  getPortfolios(): Promise<{ data: PortfolioAllocation[] }> {
    return this.request<{ data: PortfolioAllocation[] }>('/api/v1/portfolios')
  }

  // ── Portfolio entries ──────────────────────────────────────────────────────

  async getAllPortfolioEntries(): Promise<PaginatedResponse<PortfolioEntry>> {
    const all: PortfolioEntry[] = []
    let cursor: string | undefined
    do {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=200` : '?limit=200'
      const page = await this.request<PaginatedResponse<PortfolioEntry>>(`/api/v1/portfolio-entries${qs}`)
      all.push(...page.data)
      cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined
    } while (cursor)
    return { data: all, has_more: false, next_cursor: null }
  }

  getPortfolioEntries(cursor?: string): Promise<PaginatedResponse<PortfolioEntry>> {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    return this.request<PaginatedResponse<PortfolioEntry>>(`/api/v1/portfolio-entries${qs}`)
  }

  createPortfolioEntry(data: PortfolioEntryCreate): Promise<PortfolioEntry> {
    return this.request<PortfolioEntry>('/api/v1/portfolio-entries', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  updatePortfolioEntry(id: string, data: PortfolioEntryUpdate): Promise<PortfolioEntry> {
    return this.request<PortfolioEntry>(`/api/v1/portfolio-entries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  deletePortfolioEntry(id: string): Promise<void> {
    return this.request<void>(`/api/v1/portfolio-entries/${id}`, { method: 'DELETE' })
  }

  // ── eBay searches ──────────────────────────────────────────────────────────

  getEbaySearches(cursor?: string): Promise<PaginatedResponse<EbaySearch>> {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
    return this.request<PaginatedResponse<EbaySearch>>(`/api/v1/ebay-searches${qs}`)
  }

  // ── Trends ─────────────────────────────────────────────────────────────────

  searchCards(q: string, sport: Sport): Promise<TrendSearchResult[]> {
    const qs = new URLSearchParams({ q, sport, limit: '25' })
    return this.request<TrendSearchResult[]>(`/api/v1/trends/search?${qs.toString()}`)
  }

  getTrendAnalysis(card: string, sport: Sport): Promise<TrendAnalysisResponse> {
    const qs = new URLSearchParams({ card, sport })
    return this.request<TrendAnalysisResponse>(`/api/v1/trends/detail?${qs.toString()}`)
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  importTargets(payload: Record<string, unknown>): Promise<{ imported: string[]; last_updated: string }> {
    return this.request<{ imported: string[]; last_updated: string }>('/api/v1/imports/targets', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }
}

// Re-export Sport type so api.ts callers don't need a separate import
type Sport = 'football' | 'basketball'

export const api = new ApiClient()
