# Brick Squad Sports Cards — Report Generator

Generates an interactive HTML report for sports card investment analysis, with:
- **Max bid prices** using FMV-weighted trend formula
- **Gem rates** from eBay graded sales distribution
- **Expected Value (EV)** per card accounting for grading probabilities
- **Budget portfolios** ranked by EV ROI%
- **Grading math** breakdowns with PSA pricing
- **Sell timing calendar**

## Quick Start

```bash
# Install dependencies
pip install pyyaml

# Generate report with default config
python generate_report.py --csv data/top-players-last-30-days.csv

# Generate with custom config and output path
python generate_report.py --csv data.csv --config config.yaml --output my-report.html
```

Output: A standalone `.html` file you can open in any browser. No server needed.

## Monthly Update Workflow

1. **Export your 30-day sales data** from 130point.com (or similar eBay analytics tool) as CSV
2. **Drop the CSV** in the `data/` folder
3. **Run the script**: `python generate_report.py --csv data/your-new-file.csv`
4. **Open the HTML** in your browser

That's it. The script handles all calculations from the raw data.

## Updating Your Strategy

### Add/Remove Players

Edit `config.yaml` → `players:` section:

```yaml
players:
  NewPlayer:
    full_name: "Player Name"
    tier: S          # S, A, or B
    color: "#2563eb" # Hex color for UI badges
    catalysts:
      - "Why you're bullish"
```

### Add/Remove Cards

Edit `config.yaml` → `cards:` section. Each card needs:

```yaml
- csv_name: "Exact Card Name From CSV"  # Must match CSV "Card" column exactly
  player: NewPlayer                      # Must match a player key above
  tier: S                                # S, A, or B
  category: grading                      # grading | psa10buy | psa10dip | rawbuy
  rec_grading_tier: value_bulk           # value_bulk | value_plus | value_max
  sell_window: "Apr-Jun"
  psa9_value_override: 35.00            # Optional: set PSA 9 value manually
```

**Category meanings:**
- `grading` — Raw cards you'll submit to PSA. Gets gem rate analysis + EV calculation.
- `psa10buy` — Already-graded PSA 10s to buy and hold.
- `psa10dip` — PSA 10s that are dipping in price (buy the dip).
- `rawbuy` — Raw cards to hold (not worth grading).

### Adjust PSA Pricing

When PSA changes prices, update `config.yaml` → `psa_pricing:`:

```yaml
psa_pricing:
  collectors_club: 99.00
  value_bulk: 24.99
  value: 32.99
  value_plus: 49.99
  value_max: 64.99
  regular: 79.99
```

### Tune the Max Bid Formula

```yaml
max_bid_formula:
  fmv_avg_weight: 0.60      # How much weight on 30-day average (0-1)
  fmv_last_weight: 0.40     # How much weight on last sale (0-1)
  up_threshold: 0.10        # +10% = trending up
  down_threshold: -0.10     # -10% = trending down
  up_multiplier: 0.95       # Bid aggressively when trending up
  flat_multiplier: 0.85     # Standard discount when flat
  down_multiplier: 0.75     # Demand bigger discount when trending down
```

### Adjust Budget Levels

```yaml
budgets:
  - amount: 500
    title: "$500 Budget — Grading & Flip"
    strategy_focus: "value_bulk"
    include_psa10_holds: false
    max_grading_cards: 15
    include_collectors_club: true
```

### Update Sell Calendar

Edit `config.yaml` → `sell_calendar:`. Set `current: true` on whichever phase you're in.

## CSV Format

The script expects a CSV with these columns (standard 130point.com export):

| Column | Example |
|--------|---------|
| Card | Cade Cunningham 2021 Prizm #282 Base |
| Grade | Raw, PSA 10, PSA 9, PSA 8, etc. |
| Avg | $5.00 |
| Min Sale | $0.99 |
| Max Sale | $24.99 |
| Last Sale | $6.57 |
| # of Sales | 201 |
| Price Change % | 15.5 |
| Starting Price | $1.25 |
| Total Sales $ | $1,005.07 |

## How the Math Works

### Max Bid Formula
```
FMV = (30d_avg × 0.60) + (last_sale × 0.40)
trend = (last_sale - 30d_avg) / 30d_avg

if trend > +10%:  multiplier = 0.95  (UP — be aggressive)
if trend ±10%:    multiplier = 0.85  (FLAT — standard discount)
if trend < -10%:  multiplier = 0.75  (DOWN — demand discount)

max_bid = FMV × multiplier
```

### Gem Rate
Calculated from the 30-day distribution of graded eBay sales for each card. If a card has 26 PSA 10 sales, 9 PSA 9, 1 PSA 8, and 3 other graded = 39 total graded sales → 67% gem rate.

### Expected Value (EV)
```
EV = (gem_rate_10 × PSA_10_value) + (gem_rate_9 × PSA_9_value) + (gem_rate_8 × PSA_8_value) - all_in_cost
```

EV tells you the average profit per card submission accounting for probability. A card with a lower PSA 10 value but higher gem rate can have better EV than an expensive card with a low gem rate.

### Budget Portfolios
Cards are ranked by **EV ROI%** (EV ÷ all-in cost). The script allocates budget to the highest EV ROI% cards first, then adds PSA 10 holds for guaranteed playoff inventory.

## Update Workflow — When to Use What

There are two layers to this system: **data** (automated) and **strategy** (requires analysis). Different tools for each.

### Claude Code — Monthly Data Refresh (Routine)

Use Claude Code for the standard monthly cycle:

1. Export fresh 30-day CSV from 130point.com
2. Drop it in `data/`
3. Run: `python generate_report.py --csv data/your-new-file.csv`
4. Open the HTML

**Claude Code can also handle simple config edits:**
- "Add Zach Edey as a Tier B player with his Prizm Base"
- "Change Castle from Tier A to Tier B"
- "Update PSA Value Bulk to $27.99"
- "Remove Kobe from the config"

These are mechanical changes that don't require market analysis.

### Claude Chat — Strategic Refresh (Quarterly / Major Events)

Come back to the original Claude chat (or start a new one referencing it) when the **strategy** needs to change. This includes:

**Seasonal inflection points (~3-4x/year):**
- Trade deadline (Feb) — player movement reshuffles tiers
- Playoff brackets set (Apr) — update sell windows, recalibrate tiers
- Offseason (Jul) — new product releases, Panini → Topps transition, reset buy targets
- Pre-season (Oct) — full config rebuild for new season

**Reactive events (as they happen):**
- Major injury to a Tier S player (e.g., Cade ACL → drop to Tier B, adjust sell windows)
- MVP/award winner announced (update catalysts, shift sell timing)
- PSA announces pricing or turnaround changes (recalculate all grading math thresholds)
- New product release (e.g., 2025-26 Topps drops → add new cards to config)
- Breakout player (someone not in your config is suddenly relevant)
- Market-wide shift (e.g., hobby crash, Panini license ends, major auction results)

**What Claude Chat provides that Claude Code doesn't:**
- Tier assignments based on current team records, stats, and narrative
- Player catalyst analysis (MVP odds, playoff seeding, injury status)
- Sell calendar timing based on actual NBA schedule
- PSA 9 value estimates when data is thin
- Portfolio construction logic (which cards to prioritize at each budget)
- "Should I sell now or hold?" judgment calls

### What Lives Where

| Element | Lives In | Updated By | How Often |
|---------|----------|------------|-----------|
| Max bids, gem rates, EV, trends | Auto-calculated from CSV | Script | Every run |
| Player tiers (S/A/B) | config.yaml | Claude Chat | Quarterly |
| Card selections | config.yaml | Claude Chat / Claude Code | As needed |
| Sell windows | config.yaml | Claude Chat | Quarterly |
| Player catalysts | config.yaml | Claude Chat | Quarterly |
| PSA pricing | config.yaml | Claude Code | When PSA changes |
| Sell calendar | config.yaml | Claude Chat | Seasonal |
| Budget allocations | config.yaml | Claude Chat | Quarterly |
| PSA 9 value overrides | config.yaml | Claude Chat | Quarterly |
| The formulas themselves | generate_report.py | Claude Chat | Rarely |

### TL;DR

- **Monthly:** Claude Code runs the script with fresh CSV. Done in 30 seconds.
- **Quarterly:** Bring the config to Claude Chat for a strategic refresh. Takes 5-10 minutes.
- **Breaking news:** Quick Claude Chat session to adjust tiers or sell timing.

## For Claude Code

If you're using Claude Code to help maintain this:

**Common tasks:**
- "Add [player] to the config" → Edit config.yaml players + cards sections
- "Update PSA pricing" → Edit config.yaml psa_pricing section
- "Run the report with new data" → `python generate_report.py --csv data/new-file.csv`
- "Change budget levels" → Edit config.yaml budgets section
- "Switch to football cards" → New config.yaml with NFL players/cards, same CSV format

**The script doesn't need code changes for normal updates.** Everything is driven by config.yaml. Only modify generate_report.py if you want to change the formulas, add new calculations, or modify the HTML template.

## File Structure

```
brick-squad-report/
├── generate_report.py    # Main script (reads CSV + config → HTML)
├── config.yaml           # Your players, cards, budgets, PSA pricing
├── update.sh             # Monthly update convenience script
├── data/                 # Drop your CSVs here
│   └── top-players-last-30-days.csv
├── docs/
│   └── index.html        # Live report — served by GitHub Pages
├── .venv/                # Python virtualenv (gitignored)
└── README.md
```
