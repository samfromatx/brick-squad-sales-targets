from enum import Enum

from pydantic import BaseModel, Field


class Sport(str, Enum):
    football = "football"
    basketball = "basketball"


class Category(str, Enum):
    graded = "graded"
    raw = "raw"
    bounce_back = "bounce_back"


class RawMetrics(BaseModel):
    target_raw: float | None = None
    max_raw: float | None = None
    est_psa9: float | None = None
    est_psa10: float | None = None
    gem_rate: float | None = None
    roi: float | None = None


class BounceBackMetrics(BaseModel):
    score: int | None = None
    s1_cheap: bool = False
    s2_stable: bool = False
    s3_not_priced_in: bool = False
    s4_volume: bool = False
    s5_no_spike: bool = False


class Target(BaseModel):
    id: str
    sport: Sport
    category: Category
    rank: int
    card_name: str
    grade: str | None = None
    target_price: float | None = None
    max_price: float | None = None
    trend_pct: float | None = None
    volume_count: int | None = None
    volume_window_days: int | None = None
    sell_at: float | None = None
    rationale: str | None = None
    is_new: bool = False
    last_updated: str | None = None
    raw_metrics: RawMetrics | None = None
    bounce_back_metrics: BounceBackMetrics | None = None


class PortfolioAllocationItem(BaseModel):
    card_name: str
    budget: float
    thesis: str | None = None
    card_type: str | None = None
    cost_each: float | None = None
    qty: int | None = None
    subtotal: float | None = None


class PortfolioAllocation(BaseModel):
    tier: str
    description: str | None = None
    total: float | None = None
    allocations: list[PortfolioAllocationItem] = Field(default_factory=list)


class EbaySearch(BaseModel):
    id: str | None = None
    sport: Sport
    category: Category
    rank: int | None = None
    card_name: str | None = None
    search_text: str


class PortfolioEntry(BaseModel):
    id: str
    user_id: str
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
