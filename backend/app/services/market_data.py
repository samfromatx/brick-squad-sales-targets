import asyncio

from app.db.queries.market_data import batch_market_data as db_batch
from app.models.api import CardMarketDataResult, MarketDataBatchRequest, MarketDataBatchResponse


async def get_batch_market_data(request: MarketDataBatchRequest) -> MarketDataBatchResponse:
    cards = [{"id": c.id, "card": c.card, "grade": c.grade} for c in request.cards]
    loop = asyncio.get_running_loop()
    raw_results = await loop.run_in_executor(None, db_batch, cards)
    results = [
        CardMarketDataResult(
            id=r["id"],
            matched_card=r["matched_card"],
            match_confidence=r["match_confidence"],
            avg_7d=r["avg_7d"],
            avg_30d=r["avg_30d"],
            trend_7d_pct=r["trend_7d_pct"],
            trend_30d_pct=r["trend_30d_pct"],
            num_sales_30d=r["num_sales_30d"],
        )
        for r in raw_results
    ]
    return MarketDataBatchResponse(results=results)
