# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: filtering.spec.ts >> Target filtering >> filter by basketball hides football targets
- Location: e2e/filtering.spec.ts:18:3

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
  2  | import { mockAuth, mockApi } from './fixtures'
  3  | 
  4  | test.describe('Target filtering', () => {
  5  |   test.beforeEach(async ({ page }) => {
  6  |     await mockAuth(page)
  7  |     await mockApi(page)
  8  |     await page.goto('/dashboard')
> 9  |     await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
     |                                                        ^ Error: expect(locator).toBeVisible() failed
  10 |   })
  11 | 
  12 |   test('filter by football hides basketball targets', async ({ page }) => {
  13 |     await page.selectOption('select:near(:text("Sport"))', 'football')
  14 |     await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
  15 |     await expect(page.getByText('Giannis 2013 Panini')).not.toBeVisible()
  16 |   })
  17 | 
  18 |   test('filter by basketball hides football targets', async ({ page }) => {
  19 |     await page.selectOption('select:near(:text("Sport"))', 'basketball')
  20 |     await expect(page.getByText('Giannis 2013 Panini')).toBeVisible()
  21 |     await expect(page.getByText('Mahomes 2017 Prizm')).not.toBeVisible()
  22 |   })
  23 | 
  24 |   test('filter by category graded hides raw targets', async ({ page }) => {
  25 |     await page.selectOption('select:near(:text("Category"))', 'graded')
  26 |     await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
  27 |     await expect(page.getByText('Jefferson 2020 Prizm')).not.toBeVisible()
  28 |   })
  29 | 
  30 |   test('filter by category raw shows only raw targets', async ({ page }) => {
  31 |     await page.selectOption('select:near(:text("Category"))', 'raw')
  32 |     await expect(page.getByText('Jefferson 2020 Prizm')).toBeVisible()
  33 |     await expect(page.getByText('Mahomes 2017 Prizm')).not.toBeVisible()
  34 |   })
  35 | 
  36 |   test('resetting sport filter to All shows all targets', async ({ page }) => {
  37 |     await page.selectOption('select:near(:text("Sport"))', 'football')
  38 |     await expect(page.getByText('Giannis 2013 Panini')).not.toBeVisible()
  39 |     await page.selectOption('select:near(:text("Sport"))', '')
  40 |     await expect(page.getByText('Giannis 2013 Panini')).toBeVisible()
  41 |   })
  42 | 
  43 |   test('combined sport + category filter', async ({ page }) => {
  44 |     await page.selectOption('select:near(:text("Sport"))', 'football')
  45 |     await page.selectOption('select:near(:text("Category"))', 'graded')
  46 |     await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
  47 |     await expect(page.getByText('Giannis 2013 Panini')).not.toBeVisible()
  48 |     await expect(page.getByText('Jefferson 2020 Prizm')).not.toBeVisible()
  49 |   })
  50 | })
  51 | 
```