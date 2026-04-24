from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.core.auth import get_current_user_id
from app.core.logging import get_request_id
from app.models.api import PortfolioEntryCreate, PortfolioEntryUpdate
from app.services.portfolio import (
    create_portfolio_entry,
    get_portfolio_entries,
    get_portfolio_entry,
    remove_entry,
    update_entry,
)

router = APIRouter(prefix="/portfolio-entries", tags=["portfolio-entries"])


@router.get("")
async def list_entries(
    response: Response,
    cursor: str | None = Query(None),
    limit: int = Query(100, le=200),
    user_id: str = Depends(get_current_user_id),
):
    entries, has_more = get_portfolio_entries(user_id, cursor_id=cursor, limit=limit)
    next_cursor = str(entries[-1].id) if has_more and entries else None
    response.headers["X-Request-ID"] = get_request_id()
    return {
        "data": [e.model_dump(mode="json") for e in entries],
        "next_cursor": next_cursor,
        "has_more": has_more,
    }


@router.post("", status_code=201)
async def create_entry(
    body: PortfolioEntryCreate,
    response: Response,
    user_id: str = Depends(get_current_user_id),
):
    entry = create_portfolio_entry(user_id, body.model_dump())
    response.headers["X-Request-ID"] = get_request_id()
    return entry.model_dump(mode="json")


@router.patch("/{entry_id}")
async def update_entry_route(
    entry_id: str,
    body: PortfolioEntryUpdate,
    response: Response,
    user_id: str = Depends(get_current_user_id),
):
    existing = get_portfolio_entry(user_id, entry_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Portfolio entry not found")
    if existing.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updated = update_entry(user_id, entry_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Portfolio entry not found")
    response.headers["X-Request-ID"] = get_request_id()
    return updated.model_dump(mode="json")


@router.delete("/{entry_id}", status_code=204)
async def delete_entry_route(
    entry_id: str,
    user_id: str = Depends(get_current_user_id),
):
    existing = get_portfolio_entry(user_id, entry_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Portfolio entry not found")
    if existing.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    remove_entry(user_id, entry_id)
