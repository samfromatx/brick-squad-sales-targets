# Brick Squad Sales Targets

A full-stack sports card investment tracker. Search for cards, analyze buy/grade/sell decisions, manage your portfolio, and import buy target lists — all backed by Supabase with real eBay market data.

**Sports in scope: football and basketball only. Soccer is out of scope — do not add it.**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)          Vercel                         │
│  frontend/src/                                                  │
│  ├── pages/           8 pages (Dashboard, Portfolio, Trends…)   │
│  ├── lib/api.ts       HTTP client (auto-attaches Bearer token)  │
│  └── lib/auth.ts      Supabase session + refresh logic          │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS + Bearer JWT
┌────────────────────────▼────────────────────────────────────────┐
│  FastAPI backend                 Render                         │
│  backend/app/                                                   │
│  ├── routers/         HTTP endpoints (/api/v1/…)               │
│  ├── services/        Business logic                            │
│  ├── db/queries/      SQL (psycopg3, direct Postgres)           │
│  └── core/            Auth (JWT verify), logging, ETag cache    │
└────────────────────────┬────────────────────────────────────────┘
                         │ Postgres (Supabase connection string)
┌────────────────────────▼────────────────────────────────────────┐
│  Supabase Postgres                                              │
│  Tables: investment_targets, portfolio_entries,                 │
│          portfolio_targets, ebay_searches, card_market_data     │
│  Auth: Supabase Auth (email/password, JWT)                      │
│  RLS: all user tables scoped to auth.uid() = user_id           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  MCP Servers (Claude Code tools)                                │
│  mcp/                 Card market analysis (10 tools)           │
│  portfolio-advisor-mcp/  Portfolio optimization (3 tools)       │
│  targets-mcp/         Targets JSON file management (2 tools)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
brick-squad-sales-targets/
│
├── backend/                    # FastAPI Python service (Render)
│   ├── app/
│   │   ├── main.py             # App init, CORS, routers, global error handler
│   │   ├── core/
│   │   │   ├── auth.py         # JWT verification dependency
│   │   │   ├── config.py       # Pydantic Settings (reads .env)
│   │   │   ├── logging.py      # Structured JSON logging + request ID middleware
│   │   │   └── cache.py        # ETag generation helper
│   │   ├── models/
│   │   │   ├── domain.py       # Core types: Target, PortfolioEntry, EbaySearch
│   │   │   ├── api.py          # Request/response schemas (Pydantic)
│   │   │   └── export.py       # ExportSnapshot schema
│   │   ├── db/
│   │   │   ├── connection.py   # psycopg3 connection pool + db_cursor()
│   │   │   └── queries/
│   │   │       ├── targets.py
│   │   │       ├── portfolio.py
│   │   │       ├── trends.py
│   │   │       └── ebay.py
│   │   ├── services/
│   │   │   ├── targets.py
│   │   │   ├── portfolio.py
│   │   │   ├── trends.py
│   │   │   ├── imports.py
│   │   │   └── exports.py
│   │   └── routers/
│   │       ├── health.py
│   │       ├── bootstrap.py
│   │       ├── targets.py
│   │       ├── portfolios.py
│   │       ├── portfolio_entries.py
│   │       ├── trends.py
│   │       ├── ebay.py
│   │       ├── imports.py
│   │       └── exports.py
│   ├── tests/
│   ├── Dockerfile              # Python 3.12-slim, non-root user, port 8000
│   ├── pyproject.toml
│   └── .env.example
│
├── frontend/                   # React + Vite app (Vercel)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout/NavBar.tsx
│   │   │   ├── providers.tsx   # TanStack Query + Supabase setup
│   │   │   └── router.tsx      # React Router routes
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx   # Main targets view
│   │   │   ├── PortfolioPage.tsx   # Holdings + CRUD
│   │   │   ├── TrendPage.tsx       # Price trend search
│   │   │   ├── EbayPage.tsx        # Saved eBay searches
│   │   │   ├── ImportPage.tsx      # JSON file import
│   │   │   ├── ToolsPage.tsx       # MCP tool playground
│   │   │   ├── OverviewPage.tsx    # Static overview/watchlist
│   │   │   └── SignInPage.tsx      # Auth form
│   │   └── lib/
│   │       ├── api.ts          # ApiClient class (all backend calls)
│   │       ├── auth.ts         # getAccessToken, refresh, signIn, signOut
│   │       └── types.ts        # TypeScript interfaces (mirrors backend models)
│   ├── vercel.json             # SPA fallback: all routes → index.html
│   ├── tsconfig.json           # strict: true required
│   └── .env.example
│
├── mcp/                        # MCP server: card market data analysis
│   └── src/
│       ├── index.ts            # Server entry, 10 tools registered
│       ├── db.ts               # In-memory DB from CSV files
│       ├── loader.ts           # CSV loading + parsing
│       └── tools/              # One file per tool
│
├── portfolio-advisor-mcp/      # MCP server: portfolio optimization
│   └── src/
│       ├── index.ts
│       ├── card_db.ts          # Supabase + market CSV integration
│       └── tools/
│
├── targets-mcp/                # MCP server: targets JSON management
│   └── src/
│       ├── index.ts
│       └── targets.ts
│
├── docs/
│   ├── index-archive-2026-03-11.html  # Legacy static site (rollback)
│   ├── trend-analysis-logic.md        # Full trend analysis algorithm docs
│   ├── discovery-notes.md
│   ├── rebuild-plan.md
│   └── tasks.md
│
├── data/                       # Market data CSVs (mirrored from docs/data/)
├── scripts/
├── .github/workflows/
│   ├── backend-ci.yml          # lint → typecheck → pytest → docker build
│   └── frontend-ci.yml         # typecheck → build → playwright
├── generate_report.py          # Legacy report generator (do not delete)
└── config.yaml                 # Legacy config (do not delete)
```

---

## Database Schema

All user tables enforce RLS: `FOR ALL USING (auth.uid() = user_id)`.

### `investment_targets`

Stores buy target recommendations — the core of the app.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | RLS key |
| sport | text | `football` \| `basketball` |
| category | text | `graded` \| `raw` \| `bounce_back` |
| rank | int | Order within category |
| card | text | Card name (maps to `card_name` in domain model) |
| grade | text | e.g. "PSA 10", "Raw" |
| target | numeric | Buy target price (maps to `target_price`) |
| max | numeric | Max buy price (maps to `max_price`) |
| trend | numeric | Trend % (maps to `trend_pct`) |
| vol | text | Volume indicator |
| sell_at | text | Sell price target |
| rationale | text | Buy rationale |
| new | bool | Is a newly added target (maps to `is_new`) |
| last_updated | date | |
| target_raw | numeric | Raw-specific buy target |
| max_raw | numeric | Raw-specific max price |
| est_psa9 | numeric | Estimated PSA 9 value |
| est_psa10 | numeric | Estimated PSA 10 value |
| gem_rate | numeric | % of submissions grading PSA 10 |
| roi | numeric | Expected ROI % |
| score | int | Bounce-back score (0–5) |
| s1_cheap … s5_no_spike | bool | Bounce-back signal breakdown |
| created_at | timestamptz | |

### `portfolio_entries`

User's personal card holdings.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | RLS key |
| card | text | Card name |
| sport | text | `football` \| `basketball` |
| grade | text | Grade or "Raw" |
| price | numeric | Purchase price |
| grading_cost | numeric | PSA grading cost if applicable |
| target_sell | numeric | Desired sell price |
| actual_sale | numeric | Actual sale price (null if unsold) |
| sale_venue | text | e.g. "eBay" |
| date | date | Purchase date |
| notes | text | Free-form notes |
| pc | bool | Personal collection (exclude from sell tracking) |
| paid | numeric | Amount paid (may differ from price) |
| created_at | timestamptz | |

### `portfolio_targets`

Budget tier allocations (recommended buys by budget level).

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | RLS key |
| budget_tier | text | `1000` \| `1500` \| `2000` |
| card | text | Card name |
| budget | numeric | Allocated budget |
| thesis | text | Investment thesis |
| description | text | Additional notes |
| created_at | timestamptz | |

### `ebay_searches`

Saved eBay search queries.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | RLS key |
| sport | text | |
| category | text | |
| search_text | text | The eBay search string |
| card | text | Associated card name |
| rank | int | Display order |
| created_at | timestamptz | |

### `card_market_data`

Pre-computed market aggregations. No RLS — shared read-only table.

| Column | Type | Notes |
|---|---|---|
| sport | text | `football` \| `basketball` |
| window_days | int | 7, 14, 30, 60, 90, 180, 360 |
| card | text | Card name |
| grade | text | `Raw` \| `PSA 9` \| `PSA 10` |
| avg | numeric | Average sale price |
| num_sales | int | Number of sales in window |
| price_change_pct | numeric | % price change vs start of window |
| price_change_dollar | numeric | $ price change |
| starting_price | numeric | Price at window start |
| last_sale | numeric | Most recent sale |
| min_sale | numeric | Minimum sale |
| max_sale | numeric | Maximum sale |
| volume_change_pct | numeric | % volume change |
| total_sales_dollar | numeric | Total $ traded |

---

## API Reference

All endpoints under `/api/v1`. Auth-required endpoints need `Authorization: Bearer <jwt>`.

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/healthz` | No | Returns `{"status": "ok"}` |
| GET | `/readyz` | No | Checks DB connection |

### Data (read)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/bootstrap` | Yes | Full snapshot (targets + portfolios + ebay searches). ETag cached. |
| GET | `/targets` | Yes | Paginated targets list. Supports `sport`, `category` filters. ETag. |
| GET | `/targets/{id}` | Yes | Single target by ID. ETag. |
| GET | `/portfolios` | Yes | Budget allocation tiers. |
| GET | `/portfolio-entries` | Yes | Paginated holdings (cursor-based, `id > x`). |
| GET | `/ebay-searches` | Yes | Paginated eBay search list. |
| GET | `/trends/search?q=` | Yes | Autocomplete/search card names in market data. |
| GET | `/trends/detail?card=&sport=` | Yes | Full price history across all windows for a card. |
| GET | `/exports/snapshot` | Yes | Full export JSON. ETag cached. |

### Portfolio CRUD

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/portfolio-entries` | Yes | Create holding. |
| PATCH | `/portfolio-entries/{id}` | Yes | Update holding. 403 if not owner. |
| DELETE | `/portfolio-entries/{id}` | Yes | Delete holding. 403 if not owner. |

### Import

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/imports/targets` | Yes | Destructive import. Each present section replaces existing data. |

### Error envelope

All errors return:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Target not found",
    "request_id": "abc123"
  }
}
```

---

## Domain Models

### `Target` (domain)

```typescript
interface Target {
  id: string;
  sport: 'football' | 'basketball';
  category: 'graded' | 'raw' | 'bounce_back';
  rank: number;
  card_name: string;
  grade: string | null;
  target_price: number | null;
  max_price: number | null;
  trend_pct: number | null;
  vol: string | null;
  sell_at: string | null;
  rationale: string | null;
  is_new: boolean;
  last_updated: string | null;
  raw_metrics?: RawMetrics;         // only if category = 'raw'
  bounce_back_metrics?: BounceBackMetrics;  // only if category = 'bounce_back'
}

interface RawMetrics {
  target_raw: number | null;
  max_raw: number | null;
  est_psa9: number | null;
  est_psa10: number | null;
  gem_rate: number | null;
  roi: number | null;
}

interface BounceBackMetrics {
  score: number;        // 0–5
  s1_cheap: boolean;
  s2_stabilizing: boolean;
  s3_recovery_not_priced: boolean;
  s4_volume_active: boolean;
  s5_no_spike: boolean;
}
```

### `PortfolioEntry` (domain)

```typescript
interface PortfolioEntry {
  id: string;
  user_id: string;
  card: string;
  sport: 'football' | 'basketball';
  grade: string;
  price: number | null;
  grading_cost: number | null;
  target_sell: number | null;
  actual_sale: number | null;
  sale_venue: string | null;
  date: string | null;
  notes: string | null;
  pc: boolean;
  paid: number | null;
  created_at: string;
}
```

---

## Auth Flow

1. User submits email/password on `/sign-in`
2. Frontend calls `supabase.auth.signInWithPassword()` → receives JWT
3. JWT stored in Supabase SDK local storage
4. Every API request: `Authorization: Bearer <jwt>` header
5. Backend `get_current_user_id()` dependency: decodes JWT, validates, returns `user_id`
6. All queries use `user_id` + Supabase RLS enforces row-level access
7. On 401: frontend calls `refreshAccessToken()`, retries once
8. If refresh fails: redirect to `/sign-in`

**Service-role keys never go to the browser.** Only in backend `.env`.

---

## Frontend Pages

### DashboardPage (`/dashboard`)

- Fetches from `/api/v1/bootstrap` on load
- Tabs: Football Graded / Basketball Graded / Raw→Grade / Bounce Back
- Shows `card_name`, `grade`, `target_price`, `max_price`, `sell_at`, `trend_pct`, `is_new` badge
- Filters by sport and category

### PortfolioPage (`/portfolio`)

- Fetches all pages of `/api/v1/portfolio-entries` (follows cursor pagination)
- Add / edit / delete / mark-as-sold via PATCH
- CSV export of current holdings
- Shows portfolio allocations from `/api/v1/portfolios`

### TrendPage (`/trends`)

- Search field → queries `/api/v1/trends/search?q=`
- On select: fetches `/api/v1/trends/detail?card=&sport=`
- Displays price table (Raw / PSA 9 / PSA 10 across 7d–360d windows)
- Buy analysis card (viability ratio, EV model, PSA 10/9 matrix, gem rate, suggested buy target)
- Bounce-back score (5-signal table for PSA 9 and PSA 10)

See [`docs/trend-analysis-logic.md`](docs/trend-analysis-logic.md) for the complete algorithm.

### EbayPage (`/ebay`)

- Lists saved eBay searches from `/api/v1/ebay-searches`
- Each entry links out to eBay with `search_text`

### ImportPage (`/import`)

- File picker for `.json` files
- POSTs to `/api/v1/imports/targets`
- On success: invalidates all TanStack Query caches
- Shows success/error feedback

---

## Import / Export JSON Format

### Import payload (`POST /api/v1/imports/targets`)

Each section present in the payload **replaces** all existing data for that user/sport/category. Omitted sections are left unchanged.

```json
{
  "last_updated": "2026-04-24",
  "football_graded": [
    {
      "rank": 1,
      "card": "Patrick Mahomes 2017 Prizm #269 Base",
      "grade": "PSA 10",
      "target": 150,
      "max": 175,
      "trend": 12.5,
      "vol": "High",
      "sell_at": "$220+",
      "rationale": "SB window open",
      "new": true
    }
  ],
  "basketball_graded": [ /* same shape */ ],
  "football_raw_to_grade": [
    {
      "rank": 1,
      "card": "Joe Burrow 2020 Prizm #307 Base",
      "target_raw": 45,
      "max_raw": 55,
      "trend": 8.0,
      "est_psa9": 120,
      "est_psa10": 280,
      "gem_rate": 38,
      "vol": "Med",
      "roi": 42.0,
      "sell_at": "$280+",
      "rationale": "Undervalued raw",
      "new": false
    }
  ],
  "basketball_raw_to_grade": [ /* same shape */ ],
  "bounce_back": [
    {
      "rank": 1,
      "sport": "football",
      "card": "Justin Jefferson 2020 Prizm #398 Base",
      "grade": "PSA 9",
      "target": 80,
      "max": 95,
      "score": 4,
      "s1_cheap": true,
      "s2_stabilizing": true,
      "s3_recovery_not_priced": true,
      "s4_volume_active": true,
      "s5_no_spike": false
    }
  ],
  "portfolios": {
    "1000": {
      "total": 1000,
      "allocations": [
        { "card": "Card Name", "type": "graded", "cost_each": 50, "qty": 2, "subtotal": 100 }
      ]
    },
    "1500": { /* same */ },
    "2000": { /* same */ }
  },
  "ebay_searches": [
    { "sport": "football", "category": "graded", "search_text": "mahomes prizm base psa 10", "card": "Patrick Mahomes 2017 Prizm #269 Base", "rank": 1 }
  ]
}
```

### Export snapshot (`GET /api/v1/exports/snapshot`)

Same structure as import, plus:
```json
{
  "schema_version": "1.0",
  "generated_at": "2026-04-24T12:00:00Z",
  "last_updated": "2026-04-24",
  "user": "<user_id>",
  "data": { /* same sections as import */ }
}
```

---

## Card Targets Feature

An automated buy-target ranking system that scores every card in the market data against player metadata, producing ranked buy/watchlist/avoid recommendations.

### How it works

1. **Data sources** — reads from three DB tables:
   - `card_market_data` — raw eBay sales aggregations (549K+ rows, pre-loaded by sport)
   - `gem_rates` — PSA 10 gem rates per card
   - `player_metadata` — manually curated player scores (tier, upside, catalyst, risk)

2. **Multi-player card filtering** — cards with `/` in the name (dual-player cards) are excluded at every query layer.

3. **Scoring** — each card gets five component scores, summed into `target_score` (0–100):

   | Component | Max | Key signals |
   |---|---|---|
   | `market_score` | 30 | Liquidity, volume signal, trend direction, confidence |
   | `value_score` | 35 | Price vs target, anchor discount, raw grading EV |
   | `timing_score` | 15 | Short-term vs long-term price comparison, 180d recovery pattern |
   | `player_score` | 20 | `hobby_tier`, `upside_score`, `current_relevance_score`, `manual_catalyst_score` from player metadata |
   | `risk_penalty` | −30 | Low confidence, stale data, strong downtrend, fragile premium, thin liquidity |

4. **Classification thresholds** (tuned to actual score distribution):

   | Strength | Min score | Additional conditions |
   |---|---|---|
   | Strong Buy Target | ≥ 60 | `current_price ≤ target_buy_price`, price in $10–$200 range, no blockers |
   | Buy Target | ≥ 55 | same |
   | Value Target | ≥ 65 (legacy, rarely reached) | same |
   | Watchlist Target | ≥ 48 | score threshold only |
   | Avoid / Overheated | < 48 | everything else |

   **Blockers** that prevent any buy classification: Low market confidence, stale data, very thin liquidity, unresolved strong downtrend (unless it qualifies as a bounce-back).

5. **Output** — results written to `card_targets` table (one row per card per sport).

### DB tables

#### `card_targets`

Pre-computed per-card recommendations. No RLS — admin-written, user-read.

| Column | Notes |
|---|---|
| sport | `football` \| `basketball` |
| card | Card name |
| player_name / player_key | Normalized player identity |
| recommended_grade | `Raw` \| `PSA 9` \| `PSA 10` |
| recommendation_strength | `Strong Buy Target` \| `Buy Target` \| `Value Target` \| `Watchlist Target` \| `Avoid / Overheated` |
| strategy_type | `Buy & Hold` \| `Buy Raw & Grade` \| `Bounce Back` \| etc. |
| rank | Ascending rank within sport |
| target_score | Composite score (0–100) |
| market_score / value_score / timing_score / player_score / risk_penalty | Component scores |
| market_confidence | `Low` \| `Medium` \| `High` |
| target_buy_price / current_price | Target and current market price |
| avg_7d … avg_180d | Rolling average prices |
| raw_avg_30d / psa9_avg_30d / psa10_avg_30d | Grade-specific 30d averages |
| liquidity_label / trend_label / volume_signal / volatility_label | Market health labels |
| justification | JSON array of bullet-point reasons |
| warnings | JSON array of `{code, message}` warning objects |
| full_analysis | Full `TrendAnalysisResponse` JSON (for detail panel) |
| calculated_at | Timestamp of last recalculation |

#### `player_metadata`

Manually curated player scores. Upserted (never destructively replaced) by the recalculation script.

| Column | Notes |
|---|---|
| player_name / player_key | Display name + normalized key |
| sport | `football` \| `basketball` |
| hobby_tier | 0–10. Weight: ×0.8 in player_score |
| upside_score | 0–5. Weight: ×1.2 |
| current_relevance_score | 0–5. Weight: ×1.0 |
| manual_catalyst_score | 0–5. Weight: ×1.0 |
| risk_score | 0–5. Penalizes both player_score and risk_penalty |
| manual_catalyst | Free-text catalyst note |
| notes | General notes |
| needs_review | Flag for admin review queue |

**Important:** The recalculation script only touches `last_seen_at` / `updated_at` timestamps on existing rows — all manually entered scores are preserved.

### Triggering a recalculation

Recalculation runs entirely offline via **GitHub Actions** (not the web backend — Render's free tier can't sustain a 30–60 min background job).

1. Go to [Actions → Recalculate Card Targets](https://github.com/samfromatx/brick-squad-sales-targets/actions/workflows/recalculate-card-targets.yml)
2. Click **Run workflow**
3. Choose sport: `football basketball` (both), `football`, or `basketball`
4. Wait ~10–20 min for completion
5. Refresh the Card Targets page — data updates immediately from DB

The workflow uses the **Supabase Session pooler URL** (IPv4-reachable from GitHub Actions). The direct DB hostname (`db.PROJECT_REF.supabase.co`) is IPv6-only and will fail. `SUPABASE_DB_URL` secret must be set to: `postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres`

### Script (local / CI)

```bash
cd backend
python scripts/recalculate_targets.py football basketball
python scripts/recalculate_targets.py basketball   # single sport
```

Requires `SUPABASE_DB_URL` in environment.

### Frontend page

**Card Targets** (`/card-targets`) — `frontend/src/pages/CardTargetsPage.tsx`

- Fetches from `GET /api/v1/card-targets?sport=&view=&min_price=&max_price=&q=`
- View tabs: **Buy Targets** / **Watchlist** / **Overheated**
- Sport tabs: Football / Basketball
- Price range filter (default $10–$200)
- Text search (card name or player name)
- Sortable score detail panel on row click
- **Recalculate** button links directly to the GitHub Actions workflow

### API endpoint

`GET /api/v1/card-targets` — auth required.

| Param | Type | Description |
|---|---|---|
| `sport` | `football` \| `basketball` | Required |
| `view` | `buy` \| `watchlist` \| `overheated` \| `all` | Optional filter |
| `min_price` | float | Min `target_buy_price` |
| `max_price` | float | Max `target_buy_price` |
| `q` | string | Search card or player name |
| `limit` | int | Default 20, max 200 |
| `offset` | int | Pagination offset |

Response: `{ data: CardTargetResponse[], total: int }`

---

## MCP Servers

Three MCP servers expose domain-specific tools to Claude Code.

### `mcp/` — Brick Squad Cards (Card Market Analysis)

Reads eBay market data from CSV files. 10 tools:

| Tool | Description |
|---|---|
| `search_card` | Price trend data across all time windows (7–360d) for a card |
| `top_movers` | Highest/lowest price gainers by window |
| `compare_cards` | Side-by-side metrics for multiple cards |
| `get_market_summary` | Aggregate stats (median/mean change, trending up/down %) |
| `search_by_grade` | Filter cards by PSA grade |
| `get_gem_rate` | PSA 10 gem rate from CardLadder CSV exports |
| `calc_ev` | Expected Value model (gem rate × psa10/9 prices − grading cost) |
| `find_bounce_backs` | 5-signal bounce-back scoring (cheap/stable/recovering/active/clean) |
| `batch_card_data` | Bulk fetch avg prices for multiple cards across windows |
| `raw_slab_ratio` | Raw vs PSA 9 price ratio; flags >0.60 as "buy the slab" |

### `portfolio-advisor-mcp/` — Portfolio Optimization

Reads from Supabase + market data CSVs. 3 tools:

| Tool | Description |
|---|---|
| `get_portfolio_with_pricing` | Holdings with current market prices, ROI %, 7d/30d trend |
| `get_sell_recommendations` | Rank unsold cards by urgency (SELL NOW / STRONG SELL / CONSIDER / HOLD) |
| `get_timing_opportunities` | Trending-up cards, suggest BIN price (8% above market) |

### `targets-mcp/` — Targets File Management

Reads/writes the targets JSON file (`~/.claude/brick-squad-targets.json`). 2 tools:

| Tool | Description |
|---|---|
| `read_targets` | Read all sections or a specific section from the targets JSON |
| `merge_targets` | Merge new entries, auto-rank from 1, manage `is_new` lifecycle |

---

## Trend Analysis Algorithm

Documented in detail at [`docs/trend-analysis-logic.md`](docs/trend-analysis-logic.md).

**Summary of constants:**
- Grading cost: $38 ($30 PSA + $8 shipping)
- eBay fee multiplier: 0.87 (13% fees)
- Minimum profit floor to recommend grading: $20
- Minimum 90d sales for confident signal: 3
- Downtrend penalty on cost basis: $10
- Football gem rate fallback: 38%; Basketball: 55%

**Steps:** price anchors (90d primary, 180d fallback) → trend signal (30d vs 90d ratio) → raw viability ratio → gem rate lookup → EV model → PSA 10/9 multiplier matrix → break-even grade → final verdict (Buy raw & grade / Buy PSA 9 / Buy PSA 10 / Pass).

---

## Local Development

### Backend

```bash
cd backend
cp .env.example .env   # fill in Supabase credentials
pip install -e ".[dev]"
uvicorn app.main:app --reload  # http://localhost:8000
pytest                         # run tests
```

### Frontend

```bash
cd frontend
cp .env.example .env           # set VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev                    # http://localhost:5173
npx tsc --noEmit               # type check
npm run build                  # production build
```

### Environment Variables

**Backend** (`.env` / Render):
```
SUPABASE_URL=https://...supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # never expose to browser
SUPABASE_JWT_SECRET=...
SUPABASE_DB_URL=postgresql://...
ALLOWED_ORIGINS=http://localhost:5173,https://your-app.vercel.app
PORT=8000
```

**Frontend** (`.env` / Vercel):
```
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_API_BASE_URL=https://your-backend.onrender.com
```

---

## CI/CD

Both pipelines run on every push.

**Backend** (`.github/workflows/backend-ci.yml`):
1. Ruff lint
2. Pyright type check
3. `pytest` (mock DB fixtures, no live Supabase)
4. Docker image build (validate only)

**Frontend** (`.github/workflows/frontend-ci.yml`):
1. `tsc --noEmit` (strict mode required — must exit 0)
2. `vite build`
3. Playwright smoke tests (sign-in, dashboard, portfolio CRUD, import)

---

## Key Design Rules

- **Soccer is out of scope.** `sport` enum contains only `football` and `basketball`.
- **TypeScript strict mode is required.** `tsconfig.json` has `"strict": true`. PRs must pass `tsc --noEmit`.
- **Never re-platform from Supabase.** Do not swap the DB or auth provider.
- **Never expose the service-role key to the browser.** It lives only in backend env vars.
- **Destructive import behavior is preserved.** Importing a section replaces that section in full.
- **Domain math is not rewritten.** Port as-is; refine in a dedicated pass, not during feature work.
- **Auth ownership is enforced.** PATCH/DELETE on portfolio entries returns 403 if `entry.user_id ≠ request_user_id`.

---

## Deployment

| Layer | Platform | Config |
|---|---|---|
| Frontend | Vercel (Hobby) | `frontend/vercel.json` — SPA rewrite |
| Backend | Render | `backend/Dockerfile` — Python 3.12, port 8000 |
| Database | Supabase | Existing project — do not migrate |

The legacy `docs/` pages (`index-archive-2026-03-11.html`) remain accessible via GitHub Pages as a rollback option.
