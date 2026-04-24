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
    await page.selectOption('select:near(:text("Sport"))', 'football')
    await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
    await expect(page.getByText('Giannis 2013 Panini')).not.toBeVisible()
  })

  test('filter by basketball hides football targets', async ({ page }) => {
    await page.selectOption('select:near(:text("Sport"))', 'basketball')
    await expect(page.getByText('Giannis 2013 Panini')).toBeVisible()
    await expect(page.getByText('Mahomes 2017 Prizm')).not.toBeVisible()
  })

  test('filter by category graded hides raw targets', async ({ page }) => {
    await page.selectOption('select:near(:text("Category"))', 'graded')
    await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
    await expect(page.getByText('Jefferson 2020 Prizm')).not.toBeVisible()
  })

  test('filter by category raw shows only raw targets', async ({ page }) => {
    await page.selectOption('select:near(:text("Category"))', 'raw')
    await expect(page.getByText('Jefferson 2020 Prizm')).toBeVisible()
    await expect(page.getByText('Mahomes 2017 Prizm')).not.toBeVisible()
  })

  test('resetting sport filter to All shows all targets', async ({ page }) => {
    await page.selectOption('select:near(:text("Sport"))', 'football')
    await expect(page.getByText('Giannis 2013 Panini')).not.toBeVisible()
    await page.selectOption('select:near(:text("Sport"))', '')
    await expect(page.getByText('Giannis 2013 Panini')).toBeVisible()
  })

  test('combined sport + category filter', async ({ page }) => {
    await page.selectOption('select:near(:text("Sport"))', 'football')
    await page.selectOption('select:near(:text("Category"))', 'graded')
    await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
    await expect(page.getByText('Giannis 2013 Panini')).not.toBeVisible()
    await expect(page.getByText('Jefferson 2020 Prizm')).not.toBeVisible()
  })
})
