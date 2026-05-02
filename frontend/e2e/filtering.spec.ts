import { test, expect } from '@playwright/test'
import { mockAuth, mockApi } from './fixtures'

test.describe('Target filtering', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
    await mockApi(page)
    await page.goto('/dashboard')
    await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
  })

  test('filter by football hides basketball targets', async ({ page }) => {
    await page.click('button:has-text("Football")')
    await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
    await expect(page.getByText('Giannis 2013 Panini')).not.toBeVisible()
  })

  test('filter by basketball hides football targets', async ({ page }) => {
    await page.click('button:has-text("Basketball")')
    await expect(page.getByText('Giannis 2013 Panini')).toBeVisible()
    await expect(page.getByText('Mahomes 2017 Prizm')).not.toBeVisible()
  })

  test('filter by category graded hides raw targets', async ({ page }) => {
    await page.click('button:has-text("Graded")')
    await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
    await expect(page.getByText('Jefferson 2020 Prizm')).not.toBeVisible()
  })

  test('filter by category raw shows only raw targets', async ({ page }) => {
    await page.click('button:has-text("Raw")')
    await expect(page.getByText('Jefferson 2020 Prizm')).toBeVisible()
    await expect(page.getByText('Mahomes 2017 Prizm')).not.toBeVisible()
  })

  test('resetting sport filter to All shows all targets', async ({ page }) => {
    await page.click('button:has-text("Football")')
    await expect(page.getByText('Giannis 2013 Panini')).not.toBeVisible()
    await page.click('button:has-text("Football")')
    await expect(page.getByText('Giannis 2013 Panini')).toBeVisible()
  })

  test('combined sport + category filter', async ({ page }) => {
    await page.click('button:has-text("Football")')
    await page.click('button:has-text("Graded")')
    await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
    await expect(page.getByText('Giannis 2013 Panini')).not.toBeVisible()
    await expect(page.getByText('Jefferson 2020 Prizm')).not.toBeVisible()
  })
})
