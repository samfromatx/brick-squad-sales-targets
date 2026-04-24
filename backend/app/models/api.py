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
