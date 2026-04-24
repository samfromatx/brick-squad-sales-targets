# Rebuild V2 — Gap Closure Task List

Close the feature and styling gaps between the old `docs/` site and the new React frontend.
Work through tasks in order. Mark each `[x]` when done.

> **Out of scope:** Soccer/World Cup targets remain excluded per project rules.

## Reference screenshots (source of truth for exact visual spec)

| File | Shows |
|------|-------|
| `docs/site-targets.png` | Targets tab — KPI cards, sport/type filter pills, table with TYPE + GRADE + TREND + SIGNAL columns, NEW badge |
| `docs/site-overview.png` | Overview tab — Buy Decision Guide (3 columns), PSA 9 vs 10 ratio table, Selling Window timeline |
| `docs/site-tools-bounceback.png` | Tools > Bounce Back sub-tab — KPI cards, 5-signal score table, expandable scoring model |
| `docs/site-tools-cardshow.png` | Tools > Card Show sub-tab — buy-under table grouped by sport, UPSIDE column |
| `docs/site-tools-readytosell.png` | Tools > Ready to Sell sub-tab — full portfolio list with trend/signal data |
| `docs/site-ebay.png` | eBay tab — grouped by sport+category, Copy/Active/Sold link columns |
| `docs/my-portfolio.png` | Portfolio page — KPI strip, quick-pick add form, filter pills, purchase log table |

## Global design spec (from screenshots)

- **Theme:** Light (white `#fff` background, dark `#1e293b` text) — NOT dark
- **Font:** System sans-serif, ~13–14px body
- **Header:** White bar, `🏀🏈 Brick Squad — Investment Target List` bold title, "My Portfolio" pill button + "Import JSON" blue button left of nav, user email + Sign Out right
- **Trend search bar:** Slim input below header (`e.g. Mahomes Prizm 2017…`) with sport icon buttons + Analyze button — **deferred to v3 task list (too complex to include here)**
- **Nav tabs:** Overview | Targets (🏈) | Tools (🔧) | eBay — active tab has bottom border highlight
- **Sport badges:** Football = amber (`#faeeda` bg / `#92400e` text, 🏈 emoji), Basketball = blue (`#e6f1fb` bg / `#1e40af` text, 🏀 emoji)
- **Grade pills:** `PSA 9` = blue (`#dbeafe`/`#1d4ed8`), `PSA 10` = orange (`#fef3c7`/`#b45309`), `Raw` = gray (`#f1f5f9`/`#475569`)
- **Type pills:** `Graded` = blue, `Raw` = light gray
- **Signal pills:** `Buy` = green (`#dcfce7`/`#15803d`), `Watch` = amber (`#fef3c7`/`#92400e`), `Monitor` = gray
- **Trend %:** Green for positive, red for negative
- **NEW badge:** Small blue rounded pill
- **KPI cards:** White card, colored top border (3px), label in small caps gray, value in large bold
- **Tables:** White bg, subtle `#e2e8f0` borders, `#f8fafc` header row, hover `#f8fafc`
- **Section headers:** Sport badge (emoji + name) left-aligned, `Default: PSA X` label right-aligned

---

## Phase 1 — Design system and core styling

### Task 1 — Match design system to old site ✅
Apply the visual language from the old site to the new React app.

See `docs/site-targets.png` and `docs/my-portfolio.png` for the full visual reference.

- Sport badge colors: Football = amber (`#faeeda` bg / `#92400e` text), Basketball = blue (`#e6f1fb` bg / `#1e40af` text)
- Priority pill colors: High = red, Med = amber, Watch = gray, Premium = green
- Trend percentage: green text for positive, red for negative
- "NEW" badge: blue pill
- Table row hover states
- Filter buttons as rounded pills with active/inactive states
- Section dividers
- Colored top-border KPI stat cards on the dashboard
- **Light theme** — white background, dark text (the old site is NOT dark-themed)
- Header layout: logo + My Portfolio + Import JSON buttons left; user email + Sign Out right
- Nav as tabs (Overview | Targets | Tools | eBay) with active-tab underline indicator

**Done when:** Dashboard and portfolio pages visually match `docs/site-targets.png` and `docs/my-portfolio.png`.

---

## Phase 2 — Dashboard / Targets improvements

### Task 2 — Add missing columns to target tables
See `docs/site-targets.png` for exact column set and pill styling.

Add to graded targets table:
- `TYPE` pill — `Graded` (blue) or `Raw` (gray) — shown before GRADE column
- `vol` — volume indicator (High / Med / Low)
- `rationale` — card thesis/description

Add to raw targets table:
- `TYPE` pill
- `vol`
- `rationale`
- `est_psa9`, `est_psa10` — estimated PSA grades
- `gem_rate` — PSA 10 gem rate %
- `roi` — return on investment %

Replace current "Priority" pill column with `SIGNAL` pill column:
- `Buy` (green) = trend_pct > 50
- `Watch` (amber) = trend_pct 0–50
- `Monitor` (gray) = trend_pct < 0

**Done when:** All columns visible in the target tables match `docs/site-targets.png`.

### Task 3 — Add priority filter buttons
See `docs/site-targets.png` — pills above each table: **All / Graded / Raw** for type, **Football / Basketball** for sport.

- Add these filter buttons to `TargetFilters.tsx`
- Active button is highlighted; clicking filters the visible rows

**Done when:** Filter pill buttons appear and correctly filter the target table rows.

### Task 4 — Add sortable table headers
The old site allowed clicking any column header to sort ascending/descending with a ▲/▼ indicator.

- Add sort state to `TargetTable.tsx`
- Clicking a header sorts that column; clicking again reverses direction
- Show ▲ or ▼ indicator on the active sort column

**Done when:** All target table columns are sortable by clicking the header.

---

## Phase 3 — Overview / Reference tab

### Task 5 — Build Overview reference page
See `docs/site-overview.png` for exact layout and content.

Create `src/pages/OverviewPage.tsx` and add it to the router and nav.

Include three sections:

**Buy Decision Guide** — 3-column layout (Buy Raw / Buy PSA 9 / Buy PSA 10), each with a sport badge header and bullet-point criteria list. Football column = amber header, Basketball columns = blue header.

**PSA 9 vs 10 Reference** — two sub-tables:
- Ratio trend signals (7 rows): RATIO TREND | PSR REPORT | WHAT IT MEANS | VERDICT (with Buy PSA 9 / Buy PSA 10 colored pills)
- Gem × multiplier matrix (mentioned in old site)

**Selling Window Timeline** — colored timeline entries for: NBA Playoffs + NFL Draft, FIFA World Cup, NFL Training Camp + Season, NBA Season Start, NFL Playoffs + NBA All-Star. Each has date range, buy/sell action note.

Source the exact content from `docs/index-archive-2026-03-11.html` (search for `tab-overview`, `psaratio`, `selling-window`).

**Done when:** Overview page renders all three sections matching `docs/site-overview.png`.

---

## Phase 4 — Tools tab (sub-tabs)

### Task 6 — Skip this step.

### Task 7 — Build Card Show tab
See `docs/site-tools-cardshow.png` for exact layout.

Create `src/features/cardshow/CardShowTable.tsx` and add as a sub-tab under Tools.

- Fetch targets from the existing `/api/v1/targets` endpoint
- Display: # | CARD | GRADE | BUY UNDER | SELL AT | UPSIDE | RATIONALE
- BUY UNDER = `target_price`; UPSIDE = sell_at − buy_under, colored green/red + %
- Group by sport (Football / Basketball) with sport badge section headers
- Grade shown as colored pill (PSA 9 = blue, PSA 10 = orange, Raw = gray)

**Done when:** Card Show tab renders matching `docs/site-tools-cardshow.png`.

### Task 8 — Build Bounce-Back tab
See `docs/site-tools-bounceback.png` for exact layout.

Create `src/features/bounceback/BounceBackTable.tsx` and add as a sub-tab under Tools.

KPI cards: TOTAL TARGETS | QUALIFY (≤30 dip) | AVG DIP | NEW THIS WEEK

Table columns: # | CARD | BUY + SELL | TREND | VOL | PRICE AVGS (7d/30d/90d) | SCORE (x/5) | RATIONALE

- 5 signals with ✓/✗: Cheap vs. history, Stable floor, Not priced in, Volume present, No spike yet
- Composite score (0–5) shown as colored pill (green ≥4, amber 2–3, red ≤1)
- Expandable "5-Signal Bounce-Back Scoring Model" explanation panel

Source signal definitions from `docs/index-archive-2026-03-11.html` (search `tool-tab-bounce`, `bb-signal`).

**Done when:** Bounce-Back tab renders matching `docs/site-tools-bounceback.png`.

### Task 8b — Build Ready to Sell tab
See `docs/site-tools-readytosell.png` for exact layout.

Create `src/features/readytosell/ReadyToSellTable.tsx` and add as a sub-tab under Tools.

- Cross-reference portfolio entries against current target prices
- Show cards where `actual_sale` is null and current price is at or above `target_sell`
- KPI cards: count at/above target, total value, avg upside
- Table: CARD | SPORT | GRADE | BUY | SELL TARGET | TREND | SIGNAL

**Done when:** Ready to Sell tab renders portfolio entries that have hit their sell target.

---

## Phase 5 — Mobile and navigation

### Task 9 — Mobile tab navigation
The old site had a `<select>` dropdown for navigation on screens under 600px.

- Add a hamburger menu or tab dropdown to `NavBar.tsx` for mobile viewports
- All pages reachable on mobile without horizontal scrolling

**Done when:** App is fully navigable on a 390px-wide viewport.

---

## Phase 6 — Auth UX

### Task 10 — Add sign-up flow to sign-in page
The old site had a toggle between Sign In and Create Account on the auth modal.

- Add a "Create account" toggle to `SignInPage.tsx`
- Show email + password + confirm password fields when in sign-up mode
- Call `supabase.auth.signUp()` on submit
- Show success message prompting email verification

**Done when:** A new user can create an account from the sign-in page.
