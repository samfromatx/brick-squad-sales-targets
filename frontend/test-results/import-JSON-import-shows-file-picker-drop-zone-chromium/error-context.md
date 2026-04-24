# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: import.spec.ts >> JSON import >> shows file picker drop zone
- Location: e2e/import.spec.ts:37:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /import targets/i })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: /import targets/i })

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | import { mockAuth, mockApi } from './fixtures'
  3  | import path from 'path'
  4  | import fs from 'fs'
  5  | import os from 'os'
  6  | 
  7  | const VALID_PAYLOAD = {
  8  |   last_updated: '2026-04-23',
  9  |   football_graded: [
  10 |     {
  11 |       rank: 1, card: 'Mahomes 2017 Prizm', grade: 'PSA 10',
  12 |       target: 280, max: 320, trend: '+12%',
  13 |       vol: 'high', sell_at: 400, rationale: 'Test', new: false,
  14 |     },
  15 |   ],
  16 | }
  17 | 
  18 | test.describe('JSON import', () => {
  19 |   let tmpFile: string
  20 | 
  21 |   test.beforeAll(() => {
  22 |     tmpFile = path.join(os.tmpdir(), 'test-import.json')
  23 |     fs.writeFileSync(tmpFile, JSON.stringify(VALID_PAYLOAD))
  24 |   })
  25 | 
  26 |   test.afterAll(() => {
  27 |     if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  28 |   })
  29 | 
  30 |   test.beforeEach(async ({ page }) => {
  31 |     await mockAuth(page)
  32 |     await mockApi(page)
  33 |     await page.goto('/import')
> 34 |     await expect(page.getByRole('heading', { name: /import targets/i })).toBeVisible()
     |                                                                          ^ Error: expect(locator).toBeVisible() failed
  35 |   })
  36 | 
  37 |   test('shows file picker drop zone', async ({ page }) => {
  38 |     await expect(page.getByText(/click or drag/i)).toBeVisible()
  39 |   })
  40 | 
  41 |   test('import button is disabled before file is selected', async ({ page }) => {
  42 |     await expect(page.getByRole('button', { name: /^import$/i })).toBeDisabled()
  43 |   })
  44 | 
  45 |   test('successful import shows confirmation', async ({ page }) => {
  46 |     await page.route('**/api/v1/imports/targets', async route => {
  47 |       await route.fulfill({
  48 |         status: 200,
  49 |         contentType: 'application/json',
  50 |         body: JSON.stringify({ imported: ['football_graded'], last_updated: '2026-04-23' }),
  51 |       })
  52 |     })
  53 | 
  54 |     await page.locator('input[type="file"]').setInputFiles(tmpFile)
  55 |     await expect(page.getByRole('button', { name: /^import$/i })).toBeEnabled({ timeout: 2000 })
  56 |     await page.getByRole('button', { name: /^import$/i }).click()
  57 |     await expect(page.getByText(/imported/i)).toBeVisible({ timeout: 5000 })
  58 |     await expect(page.getByText('football_graded')).toBeVisible()
  59 |   })
  60 | 
  61 |   test('failed import shows error message', async ({ page }) => {
  62 |     await page.route('**/api/v1/imports/targets', async route => {
  63 |       await route.fulfill({
  64 |         status: 422,
  65 |         contentType: 'application/json',
  66 |         body: JSON.stringify({ error: { code: 'validation_error', message: 'No recognised sections', request_id: 'r1' } }),
  67 |       })
  68 |     })
  69 | 
  70 |     await page.locator('input[type="file"]').setInputFiles(tmpFile)
  71 |     await page.getByRole('button', { name: /^import$/i }).click()
  72 |     await expect(page.getByText(/no recognised|error|failed/i)).toBeVisible({ timeout: 5000 })
  73 |   })
  74 | 
  75 |   test('shows format reference in collapsible', async ({ page }) => {
  76 |     await expect(page.getByText(/expected json format/i)).toBeVisible()
  77 |     await page.getByText(/expected json format/i).click()
  78 |     await expect(page.getByText(/last_updated/)).toBeVisible()
  79 |   })
  80 | 
  81 |   test('clear button removes file selection', async ({ page }) => {
  82 |     await page.locator('input[type="file"]').setInputFiles(tmpFile)
  83 |     await expect(page.getByRole('button', { name: /clear/i })).toBeVisible()
  84 |     await page.getByRole('button', { name: /clear/i }).click()
  85 |     await expect(page.getByText(/click or drag/i)).toBeVisible()
  86 |     await expect(page.getByRole('button', { name: /^import$/i })).toBeDisabled()
  87 |   })
  88 | })
  89 | 
```