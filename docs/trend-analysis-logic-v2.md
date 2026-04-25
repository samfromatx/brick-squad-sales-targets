# Trend Analysis Logic v2

Revised from `trend-analysis-logic.md`. Documents the full algorithm behind the Trend Analysis tool — search a card, get a buy verdict, EV model, and bounce-back score.

---

## Data Source

Market data is read from the `card_market_data` Supabase table, filtered by `sport` and `window_days`. Each row represents one card/grade/window combination.

**Fields used:**
`grade`, `window_days`, `avg`, `num_sales`, `price_change_pct`, `price_change_dollar`, `starting_price`, `last_sale`, `last_sale_date`, `min_sale`, `max_sale`, `volume_change_pct`, `total_sales_dollar`

**Time windows:** 7d, 14d, 30d, 60d, 90d, 180d, 360d  
**Grades tracked per window:** Raw, PSA 9, PSA 10

---

## Constants

| Constant | Value | Meaning |
|---|---|---|
| `GRADING_COST` | $38.00 | $30 PSA fee + $8 shipping |
| `EBAY_FEE_MULT` | 0.87 | 1 − 13% eBay fees (net proceeds multiplier) |
| `MIN_PROFIT_FLOOR` | $20.00 | Minimum net EV above cost to recommend grading |
| `MIN_SALES` | 3 | Minimum sales for a confident price signal |
| `MIN_TREND_SALES` | 2 | Minimum 30d sales required to compute trend direction |
| `DOWNTREND_PENALTY` | $10.00 | Added to cost basis when card is in a downtrend |
| `PSA8_MULT` | 0.50 | PSA 8 estimated as 50% of raw avg price |
| `GEM_FALLBACK_FB` | 38% | Football fallback gem rate (no file match) |
| `GEM_FALLBACK_BB` | 55% | Basketball fallback gem rate (no file match) |
| `STALE_DAYS` | 30 | Days since last sale before anchors are flagged stale |
| `VOLATILITY_THRESHOLD` | 1.0 | Max acceptable (max−min)/avg spread ratio |
| `VOLUME_ACCEL_THRESHOLD` | 0.20 | Volume change % above which volume is "accelerating" |
| `VOLUME_DECAY_THRESHOLD` | -0.20 | Volume change % below which volume is "declining" |

---

## Step-by-Step Algorithm

### Step 1 — Price Anchors

Primary anchor: **90d avg**. Falls back to **180d avg** if 90d has fewer than `MIN_SALES` (3) sales. If 180d also has fewer than 3 sales, the anchor is set to `null` and all downstream steps that depend on it are skipped.

```
raw_anchor   = avg(90d raw)   if raw_90d_sales >= 3
             = avg(180d raw)  if raw_180d_sales >= 3
             = null           otherwise

psa9_anchor  = avg(90d PSA9)  if psa9_90d_sales >= 3
             = avg(180d PSA9) if psa9_180d_sales >= 3
             = null           otherwise

psa10_anchor = avg(90d PSA10) if psa10_90d_sales >= 3
             = avg(180d PSA10) if psa10_180d_sales >= 3
             = null            otherwise
```

If all three anchors are `null`, return verdict: **"Insufficient data"** and halt.

### Step 2 — Recency Check

Before computing confidence, check whether the market is active. Uses `last_sale_date` from the most recent window with data.

```
days_since_last_sale = today - last_sale_date

stale = (days_since_last_sale > STALE_DAYS)
```

If `stale = true`:
- Override confidence to **"Low"** (regardless of other signals)
- Append warning to output: ⚠ *"Last sale was X days ago — price anchors may be stale."*

### Step 3 — Volatility Check

High spread between min and max sale price means the avg is less reliable as an anchor. Computed per grade using the anchor window.

```
volatility_ratio = (max_sale - min_sale) / avg

volatile = (volatility_ratio > VOLATILITY_THRESHOLD)
```

If `volatile = true`, append a warning to the output: ⚠ *"Wide price spread detected — avg may not reflect true market value."*  
Volatile cards are not blocked from a "Buy" verdict, but the warning is surfaced prominently.

### Step 4 — Data Quality / Confidence

```
low_confidence = (raw_anchor = null) OR (psa9_anchor = null)

total_90d = raw_90d_sales + psa9_90d_sales + psa10_90d_sales

confidence = "Low"    if low_confidence OR stale
           = "Medium"  if downtrend OR total_90d < 5
           = "High"    otherwise
```

> **Verdicts of "Buy raw & grade", "Buy PSA 9", or "Buy PSA 10" are suppressed at Low confidence.**  
> A Low confidence card outputs verdict: **"Watch — insufficient signal"** regardless of what the model calculates. This prevents acting on unreliable data.

### Step 5 — Trend Signal

Compares 30d avg to 90d avg to determine price direction. **Requires `30d_sales >= MIN_TREND_SALES` (2) to produce a directional signal.** If 30d sales are below this threshold, trend is flagged as `"Insufficient data"` rather than a direction.

```
if 30d_raw_sales >= 2:
    ratio = avg(30d raw) / raw_anchor
else if 30d_psa9_sales >= 2:
    ratio = avg(30d PSA9) / psa9_anchor
else:
    trend = "Insufficient data"
    → skip trend-dependent logic

if ratio > 1.10  → trend = "uptrend"
if ratio < 0.90  → trend = "downtrend"
else             → trend = "stable"
```

### Step 6 — Volume Signal

Uses `volume_change_pct` from the 30d window to assess whether buying activity is increasing or fading.

```
volume_signal = "accelerating" if volume_change_pct >= +20%
              = "declining"    if volume_change_pct <= -20%
              = "stable"       otherwise
```

Volume signal modifies confidence:

```
if trend = "uptrend" AND volume_signal = "accelerating":
    confidence = min("High", confidence + 1 level)   // reward: price up, volume up

if trend = "uptrend" AND volume_signal = "declining":
    append warning: ⚠ "Price rising but volume declining — premium may be fragile"

if trend = "stable" AND volume_signal = "accelerating":
    confidence = min("High", confidence + 1 level)   // reward: accumulation signal

if trend = "downtrend":
    // no volume adjustment — downtrend penalty handles this
```

Note: Volume confidence boost cannot override a Low confidence caused by stale data or null anchors.

### Step 7 — Net Prices (after eBay fees)

```
net_raw   = raw_anchor   × 0.87
net_psa9  = psa9_anchor  × 0.87
net_psa10 = psa10_anchor × 0.87
net_psa8  = raw_anchor   × 0.50   (PSA 8 downside estimate)
```

### Step 8 — Raw Viability Ratio

Answers: is the raw cheap enough relative to PSA 9 to make grading worthwhile?

**Only runs when `psa9_anchor` is non-null AND `psa9_90d_sales >= MIN_SALES`.** If PSA 9 data is thin, ratio returns `null` with label "Insufficient slab data."

```
raw_ratio = raw_anchor / psa9_anchor   (only if both anchors non-null and psa9_sales >= 3)

raw_ratio < 0.40    → "Viable grade candidate"        (green)
raw_ratio 0.40–0.60 → "Marginal — near-perfect only"  (amber)
raw_ratio > 0.60    → "Skip grading — buy the slab"   (red)
raw_ratio = null    → "No raw data" or "Insufficient slab data" (gray)
```

### Step 9 — Gem Rate

Looks up the card-specific PSA 10 gem rate from a CardLadder CSV file in `data/`. Filename derived from player name (e.g., `Patrick-Mahomes.csv`). Card number (`#123`) used to match the specific row.

If no file exists or no card number match: uses the sport fallback (38% football, 55% basketball).

**Always flag when fallback is used.** Append to output: ⚠ *"Using sport-average gem rate — card-specific PSA population data unavailable. EV estimates are less reliable."*

### Step 10 — EV Model (grading expected value)

Only runs when `raw_ratio ≤ 0.60` AND all three price anchors are non-null.

**p9 is dynamic**, not fixed. It is derived from the gem rate to preserve a realistic PSA 8 floor.

```
p10   = gem_rate / 100
p9    = min(0.40, 0.90 - p10)    // p9 capped so that p10 + p9 never exceeds 0.90
p_low = 1 - p10 - p9             // always >= 0.10 (minimum 10% PSA 8 or below)

cost_basis = raw_anchor + $38
             + $10 (if trend = "downtrend")

EV = (p10 × net_psa10) + (p9 × net_psa9) + (p_low × net_psa8)

net_ev = EV - cost_basis

grade_verdict = "Buy raw & grade"  if net_ev >= $20
              = "Pass"             otherwise
```

### Step 11 — PSA 10/9 Multiplier Matrix

When both PSA 10 and PSA 9 prices exist:

```
multiplier = psa10_anchor / psa9_anchor
```

| Multiplier | Gem Rate < 15% | Gem Rate 15–35% | Gem Rate > 35% |
|---|---|---|---|
| < 1.5× | Buy PSA 9 | Buy PSA 9 | Buy raw / PSA 9 |
| 1.5–3.5× | Strong grade play | Run EV model | Grade for PSA 9 |
| > 3.5× | PSA 10 scarcity real | Caution — fragile premium | Avoid PSA 10 play |

> **The EV model (Step 10) takes precedence over the multiplier matrix.** If the EV model returns a "Pass," the matrix does not override it. The matrix is used as a *context overlay* — surfaced as explanatory narrative in the UI — not as a second decision node.

### Step 12 — Break-Even Grade

Calculates the minimum gross sale price needed to hit the profit floor, then checks which grade covers it:

```
be_gross = (cost_basis + $20) / 0.87

if be_gross <= psa9_anchor  → "Needs PSA 9"
if be_gross <= psa10_anchor → "Needs PSA 10"
else                        → "No grade covers cost"
```

---

## Final Verdict

```
suggestPsa10 = (multiplier > 3.5) AND (gem_rate < 15%)

// Low confidence → suppress all buy signals
if confidence = "Low":
    → "Watch — insufficient signal"

// Raw is too expensive relative to PSA 9 slab
else if raw_ratio > 0.60:
    → "Buy PSA 10"  (if suggestPsa10)
    → "Buy PSA 9"   (otherwise)

// EV model says grade
else if grade_verdict = "Buy raw & grade":
    → "Buy raw & grade"

// Fallback to slab if price data exists
else if psa9_anchor OR psa10_anchor is non-null:
    → "Buy PSA 10"  (if suggestPsa10)
    → "Buy PSA 9"   (otherwise)

else:
    → "Pass"
```

---

## Suggested Buy Target Price

Walk time windows shortest → longest, find first window with data for the verdict grade:

1. **Confident signal:** first window with avg price AND `num_sales >= 3` → use that avg
2. **Thin data:** first window with any avg price → use that avg, flagged with ⚠ *"Low sales volume — price may not be reliable"*
3. **Raw derivation fallback:** if verdict is "Buy raw & grade" and no raw sales exist at all → `psa9_anchor × 0.40`; labeled explicitly as ⚠ *"Derived threshold — no raw market data. Do not treat as a market comp."*

---

## Bounce Back Score

Evaluates whether a card that has pulled back is a buy-the-dip opportunity. Runs separately for PSA 9 and PSA 10. **Requires S1 to pass AND a total score ≥ 3 out of 5 to qualify.**

| Signal | Rule | Pass condition |
|---|---|---|
| **S1★** (required) | Cheap vs norm | 30d avg is ≥15% below 180d avg |
| S2 | Stabilizing | 14d avg ≥ 97% of 30d avg (floor forming) |
| S3 | Recovery not priced in | 7d avg still < 90% of 180d avg |
| S4 | Market still active | 30d sales ≥ 25% of monthly 360d pace — computed as `(360d_sales / 12) × 0.25`; minimum threshold of 1 sale enforced |
| S5 | No spike distortion | 180d max < 3× the 180d avg |

Score: 0–5. Qualifies: S1 = true AND score ≥ 3.

---

## Signal Strip (compact output)

The top strip shows quick-glance stats after a search:

| Stat | Source |
|---|---|
| 30d avg price | 30d PSA 9 avg → fallback PSA 10 → Raw |
| 30d trend | PSA 9 `price_change_pct` (30d window) → fallback PSA 10 |
| 30d volume signal | `volume_change_pct` label: Accelerating / Stable / Declining |
| 30d sales | Sum of PSA 9 + PSA 10 + Raw 30d sales |
| Buy target | From `investment_targets` DB table (matched by card name) |
| Sell at | From `investment_targets` DB table |
| Buy/Watch chip | "Watch" if verdict = Pass, Low confidence, or downtrend; "Buy" otherwise |
| Gem rate source | "Card-specific" or "⚠ Sport fallback" |

---

## Warnings Summary

All warnings are non-blocking unless otherwise noted. They are surfaced in the UI alongside the verdict.

| Code | Trigger | Blocking? |
|---|---|---|
| `STALE_DATA` | Last sale > 30 days ago | Forces Low confidence |
| `WIDE_SPREAD` | Volatility ratio > 1.0 | No |
| `GEM_FALLBACK` | No card-specific gem rate file | No |
| `LOW_CONFIDENCE` | Null anchors, stale data | Suppresses Buy verdict |
| `DERIVED_BUY_TARGET` | No raw sales — price derived from PSA 9 | No |
| `THIN_BUY_TARGET` | Buy target from window with < 3 sales | No |
| `FRAGILE_PREMIUM` | Uptrend + declining volume | No |
| `NO_TREND_SIGNAL` | 30d sales < 2 | No |

---

## Data Flow Summary

```
card_market_data table (Supabase)
  ↓ query by sport + ilike(card, query)
  ↓ group by window_days → { raw, psa9, psa10 } per window
  ↓
Step 1:  anchors (90d primary, 180d fallback, null if both thin)
Step 2:  recency check (last_sale_date → stale flag)
Step 3:  volatility check (max−min spread → wide spread flag)
Step 4:  confidence (Low / Medium / High — stale overrides all)
Step 5:  trend signal (30d vs 90d — gated on min 2 sales)
Step 6:  volume signal (volume_change_pct → accel / stable / decline)
           → volume modifies confidence up or down
Step 7:  net prices after eBay fees
Step 8:  raw viability ratio (gated on psa9 sales minimum)
Step 9:  gem rate lookup (card-specific CSV or flagged fallback)
Step 10: EV model (dynamic p9, p10+p9 ≤ 0.90, p_low ≥ 0.10)
Step 11: multiplier matrix (context overlay — EV takes precedence)
Step 12: break-even grade
  ↓
Final verdict (suppressed at Low confidence)
  → Buy raw & grade / Buy PSA 9 / Buy PSA 10 / Pass / Watch — insufficient signal
Suggested buy price → first confident window avg for verdict grade
Bounce back score → 5-signal check (S4 formula clarified)
Warnings → assembled and surfaced in UI
```
