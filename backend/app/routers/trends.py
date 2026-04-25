from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.core.auth import get_current_user_id
from app.core.logging import get_request_id
from app.models.api import TrendAnalysisResponse, TrendSearchResult
from app.services.trends import run_trend_analysis, search_trend_cards

router = APIRouter(prefix="/trends", tags=["trends"])


@router.get("/search", response_model=list[TrendSearchResult])
async def search_trends(
    response: Response,
    q: str = Query(""),
    sport: Literal["football", "basketball"] = Query(...),
    limit: int = Query(10, le=50),
    user_id: str = Depends(get_current_user_id),
):
    results = search_trend_cards(q, sport=sport, limit=limit)
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
    result = run_trend_analysis(card, sport)
    if result is None:
        raise HTTPException(status_code=404, detail="No market data found for this card")
    response.headers["Cache-Control"] = "private, max-age=30"
    response.headers["X-Request-ID"] = get_request_id()
    return result
