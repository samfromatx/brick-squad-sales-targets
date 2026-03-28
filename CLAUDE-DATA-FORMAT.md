# Brick Squad — Data Export Format for Claude

When Sam asks you to research cards or update targets, always output a single valid JSON block using the structure below. This JSON is pasted directly into the import tool, so the format must be exact.

---

## Top-Level Structure

```json
{
  "last_updated": "YYYY-MM-DD",
  "football_graded": [...],
  "basketball_graded": [...],
  "football_raw_to_grade": [...],
  "basketball_raw_to_grade": [...],
  "portfolios": { ... },
  "ebay_searches": { ... }
}
```

- `last_updated` — today's date in `YYYY-MM-DD` format. Required.
- All sections are optional **except** `last_updated`. Omit any section you have no data for — do not include it as an empty array.
- **Import replaces all existing data**, so always include the full current list for any section you include, not just new additions.

---

## Graded Targets — `football_graded` and `basketball_graded`

Each entry is a card you want to buy already graded (PSA 9 or PSA 10).

```json
{
  "rank": 1,
  "card": "Patrick Mahomes 2017 Prizm Base PSA 10",
  "grade": "PSA 10",
  "target": 280,
  "max": 320,
  "trend": "+12%",
  "vol": "39/7d",
  "sell_at": 400,
  "rationale": "Elite QB, Prizm base holds strong, undervalued vs Burrow comps",
  "new": false
}
```

| Field | Type | Notes |
|-------|------|-------|
| `rank` | integer | Priority order, 1 = highest |
| `card` | string | Full card name including year, set, and grade |
| `grade` | string | `"PSA 10"` or `"PSA 9"` |
| `target` | number | Target buy price in dollars (no $ sign) |
| `max` | number | Max you'd pay in dollars |
| `trend` | string | Price trend as `"+12%"`, `"-5%"`, or `"flat"` |
| `vol` | string | Sales volume as `"39/7d"` (39 sales in last 7 days) — any window: 7d, 14d, 30d, 60d, 90d |
| `sell_at` | number | Target sell price in dollars |
| `rationale` | string | 1–2 sentence buy thesis |
| `new` | boolean | `true` if newly added this update, `false` otherwise |

---

## Raw-to-Grade Targets — `football_raw_to_grade` and `basketball_raw_to_grade`

Cards you plan to buy raw and submit to PSA for grading.

```json
{
  "rank": 1,
  "card": "Josh Allen 2018 Prizm Base Raw",
  "target_raw": 55,
  "max_raw": 70,
  "trend": "+8%",
  "vol": "22/30d",
  "est_psa9": 140,
  "est_psa10": 320,
  "gem_rate": "35%",
  "roi": "62%",
  "sell_at": 280,
  "rationale": "Strong gem rate for this print run, PSA 10 has big upside",
  "new": false
}
```

| Field | Type | Notes |
|-------|------|-------|
| `rank` | integer | Priority order, 1 = highest |
| `card` | string | Full card name, include "Raw" at end |
| `target_raw` | number | Target buy price for raw copy |
| `max_raw` | number | Max you'd pay for raw copy |
| `trend` | string | Price trend as `"+8%"`, `"-3%"`, or `"flat"` |
| `vol` | string | Raw sales volume as `"22/30d"` — any window: 7d, 14d, 30d, 60d, 90d |
| `est_psa9` | number | Estimated PSA 9 value in dollars |
| `est_psa10` | number | Estimated PSA 10 value in dollars |
| `gem_rate` | string | PSA 10 gem rate as `"35%"` |
| `roi` | string | Estimated ROI as `"62%"` (based on gem rate blended return minus grading cost) |
| `sell_at` | number | Target sell price after grading |
| `rationale` | string | 1–2 sentence buy thesis |
| `new` | boolean | `true` if newly added this update, `false` otherwise |

---

## Portfolios — `portfolios`

Budget allocation recommendations across three tiers.

```json
{
  "portfolios": {
    "1000": {
      "description": "Conservative $1k portfolio focused on high-liquidity cards",
      "allocations": [
        { "card": "Patrick Mahomes 2017 Prizm Base PSA 9", "budget": 250, "thesis": "Floor card, easy to flip" },
        { "card": "Josh Allen 2018 Prizm Base Raw", "budget": 180, "thesis": "Grade play, strong gem rate" }
      ]
    },
    "1500": {
      "description": "...",
      "allocations": [...]
    },
    "2000": {
      "description": "...",
      "allocations": [...]
    }
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `"1000"`, `"1500"`, `"2000"` | keys | The three budget tiers — always use these exact key strings |
| `description` | string | 1-sentence summary of the portfolio strategy |
| `card` | string | Must match exactly a card name in the graded/raw sections |
| `budget` | number | Dollar amount allocated to this card |
| `thesis` | string | Short reason this card fits the portfolio |

---

## eBay Searches — `ebay_searches`

Saved eBay search strings for monitoring each card.

```json
{
  "ebay_searches": {
    "football_graded": [
      { "rank": 1, "card": "Patrick Mahomes 2017 Prizm Base PSA 10", "search": "mahomes 2017 prizm base psa 10" }
    ],
    "football_raw": [
      { "rank": 1, "card": "Josh Allen 2018 Prizm Base Raw", "search": "josh allen 2018 prizm base raw" }
    ],
    "basketball_graded": [...],
    "basketball_raw": [...]
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `rank` | integer | Should match the rank from the corresponding targets section |
| `card` | string | Should match exactly the card name in the targets section |
| `search` | string | Optimized eBay search string — lowercase, no quotes, keywords only |

---

## Field Format Rules

- **All dollar amounts** — plain numbers, no `$`, no commas. `280` not `"$280"` or `"280.00"`
- **Trends** — always include the `+` or `-` sign and `%`. Use `"flat"` for no movement. Examples: `"+12%"`, `"-5%"`, `"flat"`
- **Volumes** — format as `"N/Nd"` where N is the window. Examples: `"39/7d"`, `"22/30d"`, `"8/90d"`
- **Gem rates** — always a string with `%`. Example: `"35%"`
- **ROI** — always a string with `%`. Example: `"62%"`
- **Ranks** — start at 1, no gaps, sequential within each section
- **`new` flag** — use `true` only for cards added in this specific update. Everything else is `false`
- **Dates** — `YYYY-MM-DD` only. Example: `"2026-03-27"`

---

## Full Minimal Example

```json
{
  "last_updated": "2026-03-27",
  "football_graded": [
    {
      "rank": 1,
      "card": "Patrick Mahomes 2017 Prizm Base PSA 10",
      "grade": "PSA 10",
      "target": 280,
      "max": 320,
      "trend": "+12%",
      "vol": "39/7d",
      "sell_at": 400,
      "rationale": "Elite QB, Prizm base holds strong, undervalued vs Burrow comps",
      "new": false
    }
  ],
  "football_raw_to_grade": [
    {
      "rank": 1,
      "card": "Josh Allen 2018 Prizm Base Raw",
      "target_raw": 55,
      "max_raw": 70,
      "trend": "+8%",
      "vol": "22/30d",
      "est_psa9": 140,
      "est_psa10": 320,
      "gem_rate": "35%",
      "roi": "62%",
      "sell_at": 280,
      "rationale": "Strong gem rate for this print run, PSA 10 has big upside",
      "new": false
    }
  ]
}
```

---

## Common Mistakes to Avoid

- Do NOT wrap numbers in quotes (`280` not `"280"`)
- Do NOT use `$` in dollar fields
- Do NOT use `%` in number-only fields — trend, gem_rate, and roi are strings with `%`; dollar fields are plain numbers
- Do NOT include a section with an empty array — omit the key entirely if there's no data
- Do NOT output partial lists — if including a section, include ALL entries for that section, not just new ones
- Do NOT use `football_graded_targets` or `football_raw_targets` as key names — use `football_graded` and `football_raw_to_grade`
