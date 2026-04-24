# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: portfolio.spec.ts >> Portfolio CRUD >> delete entry — confirms and removes row
- Location: e2e/portfolio.spec.ts:87:3

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
  1   | import { test, expect } from '@playwright/test'
  2   | import { mockAuth, mockApi, MOCK_ENTRIES } from './fixtures'
  3   | 
  4   | const NEW_ENTRY = {
  5   |   id: 'entry-new',
  6   |   user_id: 'user-1',
  7   |   card_name: 'Kelce 2017 Prizm',
  8   |   sport: 'football',
  9   |   grade: 'PSA 9',
  10  |   price_paid: 120,
  11  |   grading_cost: 25,
  12  |   target_sell: 200,
  13  |   actual_sale: null,
  14  |   sale_venue: null,
  15  |   purchase_date: '2026-04-20',
  16  |   notes: null,
  17  |   pc: false,
  18  | }
  19  | 
  20  | test.describe('Portfolio CRUD', () => {
  21  |   test.beforeEach(async ({ page }) => {
  22  |     await mockAuth(page)
  23  |     await mockApi(page)
  24  |     await page.goto('/portfolio')
> 25  |     await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
      |                                                        ^ Error: expect(locator).toBeVisible() failed
  26  |   })
  27  | 
  28  |   test('shows existing portfolio entries', async ({ page }) => {
  29  |     await expect(page.getByText('Mahomes 2017 Prizm')).toBeVisible()
  30  |     await expect(page.getByText('PSA 10')).toBeVisible()
  31  |   })
  32  | 
  33  |   test('shows portfolio summary stats', async ({ page }) => {
  34  |     await expect(page.getByText('Active')).toBeVisible()
  35  |     await expect(page.getByText('Invested')).toBeVisible()
  36  |   })
  37  | 
  38  |   test('add entry — form opens and submits', async ({ page }) => {
  39  |     // After POST, GET returns the new entry
  40  |     await page.route('**/api/v1/portfolio-entries', async route => {
  41  |       if (route.request().method() === 'POST') {
  42  |         await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(NEW_ENTRY) })
  43  |       } else {
  44  |         await route.fulfill({
  45  |           status: 200, contentType: 'application/json',
  46  |           body: JSON.stringify({ data: [...MOCK_ENTRIES.data, NEW_ENTRY], next_cursor: null, has_more: false }),
  47  |         })
  48  |       }
  49  |     })
  50  | 
  51  |     await page.getByRole('button', { name: /add card/i }).click()
  52  |     await expect(page.getByRole('heading', { name: /add entry/i })).toBeVisible()
  53  | 
  54  |     await page.getByLabel(/card name/i).fill('Kelce 2017 Prizm')
  55  |     await page.getByLabel(/grade/i).fill('PSA 9')
  56  |     await page.getByLabel(/price paid/i).fill('120')
  57  |     await page.getByRole('button', { name: /^save$/i }).click()
  58  | 
  59  |     await expect(page.getByText('Kelce 2017 Prizm')).toBeVisible({ timeout: 5000 })
  60  |   })
  61  | 
  62  |   test('edit entry — form pre-fills existing values', async ({ page }) => {
  63  |     await page.getByRole('button', { name: /edit/i }).first().click()
  64  |     await expect(page.getByRole('heading', { name: /edit entry/i })).toBeVisible()
  65  |     const cardNameInput = page.getByLabel(/card name/i)
  66  |     await expect(cardNameInput).toHaveValue('Mahomes 2017 Prizm')
  67  |   })
  68  | 
  69  |   test('edit entry — submits PATCH and reflects change', async ({ page }) => {
  70  |     const updated = { ...MOCK_ENTRIES.data[0], notes: 'Updated note' }
  71  |     await page.route('**/api/v1/portfolio-entries/entry-1', async route => {
  72  |       await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) })
  73  |     })
  74  |     await page.route('**/api/v1/portfolio-entries', async route => {
  75  |       await route.fulfill({
  76  |         status: 200, contentType: 'application/json',
  77  |         body: JSON.stringify({ data: [updated], next_cursor: null, has_more: false }),
  78  |       })
  79  |     })
  80  | 
  81  |     await page.getByRole('button', { name: /edit/i }).first().click()
  82  |     await page.getByLabel(/notes/i).fill('Updated note')
  83  |     await page.getByRole('button', { name: /^save$/i }).click()
  84  |     await expect(page.getByRole('heading', { name: /edit entry/i })).not.toBeVisible({ timeout: 3000 })
  85  |   })
  86  | 
  87  |   test('delete entry — confirms and removes row', async ({ page }) => {
  88  |     await page.route('**/api/v1/portfolio-entries/entry-1', async route => {
  89  |       if (route.request().method() === 'DELETE') {
  90  |         await route.fulfill({ status: 204 })
  91  |       }
  92  |     })
  93  |     await page.route('**/api/v1/portfolio-entries', async route => {
  94  |       await route.fulfill({
  95  |         status: 200, contentType: 'application/json',
  96  |         body: JSON.stringify({ data: [], next_cursor: null, has_more: false }),
  97  |       })
  98  |     })
  99  | 
  100 |     page.on('dialog', d => d.accept())
  101 |     await page.getByRole('button', { name: /del/i }).first().click()
  102 |     await expect(page.getByText('Mahomes 2017 Prizm')).not.toBeVisible({ timeout: 5000 })
  103 |   })
  104 | 
  105 |   test('mark sold — opens form with sale fields', async ({ page }) => {
  106 |     await page.getByRole('button', { name: /sold/i }).first().click()
  107 |     await expect(page.getByRole('heading', { name: /edit entry/i })).toBeVisible()
  108 |     // actual_sale and sale_venue fields should be pre-visible
  109 |     await expect(page.getByLabel(/actual sale/i)).toBeVisible()
  110 |     await expect(page.getByLabel(/sale venue/i)).toBeVisible()
  111 |   })
  112 | 
  113 |   test('cancel closes the form without saving', async ({ page }) => {
  114 |     await page.getByRole('button', { name: /add card/i }).click()
  115 |     await expect(page.getByRole('heading', { name: /add entry/i })).toBeVisible()
  116 |     await page.getByRole('button', { name: /cancel/i }).click()
  117 |     await expect(page.getByRole('heading', { name: /add entry/i })).not.toBeVisible()
  118 |   })
  119 | })
  120 | 
```