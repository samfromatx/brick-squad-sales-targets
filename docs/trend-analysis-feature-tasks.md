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

### T-01 — Create gem_rates Supabase table
**File:** `supabase/migrations/YYYYMMDD_gem_rates.sql`

- Create table with columns: `id` (uuid pk), `card` (text), `sport` (text: `football` | `basketball`), `gem_rate` (numeric 0–1), `created_at` (timestamptz)
- Add unique index on `(card, sport)`
- No RLS — read-only shared table, matching the `card_market_data` pattern
- Grant `SELECT` to `authenticated` and `anon` roles

---

### T-02 — Verify card_market_data schema
**File:** `supabase` — additive migration only if columns are missing

- Confirm `last_sale_date` (date) column exists on `card_market_data`
- Confirm all fields referenced in `trend-analysis-logic-v3.md` "Fields used" section are present: `avg`, `num_sales`, `price_change_pct`, `price_change_dollar`, `starting_price`, `last_sale`, `last_sale_date`, `min_sale`, `max_sale`, `volume_change_pct`, `total_sales_dollar`
- If any column is missing, write an additive migration — do not alter or drop existing columns

---

## Phase 2 — Backend Models
> **Run T-03 and T-04 in parallel.**

### T-03 — Add Pydantic response models for v3 analysis output
**File:** `backend/app/models/api.py`

Add the following models. These are the API response types returned by `/trends/detail`.

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
- `TrendAnalysisResponse`: `verdict`, `market_confidence`, `primary_reason`, `buy_target` (BuyTarget), `market_health` (MarketHealth), `ev_model` (EvModel | None), `break_even_grade` (str | None), `warnings` (list[AnalysisWarning]), `bounce_back` (BounceBackSignals | None)
- `TrendSearchResult`: `card` (text), `sport` (text)

---

### T-04 — Add CardMarketRow and GemRateRow domain types
**File:** `backend/app/models/domain.py`

- Add `CardMarketRow` dataclass matching all `card_market_data` columns including `last_sale_date`
- Add `GemRateRow` dataclass: `card`, `sport`, `gem_rate`
- These are internal types used by services only — not exposed in API responses

---

## Phase 3 — Backend Data Layer
> **Run T-05 and T-06 in parallel. Can also run in parallel with Phase 2.**

### T-05 — Add trend and gem rate DB queries
**File:** `backend/app/db/queries/trends.py`

- `search_cards(q: str, sport: str, limit=10) → list[str]`
  — `SELECT DISTINCT card FROM card_market_data WHERE sport = %s AND card ILIKE %s ORDER BY card LIMIT %s`
  — Wrap `q` as `'%{q}%'`
- `get_card_market_data(card: str, sport: str) → list[CardMarketRow]`
  — `SELECT * FROM card_market_data WHERE card = %s AND sport = %s`
  — Returns all window/grade rows for the card in one query
- `get_gem_rate(card: str, sport: str) → float | None`
  — `SELECT gem_rate FROM gem_rates WHERE card = %s AND sport = %s LIMIT 1`
  — Returns `None` if not found; triggers sport fallback in the service layer

---

### T-06 — Update /trends/search endpoint to accept sport param
**File:** `backend/app/routers/trends.py`

- Add required query param: `sport: Literal["football", "basketball"]`
- Pass `sport` to `search_cards` query
- Return `list[TrendSearchResult]` (card + sport)
- Keep endpoint auth-required (existing behavior)

---

## Phase 4 — Backend Analysis Engine
> ⚠️ **Do not start T-07 or T-08 until the user uploads `trend-analysis-logic-v3.md`.**
> T-07 and T-08 are sequential — complete T-07 before starting T-08.

### T-07 — Build trend analysis engine — Steps 1–7
**File:** `backend/app/services/trends.py`

Read `trend-analysis-logic-v3.md` in full before writing any code in this task.

- Create `_group_by_window_grade(rows: list[CardMarketRow]) → dict[int, dict[str, CardMarketRow]]` — keys are `window_days` and grade string
- Implement `_build_anchor(grouped, grade) → AnchorObject | None` — Step 1. 90d primary, 180d fallback, null if both fail `MIN_SALES=3`
- Implement `_recency_check(grouped) → tuple[bool, int]` — Step 2. Use `last_sale_date` from the 90d row for the most data-rich grade, fallback to any available row. Returns `(stale, days_since_last_sale)`. Append `STALE_DATA` warning if stale
- Implement `_volatility_check(anchor: AnchorObject, grouped) → VolatilitySignal` — Step 3. Requires `anchor_sales_count >= MIN_VOLATILITY_SALES (5)`. Ratio bands: `<0.35` Low, `0.35–0.75` Moderate, `0.75–1.0` High, `>=1.0` Extreme. Return `"Unknown - thin data"` label if below threshold
- Implement `_trend_signal(grouped, raw_anchor) → TrendHealth` — Step 4. Source priority differs by slab vs raw grading path (raw_anchor null or < RAW_MIN_VIABLE uses slab priority). 5-level strength scale from ratio. Gate on `30d_sales >= MIN_TREND_SALES (2)` per grade
- Implement `_volume_signal(grouped) → VolumeSignal` — Step 5. `+/-20%` thresholds using `volume_change_pct` from the 30d row
- Implement `_liquidity_signal(grouped) → LiquiditySignal` — Step 6. Sum of 90d `num_sales` across all three grades. Bands: `<=2` Very thin, `3–5` Thin, `6–12` Moderate, `>=13` Liquid
- Implement `_market_confidence(stale, anchors, liquidity, trend, volatility, volume) → str` — Step 7. Low / Medium / High rules as documented. Apply volume boost after initial classification. Volume boosts cannot override Low caused by stale data or null anchors

**Constants to define at module top:**
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
```

---

### T-08 — Build trend analysis engine — Steps 8–14 + verdict + buy target
**File:** `backend/app/services/trends.py`
**Prerequisite:** T-07 complete.

Read `trend-analysis-logic-v3.md` Steps 8–14 and the Final Verdict + Buy Target + Bounce Back sections before writing any code in this task.

- Implement `_net_prices(anchors) → dict` — Step 8. Multiply each anchor value by `EBAY_FEE_MULT`. PSA 8: `raw_anchor.value * PSA8_MULT * EBAY_FEE_MULT`
- Implement `_raw_viability_ratio(raw_anchor, psa9_anchor) → float | None` — Step 9. Uses `anchor_sales_count` from each anchor object, not a hardcoded window check
- Apply `RAW_MIN_VIABLE` gate — Step 10. Append `RAW_BELOW_THRESHOLD` warning if raw < $15. Append `STRONG_DOWNTREND` warning if trend ratio < 0.75. Either condition blocks the EV model and forces the slab path
- Implement `_gem_rate_lookup(card: str, sport: str, cursor) → tuple[float, str]` — Step 11. Query `gem_rates` table via `get_gem_rate`. Returns `(rate, "card_specific")` or `(fallback_constant, "sport_fallback")`. Append `GEM_FALLBACK` warning (severity medium) if fallback used
- Implement `_ev_model(raw_anchor, psa9_anchor, psa10_anchor, gem_rate, trend, net_prices) → EvModel | None` — Step 12. Dynamic `p9`: remaining probability after `p10` and `p_low` (min 0.10). `p10 + p9 <= 0.90`. Apply `DOWNTREND_PENALTY` to cost basis when trend is mild or strong downtrend. Returns None if raw is blocked by Step 10 gates
- Implement `_multiplier_matrix(psa9_anchor, psa10_anchor) → tuple[float, str]` — Step 13 context overlay. EV verdict takes precedence; matrix is narrative only
- Implement `_break_even_grade(cost_basis, psa9_anchor, psa10_anchor) → str` — Step 14. `be_gross = (cost_basis + 20) / 0.87`
- Implement `_final_verdict(market_confidence, raw_anchor, trend, ev_model, multiplier, gem_rate) → str` — full decision tree from the Final Verdict section. Low confidence suppresses all Buy verdicts
- Implement `_buy_target(verdict, anchors, data, ev_model, downtrend_penalty) → BuyTarget` — verdict-specific formulas. Raw: EV-safe max. PSA 9: `min(30d_avg, anchor * 0.90)`. PSA 10: `anchor * 0.85`. Append `RAW_ABOVE_EV_TARGET` if raw anchor exceeds max raw buy price. Append `THIN_BUY_TARGET` if sourced from window with < 3 sales. Append `DERIVED_BUY_TARGET` if raw price derived from `psa9 * 0.40`
- Implement `_bounce_back(grouped, grade: str) → BounceBackSignals` — B1–B6 signals as documented. B1 and B2 are required gates. Score 0–6. `qualifies = B1 and B2 and score >= 4`. Run for PSA 9 and PSA 10 separately; return the higher-scoring result
- Expose `run_trend_analysis(card: str, sport: str, cursor) → TrendAnalysisResponse` as the single public function — calls all private steps in order, accumulates warnings list throughout, returns fully assembled structured output

---

## Phase 5 — Backend Endpoint + Tests
> **Run T-09 and T-10 in parallel.**

### T-09 — Update /trends/detail endpoint
**File:** `backend/app/routers/trends.py`

- `GET /trends/detail?card=&sport=` — both params required
- Call `get_card_market_data(card, sport)` — return 404 if no rows found
- Call `run_trend_analysis(card, sport, cursor)` from trends service
- Return `TrendAnalysisResponse` directly (no wrapping envelope)
- Keep auth-required (existing behavior)
- Do not add ETag caching — analysis results change with market data refreshes

---

### T-10 — Write pytest tests for the analysis engine
**File:** `backend/tests/test_trends_engine.py`
> **Write this task alongside T-07 and T-08**, not after. Build the fixture factory before T-07 so tests can be added incrementally as each step is implemented.

- Build `make_market_rows(**overrides)` fixture factory — creates a minimal valid set of `CardMarketRow` objects for 90d/180d/30d windows × Raw/PSA 9/PSA 10. All values should be realistic defaults so a single override produces a meaningful edge case
- Test Step 1: anchor falls back to 180d when 90d has fewer than 3 sales
- Test Step 1: anchor is null when both 90d and 180d fail `MIN_SALES`
- Test Step 2: `stale=True` when `last_sale_date` is more than 30 days ago
- Test Step 7: `market_confidence = "Low"` when `stale=True` regardless of other signals
- Test Step 7: Low confidence suppresses all Buy verdicts in final verdict
- Test Step 12: EV model clears profit floor → verdict is `"Buy raw & grade"`
- Test Step 12: EV model below profit floor → falls to slab path
- Test buy target: raw derivation fallback used when no raw sales exist — `psa9_anchor * 0.40`, `DERIVED_BUY_TARGET` warning appended
- Test bounce back: qualifies when B1+B2 are true and score >= 4
- Test bounce back: does not qualify when B1 or B2 is false even if score >= 4
- Use `unittest.mock.patch` for `_gem_rate_lookup` — test both card-specific and sport-fallback paths independently

---

## Phase 6 — Frontend
> **T-11 and T-12 can run in parallel. T-13 and T-14 can run in parallel once T-11 and T-12 are done. All four can begin as soon as T-09 is complete.**

### T-11 — Add TypeScript types for analysis response
**File:** `frontend/src/lib/types.ts`

- Mirror all Pydantic models from T-03 as TypeScript interfaces
- Add `TrendSearchResult: { card: string; sport: 'football' | 'basketball' }`
- Add `TrendAnalysisResponse` with all nested types (`MarketHealth`, `EvModel`, `BuyTarget`, `BounceBackSignals`, `AnalysisWarning[]`)
- Mark optional fields (`ev_model`, `break_even_grade`, `bounce_back`) as `T | null`

---

### T-12 — Add trend API methods to ApiClient
**File:** `frontend/src/lib/api.ts`

- Add `searchCards(q: string, sport: string): Promise<TrendSearchResult[]>` — `GET /trends/search?q=&sport=`
- Add `getTrendAnalysis(card: string, sport: string): Promise<TrendAnalysisResponse>` — `GET /trends/detail?card=&sport=`
- Both use the existing `ApiClient` Bearer token pattern

---

### T-13 — Build TrendPage — sport toggle + search combobox
**File:** `frontend/src/pages/TrendPage.tsx`

- Sport toggle: two buttons (`Football` / `Basketball`), default `Football`. Changing sport resets search input, selected card, and results
- Search input: controlled text input. Debounce 300ms before calling `searchCards`. Show dropdown of up to 10 results beneath the input
- Dropdown items: clicking an item selects the card, closes the dropdown, sets `selectedCard` state
- Analyze button: enabled only when `selectedCard` is set. Triggers `getTrendAnalysis` via TanStack Query (`useQuery` with `enabled: !!selectedCard`). Show loading spinner on the button while fetching
- If user edits the search input after a card is selected, clear `selectedCard` and results
- Error states:
  - 404 → `"No market data found for this card"`
  - Other error → `"Analysis failed, please try again"`
- Pass `TrendAnalysisResponse` result to `TrendAnalysisResult` component rendered below the search block

---

### T-14 — Build TrendAnalysisResult component
**File:** `frontend/src/components/TrendAnalysisResult.tsx` (or inline in TrendPage.tsx)

Use existing shadcn/ui components (`Badge`, `Alert`, `Table`) throughout — do not add new dependencies.

- **Signal strip:** compact single row at the top — 30d avg price, trend direction + label, volume signal, liquidity label, 30d sales count, Buy/Watch chip (`"Watch"` if verdict is Pass, Low confidence, or downtrend; `"Buy"` otherwise)
- **Verdict block:** large verdict text, `market_confidence` badge (Low = red, Medium = amber, High = green), `primary_reason` text, buy target price + grade + basis
- **Market data table:** rows = Raw / PSA 9 / PSA 10, columns = 30d avg, 90d avg, trend ratio, volatility label. Only render rows where anchor data exists
- **EV model section** (only if `ev_model` is non-null): raw anchor, grading cost, total cost, expected resale, expected profit. Show `"(!) sport fallback"` label next to gem rate if `gem_rate_source === "sport_fallback"`
- **Break-even grade** (only if non-null): single line below EV model
- **Bounce back section** (only if `bounce_back` is non-null and `qualifies === true`): B1–B6 signal table with pass/fail per signal and total score
- **Warnings list:** render each `AnalysisWarning` as an inline alert. Severity mapping: `low` = muted, `medium` = amber, `high` = red

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
