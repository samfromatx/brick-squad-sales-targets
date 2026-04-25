from typing import Literal

from pydantic import BaseModel

from app.models.domain import (
    Category,
    EbaySearch,
    PortfolioAllocation,
    PortfolioEntry,
    Sport,
    Target,
)

# --- Request bodies ---

class PortfolioEntryCreate(BaseModel):
    card_name: str
    sport: str
    grade: str
    price_paid: float
    grading_cost: float = 0.0
    target_sell: float | None = None
    actual_sale: float | None = None
    sale_venue: str | None = None
    purchase_date: str | None = None
    notes: str | None = None
    pc: bool = False


class PortfolioEntryUpdate(BaseModel):
    card_name: str | None = None
    sport: str | None = None
    grade: str | None = None
    price_paid: float | None = None
    grading_cost: float | None = None
    target_sell: float | None = None
    actual_sale: float | None = None
    sale_venue: str | None = None
    purchase_date: str | None = None
    notes: str | None = None
    pc: bool | None = None


# --- Response envelopes ---

class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict | None = None
    request_id: str = ""


class ErrorResponse(BaseModel):
    error: ErrorDetail


class PaginatedResponse(BaseModel):
    data: list
    next_cursor: str | None = None
    has_more: bool = False


class TargetsResponse(BaseModel):
    data: list[Target]
    next_cursor: str | None = None
    has_more: bool = False


class PortfolioEntriesResponse(BaseModel):
    data: list[PortfolioEntry]
    next_cursor: str | None = None
    has_more: bool = False


class EbaySearchesResponse(BaseModel):
    data: list[EbaySearch]
    next_cursor: str | None = None
    has_more: bool = False


class PortfoliosResponse(BaseModel):
    data: list[PortfolioAllocation]


# --- Query filters ---

class TargetFilters(BaseModel):
    sport: Sport | None = None
    category: Category | None = None
    cursor: str | None = None
    limit: int = 100


# --- Trend analysis response models (T-03) ---

class AnchorObject(BaseModel):
    grade: str
    anchor_value: float
    anchor_window: int
    anchor_sales_count: int
    anchor_source: str


class TrendHealth(BaseModel):
    direction: str
    ratio: float | None = None
    source_grade: str | None = None
    source_window: str | None = None


class VolumeSignal(BaseModel):
    signal: Literal["Accelerating", "Stable", "Declining"]
    change_pct: float | None = None


class LiquiditySignal(BaseModel):
    label: Literal["Very thin", "Thin", "Moderate", "Liquid"]
    total_90d_sales: int


class VolatilitySignal(BaseModel):
    label: str
    ratio: float | None = None


class MarketHealth(BaseModel):
    trend: TrendHealth
    volume: VolumeSignal
    liquidity: LiquiditySignal
    volatility: VolatilitySignal


class EvModel(BaseModel):
    raw_anchor: float
    grading_cost: float
    total_cost: float
    psa9_anchor: float
    psa10_anchor: float
    gem_rate: float
    gem_rate_source: str
    estimated_outcomes: dict[str, float]
    expected_resale_after_fees: float
    expected_profit: float
    profit_floor: float


class BuyTarget(BaseModel):
    grade: str
    price: float
    basis: str
    warning: str | None = None


class AnalysisWarning(BaseModel):
    code: str
    severity: Literal["low", "medium", "high"]
    message: str


class BounceBackSignals(BaseModel):
    b1_cheap: bool
    b2_recent_liquidity: bool
    b3_stabilizing: bool
    b4_recovery_not_priced: bool
    b5_market_active: bool
    b6_no_spike: bool
    score: int
    qualifies: bool


class WindowRow(BaseModel):
    window_days: int
    raw_avg: float | None = None
    psa9_avg: float | None = None
    psa10_avg: float | None = None
    raw_psa9_ratio: float | None = None
    psa10_psa9_ratio: float | None = None
    is_anchor: bool = False


class TrendAnalysisResponse(BaseModel):
    verdict: str
    market_confidence: str
    primary_reason: str
    buy_target: BuyTarget | None = None
    market_health: MarketHealth
    ev_model: EvModel | None = None
    break_even_grade: str | None = None
    warnings: list[AnalysisWarning]
    bounce_back: BounceBackSignals | None = None
    window_prices: list[WindowRow] = []


class TrendSearchResult(BaseModel):
    card: str
    sport: str
