import { test, expect } from '@playwright/test'
import { mockAuth, mockApi } from './fixtures'
import path from 'path'
import fs from 'fs'
import os from 'os'

const VALID_PAYLOAD = {
  last_updated: '2026-04-23',
  football_graded: [
    {
      rank: 1, card: 'Mahomes 2017 Prizm', grade: 'PSA 10',
      target: 280, max: 320, trend: '+12%',
      vol: 'high', sell_at: 400, rationale: 'Test', new: false,
    },
  ],
}

test.describe('JSON import', () => {
  let tmpFile: string

  test.beforeAll(() => {
    tmpFile = path.join(os.tmpdir(), 'test-import.json')
    fs.writeFileSync(tmpFile, JSON.stringify(VALID_PAYLOAD))
  })

  test.afterAll(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  })

  test.beforeEach(async ({ page }) => {
    await mockAuth(page)
    await mockApi(page)
    await page.goto('/import')
    await expect(page.getByRole('heading', { name: /import targets/i })).toBeVisible()
  })

  test('shows file picker drop zone', async ({ page }) => {
    await expect(page.getByText(/click or drag/i)).toBeVisible()
  })

  test('import button is disabled before file is selected', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^import$/i })).toBeDisabled()
  })

  test('successful import shows confirmation', async ({ page }) => {
    await page.route('**/api/v1/imports/targets', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ imported: ['football_graded'], last_updated: '2026-04-23' }),
      })
    })

    await page.locator('input[type="file"]').setInputFiles(tmpFile)
    await expect(page.getByRole('button', { name: /^import$/i })).toBeEnabled({ timeout: 2000 })
    await page.getByRole('button', { name: /^import$/i }).click()
    await expect(page.getByText(/imported/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('football_graded')).toBeVisible()
  })

  test('failed import shows error message', async ({ page }) => {
    await page.route('**/api/v1/imports/targets', async route => {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'validation_error', message: 'No recognised sections', request_id: 'r1' } }),
      })
    })

    await page.locator('input[type="file"]').setInputFiles(tmpFile)
    await page.getByRole('button', { name: /^import$/i }).click()
    await expect(page.getByText(/no recognised|error|failed/i)).toBeVisible({ timeout: 5000 })
  })

  test('shows format reference in collapsible', async ({ page }) => {
    await expect(page.getByText(/expected json format/i)).toBeVisible()
    await page.getByText(/expected json format/i).click()
    await expect(page.getByText(/last_updated/)).toBeVisible()
  })

  test('clear button removes file selection', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(tmpFile)
    await expect(page.getByRole('button', { name: /clear/i })).toBeVisible()
    await page.getByRole('button', { name: /clear/i }).click()
    await expect(page.getByText(/click or drag/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /^import$/i })).toBeDisabled()
  })
})
