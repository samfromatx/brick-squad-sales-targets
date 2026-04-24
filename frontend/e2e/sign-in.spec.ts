import { test, expect } from '@playwright/test'

test.describe('Sign-in flow', () => {
  test('shows sign-in form at /sign-in', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
  })

  test('shows error on bad credentials', async ({ page }) => {
    // Mock Supabase auth to return an error
    await page.route('**/auth/v1/token**', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      })
    })

    await page.goto('/sign-in')
    await page.getByLabel(/email/i).fill('bad@example.com')
    await page.getByLabel(/password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5000 })
  })

  test('redirects to dashboard after successful sign-in', async ({ page }) => {
    // Mock Supabase auth token endpoint to return a valid session
    await page.route('**/auth/v1/token**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-token',
          refresh_token: 'mock-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: 'user-1', email: 'sam@test.com', aud: 'authenticated' },
        }),
      })
    })

    // Mock the API calls that dashboard will make
    await page.route('**/api/v1/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ schema_version: 'v1', data: { targets: [], portfolio_allocations: [], ebay_searches: [], portfolio_entries: [] }, user: { id: 'user-1', email: null }, generated_at: new Date().toISOString(), last_updated: null }),
      })
    })

    await page.goto('/sign-in')
    await page.getByLabel(/email/i).fill('sam@test.com')
    await page.getByLabel(/password/i).fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/dashboard/, { timeout: 5000 })
  })
})
