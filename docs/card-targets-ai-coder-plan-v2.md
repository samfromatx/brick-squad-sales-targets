# Card Targets v1 — AI Coder Implementation Plan

## Purpose

Build a new feature called **Card Targets** that recommends the top card buying opportunities for each supported sport using live `card_market_data` plus a lightweight player metadata enrichment layer.

This is **v1**. Do not build paid API integrations, scraping, news ingestion, social trend analysis, or advanced prediction systems yet.

The goal is to create a practical, conservative discovery tool:

> Find the best risk-adjusted card targets in the current market data, recommend the best format to buy, calculate a target buy price, show 7d / 14d / 30d pricing, and explain why the card is or is not worth targeting.

---

## Scope

### Supported sports

- Football
- Basketball

### Use cases

- Real buying
- General market discovery

### Supported recommendation formats

The system should recommend whichever format is best:

- Raw
- PSA 9
- PSA 10

### Price range

Only include Buy Targets where the **target buy price** is between:

```text
$10 and $200
```

Apply this filter to the recommended buy target, not every possible grade.

### Ranking style

Balanced. The score should account for:

- Market health
- Buyable value
- Timing / entry setup
- Player quality
- Risk

---

## Non-goals for v1

Do **not** build these yet:

- Paid sports APIs
- Automated news scraping
- Social media trend tracking
- Injury API ingestion
- Sports schedule ingestion
- Card population report ingestion
- Fully automated player ratings
- ML prediction model
- Real-time websocket updates
- Browser-side scoring for all cards

---

## Existing data source

The existing table is `public.card_market_data`.

```sql
create table public.card_market_data (
  id bigserial not null,
  card text not null,
  grade text not null,
  sport text not null,
  window_days integer not null,
  price_change_pct real null default 0,
  price_change_dollar real null default 0,
  starting_price real null default 0,
  last_sale real null default 0,
  last_sale_date text null default ''::text,
  avg real null default 0,
  min_sale real null default 0,
  max_sale real null default 0,
  volume_change_pct real null default 0,
  num_sales integer null default 0,
  total_sales_dollar real null default 0,
  player_name text null default ''::text,
  updated_at timestamp with time zone null default now(),
  constraint card_market_data_pkey primary key (id),
  constraint card_market_data_card_grade_sport_window_days_key unique (card, grade, sport, window_days)
);
```

Available windows: `7d, 14d, 30d, 60d, 90d, 180d, 360d`

Expected grades: `Raw, PSA 9, PSA 10`

---

## Existing Trend Analysis dependency

Card Targets should reuse or call the existing **Trend Analysis v3** logic wherever possible. The Trend Analysis logic already includes:

- 90d / 180d price anchors
- stale data detection
- volatility classification
- trend signal, volume signal, liquidity signal
- market confidence
- net resale prices after eBay fees
- raw viability ratio and minimum viable threshold
- gem rate fallback
- EV model
- PSA 10 / PSA 9 multiplier matrix
- break-even grade
- final verdict
- short-term price anchor and buy target calculation
- bounce-back score
- warnings

Do not duplicate this logic. Create a shared service if needed.

Recommended service boundary:

```text
analyze_card_market(card, sport) -> TrendAnalysisResult
```

---

## Implementation language boundary

All scoring, calculation, and persistence logic runs on the **FastAPI backend in Python**. The frontend never executes scoring — it reads pre-calculated results from the `card_targets` table via the API.

| Layer | File |
|---|---|
| Backend scoring | `backend/app/services/card_targets.py` |
| Backend DB queries | `backend/app/db/queries/card_targets.py` |
| Backend API models | `backend/app/models/api.py` (extend existing file) |
| Backend router | `backend/app/routers/card_targets.py` |
| Frontend types (API shape) | `frontend/src/lib/types.ts` (extend existing file) |
| Frontend API client | `frontend/src/lib/api.ts` (extend existing file) |
| Frontend page | `frontend/src/pages/CardTargetsPage.tsx` |

All SQL query placeholders use `%s` style (psycopg3 convention), consistent with the existing `backend/app/db/queries/*.py` files.

---

## High-level architecture

### Data flow

```text
card_market_data
  -> POST /api/v1/card-targets/recalculate (admin only)
      -> sync player_metadata
      -> run Card Targets calculation (Python, per sport)
      -> delete old card_targets rows for sport
      -> insert new rows in transaction
  -> GET /api/v1/card-targets (authenticated)
      -> UI reads and displays results
```

---

# Step 1 — Add `player_metadata` table

`player_metadata` is shared system data with no `user_id` column. `player_key` is the normalized, deduplicated identifier used for joining. `player_name` is kept as the human-readable display name.

```sql
create table if not exists public.player_metadata (
  id bigserial primary key,

  player_name text not null,
  player_key  text not null,
  sport       text not null,

  team       text null,
  position   text null,
  rookie_year integer null,
  active     boolean null default true,

  hobby_tier              integer not null default 0 check (hobby_tier between 0 and 10),
  upside_score            integer not null default 0 check (upside_score between 0 and 5),
  current_relevance_score integer not null default 0 check (current_relevance_score between 0 and 5),
  manual_catalyst_score   integer not null default 0 check (manual_catalyst_score between 0 and 5),
  risk_score              integer not null default 0 check (risk_score between 0 and 5),

  manual_catalyst text null default '',
  notes           text null default '',

  needs_review boolean not null default true,

  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint player_metadata_unique unique (sport, player_key)
);
```

Add indexes:

```sql
create index if not exists idx_player_metadata_sport_key
on public.player_metadata (sport, player_key);

create index if not exists idx_player_metadata_needs_review
on public.player_metadata (needs_review, sport);

create index if not exists idx_player_metadata_scores
on public.player_metadata (
  sport,
  hobby_tier desc,
  upside_score desc,
  current_relevance_score desc
);
```

Enable RLS and grant read access to authenticated users only. All writes go through the FastAPI backend using the service role key, which bypasses RLS and must never be exposed to the browser.

```sql
ALTER TABLE public.player_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_metadata_read_authenticated"
  ON public.player_metadata
  FOR SELECT
  TO authenticated
  USING (true);
```

---

# Step 2 — Add `player_key` normalization helper

`player_key` is a normalized, lowercased, punctuation-stripped version of the player name. It is the canonical identifier used for deduplication and joins, preventing variants like `C.J. Stroud`, `CJ Stroud`, and `C J Stroud` from becoming separate database rows.

Implement in `backend/app/services/card_targets.py`:

```python
import re

def normalize_player_key(value: str | None) -> str:
    if not value:
        return ""
    s = value.lower()
    s = re.sub(r'\.', '', s)
    s = re.sub(r"'", '', s)
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()
```

Examples:

```text
C.J. Stroud -> cj stroud
CJ Stroud   -> cj stroud
C J Stroud  -> cj stroud
```

---

# Step 3 — Sync player metadata after market import

Player metadata sync runs as part of every recalculation (see Step 23). It is not tied to the existing JSON import route, which handles target data, not market data.

## SQL implementation

```sql
insert into public.player_metadata (
  player_name,
  player_key,
  sport,
  first_seen_at,
  last_seen_at,
  updated_at
)
select distinct
  nullif(trim(player_name), '') as player_name,
  normalize_player_key(nullif(trim(player_name), '')) as player_key,
  sport,
  now(),
  now(),
  now()
from public.card_market_data
where nullif(trim(player_name), '') is not null
  and sport in ('football', 'basketball')
on conflict (sport, player_key)
do update set
  last_seen_at = now(),
  updated_at   = now();
```

Note: `normalize_player_key` runs in Python before the query executes. Pass the normalized value as a parameter rather than calling it inside SQL.

## Required behavior

- New players are inserted with all scores at zero.
- New players have `needs_review = true`.
- Existing players keep their manual scores unchanged.
- Existing players only update `last_seen_at` and `updated_at`.

## Implementation

Add to `backend/app/services/card_targets.py`:

```python
async def sync_player_metadata_for_sports(
    sports: list[str],
    db_cursor,
) -> None:
    # 1. Query distinct (player_name, sport) from card_market_data
    # 2. For each row, compute player_key = normalize_player_key(player_name)
    # 3. Upsert into player_metadata — ON CONFLICT (sport, player_key)
    #    only updates last_seen_at and updated_at, never scoring fields
    ...
```

---

# Step 3.5 — Define `TrendAnalysisResult` contract

Before implementing scoring, inspect `backend/app/services/trends.py` and confirm the actual output shape. Reconcile any field name differences against the contract below.

If a field is missing, skip the corresponding sub-score and add a `# TODO: expose from trend analysis` comment. Do not block v1 on missing subfields.

```python
from dataclasses import dataclass, field
from typing import Literal

@dataclass
class LiquidityResult:
    label: Literal["Liquid", "Moderate", "Thin", "Very thin"]
    total_90d_sales: int = 0

@dataclass
class TrendResult:
    direction: Literal[
        "Strong uptrend", "Mild uptrend", "Stable",
        "Mild downtrend", "Strong downtrend"
    ]

@dataclass
class VolumeResult:
    signal: Literal["Accelerating", "Stable", "Declining"]

@dataclass
class VolatilityResult:
    label: Literal["Low", "Moderate", "High", "Extreme"]

@dataclass
class MarketHealth:
    liquidity: LiquidityResult
    trend: TrendResult
    volume: VolumeResult
    volatility: VolatilityResult

@dataclass
class BuyTarget:
    price: float | None

@dataclass
class EvModel:
    expected_profit: float | None

@dataclass
class RawViability:
    label: str  # "Viable grade candidate" | "Marginal - near-perfect only" | "Buy the slab"

@dataclass
class MultiplierContext:
    label: str

@dataclass
class BounceBack:
    qualifies: bool
    score: int = 0

@dataclass
class TrendWarning:
    code: str
    message: str = ""

@dataclass
class TrendAnalysisResult:
    verdict: Literal[
        "Buy raw & grade", "Buy PSA 9", "Buy PSA 10",
        "Pass", "Watch - insufficient signal"
    ]
    market_confidence: Literal["Low", "Medium", "High"]
    market_health: MarketHealth
    buy_target: BuyTarget | None = None
    ev_model: EvModel | None = None
    raw_viability: RawViability | None = None
    multiplier_context: MultiplierContext | None = None
    bounce_back: BounceBack | None = None
    warnings: list[TrendWarning] = field(default_factory=list)
```

Known warning codes used in scoring:

```text
STALE_DATA
LOW_CONFIDENCE
STRONG_DOWNTREND
FRAGILE_PREMIUM
GEM_FALLBACK
SHORT_TERM_DIVERGENCE
```

---

# Step 4 — Add `card_targets` cache table

`card_targets` is shared system data with no `user_id` column. It stores the result of the most recent calculation run.

`recommendation_strength` and `strategy_type` are stored as separate fields. See Step 17 for the distinction.

```sql
create table if not exists public.card_targets (
  id bigserial primary key,

  sport        text not null,
  card         text not null,
  player_name  text not null default '',
  player_key   text not null default '',

  recommended_grade       text not null,
  recommendation_strength text not null,
  strategy_type           text null,
  recommendation          text not null,

  rank         integer      not null default 0,
  target_score numeric(5,2) not null default 0,
  market_score numeric(5,2) not null default 0,
  value_score  numeric(5,2) not null default 0,
  timing_score numeric(5,2) not null default 0,
  player_score numeric(5,2) not null default 0,
  risk_penalty numeric(5,2) not null default 0,

  market_confidence text not null default 'Low',

  target_buy_price numeric(10,2) null,
  current_price    numeric(10,2) null,

  avg_7d   numeric(10,2) null,
  avg_14d  numeric(10,2) null,
  avg_30d  numeric(10,2) null,
  avg_90d  numeric(10,2) null,
  avg_180d numeric(10,2) null,

  raw_avg_30d   numeric(10,2) null,
  psa9_avg_30d  numeric(10,2) null,
  psa10_avg_30d numeric(10,2) null,

  liquidity_label  text    null,
  total_90d_sales  integer null default 0,
  trend_label      text    null,
  volume_signal    text    null,
  volatility_label text    null,

  justification jsonb not null default '[]'::jsonb,
  warnings      jsonb not null default '[]'::jsonb,
  full_analysis jsonb not null default '{}'::jsonb,

  calculated_at timestamptz not null default now(),

  constraint card_targets_unique_calc unique (sport, card, recommended_grade)
);
```

Add indexes:

```sql
create index if not exists idx_card_targets_sport_score
on public.card_targets (sport, target_score desc);

create index if not exists idx_card_targets_sport_strength
on public.card_targets (sport, recommendation_strength, target_score desc);

create index if not exists idx_card_targets_player
on public.card_targets (player_key, sport);

create index if not exists idx_card_targets_price
on public.card_targets (sport, target_buy_price);

create index if not exists idx_card_targets_calculated_at
on public.card_targets (calculated_at desc);
```

Enable RLS and grant read access to authenticated users only:

```sql
ALTER TABLE public.card_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_targets_read_authenticated"
  ON public.card_targets
  FOR SELECT
  TO authenticated
  USING (true);
```

The unique constraint on `(sport, card, recommended_grade)` is compatible with the delete-then-insert strategy used in Step 21. After the DELETE there are no rows to conflict with. The constraint acts as a safety net against duplicate inserts within a single run.

---

# Step 5 — Create frontend TypeScript types

Add these types to `frontend/src/lib/types.ts` alongside existing types. Do not create a separate file. These define the API response shape only — no scoring logic.

```ts
export type SupportedTargetSport = "football" | "basketball";

export type CardGrade = "Raw" | "PSA 9" | "PSA 10";

export type MarketConfidence = "Low" | "Medium" | "High";

// How strong the buy signal is
export type RecommendationStrength =
  | "Strong Buy Target"
  | "Buy Target"
  | "Value Target"
  | "Watchlist Target"
  | "Avoid / Overheated";

// Why — the strategic setup behind the recommendation
export type StrategyType =
  | "Grade Target"
  | "Slab Target"
  | "Momentum Target"
  | "Bounce-back Target"
  | null;

export interface CardTargetWarning {
  code: string;
  message: string;
}

export interface PlayerMetadata {
  id: number;
  player_name: string;
  player_key: string;
  sport: SupportedTargetSport;
  team?: string | null;
  position?: string | null;
  rookie_year?: number | null;
  active?: boolean | null;
  hobby_tier: number;
  upside_score: number;
  current_relevance_score: number;
  manual_catalyst_score: number;
  risk_score: number;
  manual_catalyst?: string | null;
  notes?: string | null;
  needs_review: boolean;
  last_seen_at: string;
}

export interface CardTargetScores {
  market_score: number;
  value_score: number;
  timing_score: number;
  player_score: number;
  risk_penalty: number;
  target_score: number;
}

export interface CardTargetResult {
  sport: SupportedTargetSport;
  card: string;
  player_name: string;
  player_key: string;
  recommended_grade: CardGrade;
  recommendation_strength: RecommendationStrength;
  strategy_type: StrategyType;
  recommendation: string;
  rank: number;

  target_buy_price: number | null;
  current_price: number | null;

  avg_7d: number | null;
  avg_14d: number | null;
  avg_30d: number | null;
  avg_90d: number | null;
  avg_180d: number | null;

  raw_avg_30d: number | null;
  psa9_avg_30d: number | null;
  psa10_avg_30d: number | null;

  market_confidence: MarketConfidence;
  liquidity_label: string | null;
  total_90d_sales: number | null;
  trend_label: string | null;
  volume_signal: string | null;
  volatility_label: string | null;

  scores: CardTargetScores;
  justification: string[];
  warnings: CardTargetWarning[];
  full_analysis: Record<string, unknown>;
}
```

---

# Step 6 — Add backend Pydantic models

Add to `backend/app/models/api.py` alongside existing models. These are the source of truth for the API contract. Frontend types in Step 5 must mirror these.

```python
from typing import Any, Literal
from pydantic import BaseModel


class CardTargetsRecalculateRequest(BaseModel):
    sports: list[Literal["football", "basketball"]]


class CardTargetScoresResponse(BaseModel):
    market_score: float
    value_score: float
    timing_score: float
    player_score: float
    risk_penalty: float
    target_score: float


class CardTargetWarningResponse(BaseModel):
    code: str
    message: str


class CardTargetResponse(BaseModel):
    sport: Literal["football", "basketball"]
    card: str
    player_name: str
    player_key: str
    recommended_grade: Literal["Raw", "PSA 9", "PSA 10"]
    recommendation_strength: str
    strategy_type: str | None = None
    recommendation: str
    rank: int

    target_buy_price: float | None = None
    current_price: float | None = None

    avg_7d: float | None = None
    avg_14d: float | None = None
    avg_30d: float | None = None
    avg_90d: float | None = None
    avg_180d: float | None = None

    raw_avg_30d: float | None = None
    psa9_avg_30d: float | None = None
    psa10_avg_30d: float | None = None

    market_confidence: Literal["Low", "Medium", "High"]
    liquidity_label: str | None = None
    total_90d_sales: int | None = None
    trend_label: str | None = None
    volume_signal: str | None = None
    volatility_label: str | None = None

    scores: CardTargetScoresResponse
    justification: list[str]
    warnings: list[CardTargetWarningResponse]
    full_analysis: dict[str, Any]


class PlayerMetadataResponse(BaseModel):
    id: int
    player_name: str
    player_key: str
    sport: str
    team: str | None = None
    position: str | None = None
    rookie_year: int | None = None
    active: bool | None = None
    hobby_tier: int
    upside_score: int
    current_relevance_score: int
    manual_catalyst_score: int
    risk_score: int
    manual_catalyst: str | None = None
    notes: str | None = None
    needs_review: bool
    last_seen_at: str


class PlayerMetadataUpdateRequest(BaseModel):
    team: str | None = None
    position: str | None = None
    rookie_year: int | None = None
    active: bool | None = None
    hobby_tier: int | None = None
    upside_score: int | None = None
    current_relevance_score: int | None = None
    manual_catalyst_score: int | None = None
    risk_score: int | None = None
    manual_catalyst: str | None = None
    notes: str | None = None
    needs_review: bool | None = None
```

---

# Step 7 — Add constants

Add to `backend/app/services/card_targets.py`:

```python
SUPPORTED_SPORTS = ["football", "basketball"]

TARGET_MIN_PRICE = 10.0
TARGET_MAX_PRICE = 200.0

SCORE_THRESHOLD_STRONG_BUY = 80
SCORE_THRESHOLD_BUY        = 70
SCORE_THRESHOLD_WATCH      = 60
SCORE_THRESHOLD_AVOID      = 50

MARKET_SCORE_MAX  = 30
VALUE_SCORE_MAX   = 35
TIMING_SCORE_MAX  = 15
PLAYER_SCORE_MAX  = 20
RISK_PENALTY_MAX  = 30
```

Mirror display-relevant constants in the frontend as needed (e.g. score thresholds for color-coding rows).

---

# Step 8 — Build market candidate query

Add to `backend/app/db/queries/card_targets.py`.

This query returns one row per card with pivoted prices, sales counts, and last-sale values per grade and window. Use it only for bulk candidate loading — the full Trend Analysis service queries card-level rows separately as needed.

The `last_sale` for each grade is the value tied to the newest `last_sale_date` for that grade, not `max(last_sale)`.

```sql
select
  sport,
  card,
  max(player_name) as player_name,

  -- Raw averages
  max(avg) filter (where grade = 'Raw' and window_days = 7)   as raw_avg_7d,
  max(avg) filter (where grade = 'Raw' and window_days = 14)  as raw_avg_14d,
  max(avg) filter (where grade = 'Raw' and window_days = 30)  as raw_avg_30d,
  max(avg) filter (where grade = 'Raw' and window_days = 90)  as raw_avg_90d,
  max(avg) filter (where grade = 'Raw' and window_days = 180) as raw_avg_180d,

  -- Raw sales counts
  max(num_sales) filter (where grade = 'Raw' and window_days = 7)  as raw_sales_7d,
  max(num_sales) filter (where grade = 'Raw' and window_days = 14) as raw_sales_14d,
  max(num_sales) filter (where grade = 'Raw' and window_days = 30) as raw_sales_30d,

  -- Raw last sale (from newest last_sale_date for this grade)
  (
    select last_sale from public.card_market_data sub
    where sub.card = cmd.card and sub.sport = cmd.sport and sub.grade = 'Raw'
    order by sub.last_sale_date desc nulls last limit 1
  ) as raw_last_sale,

  -- PSA 9 averages
  max(avg) filter (where grade = 'PSA 9' and window_days = 7)   as psa9_avg_7d,
  max(avg) filter (where grade = 'PSA 9' and window_days = 14)  as psa9_avg_14d,
  max(avg) filter (where grade = 'PSA 9' and window_days = 30)  as psa9_avg_30d,
  max(avg) filter (where grade = 'PSA 9' and window_days = 90)  as psa9_avg_90d,
  max(avg) filter (where grade = 'PSA 9' and window_days = 180) as psa9_avg_180d,

  -- PSA 9 sales counts
  max(num_sales) filter (where grade = 'PSA 9' and window_days = 7)  as psa9_sales_7d,
  max(num_sales) filter (where grade = 'PSA 9' and window_days = 14) as psa9_sales_14d,
  max(num_sales) filter (where grade = 'PSA 9' and window_days = 30) as psa9_sales_30d,

  -- PSA 9 last sale
  (
    select last_sale from public.card_market_data sub
    where sub.card = cmd.card and sub.sport = cmd.sport and sub.grade = 'PSA 9'
    order by sub.last_sale_date desc nulls last limit 1
  ) as psa9_last_sale,

  -- PSA 10 averages
  max(avg) filter (where grade = 'PSA 10' and window_days = 7)   as psa10_avg_7d,
  max(avg) filter (where grade = 'PSA 10' and window_days = 14)  as psa10_avg_14d,
  max(avg) filter (where grade = 'PSA 10' and window_days = 30)  as psa10_avg_30d,
  max(avg) filter (where grade = 'PSA 10' and window_days = 90)  as psa10_avg_90d,
  max(avg) filter (where grade = 'PSA 10' and window_days = 180) as psa10_avg_180d,

  -- PSA 10 sales counts
  max(num_sales) filter (where grade = 'PSA 10' and window_days = 7)  as psa10_sales_7d,
  max(num_sales) filter (where grade = 'PSA 10' and window_days = 14) as psa10_sales_14d,
  max(num_sales) filter (where grade = 'PSA 10' and window_days = 30) as psa10_sales_30d,

  -- PSA 10 last sale
  (
    select last_sale from public.card_market_data sub
    where sub.card = cmd.card and sub.sport = cmd.sport and sub.grade = 'PSA 10'
    order by sub.last_sale_date desc nulls last limit 1
  ) as psa10_last_sale,

  -- Totals
  coalesce(sum(num_sales) filter (where window_days = 90), 0) as total_90d_sales,
  coalesce(sum(num_sales) filter (where window_days = 30), 0) as total_30d_sales

from public.card_market_data cmd
where sport = %s
group by sport, card;
```

---

# Step 9 — Choose the recommended grade

Implement in `backend/app/services/card_targets.py`.

Map the Trend Analysis verdict directly to a recommended grade:

```python
def recommended_grade_from_verdict(verdict: str) -> str | None:
    mapping = {
        "Buy raw & grade": "Raw",
        "Buy PSA 9": "PSA 9",
        "Buy PSA 10": "PSA 10",
    }
    return mapping.get(verdict)
```

If the verdict is `Pass` or `Watch - insufficient signal`, do not force a buy recommendation.

For Watchlist candidates where no buy verdict was returned, use this fallback:

```text
1. PSA 9 if avg_30d is available and within price range
2. Raw if avg_30d is available and within price range
3. PSA 10 if avg_30d is available and within price range
4. None
```

PSA 9 is the safest default. PSA 10 is last because premium compression risk is higher.

---

# Step 10 — Current price selection

With the candidate query now returning grade-specific sales counts and last-sale values (Step 8), select the current price for the recommended grade using this hierarchy:

```text
1. 7d avg  if grade_sales_7d  >= 2
2. 14d avg if grade_sales_14d >= 2
3. 30d avg if grade_sales_30d >= 2
4. grade_last_sale if present
5. None
```

If the existing Trend Analysis short-term anchor already implements this, reuse it.

Store the selected value as `current_price`. Also store `avg_7d`, `avg_14d`, `avg_30d`, `avg_90d`, and `avg_180d` for the recommended grade.

---

# Step 11 — Price range filter

```python
def is_within_target_price_range(target_buy_price: float | None) -> bool:
    if target_buy_price is None:
        return False
    return TARGET_MIN_PRICE <= target_buy_price <= TARGET_MAX_PRICE
```

Hard rule: a card cannot be a Buy Target unless `target_buy_price` is between $10 and $200. Cards outside the range can still appear in Watchlist or Avoid.

---

# Step 12 — Market score

Max score: 30.

```python
def has_warning(analysis: TrendAnalysisResult, code: str) -> bool:
    return any(w.code == code for w in (analysis.warnings or []))


def calculate_market_score(analysis: TrendAnalysisResult) -> float:
    score = 0.0

    if analysis.market_confidence == "High":
        score += 8
    elif analysis.market_confidence == "Medium":
        score += 4

    liquidity = analysis.market_health.liquidity.label if analysis.market_health else None
    if liquidity == "Liquid":     score += 6
    elif liquidity == "Moderate": score += 4
    elif liquidity == "Thin":     score += 1

    trend = analysis.market_health.trend.direction if analysis.market_health else None
    if trend == "Strong uptrend":   score += 5
    elif trend == "Mild uptrend":   score += 4
    elif trend == "Stable":         score += 3
    elif trend == "Mild downtrend": score += 1

    volume = analysis.market_health.volume.signal if analysis.market_health else None
    if volume == "Accelerating": score += 4
    elif volume == "Stable":     score += 2

    volatility = analysis.market_health.volatility.label if analysis.market_health else None
    if volatility in ("Low", "Moderate"): score += 4
    elif volatility == "High":            score += 1

    if not has_warning(analysis, "STALE_DATA"):
        score += 3

    return min(score, MARKET_SCORE_MAX)
```

---

# Step 13 — Value score

Max score: 35.

```python
def calculate_value_score(
    analysis: TrendAnalysisResult,
    current_price: float | None,
    target_buy_price: float | None,
) -> float:
    score = 0.0

    if current_price is not None and target_buy_price is not None:
        if current_price <= target_buy_price:
            score += 10
        elif current_price <= target_buy_price * 1.05:
            score += 5

    anchor = get_recommended_grade_anchor(analysis)
    if anchor is not None and target_buy_price is not None:
        discount = 1 - target_buy_price / anchor
        if discount >= 0.10:   score += 6
        elif discount >= 0.05: score += 3

    if analysis.verdict == "Buy raw & grade":
        expected_profit = analysis.ev_model.expected_profit if analysis.ev_model else None
        if expected_profit is not None and expected_profit >= 20:
            score += 7

    raw_label = analysis.raw_viability.label if analysis.raw_viability else None
    if raw_label == "Viable grade candidate":           score += 5
    elif raw_label == "Marginal - near-perfect only":  score += 2

    multiplier_label = analysis.multiplier_context.label if analysis.multiplier_context else ""
    if "Buy PSA 9" in multiplier_label:          score += 4
    if "PSA 10 scarcity real" in multiplier_label: score += 4

    if analysis.bounce_back and analysis.bounce_back.qualifies:
        score += 3

    return min(score, VALUE_SCORE_MAX)
```

If `raw_viability`, `multiplier_context`, or `bounce_back` are not yet exposed by the existing Trend Analysis service, skip those sub-scores and add a `# TODO: expose from trend analysis` comment.

---

# Step 14 — Timing score

Max score: 15.

```python
def calculate_timing_score(
    analysis: TrendAnalysisResult,
    price_series: dict,
) -> float:
    score = 0.0

    avg_7d   = price_series.get("avg_7d")
    avg_14d  = price_series.get("avg_14d")
    avg_30d  = price_series.get("avg_30d")
    avg_180d = price_series.get("avg_180d")

    if avg_7d is not None and avg_14d is not None and avg_30d is not None:
        if avg_7d > avg_30d and avg_14d > avg_30d:
            score += 4

        stabilizing = avg_14d >= avg_30d * 0.97 and avg_30d < avg_180d
        if stabilizing:
            score += 4

        if avg_180d is not None and avg_30d < avg_180d * 0.90 and stabilizing:
            score += 4

    volume = analysis.market_health.volume.signal if analysis.market_health else None
    trend  = analysis.market_health.trend.direction if analysis.market_health else None
    if volume == "Accelerating" and trend in ("Strong uptrend", "Mild uptrend", "Stable"):
        score += 2

    if not has_warning(analysis, "SHORT_TERM_DIVERGENCE"):
        score += 1

    return min(score, TIMING_SCORE_MAX)
```

---

# Step 15 — Player score

Max score: 20.

```python
def clamp(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, value))


def calculate_player_score(player: dict | None) -> float:
    if not player:
        return 0.0

    hobby    = clamp(player.get("hobby_tier", 0), 0, 10) * 0.8
    upside   = clamp(player.get("upside_score", 0), 0, 5) * 1.2
    current  = clamp(player.get("current_relevance_score", 0), 0, 5) * 1.0
    catalyst = clamp(player.get("manual_catalyst_score", 0), 0, 5) * 1.0
    risk     = clamp(player.get("risk_score", 0), 0, 5) * 1.2

    score = hobby + upside + current + catalyst - risk

    if player.get("sport") == "football":
        position = (player.get("position") or "").upper()
        if position == "QB":            score += 3
        elif position in ("WR", "RB"): score += 1.5
        elif position == "TE":         score += 0.5

    return clamp(score, 0, PLAYER_SCORE_MAX)
```

If a player has not been reviewed, all manual fields default to `0` and player score will be low. This is intentional — unreviewed players rank lower than reviewed ones.

---

# Step 16 — Risk penalty

Max penalty: 30.

```python
def calculate_risk_penalty(
    analysis: TrendAnalysisResult,
    player: dict | None,
) -> float:
    penalty = 0.0

    if analysis.market_confidence == "Low":      penalty += 30
    if has_warning(analysis, "STALE_DATA"):      penalty += 20
    if has_warning(analysis, "LOW_CONFIDENCE"):  penalty += 20
    if has_warning(analysis, "STRONG_DOWNTREND"):penalty += 15
    if has_warning(analysis, "FRAGILE_PREMIUM"): penalty += 8
    if has_warning(analysis, "GEM_FALLBACK"):    penalty += 4

    liquidity = analysis.market_health.liquidity.label if analysis.market_health else None
    if liquidity == "Very thin": penalty += 20
    elif liquidity == "Thin":    penalty += 5

    volatility = analysis.market_health.volatility.label if analysis.market_health else None
    if volatility == "Extreme": penalty += 12
    elif volatility == "High":  penalty += 6

    if player:
        penalty += clamp(player.get("risk_score", 0), 0, 5) * 3

    return min(penalty, RISK_PENALTY_MAX)
```

---

# Step 17 — Final target score

```python
from dataclasses import dataclass

@dataclass
class CardTargetScores:
    market_score: float
    value_score: float
    timing_score: float
    player_score: float
    risk_penalty: float
    target_score: float


def calculate_card_target_score(
    analysis: TrendAnalysisResult,
    player: dict | None,
    current_price: float | None,
    target_buy_price: float | None,
    price_series: dict,
) -> CardTargetScores:
    market_score = calculate_market_score(analysis)
    value_score  = calculate_value_score(analysis, current_price, target_buy_price)
    timing_score = calculate_timing_score(analysis, price_series)
    player_score = calculate_player_score(player)
    risk_penalty = calculate_risk_penalty(analysis, player)

    target_score = clamp(
        market_score + value_score + timing_score + player_score - risk_penalty,
        0,
        100,
    )

    return CardTargetScores(
        market_score=market_score,
        value_score=value_score,
        timing_score=timing_score,
        player_score=player_score,
        risk_penalty=risk_penalty,
        target_score=target_score,
    )
```

---

# Step 18 — Classification

`recommendation_strength` measures how strong the buy signal is. `strategy_type` describes the setup behind it. These are separate concepts and must be stored as separate fields — combining them into one field causes high-scoring cards to never display as "Strong Buy Target" because strategy checks run first.

## Blocking rules

A card is blocked from any Buy strength if any of the following are true:

```text
1. market_confidence == "Low"
2. STALE_DATA warning present
3. liquidity == "Very thin"
4. STRONG_DOWNTREND warning present (unless bounce_back.qualifies is True)
5. current_price > target_buy_price
6. target_buy_price outside $10–$200
```

## `classify_recommendation_strength`

```python
def classify_recommendation_strength(
    analysis: TrendAnalysisResult,
    scores: CardTargetScores,
    current_price: float | None,
    target_buy_price: float | None,
) -> str:
    price_is_buyable = (
        current_price is not None
        and target_buy_price is not None
        and current_price <= target_buy_price
    )
    target_in_range   = is_within_target_price_range(target_buy_price)
    low_confidence    = analysis.market_confidence == "Low"
    stale             = has_warning(analysis, "STALE_DATA")
    very_thin         = (
        analysis.market_health.liquidity.label == "Very thin"
        if analysis.market_health else False
    )
    strong_downtrend  = has_warning(analysis, "STRONG_DOWNTREND")
    bounce_qualifies  = bool(analysis.bounce_back and analysis.bounce_back.qualifies)

    blocked_from_buy = (
        low_confidence
        or stale
        or very_thin
        or (strong_downtrend and not bounce_qualifies)
        or not price_is_buyable
        or not target_in_range
    )

    if not blocked_from_buy:
        if scores.target_score >= SCORE_THRESHOLD_STRONG_BUY:
            return "Strong Buy Target"
        if scores.target_score >= SCORE_THRESHOLD_BUY:
            return "Buy Target"
        if scores.target_score >= 65:
            return "Value Target"

    if scores.target_score >= SCORE_THRESHOLD_WATCH:
        return "Watchlist Target"

    return "Avoid / Overheated"
```

## `classify_strategy_type`

```python
def classify_strategy_type(
    analysis: TrendAnalysisResult,
    recommendation_strength: str,
) -> str | None:
    # Strategy only applies to actionable recommendations
    if recommendation_strength in ("Avoid / Overheated",):
        return None

    if analysis.bounce_back and analysis.bounce_back.qualifies:
        return "Bounce-back Target"

    if analysis.verdict == "Buy raw & grade":
        return "Grade Target"

    if analysis.verdict in ("Buy PSA 9", "Buy PSA 10"):
        return "Slab Target"

    trend  = analysis.market_health.trend.direction if analysis.market_health else None
    volume = analysis.market_health.volume.signal if analysis.market_health else None
    if trend in ("Strong uptrend", "Mild uptrend") and volume == "Accelerating":
        return "Momentum Target"

    return None
```

---

# Step 19 — Generate justification text

```python
def build_justification(
    analysis: TrendAnalysisResult,
    player: dict | None,
    recommended_grade: str | None,
    current_price: float | None,
    target_buy_price: float | None,
    scores: CardTargetScores,
) -> list[str]:
    bullets: list[str] = []

    if recommended_grade:
        bullets.append(
            f"{recommended_grade} is the best risk-adjusted format based on the current market data."
        )

    if current_price is not None and target_buy_price is not None:
        if current_price <= target_buy_price:
            bullets.append("Current price is at or below the calculated buy target.")
        else:
            bullets.append("Current price is above the calculated buy target; do not chase.")

    liquidity = analysis.market_health.liquidity.label if analysis.market_health else None
    if liquidity in ("Liquid", "Moderate"):
        bullets.append(
            f"Liquidity is {liquidity.lower()}, so the signal is more reliable than thin-market cards."
        )

    trend = analysis.market_health.trend.direction if analysis.market_health else None
    if trend:
        bullets.append(f"Market trend is {trend.lower()}.")

    if analysis.verdict == "Buy raw & grade":
        bullets.append("Raw grading EV clears the profit floor.")

    if analysis.bounce_back and analysis.bounce_back.qualifies:
        bullets.append("Bounce-back setup qualifies based on pullback, liquidity, and stabilization.")

    if player and player.get("manual_catalyst"):
        bullets.append(player["manual_catalyst"])

    return bullets[:5]
```

---

# Step 20 — Generate user-facing warnings

Warnings are stored and returned as structured objects with `code` and `message` fields, making them easier to filter and style in the UI.

Card Targets warning codes:

```text
PRICE_ABOVE_TARGET
TARGET_OUTSIDE_RANGE
PLAYER_NEEDS_REVIEW
LOW_PLAYER_SCORE
```

```python
def build_card_target_warnings(
    analysis: TrendAnalysisResult,
    player: dict | None,
    current_price: float | None,
    target_buy_price: float | None,
    scores: CardTargetScores,
) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    seen_codes: set[str] = set()

    def add(code: str, message: str) -> None:
        if code not in seen_codes:
            warnings.append({"code": code, "message": message})
            seen_codes.add(code)

    # Pass through Trend Analysis warnings
    for w in (analysis.warnings or []):
        add(w.code, w.message or w.code)

    if (
        current_price is not None
        and target_buy_price is not None
        and current_price > target_buy_price
    ):
        add("PRICE_ABOVE_TARGET", "Current price is above the buy target. Do not chase.")

    if target_buy_price is None or not (TARGET_MIN_PRICE <= target_buy_price <= TARGET_MAX_PRICE):
        add("TARGET_OUTSIDE_RANGE", "Target buy price is outside the $10–$200 range.")

    if player and player.get("needs_review"):
        add("PLAYER_NEEDS_REVIEW", "Player metadata has not been reviewed yet.")

    if scores.player_score < 5:
        add("LOW_PLAYER_SCORE", "Player score is low or player metadata is incomplete.")

    return warnings
```

---

# Step 21 — Main calculation process

`full_analysis` is trimmed before persisting to avoid bloated JSONB rows. Store only the fields shown in the row detail view — verdict, confidence, market_health, ev_model, and bounce_back. Target under ~2KB per row.

```python
async def calculate_card_targets_for_sport(
    sport: str,
    db_cursor,
) -> list[dict]:
    candidates = await load_card_candidates(sport, db_cursor)
    players    = await load_player_metadata_map(sport, db_cursor)  # keyed by player_key
    results    = []

    for candidate in candidates:
        analysis = await analyze_card_market(card=candidate["card"], sport=sport)

        recommended_grade = recommended_grade_from_verdict(analysis.verdict)
        if not recommended_grade:
            recommended_grade = choose_watchlist_grade(candidate)
        if not recommended_grade:
            continue

        target_buy_price = analysis.buy_target.price if analysis.buy_target else None
        price_series     = get_price_series_for_grade(candidate, recommended_grade)
        current_price    = select_current_price(price_series, candidate, recommended_grade)

        player_key = normalize_player_key(candidate.get("player_name"))
        player     = players.get(player_key)

        scores = calculate_card_target_score(
            analysis=analysis,
            player=player,
            current_price=current_price,
            target_buy_price=target_buy_price,
            price_series=price_series,
        )

        strength      = classify_recommendation_strength(analysis, scores, current_price, target_buy_price)
        strategy_type = classify_strategy_type(analysis, strength)
        justification = build_justification(analysis, player, recommended_grade, current_price, target_buy_price, scores)
        warnings      = build_card_target_warnings(analysis, player, current_price, target_buy_price, scores)

        results.append({
            "sport":        sport,
            "card":         candidate["card"],
            "player_name":  candidate.get("player_name", ""),
            "player_key":   player_key,
            "recommended_grade":       recommended_grade,
            "recommendation_strength": strength,
            "strategy_type":           strategy_type,
            "recommendation": build_recommendation_text(strength, strategy_type, recommended_grade, target_buy_price),
            "target_buy_price": target_buy_price,
            "current_price":    current_price,
            "avg_7d":   price_series.get("avg_7d"),
            "avg_14d":  price_series.get("avg_14d"),
            "avg_30d":  price_series.get("avg_30d"),
            "avg_90d":  price_series.get("avg_90d"),
            "avg_180d": price_series.get("avg_180d"),
            "raw_avg_30d":   candidate.get("raw_avg_30d"),
            "psa9_avg_30d":  candidate.get("psa9_avg_30d"),
            "psa10_avg_30d": candidate.get("psa10_avg_30d"),
            "market_confidence": analysis.market_confidence,
            "liquidity_label":   analysis.market_health.liquidity.label if analysis.market_health else None,
            "total_90d_sales":   analysis.market_health.liquidity.total_90d_sales if analysis.market_health else None,
            "trend_label":       analysis.market_health.trend.direction if analysis.market_health else None,
            "volume_signal":     analysis.market_health.volume.signal if analysis.market_health else None,
            "volatility_label":  analysis.market_health.volatility.label if analysis.market_health else None,
            "scores":        scores,
            "justification": justification,
            "warnings":      warnings,
            "full_analysis": trim_full_analysis(analysis),
        })

    results.sort(key=lambda r: r["scores"].target_score, reverse=True)

    # Assign rank within sport
    for i, result in enumerate(results, start=1):
        result["rank"] = i

    return results
```

---

# Step 22 — Persist calculated targets

Use a delete-then-insert strategy wrapped in a transaction. If the insert fails, the delete rolls back.

```python
async def persist_card_targets(sport: str, results: list[dict], db_cursor) -> None:
    async with db_cursor.begin():
        await db_cursor.execute(
            "DELETE FROM public.card_targets WHERE sport = %s",
            (sport,)
        )
        # Bulk insert all result rows
        # ... build INSERT with all fields from each result dict
```

Do not build historical snapshots in v1. If needed in v2, create a separate `card_target_snapshots` table.

---

# Step 23 — Admin access

Recalculation and player metadata edits are restricted to admin users. Reading Card Targets is open to all authenticated users.

Add an environment variable to the backend:

```text
ADMIN_EMAILS=you@example.com
```

Add an admin dependency to `backend/app/core/auth.py`:

```python
async def require_admin(current_user = Depends(get_current_user)) -> User:
    admin_emails = settings.ADMIN_EMAILS  # comma-separated string from env
    allowed = {e.strip().lower() for e in admin_emails.split(",")}
    if current_user.email.lower() not in allowed:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
```

Route protection summary:

```text
GET  /api/v1/card-targets               → authenticated user
POST /api/v1/card-targets/recalculate   → admin only
GET  /api/v1/player-metadata            → admin only
PATCH /api/v1/player-metadata/{id}      → admin only
```

---

# Step 24 — API routes

Add `backend/app/routers/card_targets.py` and register it in `backend/app/main.py` with prefix `/api/v1`.

## Recalculate

```http
POST /api/v1/card-targets/recalculate
Authorization: Bearer <jwt>  (admin only)
```

Recalculation is self-contained. The endpoint handles the full sequence:

```text
1. Validate admin access.
2. Validate requested sports.
3. sync_player_metadata_for_sports(sports).
4. calculate_card_targets_for_sport(sport) for each sport.
5. persist_card_targets(sport, results) — delete-then-insert in transaction.
6. Return counts by sport.
```

Body:

```json
{
  "sports": ["football", "basketball"]
}
```

Response:

```json
{
  "success": true,
  "results": [
    { "sport": "football",   "count": 184, "calculated_at": "2026-05-01T12:00:00Z" },
    { "sport": "basketball", "count": 211, "calculated_at": "2026-05-01T12:00:00Z" }
  ]
}
```

## List targets

```http
GET /api/v1/card-targets?sport=football&view=buy&min_price=10&max_price=200&q=stroud&limit=20&offset=0
Authorization: Bearer <jwt>
```

Supported `view` values:

```text
buy         → Strong Buy Target, Buy Target, Value Target, Grade Target, Slab Target, Momentum Target, Bounce-back Target
watchlist   → Watchlist Target
overheated  → Avoid / Overheated
all         → no filter
```

Note: the `view` param filters by `recommendation_strength`, not `strategy_type`. A card with `recommendation_strength = "Buy Target"` and `strategy_type = "Grade Target"` appears in the `buy` view.

## Player metadata — list

```http
GET /api/v1/player-metadata?sport=football&needs_review=true&limit=50&offset=0
Authorization: Bearer <jwt>  (admin only)
```

Default sort: `last_seen_at desc`.

## Player metadata — update

```http
PATCH /api/v1/player-metadata/{id}
Authorization: Bearer <jwt>  (admin only)
```

Body: any subset of editable fields from `PlayerMetadataUpdateRequest` (Step 6). After saving, the caller should trigger a recalculation to reflect the updated scores.

---

# Step 25 — Frontend API client

Add to `frontend/src/lib/api.ts` alongside existing methods:

```ts
getCardTargets(params: {
  sport: SupportedTargetSport;
  view?: "buy" | "watchlist" | "overheated" | "all";
  min_price?: number;
  max_price?: number;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<CardTargetResult[]>

recalculateCardTargets(sports: SupportedTargetSport[]): Promise<RecalculateResponse>

getPlayerMetadata(params: {
  sport?: SupportedTargetSport;
  needs_review?: boolean;
  limit?: number;
  offset?: number;
}): Promise<PlayerMetadata[]>

updatePlayerMetadata(id: number, payload: Partial<PlayerMetadataUpdatePayload>): Promise<PlayerMetadata>
```

---

# Step 26 — UI structure

Create `frontend/src/pages/CardTargetsPage.tsx` and add a route in `frontend/src/app/router.tsx`.

## Filters

- Sport: Football / Basketball
- View: Buy Targets / Watchlist / Overheated
- Min price / max price (default $10 / $200)
- Search by player or card name

## Main table columns

| Column | Description |
|---|---|
| Rank | Ranking within current filtered view |
| Card | Full card name |
| Player | Player name |
| Buy | Recommended grade |
| Target | Target buy price |
| Current | Current selected price |
| 7d | Recommended grade 7d avg |
| 14d | Recommended grade 14d avg |
| 30d | Recommended grade 30d avg |
| Score | Target score |
| Strength | `recommendation_strength` |
| Strategy | `strategy_type` (can be empty) |
| Why | First justification bullet |

## Row behavior

Clicking a row opens a detail panel showing:

- Full score breakdown
- Trend Analysis result
- Raw / PSA 9 / PSA 10 30d prices
- 7d / 14d / 30d / 90d / 180d chart or table
- Justification bullets
- Warnings (styled by code)
- Player metadata
- Manual catalyst

## Admin controls

Show the "Recalculate Card Targets" button only when the authenticated user is an admin. Non-admin users see the table but no recalculate option.

---

# Step 27 — Recommended display copy

## Buy target text

```text
Buy PSA 9 under $72
Buy Raw under $41
Buy PSA 10 under $185
```

## Combined strength + strategy label

```text
Strong Buy Target · Slab Target
Buy Target · Grade Target
Watchlist Target · Bounce-back Setup
Avoid / Overheated
```

## Watchlist text

```text
Watch — target is $62 but current price is $71
```

## Overheated text

```text
Avoid — price is above target and volume is declining
```

---

# Step 28 — Admin player review UI

Create a player metadata review page. Card Targets results are not meaningful until player metadata has been reviewed — see Phase 12 note in Step 30.

Minimum editable fields:

- team, position, rookie_year, active
- hobby_tier, upside_score, current_relevance_score
- manual_catalyst_score, risk_score
- manual_catalyst, notes, needs_review

Default view: players with `needs_review = true`, sorted by `last_seen_at desc`.

New players enter with all scores at zero. The default view surfaces the newest unreviewed players first so they can be scored promptly after each market import.

---

# Step 29 — Edge cases

## Missing player name

```text
- Still analyze market data.
- Player score = 0.
- Add LOW_PLAYER_SCORE warning.
- Do not block Watchlist.
- Lower ranking naturally through score.
```

## Missing 7d / 14d prices

```text
- Fall through the current-price hierarchy to 30d avg or last_sale.
- Add warning only if no usable price found.
```

## Low confidence

```text
- Cannot be a Buy strength (blocked by classify_recommendation_strength).
- Can be Watchlist Target if score >= 60.
```

## Stale data

```text
- Cannot be a Buy strength.
- Penalized by risk_penalty and market_score.
```

## Strong downtrend

```text
- Cannot be a Buy strength unless bounce_back.qualifies is True.
- Can be Watchlist Target or Avoid / Overheated.
```

## Price above target

```text
- Cannot be a Buy strength.
- PRICE_ABOVE_TARGET warning generated.
- Classify as Watchlist Target if score is otherwise strong.
```

## Target price missing or out of range

```text
- Cannot be a Buy strength.
- TARGET_OUTSIDE_RANGE warning generated.
- Can be Watchlist Target or Avoid.
```

---

# Step 30 — Testing checklist

Build unit tests before UI work. The scoring layer has enough logic that bugs found post-UI are painful.

## Functions to test

```text
normalize_player_key
recommended_grade_from_verdict
choose_watchlist_grade
select_current_price
is_within_target_price_range
calculate_market_score
calculate_value_score
calculate_timing_score
calculate_player_score
calculate_risk_penalty
calculate_card_target_score
classify_recommendation_strength
classify_strategy_type
build_justification
build_card_target_warnings
```

## Key test cases

### Strong buy

```text
Input:  High confidence, Liquid, Stable/mild uptrend, current <= target, target in $10-$200, reviewed high-tier player
Expected: recommendation_strength = "Strong Buy Target"
```

### Watchlist because price too high

```text
Input:  High score, current price > target
Expected: recommendation_strength = "Watchlist Target"
```

### Blocked by low confidence

```text
Input:  Low confidence, strong player, good price
Expected: recommendation_strength = "Watchlist Target" or "Avoid / Overheated", never a Buy strength
```

### Avoid due to stale/thin data

```text
Input:  Stale data, Very thin liquidity
Expected: recommendation_strength = "Avoid / Overheated"
```

### Grade target with strong buy signal

```text
Input:  verdict = "Buy raw & grade", score >= 80, current <= target, confidence not Low
Expected: recommendation_strength = "Strong Buy Target", strategy_type = "Grade Target"
```

### Strong downtrend blocks buy unless bounce-back qualifies

```text
Input:  STRONG_DOWNTREND warning, bounce_back.qualifies = False
Expected: recommendation_strength != Buy/Value/Strong Buy

Input:  STRONG_DOWNTREND warning, bounce_back.qualifies = True
Expected: Not automatically blocked (score determines strength)
```

---

# Step 31 — Acceptance criteria

Card Targets v1 is complete when:

1. `player_metadata` table exists with `player_key`, correct unique constraint on `(sport, player_key)`, indexes, and authenticated-read RLS policy.
2. `card_targets` table exists with `rank`, `recommendation_strength`, `strategy_type`, indexes, and authenticated-read RLS policy.
3. New players are auto-created from `card_market_data` during recalculation with `needs_review = true`.
4. `POST /api/v1/card-targets/recalculate` is admin-only and self-contained (sync + calculate + persist).
5. `GET /api/v1/card-targets` supports `sport`, `view`, `min_price`, `max_price`, `q`, `limit`, and `offset` params.
6. `GET /api/v1/player-metadata` and `PATCH /api/v1/player-metadata/{id}` are admin-only.
7. Each Card Target has: sport, card, player name, player key, recommended grade, recommendation strength, strategy type, rank, target score, score breakdown, target buy price, current price, 7d/14d/30d avgs, market confidence, justification, and structured warnings.
8. Buy strengths only include cards with target buy price between $10 and $200.
9. Low-confidence cards do not appear as a Buy strength.
10. Strong-downtrend cards do not appear as a Buy strength unless bounce-back qualifies.
11. Cards above target price do not appear as a Buy strength.
12. UI shows top 20 Buy Targets per sport with strength and strategy columns.
13. UI has Watchlist and Overheated views.
14. Row detail shows score breakdown, Trend Analysis result, justification, and warnings.
15. Admin can edit player metadata scores and trigger recalculation.
16. Non-admin users see Card Targets but not admin controls.

---

# Step 32 — Recommended implementation order

## Phase 1 — Confirm Trend Analysis contract

Before writing any Card Targets logic, inspect `backend/app/services/trends.py` and confirm the actual output shape matches the `TrendAnalysisResult` contract in Step 3.5. Note which fields exist and which need a TODO. Do not block v1 on missing fields.

## Phase 2 — Database migrations

Create:

- `player_metadata` with `player_key`, `(sport, player_key)` unique constraint, indexes, authenticated-read RLS policy.
- `card_targets` with `rank`, `recommendation_strength`, `strategy_type`, indexes, authenticated-read RLS policy.

## Phase 3 — Backend models

Add Pydantic models to `backend/app/models/api.py` (Step 6). These are the source of truth. Mirror in `frontend/src/lib/types.ts` (Step 5).

## Phase 4 — Player metadata sync

Implement `sync_player_metadata_for_sports`. Verify new players appear with `needs_review = true` and correct `player_key`.

## Phase 5 — Candidate loading query

Build the pivot query (Step 8) with all grade-specific averages, sales counts, and last-sale values. Verify the correlated subqueries for `last_sale` return the value tied to the newest `last_sale_date`.

## Phase 6 — Scoring helpers

Build pure Python helpers with no side effects:

```text
normalize_player_key
recommended_grade_from_verdict
choose_watchlist_grade
get_price_series_for_grade
select_current_price
is_within_target_price_range
calculate_market_score
calculate_value_score
calculate_timing_score
calculate_player_score
calculate_risk_penalty
calculate_card_target_score
classify_recommendation_strength
classify_strategy_type
build_justification
build_card_target_warnings
trim_full_analysis
```

Add unit tests for all of these before moving to Phase 7.

## Phase 7 — Calculation service

Implement `calculate_card_targets_for_sport`. Verify sorting and rank assignment.

## Phase 8 — Persistence

Implement `persist_card_targets` with the transaction-wrapped delete-then-insert. Verify that a failed insert rolls back the delete.

## Phase 9 — API routes

Add routes (Step 24). Add admin dependency (Step 23). Register routers in `main.py`. Add frontend API client methods (Step 25).

## Phase 10 — Frontend API client

Add methods to `frontend/src/lib/api.ts`. Verify the response shapes match the TypeScript types.

## Phase 11 — Card Targets UI

Build `CardTargetsPage.tsx` with sport filter, view tabs, price and search filters, target table with strength/strategy columns, and row detail panel. Admin recalculate button is visible only to admin users.

## Phase 12 — Player review UI

Build the player metadata review page (Step 28). Card Targets results are not production-quality until at least one round of player reviews has been completed. New players enter with zero scores — unreviewed players will have suppressed rankings even if their market data is strong. Complete this phase and seed initial reviews before treating Card Targets as a reliable source of recommendations.

---

# Future v2 ideas

Do not build these in v1, but keep the structure flexible.

## Automated player context

Possible future sources: player rankings CSV, fantasy football rankings CSV, NBA stat leaders CSV, playoff/team relevance table, injury status CSV, schedule/catalyst CSV. Avoid scraping unless the data source is reliable and the data is not critical to core scoring.

## Historical target snapshots

Create a `card_target_snapshots` table to track whether previous target recommendations performed well.

## Portfolio simulation

Track target price, actual purchase price, sale price, holding period, ROI, and hit rate. This would make Card Targets measurable instead of subjective.

## Calculation run tracking

Add a `calculation_run_id uuid` to `card_targets` to tie rows to a specific run. Useful for diagnosing partial runs and building snapshot history.

---

# Final v1 principle

Card Targets should be conservative.

It should prefer:

```text
Good player + good market + good price + enough data
```

over:

```text
Hot card + recent spike + thin data
```

The most important rule:

```text
Do not recommend buying cards above the calculated target price.
```
