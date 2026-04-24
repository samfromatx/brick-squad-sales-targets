# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> Dashboard — targets >> loads and shows target card names
- Location: e2e/dashboard.spec.ts:10:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Mahomes 2017 Prizm')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Mahomes 2017 Prizm')

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | import { mockAuth, mockApi, MOCK_BOOTSTRAP } from './fixtures'
  3  | 
  4  | test.describe('Dashboard — targets', () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await mockAuth(page)
  7  |     await mockApi(page)
  8  |   })
  9  | 
  10 |   test('loads and shows target card names', async ({ page }) => {
  11 |     await page.goto('/dashboard')
> 12 |     await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
     |                                                        ^ Error: expect(locator).toBeVisible() failed
  13 |     await expect(page.getByText('Giannis 2013 Panini')).toBeVisible()
  14 |   })
  15 | 
  16 |   test('shows last updated date', async ({ page }) => {
  17 |     await page.goto('/dashboard')
  18 |     await expect(page.getByText('2026-04-23')).toBeVisible()
  19 |   })
  20 | 
  21 |   test('shows target count', async ({ page }) => {
  22 |     await page.goto('/dashboard')
  23 |     const count = MOCK_BOOTSTRAP.data.targets.length
  24 |     await expect(page.getByText(`${count} targets`)).toBeVisible()
  25 |   })
  26 | 
  27 |   test('shows NEW badge for new targets', async ({ page }) => {
  28 |     await page.goto('/dashboard')
  29 |     await expect(page.getByText('NEW')).toBeVisible()
  30 |   })
  31 | 
  32 |   test('shows trend percentage', async ({ page }) => {
  33 |     await page.goto('/dashboard')
  34 |     await expect(page.getByText(/\+12/)).toBeVisible()
  35 |   })
  36 | 
  37 |   test('groups targets by category — graded section visible', async ({ page }) => {
  38 |     await page.goto('/dashboard')
  39 |     await expect(page.getByRole('heading', { name: /graded/i })).toBeVisible()
  40 |   })
  41 | 
  42 |   test('groups targets by category — raw section visible', async ({ page }) => {
  43 |     await page.goto('/dashboard')
  44 |     await expect(page.getByRole('heading', { name: /raw/i })).toBeVisible()
  45 |   })
  46 | 
  47 |   test('shows loading state before data arrives', async ({ page }) => {
  48 |     // Delay the response so we can see the loading state
  49 |     await page.route('**/api/v1/bootstrap', async route => {
  50 |       await new Promise(r => setTimeout(r, 300))
  51 |       await route.fulfill({
  52 |         status: 200,
  53 |         contentType: 'application/json',
  54 |         body: JSON.stringify(MOCK_BOOTSTRAP),
  55 |       })
  56 |     })
  57 |     await page.goto('/dashboard')
  58 |     await expect(page.getByText(/loading/i)).toBeVisible()
  59 |     await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
  60 |   })
  61 | 
  62 |   test('shows error state when API fails', async ({ page }) => {
  63 |     await page.route('**/api/v1/bootstrap', async route => {
  64 |       await route.fulfill({ status: 500, body: 'Server error' })
  65 |     })
  66 |     await page.goto('/dashboard')
  67 |     await expect(page.getByText(/failed/i)).toBeVisible({ timeout: 5000 })
  68 |   })
  69 | })
  70 | 
```