# Discovery Notes

## 1. Supabase Table Names

| Table | Used In | Purpose |
|---|---|---|
| `investment_targets` | index.html | Main buy targets (graded, raw, bounce-back) |
| `portfolio_targets` | index.html | Budget-tier portfolio allocations |
| `ebay_searches` | index.html | Saved eBay search strings |
| `portfolio_entries` | portfolio.html | User's personal card purchase log |
| `card_market_data` | index.html | Pre-computed market data per card/grade/window |

### Column details

**`investment_targets`**
`id`, `user_id`, `sport` (football|basketball), `category` (graded|raw|bounce_back), `rank`, `card`, `grade`, `target`, `max`, `trend` (float parsed from "±N%"), `vol`, `sell_at`, `rationale`, `new` (bool), `last_updated`, `target_raw`, `max_raw`, `est_psa9`, `est_psa10`, `gem_rate`, `roi`, `avg_180`, `avg_30`, `avg_14`, `avg_7`, `score`, `s1_cheap`, `s2_stable`, `s3_not_priced_in`, `s4_volume`, `s5_no_spike`, `created_at`

**`portfolio_targets`**
`id`, `user_id`, `budget_tier` ('1000'|'1500'|'2000'), `card`, `budget`, `thesis`, `description`, `created_at`

**`ebay_searches`**
`id`, `user_id`, `sport`, `category`, `search_text`, `card`, `rank`, `created_at`

**`portfolio_entries`**
`id`, `user_id`, `card`, `sport`, `grade`, `price`, `grading_cost`, `target_sell`, `actual_sale`, `sale_venue`, `date`, `notes`, `pc` (bool, personal collection), `created_at`

**`card_market_data`**
`sport`, `window_days` (7|14|30|180), `card`, `grade` (Raw|PSA 9|PSA 10), `price_change_pct`, `price_change_dollar`, `starting_price`, `last_sale`, `avg`, `min_sale`, `max_sale`, `volume_change_pct`, `num_sales`, `total_sales_dollar`

All tables have RLS: `for all using (auth.uid() = user_id)` (except `card_market_data` which is shared).

---

## 2. Import/Export JSON Field Names

### Import format (POST to replace investment_targets, portfolio_targets, ebay_searches)

```json
{
  "last_updated": "YYYY-MM-DD",
  "football_graded": [
    { "rank": 1, "card": "...", "grade": "PSA 10", "target": 100, "max": 120,
      "trend": "+12%", "vol": "high", "sell_at": "March show",
      "rationale": "...", "new": false }
  ],
  "basketball_graded": [ /* same shape */ ],
  "football_raw_to_grade": [
    { "rank": 1, "card": "...", "target_raw": 30, "max_raw": 40,
      "trend": "+5%", "est_psa9": 80, "est_psa10": 150,
      "gem_rate": 0.35, "vol": "med", "roi": 2.1,
      "sell_at": "...", "rationale": "...", "new": false }
  ],
  "basketball_raw_to_grade": [ /* same shape */ ],
  "bounce_back": [
    { "rank": 1, "card": "...", "sport": "football", "grade": "PSA 10",
      "target": 50, "max": 65, "trend": "-20%", "vol": "low",
      "sell_at": "...", "rationale": "...", "new": false,
      "score": 4, "s1_cheap": true, "s2_stable": true,
      "s3_not_priced_in": true, "s4_volume": false, "s5_no_spike": true }
  ],
  "portfolios": {
    "1000": { "total": 1000, "allocations": [
      { "card": "...", "type": "graded", "cost_each": 50, "qty": 2, "subtotal": 100 }
    ]},
    "1500": { /* same */ },
    "2000": { /* same */ }
  },
  "ebay_searches": [
    { "sport": "football", "category": "graded", "search_text": "...", "card": "...", "rank": 1 }
  ]
}
```

**Key mapping notes:**
- `football_graded` / `basketball_graded` → `investment_targets` with `category='graded'`, sport inferred from key
- `football_raw_to_grade` / `basketball_raw_to_grade` → `investment_targets` with `category='raw'`
- `bounce_back` → `investment_targets` with `category='bounce_back'`; includes `sport` field inline
- `portfolios` → `portfolio_targets` (budget_tier keyed by string "1000"|"1500"|"2000")
- `ebay_searches` → `ebay_searches` table
- Import is **destructive**: each section replaced via delete-then-bulk-insert

### CSV export format (portfolio_entries)
Headers: `Card, Sport, Grade, Price Paid, 7d Avg, 30d Avg, Target Sell, Actual Sale, Sale Venue, Profit, Date, Notes, PC`

---

## 3. Scoring and Ranking Calculations

### generate_report.py — Max bid / FMV formula
```
FMV        = (avg_30d × 0.60) + (last_sale × 0.40)
trend_pct  = (last_sale − avg_30d) / avg_30d
multiplier = 0.95 if trend_pct > +10%
           | 0.85 if −10% ≤ trend_pct ≤ +10%
           | 0.75 if trend_pct < −10%
max_bid    = FMV × multiplier
```

### config.yaml — PSA grading EV
```
EV = (psa10_rate × psa10_val) + (psa9_rate × psa9_val) + (psa8_rate × psa8_val) − all_in_cost
roi = EV / all_in_cost
```
Config weights: `fmv_avg_weight=0.60`, `fmv_last_weight=0.40`, `up_threshold=0.10`, `down_threshold=-0.10`

### index.html — Priority badge logic
```
trend > 50%   → "High" (or "Premium" for special cards like SGA at $170+ target)
0–50%         → "Med"
< 0%          → "Watch"
```

### index.html — Bounce-back score (composite 0–5)
Five boolean signals: `s1_cheap`, `s2_stable`, `s3_not_priced_in`, `s4_volume`, `s5_no_spike`
`score = sum of true signals`

### portfolio.html — Profit / ROI
```
profit      = target_sell − price
ROI         = (profit / totalCost) × 100
eBay profit = actual_sale × (1 − 0.1325) − price − grading_cost
```

---

## 4. Workflows to Preserve

### Sign-in / Auth
- Supabase email+password auth
- Session persisted via Supabase JS SDK (`localStorage`-backed)
- Dev shortcut: `localStorage.devEmail` + `localStorage.devPassword` auto-fills on localhost
- Sign-in overlay modal; dismisses on valid session

### index.html tabs
| Tab | Data source | Notes |
|---|---|---|
| Overview | Static HTML | No DB |
| Watchlist | Static HTML | No DB |
| Football Targets | `investment_targets` (sport=football, category=graded) | DB-driven |
| Basketball Targets | `investment_targets` (sport=basketball, category=graded) | DB-driven |
| Raw → Grade | `investment_targets` (category=raw, both sports) | DB-driven |
| Bounce Back | `investment_targets` (category=bounce_back) | DB-driven |
| Portfolios | `portfolio_targets` | DB-driven |
| Card Show | Derived from graded targets | Not a separate DB table |
| eBay Searches | `ebay_searches` | DB-driven |
| Trend Analysis | `card_market_data` + CSV lookups | DB-driven + CSV |

### JSON Import
- User uploads a `.json` file matching the format above
- Each present section is **replaced** (delete all rows for that user + sport/category, then bulk insert)
- Absent sections are left untouched
- `last_updated` written to all inserted `investment_targets` rows

### Portfolio CRUD (portfolio.html)
- Add card: modal form → POST to `portfolio_entries`
- Edit card: row click → modal → PATCH
- Delete card: row action → DELETE
- Mark sold: set `actual_sale`, `sale_venue` → PATCH
- PC (personal collection) flag: toggles `pc=true` — hidden from sale calculations
- CSV export of all entries

### Trend analysis (index.html — Trend Analysis tab)
- `card_market_data` table queried by sport + window
- CSV files at `docs/data/{sport}-all-players-last-{N}-days.csv` used as fallback / display data
- Windows: 7, 14, 30, 60, 90, 180, 360 days (180/360 not yet split-format)

### eBay searches
- List of saved searches displayed with outbound eBay links built from `search_text`
- Linked to `investment_targets` via `card` + `rank` fields

---

## 5. API Client Pattern (existing JS)

```js
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Auth check
const { data: { session } } = await sb.auth.getSession()
if (!session) showSignInModal()

// Query example
const { data, error } = await sb
  .from('investment_targets')
  .select('*')
  .eq('user_id', session.user.id)
  .eq('sport', 'football')
  .order('rank')
```

The new backend will replace these direct Supabase calls with authenticated REST API calls to FastAPI, while keeping Supabase as the underlying DB and auth provider.
