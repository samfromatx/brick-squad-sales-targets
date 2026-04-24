from fastapi import APIRouter, Query, Response

from app.core.logging import get_request_id
from app.services.trends import get_trend_detail, search_trend_cards

router = APIRouter(prefix="/trends", tags=["trends"])


@router.get("/search")
async def search_trends(
    response: Response,
    q: str = Query(""),
    limit: int = Query(20, le=50),
):
    results = search_trend_cards(q, limit=limit)
    response.headers["Cache-Control"] = "public, max-age=30"
    response.headers["X-Request-ID"] = get_request_id()
    return {"data": results}


@router.get("/detail")
async def trend_detail(
    response: Response,
    card: str = Query(...),
    sport: str | None = Query(None),
):
    detail = get_trend_detail(card, sport=sport)
    response.headers["Cache-Control"] = "public, max-age=30"
    response.headers["X-Request-ID"] = get_request_id()
    return detail
