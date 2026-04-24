from fastapi import APIRouter, Query, Request, Response

from app.core.cache import make_etag
from app.core.config import settings
from app.core.logging import get_request_id
from app.db.queries.ebay import fetch_ebay_searches
from app.models.domain import EbaySearch, Category, Sport

router = APIRouter(prefix="/ebay-searches", tags=["ebay"])

LIMIT = 100


def _row_to_ebay(row: dict) -> EbaySearch:
    return EbaySearch(
        id=str(row["id"]) if row.get("id") else None,
        sport=Sport(row["sport"]),
        category=Category(row["category"]),
        rank=row.get("rank"),
        card_name=row.get("card_name"),
        search_text=row["search_text"],
    )


@router.get("")
async def list_ebay_searches(
    request: Request,
    response: Response,
    cursor: str | None = Query(None),
):
    rows = fetch_ebay_searches(settings.owner_user_id, cursor_id=cursor, limit=LIMIT)
    has_more = len(rows) > LIMIT
    page = rows[:LIMIT]
    searches = [_row_to_ebay(r) for r in page]
    next_cursor = str(page[-1]["id"]) if has_more and page else None

    data = [s.model_dump(mode="json") for s in searches]
    etag = make_etag(data)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "X-Request-ID": get_request_id()})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, must-revalidate"
    response.headers["X-Request-ID"] = get_request_id()
    return {"data": data, "next_cursor": next_cursor, "has_more": has_more}
