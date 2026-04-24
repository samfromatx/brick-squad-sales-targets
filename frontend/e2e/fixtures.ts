import type { Page } from '@playwright/test'

// ── Shared mock data ──────────────────────────────────────────────────────────

export const MOCK_SESSION = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: 'user-1', email: 'sam@test.com', aud: 'authenticated', role: 'authenticated' },
}

export const MOCK_BOOTSTRAP = {
  schema_version: 'v1',
  generated_at: '2026-04-23T12:00:00Z',
  last_updated: '2026-04-23',
  user: { id: 'user-1', email: 'sam@test.com' },
  data: {
    targets: [
      {
        id: 'fb-mahomes-1',
        sport: 'football',
        category: 'graded',
        rank: 1,
        card_name: 'Mahomes 2017 Prizm',
        grade: 'PSA 10',
        target_price: 280,
        max_price: 320,
        trend_pct: 12.0,
        sell_at: 400,
        is_new: false,
        last_updated: '2026-04-23',
        raw_metrics: null,
        bounce_back_metrics: null,
        volume_count: null,
        volume_window_days: null,
        rationale: 'Liquid flagship',
      },
      {
        id: 'bb-giannis-1',
        sport: 'basketball',
        category: 'graded',
        rank: 1,
        card_name: 'Giannis 2013 Panini',
        grade: 'PSA 10',
        target_price: 150,
        max_price: 180,
        trend_pct: -5.0,
        sell_at: 220,
        is_new: true,
        last_updated: '2026-04-23',
        raw_metrics: null,
        bounce_back_metrics: null,
        volume_count: null,
        volume_window_days: null,
        rationale: 'Dip buy',
      },
      {
        id: 'fb-raw-1',
        sport: 'football',
        category: 'raw',
        rank: 1,
        card_name: 'Jefferson 2020 Prizm',
        grade: null,
        target_price: null,
        max_price: null,
        trend_pct: 8.0,
        sell_at: null,
        is_new: false,
        last_updated: '2026-04-23',
        raw_metrics: { target_raw: 30, max_raw: 40, est_psa9: 80, est_psa10: 150, gem_rate: 0.35, roi: 2.1 },
        bounce_back_metrics: null,
        volume_count: null,
        volume_window_days: null,
        rationale: 'Raw play',
      },
    ],
    portfolio_allocations: [
      {
        tier: '1000',
        description: null,
        total: 1000,
        allocations: [{ card_name: 'Mahomes 2017 Prizm', budget: 280, thesis: 'graded', card_type: null, cost_each: null, qty: null, subtotal: null }],
      },
    ],
    ebay_searches: [
      { id: 'eb1', sport: 'football', category: 'graded', rank: 1, card_name: 'Mahomes Prizm', search_text: 'mahomes 2017 prizm psa 10' },
    ],
    portfolio_entries: [],
  },
}

export const MOCK_ENTRIES = {
  data: [
    {
      id: 'entry-1',
      user_id: 'user-1',
      card_name: 'Mahomes 2017 Prizm',
      sport: 'football',
      grade: 'PSA 10',
      price_paid: 250,
      grading_cost: 0,
      target_sell: 350,
      actual_sale: null,
      sale_venue: null,
      purchase_date: '2026-01-15',
      notes: null,
      pc: false,
    },
  ],
  next_cursor: null,
  has_more: false,
}

export const MOCK_PORTFOLIOS = { data: MOCK_BOOTSTRAP.data.portfolio_allocations }

export const MOCK_EBAY = {
  data: MOCK_BOOTSTRAP.data.ebay_searches,
  next_cursor: null,
  has_more: false,
}

// ── Route mocking helpers ─────────────────────────────────────────────────────

/**
 * Mock all Supabase auth calls so the app sees a logged-in user.
 * The Supabase JS client calls its own REST endpoints under /auth/v1/.
 */
export async function mockAuth(page: Page) {
  // Supabase getSession reads from localStorage
  await page.addInitScript((session) => {
    const key = 'sb-azvoynuwnmejqwzscmnc-auth-token'
    localStorage.setItem(key, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: session.user,
    }))
  }, MOCK_SESSION)

  // Intercept any Supabase auth refresh calls
  await page.route('**/auth/v1/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...MOCK_SESSION, session: MOCK_SESSION }),
    })
  })
}

/** Mock all backend API routes with fixture data. */
export async function mockApi(page: Page, overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    '**/api/v1/bootstrap': MOCK_BOOTSTRAP,
    '**/api/v1/targets': { data: MOCK_BOOTSTRAP.data.targets },
    '**/api/v1/portfolios': MOCK_PORTFOLIOS,
    '**/api/v1/portfolio-entries': MOCK_ENTRIES,
    '**/api/v1/ebay-searches': MOCK_EBAY,
    '**/api/v1/trends/search**': { data: [{ card: 'Mahomes 2017 Prizm', sport: 'football' }] },
    '**/api/v1/trends/detail**': { card: 'Mahomes 2017 Prizm', sport: 'football', windows: [] },
    ...overrides,
  }

  for (const [pattern, body] of Object.entries(routes)) {
    await page.route(pattern, async route => {
      const method = route.request().method()
      if (method === 'POST') {
        // Let the test override POST responses if needed
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(overrides[pattern] ?? { imported: ['football_graded'], last_updated: '2026-04-23' }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        })
      }
    })
  }
}
