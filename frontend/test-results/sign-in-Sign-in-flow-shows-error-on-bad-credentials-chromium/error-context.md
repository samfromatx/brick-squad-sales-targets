# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sign-in.spec.ts >> Sign-in flow >> shows error on bad credentials
- Location: e2e/sign-in.spec.ts:11:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel(/email/i)

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('Sign-in flow', () => {
  4  |   test('shows sign-in form at /sign-in', async ({ page }) => {
  5  |     await page.goto('/sign-in')
  6  |     await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  7  |     await expect(page.getByLabel(/email/i)).toBeVisible()
  8  |     await expect(page.getByLabel(/password/i)).toBeVisible()
  9  |   })
  10 | 
  11 |   test('shows error on bad credentials', async ({ page }) => {
  12 |     // Mock Supabase auth to return an error
  13 |     await page.route('**/auth/v1/token**', async route => {
  14 |       await route.fulfill({
  15 |         status: 400,
  16 |         contentType: 'application/json',
  17 |         body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
  18 |       })
  19 |     })
  20 | 
  21 |     await page.goto('/sign-in')
> 22 |     await page.getByLabel(/email/i).fill('bad@example.com')
     |                                     ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  23 |     await page.getByLabel(/password/i).fill('wrongpassword')
  24 |     await page.getByRole('button', { name: /sign in/i }).click()
  25 |     await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5000 })
  26 |   })
  27 | 
  28 |   test('redirects to dashboard after successful sign-in', async ({ page }) => {
  29 |     // Mock Supabase auth token endpoint to return a valid session
  30 |     await page.route('**/auth/v1/token**', async route => {
  31 |       await route.fulfill({
  32 |         status: 200,
  33 |         contentType: 'application/json',
  34 |         body: JSON.stringify({
  35 |           access_token: 'mock-token',
  36 |           refresh_token: 'mock-refresh',
  37 |           expires_in: 3600,
  38 |           token_type: 'bearer',
  39 |           user: { id: 'user-1', email: 'sam@test.com', aud: 'authenticated' },
  40 |         }),
  41 |       })
  42 |     })
  43 | 
  44 |     // Mock the API calls that dashboard will make
  45 |     await page.route('**/api/v1/**', async route => {
  46 |       await route.fulfill({
  47 |         status: 200,
  48 |         contentType: 'application/json',
  49 |         body: JSON.stringify({ schema_version: 'v1', data: { targets: [], portfolio_allocations: [], ebay_searches: [], portfolio_entries: [] }, user: { id: 'user-1', email: null }, generated_at: new Date().toISOString(), last_updated: null }),
  50 |       })
  51 |     })
  52 | 
  53 |     await page.goto('/sign-in')
  54 |     await page.getByLabel(/email/i).fill('sam@test.com')
  55 |     await page.getByLabel(/password/i).fill('password123')
  56 |     await page.getByRole('button', { name: /sign in/i }).click()
  57 |     await expect(page).toHaveURL(/dashboard/, { timeout: 5000 })
  58 |   })
  59 | })
  60 | 
```