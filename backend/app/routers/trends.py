from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.core.auth import get_current_user_id
from app.core.cache import cache_get, cache_set
from app.core.logging import get_request_id
from app.models.api import TrendAnalysisResponse, TrendSearchResult
from app.services.trends import run_trend_analysis, search_trend_cards

router = APIRouter(prefix="/trends", tags=["trends"])

_SEARCH_TTL = 864000   # 10 days — card names don't change
_DETAIL_TTL = 86400    # 1 day — market data updates weekly but detail is heavier to compute


@router.get("/search", response_model=list[TrendSearchResult])
async def search_trends(
    response: Response,
    q: str = Query(""),
    sport: Literal["football", "basketball"] = Query(...),
    limit: int = Query(10, le=50),
    user_id: str = Depends(get_current_user_id),
):
    cache_key = f"bsst:trends:search:{sport}:{q.strip().lower()}:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        response.headers["Cache-Control"] = "private, max-age=30"
        response.headers["X-Request-ID"] = get_request_id()
        return [TrendSearchResult(**r) for r in cached]

    results = search_trend_cards(q, sport=sport, limit=limit)
    cache_set(cache_key, [r.model_dump() for r in results], ttl=_SEARCH_TTL)
    response.headers["Cache-Control"] = "private, max-age=30"
    response.headers["X-Request-ID"] = get_request_id()
    return results


@router.get("/detail", response_model=TrendAnalysisResponse)
async def trend_detail(
    response: Response,
    card: str = Query(...),
    sport: Literal["football", "basketball"] = Query(...),
    user_id: str = Depends(get_current_user_id),
):
    cache_key = f"bsst:trends:detail:{sport}:{card.strip().lower()}"
    cached = cache_get(cache_key)
    if cached is not None:
        response.headers["Cache-Control"] = "private, max-age=30"
        response.headers["X-Request-ID"] = get_request_id()
        return TrendAnalysisResponse(**cached)

    result = run_trend_analysis(card, sport)
    if result is None:
        raise HTTPException(status_code=404, detail="No market data found for this card")
    cache_set(cache_key, result.model_dump(mode="json"), ttl=_DETAIL_TTL)
    response.headers["Cache-Control"] = "private, max-age=30"
    response.headers["X-Request-ID"] = get_request_id()
    return result
