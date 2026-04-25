# Trend Analysis Logic

Extracted from the legacy static site (`index-archive-2026-03-11.html`). This documents the full algorithm behind the Trend Analysis tool — search for a card, get a buy verdict, EV model, and bounce-back score.

---

## Data Source

Market data is read from the `card_market_data` Supabase table, filtered by `sport` and `window_days`. Each row represents one card/grade/window combination.

**Fields used:**
`grade`, `window_days`, `avg`, `num_sales`, `price_change_pct`, `price_change_dollar`, `starting_price`, `last_sale`, `min_sale`, `max_sale`, `volume_change_pct`, `total_sales_dollar`

**Time windows:** 7d, 14d, 30d, 60d, 90d, 180d, 360d  
**Grades tracked per window:** Raw, PSA 9, PSA 10

---

## Constants

| Constant | Value | Meaning |
|---|---|---|
| `GRADING_COST` | $38.00 | $30 PSA fee + $8 shipping |
| `EBAY_FEE_MULT` | 0.87 | 1 − 13% eBay fees (net proceeds multiplier) |
| `MIN_PROFIT_FLOOR` | $20.00 | Minimum net EV above cost to recommend grading |
| `MIN_SALES` | 3 | Minimum 90d sales for a confident price signal |
| `DOWNTREND_PENALTY` | $10.00 | Added to cost basis when card is in a downtrend |
| `PSA8_MULT` | 0.50 | PSA 8 estimated as 50% of raw avg price |
| `GEM_FALLBACK_FB` | 38% | Football fallback gem rate (no file match) |
| `GEM_FALLBACK_BB` | 55% | Basketball fallback gem rate (no file match) |

---

## Step-by-Step Algorithm

### Step 1 — Price Anchors

Primary anchor: **90d avg**. Falls back to **180d avg** if 90d has fewer than `MIN_SALES` (3) sales.

```
raw_anchor   = avg(90d raw)   if raw_90d_sales >= 3, else avg(180d raw)
psa9_anchor  = avg(90d PSA9)  if psa9_90d_sales >= 3, else avg(180d PSA9)
psa10_anchor = avg(90d PSA10) else avg(180d PSA10)
```

### Step 2 — Data Quality / Confidence

```
low_confidence = (raw_90d_sales < 3) OR (psa9_90d_sales < 3)

total_90d = raw_90d_sales + psa9_90d_sales + psa10_90d_sales

confidence = "Low"    if low_confidence
           = "Medium"  if downtrend OR total_90d < 5
           = "High"    otherwise
```

### Step 3 — Trend Signal

Compares 30d avg to 90d avg. Uses raw price if available; falls back to PSA 9.

```
ratio = avg(30d raw) / avg(90d raw)

if ratio > 1.10  → "uptrend"
if ratio < 0.90  → "downtrend"
else             → "stable"
```

If no raw data, repeats the same ratio test with PSA 9 prices.

### Step 4 — Net Prices (after eBay fees)

```
net_raw   = raw_anchor   × 0.87
net_psa9  = psa9_anchor  × 0.87
net_psa10 = psa10_anchor × 0.87
net_psa8  = raw_anchor   × 0.50   (PSA 8 downside estimate)
```

### Step 5 — Raw Viability Ratio

Answers: is the raw cheap enough relative to PSA 9 to make grading worthwhile?

```
raw_ratio = raw_anchor / psa9_anchor

raw_ratio < 0.40   → "Viable grade candidate"       (green)
raw_ratio 0.40–0.60 → "Marginal — near-perfect only" (amber)
raw_ratio > 0.60   → "Skip grading — buy the slab"  (red)
raw_ratio = null   → "No raw data"                  (gray)
```

### Step 6 — Gem Rate

Looks up the card-specific PSA 10 gem rate from a CardLadder CSV file in `data/`. Filename derived from player name (e.g., `Patrick-Mahomes.csv`). Card number (`#123`) used to match the specific row.

If no file exists or no card number match: uses the sport fallback (38% football, 55% basketball).

### Step 7 — EV Model (grading expected value)

Only runs when `raw_ratio ≤ 0.60` AND all three price anchors are available.

```
p10   = gem_rate / 100           (probability of PSA 10)
p9    = 0.40                     (fixed — assumed 40% chance of PSA 9)
p_low = max(0, 1 - p10 - p9)    (remainder: PSA 8 or lower)

cost_basis = raw_anchor + $38
             + $10 (if downtrend)

EV = (p10 × net_psa10) + (p9 × net_psa9) + (p_low × net_psa8)

net_ev = EV - cost_basis

grade_verdict = "Buy raw & grade"  if net_ev >= $20
              = "Pass"             otherwise
```

### Step 8 — PSA 10/9 Multiplier Matrix

When both PSA 10 and PSA 9 prices exist:

```
multiplier = psa10_anchor / psa9_anchor
```

| Multiplier | Gem Rate < 15% | Gem Rate 15–35% | Gem Rate > 35% |
|---|---|---|---|
| < 1.5× | Buy PSA 9 | Buy PSA 9 | Buy raw / PSA 9 |
| 1.5–3.5× | Strong grade play | Run EV model | Grade for PSA 9 |
| > 3.5× | PSA 10 scarcity real | Caution — fragile premium | Avoid PSA 10 play |

### Step 9 — Break-Even Grade

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

if raw_ratio > 0.60:
    → "Buy PSA 10"  (if suggestPsa10)
    → "Buy PSA 9"   (otherwise)

else if grade_verdict == "Buy raw & grade":
    → "Buy raw & grade"

else if psa9 or psa10 price data exists:
    → "Buy PSA 10"  (if suggestPsa10)
    → "Buy PSA 9"   (otherwise)

else:
    → "Pass"
```

---

## Suggested Buy Target Price

Walk time windows shortest → longest, find first window with data for the verdict grade:

1. **Confident pass:** find first window with avg price AND `num_sales >= 3` → use that avg
2. **Thin data pass:** find first window with any avg price (flagged with ⚠ warning)
3. **Raw derivation:** if verdict is "Buy raw & grade" and no raw sales at all → `psa9_anchor × 0.40` (break-even threshold)

---

## Bounce Back Score

Evaluates whether a card that has pulled back is a buy-the-dip opportunity. Runs separately for PSA 9 and PSA 10. **Requires S1 to pass AND a total score ≥ 3 out of 5 to qualify.**

| Signal | Rule | Pass condition |
|---|---|---|
| **S1★** (required) | Cheap vs norm | 30d avg is ≥15% below 180d avg |
| S2 | Stabilizing | 14d avg ≥ 97% of 30d avg (floor forming) |
| S3 | Recovery not priced in | 7d avg still < 90% of 180d avg |
| S4 | Market still active | 30d sales ≥ 25% of monthly 360d pace |
| S5 | No spike distortion | 180d max < 3× the 180d avg |

Score: 0–5. Qualifies: S1 = true AND score ≥ 3.

---

## Signal Strip (compact output)

The top strip shows quick-glance stats after a search:

| Stat | Source |
|---|---|
| 30d avg price | 30d PSA 9 avg → fallback PSA 10 → Raw |
| 30d trend | PSA 9 `price_change_pct` (30d window) → fallback PSA 10 |
| 30d sales | Sum of PSA 9 + PSA 10 + Raw 30d sales |
| Buy target | From `investment_targets` DB table (matched by card name) |
| Sell at | From `investment_targets` DB table |
| Buy/Watch chip | "Watch" if verdict = Pass or downtrend; "Buy" otherwise |

---

## Data Flow Summary

```
card_market_data table (Supabase)
  ↓ query by sport + ilike(card, query)
  ↓ group by window_days → { raw, psa9, psa10 } per window
  ↓
Step 1: anchors (90d primary, 180d fallback)
Step 2: confidence flag
Step 3: trend signal (30d vs 90d)
Step 4: net prices after fees
Step 5: raw viability ratio
Step 6: gem rate lookup (CardLadder CSV or fallback)
Step 7: EV model (if viable)
Step 8: multiplier matrix
Step 9: break-even grade
  ↓
Final verdict → Buy raw & grade / Buy PSA 9 / Buy PSA 10 / Pass
Suggested buy price → first confident window avg for verdict grade
Bounce back score → 5-signal check for PSA 9 and PSA 10
```
