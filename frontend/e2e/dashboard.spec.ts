import { test, expect } from '@playwright/test'
import { mockAuth, mockApi, MOCK_BOOTSTRAP } from './fixtures'

test.describe('Dashboard — targets', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
    await mockApi(page)
  })

  test('loads and shows target card names', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
    await expect(page.getByText('Giannis 2013 Panini')).toBeVisible()
  })

  test('shows last updated date', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText('2026-04-23')).toBeVisible()
  })

  test('shows target count', async ({ page }) => {
    await page.goto('/dashboard')
    const count = MOCK_BOOTSTRAP.data.targets.length
    await expect(page.getByText(`${count} targets`)).toBeVisible()
  })

  test('shows NEW badge for new targets', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText('NEW')).toBeVisible()
  })

  test('shows trend percentage', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByText(/\+12/)).toBeVisible()
  })

  test('groups targets by category — graded section visible', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: /graded/i })).toBeVisible()
  })

  test('groups targets by category — raw section visible', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: /raw/i })).toBeVisible()
  })

  test('shows loading state before data arrives', async ({ page }) => {
    // Delay the response so we can see the loading state
    await page.route('**/api/v1/bootstrap', async route => {
      await new Promise(r => setTimeout(r, 300))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_BOOTSTRAP),
      })
    })
    await page.goto('/dashboard')
    await expect(page.getByText(/loading/i)).toBeVisible()
    await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
  })

  test('shows error state when API fails', async ({ page }) => {
    await page.route('**/api/v1/bootstrap', async route => {
      await route.fulfill({ status: 500, body: 'Server error' })
    })
    await page.goto('/dashboard')
    await expect(page.getByText(/failed/i)).toBeVisible({ timeout: 5000 })
  })
})
