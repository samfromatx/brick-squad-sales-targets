# Trend Analysis Logic v3

Revised from `trend-analysis-logic-v2.md`. Documents the full algorithm behind the Trend Analysis tool.

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
| `EBAY_FEE_MULT` | 0.87 | 1 minus 13% eBay fees |
| `MIN_PROFIT_FLOOR` | $20.00 | Minimum net EV above cost to recommend grading |
| `MIN_SALES` | 3 | Minimum sales for a confident price signal |
| `MIN_TREND_SALES` | 2 | Minimum 30d sales required to compute trend direction |
| `MIN_VOLATILITY_SALES` | 5 | Minimum anchor sales required to compute volatility ratio |
| `DOWNTREND_PENALTY` | $10.00 | Added to cost basis on mild downtrend |
| `PSA8_MULT` | 0.50 | PSA 8 gross estimated as 50% of raw avg price |
| `GEM_FALLBACK_FB` | 38% | Football fallback gem rate (no file match) |
| `GEM_FALLBACK_BB` | 55% | Basketball fallback gem rate (no file match) |
| `STALE_DAYS` | 30 | Days since last sale before anchors are flagged stale |
| `VOLUME_ACCEL_THRESHOLD` | +20% | Volume change pct above which volume is "accelerating" |
| `VOLUME_DECAY_THRESHOLD` | -20% | Volume change pct below which volume is "declining" |
| `RAW_MIN_VIABLE` | $15.00 | Minimum raw anchor required to run the EV / grading model |

---

## Anchor Object

Each grade's price anchor is stored as a structured object, not a bare number. This ensures all downstream steps reference the correct sales count for whichever window was actually selected.

```json
{
  "grade": "PSA 9",
  "anchor_value": 145.00,
  "anchor_window": 180,
  "anchor_sales_count": 6,
  "anchor_source": "180d_avg"
}
```

If both 90d and 180d fail MIN_SALES, the anchor is null and all steps depending on it are skipped.

---

## Step-by-Step Algorithm

### Step 1 - Price Anchors

Primary anchor: 90d avg. Falls back to 180d avg if 90d has fewer than MIN_SALES (3) sales. If 180d also has fewer than 3 sales, the anchor is null.

```
For each grade (Raw, PSA 9, PSA 10):

  if 90d_sales >= 3:
      anchor = { value: avg_90d, window: 90, sales: 90d_sales, source: "90d_avg" }

  else if 180d_sales >= 3:
      anchor = { value: avg_180d, window: 180, sales: 180d_sales, source: "180d_avg" }

  else:
      anchor = null
```

If all three anchors are null: return verdict "Insufficient data" and halt.

---

### Step 2 - Recency Check

```
days_since_last_sale = today - last_sale_date
stale = (days_since_last_sale > STALE_DAYS)
```

If stale = true:
- Forces market_confidence to "Low" regardless of other signals
- Appends warning STALE_DATA

---

### Step 3 - Volatility Check

Only computed when anchor_sales_count >= MIN_VOLATILITY_SALES (5). Below that threshold volatility is reported as "Unknown - thin data" rather than a potentially misleading ratio.

```
if anchor_sales_count >= 5:
    volatility_ratio = (max_sale - min_sale) / anchor_value

    volatility_label = "Low"      if ratio < 0.35
                     = "Moderate" if 0.35 <= ratio < 0.75
                     = "High"     if 0.75 <= ratio < 1.00
                     = "Extreme"  if ratio >= 1.00
else:
    volatility_label = "Unknown - thin data"
```

High or Extreme volatility appends warning WIDE_SPREAD. Does not block a Buy verdict, but is surfaced prominently.

---

### Step 4 - Trend Signal

Requires 30d_sales >= MIN_TREND_SALES (2). If below threshold, trend = "Insufficient data" and no trend-dependent logic runs.

Trend source priority differs by expected verdict path:

**For slab buying** (raw_anchor is null or raw_anchor.value < RAW_MIN_VIABLE):
```
1. PSA 9 trend, if 30d_psa9_sales >= 2
2. PSA 10 trend, if 30d_psa10_sales >= 2
3. Raw trend, if 30d_raw_sales >= 2
4. "Insufficient data"
```

**For raw grading evaluation** (raw_anchor.value >= RAW_MIN_VIABLE):
```
1. Raw trend, if 30d_raw_sales >= 2
2. PSA 9 trend, if 30d_psa9_sales >= 2
3. PSA 10 trend, if 30d_psa10_sales >= 2
4. "Insufficient data"
```

**Trend strength scale:**
```
ratio = avg(30d source) / anchor(source)

ratio >= 1.25        -> "Strong uptrend"
1.10 <= ratio < 1.25 -> "Mild uptrend"
0.90 <= ratio < 1.10 -> "Stable"
0.75 <= ratio < 0.90 -> "Mild downtrend"
ratio < 0.75         -> "Strong downtrend"
```

**Trend effects on the model:**

| Trend | Effect |
|---|---|
| Strong uptrend | No penalty; eligible for confidence boost (Step 5) |
| Mild uptrend | No penalty; eligible for confidence boost (Step 5) |
| Stable | No effect |
| Mild downtrend | +$10 cost basis penalty in EV model |
| Strong downtrend | +$10 cost basis penalty AND suppresses "Buy raw & grade" entirely |

---

### Step 5 - Volume Signal

```
volume_signal = "Accelerating" if volume_change_pct >= +20%
              = "Declining"    if volume_change_pct <= -20%
              = "Stable"       otherwise
```

Volume signal interacts with trend to modify market_confidence:

```
if trend in { "Strong uptrend", "Mild uptrend" } AND volume = "Accelerating":
    -> confidence boost (+1 level)

if trend in { "Strong uptrend", "Mild uptrend" } AND volume = "Declining":
    -> append warning FRAGILE_PREMIUM

if trend = "Stable" AND volume = "Accelerating":
    -> confidence boost (+1 level)

if trend in { "Mild downtrend", "Strong downtrend" }:
    -> no volume adjustment
```

Volume boosts cannot override Low confidence caused by stale data or null anchors.

---

### Step 6 - Liquidity Signal

Based on total 90d sales across all grades. Measures absolute trade activity, not relative change.

```
total_90d_sales = raw_90d_sales + psa9_90d_sales + psa10_90d_sales

liquidity_label = "Very thin" if total_90d_sales <= 2
                = "Thin"      if 3 <= total_90d_sales <= 5
                = "Moderate"  if 6 <= total_90d_sales <= 12
                = "Liquid"    if total_90d_sales >= 13
```

Thin or Very thin appends a liquidity warning to output.

---

### Step 7 - Market Confidence

Summarizes overall data trustworthiness. Computed after trend, volume, and liquidity are all known.

```
market_confidence = "Low" if:
    stale = true
    OR (raw_anchor = null AND psa9_anchor = null)
    OR liquidity_label = "Very thin"
    OR (trend = "Insufficient data" AND psa9_anchor = null)

market_confidence = "Medium" if:
    trend in { "Mild downtrend", "Strong downtrend" }
    OR liquidity_label = "Thin"
    OR total_90d_sales < 5
    OR volatility_label in { "High", "Extreme" }

market_confidence = "High" otherwise
```

Then apply volume boosts from Step 5:
```
"Medium" + boost -> "High"
"High"   + boost -> "High"  (no change)
"Low"    + boost -> "Low"   (ignored)
```

Market confidence measures data quality, not opportunity quality. A High confidence card can still be a Pass. Low confidence suppresses all Buy verdicts regardless of EV.

---

### Step 8 - Net Prices (after eBay fees)

eBay fees applied consistently to all resale outcomes, including the PSA 8 downside.

```
net_raw   = raw_anchor.value   x 0.87
net_psa9  = psa9_anchor.value  x 0.87
net_psa10 = psa10_anchor.value x 0.87
net_psa8  = (raw_anchor.value  x 0.50) x 0.87   <- gross PSA 8 estimate, then fees applied
```

---

### Step 9 - Raw Viability Ratio

Answers: is the raw cheap enough relative to PSA 9 to make grading worthwhile?

Uses anchor_sales_count from each anchor object, not a hardcoded 90d check.

Only runs when:
- raw_anchor is non-null
- psa9_anchor is non-null
- raw_anchor.anchor_sales_count >= MIN_SALES
- psa9_anchor.anchor_sales_count >= MIN_SALES

Otherwise returns null with label "Insufficient slab data."

```
raw_ratio = raw_anchor.value / psa9_anchor.value

raw_ratio < 0.40     -> "Viable grade candidate"        (green)
raw_ratio 0.40-0.60  -> "Marginal - near-perfect only"  (amber)
raw_ratio > 0.60     -> "Skip grading - buy the slab"   (red)
raw_ratio = null     -> "Insufficient slab data"         (gray)
```

---

### Step 10 - Raw Minimum Viable Check

Before running the EV model, verify the raw card price is high enough for grading to be economically feasible.

```
if raw_anchor = null OR raw_anchor.value < RAW_MIN_VIABLE ($15):
    -> skip EV model entirely
    -> skip all grading recommendations
    -> append warning RAW_BELOW_THRESHOLD
    -> verdict falls through to slab path (Step 13)
```

This prevents false "Buy raw & grade" signals on low-value cards where PSA 10 outliers may inflate EV anchors but realistic grading outcomes will never clear the profit floor.

---

### Step 11 - Gem Rate

Looks up the card-specific PSA 10 gem rate from a CardLadder CSV file in data/. Filename derived from player name. Card number (#123) used to match the specific row.

If no file exists or no card number match: uses sport fallback (38% football, 55% basketball).

Always flag when fallback is used. Appends warning GEM_FALLBACK.

---

### Step 12 - EV Model

Only runs when:
- raw_anchor.value >= RAW_MIN_VIABLE ($15)
- raw_ratio <= 0.60
- All three price anchors are non-null
- Trend is not "Strong downtrend"

p9 is dynamic - derived from gem rate to preserve a realistic PSA 8 floor.

```
p10   = gem_rate / 100
p9    = min(0.40, 0.90 - p10)    // p10 + p9 never exceeds 0.90
p_low = 1 - p10 - p9             // always >= 0.10

cost_basis = raw_anchor.value + $38.00
             + $10.00 if trend = "Mild downtrend"

EV = (p10 x net_psa10) + (p9 x net_psa9) + (p_low x net_psa8)

net_ev = EV - cost_basis

grade_verdict = "Buy raw & grade"  if net_ev >= $20
              = "Pass"             otherwise
```

EV assumptions (p10, p9, p_low, cost_basis, expected_profit) are exposed in the structured output.

---

### Step 13 - PSA 10/9 Multiplier Matrix

When both PSA 10 and PSA 9 anchors exist:

```
multiplier = psa10_anchor.value / psa9_anchor.value
```

| Multiplier | Gem Rate < 15% | Gem Rate 15-35% | Gem Rate > 35% |
|---|---|---|---|
| < 1.5x | Buy PSA 9 | Buy PSA 9 | Buy raw / PSA 9 |
| 1.5-3.5x | Strong grade play | Run EV model | Grade for PSA 9 |
| > 3.5x | PSA 10 scarcity real | Caution - fragile premium | Avoid PSA 10 play |

The EV model (Step 12) takes precedence over the multiplier matrix. The matrix is a context overlay surfaced as narrative in the UI, not a second decision node.

---

### Step 14 - Break-Even Grade

```
be_gross = (cost_basis + $20) / 0.87

if be_gross <= psa9_anchor.value  -> "Needs PSA 9"
if be_gross <= psa10_anchor.value -> "Needs PSA 10"
else                              -> "No grade covers cost"
```

---

## Final Verdict

Two outputs are produced:

| Field | Purpose |
|---|---|
| `market_confidence` | How trustworthy is the market data? (Low / Medium / High) |
| `verdict` | The actionable recommendation |

```
// Low confidence - suppress all buy signals regardless of EV
if market_confidence = "Low":
    -> verdict = "Watch - insufficient signal"

// Grading path closed: raw too cheap, null, or strong downtrend
else if raw_anchor = null
     OR raw_anchor.value < RAW_MIN_VIABLE
     OR trend = "Strong downtrend":
    suggestPsa10 = (multiplier > 3.5) AND (gem_rate < 15%)
    -> verdict = "Buy PSA 10"  if suggestPsa10
    -> verdict = "Buy PSA 9"   otherwise

// EV model cleared the profit floor
else if grade_verdict = "Buy raw & grade":
    -> verdict = "Buy raw & grade"

// EV model ran but did not clear - fall to slab
else if psa9_anchor OR psa10_anchor is non-null:
    suggestPsa10 = (multiplier > 3.5) AND (gem_rate < 15%)
    -> verdict = "Buy PSA 10"  if suggestPsa10
    -> verdict = "Buy PSA 9"   otherwise

else:
    -> verdict = "Pass"
```

**Verdict definitions:**

| Verdict | Meaning |
|---|---|
| Buy raw & grade | Raw price + grading EV clears the profit floor |
| Buy PSA 9 | Better risk/reward than grading; slab is the play |
| Buy PSA 10 | PSA 10 scarcity or multiplier supports buying the gem |
| Watch - insufficient signal | Low market confidence; data too thin or stale to trust |
| Pass | Price/risk/reward does not work |

---

## Buy Target (verdict-specific)

**"Buy raw & grade"** - solve for the maximum raw price that still clears the EV model:
```
max_raw_buy_price = EV_resale_value - GRADING_COST - MIN_PROFIT_FLOOR - downtrend_penalty
```
If raw_anchor.value > max_raw_buy_price, append warning RAW_ABOVE_EV_TARGET.

**"Buy PSA 9":**
```
buy_target_psa9 = min(30d_psa9_avg, psa9_anchor.value x 0.90)
```

**"Buy PSA 10"** (stricter discount for premium compression risk):
```
buy_target_psa10 = psa10_anchor.value x 0.85
```

**Thin data fallback:** first available avg when no window has num_sales >= 3; flagged with warning THIN_BUY_TARGET.

**Raw derivation fallback:** if verdict is "Buy raw & grade" but no raw sales exist: psa9_anchor.value x 0.40; flagged with warning DERIVED_BUY_TARGET.

---

## Bounce Back Score

Evaluates whether a card that has pulled back is a buy-the-dip opportunity. Runs separately for PSA 9 and PSA 10.

Both B1 and B2 are required gates. Total score must be >= 4 out of 6 to qualify.

| Signal | Rule | Pass Condition |
|---|---|---|
| B1 (required) | Pullback vs norm | 30d avg is >= 15% below 180d avg |
| B2 (required) | Recent liquidity | 30d sales >= 2 |
| B3 | Stabilizing | 14d avg >= 97% of 30d avg (floor forming) |
| B4 | Recovery not priced in | 7d avg still < 90% of 180d avg |
| B5 | Market still active | 30d sales >= (360d_sales / 12) x 0.25; minimum 1 enforced |
| B6 | No spike distortion | 180d max < 3x the 180d avg |

Score: 0-6. Qualifies: B1 = true AND B2 = true AND score >= 4.

---

## Signal Strip (compact output)

| Stat | Source |
|---|---|
| 30d avg price | 30d PSA 9 avg -> fallback PSA 10 -> Raw |
| 30d trend | Direction + strength label |
| 30d volume | Accelerating / Stable / Declining |
| Liquidity | Very thin / Thin / Moderate / Liquid |
| 30d sales | Sum of PSA 9 + PSA 10 + Raw 30d sales |
| Buy target | Verdict-specific calculated target |
| Sell at | From investment_targets DB table |
| Gem rate source | "Card-specific" or "(!) Sport fallback" |
| Buy/Watch chip | "Watch" if verdict = Pass, Low confidence, or downtrend; "Buy" otherwise |

---

## Output Schema

```json
{
  "verdict": "Buy raw & grade",
  "market_confidence": "Medium",
  "primary_reason": "EV clears profit floor. Gem rate is sport-average - inspect carefully.",

  "buy_target": {
    "grade": "Raw",
    "price": 62,
    "basis": "EV-safe max raw price",
    "warning": null
  },

  "market_health": {
    "trend": {
      "direction": "Mild uptrend",
      "ratio": 1.13,
      "source_grade": "Raw",
      "source_window": "30d_vs_90d"
    },
    "volume": {
      "signal": "Stable",
      "change_pct": 0.04
    },
    "liquidity": {
      "label": "Moderate",
      "total_90d_sales": 9
    },
    "volatility": {
      "label": "High",
      "ratio": 0.81
    }
  },

  "ev_model": {
    "raw_anchor": 58,
    "grading_cost": 38,
    "total_cost": 96,
    "psa9_anchor": 130,
    "psa10_anchor": 290,
    "gem_rate": 0.38,
    "gem_rate_source": "sport_fallback",
    "estimated_outcomes": {
      "psa10": 0.38,
      "psa9": 0.40,
      "psa8_or_lower": 0.22
    },
    "expected_resale_after_fees": 123,
    "expected_profit": 27,
    "profit_floor": 20
  },

  "break_even_grade": "Needs PSA 9",

  "warnings": [
    {
      "code": "GEM_FALLBACK",
      "severity": "medium",
      "message": "Using sport-average gem rate. EV estimates are less reliable."
    },
    {
      "code": "WIDE_SPREAD",
      "severity": "medium",
      "message": "Wide price spread detected. Average price may not reflect true market value."
    }
  ]
}
```

---

## Warnings Reference

| Code | Trigger | Blocks verdict? |
|---|---|---|
| STALE_DATA | Last sale > 30 days ago | Forces Low confidence |
| WIDE_SPREAD | Volatility label is High or Extreme | No |
| GEM_FALLBACK | No card-specific gem rate file found | No |
| LOW_CONFIDENCE | Null anchors, stale data, very thin liquidity | Suppresses Buy verdict |
| RAW_BELOW_THRESHOLD | raw_anchor < $15 | Skips EV model; slab path only |
| STRONG_DOWNTREND | Trend ratio < 0.75 | Skips EV model; slab path only |
| DERIVED_BUY_TARGET | No raw sales; price derived from PSA 9 x 0.40 | No |
| THIN_BUY_TARGET | Buy target from window with < 3 sales | No |
| FRAGILE_PREMIUM | Uptrend + declining volume | No |
| NO_TREND_SIGNAL | 30d sales < 2 for all grades | No |
| RAW_ABOVE_EV_TARGET | Current raw anchor > max_raw_buy_price | No |

---

## Data Flow Summary

```
card_market_data (Supabase)
  | query by sport + ilike(card, query)
  | group by window_days -> { raw, psa9, psa10 } per window
  |
Step 1:  anchors -> anchor objects { value, window, sales_count, source }
         null if both 90d and 180d fail MIN_SALES; halt if all null
Step 2:  recency check -> STALE_DATA + force Low confidence if > 30 days
Step 3:  volatility check -> tiered 4-level label; requires >= 5 anchor sales
Step 4:  trend signal -> 5-level direction + strength
         source priority differs by slab vs. raw grading path
         gated on 30d_sales >= 2 per grade
Step 5:  volume signal -> Accelerating / Stable / Declining
         adjusts confidence up or appends FRAGILE_PREMIUM
Step 6:  liquidity signal -> Very thin / Thin / Moderate / Liquid
         based on total 90d sales across all grades
Step 7:  market_confidence -> Low / Medium / High
         incorporates stale, null anchors, liquidity, trend, volatility, volume boosts
Step 8:  net prices after eBay fees (PSA 8 applies fees to gross estimate)
Step 9:  raw viability ratio -> uses anchor_sales_count from anchor object
Step 10: raw minimum viable check -> skip EV if raw_anchor < $15
Step 11: gem rate lookup -> card-specific CSV or flagged sport fallback
Step 12: EV model -> dynamic p9; p10+p9 <= 0.90; p_low >= 0.10
         blocked if raw < $15 or Strong downtrend
Step 13: multiplier matrix -> context overlay; EV verdict takes precedence
Step 14: break-even grade
  |
Final verdict (suppressed at Low confidence; grading blocked below $15 raw or Strong downtrend)
  -> Buy raw & grade / Buy PSA 9 / Buy PSA 10 / Pass / Watch - insufficient signal
Verdict-specific buy target
  -> Raw: EV-safe max | PSA 9: anchor x 0.90 | PSA 10: anchor x 0.85
Bounce back score -> B1 + B2 required gates; 4/6 threshold
Structured output + warnings assembled
```
