# Buy Analysis Spec — Brick Squad
Last updated: 2026-03-20

This document is the authoritative reference for all buy analysis logic used in `docs/index.html` — both the **Trend Analysis** (auto-analysis on card selection) and the **Grade Decision Calculator** (manual inputs).

---

## Constants
Defined once at the top of the script as the `BA` object. Edit here to tune globally.

```js
const BA = {
  GRADING_COST:      38.00,  // $30 PSA bulk + $8 shipping
  EBAY_FEE_MULT:     0.87,   // 1 - 13% eBay fees
  MIN_PROFIT_FLOOR:  20.00,  // minimum net EV to recommend grading
  MIN_SALES:         3,      // minimum 90d sales for a confident price signal
  DOWNTREND_PENALTY: 10.00,  // added to cost basis when card is in downtrend
  PSA8_MULT:         0.50,   // PSA 8 or below estimated as 50% of raw price
  GEM_FALLBACK_FB:   38,     // football fallback gem rate % (Prizm Base ~35-45%)
  GEM_FALLBACK_BB:   55,     // basketball fallback gem rate % (Prizm Base ~50-60%)
};
```

---

## Input Data Files

### Sales data — per-window CSVs
Located in `docs/data/`. One file per time window, all cards combined.

```
docs/data/football-all-players-last-7-days.csv
docs/data/football-all-players-last-14-days.csv
docs/data/football-all-players-last-30-days.csv
docs/data/football-all-players-last-60-days.csv
docs/data/football-all-players-last-90-days.csv
docs/data/football-all-players-last-180-days.csv
docs/data/football-all-players-last-360-days.csv

docs/data/basketball-all-players-last-7-days.csv
docs/data/basketball-all-players-last-14-day.csv   <- no trailing 's' (filename quirk)
docs/data/basketball-all-players-last-30-days.csv
docs/data/basketball-all-players-last-60-days.csv
docs/data/basketball-all-players-last-90-days.csv
docs/data/basketball-all-players-last-180-days.csv
docs/data/basketball-all-players-last-360-days.csv
```

**CSV columns (row 0 = header):**
```
Card, Grade, Price Change %, Price Change $, Starting Price, Last Sale,
Avg, Min Sale, Max Sale, Volume Change %, # of Sales, Total Sales $
```

Key fields:
- `Card`  — full card name, e.g. `"Drake Maye 2024 Prizm #329 Base"`
- `Grade` — `"Raw"`, `"PSA 9"`, or `"PSA 10"`
- `Avg`   — average sale price prefixed with `$`, e.g. `"$53.58"` — parsed with `parsePrice()`
- `# of Sales` — integer count of sales in the window — parsed with `parseNum()`
- `Price Change %` — numeric string, e.g. `"-19.90"` (positive = up)

### Gem rate data — per-player CSVs
Located in `docs/data/`. One file per player, exported from CardLadder.
104 player files available as of 2026-03-20 (see `docs/data/` for full list).

**Special filename cases:**
- Victor Wembanyama → `victor-wembayama.csv` (misspelled, matches CardLadder export)
- Anthony Edwards   → `anthony-edwards.csv` (lowercase)
- Cade Cunningham   → `cade-cunningham.csv` (lowercase)
- Stephon Castle    → `stephon-castle.csv` (lowercase)

**CSV format — 2-row header:**
```
Row 0: CardLadder branding row (skip entirely)
Row 1: Column headers
Row 2+: Data rows
```

**Column headers (row 1):**
```
"", "Cat", "Year", "Set", "Name", "Parallel", "Card #",
"Gems", "Total", "Gem Rate", "All PSA", "PSA 9", "PSA 10",
"Universal Pop", "Recent Cert"
```

Key fields:
- `Card #`   — card number string, e.g. `"329"`
- `Parallel` — variant name, e.g. `"Base"`, `"Silver Prizm"`
- `Gem Rate` — PSA 10 gem rate as percent string, e.g. `"37%"` — parse: `parseInt(str.replace(/[^0-9]/g,''), 10)`
- `Gems`     — PSA 10 count formatted with commas, e.g. `"1,660"`
- `Total`    — total graded count, e.g. `"4,509"`

---

## Gem Rate Matching Algorithm (fetchGemRate)

1. Extract player name: words before first 4-digit year in card name
   - `"Drake Maye 2024 Prizm #329 Base"` → `"Drake Maye"`
2. Extract card number: regex `/#(\d+)/`
   - `"Drake Maye 2024 Prizm #329 Base"` → `"329"`
3. Build filename candidates (try in order):
   - `docs/data/{First}-{Last}.csv` e.g. `Drake-Maye.csv`
   - `docs/data/{first}-{last}.csv` e.g. `drake-maye.csv`
4. Parse gem rate CSV: skip row 0, use row 1 as column headers, rows 2+ as data
5. Match row where `Card #` equals extracted card number; use first match if multiple
6. If file not found or card# not matched — use sport fallback:
   - Football:   `GEM_FALLBACK_FB = 38%`
   - Basketball: `GEM_FALLBACK_BB = 55%`

---

## Time Windows

Defined in the `WINDOWS` object in `docs/index.html`. Index constants:

| Index | Label | Window | Constant |
|---|---|---|---|
| 0 | 7d   | Last 7 days   | — |
| 1 | 14d  | Last 14 days  | — |
| 2 | 30d  | Last 30 days  | `W_30` — trend signal |
| 3 | 60d  | Last 60 days  | — |
| 4 | 90d  | Last 90 days  | `W_90` — primary price anchor |
| 5 | 180d | Last 180 days | `W_180` — fallback anchor |
| 6 | 360d | Last 360 days | — |

---

## Analysis Logic — Trend Analysis (auto on card selection)

### Step 1 — Price anchors
Use 90d avg as primary. Fall back to 180d if 90d has fewer than `MIN_SALES` (3) sales.

```
raw_anchor   = 90d Raw Avg   (fallback: 180d Raw Avg)
psa9_anchor  = 90d PSA 9 Avg (fallback: 180d PSA 9 Avg)
psa10_anchor = 90d PSA 10 Avg (fallback: 180d PSA 10 Avg)
```

### Step 2 — Data quality
```
low_confidence = true  if raw_90d_sales  < MIN_SALES (3)
                         OR psa9_90d_sales < MIN_SALES (3)
```

### Step 3 — Trend signal
```
trend_ratio = raw_30d_avg / raw_90d_avg

> 1.10  -> trend = "uptrend"
< 0.90  -> trend = "downtrend"  (apply DOWNTREND_PENALTY to cost basis)
else    -> trend = "stable"
```
If raw data is missing across windows, fall back to PSA 9 prices for trend.

### Step 4 — Net prices (after eBay fees)
```
net_raw   = raw_anchor   * EBAY_FEE_MULT  (* 0.87)
net_psa9  = psa9_anchor  * EBAY_FEE_MULT
net_psa10 = psa10_anchor * EBAY_FEE_MULT
net_psa8  = raw_anchor   * PSA8_MULT      (* 0.50) — PSA 8 or below downside estimate
```

### Step 5 — Raw viability ratio
```
raw_ratio = raw_anchor / psa9_anchor

< 0.40    -> "Viable grade candidate"       (green)
0.40-0.60 -> "Marginal — near-perfect only" (amber)
> 0.60    -> "Skip grading — buy the slab"  (red)
```
If `raw_ratio > 0.60` -> set verdict = "Buy PSA 9" and skip EV model.

### Step 6 — EV model (when grading is viable)
```
p10   = gem_rate / 100              (from player CSV, or sport fallback)
p9    = 0.40                        (fixed — PSA 9 submission rate not in CSV)
p_low = max(0, 1 - p10 - p9)       (PSA 8 or below)

cost_basis = raw_anchor + GRADING_COST
if trend == "downtrend": cost_basis += DOWNTREND_PENALTY

EV     = (p10 * net_psa10) + (p9 * net_psa9) + (p_low * net_psa8)
net_ev = EV - cost_basis
```

- `net_ev >= MIN_PROFIT_FLOOR ($20)` -> grade_verdict = "Buy raw & grade"
- `net_ev < MIN_PROFIT_FLOOR`        -> grade_verdict = "Pass"

### Step 7 — PSA 10/9 multiplier matrix
```
multiplier = psa10_anchor / psa9_anchor
```

| Multiplier | Gem rate < 15% | Gem rate 15-35% | Gem rate > 35% |
|---|---|---|---|
| < 1.5x   | Buy PSA 9           | Buy PSA 9     | Buy raw / PSA 9       |
| 1.5-3.5x | Strong grade play   | Run EV model  | Grade for PSA 9       |
| > 3.5x   | PSA 10 scarcity real | Caution — fragile premium | Avoid PSA 10 play |

### Step 8 — Break-even grade
```
be_gross = (cost_basis + MIN_PROFIT_FLOOR) / EBAY_FEE_MULT

be_gross <= psa9_anchor  -> "Needs PSA 9"
be_gross <= psa10_anchor -> "Needs PSA 10"
else                     -> "No grade covers cost"
```

### Step 9 — Confidence rating
```
low_confidence == true           -> "Low"
trend == "downtrend"
  OR total_90d_sales < 5         -> "Medium"
else                             -> "High"
```

### Final verdict
```
raw_ratio > 0.60                            -> "Buy PSA 9"       (blue)
grade_verdict == "Buy raw & grade"          -> "Buy raw & grade" (green)
EV model not computable AND psa9_anchor     -> "Buy PSA 9"       (blue)
else                                        -> "Pass"            (gray)
```

---

## Grade Decision Calculator — Manual Inputs

Same `BA` constants as the Trend Analysis. Grading cost input defaults to `$38`.

**Inputs:** raw price, PSA 9 price, PSA 10 price, grading cost, gem rate %

**Logic applied (in order):**

1. **Raw / PSA 9 ratio** — same thresholds as Step 5 above
2. **Net EV model** — same as Step 6 above
   - Requires raw, psa9, psa10, and gem rate to run full model
   - If PSA 10 or gem rate missing: shows simplified PSA 9 / PSA 10 net profit instead
3. **PSA 10/9 multiplier matrix** — same thresholds as Step 7 above
4. **Gem rate signal** — contextual note comparing gem rate to multiplier

All net profits shown **after eBay fees** (multiplied by `EBAY_FEE_MULT`).

---

## Verdict Badge Colors (UI)
- `Buy raw & grade` -> dark green  (`#166534`)
- `Buy PSA 9`       -> dark blue   (`#1e40af`)
- `Buy PSA 10`      -> purple      (`#6b21a8`)
- `Pass`            -> dark gray   (`#374151`)
- Low confidence    -> amber warning note below verdict
