# Trend Analysis Feature — Claude Code Task Plan

## Before You Start

- Read `README.md` and `trend-analysis-logic-v3.md` in full before writing any code.
- **Do not start T-07 or T-08 until the user uploads `trend-analysis-logic-v3.md`.** These tasks implement the full 14-step engine and must follow that document exactly — do not approximate the logic from memory.
- Several tasks can and should be worked in parallel. Parallelism is called out explicitly in each phase.
- `last_sale_date` is a single value per row in `card_market_data` (each window/grade row has its own value). For the recency check in Step 2, use the value from the 90d row, falling back to any available row for the card.

---

## Architecture Summary

- **Analysis logic lives in the backend** (`services/trends.py`). The 14-step computation runs server-side and returns the full structured output. The frontend is a pure display layer — no business logic.
- **Gem rates move to Supabase** as a new `gem_rates` table. Backend looks up by card name + sport, falls back to sport constants (football: 38%, basketball: 55%). No CSVs.
- **`/trends/detail`** returns the complete `TrendAnalysisResponse`. Frontend calls it and renders the result.
- **`/trends/search`** adds a required `sport` param and returns `list[TrendSearchResult]`.

---

## Phase 1 — Database
> **Run T-01 and T-02 in parallel.**

### T-01 — Create gem_rates Supabase table ✅
**File:** `supabase/migrations/YYYYMMDD_gem_rates.sql`

- Create table with columns: `id` (uuid pk), `card` (text), `sport` (text: `football` | `basketball`), `gem_rate` (numeric 0–1), `created_at` (timestamptz)
- Add unique index on `(card, sport)`
- No RLS — read-only shared table, matching the `card_market_data` pattern
- Grant `SELECT` to `authenticated` and `anon` roles

---

### T-02 — Verify card_market_data schema ✅
**File:** `supabase` — additive migration only if columns are missing

- Confirm `last_sale_date` (date) column exists on `card_market_data`
- Confirm all fields referenced in `trend-analysis-logic-v3.md` "Fields used" section are present: `avg`, `num_sales`, `price_change_pct`, `price_change_dollar`, `starting_price`, `last_sale`, `last_sale_date`, `min_sale`, `max_sale`, `volume_change_pct`, `total_sales_dollar`
- If any column is missing, write an additive migration — do not alter or drop existing columns

---

## Phase 2 — Backend Models
> **Run T-03 and T-04 in parallel.**

### T-03 — Add Pydantic response models for v3 analysis output ✅
**File:** `backend/app/models/api.py`

Models implemented:

- `AnchorObject`: `grade`, `anchor_value`, `anchor_window`, `anchor_sales_count`, `anchor_source`
- `TrendHealth`: `direction`, `ratio`, `source_grade`, `source_window`
- `VolumeSignal`: `signal` (Accelerating | Stable | Declining), `change_pct`
- `LiquiditySignal`: `label` (Very thin | Thin | Moderate | Liquid), `total_90d_sales`
- `VolatilitySignal`: `label`, `ratio` (optional — null when thin data)
- `MarketHealth`: contains `trend` (TrendHealth), `volume` (VolumeSignal), `liquidity` (LiquiditySignal), `volatility` (VolatilitySignal)
- `EvModel`: `raw_anchor`, `grading_cost`, `total_cost`, `psa9_anchor`, `psa10_anchor`, `gem_rate`, `gem_rate_source`, `estimated_outcomes` (dict with `psa10`, `psa9`, `psa8_or_lower`), `expected_resale_after_fees`, `expected_profit`, `profit_floor`
- `BuyTarget`: `grade`, `price`, `basis`, `warning` (optional)
- `AnalysisWarning`: `code`, `severity` (low | medium | high), `message`
- `BounceBackSignals`: `b1_cheap` through `b6_no_spike` booleans, `score` (int 0–6), `qualifies` (bool)
- `WindowRow` *(added post-launch)*: `window_days`, `raw_avg`, `psa9_avg`, `psa10_avg`, `raw_psa9_ratio`, `psa10_psa9_ratio`, `is_anchor` — all price/ratio fields are `float | None`
- `TrendAnalysisResponse`: `verdict`, `market_confidence`, `primary_reason`, `buy_target` (BuyTarget), `market_health` (MarketHealth), `ev_model` (EvModel | None), `break_even_grade` (str | None), `warnings` (list[AnalysisWarning]), `bounce_back` (BounceBackSignals | None), `window_prices: list[WindowRow] = []` *(added post-launch)*
- `TrendSearchResult`: `card` (text), `sport` (text)

---

### T-04 — Add CardMarketRow and GemRateRow domain types ✅
**File:** `backend/app/models/domain.py`

- Added `CardMarketRow` dataclass matching all `card_market_data` columns including `last_sale_date`. `avg` and `num_sales` are typed `float | None` and `int | None` respectively — pyright strict mode requires explicit `is None` guards before comparisons.
- Added `GemRateRow` dataclass: `card`, `sport`, `gem_rate`
- These are internal types used by services only — not exposed in API responses

---

## Phase 3 — Backend Data Layer
> **Run T-05 and T-06 in parallel. Can also run in parallel with Phase 2.**

### T-05 — Add trend and gem rate DB queries ✅
**File:** `backend/app/db/queries/trends.py`

- `search_cards(q: str, sport: str, limit=25) → list[str]`
  — Uses prefix-rank + sales volume ordering for relevance. High-volume base cards surface above obscure parallels:
  ```sql
  SELECT card,
         MAX(num_sales) AS top_sales,
         CASE WHEN card ILIKE '{q}%' THEN 0 ELSE 1 END AS prefix_rank
  FROM card_market_data
  WHERE sport = %s AND card ILIKE %s
  GROUP BY card
  ORDER BY prefix_rank, top_sales DESC, card
  LIMIT %s
  ```
  — Params: `[f"{q}%", sport, f"%{q}%", limit]` (prefix-rank uses prefix match; ILIKE filter uses substring match)
  — Default limit raised from 10 → 25 to surface more results for ambiguous queries

- `get_card_market_data(card: str, sport: str) → list[CardMarketRow]`
  — `SELECT * FROM card_market_data WHERE card = %s AND sport = %s`
  — Returns all window/grade rows for the card in one query

- `get_gem_rate(card: str, sport: str) → float | None`
  — `SELECT gem_rate FROM gem_rates WHERE card = %s AND sport = %s LIMIT 1`
  — Returns `None` if not found; triggers sport fallback in the service layer

---

### T-06 — Update /trends/search endpoint to accept sport param ✅
**File:** `backend/app/routers/trends.py`

- Add required query param: `sport: Literal["football", "basketball"]`
- Pass `sport` to `search_cards` query
- Return `list[TrendSearchResult]` (card + sport)
- Keep endpoint auth-required (existing behavior)

---

## Phase 4 — Backend Analysis Engine
> T-07 and T-08 are sequential — complete T-07 before starting T-08.

### T-07 — Build trend analysis engine — Steps 1–7 ✅
**File:** `backend/app/services/trends.py`

Constants defined at module top:
```python
GRADING_COST = 38.00
EBAY_FEE_MULT = 0.87
MIN_PROFIT_FLOOR = 20.00
MIN_SALES = 3
MIN_TREND_SALES = 2
MIN_VOLATILITY_SALES = 5
DOWNTREND_PENALTY = 10.00
PSA8_MULT = 0.50
GEM_FALLBACK_FB = 0.38
GEM_FALLBACK_BB = 0.55
STALE_DAYS = 30
VOLUME_ACCEL_THRESHOLD = 0.20
VOLUME_DECAY_THRESHOLD = -0.20
RAW_MIN_VIABLE = 15.00
SHORT_TERM_DIVERGENCE_WARN = 0.15   # added post-launch
MIN_SHORT_TERM_SALES = 2            # added post-launch
```

Functions implemented:
- `_group_by_window_grade(rows)` — keys are `window_days` and grade string
- `_build_anchor(grouped, grade)` — Step 1. 90d primary, 180d fallback, null if both fail `MIN_SALES=3`. `anchor_sales_count` uses `row.num_sales or 0` (None-safe)
- `_recency_check(grouped)` — Step 2. Returns `(stale, days_since_last_sale)`. Appends `STALE_DATA` warning if stale
- `_volatility_check(anchor, grouped)` — Step 3
- `_trend_signal(grouped, raw_anchor)` — Step 4
- `_volume_signal(grouped)` — Step 5
- `_liquidity_signal(grouped)` — Step 6
- `_market_confidence(stale, anchors, liquidity, trend, volatility, volume)` — Step 7

---

### T-08 — Build trend analysis engine — Steps 8–14 + verdict + buy target ✅
**File:** `backend/app/services/trends.py`
**Prerequisite:** T-07 complete.

Functions implemented:
- `_net_prices(anchors)` — Step 8
- `_raw_viability_ratio(raw_anchor, psa9_anchor)` — Step 9
- RAW_MIN_VIABLE gate — Step 10
- `_gem_rate_lookup(card, sport, warnings)` — Step 11. **Important:** this call runs unconditionally (outside the EV block) so `gem_rate` is always populated before the `suggest_psa10` verdict check. A bug where `gem_rate` defaulted to `0.0` caused incorrect "Buy PSA 10" verdicts for raw-blocked cards — fixed by moving the lookup outside the EV gate.
- `_ev_model(...)` — Step 12
- `_multiplier_matrix(psa9_anchor, psa10_anchor)` — Step 13
- `_break_even_grade(cost_basis, psa9_anchor, psa10_anchor)` — Step 14
- `_final_verdict(...)` — full decision tree
- `_buy_target(verdict, anchors, grouped, ev_model, downtrend_penalty, warnings)` — see updated spec below
- `_bounce_back(grouped, grade)` — B1–B6 signals
- `_build_window_prices(grouped, anchor_grade, anchor_window)` *(added post-launch)* — builds `list[WindowRow]` for the price ranges table; marks the anchor row with `is_anchor=True`
- `_short_term_price_anchor(grouped, grade, avg_30d, warnings)` *(added post-launch)* — see spec below
- `run_trend_analysis(card, sport, cursor)` — public entry point, now includes `window_prices` in return value

#### `_short_term_price_anchor()` spec *(added post-launch)*

Uses 7d/14d averages as the price ceiling when both windows agree on a direction relative to the 30d average. This makes buy targets more conservative when the market is still falling and more accurate when momentum is building.

```python
def _short_term_price_anchor(
    grouped: dict[int, dict[str, CardMarketRow]],
    grade: str,
    avg_30d: float,
    warnings: list[AnalysisWarning],
) -> tuple[float, str]:
```

Returns `(price_anchor, basis_label)`.

1. Pull 7d and 14d rows for the grade from `grouped`
2. Sales gate: both windows must have `num_sales >= MIN_SHORT_TERM_SALES (2)`. Fall back to `(avg_30d, "30d avg")` if either fails
3. None guard: if either `row.avg` is `None`, fall back to `(avg_30d, "30d avg")`
4. Direction check: `downtrend = avg_7d < avg_30d and avg_14d < avg_30d`; `uptrend = avg_7d > avg_30d and avg_14d > avg_30d`. Fall back if neither
5. `short_term_anchor = (avg_7d + avg_14d) / 2`
6. Divergence warning: if `abs(short_term_anchor - avg_30d) / avg_30d > 0.15` and `avg_30d != 0`, append `SHORT_TERM_DIVERGENCE` warning (severity medium)
7. Return `(short_term_anchor, "7d/14d avg (continuing decline)")` for downtrend or `(short_term_anchor, "7d/14d avg (momentum)")` for uptrend

#### Updated `_buy_target()` formulas *(post-launch)*

All three verdict paths now call `_short_term_price_anchor()` with grade-specific data:

| Verdict | Formula |
|---|---|
| Buy raw & grade | `price = min(_short_term_price_anchor(grouped, "Raw", avg_30, warnings), ev_ceiling)` |
| Buy PSA 9 | `price_ceiling, basis = _short_term_price_anchor(grouped, "PSA 9", avg_30, warnings)`; `price = min(price_ceiling, anchor × 0.90)` |
| Buy PSA 10 | `price_ceiling, basis = _short_term_price_anchor(grouped, "PSA 10", avg_30, warnings)`; `price = min(price_ceiling, anchor × 0.85)` |

The `basis` field on the returned `BuyTarget` uses the label from `_short_term_price_anchor()`.

#### `BuyTarget.basis` values

| Condition | `basis` label |
|---|---|
| Short windows unavailable or conflicting | `"30d avg"` |
| Both 7d and 14d below 30d | `"7d/14d avg (continuing decline)"` |
| Both 7d and 14d above 30d | `"7d/14d avg (momentum)"` |
| Derived from PSA 9 (no raw data) | `"derived from PSA 9 × 0.40"` |

#### Warning codes

| Code | Severity | When |
|---|---|---|
| `SHORT_TERM_DIVERGENCE` | medium | Short-term anchor diverges >15% from 30d avg |

---

## Phase 5 — Backend Endpoint + Tests
> **Run T-09 and T-10 in parallel.**

### T-09 — Update /trends/detail endpoint ✅
**File:** `backend/app/routers/trends.py`

- `GET /trends/detail?card=&sport=` — both params required
- Call `get_card_market_data(card, sport)` — return 404 if no rows found
- Call `run_trend_analysis(card, sport, cursor)` from trends service
- Return `TrendAnalysisResponse` directly (no wrapping envelope)
- Keep auth-required (existing behavior)

---

### T-10 — Write pytest tests for the analysis engine ✅
**File:** `backend/tests/test_trends_engine.py`

29 tests total. Tests cover:

**Engine steps (original):**
- Step 1: anchor falls back to 180d when 90d < `MIN_SALES`
- Step 1: anchor is null when both 90d and 180d fail `MIN_SALES`
- Step 2: `stale=True` when `last_sale_date` > 30 days ago
- Step 7: `market_confidence = "Low"` when `stale=True`
- Step 7: Low confidence suppresses all Buy verdicts
- Step 12: EV model clears profit floor → `"Buy raw & grade"`
- Step 12: EV model below profit floor → slab path
- Buy target: raw derivation fallback — `psa9_anchor × 0.40`, `DERIVED_BUY_TARGET` warning
- Bounce back: qualifies when B1+B2 true and score >= 4
- Bounce back: does not qualify when B1 or B2 false

**Short-term price anchor (added post-launch):**
- Downtrend detected: 7d=$160, 14d=$165, 30d=$175 → `price_ceiling = 162.50`, basis = `"7d/14d avg (continuing decline)"`
- Uptrend detected: 7d=$190, 14d=$185, 30d=$175 → `price_ceiling = 187.50`, basis = `"7d/14d avg (momentum)"`
- Conflicting signals: 7d=$160, 14d=$185, 30d=$175 → falls back to `avg_30d = 175`, basis = `"30d avg"`
- Sales gate: 7d has 1 sale → falls back to 30d regardless of direction
- Divergence warning fires: 7d=$140, 14d=$145, 30d=$175 → ~18.6% divergence → `SHORT_TERM_DIVERGENCE` warning (severity medium)
- Divergence warning suppressed: 7d=$168, 14d=$170, 30d=$175 → ~4% → no warning
- 90d anchor cap holds: short-term anchor high → `min()` clamps to `anchor × 0.90`
- Zero avg_30d guard: no `ZeroDivisionError`, divergence warning skipped

**Buy target path tests (added post-launch):**
- `test_short_term_psa10_downtrend_applied`: PSA 10 path uses 7d/14d ceiling
- `test_short_term_raw_downtrend_applied`: Raw path uses 7d/14d ceiling

---

## Phase 6 — Frontend
> **T-11 and T-12 can run in parallel. T-13 and T-14 can run in parallel once T-11 and T-12 are done.**

### T-11 — Add TypeScript types for analysis response ✅
**File:** `frontend/src/lib/types.ts`

- All Pydantic models from T-03 mirrored as TypeScript interfaces
- `TrendSearchResult: { card: string; sport: 'football' | 'basketball' }`
- `TrendAnalysisResponse` with all nested types
- Optional fields (`ev_model`, `break_even_grade`, `bounce_back`) typed as `T | null`
- `WindowRow` interface *(added post-launch)*:
  ```ts
  interface WindowRow {
    window_days: number
    raw_avg: number | null
    psa9_avg: number | null
    psa10_avg: number | null
    raw_psa9_ratio: number | null
    psa10_psa9_ratio: number | null
    is_anchor: boolean
  }
  ```
- `window_prices: WindowRow[]` added to `TrendAnalysisResponse` *(added post-launch)*

---

### T-12 — Add trend API methods to ApiClient ✅
**File:** `frontend/src/lib/api.ts`

- `searchCards(q: string, sport: string): Promise<TrendSearchResult[]>` — `GET /trends/search?q=&sport=&limit=25`
  - Passes `limit: '25'` *(raised post-launch)* so the dropdown surfaces more results for ambiguous queries
- `getTrendAnalysis(card: string, sport: string): Promise<TrendAnalysisResponse>` — `GET /trends/detail?card=&sport=`
- Both use the existing `ApiClient` Bearer token pattern

---

### T-13 — Build TrendPage — sport toggle + search combobox ✅
**File:** `frontend/src/pages/TrendPage.tsx`

- Sport toggle: Football / Basketball, default Football
- Search input: debounced 300ms, dropdown of up to 25 results
- Analyze button: enabled only when `selectedCard` is set
- Loading, error, and 404 states handled
- Result passed to `TrendAnalysisResult` component

---

### T-14 — Build TrendAnalysisResult component ✅
**Files:** `frontend/src/features/trends/TrendAnalysisResult.tsx`, `frontend/src/app/layout/TrendBar.tsx`

**TrendAnalysisResult:**
- Signal strip, verdict block, market data table, EV model section, break-even grade, bounce back section, warnings list — all implemented per original spec
- **Window price ranges table** *(added post-launch)*: rendered between Market Signals and EV Model. Shows Raw / PSA 9 / PSA 10 avg prices and ratios for each time window. The anchor row is highlighted with a cream background (`#fdf8f0`) and an amber "Anchor" chip. Implemented in `WindowPricesTable` component within the file.

**TrendBar** *(Clear button added post-launch)*:
- Located at `frontend/src/app/layout/TrendBar.tsx`
- Clear button appears when a search query is active or a `?card=` param is in the URL
- Clicking Clear resets query, selectedCard, dropdown state, and navigates to `/trends` (removing URL params)
- Uses `useSearchParams` to detect an existing card param for the show/hide condition

---

## Parallel Execution Summary

| Can run together | Tasks |
|---|---|
| Phase 1 | T-01 + T-02 |
| Phase 2 | T-03 + T-04 |
| Phases 2 + 3 | T-03, T-04, T-05, T-06 all at once |
| Phase 4 | T-10 fixture factory built before T-07; tests written alongside T-07 and T-08 |
| Phase 5 | T-09 + T-10 finalization |
| Phase 6 | T-11 + T-12 together, then T-13 + T-14 together |

---

## Key Constraints (do not violate)

- Soccer is out of scope. `sport` enum is `football | basketball` only — do not add soccer anywhere
- TypeScript strict mode required. All frontend code must pass `tsc --noEmit`
- Never re-platform from Supabase
- Never expose the service-role key to the browser
- Domain math must follow `trend-analysis-logic-v3.md` exactly — do not simplify or approximate
- `card_market_data` has no RLS — it is a shared read-only table. Do not add RLS to it
- `gem_rates` follows the same pattern — no RLS, shared read-only
- `CardMarketRow.avg` and `.num_sales` are nullable — always use explicit `is None` guards before comparison operators (pyright strict mode enforces this)
- `_gem_rate_lookup()` must run unconditionally before the `suggest_psa10` check — never gate it inside the EV block
