import { test, expect } from '@playwright/test'
import { mockAuth, mockApi, MOCK_ENTRIES } from './fixtures'

const NEW_ENTRY = {
  id: 'entry-new',
  user_id: 'user-1',
  card_name: 'Kelce 2017 Prizm',
  sport: 'football',
  grade: 'PSA 9',
  price_paid: 120,
  grading_cost: 25,
  target_sell: 200,
  actual_sale: null,
  sale_venue: null,
  purchase_date: '2026-04-20',
  notes: null,
  pc: false,
}

test.describe('Portfolio CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
    await mockApi(page)
    await page.goto('/portfolio')
    await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
  })

  test('shows existing portfolio entries', async ({ page }) => {
    await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
    await expect(page.getByText('PSA 10')).toBeVisible()
  })

  test('shows portfolio summary stats', async ({ page }) => {
    await expect(page.getByText('Active')).toBeVisible()
    await expect(page.getByText('Invested')).toBeVisible()
  })

  test('add entry — form opens and submits', async ({ page }) => {
    // After POST, GET returns the new entry
    await page.route('**/api/v1/portfolio-entries', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(NEW_ENTRY) })
      } else {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ data: [...MOCK_ENTRIES.data, NEW_ENTRY], next_cursor: null, has_more: false }),
        })
      }
    })

    await page.getByRole('button', { name: /add card/i }).click()
    await expect(page.getByRole('heading', { name: /add entry/i })).toBeVisible()

    await page.getByLabel(/card name/i).fill('Kelce 2017 Prizm')
    await page.getByLabel(/grade/i).fill('PSA 9')
    await page.getByLabel(/price paid/i).fill('120')
    await page.getByRole('button', { name: /^save$/i }).click()

    await expect(page.getByText('Kelce 2017 Prizm')).toBeVisible({ timeout: 5000 })
  })

  test('edit entry — form pre-fills existing values', async ({ page }) => {
    await page.getByRole('button', { name: /edit/i }).first().click()
    await expect(page.getByRole('heading', { name: /edit entry/i })).toBeVisible()
    const cardNameInput = page.getByLabel(/card name/i)
    await expect(cardNameInput).toHaveValue('Mahomes 2017 Prizm')
  })

  test('edit entry — submits PATCH and reflects change', async ({ page }) => {
    const updated = { ...MOCK_ENTRIES.data[0], notes: 'Updated note' }
    await page.route('**/api/v1/portfolio-entries/entry-1', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) })
    })
    await page.route('**/api/v1/portfolio-entries', async route => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: [updated], next_cursor: null, has_more: false }),
      })
    })

    await page.getByRole('button', { name: /edit/i }).first().click()
    await page.getByLabel(/notes/i).fill('Updated note')
    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByRole('heading', { name: /edit entry/i })).not.toBeVisible({ timeout: 3000 })
  })

  test('delete entry — confirms and removes row', async ({ page }) => {
    await page.route('**/api/v1/portfolio-entries/entry-1', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 204 })
      }
    })
    await page.route('**/api/v1/portfolio-entries', async route => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: [], next_cursor: null, has_more: false }),
      })
    })

    page.on('dialog', d => d.accept())
    await page.getByRole('button', { name: /del/i }).first().click()
    await expect(page.getByText('Mahomes 2017 Prizm')).not.toBeVisible({ timeout: 5000 })
  })

  test('mark sold — opens form with sale fields', async ({ page }) => {
    await page.getByRole('button', { name: /sold/i }).first().click()
    await expect(page.getByRole('heading', { name: /edit entry/i })).toBeVisible()
    // actual_sale and sale_venue fields should be pre-visible
    await expect(page.getByLabel(/actual sale/i)).toBeVisible()
    await expect(page.getByLabel(/sale venue/i)).toBeVisible()
  })

  test('cancel closes the form without saving', async ({ page }) => {
    await page.getByRole('button', { name: /add card/i }).click()
    await expect(page.getByRole('heading', { name: /add entry/i })).toBeVisible()
    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByRole('heading', { name: /add entry/i })).not.toBeVisible()
  })
})
