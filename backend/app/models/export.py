from datetime import datetime

from pydantic import BaseModel, Field

from app.models.domain import EbaySearch, PortfolioAllocation, PortfolioEntry, Target


class ExportUser(BaseModel):
    id: str
    email: str | None = None


class ExportData(BaseModel):
    targets: list[Target] = Field(default_factory=list)
    portfolio_allocations: list[PortfolioAllocation] = Field(default_factory=list)
    ebay_searches: list[EbaySearch] = Field(default_factory=list)
    portfolio_entries: list[PortfolioEntry] = Field(default_factory=list)


class ExportSnapshot(BaseModel):
    schema_version: str = "v1"
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    last_updated: str | None = None
    user: ExportUser
    data: ExportData
